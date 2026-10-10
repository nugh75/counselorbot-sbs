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
from backend.routes import class_meetings, class_paths, path_templates
from backend.tests.artifact_database import artifact_session

TEACHER = dict(username="teacher", name="Teacher One", authenticated=True, is_admin=False, groups=["docenti"])
templates_migration = import_module("backend.migrations.20261010_path_templates")
migration = import_module("backend.migrations.20261010_class_meetings")
individual_migration = import_module("backend.migrations.20261010_individual_meetings")
guided_migration = import_module("backend.migrations.20261010_guided_chat_steps")


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
        app.include_router(path_templates.router)
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
        connection.execute(text("DROP TABLE class_meeting_bookings"))
        connection.execute(text("DROP TABLE class_meeting_slots"))
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


def individual(client, group, **extra):
    body = {"title": "Colloquio", "kind": "individual", "mode": "in_person", "place": "Studio 2", **extra}
    return client.post(f"/teacher/groups/{group.id}/meetings", json=body)


def add_slot(client, meeting_id, **delta):
    return client.post(f"/teacher/meetings/{meeting_id}/slots", json={"starts_at": when(**delta), "duration_minutes": 15})


def test_individual_meeting_hosts_referents_and_experts(api):
    client, db, _identity, group, _other = api
    school = models.Institution(slug="syn-176", name="Synthetic institute", kind="school", institution_code="SYN-176",
                                hashed_password=models.get_password_hash("Invented-176"))
    db.add(school)
    db.flush()
    group.institution_id = school.id
    desk = models.OrientationReferral(slug="syn-desk-176", institution_id=school.id, role_label_i18n={"it": "Sportello orientamento"},
                                      person_name=None, status="certified", is_active=True)
    elsewhere = models.OrientationReferral(slug="syn-other-176", institution_id=school.id + 1000, role_label_i18n={"it": "Altro"},
                                           status="certified", is_active=True)
    db.add_all([desk, elsewhere])
    db.commit()
    referents = client.get(f"/teacher/groups/{group.id}/meeting-referents").json()
    assert [row["role"] for row in referents] == ["Sportello orientamento"]
    with_desk = individual(client, group, host_kind="referent", referral_id=desk.id)
    assert with_desk.status_code == 201, with_desk.text
    assert with_desk.json()["host_role"] == "Sportello orientamento" and with_desk.json()["starts_at"] is None
    assert individual(client, group, host_kind="referent", referral_id=elsewhere.id).status_code == 422
    assert individual(client, group, host_kind="referent").status_code == 422
    expert = individual(client, group, host_kind="expert", host_name="Dott.ssa Rossi", host_role="Psicologa")
    assert expert.status_code == 201 and expert.json()["host_name"] == "Dott.ssa Rossi"
    assert individual(client, group, host_kind="expert").status_code == 422
    # A group meeting still needs its date; the kind cannot change afterwards.
    assert plan(client, group, starts_at=None).status_code == 422
    row = expert.json()
    assert client.put(f"/teacher/meetings/{row['id']}", json={**{k: row[k] for k in (
        "title", "mode", "place", "host_kind", "host_name", "host_role")}, "kind": "group", "starts_at": when(days=1),
        "revision": row["revision"]}).status_code == 409


