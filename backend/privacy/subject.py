"""Pseudonymous subject ids and blind indexes (P8, docs/privacy/02-progettazione.md §4.1).

``subject_pid = base32(HMAC-SHA-256(K_pid, username)[:16])``: 128 bits, lowercase RFC 4648 base32 without
padding, 26 characters of ``a-z2-7`` (no ``0``/``1``/``8``/``9``). Same username ⇒ same id; without ``K_pid``
the id leads back to no username. ``K_pid`` is the fixed ``pid`` root of ``privacy_keys`` (P5); the username is
used as stored, without normalization, because it is the internal key of every table.
"""
from __future__ import annotations

import re
from typing import TYPE_CHECKING

from .crypto import blind_index, normalize
from .errors import PolicyBlocked

if TYPE_CHECKING:
    from .keys import KeyRing

__all__ = ["PID_LENGTH", "blind_index", "is_subject_pid", "normalize", "subject_pid"]

PID_LENGTH = 26
_PID = re.compile(r"^[a-z2-7]{26}$")


def is_subject_pid(value: object) -> bool:
    return isinstance(value, str) and _PID.match(value) is not None


def subject_pid(ring: "KeyRing", username: str) -> str:
    """Pseudonymous id of ``username``; an empty or non-string username ⇒ ``PolicyBlocked``."""
    if not isinstance(username, str) or not username.strip():
        raise PolicyBlocked() from None
    return ring.subject_pid(username)
