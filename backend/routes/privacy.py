"""Privacy Layer routes (P7, P9).

Includes audited break-glass access for technical administrators on L1.
"""
import re
from datetime import UTC, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas
from ..privacy import consent
from ..privacy.authz import principal_from_identity, safe_subject_pid
from ..privacy.errors import AuditUnavailable, PrivacyError
from ..privacy.events import record_privacy_event
from ..privacy.types import PrivacyEvent, PrivacyRole

router = APIRouter(tags=["privacy"])


@router.post("/privacy/break-glass", response_model=schemas.BreakGlassResponse)
async def create_break_glass(
    payload: schemas.BreakGlassRequest,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(database.get_db),
):
    """Emergency break-glass access for technical administrators on L1 (02 §5.3).

    Requires non-empty justification, max duration 24h, and mandatory privacy audit event.
    If the event cannot be recorded, access is denied (fail-closed).
    """
    admin_username = str(current_user.get("username") or "").strip()
    if not admin_username:
        raise HTTPException(status_code=403, detail="Amministratore non identificato")

    reason = (payload.reason or "").strip()
    if len(reason) < 5:
        raise HTTPException(status_code=400, detail="Motivo del break-glass obbligatorio (minimo 5 caratteri)")

    if payload.duration_hours > 24.0 or payload.duration_hours <= 0:
        raise HTTPException(status_code=400, detail="Durata massima del break-glass: 24 ore")

    now = datetime.now(UTC)
    valid_until = now + timedelta(hours=payload.duration_hours)

    # Fail-closed privacy event recording (P8 requirement)
    actor_pid = safe_subject_pid(db, admin_username)
    subject_pid = safe_subject_pid(db, payload.subject_username)

    event = PrivacyEvent(
        subject_pid=subject_pid,
        actor_pid=actor_pid,
        actor_role=PrivacyRole.ADMIN,
        event_type="break_glass",
        purpose="break_glass",
        target=f"{payload.resource_kind}:{payload.resource_id or '*'}",
        categories_count={"break_glass_hours": int(payload.duration_hours)},
    )
    try:
        record_privacy_event(event, db=db)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Break-glass negato: impossibile registrare l'evento di audit",
        ) from exc

    bg = models.PrivacyBreakGlass(
        admin_username=admin_username,
        resource_kind=payload.resource_kind,
        resource_id=payload.resource_id,
        subject_username=payload.subject_username,
        reason=reason,
        valid_from=now,
        valid_until=valid_until,
        revoked_at=None,
        revoked_by=None,
    )
    db.add(bg)
    db.commit()
    db.refresh(bg)

    return schemas.BreakGlassResponse(
        ok=True,
        break_glass_id=bg.id,
        admin_username=admin_username,
        subject_username=bg.subject_username,
        resource_kind=bg.resource_kind,
        resource_id=bg.resource_id,
        valid_from=bg.valid_from.isoformat(),
        valid_until=bg.valid_until.isoformat(),
    )


@router.post("/privacy/break-glass/{break_glass_id}/revoke")
async def revoke_break_glass(
    break_glass_id: int,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(database.get_db),
):
    """Revoke an active break-glass session early."""
    admin_username = str(current_user.get("username") or "").strip()
    bg = db.get(models.PrivacyBreakGlass, break_glass_id)
    if not bg:
        raise HTTPException(status_code=404, detail="Break-glass non trovato")

    if bg.admin_username != admin_username and not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Non autorizzato a revocare questo break-glass")

    now = datetime.now(UTC)
    bg.revoked_at = now
    bg.revoked_by = admin_username

    actor_pid = safe_subject_pid(db, admin_username)
    subject_pid = safe_subject_pid(db, bg.subject_username)
    event = PrivacyEvent(
        subject_pid=subject_pid,
        actor_pid=actor_pid,
        actor_role=PrivacyRole.ADMIN,
        event_type="grant_revoked",
        purpose="break_glass",
        target=f"{bg.resource_kind}:{bg.resource_id or '*'}",
    )
    try:
        record_privacy_event(event, db=db)
    except Exception:
        pass

    db.commit()
    return {"ok": True, "revoked": break_glass_id}


# P9: self-service choices; administrative/view-as identities cannot choose for others.

def _privacy_identity(identity: dict = Depends(auth.get_identity)):
    if not identity.get("authenticated") or not identity.get("username"):
        raise HTTPException(status_code=401, detail="privacy.errors.authentication_required")
    return identity


class PrivacyChoiceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document_id: int = Field(gt=0)
    granted: StrictBool
    teacher_username: str | None = Field(default=None, min_length=1, max_length=255)
    group_id: int | None = Field(default=None, gt=0)
    valid_until: datetime | None = None


class PrivacyWithdrawalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    teacher_username: str | None = Field(default=None, min_length=1, max_length=255)
    group_id: int | None = Field(default=None, gt=0)


class PrivacyNoticeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document_id: int = Field(gt=0)


_SHARING_TARGET = re.compile(r"^share:(\d+):([a-z2-7]{26})$")


