"""Versioned, purpose-scoped choices. No client text is copied into audit events.

P0 is pending: purposes default to undefined; publishing a document or recording
an old client checkbox never establishes a legal basis or enables a purpose.
"""
from __future__ import annotations

import hashlib
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .. import models
from ..db_compat import xact_lock
from . import events
from .authz import safe_subject_pid
from .errors import AccessDenied, ConsentMissingError, PolicyBlocked, PurposeDisabled
from .types import LegalBasis, Principal, PrivacyContext, PrivacyEvent, PrivacyRole, PurposePolicy

DOCUMENT_KINDS = frozenset({
    "notice_student", "notice_teacher", "notice_ai", "terms", "consent_sharing", "consent_research",
})
CHOICE_EVENTS = ("consent_given", "consent_refused", "consent_withdrawn")
SHARING_PURPOSE = "teacher_sharing"


def now():
    return datetime.now(timezone.utc)


def publish_document(db: Session, *, kind: str, version: str, locale: str,
                     body_ref: str, content: bytes, requires_new_consent: bool = False,
                     published_at: datetime | None = None) -> models.PrivacyDocument:
    """Trusted operator helper; content stays in the referenced immutable store.

    No API publishes or approves drafts. Caller owns the transaction. Versions
    cannot be replaced, and the hash is computed from the actual content bytes.
    """
    if (kind not in DOCUMENT_KINDS or not re.fullmatch(r"\d+\.\d+\.\d+", version)
            or len(version) > 32 or not re.fullmatch(r"[a-z]{2}(?:-[A-Z]{2})?", locale)
            or not body_ref or type(requires_new_consent) is not bool):
        raise PolicyBlocked()
    xact_lock(db.connection(), "privacy-document", kind, locale)
    if db.query(models.PrivacyDocument.id).filter_by(kind=kind, locale=locale, version=version).first():
        raise PolicyBlocked()
    document = models.PrivacyDocument(
        kind=kind, version=version, locale=locale, body_ref=body_ref,
        content_hash=hashlib.sha256(content).hexdigest(),
        published_at=published_at or now(), requires_new_consent=requires_new_consent,
    )
    db.add(document)
    db.flush()
    return document


def current_documents(db: Session, locale: str) -> list[models.PrivacyDocument]:
    rows = db.query(models.PrivacyDocument).filter(
        models.PrivacyDocument.locale == locale,
        models.PrivacyDocument.published_at <= now(),
    ).order_by(models.PrivacyDocument.published_at.desc(), models.PrivacyDocument.id.desc()).all()
    current = {}
    for row in rows:
        current.setdefault(row.kind, row)
    return list(current.values())


def _current_document(db: Session, document_id: int, purpose: models.PrivacyPurpose | None = None):
    if type(document_id) is not int:
        raise PolicyBlocked()
    document = db.get(models.PrivacyDocument, document_id)
    if (document is None or (purpose and purpose.document_kind != document.kind)
            or document.id not in {d.id for d in current_documents(db, document.locale)}):
        raise PolicyBlocked()
    return document


def _purpose(db: Session, key: str) -> models.PrivacyPurpose:
    purpose = db.get(models.PrivacyPurpose, key)
    if purpose is None:
        raise PurposeDisabled()
    return purpose


def _enabled(purpose: models.PrivacyPurpose):
    if not purpose.active or purpose.legal_basis == LegalBasis.UNDEFINED.value:
        raise PurposeDisabled()


def sharing_target(db: Session, teacher_username: str, group_id: int) -> str:
    return f"share:{group_id}:{safe_subject_pid(db, teacher_username)}"


def latest_choice(db: Session, subject_pid: str, purpose: str, target: str = ""):
    return db.query(models.PrivacyEventRecord).filter(
        models.PrivacyEventRecord.subject_pid == subject_pid,
        models.PrivacyEventRecord.purpose == purpose,
        models.PrivacyEventRecord.target == (target or None),
        models.PrivacyEventRecord.event_type.in_(CHOICE_EVENTS),
    ).order_by(models.PrivacyEventRecord.created_at.desc(), models.PrivacyEventRecord.id.desc()).first()


