"""Resolved class access and the start/write guard (#89) on the Postgres test DB."""
import io
from contextlib import contextmanager
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend import auth, class_access, database, models
from backend.dynamic_registry import set_session_factory
from backend.routes import chat, class_access as class_access_routes, frozen_sessions, survey
from backend.tests.artifact_database import artifact_session

STUDENT = {"username": "anna", "groups": ["studenti"], "is_admin": False, "is_researcher": False, "authenticated": True}
TEACHER = {"username": "prof", "groups": ["docenti"], "is_admin": False, "is_researcher": False, "authenticated": True}
RESEARCHER = {"username": "ric", "groups": ["researchers"], "is_admin": False, "is_researcher": True, "authenticated": True}
ADMIN = {"username": "root", "groups": ["admins"], "is_admin": True, "is_researcher": False, "authenticated": True}
ANONYMOUS = {"username": "", "groups": [], "is_admin": False, "is_researcher": False, "authenticated": False}


@pytest.fixture
def db():
    with artifact_session() as session:
        session.add_all([
            models.Instrument(code="QSA", is_active=True, tool_category="assessment", target_audience="student"),
            models.Instrument(code="SAVICKAS", is_active=True, tool_category="guided", target_audience="student"),
            models.Instrument(code="OFF", is_active=False, tool_category="guided", target_audience="student"),
            models.Instrument(code="DOCENZA", is_active=True, tool_category="guided", target_audience="teacher"),
            models.GuidedStep(id="sav-1", sort_order=1, label="Start", prompt="Start", system_prompt_mode="generic",
                              color_theme="blue", questionnaire_type="SAVICKAS"),
        ])
        session.commit()
        yield session


def _group(db, name, *, active=True, disabled=(), locks=None, members=()):
    group = models.StudentGroup(code=f"GR-{name.upper()}", name=name, owner_username="prof", is_active=active)
    db.add(group)
    db.flush()
    if disabled or locks:
        db.add(models.ClassSettings(group_id=group.id, disabled_tool_keys=list(disabled),
                                    locked_tool_keys=locks or {}, updated_by="prof"))
    for username in members:
        db.add(models.GroupMembership(group_id=group.id, username=username))
    db.commit()
    return group


# --- Resolver truth table ---------------------------------------------------

def test_no_class_gets_admin_layer_only(db):
    access = class_access.resolve_access(db, STUDENT)
    assert access["restricted"] is False
    assert access["class_ids"] == []
    assert access["counselor_ids"] is None and access["default_counselor_id"] is None
    keys = set(access["tool_keys"])
    assert {"QSA", "SAVICKAS", "tavolo", "bussola", "assistant", "notebook", "results"} <= keys
    assert "OFF" not in keys, "admin-disabled instrument"
    assert "DOCENZA" not in keys, "teacher-only instrument"


def test_one_class_filters_disabled_tools(db):
    group = _group(db, "a", disabled=["QSA", "tavolo"], members=["anna"])
    access = class_access.resolve_access(db, STUDENT)
    assert access["restricted"] is True
    assert access["class_ids"] == [group.id]
    keys = set(access["tool_keys"])
    assert "QSA" not in keys and "tavolo" not in keys
    assert {"SAVICKAS", "goals", "notebook", "classes", "assignments", "results"} <= keys


def test_class_without_settings_row_enables_everything(db):
    _group(db, "a", members=["anna"])
    access = class_access.resolve_access(db, STUDENT)
    assert access["restricted"] is True
    assert set(access["tool_keys"]) == set(class_access.resolve_access(db, ANONYMOUS)["tool_keys"])


def test_two_classes_union(db):
    first = _group(db, "a", disabled=["QSA", "pqbl"], members=["anna"])
    second = _group(db, "b", disabled=["SAVICKAS", "pqbl"], members=["anna"])
    access = class_access.resolve_access(db, STUDENT)
    keys = set(access["tool_keys"])
    assert {"QSA", "SAVICKAS"} <= keys, "enabled by at least one class"
    assert "pqbl" not in keys, "disabled by every class"
    assert sorted(access["class_ids"]) == sorted([first.id, second.id])


