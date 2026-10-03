"""Official SIWC credentials: user ownership, encryption and serialized renewal.

Endpoints and issuer are fixed. Nothing here accepts a provider URL or a user
identity from the local helper. Credentials never leave the backend in a reply.
"""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import os
import secrets
import threading
import time
import uuid

from cryptography.fernet import Fernet, InvalidToken
import httpx
from jose import jwt, JWTError
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from . import models
from .credential_storage import CredentialStore, CredentialStorageError

ISSUER = "https://auth.openai.com"
RESOURCE = "https://api.openai.com/v1"
TOKEN_URL = ISSUER + "/api/accounts/oauth/token"
JWKS_URL = ISSUER + "/.well-known/jwks.json"
DISCOVERY_URL = ISSUER + "/.well-known/openid-configuration"
DIRECT_SCOPE = "chatgpt.tokens.use.direct"
_jwks = None
_jwks_time = 0
_jwks_lock = threading.Lock()
storage = CredentialStore("CHATGPT", "chatgpt_credentials")


class ChatGPTError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__("chatgpt.errors." + code)


def enabled(db=None):
    if db is not None:
        # Checking a flag must not flush a caller's pending chat/score writes.
        with db.no_autoflush:
            setting = db.query(models.Config).filter_by(key="chatgpt_enabled").first()
        if setting is not None:
            return setting.value == "true"
    return os.getenv("CHATGPT_ENABLED", "false").lower() in {"1", "true", "yes"}


def managed_key_path():
    return storage.path()


def cipher():
    try:
        return storage.cipher()
    except CredentialStorageError as exc:
        raise ChatGPTError(exc.code) from None


def _has_credentials(db):
    with db.no_autoflush:
        return db.query(models.ChatGPTConnection).filter(models.ChatGPTConnection.encrypted_credentials.isnot(None)).first() is not None


def prepare_key(db):
    try:
        storage.prepare(lambda: _has_credentials(db))
    except CredentialStorageError as exc:
        raise ChatGPTError(exc.code) from None


def installation_status(db):
    return {"enabled": enabled(db), **storage.status(lambda: _has_credentials(db))}


def set_installation_enabled(db, active):
    db.execute(insert(models.Config).values(key="chatgpt_enabled", value="false", description="Personal ChatGPT connections enabled")
               .on_conflict_do_nothing(index_elements=["key"]))
    setting = db.query(models.Config).filter_by(key="chatgpt_enabled").with_for_update().one()
    if active:
        prepare_key(db)
    setting.value = "true" if active else "false"
    db.commit()
    return installation_status(db)


def require_ready(db=None):
    if not enabled(db):
        raise ChatGPTError("disabled")
    cipher()


def bind_identity(db, identity, language="it"):
    """Propagate only the already-authenticated identity to nested AI calls."""
    owner = identity.get("username") if identity and identity.get("authenticated") else None
    # Preview/demo identities cannot spend any person's subscription.
    from .auth import VIEW_AS_DEMO_ACCOUNTS
    if owner in VIEW_AS_DEMO_ACCOUNTS:
        owner = None
    db.info["chatgpt_username"] = owner
    db.info["chatgpt_language"] = language


@contextmanager
def credential_session(db):
    # Credential renewal must not commit the caller's pending chat/score writes.
    with Session(bind=db.get_bind(), join_transaction_mode="create_savepoint") as private:
        yield private


def owner(db):
    return getattr(db, "info", {}).get("chatgpt_username")


def _credentials(row):
    if not row or not row.encrypted_credentials:
        raise ChatGPTError("reconnect")
    try:
        return json.loads(cipher().decrypt(row.encrypted_credentials.encode()))
    except (InvalidToken, ValueError, TypeError):
        raise ChatGPTError("notConfigured") from None


def _seal(data):
    return cipher().encrypt(json.dumps(data, separators=(",", ":")).encode()).decode()


def _keys(force=False):
    global _jwks, _jwks_time
    with _jwks_lock:
        if force or _jwks is None or time.monotonic() - _jwks_time > 300:
            try:
                with httpx.Client(timeout=15, follow_redirects=False) as client:
                    result = client.get(JWKS_URL)
                    result.raise_for_status()
                    _jwks = result.json()
                _jwks_time = time.monotonic()
            except (httpx.HTTPError, ValueError):
                raise ChatGPTError("unavailable") from None
        return _jwks


