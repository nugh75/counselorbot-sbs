"""Test data stays out of real class data (#835).

Synthetic Postgres via artifact_session. A class with one real student (alice)
plus memberships that already exist for the owner and a view-as demo account:
readers list only alice; the invite link no longer enrols the owner or a demo
account; admin log statistics and exports skip practice and demo turns.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, class_council, class_noticing, database, models
from backend.routes import admin, administration_plans, goals, groups, orientation_recommendation
from backend.tests.artifact_database import artifact_session

TEACHER = dict(username="teacher", name="Teacher", authenticated=True, is_admin=True, groups=["docenti"])
DEMO = "studente.demo"


@pytest.fixture
def api():
    with artifact_session() as db:
        group = models.StudentGroup(name="Synthetic 3B", code="SYN-835-3B", owner_username="teacher")
        db.add(group)
        db.flush()
        plan = models.AdministrationPlan(code="SYN-835-PLAN", title="Plan", instrument_code="QSA", group_id=group.id)
        db.add(plan)
        db.flush()
        for username in ("alice", "teacher", DEMO):
            db.add(models.GroupMembership(group_id=group.id, username=username, joined_via="web"))
            db.add(models.QuestionnaireResult(session_id=f"s-{username}", questionnaire_type="QSA",
                                              username=username, scores={"C1": 5}, administration_plan_id=plan.id))
            db.add(models.PersonalGoal(username=username, title=f"goal {username}", shared_group_id=group.id))
        db.add_all([
            models.Log(session_id="s-real", action="chat_message", username="alice", details={"x": 1}),
            models.Log(session_id="s-practice", action="chat_message", username="teacher",
                       details={"practice_notebook_id": 7}),
            models.Log(session_id="s-demo", action="chat_message", username=DEMO, details={"x": 1}),
        ])
        db.commit()
        identity = dict(TEACHER)
        app = FastAPI()
        for module in (admin, administration_plans, goals, groups, orientation_recommendation):
            app.include_router(module.router)
        app.dependency_overrides[database.get_db] = lambda: db
        for dep in (auth.get_identity, auth.get_current_user, auth.get_current_plan_manager,
                    auth.get_current_active_admin):
            app.dependency_overrides[dep] = lambda: dict(identity)
        with TestClient(app) as client:
            yield client, db, identity, group, plan


def test_owner_opening_own_invite_link_is_not_enrolled(api):
    client, db, identity, group, _ = api
    other = models.StudentGroup(name="Own class", code="SYN-835-OWN", owner_username="teacher")
    db.add(other)
    db.commit()
    assert client.post("/groups/join", json={"code": other.code}).status_code == 403
    assert db.query(models.GroupMembership).filter_by(group_id=other.id).count() == 0


def test_demo_account_opening_invite_link_is_not_enrolled(api):
    client, db, identity, group, _ = api
    other = models.StudentGroup(name="Other", code="SYN-835-OTH", owner_username="colleague")
    db.add(other)
    db.commit()
    identity.update(username=DEMO, is_admin=False, groups=["studenti"])
    assert client.post("/groups/join", json={"code": other.code}).status_code == 403
    assert db.query(models.GroupMembership).filter_by(group_id=other.id).count() == 0


def test_real_student_still_joins(api):
    client, db, identity, group, _ = api
    other = models.StudentGroup(name="Other", code="SYN-835-OK", owner_username="colleague")
    db.add(other)
    db.commit()
    identity.update(username="bob", is_admin=False, groups=["studenti"])
    assert client.post("/groups/join", json={"code": other.code}).status_code == 200
    assert db.query(models.GroupMembership).filter_by(group_id=other.id, username="bob").count() == 1


def test_member_counts_skip_owner_and_demo(api):
    client, db, identity, group, _ = api
    assert groups._serialize_group(db, group)["members_count"] == 1
    row = next(item for item in client.get("/admin/classes").json() if item["id"] == group.id)
    assert row["members_count"] == 1


def test_student_lists_skip_owner_and_demo(api):
    client, db, identity, group, plan = api
    students = client.get(f"/admin/groups/{group.id}/students").json()["students"]
    assert [s["username"] for s in students] == ["alice"]
    plan_students = client.get(f"/admin/administration-plans/{plan.id}/students").json()["students"]
    assert [s["username"] for s in plan_students] == ["alice"]


def test_noticing_and_class_advice_skip_owner_and_demo(api):
    client, db, identity, group, _ = api
    assert {row.username for row in class_noticing.class_results(db, group, None, None)} <= {"alice"}
    assert class_council._members(db, group.id) == ["alice"]


def test_goals_and_orientation_skip_owner_and_demo(api):
    client, db, identity, group, _ = api
    goal_users = {goal["username"] for goal in client.get(f"/teacher/groups/{group.id}/goals").json()}
    assert goal_users == {"alice"}
    rows = client.get(f"/teacher/groups/{group.id}/orientation-recommendations").json()
    assert [row["username"] for row in rows] == ["alice"]


def test_admin_log_stats_and_export_skip_practice_and_demo_turns(api):
    client, *_ = api
    assert client.get("/admin/logs/stats").json()["total"] == 1
    exported = client.get("/admin/logs/export", params={"format": "json"}).json()
    assert len(exported) == 1  # identifiers are redacted in the export