def test_inactive_class_is_ignored(db):
    _group(db, "a", disabled=["QSA"], members=["anna"])
    _group(db, "old", active=False, members=["anna"])
    access = class_access.resolve_access(db, STUDENT)
    assert "QSA" not in access["tool_keys"], "inactive class cannot widen the union"

    db.query(models.GroupMembership).filter_by(username="anna").delete()
    _group(db, "old2", active=False, disabled=["QSA"], members=["anna"])
    only_inactive = class_access.resolve_access(db, STUDENT)
    assert only_inactive["restricted"] is False and only_inactive["class_ids"] == []
    assert "QSA" in only_inactive["tool_keys"]


@pytest.mark.parametrize("identity", [TEACHER, RESEARCHER, ADMIN], ids=["teacher", "researcher", "admin"])
def test_staff_is_never_filtered(db, identity):
    _group(db, "a", disabled=["QSA", "tavolo"], members=[identity["username"]])
    access = class_access.resolve_access(db, identity)
    assert access["restricted"] is False and access["class_ids"] == []
    assert {"QSA", "tavolo"} <= set(access["tool_keys"])


def test_admin_disabled_wins_over_class_lock_on(db):
    _group(db, "a", locks={"OFF": {"enabled": True, "locked_by": "root"}}, members=["anna"])
    assert "OFF" not in class_access.resolve_access(db, STUDENT)["tool_keys"]


def test_admin_lock_overrides_teacher_choice(db):
    _group(db, "a", disabled=["QSA"], locks={"QSA": {"enabled": True}, "SAVICKAS": {"enabled": False}},
           members=["anna"])
    keys = set(class_access.resolve_access(db, STUDENT)["tool_keys"])
    assert "QSA" in keys, "locked ON beats the teacher deny-list"
    assert "SAVICKAS" not in keys, "locked OFF beats the teacher choice"


def test_always_on_tools_survive_a_corrupted_deny_list(db):
    _group(db, "a", disabled=["notebook", "classes"], members=["anna"])
    assert {"notebook", "classes"} <= set(class_access.resolve_access(db, STUDENT)["tool_keys"])


# --- Guard ------------------------------------------------------------------

def _denied(db, identity, key):
    with pytest.raises(class_access.ToolAccessDenied) as exc:
        class_access.require_tool(db, identity, key)
    return exc.value


def test_guard_rejects_class_disabled_tool_case_insensitively(db):
    _group(db, "a", disabled=["QSA"], members=["anna"])
    for key in ("QSA", "qsa", " QSA "):
        error = _denied(db, STUDENT, key)
        assert error.status_code == 403
        assert (error.detail, error.tool) == ("tool_disabled_for_class", "QSA")
    class_access.require_tool(db, STUDENT, "SAVICKAS")
    class_access.require_tool(db, TEACHER, "QSA")


def test_guard_admin_layer(db):
    for identity in (STUDENT, ANONYMOUS, TEACHER, RESEARCHER):
        assert _denied(db, identity, "OFF").detail == "tool_unavailable"
    for identity in (STUDENT, ANONYMOUS):
        assert _denied(db, identity, "DOCENZA").detail == "tool_unavailable"
    class_access.require_tool(db, TEACHER, "DOCENZA")
    # Platform admins configure the catalog and test drafts in the sandbox.
    class_access.require_tool(db, ADMIN, "OFF")


def test_guard_ignores_non_catalog_keys(db):
    _group(db, "a", disabled=["QSA"], members=["anna"])
    for key in (None, "", "GENERIC", "notebook", "assignments"):
        class_access.require_tool(db, STUDENT, key)


def test_guard_personal_tool_keys(db):
    _group(db, "a", disabled=["tavolo"], members=["anna"])
    assert _denied(db, STUDENT, "tavolo").detail == "tool_disabled_for_class"
    class_access.require_tool(db, STUDENT, "goals")


# --- Entry points -----------------------------------------------------------

@contextmanager
def _client(db, identity):
    app = FastAPI()
    for router in (chat.router, survey.router, frozen_sessions.router, class_access_routes.router):
        app.include_router(router)
    app.add_exception_handler(class_access.ToolAccessDenied, class_access.tool_access_denied_handler)

    def override_db():
        yield db

    app.dependency_overrides[database.get_db] = override_db
    app.dependency_overrides[auth.get_identity_view_as] = lambda: identity
    app.dependency_overrides[auth.get_current_user] = lambda: identity

    # Background logging opens fresh sessions: keep them inside the test schema.
    def fresh_session():
        return Session(bind=db.connection(), join_transaction_mode="create_savepoint")

    set_session_factory(fresh_session)
    try:
        with patch.object(database, "SessionLocal", fresh_session), TestClient(app) as client:
            yield client
    finally:
        set_session_factory(None)


