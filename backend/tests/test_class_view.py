"""Student view switcher (#146): full view or one class view, stored per account."""
from contextlib import contextmanager

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, class_access, database, models
from backend.routes import class_access as class_access_routes
from backend.tests.artifact_database import artifact_session

STUDENT = {"username": "anna", "groups": ["studenti"], "is_admin": False, "is_researcher": False, "authenticated": True}
TEACHER = {"username": "prof", "groups": ["docenti"], "is_admin": False, "is_researcher": False, "authenticated": True}

CLIO, GIULIO = 1, 2


@pytest.fixture
def db():
    with artifact_session() as session:
        session.add_all([
            models.Instrument(code="QSA", is_active=True, tool_category="assessment", target_audience="student"),
            models.Instrument(code="SAVICKAS", is_active=True, tool_category="guided", target_audience="student"),
            models.Instrument(code="OFF", is_active=False, tool_category="guided", target_audience="student"),
            models.Instrument(code="DOCENZA", is_active=True, tool_category="guided", target_audience="teacher"),
            models.Counselor(id=CLIO, name="Clio", slug="clio", language=["*"], is_active=True, sort_order=1),
            models.Counselor(id=GIULIO, name="Giulio", slug="giulio", language=["*"], is_active=True, sort_order=2),
        ])
        session.commit()
        yield session


def _group(db, name, *, disabled=(), counselors_off=(), members=("anna",), active=True):
    group = models.StudentGroup(code=f"GR-{name.upper()}", name=name, owner_username="prof", is_active=active)
    db.add(group)
    db.flush()
    db.add(models.ClassSettings(group_id=group.id, disabled_tool_keys=list(disabled),
                                disabled_counselor_ids=list(counselors_off), updated_by="prof"))
    for username in members:
        db.add(models.GroupMembership(group_id=group.id, username=username))
    db.commit()
    return group


def _set_view(db, value):
    prefs = db.get(models.AccountPreferences, "anna") or models.AccountPreferences(username="anna")
    prefs.class_view = value
    db.add(prefs)
    db.commit()


@contextmanager
def _client(db, identity):
    app = FastAPI()
    app.include_router(class_access_routes.router)

    def override_db():
        yield db

    app.dependency_overrides[database.get_db] = override_db
    app.dependency_overrides[auth.get_current_user] = lambda: identity
    with TestClient(app) as client:
        yield client


# --- Resolver ---------------------------------------------------------------

def test_default_is_the_class_view_with_the_class_list(db):
    first = _group(db, "Prima A", disabled=["QSA"])
    second = _group(db, "Seconda B", disabled=["QSA", "SAVICKAS"])
    access = class_access.resolve_access(db, STUDENT)
    assert access["view"] == "classes"
    assert access["restricted"] is True
    assert "QSA" not in access["tool_keys"] and "SAVICKAS" in access["tool_keys"], "union unchanged"
    assert access["classes"] == [{"id": second.id, "name": "Seconda B"}, {"id": first.id, "name": "Prima A"}]


def test_full_view_lifts_class_restrictions_but_not_admin_ones(db):
    group = _group(db, "a", disabled=["QSA", "tavolo"], counselors_off=[CLIO])
    _set_view(db, "all")
    access = class_access.resolve_access(db, STUDENT)
    assert access["view"] == "all"
    assert access["restricted"] is False
    assert {"QSA", "tavolo"} <= set(access["tool_keys"])
    assert "OFF" not in access["tool_keys"] and "DOCENZA" not in access["tool_keys"]
    assert access["counselor_ids"] is None and access["default_counselor_id"] is None
    assert access["class_ids"] == [group.id], "membership still listed for class path and forum"
    assert access["classes"] == [{"id": group.id, "name": "a"}]


def test_full_view_opens_the_server_guards(db):
    _group(db, "a", disabled=["QSA"], counselors_off=[CLIO])
    with pytest.raises(class_access.ToolAccessDenied):
        class_access.require_tool(db, STUDENT, "QSA")
    with pytest.raises(class_access.CounselorAccessDenied):
        class_access.require_counselor(db, STUDENT, CLIO)
    _set_view(db, "all")
    class_access.require_tool(db, STUDENT, "QSA")
    class_access.require_counselor(db, STUDENT, CLIO)
    assert class_access.allowed_counselor_ids(db, STUDENT) is None
    with pytest.raises(class_access.ToolAccessDenied):
        class_access.require_tool(db, STUDENT, "OFF")


