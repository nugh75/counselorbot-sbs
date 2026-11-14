"""Destinatari della chat OBIETTIVO_DOCENZA (#903): studenti e studenti di prova.

Scelti prima della chat, salvati nello snapshot congelato (scritto dopo ogni
turno) e riverificati a ogni salvataggio: solo membri reali di classi attive
proprie o condivise, solo taccuini di prova attivi del docente.
"""
import os

from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "postgresql://counselorbot_user:counselorbot@postgres:5432/counselorbot")

from backend import auth, models
from backend.routes import frozen_sessions
from backend.tests.artifact_database import artifact_session

TEACHER = {"username": "t1", "groups": ["docenti"], "is_admin": False, "is_researcher": False, "authenticated": True}
BASE = {"questionnaire_type": "OBIETTIVO_DOCENZA", "messages": [], "current_phase": "obbdocenza-intro"}


def _client(db):
    app = FastAPI()
    app.include_router(frozen_sessions.router)
    app.dependency_overrides[auth.get_current_user] = lambda: TEACHER
    from backend.database import get_db
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def _setup(db):
    own = models.StudentGroup(code="GR-DGT001", name="3B", owner_username="t1", is_active=True)
    shared = models.StudentGroup(code="GR-DGT002", name="4A", owner_username="other", is_active=True)
    foreign = models.StudentGroup(code="GR-DGT003", name="5C", owner_username="other", is_active=True)
    db.add_all([own, shared, foreign])
    db.commit()
    db.add(models.GroupShare(group_id=shared.id, shared_with_username="t1", granted_by_username="other"))
    db.add_all([
        models.GroupMembership(group_id=own.id, username="anna"),
        models.GroupMembership(group_id=own.id, username="t1"),  # il proprietario non e' uno studente
        models.GroupMembership(group_id=shared.id, username="bruno"),
        models.GroupMembership(group_id=foreign.id, username="carla"),
    ])
    mine = models.TeacherPracticeNotebook(owner_username="t1", title="Simulato", data={})
    theirs = models.TeacherPracticeNotebook(owner_username="other", title="Altrui", data={})
    db.add_all([mine, theirs])
    db.commit()
    return own, shared, foreign, mine, theirs


def test_snapshot_keeps_only_targets_the_teacher_can_reach():
    with artifact_session() as db:
        own, shared, foreign, mine, theirs = _setup(db)
        client = _client(db)
        students = [
            {"group_id": own.id, "username": "anna"},
            {"group_id": own.id, "username": "anna"},
            {"group_id": shared.id, "username": "bruno"},
            {"group_id": own.id, "username": "bruno"},  # non membro di quella classe
            {"group_id": own.id, "username": "t1"},
            {"group_id": foreign.id, "username": "carla"},
        ]
        body = {**BASE, "session_id": "doc-t", "group_ids": [own.id], "target_students": students,
                "target_practice_notebook_ids": [mine.id, theirs.id, mine.id, 999999]}
        assert client.post("/session/freeze", json=body).status_code == 200
        detail = client.get("/session/frozen/doc-t").json()
        assert detail["group_ids"] == [own.id]
        assert detail["target_students"] == [
            {"group_id": own.id, "username": "anna"},
            {"group_id": shared.id, "username": "bruno"},
        ]
        assert detail["target_practice_notebook_ids"] == [mine.id]


def test_revoked_class_and_archived_notebook_leave_at_the_next_save():
    with artifact_session() as db:
        own, shared, _, mine, _ = _setup(db)
        client = _client(db)
        body = {**BASE, "session_id": "doc-r", "target_students": [{"group_id": shared.id, "username": "bruno"}],
                "target_practice_notebook_ids": [mine.id]}
        assert client.post("/session/freeze", json=body).status_code == 200
        db.query(models.GroupShare).filter(models.GroupShare.group_id == shared.id).delete()
        from datetime import datetime, timezone
        mine.archived_at = datetime.now(timezone.utc)
        db.commit()
        assert client.post("/session/freeze", json=body).status_code == 200
        detail = client.get("/session/frozen/doc-r").json()
        assert detail["target_students"] == [] and detail["target_practice_notebook_ids"] == []


def test_other_tools_and_old_snapshots_carry_no_targets():
    with artifact_session() as db:
        own, _, _, mine, _ = _setup(db)
        client = _client(db)
        body = {**BASE, "questionnaire_type": "OBIETTIVO_STUDIO", "session_id": "stu",
                "target_students": [{"group_id": own.id, "username": "anna"}], "target_practice_notebook_ids": [mine.id]}
        assert client.post("/session/freeze", json=body).status_code == 200
        row = db.query(models.FrozenSession).filter(models.FrozenSession.session_id == "stu").one()
        assert "target_students" not in row.data and "target_practice_notebook_ids" not in row.data
        db.add(models.FrozenSession(username="t1", session_id="doc-old", questionnaire_type="OBIETTIVO_DOCENZA",
                                    data={"messages": [], "current_phase": "obbdocenza-intro"}))
        db.commit()
        detail = client.get("/session/frozen/doc-old").json()
        assert detail["target_students"] == [] and detail["target_practice_notebook_ids"] == []
