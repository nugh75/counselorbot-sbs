"""Per-class toggles for personal-area tools (#91, S4) on the Postgres test DB.

A class that disables a personal tool blocks its create/write routes with 403;
reads and exports of existing work stay available (decision 8). The always-on
keys are covered by test_class_settings.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, class_access, database, models
from backend.routes import flashcards, goals, idea_map, milestones, portfolio, pqbl, tavolo, visual_tools
from backend.tests.test_class_access import STUDENT, TEACHER, _assert_denied, _group, db  # noqa: F401
from backend.visual_tools import SavePersonalWorkspace, load_workspace, save_workspace

ROUTERS = (tavolo.router, goals.router, portfolio.router, pqbl.router, flashcards.router,
           milestones.router, visual_tools.router, idea_map.router)


def _client(db, identity):
    app = FastAPI()
    for router in ROUTERS:
        app.include_router(router)
    app.add_exception_handler(class_access.ToolAccessDenied, class_access.tool_access_denied_handler)
    app.dependency_overrides[database.get_db] = lambda: db
    for dependency in (auth.get_identity_view_as, auth.get_current_user, auth.get_identity):
        app.dependency_overrides[dependency] = lambda: identity
    return TestClient(app)


@pytest.fixture
def tables(db):
    db.add(models.Config(key=tavolo.FEATURE_KEY, value="true"))
    db.commit()
    return db


def test_personal_keys_follow_the_class_union(db):
    _group(db, "a", disabled=["tavolo", "pqbl"], members=["anna"])
    _group(db, "b", disabled=["tavolo"], members=["anna"])
    keys = set(class_access.resolve_access(db, STUDENT)["tool_keys"])
    assert "tavolo" not in keys
    assert {"pqbl", "goals", "notebook", "results", "classes", "assignments"} <= keys


def test_tavolo_writes_and_ai_help_are_blocked_reads_stay(tables):
    db = tables
    with _client(db, STUDENT) as client:
        created = client.post("/tavolo", json={"title": "Mine"})
        assert created.status_code == 200, created.text
        table = created.json()
    _group(db, "a", disabled=["tavolo"], members=["anna"])
    with _client(db, STUDENT) as client:
        _assert_denied(client.post("/tavolo", json={"title": "New"}), "tool_disabled_for_class", "tavolo")
        base = {"graph": table["graph"], "base_index": table["index"]}
        _assert_denied(client.put(f"/tavolo/{table['id']}", json=base), "tool_disabled_for_class", "tavolo")
        _assert_denied(client.patch(f"/tavolo/{table['id']}", json={"title": "Renamed"}), "tool_disabled_for_class", "tavolo")
        index = table["index"]
        for action, body in (("help", {"question": "Why?"}), ("suggest", {"intent": "more", "base_index": index}),
                             ("compose", {"prompt": "Map it", "base_index": index}),
                             ("settle", {"ids": ["n1"], "action": "accept", "base_index": index}),
                             ("save", {"title": "Kept"})):
            _assert_denied(client.post(f"/tavolo/{table['id']}/{action}", json=body), "tool_disabled_for_class", "tavolo")
        assert client.get("/tavolo").status_code == 200
        read = client.get(f"/tavolo/{table['id']}")
        assert read.status_code == 200 and read.json()["id"] == table["id"]
    with _client(db, TEACHER) as client:
        assert client.post("/tavolo", json={"title": "Staff"}).status_code == 200


def test_goal_writes_are_blocked_reads_and_pdf_stay(db):
    with _client(db, STUDENT) as client:
        created = client.post("/user/goals", json={"title": "Study plan"})
        assert created.status_code == 201, created.text
        goal = created.json()
    _group(db, "a", disabled=["goals"], members=["anna"])
    with _client(db, STUDENT) as client:
        _assert_denied(client.post("/user/goals", json={"title": "Another"}), "tool_disabled_for_class", "goals")
        _assert_denied(client.put(f"/user/goals/{goal['id']}", json={"title": "Edit", "revision": goal["revision"]}),
                       "tool_disabled_for_class", "goals")
        _assert_denied(client.post(f"/user/goals/{goal['id']}/actions", json={"title": "Do", "request_id": "req-00001",
                                                                              "revision": goal["revision"]}),
                       "tool_disabled_for_class", "goals")
        listed = client.get("/user/goals")
        assert listed.status_code == 200 and [row["id"] for row in listed.json()] == [goal["id"]]


def test_goal_action_also_needs_actions(db):
    with _client(db, STUDENT) as client:
        goal = client.post("/user/goals", json={"title": "Study plan"}).json()
    _group(db, "a", disabled=["actions"], members=["anna"])
    with _client(db, STUDENT) as client:
        _assert_denied(client.post(f"/user/goals/{goal['id']}/actions", json={"title": "Do", "request_id": "req-00001",
                                                                              "revision": goal["revision"]}),
                       "tool_disabled_for_class", "actions")
        assert client.put(f"/user/goals/{goal['id']}", json={"title": "Edit", "revision": goal["revision"]}).status_code == 200


def test_portfolio_create_and_edit_are_blocked_list_stays(db):
    with _client(db, STUDENT) as client:
        item = client.post("/user/portfolio", json={"title": "Essay"})
        assert item.status_code == 200, item.text
    _group(db, "a", disabled=["portfolio"], members=["anna"])
    with _client(db, STUDENT) as client:
        _assert_denied(client.post("/user/portfolio", json={"title": "New"}), "tool_disabled_for_class", "portfolio")
        _assert_denied(client.put(f"/user/portfolio/{item.json()['id']}", json={"title": "Edit"}),
                       "tool_disabled_for_class", "portfolio")
        _assert_denied(client.post("/user/timeline/portfolio", json={
            "revision": 0, "event_ids": ["e1"], "title": "Copy", "request_id": "req-1", "preview_hash": "0" * 64}), "tool_disabled_for_class", "portfolio")
        listed = client.get("/user/portfolio")
        assert listed.status_code == 200 and len(listed.json()) == 1


def test_pqbl_upload_session_and_answers_are_blocked(db):
    _group(db, "a", disabled=["pqbl"], members=["anna"])
    with _client(db, STUDENT) as client:
        _assert_denied(client.post("/pqbl/upload", files={"file": ("doc.pdf", b"%PDF-1.4", "application/pdf")}),
                       "tool_disabled_for_class", "pqbl")
        _assert_denied(client.post("/pqbl/sessions", json={"document_id": "doc"}), "tool_disabled_for_class", "pqbl")
        _assert_denied(client.post("/pqbl/sessions/s1/answer", json={"question_id": 1, "option_key": "a"}),
                       "tool_disabled_for_class", "pqbl")
        _assert_denied(client.post("/pqbl/sessions/s1/final-test", json={"answers": {}}),
                       "tool_disabled_for_class", "pqbl")
    with _client(db, TEACHER) as client:
        assert client.post("/pqbl/sessions", json={"document_id": "missing"}).status_code == 404


def test_flashcards_write_is_blocked_read_stays(db):
    _group(db, "a", disabled=["flashcards"], members=["anna"])
    with _client(db, STUDENT) as client:
        current = client.get("/user/flashcards")
        assert current.status_code == 200, current.text
        _assert_denied(client.put("/user/flashcards", json=current.json()), "tool_disabled_for_class", "flashcards")


def _workspace(db, **sections):
    state = load_workspace(db, None, "anna")
    state["workspace"].update(sections)
    return state


def test_shared_workspace_guards_only_the_changed_sections(db):
    card = {"id": "c1", "text": "Card", "bucket": "unsorted"}
    action = {"id": "a1", "title": "Act", "stage": "todo"}
    seeded = _workspace(db, cards=[card])
    save_workspace(db, None, "anna", SavePersonalWorkspace.model_validate(seeded))
    _group(db, "a", disabled=["cards", "timeline"], members=["anna"])
    with _client(db, STUDENT) as client:
        state = client.get("/user/timeline")
        assert state.status_code == 200 and state.json()["workspace"]["cards"][0]["id"] == "c1"
        body = {key: state.json()[key] for key in ("revision", "workspace")}
        # Untouched cards and timeline: saving an action is allowed.
        body["workspace"]["actions"] = [action]
        saved = client.put("/user/timeline", json=body)
        assert saved.status_code == 200, saved.text
        body = {key: saved.json()[key] for key in ("revision", "workspace")}
        body["workspace"]["cards"] = []
        _assert_denied(client.put("/user/timeline", json=body), "tool_disabled_for_class", "cards")
        body["workspace"]["cards"] = saved.json()["workspace"]["cards"]
        body["workspace"]["timeline"] = {"title": "Mine", "events": [
            {"id": "e1", "title": "Exam", "period": "2025-06", "tense": "past"}]}
        _assert_denied(client.put("/user/timeline", json=body), "tool_disabled_for_class", "timeline")
        _assert_denied(client.post("/user/timeline/milestones", json={
            "request_id": "req-00001", "title": "Done", "review": {}}), "tool_disabled_for_class", "timeline")
        assert client.get("/user/timeline/pdf").status_code == 200


def test_idea_map_to_portfolio_needs_portfolio(db):
    db.add(models.Config(key=idea_map.FEATURE_KEY, value="true"))
    _group(db, "a", disabled=["portfolio"], members=["anna"])
    with _client(db, STUDENT) as client:
        _assert_denied(client.post("/idea/map/portfolio", json={"session_id": "s1"}), "tool_disabled_for_class", "portfolio")
