"""Administrative setup, ownership and coexistence without real provider calls."""
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from backend import auth, models, personal_api
from backend import chatgpt_connections as accounts
from backend.ai_service import AIService, AIError
from backend.tests.test_personal_api import db, client, identity, save  # noqa: F401
from backend.tests.test_chatgpt_subscription import connect, signed  # noqa: F401


@pytest.fixture
def managed(db, monkeypatch):
    monkeypatch.delenv("PERSONAL_API_ENCRYPTION_KEY", raising=False)
    monkeypatch.delenv("PERSONAL_API_ENCRYPTION_KEY_FILE", raising=False)
    setting = db.query(models.Config).filter_by(key=personal_api.POLICY_KEY).one()
    setting.value = "false"
    db.commit()
    return personal_api.storage.path()


def test_admin_creates_private_persistent_key_without_server_setup(client, db, managed):
    client.actor["identity"] = identity("admin", is_admin=True)
    assert not managed.exists()
    state = client.get("/admin/personal-api-policy").json()
    assert state == {"enabled": False, "encryption_ready": False, "reason": "notConfigured", "key_source": "managed"}
    response = client.put("/admin/personal-api-policy", json={"enabled": True})
    assert response.status_code == 200 and response.json()["encryption_ready"]
    assert response.headers["cache-control"] == "no-store"
    assert managed.stat().st_mode & 0o777 == 0o600
    assert managed.parent.stat().st_mode & 0o777 == 0o700
    original = managed.read_bytes()
    assert original.decode() not in response.text
    client.actor["identity"] = identity()
    assert save(client).json()["active"]
    sealed = db.query(models.PersonalAPISettings).one().encrypted_key
    with Session(bind=db.get_bind(), join_transaction_mode="create_savepoint") as restarted:
        assert personal_api.feature_enabled(restarted)
        assert personal_api.decrypt_key(restarted.query(models.PersonalAPISettings).one()) == "personal-test-key"
    client.actor["identity"] = identity("admin", is_admin=True)
    for enabled in (False, True, True):
        response = client.put("/admin/personal-api-policy", json={"enabled": enabled})
        assert response.status_code == 200 and response.json()["enabled"] is enabled
        assert managed.read_bytes() == original
        assert db.query(models.PersonalAPISettings).one().encrypted_key == sealed


def test_missing_key_is_not_regenerated_for_existing_credentials(client, db, managed):
    personal_api.set_installation_enabled(db, True)
    assert save(client).status_code == 200
    original = managed.read_bytes()
    personal_api.set_installation_enabled(db, False)
    managed.unlink()  # Only this fixture's private directory.
    client.actor["identity"] = identity("admin", is_admin=True)
    assert client.get("/admin/personal-api-policy").json()["reason"] == "keyMissing"
    response = client.put("/admin/personal-api-policy", json={"enabled": True})
    assert response.status_code == 409 and response.json()["detail"] == "personalAPI.errors.keyMissing"
    assert not managed.exists() and not personal_api.feature_enabled(db)
    managed.write_bytes(original)
    assert client.put("/admin/personal-api-policy", json={"enabled": True}).json()["encryption_ready"]


def test_invalid_override_does_not_get_replaced(client, db, managed, monkeypatch):
    monkeypatch.setenv("PERSONAL_API_ENCRYPTION_KEY", "invalid-fixture")
    client.actor["identity"] = identity("admin", is_admin=True)
    assert client.put("/admin/personal-api-policy", json={"enabled": True}).status_code == 409
    assert not managed.exists() and not personal_api.feature_enabled(db)
    assert client.put("/admin/personal-api-policy", json={"enabled": False}).status_code == 200


def test_legacy_environment_key_remains_usable(client, db, managed, monkeypatch):
    key = Fernet.generate_key().decode()
    monkeypatch.setenv("PERSONAL_API_ENCRYPTION_KEY", key)
    client.actor["identity"] = identity("admin", is_admin=True)
    response = client.put("/admin/personal-api-policy", json={"enabled": True})
    assert response.json()["key_source"] == "environment" and key not in response.text
    assert not managed.exists()
    client.actor["identity"] = identity()
    assert save(client).status_code == 200
    assert personal_api.decrypt_key(db.query(models.PersonalAPISettings).one()) == "personal-test-key"


