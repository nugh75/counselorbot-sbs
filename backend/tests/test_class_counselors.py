"""Per-class counselor enablement and class default counselor (#93) on the Postgres test DB."""
from contextlib import contextmanager
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend import auth, class_access, database, models, personal_api
from backend.dynamic_registry import set_session_factory
from backend.routes import chat, class_access as class_access_routes, counselors, learner_profile
from backend.tests.artifact_database import artifact_session

STUDENT = {"username": "anna", "groups": ["studenti"], "is_admin": False, "is_researcher": False, "authenticated": True}
TEACHER = {"username": "prof", "groups": ["docenti"], "is_admin": False, "is_researcher": False, "authenticated": True}

CLIO, GIULIO, IRIDE, RETIRED, ANNA_PRIVATE, BOB_PRIVATE = 1, 2, 3, 4, 5, 6


@pytest.fixture
def db():
    with artifact_session() as session:
        session.add_all([
            models.Instrument(code="QSA", is_active=True, tool_category="assessment", target_audience="student"),
            models.Counselor(id=CLIO, name="Clio", slug="clio", language=["*"], is_active=True, sort_order=1,
                             approach_categories=["maieutic"]),
            models.Counselor(id=GIULIO, name="Giulio", slug="giulio", language=["*"], is_active=True, sort_order=2),
            models.Counselor(id=IRIDE, name="Iride", slug="iride", language=["*"], is_active=True, sort_order=3),
            models.Counselor(id=RETIRED, name="Retired", slug="retired", language=["*"], is_active=False, sort_order=4),
            models.Counselor(id=ANNA_PRIVATE, name="Mine", slug="anna-mine", language=["*"], is_active=True,
                             owner_username="anna"),
            models.Counselor(id=BOB_PRIVATE, name="Bob's", slug="bob-mine", language=["*"], is_active=True,
                             owner_username="bob"),
            models.Config(key=personal_api.POLICY_KEY, value="true"),
        ])
        session.commit()
        yield session


def _group(db, name, *, disabled=(), default=None, locks=None, members=("anna",), active=True):
    group = models.StudentGroup(code=f"GR-{name.upper()}", name=name, owner_username="prof", is_active=active)
    db.add(group)
    db.flush()
    db.add(models.ClassSettings(group_id=group.id, disabled_counselor_ids=list(disabled),
                                default_counselor_id=default, locked_counselor_ids=locks or {},
                                updated_by="prof"))
    for username in members:
        db.add(models.GroupMembership(group_id=group.id, username=username))
    db.commit()
    return group


# --- Resolver ---------------------------------------------------------------

def test_no_class_and_staff_are_not_filtered(db):
    access = class_access.resolve_access(db, STUDENT)
    assert access["counselor_ids"] is None and access["default_counselor_id"] is None
    _group(db, "a", disabled=[CLIO], default=GIULIO, members=["anna", "prof"])
    staff = class_access.resolve_access(db, TEACHER)
    assert staff["counselor_ids"] is None and staff["default_counselor_id"] is None
    assert class_access.allowed_counselor_ids(db, TEACHER) is None


def test_class_without_settings_row_allows_every_active_counselor(db):
    group = models.StudentGroup(code="GR-BARE", name="bare", owner_username="prof", is_active=True)
    db.add(group)
    db.flush()
    db.add(models.GroupMembership(group_id=group.id, username="anna"))
    db.commit()
    access = class_access.resolve_access(db, STUDENT)
    assert access["counselor_ids"] == [CLIO, GIULIO, IRIDE, ANNA_PRIVATE]
    assert access["default_counselor_id"] is None


def test_union_across_classes_and_admin_inactive_never(db):
    _group(db, "a", disabled=[GIULIO, IRIDE])
    _group(db, "b", disabled=[CLIO, IRIDE])
    access = class_access.resolve_access(db, STUDENT)
    assert access["counselor_ids"] == [CLIO, GIULIO, ANNA_PRIVATE]
    assert RETIRED not in access["counselor_ids"]


