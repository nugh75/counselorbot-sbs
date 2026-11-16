"""Class cover image, session memory read and removed /groups/info (#999). Synthetic data only."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, database, models
from backend.routes import groups, memory
from backend.tests.artifact_database import artifact_session


def _identity(username, **extra):
    return {"username": username, "email": f"{username}@example.test", "name": username,
            "authenticated": True, "is_admin": False, "groups": ["studenti"], **extra}


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(groups, "CLASS_IMAGES_STORAGE_DIR", str(tmp_path))
    with artifact_session() as db:
        group = models.StudentGroup(name="Synthetic 3B", code="SYN-999-3B", owner_username="teacher")
        db.add(group)
        db.commit()
        db.add_all([
            models.GroupMembership(group_id=group.id, username="anna", joined_via="web"),
            models.GroupShare(group_id=group.id, shared_with_username="coteacher", granted_by_username="teacher"),
        ])
        db.commit()
        (tmp_path / f"group_{group.id}.png").write_bytes(b"\x89PNG synthetic")
        identity = {}
        app = FastAPI()
        app.include_router(groups.router)
        app.include_router(memory.router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_user] = lambda: dict(identity)
        with TestClient(app) as client:
            yield client, db, identity, group


def _as(identity, username, **extra):
    identity.clear()
    identity.update(_identity(username, **extra))


@pytest.mark.parametrize("username,extra", [
    ("anna", {}), ("teacher", {}), ("coteacher", {}), ("root", {"is_admin": True}),
])
def test_cover_image_allowed_with_private_cache(api, username, extra):
    client, _, identity, group = api
    _as(identity, username, **extra)
    response = client.get(f"/groups/{group.id}/image")
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"].startswith("private")


def test_cover_image_denied_to_outsiders(api):
    client, _, identity, group = api
    _as(identity, "stranger")
    assert client.get(f"/groups/{group.id}/image").status_code == 404


def test_cover_image_requires_login():
    with artifact_session() as db:
        app = FastAPI()
        app.include_router(groups.router)
        app.dependency_overrides[database.get_db] = lambda: db
        assert TestClient(app).get("/groups/1/image").status_code in (401, 403)


def test_groups_info_is_removed(api):
    client, _, identity, group = api
    _as(identity, "stranger")
    assert client.get("/groups/info", params={"code": group.code}).status_code in (404, 405, 422)


def test_memory_read_only_for_owner(api):
    client, db, identity, _ = api
    db.add(models.MemorySessionOwner(session_id="cover-mem", username="anna"))
    db.commit()
    _as(identity, "anna")
    assert client.get("/memory/user/cover-mem").status_code == 200
    _as(identity, "bruno")
    assert client.get("/memory/user/cover-mem").status_code == 403
