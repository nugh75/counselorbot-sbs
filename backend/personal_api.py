"""Account-owned AI connections, separate from environment-owned system keys."""
import json

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert

from . import models
from .api_secrets import API_KEY_ENV_MAP
from .credential_storage import CredentialStore, CredentialStorageError

POLICY_KEY = "personal_api_enabled"
CONNECTION_ERROR_CODES = frozenset("personalAPI.errors." + reason for reason in (
    "authentication", "modelUnavailable", "quota", "rateLimit", "privacy",
    "invalidRequest", "connection", "configuration", "counselor",
))
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
        return (db.query(models.PersonalAPISettings).first() is not None or
                db.query(models.PersonalAPIConnection).first() is not None)


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


def encrypt_key(username: str, provider: str, key: str, connection_id: str | None = None) -> str:
    # Bind ciphertext to its account and provider to reject swapped DB records.
    data = {"username": username, "provider": provider, "key": key}
    if connection_id:
        data["connection_id"] = connection_id
    payload = json.dumps(data)
    return cipher().encrypt(payload.encode()).decode()


def decrypt_key(row) -> str:
    try:
        payload = json.loads(cipher().decrypt(row.encrypted_key.encode()))
        if payload["username"] != row.username or payload["provider"] != row.provider:
            raise ValueError("Credential owner mismatch")
        if "connection_id" in payload and payload["connection_id"] != getattr(row, "id", None):
            raise ValueError("Credential connection mismatch")
        key = payload["key"]
        if not isinstance(key, str) or not key:
            raise ValueError("Empty credential")
        return key
    except (InvalidToken, ValueError, KeyError, TypeError) as exc:
        raise PersonalAPIError("Personal API credential cannot be read; save the key again") from exc


def active_settings(db, username, counselor_id=None):
    if not username or not feature_enabled(db):
        return None
    from .auth import VIEW_AS_DEMO_ACCOUNTS
    if username in VIEW_AS_DEMO_ACCOUNTS:
        return None
    with db.no_autoflush:
        routing = db.get(models.PersonalAIRouting, username)
        if routing is not None:
            if not routing.enabled:
                return None
            cid = routing.default_connection_id
            if counselor_id is not None:
                binding = db.get(models.PersonalCounselorConnection, (username, counselor_id))
                if binding:
                    cid = binding.connection_id
            return db.query(models.PersonalAPIConnection).filter_by(id=cid, username=username).first() if cid else None
        row = db.query(models.PersonalAPISettings).filter_by(username=username).first()
    if not row or not row.enabled:
        return None
    return row


def migrate_legacy_connections(db, username=None):
    """One-time copy, preserving ciphertext, activation and account-wide model."""
    import hashlib
    query = db.query(models.PersonalAPISettings)
    if username:
        query = query.filter_by(username=username)
    for legacy in query:
        lock_choice(db, legacy.username)
        if db.get(models.PersonalAIRouting, legacy.username) is not None:
            continue
        cid = hashlib.sha256(("legacy:" + legacy.username).encode()).hexdigest()[:32]
        db.add(models.PersonalAPIConnection(id=cid, username=legacy.username, name=legacy.provider,
                    provider=legacy.provider, model_name=legacy.model_name, encrypted_key=legacy.encrypted_key))
        db.flush()
        db.add(models.PersonalAIRouting(username=legacy.username, enabled=legacy.enabled, default_connection_id=cid))
        db.flush()


def ensure_schema(connection):
    """Run before prompt snapshots can query an upgraded Counselor model."""
    connection.execute(text("ALTER TABLE counselors ADD COLUMN IF NOT EXISTS owner_username VARCHAR"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_counselors_owner_username ON counselors(owner_username)"))
    connection.execute(text("ALTER TABLE pqbl_documents ADD COLUMN IF NOT EXISTS counselor_id INTEGER"))


def bind_counselor(db, counselor_id):
    db.info["personal_ai_counselor_id"] = counselor_id


def visible_counselors(db, username=None):
    """Institution counselors plus this owner's private counselors when enabled."""
    from sqlalchemy import or_
    if username is None:
        from .chatgpt_connections import owner
        username = owner(db)
    from .auth import VIEW_AS_DEMO_ACCOUNTS
    query = db.query(models.Counselor)
    shared = models.Counselor.owner_username.is_(None)
    if username and username not in VIEW_AS_DEMO_ACCOUNTS and feature_enabled(db):
        return query.filter(or_(shared, models.Counselor.owner_username == username))
    return query.filter(shared)


def visible_counselor(db, counselor_id, username=None):
    return visible_counselors(db, username).filter_by(id=counselor_id, is_active=True).first()


def require_visible_counselor(db, counselor_id, username=None):
    row = visible_counselor(db, counselor_id, username)
    if row is None:
        candidate = db.get(models.Counselor, counselor_id)
        if candidate and candidate.owner_username:
            from fastapi import HTTPException
            raise HTTPException(404, "Counselor not found")
    return row


def connection_error_code(exc):
    """Classify provider failures without exposing upstream text or request data."""
    code = getattr(exc, "code", None)
    if isinstance(code, str) and code in CONNECTION_ERROR_CODES:
        return code
    status = getattr(exc, "status_code", None)
    body = getattr(exc, "body", None)
    detail = body.get("error", body) if isinstance(body, dict) else {}
    if not isinstance(detail, dict):
        detail = {}
    provider_code = str(detail.get("code", "")).lower()
    message = str(detail.get("message", "")).lower()
    if status in (401, 403):
        reason = "authentication"
    elif status == 402 or "insufficient_quota" in provider_code or "quota" in message or "daily limit" in message:
        reason = "quota"
    elif status == 404 or provider_code == "model_not_found" or "no endpoints" in message:
        reason = "modelUnavailable"
    elif status == 429:
        reason = "rateLimit"
    elif status in (400, 422):
        reason = "invalidRequest"
    else:
        reason = "connection"
    return "personalAPI.errors." + reason
