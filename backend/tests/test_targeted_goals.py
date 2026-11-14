"""Catalog goals targeted to a class, a student or a test student (#905).

Read-only list for the class overview, the teacher's student view and the
test-student page; practice chats run as a test student get its goals in context.
Targets are author-only: other teachers and students never read them.
"""
import os

from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "postgresql://counselorbot_user:counselorbot@postgres:5432/counselorbot")

from backend import auth, database, models
from backend.api_models import ChatRequest
from backend.routes.goals import router as goals_router
from backend.tests.artifact_database import artifact_session
from backend.tests.test_practice_notebooks import _envelope

TEACHER = {"username": "t1", "groups": ["docenti"], "is_admin": False, "is_researcher": False, "authenticated": True}


def _client(db, who):
    app = FastAPI()
    app.include_router(goals_router)
    app.dependency_overrides[auth.get_current_user] = lambda: who
    app.dependency_overrides[database.get_db] = lambda: db
    return TestClient(app)


def _entry(db, title, *targets, author="t1", status="draft"):
    row = models.GoalCatalogEntry(author_username=author, status=status, version=1,
                                  data={"title": title, "description": f"why {title}", "criteria": f"done {title}"})
    db.add(row)
    db.flush()
    db.add_all(models.GoalCatalogTarget(catalog_id=row.id, **target) for target in targets)
    db.commit()
    return row


def _setup(db):
    group = models.StudentGroup(code="GR-TG0001", name="3B", owner_username="t1", is_active=True)
    db.add(group)
    db.commit()
    db.add(models.GroupMembership(group_id=group.id, username="anna"))
    mine = models.TeacherPracticeNotebook(owner_username="t1", title="Giulia", data={})
    other = models.TeacherPracticeNotebook(owner_username="t1", title="Marco", data={})
    db.add_all([mine, other])
    db.commit()
    _entry(db, "Class goal", {"group_id": group.id})
    _entry(db, "Anna goal", {"group_id": group.id, "username": "anna"})
    _entry(db, "Giulia goal", {"practice_notebook_id": mine.id})
    _entry(db, "Marco goal", {"practice_notebook_id": other.id})
    _entry(db, "Old goal", {"group_id": group.id}, {"practice_notebook_id": mine.id}, status="archived")
    return group, mine


def _titles(response):
    assert response.status_code == 200, response.text
    return [row["data"]["title"] for row in response.json()]


def test_each_page_lists_only_its_own_targets():
    with artifact_session() as db:
        group, mine = _setup(db)
        client = _client(db, dict(TEACHER))
        assert _titles(client.get(f"/teacher/goal-catalog/targeted?group_id={group.id}")) == ["Class goal"]
        assert _titles(client.get(f"/teacher/goal-catalog/targeted?group_id={group.id}&username=anna")) == ["Anna goal"]
        assert _titles(client.get(f"/teacher/goal-catalog/targeted?practice_notebook_id={mine.id}")) == ["Giulia goal"]
        assert client.get("/teacher/goal-catalog/targeted").status_code == 422
        rows = client.get(f"/teacher/goal-catalog/targeted?group_id={group.id}").json()
        assert "targets" not in rows[0] and "target_note" not in rows[0]


def test_targets_stay_with_the_author():
    with artifact_session() as db:
        group, mine = _setup(db)
        db.add(models.GroupShare(group_id=group.id, shared_with_username="t2", granted_by_username="t1"))
        db.commit()
        client = _client(db, dict(TEACHER, username="t2"))
        # A co-teacher sees the class but never the author's targets.
        assert _titles(client.get(f"/teacher/goal-catalog/targeted?group_id={group.id}")) == []
        assert client.get(f"/teacher/goal-catalog/targeted?practice_notebook_id={mine.id}").status_code == 404
        stranger = _client(db, dict(TEACHER, username="t3"))
        assert stranger.get(f"/teacher/goal-catalog/targeted?group_id={group.id}").status_code == 404
        student = _client(db, {"username": "anna", "groups": ["studenti"], "is_admin": False, "is_researcher": False, "authenticated": True})
        assert student.get(f"/teacher/goal-catalog/targeted?group_id={group.id}&username=anna").status_code == 403


def test_practice_chat_receives_its_test_students_goals():
    with artifact_session() as db:
        _, mine = _setup(db)
        request = ChatRequest(message="turn", questionnaire_type="QSA", language="it",
                              notebook_context="practice", practice_notebook_id=mine.id)
        system = _envelope(db, request, TEACHER, "QSA")
        block = system[system.index("[TARGETED GOALS]"):]
        assert "Giulia goal" in block and "why Giulia goal" in block and "done Giulia goal" in block
        assert system.index("[PROFILE]") < system.index("[TARGETED GOALS]")
        assert not any(title in system for title in ("Marco goal", "Old goal", "Class goal", "Anna goal"))
        # A teacher-notebook chat never gets them.
        own = ChatRequest(message="turn", questionnaire_type="QSA", language="it", notebook_context="teacher")
        assert "[TARGETED GOALS]" not in _envelope(db, own, TEACHER, "QSA")
