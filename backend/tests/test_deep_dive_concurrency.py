"""Concurrent deep-dive starts bind one session in synthetic PostgreSQL (#152)."""

import os
import time
import uuid
from threading import Barrier
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker
from backend import auth, database, models, results_deep_dive
from backend.routes import class_paths, administration_plans


def test_concurrent_starts_return_one_bound_session(monkeypatch):
    assert (
        os.environ["DATABASE_URL"]
        == "postgresql://c5_test@127.0.0.1:18650/counselorbot_test"
    )
    engine = create_engine(os.environ["DATABASE_URL"])
    schema = "tf152c_" + uuid.uuid4().hex

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
            institute = models.Institution(
                slug="synthetic",
                name="Synthetic",
                kind="school",
                institution_code="SYN-152",
                hashed_password=models.get_password_hash("Invented-152"),
            )
            db.add(institute)
            db.flush()
            group = models.StudentGroup(
                code="SYN-152",
                name="Synthetic",
                owner_username="teacher",
                institution_id=institute.id,
            )
            db.add(group)
            db.flush()
            group_id = group.id
            db.add_all(
                [
                    models.InstitutionTeacher(
                        institution_id=institute.id,
                        username="teacher",
                        created_by="teacher",
                        updated_by="teacher",
                    ),
                    models.GroupMembership(group_id=group.id, username="student"),
                    models.Instrument(
                        code="QSA",
                        name_en="QSA",
                        is_active=True,
                        tool_category="assessment",
                    ),
                    models.Factor(instrument_code="QSA", code="C1"),
                ]
            )
            db.commit()
        identity = {
            "username": "teacher",
            "groups": ["docenti"],
            "authenticated": True,
            "is_admin": False,
        }
        app = FastAPI()
        app.include_router(class_paths.router)
        app.include_router(administration_plans.router)

        def request_db():
            with factory() as db:
                yield db

        app.dependency_overrides[database.get_db] = request_db
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        with TestClient(app) as client:
            plan = client.post(
                f"/teacher/groups/{group_id}/administrations",
                json={"title": "Italian", "instrument_code": "QSA", "locale": "it"},
            ).json()
            path = client.post(
                f"/teacher/groups/{group_id}/paths", json={"title": "Deep dive"}
            ).json()
            administration = {
                "step_type": "questionnaire_administration",
                "administration_plan_id": plan["id"],
            }
            path = client.put(
                f"/teacher/paths/{path['id']}",
                json={"title": "Deep dive", "revision": 1, "steps": [administration]},
            ).json()
            source = path["steps"][0]["id"]
            response = client.put(
                f"/teacher/paths/{path['id']}",
                json={
                    "title": "Deep dive",
                    "revision": path["revision"],
                    "steps": [
                        {**administration, "id": source},
                        {"step_type": "guided_results_chat", "results_step_id": source},
                    ],
                },
            )
            assert response.status_code == 200, response.text
            path = client.post(f"/teacher/paths/{path['id']}/publish").json()
            identity.update(username="student", groups=[])
            grant = client.post(
                f"/user/administrations/{plan['id']}/verify-institution",
                json={"institution_code": "SYN-152", "password": "Invented-152"},
            ).json()["grant"]
            response = client.post(
                f"/user/paths/{path['id']}/steps/{source}/guided-entry",
                json={
                    "session_id": "entry-152",
                    "request_id": "entry-152",
                    "scores": {"C1": 5},
                    "institution_grant": grant,
                },
            )
            assert response.status_code == 200, response.text

            evidence = results_deep_dive.administration_evidence

            def slow_evidence(*args):
                # Both requests read "no binding yet" before either one writes.
                rows = list(evidence(*args))
                time.sleep(0.5)
                return iter(rows)

            monkeypatch.setattr(results_deep_dive, "administration_evidence", slow_evidence)
            ready = Barrier(2)

            def start(_):
                with TestClient(app) as concurrent_client:
                    ready.wait(timeout=10)
                    return concurrent_client.post(
                        f"/user/paths/{path['id']}/steps/{path['steps'][1]['id']}/deep-dive"
                    )

            with ThreadPoolExecutor(max_workers=2) as executor:
                responses = list(executor.map(start, range(2)))
            assert [row.status_code for row in responses] == [200, 200]
            assert responses[0].json() == responses[1].json()
        with factory() as db:
            assert db.query(models.ClassPathDeepDiveSession).count() == 1
    finally:
        with engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        engine.dispose()
