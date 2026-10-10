"""Built-in guided paths («Percorsi guidati») as class path steps.

Synthetic PostgreSQL only. Without an instrument row these chats are not
toggleable, so class paths, templates and the access list offer them; an
instrument row, when present, decides as for any instrument.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, database, models
from backend.class_access import resolve_access
from backend.class_path_completion import GUIDED_CHAT_COMPLETED
from backend.routes import class_paths, path_templates
from backend.tests.artifact_database import artifact_session

TEACHER = dict(username="teacher", name="Teacher One", authenticated=True, is_admin=False, groups=["docenti"])
STUDENT = dict(username="alice", name="Alice", authenticated=True, is_admin=False, groups=[])


@pytest.fixture
def api():
    with artifact_session() as db:
        group = models.StudentGroup(name="Synthetic 4A", code="SYN-GP-4A", owner_username="teacher")
        db.add(group)
        db.flush()
        db.add(models.GroupMembership(group_id=group.id, username="alice"))
        db.commit()
        identity = dict(TEACHER)
        app = FastAPI()
        app.include_router(class_paths.router)
        app.include_router(path_templates.router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_identity] = lambda: dict(identity)
        with TestClient(app) as client:
            yield client, db, identity, group


def save_steps(client, group, steps):
    path = client.post(f"/teacher/groups/{group.id}/paths", json={"title": "Guided"}).json()
    return client.put(f"/teacher/paths/{path['id']}", json={
        "revision": path["revision"], "title": "Guided", "mode": "recommended", "steps": steps})


def test_builtin_guided_path_is_a_step_that_completes_with_its_guided_chat(api):
    client, db, identity, group = api
    saved = save_steps(client, group, [{"step_type": "tool", "tool_key": "SAVICKAS"}])
    assert saved.status_code == 200, saved.text
    step = saved.json()["steps"][0]
    assert step["auto_detect"] is True and step["availability_reason"] is None
    published = client.post(f"/teacher/paths/{saved.json()['id']}/publish")
    assert published.status_code == 200, published.text
    # Class students may start it: the access list and the server guard agree.
    assert "SAVICKAS" in resolve_access(db, STUDENT)["tool_keys"]
    identity.clear()
    identity.update(STUDENT)
    before = client.get("/user/paths").json()[0]
    assert before["done"] == 0 and before["steps"][0]["start_href"] == "/?start=SAVICKAS"
    db.add(models.Log(session_id="synthetic-gp", action=GUIDED_CHAT_COMPLETED, username="alice",
                      questionnaire_type="SAVICKAS", timestamp=datetime.now(timezone.utc) + timedelta(seconds=1)))
    db.commit()
    assert client.get("/user/paths").json()[0]["done"] == 1


def test_an_instrument_row_decides_for_a_guided_path(api):
    client, db, _identity, group = api
    db.add(models.Instrument(code="SAVICKAS", name_en="Career story", tool_category="guided",
                             target_audience="student", is_active=False))
    db.commit()
    assert save_steps(client, group, [{"step_type": "tool", "tool_key": "SAVICKAS"}]).status_code == 422
    assert "SAVICKAS" not in resolve_access(db, STUDENT)["tool_keys"]
    # Other built-in guided paths stay available, templates included.
    assert save_steps(client, group, [{"step_type": "tool", "tool_key": "EVENTO_STUDIO"}]).status_code == 200
    created = client.post("/teacher/path-templates", json={"title": "Reflect", "steps": [
        {"step_type": "tool", "tool_key": "EVENTO_STUDIO"}]})
    assert created.status_code == 201, created.text
    assert client.post("/teacher/path-templates", json={"title": "x", "steps": [
        {"step_type": "tool", "tool_key": "SAVICKAS"}]}).status_code == 422
