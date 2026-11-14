"""Docenza goal saved into the teacher catalog with its targets (#904).

Targets come from the teacher's OBIETTIVO_DOCENZA session snapshot, are
re-verified at save, live in goal_catalog_targets and are read only by the
author (or an admin): /user/goal-catalog never returns them.
"""
import os

from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "postgresql://counselorbot_user:counselorbot@postgres:5432/counselorbot")

from backend import auth, database, models
from backend.routes import frozen_sessions
from backend.routes.goals import router as goals_router
from backend.tests.artifact_database import artifact_session

BASE = {"questionnaire_type": "OBIETTIVO_DOCENZA", "messages": [], "current_phase": "obbdocenza-intro"}
PRIVATE = ("targets", "target_note", "anna", "Simulato")


def _client(db, who):
    app = FastAPI()
    app.include_router(frozen_sessions.router)
    app.include_router(goals_router)
    app.dependency_overrides[auth.get_current_user] = lambda: who
    app.dependency_overrides[database.get_db] = lambda: db
    return TestClient(app)


def _setup(db):
    own = models.StudentGroup(code="GR-GCT001", name="3B", owner_username="t1", is_active=True)
    foreign = models.StudentGroup(code="GR-GCT002", name="5C", owner_username="other", is_active=True)
    db.add_all([own, foreign])
    db.commit()
    db.add_all([models.GroupMembership(group_id=own.id, username="anna"),
                models.GroupMembership(group_id=foreign.id, username="carla")])
    mine = models.TeacherPracticeNotebook(owner_username="t1", title="Simulato", data={})
    db.add(mine)
    db.commit()
    return own, foreign, mine


def _teacher(who, username="t1"):
    who.clear()
    who.update(username=username, groups=["docenti"], is_admin=False, is_researcher=False, authenticated=True)


def _student(who):
    who.clear()
    who.update(username="anna", groups=["studenti"], is_admin=False, is_researcher=False, authenticated=True)


def _save_session(client, own, foreign, mine):
    body = {**BASE, "session_id": "doc-c", "group_ids": [own.id, foreign.id],
            "target_students": [{"group_id": own.id, "username": "anna"}, {"group_id": foreign.id, "username": "carla"}],
            "target_practice_notebook_ids": [mine.id]}
    assert client.post("/session/freeze", json=body).status_code == 200


def test_docenza_goal_lands_in_the_catalog_with_a_teacher_only_target_note():
    with artifact_session() as db:
        own, foreign, mine = _setup(db)
        who = {}
        _teacher(who)
        client = _client(db, who)
        _save_session(client, own, foreign, mine)
        res = client.post("/teacher/goal-catalog", json={
            "data": {"title": "Leggere ogni giorno"}, "group_id": own.id, "status": "published", "session_id": "doc-c"})
        assert res.status_code == 201, res.text
        entry = res.json()
        # The foreign class and its student were never reachable: they stay out.
        assert entry["targets"] == [
            {"kind": "class", "group_id": own.id, "label": "3B"},
            {"kind": "student", "group_id": own.id, "username": "anna", "label": "anna (3B)"},
            {"kind": "practice", "practice_notebook_id": mine.id, "label": "Simulato"},
        ]
        assert entry["target_note"] == "3B, anna (3B), Simulato"
        assert "targets" not in entry["data"]
        listed = client.get("/teacher/goal-catalog").json()
        assert listed[0]["target_note"] == "3B, anna (3B), Simulato"

        # Another teacher of the class sees the published entry, never its targets.
        db.add(models.GroupShare(group_id=own.id, shared_with_username="other", granted_by_username="t1"))
        db.commit()
        _teacher(who, "other")
        other = [row for row in client.get("/teacher/goal-catalog").json() if row["id"] == entry["id"]]
        assert other and "targets" not in other[0] and "target_note" not in other[0]

        # Students read the entry through /user/goal-catalog without any target.
        _student(who)
        rows = client.get("/user/goal-catalog")
        assert [row["id"] for row in rows.json()] == [entry["id"]]
        assert not any(word in rows.text for word in PRIVATE)


def test_save_needs_the_teachers_own_docenza_session():
    with artifact_session() as db:
        own, foreign, mine = _setup(db)
        who = {}
        _teacher(who)
        client = _client(db, who)
        _save_session(client, own, foreign, mine)
        payload = {"data": {"title": "X"}, "session_id": "doc-c"}
        _teacher(who, "other")
        assert client.post("/teacher/goal-catalog", json=payload).status_code == 404
        _teacher(who)
        assert client.post("/teacher/goal-catalog", json={**payload, "session_id": "missing"}).status_code == 404
        assert db.query(models.GoalCatalogEntry).count() == 0


def test_plain_catalog_entries_have_no_targets_and_targets_follow_deletion():
    with artifact_session() as db:
        own, foreign, mine = _setup(db)
        who = {}
        _teacher(who)
        client = _client(db, who)
        plain = client.post("/teacher/goal-catalog", json={"data": {"title": "Plain"}}).json()
        assert plain["targets"] == [] and plain["target_note"] == ""
        _save_session(client, own, foreign, mine)
        entry = client.post("/teacher/goal-catalog", json={"data": {"title": "T"}, "session_id": "doc-c"}).json()
        db.delete(db.get(models.GoalCatalogEntry, entry["id"]))
        db.commit()
        assert db.query(models.GoalCatalogTarget).count() == 0
