"""Persistent encrypted pseudonym maps (P8, docs/privacy/02-progettazione.md §3.3, §4).

``SqlAlchemyMapStore`` is the database :class:`~backend.privacy.pseudonymization.MapStore`: one
``privacy_pseudonym_maps`` row per placeholder of a scope. The original value is sealed with the ``mapping``
DEK and the AAD ``privacy_pseudonym_maps.original_value_encrypted:<id>:<subject_pid>``, so a value copied to
another row or subject does not decrypt. Rows are only added (a scope's placeholders never change) and are
deleted with the scope. Like ``KeyRing``, the store joins the caller's transaction: the caller commits.
"""
from __future__ import annotations

import re
from datetime import UTC, datetime, timezone

from sqlalchemy.exc import IntegrityError as DatabaseIntegrityError
from sqlalchemy.orm import Session

from .. import models
from .errors import IntegrityError, PolicyBlocked, PrivacyError
from .keys import KeyRing
from .pseudonymization import ScopeMap, normalize
from .subject import is_subject_pid
from .types import FieldRef, PIICategory, SealedValue

_TABLE = "privacy_pseudonym_maps"
_COLUMN = "original_value_encrypted"
_NUMBERED = re.compile(r"^\[(.+)_(\d+)\]$")


def _field(row: models.PrivacyPseudonymMap) -> FieldRef:
    return FieldRef(table=_TABLE, column=_COLUMN, row_id=str(row.id), subject_pid=row.subject_pid)


class SqlAlchemyMapStore:
    """Maps of one database session; ``put`` flushes, the caller commits."""

    def __init__(self, db: Session, kek: bytes | None = None, *, ring: KeyRing | None = None) -> None:
        self.db = db
        self.ring = ring if ring is not None else KeyRing(db, kek)

    def _rows(self, scope_id: str) -> list[models.PrivacyPseudonymMap]:
        return (self.db.query(models.PrivacyPseudonymMap)
                .filter(models.PrivacyPseudonymMap.scope_id == scope_id)
                .order_by(models.PrivacyPseudonymMap.id).all())

    def get(self, scope_id: str) -> ScopeMap | None:
        rows = self._rows(scope_id)
        if not rows:
            return None
        first = rows[0]
        smap = ScopeMap(scope_id, first.locale, first.mapping_ref, subject_pid=first.subject_pid)
        for row in rows:
            if (row.subject_pid, row.locale, row.mapping_ref) != (first.subject_pid, first.locale, first.mapping_ref):
                raise IntegrityError() from None
            numbered = _NUMBERED.match(row.placeholder)
            if numbered is None:
                raise IntegrityError() from None
            try:
                category = PIICategory(row.category)
                value = self.ring.decrypt(SealedValue(row.original_value_encrypted), _field(row),
                                          purpose="mapping").decode("utf-8")
            except (ValueError, UnicodeDecodeError):
                raise IntegrityError() from None
            label, number = numbered.group(1), int(numbered.group(2))
            smap.forward[f"{category.value}\x1f{normalize(category, value)}"] = row.placeholder
            smap.reverse[row.placeholder] = value
            smap.categories[row.placeholder] = category.value
            smap.counters[label] = max(smap.counters.get(label, 0), number)
        return smap

    def put(self, smap: ScopeMap) -> None:
        """Adds the placeholders not stored yet; a map without a valid ``subject_pid`` ⇒ ``PolicyBlocked``."""
        if not smap.reverse:
            return
        if not is_subject_pid(smap.subject_pid):
            raise PolicyBlocked() from None
        stored = {row.placeholder: row for row in self._rows(smap.scope_id)}
        if any(row.subject_pid != smap.subject_pid for row in stored.values()):
            raise PolicyBlocked() from None
        now = datetime.now(UTC)
        savepoint = self.db.begin_nested()
        try:
            for placeholder, value in smap.reverse.items():
                if placeholder in stored:
                    continue
                row = models.PrivacyPseudonymMap(
                    scope_id=smap.scope_id, subject_pid=smap.subject_pid, placeholder=placeholder,
                    original_value_encrypted="", category=smap.categories[placeholder],
                    locale=smap.locale, mapping_ref=smap.mapping_ref, created_at=now)
                self.db.add(row)
                self.db.flush()  # the row id is part of the AAD
                row.original_value_encrypted = self.ring.encrypt(value.encode("utf-8"), _field(row),
                                                                 purpose="mapping").value
            self.db.flush()
            savepoint.commit()
        except DatabaseIntegrityError:
            # Another worker stored the same placeholder of this scope first: this batch fails closed.
            savepoint.rollback()
            raise PrivacyError() from None
        except BaseException:
            savepoint.rollback()
            raise

    def delete(self, scope_id: str) -> None:
        (self.db.query(models.PrivacyPseudonymMap)
         .filter(models.PrivacyPseudonymMap.scope_id == scope_id)
         .delete(synchronize_session="fetch"))
        self.db.flush()
