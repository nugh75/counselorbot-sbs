"""Class and group meetings (#175) and the `meeting` path step.

Synthetic PostgreSQL only. The teacher plans, edits and cancels meetings of a
class or group; students of that class see them and mark their own attendance,
which completes the meeting step. Non-members get one 403 for every meeting.
"""

import os
import uuid
from datetime import datetime, timedelta, timezone
from importlib import import_module

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import IntegrityError

from backend import auth, database, models
from backend.routes import class_meetings, class_paths
from backend.tests.artifact_database import artifact_session

TEACHER = dict(username="teacher", name="Teacher One", authenticated=True, is_admin=False, groups=["docenti"])
templates_migration = import_module("backend.migrations.20261010_path_templates")
migration = import_module("backend.migrations.20261010_class_meetings")


def who(name):
    return dict(username=name, name=name, authenticated=True, is_admin=False, groups=[])


def when(**delta):
    return (datetime.now(timezone.utc) + timedelta(**delta)).isoformat()


@pytest.fixture
def api():
    with artifact_session() as db:
        group = models.StudentGroup(name="Synthetic 5C", code="SYN-175-5C", owner_username="teacher")
        other = models.StudentGroup(name="Other class", code="SYN-175-OT", owner_username="colleague")
        db.add_all([group, other])
        db.flush()
        db.add_all([models.GroupMembership(group_id=group.id, username="alice"),
                    models.GroupMembership(group_id=other.id, username="bob")])
        db.commit()
        identity = dict(TEACHER)
        app = FastAPI()
        app.include_router(class_paths.router)
        app.include_router(class_meetings.router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_identity] = lambda: dict(identity)
        with TestClient(app) as client:
            yield client, db, identity, group, other


def as_user(identity, user):
    identity.clear()
    identity.update(user)


def plan(client, group, **extra):
    body = {"title": "Debriefing", "starts_at": when(days=2), "duration_minutes": 60, "mode": "in_person",
            "place": "Aula 3", **extra}
    return client.post(f"/teacher/groups/{group.id}/meetings", json=body)


def path_with(client, group, meeting_id):
    path = client.post(f"/teacher/groups/{group.id}/paths", json={"title": "Debrief"}).json()
    return client.put(f"/teacher/paths/{path['id']}", json={"revision": path["revision"], "title": "Debrief",
                      "mode": "recommended", "steps": [{"step_type": "meeting", "meeting_id": meeting_id}]})


def test_teacher_plans_meetings_with_place_or_link(api):
    client, _db, identity, group, other = api
    created = plan(client, group, link="https://example.invalid/ignored")
    assert created.status_code == 201, created.text
    row = created.json()
    assert row["mode"] == "in_person" and row["place"] == "Aula 3" and row["link"] is None
    assert row["organizer_username"] == row["manager_username"] == "teacher" and row["attendance_count"] == 0
    assert plan(client, group, place=None).status_code == 422
    assert plan(client, group, mode="online", place=None).status_code == 422
    assert plan(client, group, mode="online", link="javascript:alert(1)").status_code == 422
    online = plan(client, group, mode="online", place="ignored", link="https://meet.example.invalid/5c")
    assert online.status_code == 201 and online.json()["place"] is None
    assert plan(client, group, starts_at="2026-10-10T10:00:00").status_code == 422
    # Another teacher's class: no listing, no creation, and edits look like a missing meeting.
    assert client.get(f"/teacher/groups/{other.id}/meetings").status_code == 404
    assert plan(client, other).status_code == 404
    as_user(identity, dict(TEACHER, username="colleague"))
    assert client.put(f"/teacher/meetings/{row['id']}", json={**row, "revision": 1}).status_code in (404, 422)
    assert client.post(f"/teacher/meetings/{row['id']}/cancel", json={"revision": 1}).status_code == 404


def test_meeting_step_completes_when_the_student_marks_attendance(api):
    client, db, identity, group, _other = api
    meeting = plan(client, group).json()
    saved = path_with(client, group, meeting["id"])
    assert saved.status_code == 200, saved.text
    path_id = saved.json()["id"]
    assert client.post(f"/teacher/paths/{path_id}/publish").status_code == 200
    as_user(identity, who("alice"))
    step = client.get("/user/paths").json()[0]["steps"][0]
    assert step["step_type"] == "meeting" and step["target_summary"]["place"] == "Aula 3"
    assert step["state"] == "not_done" and step["can_self_mark"] is False
    listed = client.get("/user/meetings").json()
    assert [(m["title"], m["group_name"], m["can_mark"]) for m in listed] == [("Debriefing", "Synthetic 5C", False)]
    # Before it starts there is nothing to attend.
    refused = client.post(f"/user/meetings/{meeting['id']}/attendance")
    assert refused.status_code == 409 and refused.json()["detail"] == "meeting_not_started"
    # The teacher moves it after publication: the step follows the new date.
    as_user(identity, TEACHER)
    moved = client.put(f"/teacher/meetings/{meeting['id']}", json={
        "revision": meeting["revision"], "title": "Debriefing", "starts_at": when(hours=-1), "mode": "online",
        "link": "https://meet.example.invalid/5c"})
    assert moved.status_code == 200 and moved.json()["revision"] == 2
    as_user(identity, who("alice"))
    assert client.get("/user/paths").json()[0]["steps"][0]["target_summary"]["link"] == "https://meet.example.invalid/5c"
    assert client.post(f"/user/meetings/{meeting['id']}/attendance").status_code == 200
    assert client.post(f"/user/meetings/{meeting['id']}/attendance").status_code == 200
    done = client.get("/user/paths").json()[0]
    assert done["done"] == 1 and done["steps"][0]["source"] == "automatic"
    as_user(identity, TEACHER)
    progress = client.get(f"/teacher/paths/{path_id}/progress").json()
    assert progress["steps"][0]["done_count"] == 1
    assert client.get(f"/teacher/groups/{group.id}/meetings").json()[0]["attendance_count"] == 1
    as_user(identity, who("alice"))
    assert client.delete(f"/user/meetings/{meeting['id']}/attendance").json() == {"attended": False}
    assert client.get("/user/paths").json()[0]["done"] == 0
    assert db.query(models.ClassMeetingAttendance).count() == 0


