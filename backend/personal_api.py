"""Account-owned AI connections, separate from environment-owned system keys."""
import json
import os

from cryptography.fernet import Fernet, InvalidToken

from . import models
from .api_secrets import API_KEY_ENV_MAP

POLICY_KEY = "personal_api_enabled"
# Internal gateways and arbitrary endpoints must never receive personal keys.
PROVIDERS = tuple(provider for provider in API_KEY_ENV_MAP if provider != "omniroute")


class PersonalAPIError(ValueError):
    pass


def cipher() -> Fernet:
    try:
        key = os.environ.get("PERSONAL_API_ENCRYPTION_KEY", "").strip()
        return Fernet(key.encode("ascii"))
    except (ValueError, UnicodeError) as exc:
        raise PersonalAPIError("Personal API credential storage is unavailable") from exc


def encryption_ready() -> bool:
    try:
        cipher()
        return True
    except PersonalAPIError:
        return False


def feature_enabled(db) -> bool:
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
    row = db.query(models.PersonalAPISettings).filter_by(username=username).first()
    return row if row and row.enabled else None
