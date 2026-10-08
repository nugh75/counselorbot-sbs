"""Class access guard on write entry points outside the chat turn (#89 review B2-B6)."""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, class_access, database, models
from backend.memory_service import session_memory
from backend.routes import chat, idea_map, memory
from backend.tests.test_class_access import ANONYMOUS, STUDENT, TEACHER, _assert_denied, _client, _group, db  # noqa: F401


def _app(router):
    app = FastAPI()
    app.include_router(router)
    app.add_exception_handler(class_access.ToolAccessDenied, class_access.tool_access_denied_handler)
    return app


def _with_identity(app, db, identity, *db_dependencies):
    for dependency in db_dependencies:
        app.dependency_overrides[dependency] = lambda: db
    if identity is not None:
        app.dependency_overrides[auth.get_identity_view_as] = lambda: identity
        app.dependency_overrides[auth.get_current_user] = lambda: identity
    return TestClient(app)


# --- B2: /qsa/upload ----------------------------------------------------------

def _upload(client, questionnaire_type="QSA"):
    return client.post("/qsa/upload", files={"file": ("scan.pdf", b"%PDF-1.4 synthetic", "application/pdf")},
                       data={"questionnaire_type": questionnaire_type})


def test_upload_requires_identity_and_the_guard(db, tmp_path, monkeypatch):
    _group(db, "a", disabled=["QSA"], members=["anna"])
    monkeypatch.chdir(tmp_path)
    with patch.object(chat, "extract_questionnaire_data", return_value={"C1": 5}) as extract:
        anonymous = _upload(_with_identity(_app(chat.router), db, None, database.get_db))
        assert anonymous.status_code == 401, anonymous.text
        student = _with_identity(_app(chat.router), db, STUDENT, database.get_db)
        _assert_denied(_upload(student), "tool_disabled_for_class", "QSA")
        _assert_denied(_upload(student, "qsa"), "tool_disabled_for_class", "QSA")
        extract.assert_not_called()
        assert not (tmp_path / "uploads").exists()

        allowed = _upload(_with_identity(_app(chat.router), db, TEACHER, database.get_db))
        assert allowed.status_code == 200, allowed.text
        assert extract.called and list((tmp_path / "uploads/qsa").glob("*.pdf"))


# --- B3: /qsa/audit -----------------------------------------------------------

def test_audit_is_guarded_before_the_completion_log(db):
    _group(db, "a", disabled=["QSA"], members=["anna"])
    payload = {"session_id": "audit-qsa", "questionnaire_type": "QSA", "scores": {"C1": 5}}
    with _client(db, STUDENT) as client:
        _assert_denied(client.post("/qsa/audit", json=payload), "tool_disabled_for_class", "QSA")
        assert db.query(models.Log).filter_by(action="qsa_completed").count() == 0
        allowed = client.post("/qsa/audit", json={**payload, "questionnaire_type": "SAVICKAS"})
        assert allowed.status_code == 200, allowed.text
    assert db.query(models.Log).filter_by(action="qsa_completed").count() == 1


# --- B4: /memory/event --------------------------------------------------------

def _event(client, session_id, questionnaire_type="QSA"):
    return client.post("/memory/event", json={
        "session_id": session_id, "questionnaire_type": questionnaire_type, "phase": "p1",
        "step_label": "Step", "completed_step": True, "user_message": "Synthetic"})


@pytest.fixture(autouse=True)
def _fresh_memory():
    ids = ("mem-anon", "mem-disabled", "mem-enabled", "mem-result", "mem-chat", "mem-mine", "mem-new")
    for session_id in ids:
        session_memory.clear(session_id)
    yield
    for session_id in ids:
        session_memory.clear(session_id)


def _memory_client(db, identity):
    return _with_identity(_app(memory.router), db, identity, database.get_db)


def test_memory_event_requires_identity(db):
    response = _event(_memory_client(db, None), "mem-anon")
    assert response.status_code == 401, response.text
    assert not session_memory.get_progress("mem-anon")["current_phase"]


def test_memory_event_is_guarded(db):
    _group(db, "a", disabled=["QSA"], members=["anna"])
    client = _memory_client(db, STUDENT)
    _assert_denied(_event(client, "mem-disabled"), "tool_disabled_for_class", "QSA")
    assert not session_memory.get_progress("mem-disabled")["current_phase"]
    assert _event(client, "mem-enabled", "SAVICKAS").status_code == 200


def test_memory_event_rejects_another_users_session(db):
    db.add_all([
        models.QuestionnaireResult(session_id="mem-result", questionnaire_type="SAVICKAS", username="bruno"),
        models.Log(session_id="mem-chat", action="chat_message", questionnaire_type="SAVICKAS", username="bruno",
                   details={}),
        models.Log(session_id="mem-mine", action="chat_message", questionnaire_type="SAVICKAS", username="anna",
                   details={}),
    ])
    db.commit()
    client = _memory_client(db, STUDENT)
    for session_id in ("mem-result", "mem-chat"):
        response = _event(client, session_id, "SAVICKAS")
        assert response.status_code == 403, response.text
        assert not session_memory.get_progress(session_id)["current_phase"]
    assert _event(client, "mem-mine", "SAVICKAS").status_code == 200
    # A brand-new session id has no owner yet: the caller starts it.
    assert _event(client, "mem-new", "SAVICKAS").status_code == 200