def test_specific_class_view_uses_that_class_only(db):
    first = _group(db, "a", disabled=["QSA"], counselors_off=[CLIO])
    _group(db, "b", disabled=["SAVICKAS"], counselors_off=[GIULIO])
    _set_view(db, str(first.id))
    access = class_access.resolve_access(db, STUDENT)
    assert access["view"] == first.id
    assert access["restricted"] is True
    assert "QSA" not in access["tool_keys"] and "SAVICKAS" in access["tool_keys"]
    assert access["counselor_ids"] == [GIULIO]
    with pytest.raises(class_access.ToolAccessDenied):
        class_access.require_tool(db, STUDENT, "QSA")
    class_access.require_tool(db, STUDENT, "SAVICKAS")


def test_stale_class_choice_falls_back_to_the_class_view(db):
    left = _group(db, "old", disabled=["SAVICKAS"])
    _group(db, "a", disabled=["QSA"])
    _set_view(db, str(left.id))
    db.query(models.GroupMembership).filter_by(group_id=left.id).delete()
    db.commit()
    access = class_access.resolve_access(db, STUDENT)
    assert access["view"] == "classes"
    assert "QSA" not in access["tool_keys"] and "SAVICKAS" in access["tool_keys"]


def test_no_class_and_staff_have_no_selector(db):
    _set_view(db, "all")
    access = class_access.resolve_access(db, STUDENT)
    assert access["classes"] == [] and access["view"] == "classes" and access["restricted"] is False
    _group(db, "a", disabled=["QSA"], members=["prof"])
    staff = class_access.resolve_access(db, TEACHER)
    assert staff["classes"] == [] and staff["restricted"] is False


# --- PUT /user/access/view --------------------------------------------------

def test_put_view_stores_the_choice_and_returns_the_new_access(db):
    group = _group(db, "a", disabled=["QSA"])
    with _client(db, STUDENT) as client:
        body = client.put("/user/access/view", json={"view": "all"}).json()
        assert body["view"] == "all" and "QSA" in body["tool_keys"]
        assert db.get(models.AccountPreferences, "anna").class_view == "all"

        body = client.put("/user/access/view", json={"view": group.id}).json()
        assert body["view"] == group.id and "QSA" not in body["tool_keys"]

        body = client.put("/user/access/view", json={"view": "classes"}).json()
        assert body["view"] == "classes"
        assert db.get(models.AccountPreferences, "anna").class_view is None


def test_put_view_rejects_foreign_or_inactive_class_and_bad_values(db):
    _group(db, "a")
    foreign = _group(db, "x", members=["bob"])
    inactive = _group(db, "old", active=False)
    with _client(db, STUDENT) as client:
        for value in (foreign.id, inactive.id, "everything", None):
            response = client.put("/user/access/view", json={"view": value})
            assert response.status_code in (400, 422), (value, response.text)
    assert db.get(models.AccountPreferences, "anna") is None


def test_put_view_needs_a_class(db):
    with _client(db, STUDENT) as client:
        response = client.put("/user/access/view", json={"view": "all"})
    assert response.status_code == 400
    assert response.json()["detail"] == "no_class"
    _group(db, "a", members=["prof"])
    with _client(db, TEACHER) as client:
        assert client.put("/user/access/view", json={"view": "all"}).status_code == 400


# --- Telegram (#94) -----------------------------------------------------------

def test_telegram_counselor_keyboard_follows_the_stored_view(db):
    from backend import telegram_state

    _group(db, "a", counselors_off=[CLIO])

    def keyboard():
        buttons = [b["callback_data"] for row in telegram_state._counselor_keyboard(db, "it", "anna") for b in row]
        return [data for data in buttons if data != "couns:0"]  # couns:0 = account default

    assert keyboard() == [f"couns:{GIULIO}"]
    _set_view(db, "all")
    assert keyboard() == [f"couns:{CLIO}", f"couns:{GIULIO}"]
