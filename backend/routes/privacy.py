"""Privacy Layer routes (P7, P9).

Includes audited break-glass access for technical administrators on L1.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas
from ..privacy.authz import safe_subject_pid
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

    now = datetime.now(timezone.utc)
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

    now = datetime.now(timezone.utc)
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