def has_consent(db: Session, subject_pid: str, purpose_key: str, target: str = "") -> bool:
    purpose = db.get(models.PrivacyPurpose, purpose_key)
    if not purpose or not purpose.active or purpose.legal_basis == "undefined":
        return False
    choice = latest_choice(db, subject_pid, purpose_key, target)
    if not choice or choice.event_type != "consent_given":
        return False
    if choice.valid_until is not None and choice.valid_until <= now():
        return False
    # Legacy client observations have no published document and cannot enable P9.
    if not choice.document_kind or not choice.document_version or purpose.document_kind != choice.document_kind:
        return False
    documents = db.query(models.PrivacyDocument).filter_by(
        kind=choice.document_kind, version=choice.document_version,
    ).all()
    document = next((d for d in documents if d.locale == choice.document_locale), None)
    if document is None:
        return False
    # A later non-material update must not erase an earlier re-consent barrier.
    barrier = db.query(models.PrivacyDocument.id).filter(
        models.PrivacyDocument.kind == document.kind,
        models.PrivacyDocument.locale == document.locale,
        models.PrivacyDocument.requires_new_consent.is_(True),
        models.PrivacyDocument.published_at <= now(),
        ((models.PrivacyDocument.published_at > document.published_at)
         | ((models.PrivacyDocument.published_at == document.published_at)
            & (models.PrivacyDocument.id > document.id))),
    ).first()
    return barrier is None


def require_purpose(db: Session, ctx: PrivacyContext, target: str = "") -> None:
    purpose = _purpose(db, ctx.purpose)
    _enabled(purpose)
    if purpose.requires_consent or purpose.legal_basis == "consent":
        if not has_consent(db, safe_subject_pid(db, ctx.subject or ctx.principal.username), purpose.key, target):
            raise ConsentMissingError()


def resolve_context_policy(ctx: PrivacyContext) -> tuple[PurposePolicy | None, bool]:
    """P6 resolver: transitional mode still shadows failures; strict enforces them."""
    from ..database import SessionLocal
    with SessionLocal() as db:
        purpose = _purpose(db, ctx.purpose)
        policy = PurposePolicy(purpose.key, purpose.active, LegalBasis(purpose.legal_basis), purpose.requires_consent)
        granted = has_consent(db, safe_subject_pid(db, ctx.subject or ctx.principal.username), purpose.key)
        return policy, granted


def record_notice(db: Session, principal: Principal, document_id: int):
    document = _current_document(db, document_id)
    pid = safe_subject_pid(db, principal.username)
    return events.record_privacy_event(PrivacyEvent(
        subject_pid=pid, actor_pid=pid, actor_role=principal.role,
        event_type="notice_viewed", purpose="notice", document_kind=document.kind,
        document_version=document.version, document_locale=document.locale,
    ), db=db, commit=False)


def _check_sharing_scope(db: Session, student: str, teacher: str, group_id: int):
    group = db.get(models.StudentGroup, group_id)
    member = db.query(models.GroupMembership.id).filter_by(group_id=group_id, username=student).first()
    share = db.query(models.GroupShare.id).filter_by(group_id=group_id, shared_with_username=teacher).first()
    if not group or not group.is_active or not member or not (group.owner_username == teacher or share):
        raise AccessDenied()
    if group.institution_id is not None and not db.query(models.InstitutionTeacher.id).filter_by(
        institution_id=group.institution_id, username=teacher, is_active=True,
    ).first():
        raise AccessDenied()