def _verify(token, audience):
    if not isinstance(token, str) or not 1 <= len(token) <= 32768:
        raise ChatGPTError("invalidCredentials")
    try:
        header = jwt.get_unverified_header(token)
        keys = _keys()
        if not any(key.get("kid") == header.get("kid") for key in keys.get("keys", [])):
            keys = _keys(force=True)
        claims = jwt.decode(token, keys, algorithms=["RS256"], audience=audience,
                            issuer=ISSUER, options={"require_exp": True, "require_sub": True,
                                                    "require_iat": True, "require_aud": True, "verify_at_hash": False})
        if not isinstance(claims.get("sub"), str) or not claims["sub"]:
            raise ValueError()
        return claims
    except (JWTError, ValueError, TypeError, KeyError):
        raise ChatGPTError("invalidCredentials") from None


def validate_credentials(data, client_id, *, nonce=None, subject=None):
    if not isinstance(data, dict) or data.get("token_type", "").lower() != "bearer":
        raise ChatGPTError("invalidCredentials")
    access = _verify(data.get("access_token", ""), RESOURCE)
    if access.get("client_id") != client_id or (subject and access["sub"] != subject):
        raise ChatGPTError("invalidCredentials")
    granted = data.get("scope", access.get("scope", ""))
    if not isinstance(granted, str) or not isinstance(access.get("scope", ""), str):
        raise ChatGPTError("invalidCredentials")
    scopes = set(granted.split()) & set(access.get("scope", "").split())
    if not {DIRECT_SCOPE, "resource.invoke"}.issubset(scopes):
        raise ChatGPTError("permission")
    identity = None
    if nonce is not None:
        identity = _verify(data.get("id_token", ""), client_id)
        if identity["sub"] != access["sub"] or not secrets.compare_digest(str(identity.get("nonce", "")), nonce):
            raise ChatGPTError("invalidCredentials")
    refresh = data.get("refresh_token")
    if not isinstance(refresh, str) or not refresh or len(refresh) > 16000:
        raise ChatGPTError("invalidCredentials")
    stored = {key: data[key] for key in ("access_token", "refresh_token", "id_token") if key in data}
    stored.update(expires_at=access["exp"], scope=" ".join(sorted(scopes)), token_type="Bearer")
    earliest = data.get("earliest_refresh_at")
    if isinstance(earliest, (int, float)):
        if not math.isfinite(earliest) or earliest < 0:
            raise ChatGPTError("invalidCredentials")
        stored["earliest_refresh_at"] = earliest
    elif isinstance(earliest, str) and len(earliest) < 64:
        try:
            stored["earliest_refresh_at"] = datetime.fromisoformat(earliest.replace("Z", "+00:00")).timestamp()
        except ValueError:
            raise ChatGPTError("invalidCredentials") from None
    return stored, identity, access["sub"]


def start_link(db, username):
    require_ready(db)
    now = datetime.now(timezone.utc)
    # A single stable host identifier survives restarts; concurrent workers agree.
    db.execute(insert(models.Config).values(key="chatgpt_host_id", value="urn:uuid:" + str(uuid.uuid4()),
                 description="Opaque SIWC host identifier").on_conflict_do_nothing(index_elements=["key"]))
    host_id = db.query(models.Config).filter_by(key="chatgpt_host_id").one().value
    db.execute(insert(models.ChatGPTConnection).values(username=username)
               .on_conflict_do_nothing(index_elements=["username"]))
    row = db.query(models.ChatGPTConnection).filter_by(username=username).with_for_update().one()
    db.query(models.ChatGPTLink).filter(models.ChatGPTLink.username == username).delete()
    token = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    deadline = now + timedelta(minutes=10)
    db.add(models.ChatGPTLink(token_hash=hashlib.sha256(token.encode()).hexdigest(), username=username,
                            nonce=nonce, expected_client_id=row.client_id, expires_at=deadline))
    db.commit()
    return {"pairing_code": token, "expires_at": deadline.isoformat(), "host_id": host_id}


def read_link(db, token, *, lock=False):
    if not isinstance(token, str) or not 30 <= len(token) <= 100:
        raise ChatGPTError("linkExpired")
    query = db.query(models.ChatGPTLink).filter_by(token_hash=hashlib.sha256(token.encode()).hexdigest())
    row = (query.with_for_update() if lock else query).first()
    if row is None or row.expires_at <= datetime.now(timezone.utc):
        raise ChatGPTError("linkExpired")
    return row


