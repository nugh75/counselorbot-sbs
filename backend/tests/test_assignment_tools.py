"""Activity tools (#174): personal tools an assignment asks the student to open.

Synthetic PostgreSQL only. Tools must be personal tools enabled for the class
when the assignment is sent; a tool the class disables later stays listed but
unavailable. Templates carry the tools to the assignment created at publication.
"""

import os
import uuid
from importlib import import_module

from sqlalchemy import create_engine, event, text

from backend import models
# Shared synthetic class, goal and teacher.
from backend.tests.test_path_templates import api, apply, as_user  # noqa: F401

migration = import_module("backend.migrations.20261010_assignment_tools")


def send(client, data, tools, request_id="request-174-tools"):
    return client.post("/teacher/assignments", json=dict(source_id=data["goal"].id, group_id=data["group"].id,
                                                          tool_keys=tools, request_id=request_id))


def test_assignment_lists_tools_and_marks_those_disabled_later(api):  # noqa: F811
    client, db, identity, data = api
    created = send(client, data, ["tavolo", "timeline", "tavolo"])
    assert created.status_code == 201, created.text
    assert created.json()["tools"] == [{"key": "tavolo", "available": True}, {"key": "timeline", "available": True}]
    # Retrying the same request returns the same assignment.
    assert send(client, data, ["tavolo", "timeline", "tavolo"]).json()["id"] == created.json()["id"]
    db.add(models.ClassSettings(group_id=data["group"].id, disabled_tool_keys=["timeline"], updated_by="teacher"))
    db.commit()
    as_user(identity, "alice")
    received = client.get("/user/assignments").json()
    assert received[0]["tools"] == [{"key": "tavolo", "available": True}, {"key": "timeline", "available": False}]


def test_only_enabled_personal_tools_can_be_chosen(api):  # noqa: F811
    client, db, _identity, data = api
    for tools in (["forum"], ["QSA"], ["notebook"]):
        assert send(client, data, tools, request_id=f"request-174-{tools[0]}").status_code == 422
    db.add(models.ClassSettings(group_id=data["group"].id, disabled_tool_keys=["portfolio"], updated_by="teacher"))
    db.commit()
    refused = send(client, data, ["portfolio"], request_id="request-174-disabled")
    assert refused.status_code == 422 and refused.json()["detail"] == "assignment_tool_unavailable"
    # Older clients send no tools: nothing changes for them.
    plain = send(client, data, [], request_id="request-174-plain")
    assert plain.status_code == 201 and plain.json()["tools"] == []
    assert db.get(models.TeacherAssignment, plain.json()["id"]).tool_keys is None


def test_template_activity_tools_reach_the_published_assignment(api):  # noqa: F811
    client, db, _identity, data = api
    template = client.post("/teacher/path-templates", json={"title": "Plan", "steps": [
        {"step_type": "assignment", "goal_id": data["goal"].id, "tool_keys": ["goals", "tavolo"]}]})
    assert template.status_code == 201, template.text
    assert template.json()["steps"][0]["tool_keys"] == ["goals", "tavolo"]
    path = apply(client, template.json(), data["group"]).json()[0]
    db.add(models.ClassSettings(group_id=data["group"].id, disabled_tool_keys=["goals"], updated_by="teacher"))
    db.commit()
    blocked = client.post(f"/teacher/paths/{path['id']}/publish")
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["problems"][0]["reason"] == "assignment_tool_unavailable"
    db.query(models.ClassSettings).filter_by(group_id=data["group"].id).update({"disabled_tool_keys": []})
    db.commit()
    published = client.post(f"/teacher/paths/{path['id']}/publish")
    assert published.status_code == 200, published.text
    assignment = db.get(models.TeacherAssignment, published.json()["steps"][0]["assignment_id"])
    assert assignment.tool_keys == ["goals", "tavolo"]
    saved = client.post(f"/teacher/paths/{path['id']}/save-as-template").json()
    assert saved["steps"][0]["tool_keys"] == ["goals", "tavolo"]


def test_migration_keeps_older_assignments_without_tools():
    # Never run against an operational database.
    assert os.environ["DATABASE_URL"].rsplit("/", 1)[-1].endswith("_test")
    engine = create_engine(os.environ["DATABASE_URL"])
    schema = "tools174_" + uuid.uuid4().hex

    @event.listens_for(engine, "connect")
    def scope(connection, _):
        connection.autocommit = True
        with connection.cursor() as cursor:
            cursor.execute(f'SET search_path TO "{schema}"')
        connection.autocommit = False

    try:
        with engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            models.Base.metadata.create_all(connection)
            connection.execute(text("ALTER TABLE teacher_assignments DROP COLUMN tool_keys"))
            connection.execute(text(
                "INSERT INTO teacher_assignments (id,author_username,author_name,group_id,group_name,source_kind,"
                "source_id,snapshot,instructions,request_id,request_hash) "
                "VALUES (1,'teacher','Teacher',1,'Class','goal',1,'{}','','request-174-old','hash')"))
        for _ in range(2):
            migration.migrate(engine)
        with engine.begin() as connection:
            assert connection.execute(text("SELECT tool_keys FROM teacher_assignments")).all() == [(None,)]
    finally:
        with engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        engine.dispose()
