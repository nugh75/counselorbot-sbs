"""Concurrent builder saves and forum moderation in synthetic PostgreSQL (#154)."""

import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Event

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker

from backend import auth, database, models, path_step_types
from backend.routes import class_paths
from backend.routes.forum import router as forum_router


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
        group = models.StudentGroup(code="SYN-154C", name="Synthetic", owner_username="teacher")
        db.add(group)
        db.flush()
        db.add(models.GroupMembership(group_id=group.id, username="student"))
        db.commit()
        group_id = group.id

    def request_db():
        with factory() as db:
            yield db

    def make_app(identity):
        # One app per actor: requests run on the client's portal thread.
        app = FastAPI()
        app.include_router(class_paths.router)
        app.include_router(forum_router)
        app.dependency_overrides[database.get_db] = request_db
        app.dependency_overrides[auth.get_identity] = lambda: dict(identity)
        return app

    return engine, factory, make_app, group_id


TEACHER = {"username": "teacher", "name": "Teacher", "groups": ["docenti"], "authenticated": True, "is_admin": False}
STUDENT = {"username": "student", "name": "Student", "groups": [], "authenticated": True, "is_admin": False}


def drop(engine, schema):
    with engine.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    engine.dispose()


def test_hiding_waits_for_a_concurrent_path_save(monkeypatch):
    assert os.environ["DATABASE_URL"] == "postgresql://c5_test@127.0.0.1:18650/counselorbot_test"
    schema = "tf154r_" + uuid.uuid4().hex
    engine, factory, make_app, group_id = committed_app(schema)
    app, student_app = make_app(TEACHER), make_app(STUDENT)
    try:
        with TestClient(app) as client:
            topic = client.post(f"/groups/{group_id}/forum/topics", json={"title": "Race", "body": "Race"}).json()
            path = client.post(f"/teacher/groups/{group_id}/paths", json={"title": "Race"}).json()
        locked = Event()
        composition = path_step_types.validate_composition

        def slow_composition(*args):
            # The discussion row is locked by validate_step_input at this point.
            locked.set()
            time.sleep(0.6)
            return composition(*args)

        monkeypatch.setattr(class_paths, "validate_composition", slow_composition)

        def save():
            with TestClient(app) as client:
                return client.put(f"/teacher/paths/{path['id']}", json={
                    "revision": path["revision"], "title": "Race",
                    "steps": [{"step_type": "forum", "topic_id": topic["id"]}]})

        def hide():
            assert locked.wait(timeout=10)
            started = time.monotonic()
            with TestClient(app) as client:
                response = client.post(f"/teacher/forum/topics/{topic['id']}/hide", json={"reason": "Race"})
            return response, time.monotonic() - started

        with ThreadPoolExecutor(max_workers=2) as executor:
            saved = executor.submit(save)
            hidden = executor.submit(hide)
            saved, (hidden, waited) = saved.result(), hidden.result()
        assert saved.status_code == 200, saved.text
        assert hidden.status_code == 200 and waited >= 0.3
        with TestClient(app) as client:
            step = client.get(f"/teacher/paths/{path['id']}").json()["steps"][0]
        # The hide lands after the save: the step stays, unavailable.
        assert step["topic_id"] == topic["id"]
        assert step["availability_reason"] == "forum_topic_unavailable"
    finally:
        drop(engine, schema)


def test_concurrent_replies_and_approval_settle_on_one_completion():
    assert os.environ["DATABASE_URL"] == "postgresql://c5_test@127.0.0.1:18650/counselorbot_test"
    schema = "tf154a_" + uuid.uuid4().hex
    engine, factory, make_app, group_id = committed_app(schema)
    app, student_app = make_app(TEACHER), make_app(STUDENT)
    try:
        with factory() as db:
            db.add(models.ClassSettings(group_id=group_id, updated_by="teacher", forum_premoderation=True))
            db.commit()
        with TestClient(app) as client:
            topic = client.post(f"/groups/{group_id}/forum/topics", json={"title": "Busy", "body": "Busy"}).json()
            path = client.post(f"/teacher/groups/{group_id}/paths", json={"title": "Busy"}).json()
            path = client.put(f"/teacher/paths/{path['id']}", json={
                "revision": path["revision"], "title": "Busy",
                "steps": [{"step_type": "forum", "topic_id": topic["id"]}]}).json()
            assert client.post(f"/teacher/paths/{path['id']}/publish").status_code == 200

        def post(index):
            with TestClient(student_app) as client:
                return client.post(f"/forum/topics/{topic['id']}/posts", json={"body": f"Reply {index}"})

        with ThreadPoolExecutor(max_workers=4) as executor:
            replies = list(executor.map(post, range(4)))
        assert [row.status_code for row in replies] == [201] * 4
        assert {row.json()["status"] for row in replies} == {"pending"}
        with TestClient(student_app) as client:
            assert client.get("/user/paths").json()[0]["steps"][0]["state"] == "not_done"

        def approve(row):
            with TestClient(app) as client:
                return client.post(f"/teacher/forum/posts/{row.json()['id']}/approve")

        with ThreadPoolExecutor(max_workers=4) as executor:
            approvals = list(executor.map(approve, replies))
        assert [row.status_code for row in approvals] == [200] * 4
        with TestClient(student_app) as client:
            step = client.get("/user/paths").json()[0]["steps"][0]
        assert step["state"] == "done" and step["completion_kind"] == "forum_reply"
        with factory() as db:
            first = min(row.created_at for row in db.query(models.ForumPost).all())
        assert step["completion_at"].startswith(first.isoformat()[:19])
    finally:
        drop(engine, schema)