def _sharing_revoke_fields(db, username: str, row):
    """Map the pseudonymous target back to its teacher for the subject's own share.

    P9 stores only ``share:{group_id}:{teacher_pid}`` in the audit target. The
    revocation API needs the username and group, so the identity is recovered
    from this student's grants and returned only inside their own choices.
    """
    if row.purpose != consent.SHARING_PURPOSE or not row.target:
        return {}
    match = _SHARING_TARGET.match(row.target)
    if not match:
        return {}
    group_id, teacher_pid = int(match.group(1)), match.group(2)
    grants = db.query(models.TeacherStudentGrant).filter(
        models.TeacherStudentGrant.student_username == username,
        models.TeacherStudentGrant.group_id == group_id,
    ).all()
    for grant in grants:
        if safe_subject_pid(db, grant.teacher_username) == teacher_pid:
            return {"teacher_username": grant.teacher_username, "group_id": group_id}
    return {}


def _privacy_error(db, exc):
    db.rollback()
    return HTTPException(status_code=503 if isinstance(exc, AuditUnavailable) else 403, detail=exc.code)


def _choice_response(event):
    return {
        "id": event.id, "purpose": event.purpose, "event_type": event.event_type,
        "choice": event.choice, "document_kind": event.document_kind,
        "document_version": event.document_version, "document_locale": event.document_locale, "target": event.target,
        "valid_until": event.valid_until, "created_at": event.created_at,
    }


@router.get("/privacy/documents")
async def privacy_documents(locale: str = "it", db: Session = Depends(database.get_db)):
    return {"documents": [{
        "id": d.id, "kind": d.kind, "version": d.version, "locale": d.locale,
        "content_hash": d.content_hash, "body_ref": d.body_ref,
        "published_at": d.published_at, "requires_new_consent": d.requires_new_consent,
    } for d in consent.current_documents(db, locale)], "validation_status": "[DA VALIDARE]"}


@router.get("/privacy/purposes")
async def privacy_purposes(db: Session = Depends(database.get_db)):
    return {"purposes": [{
        "key": p.key, "description_i18n": p.description_i18n,
        "legal_basis": p.legal_basis, "requires_consent": p.requires_consent,
        "active": p.active and p.legal_basis != "undefined",
        "retention_policy_key": p.retention_policy_key, "document_kind": p.document_kind,
    } for p in db.query(models.PrivacyPurpose).order_by(models.PrivacyPurpose.key).all()]}


@router.get("/privacy/choices")
async def privacy_choices(current_user: dict = Depends(_privacy_identity),
                          db: Session = Depends(database.get_db)):
    pid = safe_subject_pid(db, current_user["username"])
    rows = db.query(models.PrivacyEventRecord).filter(
        models.PrivacyEventRecord.subject_pid == pid,
        models.PrivacyEventRecord.event_type.in_((*consent.CHOICE_EVENTS, "notice_viewed")),
    ).order_by(models.PrivacyEventRecord.created_at.desc(), models.PrivacyEventRecord.id.desc()).all()
    current = {}
    for row in rows:
        if row.event_type in consent.CHOICE_EVENTS:
            key = (row.purpose, row.target or "")
            if key not in current:
                current[key] = {"purpose": row.purpose, "target": row.target,
                                "granted": consent.has_consent(db, pid, *key),
                                "choice": row.choice, "event_id": row.id,
                                **_sharing_revoke_fields(db, current_user["username"], row)}
    return {"choices": list(current.values()), "history": [_choice_response(row) for row in rows]}


@router.post("/privacy/notices")
async def privacy_notice(payload: PrivacyNoticeRequest,
                         current_user: dict = Depends(_privacy_identity),
                         db: Session = Depends(database.get_db)):
    try:
        event = consent.record_notice(db, principal_from_identity(current_user), payload.document_id)
        db.commit()
    except PrivacyError as exc:
        raise _privacy_error(db, exc) from None
    except SQLAlchemyError:
        raise _privacy_error(db, AuditUnavailable()) from None
    return _choice_response(event)


@router.post("/privacy/choices/{purpose}")
async def privacy_choose(purpose: str, payload: PrivacyChoiceRequest,
                         current_user: dict = Depends(_privacy_identity),
                         db: Session = Depends(database.get_db)):
    try:
        event = consent.record_choice(
            db, principal_from_identity(current_user), purpose,
            "given" if payload.granted else "refused", document_id=payload.document_id,
            teacher_username=payload.teacher_username, group_id=payload.group_id,
            valid_until=payload.valid_until,
        )
        db.commit()
    except PrivacyError as exc:
        raise _privacy_error(db, exc) from None
    except SQLAlchemyError:
        raise _privacy_error(db, AuditUnavailable()) from None
    return _choice_response(event)


@router.post("/privacy/choices/{purpose}/revoke")
async def privacy_withdraw(purpose: str, payload: PrivacyWithdrawalRequest,
                           current_user: dict = Depends(_privacy_identity),
                           db: Session = Depends(database.get_db)):
    try:
        event = consent.record_choice(
            db, principal_from_identity(current_user), purpose, "withdrawn",
            teacher_username=payload.teacher_username, group_id=payload.group_id,
        )
        db.commit()
    except PrivacyError as exc:
        raise _privacy_error(db, exc) from None
    except SQLAlchemyError:
        raise _privacy_error(db, AuditUnavailable()) from None
    return _choice_response(event)