def _assert_denied(response, detail, tool):
    assert response.status_code == 403, response.text
    assert response.json() == {"detail": detail, "tool": tool}


def _chat(client, questionnaire_type="QSA", **extra):
    return client.post("/chat", json={"message": "Hi", "questionnaire_type": questionnaire_type,
                                      "session_id": "sess-chat", **extra})


def _stream(client, questionnaire_type="QSA", **extra):
    return client.post("/chat/stream", json={"message": "Hi", "questionnaire_type": questionnaire_type,
                                             "session_id": "sess-stream", **extra})


def _mock_stream(*_args, **_kwargs):
    yield {"type": "delta", "text": "streamed reply"}


def test_chat_routes_guard_disabled_tools(db):
    _group(db, "a", disabled=["QSA", "SAVICKAS"], members=["anna"])
    with _client(db, STUDENT) as client, patch.object(chat.AIService, "get_response") as reply, \
            patch.object(chat.AIService, "stream_response") as stream:
        _assert_denied(_chat(client), "tool_disabled_for_class", "QSA")
        _assert_denied(_stream(client), "tool_disabled_for_class", "QSA")
        # The step decides the instrument, whatever the client claims.
        _assert_denied(_chat(client, "QSAr", phase="sav-1"), "tool_disabled_for_class", "SAVICKAS")
        _assert_denied(_stream(client, "", phase="sav-1"), "tool_disabled_for_class", "SAVICKAS")
        _assert_denied(_chat(client, "OFF"), "tool_unavailable", "OFF")
        _assert_denied(_stream(client, "DOCENZA"), "tool_unavailable", "DOCENZA")
        _assert_denied(client.post("/chat/message", params={"message": "Hi", "session_id": "s", "mode": "generic",
                                                            "questionnaire_type": "QSA"}),
                       "tool_disabled_for_class", "QSA")
        reply.assert_not_called()
        stream.assert_not_called()
    assert db.query(models.Log).count() == 0


@pytest.mark.parametrize("identity,questionnaire_type", [
    (STUDENT, "SAVICKAS"),      # enabled by the second class
    (TEACHER, "QSA"),           # staff bypass
    (TEACHER, "DOCENZA"),       # teacher-only tool for staff
    (ADMIN, "OFF"),             # admin tests drafts
])
def test_chat_routes_allow_enabled_tools(db, identity, questionnaire_type):
    _group(db, "a", disabled=["QSA", "SAVICKAS"], members=["anna", "prof", "root"])
    _group(db, "b", disabled=["QSA"], members=["anna"])
    with _client(db, identity) as client, \
            patch.object(chat.AIService, "get_response", return_value="plain reply"), \
            patch.object(chat.AIService, "stream_response", side_effect=_mock_stream):
        response = _chat(client, questionnaire_type)
        assert response.status_code == 200, response.text
        assert response.json()["response"] == "plain reply"
        streamed = _stream(client, questionnaire_type)
        assert streamed.status_code == 200, streamed.text
        assert "streamed reply" in streamed.text


def test_private_counselor_is_not_filtered_by_class(db):
    _group(db, "a", disabled=["QSA"], members=["anna"])
    db.add(models.Counselor(slug="mine", name="Mine", is_active=True, owner_username="anna"))
    db.commit()
    counselor = db.query(models.Counselor).filter_by(slug="mine").one()
    with _client(db, STUDENT) as client, \
            patch.object(chat.AIService, "get_response", return_value="private reply"), \
            patch("backend.personal_api.feature_enabled", return_value=True):
        response = _chat(client, "SAVICKAS", counselor_id=counselor.id)
        assert response.status_code == 200, response.text


