"""Key hierarchy of the Privacy Layer (P5, docs/privacy/02-progettazione.md §4.2, §4.4, §9.6).

KEK (``K_root``): only from the environment, ``PRIVACY_KEK`` or ``PRIVACY_KEK_FILE`` (base64url, 32 bytes).
L1 sets it in the server environment; on L2 the desktop shell reads it from the system keychain (F1-08) and
passes it to the backend as ``PRIVACY_KEK``. The KEK only wraps keys and is never written to the database.

DEKs per purpose and the HMAC roots ``K_pid``/``K_idx`` live wrapped in ``privacy_keys``; each wrapped key is
bound by AAD to its own row and purpose, so rows cannot be swapped. A missing, corrupted or foreign key raises
``KeyUnavailable``; a tampered value raises ``IntegrityError``.
"""
from __future__ import annotations

import json
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path

from argon2.low_level import Type, hash_secret_raw
from sqlalchemy.exc import IntegrityError as DatabaseIntegrityError
from sqlalchemy.orm import Session

from .. import models
from . import crypto
from .errors import IntegrityError, KeyUnavailable
from .types import FieldRef, SealedValue

KEK_VARIABLE = "PRIVACY_KEK"
DATA_PURPOSES = ("content", "mapping", "credentials", "research")
# HMAC roots: rotating them would change every subject_pid and blind index, so they have a fixed id.
ROOT_PURPOSES = ("pid", "index")
# Recovery kit KDF (RFC 9106 second recommendation, also above the OWASP minimum).
RECOVERY_KDF = {"time_cost": 3, "memory_cost": 65536, "parallelism": 4}
_RECOVERY_AAD = b"counselorbot-privacy:recovery-kit:v1"


def parse_kek(text: str) -> bytes:
    key = crypto.b64decode(text.strip()) if text and text.strip() else b""
    if len(key) != crypto.KEY_BYTES:
        raise KeyUnavailable() from None
    return key


def load_kek() -> bytes:
    """KEK from ``PRIVACY_KEK`` or ``PRIVACY_KEK_FILE``; none, both, unreadable or malformed ⇒ ``KeyUnavailable``."""
    value = os.getenv(KEK_VARIABLE, "").strip()
    filename = os.getenv(KEK_VARIABLE + "_FILE", "").strip()
    if bool(value) == bool(filename):
        raise KeyUnavailable() from None
    try:
        return parse_kek(Path(filename).read_text() if filename else value)
    except (OSError, UnicodeDecodeError, IntegrityError):
        raise KeyUnavailable() from None


def generate_kek() -> str:
    """New KEK in the ``PRIVACY_KEK`` text form."""
    return crypto.b64encode(crypto.generate_key())


def _kek_id(kek: bytes) -> str:
    # Non-secret fingerprint: tells a wrong KEK apart from a corrupted wrapped key.
    return "kek_" + crypto.b64encode(crypto.derive_key(kek, "kek-id")[:9])


def _wrap_aad(key_id: str, purpose: str) -> bytes:
    return f"privacy_keys.wrapped_key:{key_id}:{purpose}".encode("utf-8")


def _now() -> datetime:
    return datetime.now(timezone.utc)