def test_inactive_class_cannot_widen_the_union(db):
    _group(db, "a", disabled=[GIULIO, IRIDE])
    _group(db, "old", active=False)
    assert class_access.resolve_access(db, STUDENT)["counselor_ids"] == [CLIO, ANNA_PRIVATE]


def test_private_counselors_are_always_in(db):
    _group(db, "a", disabled=[CLIO, GIULIO, IRIDE])
    access = class_access.resolve_access(db, STUDENT)
    assert access["counselor_ids"] == [ANNA_PRIVATE], "own private counselor only, never another owner's"


def test_admin_lock_overrides_teacher_choice_but_not_global_disable(db):
    _group(db, "a", disabled=[CLIO], locks={str(CLIO): {"enabled": True}, str(GIULIO): {"enabled": False},
                                          str(RETIRED): {"enabled": True}})
    assert class_access.resolve_access(db, STUDENT)["counselor_ids"] == [CLIO, IRIDE, ANNA_PRIVATE]


def test_default_comes_from_most_recently_joined_class_with_allowed_default(db):
    _group(db, "older", default=CLIO)
    _group(db, "newer", default=GIULIO)
    assert class_access.resolve_access(db, STUDENT)["default_counselor_id"] == GIULIO
    db.get(models.Counselor, GIULIO).is_active = False
    db.commit()
    assert class_access.resolve_access(db, STUDENT)["default_counselor_id"] == CLIO
    _group(db, "newest")
    assert class_access.resolve_access(db, STUDENT)["default_counselor_id"] == CLIO, "a class without default is skipped"


def test_require_counselor(db):
    _group(db, "a", disabled=[GIULIO])
    for allowed in (None, CLIO, ANNA_PRIVATE):
        class_access.require_counselor(db, STUDENT, allowed)
    for denied in (GIULIO, RETIRED, BOB_PRIVATE, 999):
        with pytest.raises(class_access.CounselorAccessDenied) as exc:
            class_access.require_counselor(db, STUDENT, denied)
        assert exc.value.status_code == 403
        assert exc.value.detail == "counselor_disabled_for_class"
    class_access.require_counselor(db, TEACHER, GIULIO)


# --- Routes -----------------------------------------------------------------

@contextmanager
def _client(db, identity):
    app = FastAPI()
    for router in (chat.router, counselors.router, class_access_routes.router, learner_profile.router):
        app.include_router(router)
    app.add_exception_handler(class_access.ToolAccessDenied, class_access.tool_access_denied_handler)
    app.add_exception_handler(class_access.CounselorAccessDenied, class_access.counselor_access_denied_handler)

    def override_db():
        yield db

    app.dependency_overrides[database.get_db] = override_db
    app.dependency_overrides[database.get_personal_ai_db] = override_db
    app.dependency_overrides[auth.get_identity_view_as] = lambda: identity
    app.dependency_overrides[auth.get_current_user] = lambda: identity

    def fresh_session():
        return Session(bind=db.connection(), join_transaction_mode="create_savepoint")

    set_session_factory(fresh_session)
    try:
        with patch.object(database, "SessionLocal", fresh_session), TestClient(app) as client:
            yield client
    finally:
        set_session_factory(None)


def test_user_access_exposes_counselor_fields(db):
    _group(db, "a", disabled=[IRIDE], default=GIULIO)
    with _client(db, STUDENT) as client:
        body = client.get("/user/access").json()
    assert body["counselor_ids"] == [CLIO, GIULIO, ANNA_PRIVATE]
    assert body["default_counselor_id"] == GIULIO


def test_counselor_list_and_search_show_only_allowed_counselors(db):
    _group(db, "a", disabled=[GIULIO, IRIDE])
    with _client(db, STUDENT) as client:
        assert sorted(row["id"] for row in client.get("/counselors").json()) == [CLIO, ANNA_PRIVATE]
        assert sorted(row["id"] for row in client.get("/counselors/public").json()) == [CLIO, ANNA_PRIVATE]
        found = client.post("/counselors/recommend", json={"query": "giulio iride"}).json()
        ids = {row["id"] for row in found["alternatives"]} | ({found["counselor"]["id"]} if found["counselor"] else set())
        assert ids <= {CLIO, ANNA_PRIVATE}
    with _client(db, TEACHER) as client:
        assert [row["id"] for row in client.get("/counselors").json()] == [CLIO, GIULIO, IRIDE]


