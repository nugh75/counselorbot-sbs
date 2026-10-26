"""Privacy audit events recording and persistence (P8, docs/privacy/02-progettazione.md §7.1).

Stores actor and subject pseudonyms (subject_pid), event types, purposes and counts.
Fail-closed: if recording the audit event fails, the operation is denied (AuditUnavailable).
Contains no cleartext PII, free text, or unpseudonymized usernames.
"""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from .errors import AuditUnavailable
from .types import PrivacyEvent

if TYPE_CHECKING:
    from .. import models

logger = logging.getLogger(__name__)


def record_privacy_event(event: PrivacyEvent, db: Session | None = None, *,
                         commit: bool = True) -> models.PrivacyEventRecord:
    """Persist a privacy audit event fail-closed.

    If db is not provided, a new session is created from backend.database.SessionLocal.
    Any failure raises AuditUnavailable. With commit=False the caller owns the
    transaction and receives the flushed event row (including its id).
    """
    from .. import database, models

    if not commit and db is None:
        raise AuditUnavailable()

    session = db
    should_close = False
    if session is None:
        session = database.SessionLocal()
        should_close = True

    try:
        actor_role = event.actor_role if isinstance(event.actor_role, str) else event.actor_role.value
        record = models.PrivacyEventRecord(
            id=str(uuid.uuid4()),
            created_at=datetime.now(UTC),
            subject_pid=event.subject_pid,
            actor_pid=event.actor_pid,
            actor_role=actor_role,
            event_type=event.event_type,
            purpose=event.purpose,
            target=getattr(event, "target", "") or None,
            categories_count=dict(event.categories_count) if event.categories_count else None,
            document_kind=event.document_kind, document_version=event.document_version,
            document_locale=event.document_locale,
            choice=event.choice, valid_until=event.valid_until,
        )
        session.add(record)
        if commit:
            session.commit()
        else:
            session.flush()
        return record
    except Exception:
        if session is not None:
            try:
                session.rollback()
            except Exception:
                pass
        logger.error("Failed to record privacy event")
        raise AuditUnavailable() from None
    finally:
        if should_close and session is not None:
            session.close()


def query_privacy_events(db: Session, subject_pid: str | None = None,
                         event_type: str | None = None, limit: int = 100):
    from .. import models

    q = db.query(models.PrivacyEventRecord)
    if subject_pid:
        q = q.filter(models.PrivacyEventRecord.subject_pid == subject_pid)
    if event_type:
        q = q.filter(models.PrivacyEventRecord.event_type == event_type)
    return q.order_by(models.PrivacyEventRecord.created_at.desc()).limit(limit).all()