class KeyRing:
    """Keys of one database session; created keys join the caller's transaction (the caller commits)."""

    def __init__(self, db: Session, kek: bytes | None = None) -> None:
        self.db = db
        self._kek = load_kek() if kek is None else kek
        crypto.check_key(self._kek)
        self._cache: dict[str, tuple[str, bytes]] = {}

    def _unwrap(self, row: models.PrivacyKey) -> bytes:
        try:
            if crypto.key_id_of(row.wrapped_key) != _kek_id(self._kek):
                raise KeyUnavailable() from None
            key = crypto.open_sealed(self._kek, row.wrapped_key, _wrap_aad(row.key_id, row.purpose))
        except IntegrityError:
            raise KeyUnavailable() from None
        if len(key) != crypto.KEY_BYTES:
            raise KeyUnavailable() from None
        self._cache[row.key_id] = (row.purpose, key)
        return key

    def _create(self, purpose: str, key_id: str) -> None:
        row = models.PrivacyKey(key_id=key_id, purpose=purpose, created_at=_now(),
                                wrapped_key=crypto.seal(self._kek, _kek_id(self._kek), crypto.generate_key(),
                                                        _wrap_aad(key_id, purpose)))
        savepoint = self.db.begin_nested()
        try:
            self.db.add(row)
            savepoint.commit()
        except DatabaseIntegrityError:
            # Another worker created the same root key first: use theirs.
            savepoint.rollback()

    def _active_row(self, purpose: str) -> models.PrivacyKey | None:
        return (self.db.query(models.PrivacyKey)
                .filter(models.PrivacyKey.purpose == purpose, models.PrivacyKey.retired_at.is_(None))
                .order_by(models.PrivacyKey.created_at.desc(), models.PrivacyKey.key_id.desc()).first())

    def active(self, purpose: str) -> tuple[str, bytes]:
        """Current key of a purpose, created on first use."""
        if purpose not in DATA_PURPOSES + ROOT_PURPOSES:
            raise KeyUnavailable() from None
        row = self._active_row(purpose)
        if row is None:
            key_id = purpose if purpose in ROOT_PURPOSES else f"{purpose}-{secrets.token_hex(8)}"
            self._create(purpose, key_id)
            row = self._active_row(purpose)
        cached = self._cache.get(row.key_id)
        return row.key_id, cached[1] if cached else self._unwrap(row)

    def key(self, key_id: str, purpose: str) -> bytes:
        """Key by id, retired ones included (old values stay readable after rotation)."""
        cached = self._cache.get(key_id)
        if cached is None:
            row = self.db.get(models.PrivacyKey, key_id)
            if row is None:
                raise KeyUnavailable() from None
            self._unwrap(row)
            cached = self._cache[key_id]
        if cached[0] != purpose:
            raise IntegrityError() from None
        return cached[1]

    def rotate(self, purpose: str) -> str:
        """Retires the current DEK of a purpose and creates a new one (02 §4.2: before 2^32 encryptions)."""
        if purpose not in DATA_PURPOSES:
            raise ValueError("only data keys rotate")
        (self.db.query(models.PrivacyKey)
         .filter(models.PrivacyKey.purpose == purpose, models.PrivacyKey.retired_at.is_(None))
         .update({models.PrivacyKey.retired_at: _now()}, synchronize_session="fetch"))
        key_id = f"{purpose}-{secrets.token_hex(8)}"
        self._create(purpose, key_id)
        return key_id

    def rewrap(self, new_kek: bytes) -> int:
        """KEK rotation: rewraps every stored key; data values are untouched."""
        crypto.check_key(new_kek)
        rows = self.db.query(models.PrivacyKey).all()
        keys = [(row, self._cache[row.key_id][1] if row.key_id in self._cache else self._unwrap(row)) for row in rows]
        for row, key in keys:
            row.wrapped_key = crypto.seal(new_kek, _kek_id(new_kek), key, _wrap_aad(row.key_id, row.purpose))
        self.db.flush()
        self._kek = new_kek
        return len(keys)

    def encrypt(self, value: bytes, field: FieldRef, purpose: str = "content") -> SealedValue:
        if purpose not in DATA_PURPOSES:
            raise KeyUnavailable() from None
        key_id, key = self.active(purpose)
        return SealedValue(crypto.seal(key, key_id, value, crypto.field_aad(field)))

    def decrypt(self, sealed: SealedValue, field: FieldRef, purpose: str = "content") -> bytes:
        """Raw decryption: callers outside the key service go through ``decrypt_authorized`` (P7/P11)."""
        if purpose not in DATA_PURPOSES:
            raise KeyUnavailable() from None
        aad = crypto.field_aad(field)
        return crypto.open_sealed(self.key(crypto.key_id_of(sealed.value), purpose), sealed.value, aad)

    def subject_pid(self, username: str) -> str:
        return crypto.subject_pid(self.active("pid")[1], username)

    def blind_index(self, field: str, value: str) -> str:
        """``K_idx[field]`` is derived from the index root, so indexes of two fields never match."""
        return crypto.blind_index(crypto.derive_key(self.active("index")[1], f"idx:{field}"), value)


def export_recovery_kit(kek: bytes, passphrase: str) -> str:
    """KEK sealed with a passphrase-derived key (Argon2id + AES-256-GCM, 02 §9.6), as JSON text."""
    crypto.check_key(kek)
    salt = os.urandom(16)
    derived = hash_secret_raw(passphrase.encode("utf-8"), salt, hash_len=crypto.KEY_BYTES, type=Type.ID,
                              **RECOVERY_KDF)
    return json.dumps({"format": "counselorbot-privacy-recovery-kit", "version": 1, "kdf": "argon2id",
                       **RECOVERY_KDF, "salt": crypto.b64encode(salt),
                       "sealed_kek": crypto.seal(derived, "recovery", kek, _RECOVERY_AAD)})


def open_recovery_kit(kit: str, passphrase: str) -> bytes:
    """KEK from a recovery kit; wrong passphrase or altered kit ⇒ ``IntegrityError``."""
    try:
        data = json.loads(kit)
        if data["format"] != "counselorbot-privacy-recovery-kit" or data["version"] != 1 or data["kdf"] != "argon2id":
            raise IntegrityError() from None
        derived = hash_secret_raw(passphrase.encode("utf-8"), crypto.b64decode(data["salt"]),
                                  time_cost=int(data["time_cost"]), memory_cost=int(data["memory_cost"]),
                                  parallelism=int(data["parallelism"]), hash_len=crypto.KEY_BYTES, type=Type.ID)
        kek = crypto.open_sealed(derived, data["sealed_kek"], _RECOVERY_AAD)
    except (ValueError, KeyError, TypeError, AttributeError):
        raise IntegrityError() from None
    if len(kek) != crypto.KEY_BYTES:
        raise IntegrityError() from None
    return kek