def test_students_book_change_and_lose_slots_moved_or_cancelled_by_the_teacher(api):
    client, db, identity, group, _other = api
    db.add(models.GroupMembership(group_id=group.id, username="carla"))
    db.commit()
    meeting = individual(client, group).json()
    for delta in (1, 2, 3):
        add_slot(client, meeting["id"], days=delta)
    slots = client.get(f"/teacher/groups/{group.id}/meetings").json()[0]["slots"]
    assert len(slots) == 3 and all(slot["booking"] is None for slot in slots)
    as_user(identity, who("alice"))
    assert client.post(f"/user/meetings/{meeting['id']}/booking", json={"slot_id": slots[0]["id"]}).status_code == 200
    # Changing keeps one booking per student.
    assert client.post(f"/user/meetings/{meeting['id']}/booking", json={"slot_id": slots[1]["id"]}).json() == {"slot_id": slots[1]["id"]}
    mine = client.get("/user/meetings").json()[0]
    assert mine["booking_slot_id"] == slots[1]["id"] and [slot["mine"] for slot in mine["slots"]] == [False, True, False]
    assert client.post(f"/user/meetings/{meeting['id']}/attendance").json()["detail"] == "meeting_not_started"
    as_user(identity, who("carla"))
    taken = client.post(f"/user/meetings/{meeting['id']}/booking", json={"slot_id": slots[1]["id"]})
    assert taken.status_code == 409 and taken.json()["detail"] == "slot_taken"
    # Others' bookings stay private: carla sees only free slots.
    assert [slot["id"] for slot in client.get("/user/meetings").json()[0]["slots"]] == [slots[0]["id"], slots[2]["id"]]
    assert client.post(f"/user/meetings/{meeting['id']}/attendance").json()["detail"] == "meeting_not_booked"
    # The teacher moves alice to slot 3, then cancels slot 3: alice sees it and books again.
    as_user(identity, TEACHER)
    booking = client.get(f"/teacher/groups/{group.id}/meetings").json()[0]["slots"][1]["booking"]
    assert booking["username"] == "alice"
    moved = client.post(f"/teacher/bookings/{booking['id']}/move", json={"slot_id": slots[2]["id"]})
    assert moved.status_code == 200 and moved.json()["slots"][2]["booking"]["username"] == "alice"
    cancelled = client.post(f"/teacher/slots/{slots[2]['id']}/cancel", json={"revision": slots[2]["revision"]})
    assert cancelled.json()["slots"][2]["status"] == "cancelled" and cancelled.json()["slots"][2]["booking"] is None
    as_user(identity, who("alice"))
    again = client.get("/user/meetings").json()[0]
    assert again["booking_cancelled"] is True and again["booking_slot_id"] is None
    assert client.post(f"/user/meetings/{meeting['id']}/booking", json={"slot_id": slots[2]["id"]}).status_code == 409
    assert client.delete(f"/user/meetings/{meeting['id']}/booking").json() == {"slot_id": None}


def test_attendance_after_the_booked_slot_completes_the_step(api):
    client, db, identity, group, _other = api
    meeting = individual(client, group, mode="online", place=None, link="https://meet.example.invalid/1").json()
    slot = add_slot(client, meeting["id"], hours=2).json()["slots"][0]
    path_id = path_with(client, group, meeting["id"]).json()["id"]
    assert client.post(f"/teacher/paths/{path_id}/publish").status_code == 200
    as_user(identity, who("alice"))
    assert client.post(f"/user/meetings/{meeting['id']}/booking", json={"slot_id": slot["id"]}).status_code == 200
    # The teacher moves the slot earlier: it has started, so attendance is possible.
    as_user(identity, TEACHER)
    assert client.put(f"/teacher/slots/{slot['id']}", json={"starts_at": when(minutes=-5), "duration_minutes": 15,
                                                            "revision": slot["revision"]}).status_code == 200
    as_user(identity, who("alice"))
    assert client.get("/user/meetings").json()[0]["can_mark"] is True
    assert client.post(f"/user/meetings/{meeting['id']}/attendance").status_code == 200
    assert client.get("/user/paths").json()[0]["done"] == 1
    # Past slots cannot be booked.
    as_user(identity, TEACHER)
    past = add_slot(client, meeting["id"], hours=-3).json()["slots"][0]
    as_user(identity, who("bob"))
    assert client.post(f"/user/meetings/{meeting['id']}/booking", json={"slot_id": past["id"]}).status_code == 403


@pytest.fixture
def committed_slot():
    """Committed rows in a disposable schema, for two concurrent sessions."""
    assert os.environ["DATABASE_URL"].rsplit("/", 1)[-1].endswith("_test")
    engine = create_engine(os.environ["DATABASE_URL"], pool_size=4)
    schema = "book176_" + uuid.uuid4().hex

    @event.listens_for(engine, "connect")
    def scope(connection, _):
        connection.autocommit = True
        with connection.cursor() as cursor:
            cursor.execute(f'SET search_path TO "{schema}"')
        connection.autocommit = False

    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        models.Base.metadata.create_all(connection)
        connection.execute(text(
            "INSERT INTO student_groups (id,code,name,is_active,owner_username,context_visible_to_students) "
            "VALUES (1,'SYN-176','Synthetic',true,'teacher',false)"))
        connection.execute(text(
            "INSERT INTO class_meetings (id,group_id,title,kind,host_kind,mode,place,organizer_username,manager_username,"
            "status,revision) VALUES (1,1,'Colloquio','individual','teacher','in_person','Studio','teacher','teacher',"
            "'scheduled',1)"))
        connection.execute(text(
            "INSERT INTO class_meeting_slots (id,meeting_id,starts_at,status,revision) "
            "VALUES (1,1,now() + interval '1 day','open',1)"))
    yield engine
    with engine.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    engine.dispose()