def link_parameters(db, token):
    require_ready(db)
    row = read_link(db, token)
    host_id = db.query(models.Config).filter_by(key="chatgpt_host_id").one().value
    return {"nonce": row.nonce, "client_id": row.expected_client_id or "dynamic_agent_client",
            "host_id": host_id, "agent_name": "CounselorBot"}


def remember_registration(db, token, client_id):
    """Keep the issued public client ID before code exchange; no grant yet."""
    require_ready(db)
    if client_id == "dynamic_agent_client":
        raise ChatGPTError("invalidCredentials")
    link = read_link(db, token)
    row = db.query(models.ChatGPTConnection).filter_by(username=link.username).with_for_update().first()
    link = read_link(db, token, lock=True)
    if row is None:
        raise ChatGPTError("linkExpired")
    if row.client_id and client_id != row.client_id:
        raise ChatGPTError("invalidCredentials")
    row.client_id = client_id
    link.expected_client_id = client_id
    db.commit()
    return {"registered": True}


def complete_link(db, token, client_id, data):
    require_ready(db)
    if client_id == "dynamic_agent_client":
        raise ChatGPTError("invalidCredentials")
    link = read_link(db, token)
    row = db.query(models.ChatGPTConnection).filter_by(username=link.username).with_for_update().first()
    # All mutations lock the connection before its pairing link.
    link = read_link(db, token, lock=True)
    if row is None:
        raise ChatGPTError("linkExpired")
    if link.expected_client_id and client_id != link.expected_client_id:
        raise ChatGPTError("invalidCredentials")
    stored, identity, subject = validate_credentials(data, client_id, nonce=link.nonce, subject=row.subject)
    row.client_id, row.subject = client_id, subject
    row.email = identity.get("email") if isinstance(identity.get("email"), str) else None
    row.encrypted_credentials = _seal(stored)
    row.last_error = None
    row.catalog = None
    db.delete(link)
    db.commit()
    return {"connected": True}


def preference(db):
    if not owner(db):
        return None
    with db.no_autoflush:
        setting = db.query(models.Config).filter_by(key="chatgpt_enabled").first()
    if setting is not None and setting.value != "true":
        return None  # An explicit administrator decision selects installation AI.
    with credential_session(db) as private:
        row = private.query(models.ChatGPTConnection).filter_by(username=owner(db), use_subscription=True).first()
        return row.preferred_model if row and row.preferred_model else None


def access_token(db):
    require_ready(db)
    username = owner(db)
    if not username:
        raise ChatGPTError("signIn")
    with credential_session(db) as private:
        row = private.query(models.ChatGPTConnection).filter_by(username=username).with_for_update().first()
        data = _credentials(row)
        now = time.time()
        if float(data["expires_at"]) <= now < float(data.get("earliest_refresh_at", 0)):
            raise ChatGPTError("unavailable")
        if float(data["expires_at"]) <= now + 60 and float(data.get("earliest_refresh_at", 0)) <= now:
            try:
                with httpx.Client(timeout=15, follow_redirects=False) as client:
                    result = client.post(TOKEN_URL, data={"grant_type": "refresh_token", "client_id": row.client_id,
                            "refresh_token": data["refresh_token"], "resource": RESOURCE})
                try:
                    failure = result.json().get("error", {})
                    failure_code = failure if isinstance(failure, str) else failure.get("code")
                except (ValueError, AttributeError):
                    failure_code = None
                if failure_code in {"invalid_grant", "invalid_refresh_token", "token_expired",
                                    "refresh_token_expired", "refresh_token_invalidated", "refresh_token_reused"}:
                    row.encrypted_credentials = None
                    row.last_error = "reconnect"
                    private.commit()
                    raise ChatGPTError("reconnect")
                result.raise_for_status()
                refreshed, _, _ = validate_credentials(result.json(), row.client_id, subject=row.subject)
                if "id_token" not in refreshed and data.get("id_token"):
                    refreshed["id_token"] = data["id_token"]
                row.encrypted_credentials = _seal(refreshed)
                data = refreshed
                private.commit()
            except (httpx.HTTPError, ValueError):
                raise ChatGPTError("unavailable") from None
        return data["access_token"]