def test_concurrent_key_preparation_publishes_one_complete_key(managed):
    def prepare(_):
        personal_api.storage.prepare(lambda: False)
        return managed.read_bytes()
    with ThreadPoolExecutor(max_workers=6) as executor:
        keys = list(executor.map(prepare, range(6)))
    assert len(set(keys)) == 1
    Fernet(keys[0])
    assert len(list(managed.parent.iterdir())) == 1


def test_csrf_preview_and_validation_cannot_expose_or_change_credentials(client, db, managed):
    client.actor["identity"] = identity("admin", is_admin=True)
    assert client.put("/admin/personal-api-policy", json={"enabled": True}, headers={"X-Requested-With": ""}).status_code == 403
    for target in ("/admin/personal-api-policy", "/user/api-settings"):
        assert client.get(target, headers={"X-View-As": "demo"}).status_code == 403
        assert client.get(target + "?view_as=demo").status_code == 403
    for payload in ({"enabled": "true"}, {"enabled": True, "key": "fixture-secret"}):
        result = client.put("/admin/personal-api-policy", json=payload)
        assert result.status_code == 422 and "fixture-secret" not in result.text
    result = save(client, api_key={"unexpected": "fixture-secret"})
    assert result.status_code == 422 and "fixture-secret" not in result.text
    assert not managed.exists()
    client.actor["identity"] = {"authenticated": False}
    assert client.get("/user/api-settings").status_code == 401


def test_selecting_one_personal_mode_deactivates_the_other_without_erasing_keys(client, db, signed):
    assert save(client).status_code == 200
    personal = db.query(models.PersonalAPISettings).one()
    sealed_api = personal.encrypted_key
    connect(db, signed)
    chatgpt = db.query(models.ChatGPTConnection).one()
    chatgpt.catalog = [{"slug": "fixture-model", "display_name": "Fixture"}]
    db.commit()
    sealed_chatgpt = chatgpt.encrypted_credentials
    accounts.set_preference(db, "alice", True, "fixture-model")
    assert chatgpt.use_subscription and not personal.enabled
    assert AIService(db)._targets("ollama", "ignored") == [("openai_chatgpt", "fixture-model")]
    assert save(client).status_code == 200
    assert personal.enabled and not chatgpt.use_subscription
    assert personal.encrypted_key != "personal-test-key"
    assert chatgpt.encrypted_credentials == sealed_chatgpt
    assert personal_api.cipher().decrypt(sealed_api.encode()) == personal_api.cipher().decrypt(personal.encrypted_key.encode())
    assert AIService(db)._targets("ollama", "ignored") == [("openai", "own-model")]


def test_ambiguous_legacy_selection_never_spends_either_account(client, db, signed):
    save(client)
    connect(db, signed)
    row = db.query(models.ChatGPTConnection).one()
    row.preferred_model, row.use_subscription = "fixture-model", True
    db.commit()
    service = AIService(db)
    with pytest.raises(AIError, match="Choose one personal mode"):
        service._targets("openai", "system-model")


def test_nested_services_use_bound_caller_instead_of_resource_owner(client, db):
    save(client)
    client.actor["identity"] = identity("bob")
    save(client, api_key="bob-fixture-key", model="bob-model")
    accounts.bind_identity(db, identity("bob"))
    service = AIService(db, username="alice")
    assert service.personal_target == ("openai", "bob-model")
    assert service.config["api_key_openai"] == "bob-fixture-key"
    accounts.bind_identity(db, {"authenticated": False})
    assert AIService(db, username="alice").personal_target is None
    demo = next(iter(auth.VIEW_AS_DEMO_ACCOUNTS))
    accounts.bind_identity(db, identity(demo))
    assert AIService(db, username="alice").personal_target is None


def test_policy_checks_do_not_flush_pending_application_writes(client, db):
    save(client)
    accounts.bind_identity(db, identity())
    pending = models.Config(key="pending-fixture", value="not-committed")
    db.add(pending)
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(db, "flush", Mock(side_effect=AssertionError("unexpected flush")))
        assert personal_api.feature_enabled(db)
        assert personal_api.active_settings(db, "alice")
        assert personal_api.installation_status(db)["encryption_ready"]
    db.expunge(pending)
