"""Settings API behavior on the isolated Postgres test database."""
import pytest
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from backend import auth, database, models
from backend.routes import groups
from backend.tests.artifact_database import artifact_session


@pytest.fixture
def settings_api():
    with artifact_session() as db:
        group = models.StudentGroup(code="GR-C1TEST", name="Synthetic class", owner_username="owner")
        db.add(group)
        db.add_all([
            models.Instrument(code="QSA", name_en="Learning strategies", is_active=True, tool_category="assessment"),
            models.Instrument(code="DYNAMIC", name_i18n={"en": "Dynamic chat"}, is_active=True),
            models.Instrument(code="OFF", name_en="Platform disabled", is_active=False),
            models.Instrument(code="TEACHER", target_audience="teacher", is_active=True),
        ])
        db.commit()
        identity = {"username": "owner", "groups": ["docenti"], "is_admin": False, "is_researcher": False, "authenticated": True}
        app = FastAPI()
        app.include_router(groups.router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        with TestClient(app) as client:
            yield client, db, group.id, identity


def test_absent_settings_enable_all_and_include_only_student_instruments(settings_api):
    client, db, group_id, _ = settings_api
    response = client.get(f"/teacher/groups/{group_id}/settings")
    assert response.status_code == 200
    body = response.json()
    assert body["revision"] == 1
    assert body["disabled_tool_keys"] == []
    tools = {row["key"]: row for row in body["tools"]}
    assert {"QSA", "DYNAMIC", "OFF", "tavolo", "bussola", "assistant"} <= tools.keys()
    assert "TEACHER" not in tools
    assert tools["QSA"]["enabled"] is True
    assert tools["OFF"]["admin_enabled"] is False
    assert tools["OFF"]["enabled"] is False
    assert {row["key"] for row in body["tools"] if row["always_on"]} == {"notebook", "results", "classes", "assignments"}
    assert body["default_counselor_id"] is None
    assert body["forum"] == {"students_can_open": False, "premoderation": False}
    assert db.query(models.ClassSettings).count() == 0, "GET must not create settings"


def test_save_is_explicit_and_stale_revision_does_not_overwrite(settings_api):
    client, db, group_id, _ = settings_api
    path = f"/teacher/groups/{group_id}/settings"
    payload = {"revision": 1, "disabled_tool_keys": ["QSA", "tavolo"]}
    saved = client.put(path, json=payload)
    assert saved.status_code == 200
    assert saved.json()["revision"] == 2
    assert saved.json()["disabled_tool_keys"] == ["QSA", "tavolo"]
    assert client.put(path, json={**payload, "disabled_tool_keys": []}).status_code == 409
    persisted = client.get(path).json()
    assert persisted["disabled_tool_keys"] == ["QSA", "tavolo"]
    assert persisted["revision"] == 2
    row = db.get(models.ClassSettings, group_id)
    assert row.updated_by == "owner"
    assert row.locked_tool_keys == row.locked_counselor_ids == row.locked_forum_options == {}


@pytest.mark.parametrize("role", ["owner", "co-teacher", "admin", "other-teacher", "student"])
def test_read_and_write_permissions(settings_api, role):
    client, db, group_id, identity = settings_api
    db.add(models.GroupShare(group_id=group_id, shared_with_username="co-teacher", granted_by_username="owner"))
    db.commit()
    identity.update(username=role, is_admin=role == "admin", groups=["studenti" if role == "student" else "docenti"])
    expected = 200 if role in {"owner", "co-teacher", "admin"} else 403
    path = f"/teacher/groups/{group_id}/settings"
    assert client.get(path).status_code == expected
    assert client.put(path, json={"revision": 1, "disabled_tool_keys": []}).status_code == expected


@pytest.mark.parametrize("key", ["unknown", "notebook", "results", "classes", "assignments", "TEACHER"])
def test_invalid_or_always_on_tool_cannot_be_disabled(settings_api, key):
    client, _, group_id, _ = settings_api
    path = f"/teacher/groups/{group_id}/settings"
    assert client.put(path, json={"revision": 1, "disabled_tool_keys": [key]}).status_code == 422
    assert client.get(path).json()["revision"] == 1


def test_dynamic_instruments_added_after_save_are_enabled(settings_api):
    client, db, group_id, _ = settings_api
    path = f"/teacher/groups/{group_id}/settings"
    assert client.put(path, json={"revision": 1, "disabled_tool_keys": ["DYNAMIC"]}).status_code == 200
    db.add(models.Instrument(code="LATER", is_active=True, target_audience="student"))
    db.commit()
    tools = {row["key"]: row for row in client.get(path).json()["tools"]}
    assert tools["DYNAMIC"]["enabled"] is False
    assert tools["LATER"]["enabled"] is True


def test_reserved_personal_keys_cannot_be_shadowed_by_instrument_codes(settings_api):
    client, db, group_id, _ = settings_api
    db.add_all([models.Instrument(code="notebook", is_active=True), models.Instrument(code="tavolo", is_active=False)])
    db.commit()
    path = f"/teacher/groups/{group_id}/settings"
    assert client.put(path, json={"revision": 1, "disabled_tool_keys": ["notebook"]}).status_code == 422
    body = client.get(path).json()
    assert len([row for row in body["tools"] if row["key"] == "notebook"]) == 1
    table = [row for row in body["tools"] if row["key"] == "tavolo"]
    assert len(table) == 1
    assert table[0]["kind"] == "personal" and table[0]["admin_enabled"] is True


def test_counselor_validation_and_tools_only_save_preserves_other_settings(settings_api):
    client, db, group_id, _ = settings_api
    enabled = models.Counselor(slug="active", name="Active", is_active=True)
    disabled = models.Counselor(slug="inactive", name="Inactive", is_active=False)
    private = models.Counselor(slug="private", name="Private", owner_username="owner")
    db.add_all([enabled, disabled, private])
    db.commit()
    path = f"/teacher/groups/{group_id}/settings"
    for changes in [{"default_counselor_id": private.id}, {"default_counselor_id": disabled.id},
                    {"default_counselor_id": enabled.id, "disabled_counselor_ids": [enabled.id]},
                    {"disabled_counselor_ids": [private.id]}, {"disabled_counselor_ids": [987654]}]:
        assert client.put(path, json={"revision": 1, "disabled_tool_keys": [], **changes}).status_code == 422
    assert client.put(path, json={"revision": 1, "disabled_tool_keys": [],
                                  "default_counselor_id": enabled.id, "disabled_counselor_ids": [disabled.id]}).status_code == 200
    saved = client.put(path, json={"revision": 2, "disabled_tool_keys": ["QSA"]}).json()
    assert saved["default_counselor_id"] == enabled.id
    assert saved["disabled_counselor_ids"] == [disabled.id]
    assert {row["id"] for row in saved["counselors"]} == {enabled.id, disabled.id}
    assert all(row["approach_categories"] == [] for row in saved["counselors"])


@pytest.mark.parametrize("changes", [{"forum": {"students_can_open": True}},
                                     {"locked_tool_keys": {"QSA": {"enabled": True}}}])
def test_future_forum_and_lock_writes_are_not_accepted(settings_api, changes):
    client, _, group_id, _ = settings_api
    assert client.put(f"/teacher/groups/{group_id}/settings", json={
        "revision": 1, "disabled_tool_keys": [], **changes,
    }).status_code == 422


@pytest.mark.parametrize("existing", [False, True])
def test_concurrent_saves_have_one_winner_even_before_first_settings_row(existing):
    """Independent committed connections exercise the real Postgres row lock."""
    url = os.environ['DATABASE_URL']
    assert database.engine.url.database == 'counselorbot_test'
    schema = 'c1_settings_' + uuid.uuid4().hex
    root = create_engine(url)
    scoped = create_engine(url, connect_args={'options': f'-csearch_path={schema}'})
    try:
        with root.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        models.Base.metadata.create_all(scoped)
        with Session(scoped) as db:
            group = models.StudentGroup(code='GR-RACE', name='Synthetic race', owner_username='owner')
            db.add(group); db.flush()
            group_id = group.id
            if existing:
                db.add(models.ClassSettings(group_id=group_id, updated_by='owner'))
            db.commit()

        def test_db():
            with Session(scoped) as db:
                yield db

        app = FastAPI()
        app.include_router(groups.router)
        app.dependency_overrides[database.get_db] = test_db
        app.dependency_overrides[auth.get_current_user] = lambda: {
            'username': 'owner', 'groups': ['docenti'], 'is_admin': False, 'authenticated': True,
        }
        path = f'/teacher/groups/{group_id}/settings'
        with TestClient(app) as client:
            start = Barrier(2)
            def save(key):
                # Separate clients have independent event loops, as multiple
                # backend workers do; a shared loop would serialize sync SQL.
                with TestClient(app) as writer:
                    start.wait(timeout=10)
                    return writer.put(path, json={'revision': 1, 'disabled_tool_keys': [key]})

            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(save, ['tavolo', 'goals']))
            assert sorted(response.status_code for response in results) == [200, 409]
            winner = next(response.json() for response in results if response.status_code == 200)
            latest = client.get(path).json()
            assert latest['disabled_tool_keys'] == winner['disabled_tool_keys']
            assert latest['revision'] == 2
    finally:
        scoped.dispose()
        with root.begin() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        root.dispose()