def mark_reconnect(db, rejected_token):
    """Remember rejection of this grant, without erasing a newer connection."""
    with credential_session(db) as private:
        row = private.query(models.ChatGPTConnection).filter_by(username=owner(db)).with_for_update().first()
        try:
            if row and _credentials(row)["access_token"] == rejected_token:
                row.last_error = "reconnect"
                private.commit()
        except ChatGPTError:
            pass


def list_models(db):
    token = access_token(db)
    try:
        with httpx.Client(timeout=20, follow_redirects=False) as client:
            result = client.get(RESOURCE + "/models", headers={"Authorization": "Bearer " + token})
        if result.status_code in (401, 403):
            mark_reconnect(db, token)
            raise ChatGPTError("reconnect")
        if result.status_code == 429:
            raise ChatGPTError("quota")
        result.raise_for_status()
        catalog = [{"slug": item["slug"], "display_name": item.get("display_name") or item["slug"]}
                   for item in result.json().get("models", [])
                   if item.get("visibility") == "list" and isinstance(item.get("slug"), str)]
    except (httpx.HTTPError, ValueError, TypeError, KeyError):
        raise ChatGPTError("unavailable") from None
    with credential_session(db) as private:
        row = private.query(models.ChatGPTConnection).filter_by(username=owner(db)).with_for_update().first()
        # A disconnect/reconnect during discovery invalidates this result.
        if not row or _credentials(row)["access_token"] != token:
            raise ChatGPTError("reconnect")
        row.catalog = catalog
        private.commit()
    return catalog


def set_preference(db, username, active, model):
    from .personal_api import lock_choice
    lock_choice(db, username)
    if active:
        require_ready(db)
    row = db.query(models.ChatGPTConnection).filter_by(username=username).with_for_update().first()
    if row is None:
        raise ChatGPTError("reconnect")
    if active:
        _credentials(row)
        if not model or model not in {item["slug"] for item in row.catalog or []}:
            raise ChatGPTError("model")
        row.preferred_model = model
        db.query(models.PersonalAPISettings).filter_by(username=username).update({"enabled": False})
        db.query(models.PersonalAIRouting).filter_by(username=username).update({"enabled": False})
    row.use_subscription = active
    db.commit()


def status(db, username):
    from .personal_api import feature_enabled
    ready, reason = True, None
    try:
        require_ready(db)
    except ChatGPTError as exc:
        ready, reason = False, exc.code
    row = db.query(models.ChatGPTConnection).filter_by(username=username).first()
    pending = db.query(models.ChatGPTLink).filter(models.ChatGPTLink.username == username,
                  models.ChatGPTLink.expires_at > datetime.now(timezone.utc)).first() is not None
    return {"available": ready, "enabled": enabled(db), "personal_api_enabled": feature_enabled(db), "reason": reason, "connected": bool(row and row.encrypted_credentials),
            "email": row.email if row else None, "use_subscription": bool(row and row.use_subscription), "pending_link": pending,
            "model": row.preferred_model if row else None, "needs_reconnect": bool(row and row.last_error == "reconnect"),
            "registered": bool(row and row.client_id),
            "revocation_pending": bool(row and row.last_error == "revocationUnconfirmed"),
            "models": row.catalog or [] if row else [], "usage_url": "https://chatgpt.com/settings/usage"}


def disconnect(db, username, forget=False):
    row = db.query(models.ChatGPTConnection).filter_by(username=username).with_for_update().first()
    confirmed = not bool(row and row.last_error == "revocationUnconfirmed")
    if row and row.encrypted_credentials:
        confirmed = False
        try:
            data = _credentials(row)
            with httpx.Client(timeout=10, follow_redirects=False) as client:
                discovery = client.get(DISCOVERY_URL)
                discovery.raise_for_status()
                endpoint = discovery.json().get("revocation_endpoint", "")
                if endpoint.startswith(ISSUER + "/"):
                    result = client.post(endpoint, data={"token": data["refresh_token"],
                                       "token_type_hint": "refresh_token", "client_id": row.client_id})
                    confirmed = result.status_code == 200
        except (ChatGPTError, httpx.HTTPError, ValueError):
            pass
    if row:
        row.encrypted_credentials = None
        row.use_subscription = False
        row.catalog = None
        row.last_error = None if confirmed else "revocationUnconfirmed"
        if forget:
            db.delete(row)
    db.query(models.ChatGPTLink).filter_by(username=username).delete()
    db.commit()
    return {"disconnected": True, "revocation_confirmed": confirmed}