def record_choice(db: Session, principal: Principal, purpose_key: str, choice: str, *,
                  document_id: int | None = None, teacher_username: str | None = None,
                  group_id: int | None = None, valid_until: datetime | None = None):
    """Append a choice and create/revoke only its notebook grants. Caller commits."""
    if not principal.username or choice not in ("given", "refused", "withdrawn"):
        raise PolicyBlocked()
    pid = safe_subject_pid(db, principal.username)
    xact_lock(db.connection(), "privacy-consent", pid, purpose_key)
    purpose = _purpose(db, purpose_key)
    target = ""
    if purpose_key == SHARING_PURPOSE:
        if not teacher_username or group_id is None:
            raise PolicyBlocked()
        target = sharing_target(db, teacher_username, group_id)
    elif teacher_username is not None or group_id is not None:
        raise PolicyBlocked()
    document = None
    if choice != "withdrawn":
        document = _current_document(db, document_id, purpose)
    if choice == "given":
        _enabled(purpose)
        if not purpose.requires_consent and purpose.legal_basis != "consent":
            raise PolicyBlocked()
        if valid_until is not None and (valid_until.tzinfo is None or valid_until <= now()):
            raise PolicyBlocked()
        if purpose_key == SHARING_PURPOSE:
            _check_sharing_scope(db, principal.username, teacher_username, group_id)
    elif valid_until is not None:
        raise PolicyBlocked()
    previous = latest_choice(db, pid, purpose_key, target)
    event = events.record_privacy_event(PrivacyEvent(
        subject_pid=pid, actor_pid=pid, actor_role=principal.role,
        event_type=f"consent_{choice}", purpose=purpose.key, target=target,
        document_kind=document.kind if document else getattr(previous, "document_kind", None),
        document_version=document.version if document else getattr(previous, "document_version", None),
        document_locale=document.locale if document else getattr(previous, "document_locale", None),
        choice=choice, valid_until=valid_until,
    ), db=db, commit=False)
    if purpose_key == SHARING_PURPOSE:
        grants = db.query(models.TeacherStudentGrant).filter(
            models.TeacherStudentGrant.student_username == principal.username,
            models.TeacherStudentGrant.teacher_username == teacher_username,
            models.TeacherStudentGrant.group_id == group_id,
            models.TeacherStudentGrant.basis.in_(("consent", "student_share")),
            models.TeacherStudentGrant.revoked_at.is_(None),
        ).all()
        for grant in grants:
            grant.revoked_at = now()
            grant.revoked_by = principal.username
        if choice == "given":
            db.add(models.TeacherStudentGrant(
                teacher_username=teacher_username, student_username=principal.username,
                group_id=group_id, basis="consent", categories=["notebook"],
                purposes=["teaching", "orientation"], valid_from=now(),
                valid_until=valid_until, consent_event_id=event.id,
            ))
        db.flush()
    return event


def grant_has_consent(db: Session, grant: models.TeacherStudentGrant) -> bool:
    """Re-check every read, including version barriers and revocation, without cache."""
    if not grant.consent_event_id:
        return False
    target = sharing_target(db, grant.teacher_username, grant.group_id)
    pid = safe_subject_pid(db, grant.student_username)
    latest = latest_choice(db, pid, SHARING_PURPOSE, target)
    return bool(latest and latest.id == grant.consent_event_id and has_consent(db, pid, SHARING_PURPOSE, target))


def record_legacy_choice(db: Session, *, source: str, subject: str | None = None,
                         choice: bool | None = None):
    """Observe the old clients, without treating inferred acceptance as P9 consent.

    The feedback client sends no checkbox: record its submission as an unverified
    consent observation. A random per-submission subject preserves anonymity.
    """
    if source not in ("survey_feedback", "administration_validation"):
        raise PolicyBlocked()
    if source == "administration_validation" and type(choice) is not bool:
        return None
    pid = safe_subject_pid(db, subject or uuid.uuid4().hex)
    return events.record_privacy_event(PrivacyEvent(
        subject_pid=pid, actor_pid=pid, actor_role=PrivacyRole.STUDENT,
        event_type="consent_refused" if choice is False else "consent_given",
        purpose=source, choice="refused" if choice is False else "given",
        target="legacy_client", categories_count={"unversioned": 1, "client_only": 1},
    ), db=db, commit=False)
