"""Pure crypto primitives of the Privacy Layer (P5, docs/privacy/02-progettazione.md §4).

AES-256-GCM with a fresh 96-bit nonce per call, stored as ``v1.<key_id>.<base64url(nonce||ciphertext||tag)>``.
The AAD binds a value to its field (``<table>.<column>:<row id>:<subject_pid>``): a value copied to another
row, column or subject does not decrypt. No I/O and no key storage here: keys come from ``keys.py``.
Every failure is a content-free ``PrivacyError`` (fail-closed).
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import os
import re
import unicodedata
from typing import Callable

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from .errors import IntegrityError, KeyUnavailable
from .types import FieldRef

VERSION = "v1"
KEY_BYTES = 32
NONCE_BYTES = 12
TAG_BYTES = 16
_KEY_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_IDENTIFIER = re.compile(r"^[a-z0-9_]+$")


def generate_key() -> bytes:
    return AESGCM.generate_key(bit_length=256)


def b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64decode(text: str) -> bytes:
    try:
        return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
    except (binascii.Error, ValueError):
        raise IntegrityError() from None


def check_key(key: bytes) -> None:
    if not isinstance(key, bytes) or len(key) != KEY_BYTES:
        raise KeyUnavailable() from None


def field_aad(field: FieldRef) -> bytes:
    """``<table>.<column>:<row id>:<subject_pid>``; separators are rejected where they would be ambiguous."""
    if not (_IDENTIFIER.match(field.table) and _IDENTIFIER.match(field.column)):
        raise IntegrityError() from None
    if not field.row_id or ":" in field.subject_pid:
        raise IntegrityError() from None
    return f"{field.table}.{field.column}:{field.row_id}:{field.subject_pid}".encode("utf-8")


def seal(key: bytes, key_id: str, plaintext: bytes, aad: bytes) -> str:
    check_key(key)
    if not _KEY_ID.match(key_id) or not aad:
        raise IntegrityError() from None
    nonce = os.urandom(NONCE_BYTES)
    sealed = AESGCM(key).encrypt(nonce, plaintext, aad)
    return f"{VERSION}.{key_id}.{b64encode(nonce + sealed)}"


def key_id_of(token: str) -> str:
    """Key id of a stored value, to look the key up before ``open_sealed``."""
    parts = token.split(".", 2) if isinstance(token, str) else []
    if len(parts) != 3 or parts[0] != VERSION or not _KEY_ID.match(parts[1]):
        raise IntegrityError() from None
    return parts[1]


def open_sealed(key: bytes, token: str, aad: bytes) -> bytes:
    key_id_of(token)
    check_key(key)
    blob = b64decode(token.split(".", 2)[2])
    if len(blob) < NONCE_BYTES + TAG_BYTES:
        raise IntegrityError() from None
    try:
        return AESGCM(key).decrypt(blob[:NONCE_BYTES], blob[NONCE_BYTES:], aad)
    except InvalidTag:
        raise IntegrityError() from None


def derive_key(root: bytes, label: str) -> bytes:
    """Independent sub-key (HKDF-SHA-256), e.g. ``K_idx[campo]`` from the index root key."""
    check_key(root)
    return HKDF(algorithm=hashes.SHA256(), length=KEY_BYTES, salt=None,
                info=f"counselorbot-privacy:{label}".encode("utf-8")).derive(root)


def subject_pid(k_pid: bytes, username: str) -> str:
    """``HMAC-SHA-256(K_pid, username)`` truncated to 128 bits, base32 without padding (26 characters)."""
    check_key(k_pid)
    digest = hmac.new(k_pid, username.encode("utf-8"), hashlib.sha256).digest()[:16]
    return base64.b32encode(digest).decode("ascii").rstrip("=")


def normalize(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().casefold()


def blind_index(k_idx: bytes, value: str, normalizer: Callable[[str], str] = normalize) -> str:
    """Deterministic lookup token ``HMAC-SHA-256(K_idx[campo], normalizza(valore))``, base64url."""
    check_key(k_idx)
    return b64encode(hmac.new(k_idx, normalizer(value).encode("utf-8"), hashlib.sha256).digest())
