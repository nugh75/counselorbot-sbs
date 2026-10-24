"""At-rest encryption of stored content with the ``content`` DEK (P11, docs/privacy/02-progettazione.md §4.2, §9).

Used where there is no ``Session`` at hand (SQLAlchemy column types, the session memory files): keys are read
through a ``KeyRing`` on a short session of their own and cached for the process (``reset()`` after a rotation).
Writing sealed values is an explicit switch, ``PRIVACY_DB_ENCRYPTION=on`` (default off, 02 §9.4), and needs the KEK;
reading is always transparent: a value that is not a ``v1.<key_id>.<payload>`` token is returned as it is, so
records written before the switch keep working. A sealed value that cannot be opened fails closed with
``PrivacyError``.

The AAD binds a value to its ``<table>.<column>``; a column type cannot see the row, so the row id is ``*``
(row-bound AAD is for the repository path with ``decrypt_authorized``, P7). Files use their session id as row id.
"""
from __future__ import annotations

import os
import re
import threading
from typing import Callable

from sqlalchemy.orm import Session

from . import crypto
from .errors import KeyUnavailable
from .keys import KeyRing
from .types import FieldRef

SWITCH_VARIABLE = "PRIVACY_DB_ENCRYPTION"
PURPOSE = "content"
ANY_ROW = "*"
_ON = {"1", "on", "true", "yes"}
_TOKEN = re.compile(r"^v1\.[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9_-]+$")

_lock = threading.Lock()
_session_factory: Callable[[], Session] | None = None
_kek: bytes | None = None
_cache: dict[str, bytes] = {}
_index_keys: dict[str, bytes] = {}
_active: tuple[str, bytes] | None = None


def configure(session_factory: Callable[[], Session] | None = None, kek: bytes | None = None) -> None:
    """Session factory for key lookups (default: the application's ``SessionLocal``) and an explicit KEK."""
    global _session_factory, _kek
    _session_factory, _kek = session_factory, kek
    reset()


def reset() -> None:
    global _active
    with _lock:
        _cache.clear()
        _index_keys.clear()
        _active = None


def enabled() -> bool:
    return os.getenv(SWITCH_VARIABLE, "").strip().lower() in _ON


def is_sealed(value: object) -> bool:
    return isinstance(value, str) and _TOKEN.match(value) is not None


def _with_ring(use: Callable[[KeyRing], object]):
    factory = _session_factory
    if factory is None:
        from ..database import SessionLocal as factory
    db = factory()
    try:
        result = use(KeyRing(db, _kek))
        db.commit()
        return result
    finally:
        db.close()


def _active_key() -> tuple[str, bytes]:
    global _active
    with _lock:
        if _active is None:
            _active = _with_ring(lambda ring: ring.active(PURPOSE))
            _cache[_active[0]] = _active[1]
        return _active


def _key(key_id: str) -> bytes:
    with _lock:
        cached = _cache.get(key_id)
    if cached is None:
        cached = _with_ring(lambda ring: ring.key(key_id, PURPOSE))
        with _lock:
            _cache[key_id] = cached
    return cached


def _aad(table: str, column: str, row_id: str) -> bytes:
    return crypto.field_aad(FieldRef(table=table, column=column, row_id=row_id, subject_pid=""))


def ensure_keys() -> None:
    """Creates the ``content`` and index keys at startup, outside any write transaction (SQLite locks)."""
    _active_key()
    _with_ring(lambda ring: ring.active("index"))


def seal_text(table: str, column: str, text: str, row_id: str = ANY_ROW) -> str:
    key_id, key = _active_key()
    return crypto.seal(key, key_id, text.encode("utf-8"), _aad(table, column, row_id))


def open_text(table: str, column: str, value: str, row_id: str = ANY_ROW) -> str:
    """Plain text of a stored value; anything that is not a sealed token is returned unchanged."""
    if not is_sealed(value):
        return value
    key = _key(crypto.key_id_of(value))
    return crypto.open_sealed(key, value, _aad(table, column, row_id)).decode("utf-8")


def blind_index(field: str, value: str) -> str:
    """Deterministic lookup token for ``table.column`` (``K_idx[field]``), 02 §4.1."""
    if not field:
        raise KeyUnavailable() from None
    with _lock:
        k_idx = _index_keys.get(field)
    if k_idx is None:
        k_idx = _with_ring(lambda ring: crypto.derive_key(ring.active("index")[1], f"idx:{field}"))
        with _lock:
            _index_keys[field] = k_idx
    return crypto.blind_index(k_idx, value)
