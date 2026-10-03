"""Admin activation with persistent private keys and isolated PostgreSQL data."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

from cryptography.fernet import Fernet
from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from backend import auth, database, models, credential_storage
from backend import chatgpt_connections as accounts, chatgpt_responses as responses
from backend.routes import admin, chatgpt
from backend.tests.artifact_database import artifact_session
from backend.tests.test_chatgpt_subscription import connect, signed  # noqa: F401


@pytest.fixture
def local_settings(monkeypatch, tmp_path):
    for name in ("CHATGPT_ENABLED", "CHATGPT_CREDENTIAL_KEY", "CHATGPT_CREDENTIAL_KEY_FILE"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("CHATGPT_CREDENTIALS_DIR", str(tmp_path / "protected"))
    return tmp_path / "protected" / "credential.key"


def client_for(db, *, authenticated=True, administrator=True, researcher=False):
    app = FastAPI()
    app.include_router(chatgpt.router)
    app.include_router(admin.router)
    app.dependency_overrides[database.get_db] = lambda: db
    app.dependency_overrides[admin.get_db] = lambda: db
    app.dependency_overrides[auth.get_identity] = lambda: {
        "username": "fixture", "authenticated": authenticated,
        "is_admin": administrator, "is_researcher": researcher,
    }
    return TestClient(app)


def test_admin_activation_survives_restart_and_never_exposes_key(local_settings):
    with artifact_session() as db, client_for(db) as client:
        initial = client.get("/admin/chatgpt/settings")
        assert initial.json() == {"enabled": False, "ready": False, "reason": "notConfigured", "key_source": "managed"}
        assert not local_settings.exists()
        assert client.get("/user/chatgpt").json()["reason"] == "disabled"
        response = client.put("/admin/chatgpt/settings", headers={"X-Requested-With": "CounselorBot"}, json={"enabled": True})
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        assert response.json() == {"enabled": True, "ready": True, "reason": None, "key_source": "managed"}
        key = local_settings.read_bytes()
        assert len(key) == 44 and key.decode() not in response.text
        assert local_settings.stat().st_mode & 0o777 == 0o600
        assert local_settings.parent.stat().st_mode & 0o777 == 0o700
        assert len(list(local_settings.parent.iterdir())) == 1
        assert client.get("/user/chatgpt").json()["available"]
        assert client.post("/user/chatgpt/link", headers={"X-Requested-With": "CounselorBot"}).status_code == 200
        with Session(bind=db.get_bind(), join_transaction_mode="create_savepoint") as restarted:
            assert accounts.enabled(restarted)
            accounts.require_ready(restarted)
            assert accounts.cipher().decrypt(Fernet(key).encrypt(b"survives restart")) == b"survives restart"
        for active in (False, True, True):
            response = client.put("/admin/chatgpt/settings", headers={"X-Requested-With": "CounselorBot"}, json={"enabled": active})
            assert response.json()["enabled"] is active
            assert local_settings.read_bytes() == key


@pytest.mark.parametrize("authenticated,administrator,researcher,code", [
    (False, False, False, 401), (True, False, False, 403), (True, False, True, 403),
])
def test_only_real_admin_can_read_or_enable(local_settings, authenticated, administrator, researcher, code):
    with artifact_session() as db, client_for(db, authenticated=authenticated, administrator=administrator, researcher=researcher) as client:
        assert client.get("/admin/chatgpt/settings").status_code == code
        assert client.put("/admin/chatgpt/settings", headers={"X-Requested-With": "CounselorBot"}, json={"enabled": True}).status_code == code
        assert not local_settings.exists()
        assert not accounts.enabled(db)


def test_csrf_view_as_and_strict_payload_are_rejected(local_settings):
    with artifact_session() as db, client_for(db) as client:
        assert client.put("/admin/chatgpt/settings", json={"enabled": True}).status_code == 403
        assert client.get("/admin/chatgpt/settings", headers={"X-View-As": "demo"}).status_code == 403
        assert client.put("/admin/chatgpt/settings?view_as=demo", headers={"X-Requested-With": "CounselorBot"}, json={"enabled": True}).status_code == 403
        for payload in ({"enabled": "true"}, {"enabled": True, "credential_key": "secret-do-not-echo"}):
            response = client.put("/admin/chatgpt/settings", headers={"X-Requested-With": "CounselorBot"}, json=payload)
            assert response.status_code == 422 and "secret-do-not-echo" not in response.text
        assert not local_settings.exists()


def test_general_config_cannot_bypass_activation_or_expose_settings(local_settings):
    with artifact_session() as db, client_for(db) as client:
        accounts.set_installation_enabled(db, True)
        db.add(models.Config(key="chatgpt_credential_key", value="fixture-secret-never-public"))
        db.commit()
        response = client.get("/admin/config")
        assert response.status_code == 200
        assert "chatgpt_" not in response.text and "fixture-secret-never-public" not in response.text
        for key in ("chatgpt_enabled", "chatgpt_host_id", "chatgpt_credential_key"):
            response = client.post("/admin/config", json={"key": key, "value": "false", "description": "fixture"})
            assert response.status_code == 409
        assert accounts.enabled(db)


def test_admin_setting_precedes_environment_and_preserves_opted_in_grant(signed):
    with artifact_session() as db:
        credentials = connect(db, signed)
        row = db.query(models.ChatGPTConnection).one()
        row.catalog = [{"slug": "fixture-model", "display_name": "Fixture"}]
        db.commit()
        accounts.set_preference(db, "alice", True, "fixture-model")
        sealed = row.encrypted_credentials
        accounts.set_installation_enabled(db, False)
        assert accounts.preference(db) is None
        assert accounts.status(db, "alice")["reason"] == "disabled"
        with pytest.raises(accounts.ChatGPTError, match="disabled"):
            next(responses.stream(db, "fixture-model", "hello", "instructions"))
        assert accounts._credentials(row)["access_token"] == credentials["access_token"]
        assert row.encrypted_credentials == sealed and row.use_subscription
        accounts.set_installation_enabled(db, True)
        assert accounts.access_token(db) == credentials["access_token"]


def test_missing_key_with_existing_grants_requires_restore_not_regeneration(local_settings):
    with artifact_session() as db:
        accounts.set_installation_enabled(db, True)
        original = local_settings.read_bytes()
        sealed = accounts._seal({"refresh_token": "fixture"})
        db.add(models.ChatGPTConnection(username="alice", encrypted_credentials=sealed))
        db.commit()
        accounts.set_installation_enabled(db, False)
        local_settings.unlink()  # Simulate loss in this test's private directory.
        assert accounts.installation_status(db)["reason"] == "keyMissing"
        with pytest.raises(accounts.ChatGPTError, match="keyMissing"):
            accounts.set_installation_enabled(db, True)
        assert not local_settings.exists() and not accounts.enabled(db)
        local_settings.write_bytes(original)
        assert accounts.set_installation_enabled(db, True)["ready"]
        assert accounts._credentials(db.query(models.ChatGPTConnection).one())["refresh_token"] == "fixture"


def test_invalid_operator_key_is_not_replaced_by_an_automatic_key(local_settings, monkeypatch):
    with artifact_session() as db:
        monkeypatch.setenv("CHATGPT_CREDENTIAL_KEY", "invalid")
        with pytest.raises(accounts.ChatGPTError, match="notConfigured"):
            accounts.set_installation_enabled(db, True)
        assert not local_settings.exists() and not accounts.enabled(db)
        monkeypatch.setenv("CHATGPT_CREDENTIAL_KEY", Fernet.generate_key().decode())
        assert accounts.set_installation_enabled(db, True)["key_source"] == "environment"
        assert not local_settings.exists()


def test_storage_failure_does_not_enable_the_feature(local_settings, monkeypatch):
    with artifact_session() as db:
        monkeypatch.setattr(credential_storage.tempfile, "mkstemp", Mock(side_effect=PermissionError()))
        with pytest.raises(accounts.ChatGPTError, match="notConfigured"):
            accounts.set_installation_enabled(db, True)
        assert not local_settings.exists() and not accounts.enabled(db)


def test_concurrent_workers_publish_one_complete_key(local_settings):
    def worker(_):
        db = SimpleNamespace(no_autoflush=nullcontext(), query=lambda *args: SimpleNamespace(filter=lambda *args: SimpleNamespace(first=lambda: None)))
        accounts.prepare_key(db)
        return local_settings.read_bytes()
    with ThreadPoolExecutor(max_workers=8) as pool:
        keys = list(pool.map(worker, range(24)))
    assert len(set(keys)) == 1
    assert accounts.cipher().decrypt(Fernet(keys[0]).encrypt(b"same key")) == b"same key"
    assert list(local_settings.parent.iterdir()) == [local_settings]


def test_corrupt_managed_key_is_never_overwritten(local_settings):
    local_settings.parent.mkdir()
    local_settings.write_bytes(b"invalid-key")
    with artifact_session() as db:
        with pytest.raises(accounts.ChatGPTError, match="notConfigured"):
            accounts.set_installation_enabled(db, True)
        assert local_settings.read_bytes() == b"invalid-key" and not accounts.enabled(db)
