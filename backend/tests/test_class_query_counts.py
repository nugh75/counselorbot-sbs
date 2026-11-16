"""Class list and class students use a constant number of queries (#1001)."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event

from backend import auth, database, models
from backend.routes import groups
from backend.tests.artifact_database import artifact_session


@pytest.fixture
def api():
    with artifact_session() as db:
        identity = {"username": "owner", "name": "Owner", "groups": ["docenti"],
                    "is_admin": False, "is_researcher": False, "authenticated": True}
        app = FastAPI()
        app.include_router(groups.router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        with TestClient(app) as client:
            yield client, db


def _count_queries(db, call, tables=None):
    statements = []

    def record(conn, cursor, statement, *args):
        if tables is None or any(table in statement for table in tables):
            statements.append(statement)

    engine = db.get_bind()
    event.listen(engine, "before_cursor_execute", record)
    try:
        response = call()
    finally:
        event.remove(engine, "before_cursor_execute", record)
    assert response.status_code == 200, response.text
    return len(statements), response.json()


def _add_classes(db, count, start=0):
    for i in range(start, start + count):
        group = models.StudentGroup(code=f"GR-QC{i}", name=f"Class {i}", owner_username="owner")
        db.add(group)
        db.flush()
        db.add_all([
            models.GroupMembership(group_id=group.id, username=f"s{i}-{j}") for j in range(2)
        ])
        db.add(models.GroupShare(group_id=group.id, shared_with_username=f"t{i}", granted_by_username="owner"))
    db.flush()


def test_class_list_constant_queries(api):
    client, db = api
    _add_classes(db, 1)
    few, body = _count_queries(db, lambda: client.get("/admin/groups"))
    assert body[0]["members_count"] == 2 and body[0]["shares_count"] == 1
    _add_classes(db, 19, start=1)
    many, body = _count_queries(db, lambda: client.get("/admin/groups"))
    assert len(body) == 20
    assert all(g["members_count"] == 2 and g["shares_count"] == 1 for g in body)
    assert many == few


def test_class_students_constant_queries(api):
    client, db = api
    group = models.StudentGroup(code="GR-QS", name="Class", owner_username="owner")
    db.add(group)
    db.flush()

    def add_students(start, count):
        for i in range(start, start + count):
            name = f"stu{i:02d}"
            db.add(models.GroupMembership(group_id=group.id, username=name))
            db.add(models.TelegramAccountLink(username=name, telegram_user_id=1000 + i, telegram_chat_id=1000 + i))
            db.add(models.LearnerProfileRevision(username=name, data={"v": 1}))
            db.add(models.LearnerProfileRevision(username=name, data={"v": 2}))
        db.flush()

    add_students(0, 1)
    url = f"/admin/groups/{group.id}/students"
    tables = ("questionnaire_results.username IN", "FROM telegram_account_links", "FROM learner_profile_revisions")
    few, body = _count_queries(db, lambda: client.get(url), tables)
    assert body["students"][0]["telegram_linked"] is True
    add_students(1, 19)
    many, body = _count_queries(db, lambda: client.get(url), tables)
    assert len(body["students"]) == 20
    assert [s["username"] for s in body["students"]] == sorted(s["username"] for s in body["students"])
    assert all(s["telegram_linked"] for s in body["students"])
    # Privacy authorization decisions stay per student; the data loads above are constant.
    assert many == few