def _mock_stream(*_args, **_kwargs):
    yield {"type": "delta", "text": "streamed reply"}


def test_chat_rejects_disallowed_counselor(db):
    _group(db, "a", disabled=[GIULIO])
    with _client(db, STUDENT) as client, patch.object(chat.AIService, "get_response") as reply, \
            patch.object(chat.AIService, "stream_response") as stream:
        for route in ("/chat", "/chat/stream"):
            response = client.post(route, json={"message": "Hi", "questionnaire_type": "QSA",
                                                "session_id": "s", "counselor_id": GIULIO})
            assert response.status_code == 403, response.text
            assert response.json() == {"detail": "counselor_disabled_for_class", "counselor_id": GIULIO}
        reply.assert_not_called()
        stream.assert_not_called()


@pytest.mark.parametrize("identity,counselor_id", [
    (STUDENT, CLIO), (STUDENT, None), (TEACHER, GIULIO),
])
def test_chat_allows_allowed_counselor(db, identity, counselor_id):
    _group(db, "a", disabled=[GIULIO], members=["anna", "prof"])
    with _client(db, identity) as client, \
            patch.object(chat.AIService, "get_response", return_value="plain reply"), \
            patch.object(chat.AIService, "stream_response", side_effect=_mock_stream):
        body = {"message": "Hi", "questionnaire_type": "QSA", "session_id": "s", "counselor_id": counselor_id}
        assert client.post("/chat", json=body).status_code == 200
        assert client.post("/chat/stream", json=body).status_code == 200


def _notebook(db):
    db.add(models.LearnerProfileRevision(username="anna", data={"goal": "Study"}, source="intake"))
    db.commit()


def test_account_preferences_reject_disallowed_counselor(db):
    _group(db, "a", disabled=[GIULIO])
    with _client(db, STUDENT) as client:
        assert client.put("/user/account-preferences", json={"counselor_id": GIULIO}).status_code == 422
        assert client.put("/user/account-preferences", json={"counselor_id": CLIO}).status_code == 200
        assert client.put("/user/account-preferences", json={"counselor_id": ANNA_PRIVATE}).status_code == 200
    assert db.get(models.AccountPreferences, "anna").counselor_id == ANNA_PRIVATE


def test_disallowed_account_counselor_falls_back_to_class_default(db):
    _notebook(db)
    db.add(models.AccountPreferences(username="anna", counselor_id=IRIDE, notebook_completed=True))
    db.commit()
    group = _group(db, "a", disabled=[IRIDE], default=CLIO)
    with _client(db, STUDENT) as client:
        state = client.get("/user/account-preferences").json()
        assert state["counselor_id"] == CLIO and state["counselor_ready"] is True
        # Completing setup without a counselor keeps the class default.
        assert client.put("/user/account-preferences", json={"complete_setup": True}).json()["counselor_id"] == CLIO
    # The stored choice is kept: leaving the class restores it.
    db.query(models.GroupMembership).filter_by(group_id=group.id).delete()
    db.get(models.AccountPreferences, "anna").counselor_id = IRIDE
    db.commit()
    with _client(db, STUDENT) as client:
        assert client.get("/user/account-preferences").json()["counselor_id"] == IRIDE


def test_disallowed_account_counselor_without_default_opens_the_selector(db):
    _notebook(db)
    db.add(models.AccountPreferences(username="anna", counselor_id=IRIDE, notebook_completed=True))
    db.commit()
    _group(db, "a", disabled=[IRIDE])
    with _client(db, STUDENT) as client:
        state = client.get("/user/account-preferences").json()
    assert state["counselor_id"] == IRIDE and state["counselor_ready"] is False
