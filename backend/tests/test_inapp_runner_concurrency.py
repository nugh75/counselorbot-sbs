"""Concurrent in-app runner retries keep one result in synthetic PostgreSQL (#151)."""

import os
import time
import uuid
from threading import Barrier
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker
from backend import auth, content_version_service, database, models, scoring_service
from backend.routes import class_paths, administration_plans


def test_concurrent_runner_retries_and_entries_commit_once(monkeypatch):
    assert os.environ["DATABASE_URL"] == "postgresql://c5_test@127.0.0.1:18650/counselorbot_test"
    engine = create_engine(os.environ["DATABASE_URL"])
    schema = "tf151c_" + uuid.uuid4().hex

    @event.listens_for(engine, "connect")
    def scope(connection, _):
        connection.autocommit = True
        with connection.cursor() as cursor:
            cursor.execute(f'SET search_path TO "{schema}"')
        connection.autocommit = False

    factory = sessionmaker(bind=engine, autoflush=False)
    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        models.Base.metadata.create_all(connection)
    try:
        with factory() as db:
            institute = models.Institution(slug="synthetic", name="Synthetic", kind="school",
                                           institution_code="SYN-151",
                                           hashed_password=models.get_password_hash("Invented-151"))
            db.add(institute)
            db.flush()
            group = models.StudentGroup(code="SYN-151", name="Synthetic", owner_username="teacher",
                                        institution_id=institute.id)
            db.add(group)
            db.flush()
            group_id = group.id
            db.add_all([
                models.InstitutionTeacher(institution_id=institute.id, username="teacher",
                                          created_by="teacher", updated_by="teacher"),
                models.GroupMembership(group_id=group.id, username="student"),
                models.Instrument(code="QSA", name_en="QSA", is_active=True, tool_category="assessment"),
                models.Factor(instrument_code="QSA", code="C1"),
                models.QuestionnaireItem(instrument_code="QSA", item_number=1, factor_code="C1"),
            ])
            content_version_service.upsert_version(db, "instrument", "QSA", "en", status="pilot")
            db.commit()
        identity = {"username": "teacher", "groups": ["docenti"], "authenticated": True, "is_admin": False}
        app = FastAPI()
        app.include_router(class_paths.router)
        app.include_router(administration_plans.router)

        def request_db():
            with factory() as db:
                yield db

        app.dependency_overrides[database.get_db] = request_db
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        with TestClient(app) as client:
            plan = client.post(f"/teacher/groups/{group_id}/administrations",
                               json={"title": "English", "instrument_code": "QSA", "locale": "en"}).json()
            path = client.post(f"/teacher/groups/{group_id}/paths", json={"title": "English"}).json()
            response = client.put(f"/teacher/paths/{path['id']}", json={
                "title": "English", "revision": 1,
                "steps": [{"step_type": "questionnaire_administration", "administration_plan_id": plan["id"]}]})
            assert response.status_code == 200, response.text
            path = client.post(f"/teacher/paths/{path['id']}/publish").json()
            base = f"/user/paths/{path['id']}/steps/{path['steps'][0]['id']}"
            identity.update(username="student", groups=[])
            grant = client.post(f"/user/administrations/{plan['id']}/verify-institution",
                                json={"institution_code": "SYN-151", "password": "Invented-151"}).json()["grant"]

            def concurrently(url, body):
                ready = Barrier(2)

                def write(_):
                    # Independent event loops and sessions so PostgreSQL calls overlap.
                    with TestClient(app) as concurrent_client:
                        ready.wait(timeout=10)
                        return concurrent_client.post(url, json=body)

                with ThreadPoolExecutor(max_workers=2) as executor:
                    return list(executor.map(write, range(2)))

            compute = scoring_service.compute_profile

            def slow_compute(*args):
                # Widen the window between the retry lookup and the insert.
                time.sleep(0.5)
                return compute(*args)

            monkeypatch.setattr(scoring_service, "compute_profile", slow_compute)
            scored = concurrently(f"{base}/score", {"session_id": "runner-151", "answers": {"1": 3},
                                                    "institution_grant": grant})
            assert [row.status_code for row in scored] == [200, 200]
            result_id = scored[0].json()["result"]["id"]
            assert scored[1].json()["result"]["id"] == result_id
            entered = concurrently(f"{base}/guided-entry", {"session_id": "runner-151", "request_id": "entry-151",
                                                            "result_id": result_id, "institution_grant": grant})
            assert [row.status_code for row in entered] == [200, 200]
            assert entered[0].json() == entered[1].json()
            assert client.get("/user/paths").json()[0]["done"] == 1
        with factory() as db:
            assert db.query(models.QuestionnaireResult).count() == 1
            assert db.query(models.QuestionnaireGuidedEntry).count() == 1
            assert db.query(models.ClassPathStepEvidence).count() == 1
    finally:
        with engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        engine.dispose()