def test_cancellation_after_publication_and_non_members(api):
    client, _db, identity, group, other = api
    meeting = plan(client, group, starts_at=when(hours=-2)).json()
    path_id = path_with(client, group, meeting["id"]).json()["id"]
    assert client.post(f"/teacher/paths/{path_id}/publish").status_code == 200
    cancelled = client.post(f"/teacher/meetings/{meeting['id']}/cancel", json={"revision": meeting["revision"]})
    assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"
    assert client.put(f"/teacher/meetings/{meeting['id']}", json={
        "revision": cancelled.json()["revision"], "title": "x", "starts_at": when(days=1), "mode": "in_person",
        "place": "Aula"}).status_code == 409
    # A cancelled meeting cannot become a new step, and its step is unavailable.
    assert path_with(client, group, meeting["id"]).status_code == 409
    as_user(identity, who("alice"))
    step = client.get("/user/paths").json()[0]["steps"][0]
    assert step["state"] == "unavailable" and step["availability_reason"] == "meeting_cancelled"
    assert client.post(f"/user/meetings/{meeting['id']}/attendance").json()["detail"] == "meeting_cancelled"
    assert client.get("/user/meetings").json()[0]["status"] == "cancelled"
    # A member of another class and a missing meeting look the same.
    as_user(identity, who("bob"))
    assert client.get("/user/meetings").json() == []
    for meeting_id in (meeting["id"], 999999):
        response = client.post(f"/user/meetings/{meeting_id}/attendance")
        assert response.status_code == 403 and response.json()["detail"] == "meeting_unavailable"
    # Another class's meeting cannot be a step of this class.
    as_user(identity, TEACHER)
    foreign = models.ClassMeeting(group_id=other.id, title="Other", starts_at=datetime.now(timezone.utc), mode="online",
                                  link="https://example.invalid", organizer_username="colleague",
                                  manager_username="colleague", status="scheduled", revision=1)
    _db.add(foreign)
    _db.commit()
    assert path_with(client, group, foreign.id).status_code == 422


@pytest.fixture
def templates_schema():
    """A #172 schema: templates and pending steps, no meetings."""
    assert os.environ["DATABASE_URL"].rsplit("/", 1)[-1].endswith("_test")
    engine = create_engine(os.environ["DATABASE_URL"])
    schema = "meet175_" + uuid.uuid4().hex

    @event.listens_for(engine, "connect")
    def scope(connection, _):
        connection.autocommit = True
        with connection.cursor() as cursor:
            cursor.execute(f'SET search_path TO "{schema}"')
        connection.autocommit = False

    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        models.Base.metadata.create_all(connection)
        connection.execute(text("ALTER TABLE class_path_steps DROP CONSTRAINT class_path_step_target"))
        connection.execute(text("ALTER TABLE class_path_steps DROP COLUMN meeting_id"))
        connection.execute(text("DROP TABLE class_meeting_attendance"))
        connection.execute(text("DROP TABLE class_meetings"))
        connection.execute(text(
            "ALTER TABLE class_path_steps ADD CONSTRAINT class_path_step_target "
            f"CHECK ({templates_migration.TEMPLATES_STEP_TARGET_CHECK})"))
        connection.execute(text(
            "INSERT INTO student_groups (id,code,name,is_active,owner_username,context_visible_to_students) "
            "VALUES (1,'SYN-175','Synthetic',true,'teacher',false)"))
        connection.execute(text(
            "INSERT INTO class_paths (id,group_id,title,mode,status,created_by,revision) "
            "VALUES (1,1,'Existing','recommended','draft','teacher',1)"))
        connection.execute(text(
            "INSERT INTO class_path_steps (id,path_id,position,step_type,tool_key) VALUES (12,1,1,'tool','timeline')"))
    yield engine
    with engine.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    engine.dispose()


def test_migration_keeps_steps_and_accepts_meeting_steps_on_second_run(templates_schema):
    for _ in range(2):
        migration.migrate(templates_schema)
    with templates_schema.begin() as connection:
        assert connection.execute(text("SELECT id, step_type, meeting_id FROM class_path_steps")).all() == [
            (12, "tool", None)]
        connection.execute(text(
            "INSERT INTO class_meetings (id,group_id,title,starts_at,mode,link,organizer_username,manager_username,"
            "status,revision) VALUES (1,1,'Debrief',now(),'online','https://example.invalid','teacher','teacher',"
            "'scheduled',1)"))
        connection.execute(text(
            "INSERT INTO class_path_steps (id,path_id,position,step_type,meeting_id) VALUES (13,1,2,'meeting',1)"))
    for values in ("(14,1,3,'meeting',NULL,NULL)", "(14,1,3,'tool','timeline',1)", "(14,1,3,'meeting','timeline',1)"):
        with pytest.raises(IntegrityError):
            with templates_schema.begin() as connection:
                connection.execute(text(
                    f"INSERT INTO class_path_steps (id,path_id,position,step_type,tool_key,meeting_id) VALUES {values}"))