def test_questionnaire_submission_and_scoring_are_guarded(db):
    _group(db, "a", disabled=["QSA"], members=["anna"])
    profile = {"instrument": "SAVICKAS", "results": []}
    with _client(db, STUDENT) as client, \
            patch.object(survey.scoring_service, "compute_profile", return_value=profile) as compute:
        _assert_denied(client.post("/questionnaire-result", json={"session_id": "r1", "questionnaire_type": "QSA"}),
                       "tool_disabled_for_class", "QSA")
        _assert_denied(client.post("/instruments/QSA/score", json={"session_id": "r2", "locale": "en", "answers": {}}),
                       "tool_disabled_for_class", "QSA")
        _assert_denied(client.post("/instruments/OFF/score",
                                   json={"session_id": "r3", "locale": "en", "answers": {}, "save": False}),
                       "tool_unavailable", "OFF")
        compute.assert_not_called()
        assert db.query(models.QuestionnaireResult).count() == 0

        allowed = client.post("/questionnaire-result", json={"session_id": "r4", "questionnaire_type": "SAVICKAS"})
        assert allowed.status_code == 200, allowed.text
        scored = client.post("/instruments/SAVICKAS/score",
                             json={"session_id": "r5", "locale": "en", "answers": {}, "save": False})
        assert scored.status_code == 200, scored.text
        assert scored.json() == profile


def test_anonymous_submission_keeps_admin_layer(db):
    with _client(db, ANONYMOUS) as client:
        assert client.post("/questionnaire-result",
                           json={"session_id": "anon", "questionnaire_type": "QSA"}).status_code == 200
        _assert_denied(client.post("/questionnaire-result", json={"session_id": "anon2", "questionnaire_type": "OFF"}),
                       "tool_unavailable", "OFF")


def test_frozen_resume_is_guarded_but_list_and_delete_stay_open(db):
    _group(db, "a", disabled=["QSA"], members=["anna"])
    db.add_all([
        models.FrozenSession(username="anna", session_id="frozen-qsa", questionnaire_type="QSA",
                             data={"current_phase": "p1", "messages": []}),
        models.FrozenSession(username="anna", session_id="frozen-sav", questionnaire_type="SAVICKAS",
                             data={"current_phase": "p1", "messages": []}),
    ])
    db.commit()
    with _client(db, STUDENT) as client:
        _assert_denied(client.get("/session/frozen/frozen-qsa"), "tool_disabled_for_class", "QSA")
        assert client.get("/session/frozen/frozen-sav").status_code == 200
        listed = client.get("/session/frozen")
        assert listed.status_code == 200
        assert {row["session_id"] for row in listed.json()} == {"frozen-qsa", "frozen-sav"}
        assert client.delete("/session/frozen/frozen-qsa").status_code == 200


def test_reads_of_disabled_tool_data_stay_available(db):
    _group(db, "a", disabled=["QSA"], members=["anna"])
    db.add(models.QuestionnaireResult(session_id="old-qsa", questionnaire_type="QSA", scores={"C1": 5},
                                      username="anna"))
    db.commit()
    with _client(db, STUDENT) as client, \
            patch.object(survey, "canonical_summary", return_value=("Summary", "ok")), \
            patch.object(survey, "generate_questionnaire_pdf", return_value=io.BytesIO(b"%PDF-1.4 synthetic")):
        results = client.get("/user/questionnaire-results")
        assert results.status_code == 200
        assert [row["session_id"] for row in results.json()] == ["old-qsa"]
        assert client.get("/user/questionnaire-result/old-qsa/conversation").status_code == 200
        pdf = client.get("/questionnaire-result/old-qsa/pdf")
        assert pdf.status_code == 200, pdf.text
        assert pdf.content.startswith(b"%PDF")


# --- GET /user/access -------------------------------------------------------

def test_user_access_contract(db):
    group = _group(db, "a", disabled=["QSA", "flashcards"], members=["anna"])
    with _client(db, STUDENT) as client:
        body = client.get("/user/access").json()
    assert set(body) == {"restricted", "tool_keys", "counselor_ids", "default_counselor_id", "class_ids"}
    assert body["restricted"] is True
    assert body["class_ids"] == [group.id]
    assert "QSA" not in body["tool_keys"] and "flashcards" not in body["tool_keys"]
    assert "SAVICKAS" in body["tool_keys"]
    assert body["counselor_ids"] is None and body["default_counselor_id"] is None

    with _client(db, TEACHER) as client:
        staff = client.get("/user/access").json()
    assert staff["restricted"] is False and "QSA" in staff["tool_keys"]


def test_user_access_requires_authentication(db):
    app = FastAPI()
    app.include_router(class_access_routes.router)
    with TestClient(app) as client:
        assert client.get("/user/access").status_code == 401