def test_concurrent_bookings_of_one_slot_have_a_single_winner(committed_slot):
    import threading
    from fastapi import HTTPException
    from sqlalchemy.orm import sessionmaker
    from backend.class_meetings import book_slot

    Session = sessionmaker(bind=committed_slot)
    barrier = threading.Barrier(2)
    results = {}

    def attempt(username):
        session = Session()
        try:
            meeting = session.get(models.ClassMeeting, 1)
            barrier.wait()
            book_slot(session, meeting, 1, username)
            session.commit()
            results[username] = "booked"
        except HTTPException as error:
            session.rollback()
            results[username] = error.detail
        finally:
            session.close()

    threads = [threading.Thread(target=attempt, args=(name,)) for name in ("alice", "carla")]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    assert sorted(results.values()) == ["booked", "slot_taken"], results
    with committed_slot.begin() as connection:
        assert connection.execute(text(
            "SELECT count(*) FROM class_meeting_bookings WHERE status = 'active'")).scalar() == 1


def test_individual_upgrade_keeps_group_meetings_on_second_run(templates_schema):
    migration.migrate(templates_schema)
    with templates_schema.begin() as connection:
        # A #175 schema: group meetings only, a date always required.
        for name in ("class_meeting_kind", "class_meeting_host_kind", "class_meeting_group_date", "class_meeting_expert_name"):
            connection.execute(text(f"ALTER TABLE class_meetings DROP CONSTRAINT {name}"))
        for column in ("kind", "host_kind", "referral_id", "host_name", "host_role"):
            connection.execute(text(f"ALTER TABLE class_meetings DROP COLUMN {column}"))
        connection.execute(text(
            "INSERT INTO class_meetings (id,group_id,title,starts_at,mode,place,organizer_username,manager_username,"
            "status,revision) VALUES (1,1,'Debrief',now(),'in_person','Aula','teacher','teacher','scheduled',1)"))
        connection.execute(text("ALTER TABLE class_meetings ALTER COLUMN starts_at SET NOT NULL"))
    for _ in range(2):
        individual_migration.migrate(templates_schema)
    with templates_schema.begin() as connection:
        assert connection.execute(text("SELECT kind, host_kind FROM class_meetings")).all() == [("group", "teacher")]
        connection.execute(text(
            "INSERT INTO class_meetings (id,group_id,title,kind,host_kind,host_name,mode,link,organizer_username,"
            "manager_username,status,revision) VALUES (2,1,'Colloquio','individual','expert','Rossi','online',"
            "'https://example.invalid','teacher','teacher','scheduled',1)"))
        connection.execute(text(
            "INSERT INTO class_meeting_slots (id,meeting_id,starts_at,status,revision) VALUES (1,2,now(),'open',1)"))
        connection.execute(text(
            "INSERT INTO class_meeting_bookings (meeting_id,slot_id,username,status) VALUES (2,1,'alice','active')"))
    for statement in (
        "INSERT INTO class_meetings (group_id,title,kind,host_kind,mode,place,organizer_username,manager_username,status,"
        "revision) VALUES (1,'No date','group','teacher','in_person','Aula','t','t','scheduled',1)",
        "INSERT INTO class_meetings (group_id,title,kind,host_kind,mode,place,organizer_username,manager_username,status,"
        "revision) VALUES (1,'No expert','individual','expert','in_person','Aula','t','t','scheduled',1)",
        "INSERT INTO class_meeting_bookings (meeting_id,slot_id,username,status) VALUES (2,1,'carla','active')",
    ):
        with pytest.raises(IntegrityError):
            with templates_schema.begin() as connection:
                connection.execute(text(statement))


