"""Account-owned AI connections, separate from environment-owned system keys."""
import json

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert

from . import models
from .api_secrets import API_KEY_ENV_MAP
from .credential_storage import CredentialStore, CredentialStorageError

POLICY_KEY = "personal_api_enabled"
# Internal gateways and arbitrary endpoints must never receive personal keys.
PROVIDERS = tuple(provider for provider in API_KEY_ENV_MAP if provider != "omniroute")
storage = CredentialStore("PERSONAL_API", "personal_api_credentials", "PERSONAL_API_ENCRYPTION_KEY")


class PersonalAPIError(ValueError):
    def __init__(self, message, code="notConfigured"):
        self.code = code
        super().__init__(message)


def cipher() -> Fernet:
    try:
        return storage.cipher()
    except CredentialStorageError as exc:
        raise PersonalAPIError("Personal API credential storage is unavailable", exc.code) from None


def _has_credentials(db):
    with db.no_autoflush:
        return db.query(models.PersonalAPISettings).first() is not None


def installation_status(db):
    status = storage.status(lambda: _has_credentials(db))
    return {"enabled": feature_enabled(db), "encryption_ready": status.pop("ready"), **status}


def set_installation_enabled(db, enabled):
    db.execute(insert(models.Config).values(key=POLICY_KEY, value="false", description="Personal API connections enabled")
               .on_conflict_do_nothing(index_elements=["key"]))
    setting = db.query(models.Config).filter_by(key=POLICY_KEY).with_for_update().one()
    if enabled:
        try:
            storage.prepare(lambda: _has_credentials(db))
        except CredentialStorageError as exc:
            raise PersonalAPIError("Personal API credential storage is unavailable", exc.code) from None
    setting.value = "true" if enabled else "false"
    db.commit()
    return installation_status(db)


def lock_choice(db, username):
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext('counselorbot-personal-ai'), hashtext(:username))"),
               {"username": username})


def encryption_ready() -> bool:
    try:
        cipher()
        return True
    except PersonalAPIError:
        return False


def feature_enabled(db) -> bool:
    with db.no_autoflush:
        row = db.query(models.Config).filter(models.Config.key == POLICY_KEY).first()
    return bool(row and row.value == "true")


def encrypt_key(username: str, provider: str, key: str) -> str:
    # Bind ciphertext to its account and provider to reject swapped DB records.
    payload = json.dumps({"username": username, "provider": provider, "key": key})
    return cipher().encrypt(payload.encode()).decode()


def decrypt_key(row) -> str:
    try:
        payload = json.loads(cipher().decrypt(row.encrypted_key.encode()))
        if payload["username"] != row.username or payload["provider"] != row.provider:
            raise ValueError("Credential owner mismatch")
        key = payload["key"]
        if not isinstance(key, str) or not key:
            raise ValueError("Empty credential")
        return key
    except (InvalidToken, ValueError, KeyError, TypeError) as exc:
        raise PersonalAPIError("Personal API credential cannot be read; save the key again") from exc


def active_settings(db, username):
    if not username or not feature_enabled(db):
        return None
    from .auth import VIEW_AS_DEMO_ACCOUNTS
    if username in VIEW_AS_DEMO_ACCOUNTS:
        return None
    with db.no_autoflush:
        row = db.query(models.PersonalAPISettings).filter_by(username=username).first()
    return row if row and row.enabled else None
