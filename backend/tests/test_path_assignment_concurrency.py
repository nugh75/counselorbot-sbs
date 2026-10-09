"""Concurrent builder writes on assignment steps in synthetic PostgreSQL (#153)."""

import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker

from backend import auth, database, models, path_step_types
from backend.routes import class_paths
from backend.routes.assignments import router as assignments_router


def committed_app(schema):
    engine = create_engine(os.environ["DATABASE_URL"])

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
    with factory() as db:
        group = models.StudentGroup(code="SYN-153C", name="Synthetic", owner_username="teacher")
        db.add(group)
        db.flush()
        goal = models.GoalCatalogEntry(author_username="teacher", group_id=group.id, status="published",
                                       data=dict(title="Synthetic goal", language="en"))
        db.add_all([goal, models.GroupMembership(group_id=group.id, username="student")])
        db.commit()
        ids = dict(group=group.id, goal=goal.id)
    app = FastAPI()
    app.include_router(class_paths.router)
    app.include_router(assignments_router)

    def request_db():
        with factory() as db:
            yield db

    app.dependency_overrides[database.get_db] = request_db
    app.dependency_overrides[auth.get_identity] = lambda: {
        "username": "teacher", "name": "Teacher", "groups": ["docenti"], "authenticated": True, "is_admin": False}
    return engine, factory, app, ids


def drop(engine, schema):
    with engine.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    engine.dispose()


def test_concurrent_builder_retries_create_one_assignment():
    assert os.environ["DATABASE_URL"] == "postgresql://c5_test@127.0.0.1:18650/counselorbot_test"
    schema = "tf153c_" + uuid.uuid4().hex
    engine, factory, app, ids = committed_app(schema)
    try:
        payload = {"source_kind": "goal", "source_id": ids["goal"], "group_id": ids["group"],
                   "request_id": "builder-153-retry"}
        ready = Barrier(2)

        def create(_):
            with TestClient(app) as client:
                ready.wait(timeout=10)
                return client.post("/teacher/assignments", json=payload)

        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(create, range(2)))
        assert [row.status_code for row in responses] == [201, 201]
        assert responses[0].json()["id"] == responses[1].json()["id"]
        with factory() as db:
            assert db.query(models.TeacherAssignment).count() == 1
    finally:
        drop(engine, schema)


def test_revocation_waits_for_a_concurrent_path_save(monkeypatch):
    assert os.environ["DATABASE_URL"] == "postgresql://c5_test@127.0.0.1:18650/counselorbot_test"
    schema = "tf153r_" + uuid.uuid4().hex
    engine, factory, app, ids = committed_app(schema)
    try:
        with TestClient(app) as client:
            assignment = client.post("/teacher/assignments", json={
                "source_kind": "goal", "source_id": ids["goal"], "group_id": ids["group"],
                "request_id": "builder-153-race"}).json()
            path = client.post(f"/teacher/groups/{ids['group']}/paths", json={"title": "Race"}).json()
        locked = Event()
        composition = path_step_types.validate_composition

        def slow_composition(*args):
            # The assignment row is locked by validate_step_input at this point.
            locked.set()
            time.sleep(0.6)
            return composition(*args)

        monkeypatch.setattr(class_paths, "validate_composition", slow_composition)

        def save():
            with TestClient(app) as client:
                return client.put(f"/teacher/paths/{path['id']}", json={
                    "revision": path["revision"], "title": "Race",
                    "steps": [{"step_type": "assignment", "assignment_id": assignment["id"]}]})

        def revoke():
            assert locked.wait(timeout=10)
            started = time.monotonic()
            with TestClient(app) as client:
                response = client.delete(f"/teacher/assignments/{assignment['id']}")
            return response, time.monotonic() - started

        with ThreadPoolExecutor(max_workers=2) as executor:
            saved = executor.submit(save)
            revoked = executor.submit(revoke)
            saved, (revoked, waited) = saved.result(), revoked.result()
        assert saved.status_code == 200, saved.text
        assert revoked.status_code == 200 and waited >= 0.3
        with TestClient(app) as client:
            step = client.get(f"/teacher/paths/{path['id']}").json()["steps"][0]
        # The revocation lands after the save: the step stays, unavailable.
        assert step["assignment_id"] == assignment["id"]
        assert step["availability_reason"] == "assignment_revoked"
    finally:
        drop(engine, schema)