def test_guided_chat_step_with_a_follow_up_meeting(api):
    client, db, identity, group, _other = api
    meeting = plan(client, group, starts_at=when(hours=-1)).json()
    path = client.post(f"/teacher/groups/{group.id}/paths", json={"title": "Racconto"}).json()
    body = lambda steps, revision: {"revision": revision, "title": "Racconto", "mode": "recommended", "steps": steps}
    # A questionnaire or a personal tool is not a guided chat.
    for key in ("QSA", "tavolo"):
        refused = client.put(f"/teacher/paths/{path['id']}", json=body([{"step_type": "guided_chat", "tool_key": key}], path["revision"]))
        assert refused.status_code == 422, key
    # The follow-up must come after a guided chat of the same save.
    assert client.put(f"/teacher/paths/{path['id']}", json=body([
        {"step_type": "meeting", "meeting_id": meeting["id"], "follows": 0}], path["revision"])).status_code == 422
    saved = client.put(f"/teacher/paths/{path['id']}", json=body([
        {"step_type": "guided_chat", "tool_key": "SAVICKAS"},
        {"step_type": "meeting", "meeting_id": meeting["id"], "follows": 0}], path["revision"]))
    assert saved.status_code == 200, saved.text
    chat, follow = saved.json()["steps"]
    assert chat["step_type"] == "guided_chat" and chat["auto_detect"] is True
    assert follow["follows_step_id"] == chat["id"]
    # Saving as a template refuses meetings for now.
    refused = client.post(f"/teacher/paths/{path['id']}/save-as-template")
    assert refused.status_code == 409 and refused.json()["detail"]["code"] == "template_meeting_unavailable"
    assert client.post(f"/teacher/paths/{path['id']}/publish").status_code == 200
    # The student sees chat then follow-up; the chat completes on its guided chat marker.
    as_user(identity, who("alice"))
    steps = client.get("/user/paths").json()[0]["steps"]
    assert [s["step_type"] for s in steps] == ["guided_chat", "meeting"] and steps[1]["follows_step_id"] == steps[0]["id"]
    assert steps[0]["start_href"] == "/?start=SAVICKAS"
    db.add(models.Log(session_id="synthetic-177", action="guided_chat_completed", username="alice",
                      questionnaire_type="SAVICKAS", timestamp=datetime.now(timezone.utc) + timedelta(seconds=1)))
    db.commit()
    assert client.get("/user/paths").json()[0]["steps"][0]["state"] == "done"
    # The teacher sees who completed the chat in progress, next to the follow-up.
    as_user(identity, TEACHER)
    progress = client.get(f"/teacher/paths/{path['id']}/progress").json()
    assert [s["done_count"] for s in progress["steps"]] == [1, 0]
    assert progress["steps"][1]["follows_step_id"] == progress["steps"][0]["id"]
    # Removing the chat keeps the meeting as an ordinary step.
    current = client.get(f"/teacher/paths/{path['id']}").json()
    kept = client.put(f"/teacher/paths/{path['id']}", json=body([
        {"id": current["steps"][1]["id"], "step_type": "meeting", "meeting_id": meeting["id"]}], current["revision"]))
    assert kept.status_code == 200 and kept.json()["steps"][0]["follows_step_id"] is None


def test_guided_chat_upgrade_accepts_chats_and_follow_ups_on_second_run(templates_schema):
    migration.migrate(templates_schema)
    with templates_schema.begin() as connection:
        # A #176 schema: no guided_chat type, no follow-up column.
        connection.execute(text("ALTER TABLE class_path_steps DROP CONSTRAINT class_path_step_follows"))
        connection.execute(text("ALTER TABLE class_path_steps DROP COLUMN follows_step_id"))
    for _ in range(2):
        guided_migration.migrate(templates_schema)
    with templates_schema.begin() as connection:
        assert connection.execute(text("SELECT id, step_type FROM class_path_steps")).all() == [(12, "tool")]
        connection.execute(text(
            "INSERT INTO class_meetings (id,group_id,title,starts_at,mode,link,organizer_username,manager_username,"
            "status,revision) VALUES (1,1,'Debrief',now(),'online','https://example.invalid','teacher','teacher',"
            "'scheduled',1)"))
        connection.execute(text(
            "INSERT INTO class_path_steps (id,path_id,position,step_type,tool_key) VALUES (13,1,2,'guided_chat','SAVICKAS')"))
        connection.execute(text(
            "INSERT INTO class_path_steps (id,path_id,position,step_type,meeting_id,follows_step_id) "
            "VALUES (14,1,3,'meeting',1,13)"))
    for statement in (
        "INSERT INTO class_path_steps (id,path_id,position,step_type) VALUES (15,1,4,'guided_chat')",
        "INSERT INTO class_path_steps (id,path_id,position,step_type,tool_key,follows_step_id) VALUES (15,1,4,'tool','timeline',13)",
    ):
        with pytest.raises(IntegrityError):
            with templates_schema.begin() as connection:
                connection.execute(text(statement))
