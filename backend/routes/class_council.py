"""Class council link (#422): a password-protected, expiring, read-only class overview.

The teacher creates the link and sees the password once; any signed-in user
with link and password reads the overview until it expires or is revoked.
"""
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..class_council import council_overview
from ..group_visibility import _is_admin, _username
from .groups import _require_visible_group

router = APIRouter()
get_db = database.get_db

# No look-alike characters: the password is often dictated or copied by hand.
PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
PASSWORD_LENGTH = 10
MAX_FAILED_ATTEMPTS = 10
LOCKOUT = timedelta(minutes=15)


class CouncilLinkCreate(BaseModel):
    days: int = Field(ge=1, le=90)


class CouncilView(BaseModel):
    password: str = Field(min_length=1, max_length=72)


def _now():
    return datetime.now(timezone.utc)


def _state(link: models.ClassCouncilLink, now: datetime) -> str:
    if link.revoked_at:
        return "revoked"
    return "expired" if link.expires_at <= now else "active"


def _serialize(link: models.ClassCouncilLink, now: datetime) -> dict:
    return {
        "id": link.id,
        "token": link.token,
        "created_by": link.created_by,
        "created_at": link.created_at.isoformat() if link.created_at else None,
        "expires_at": link.expires_at.isoformat(),
        "revoked_at": link.revoked_at.isoformat() if link.revoked_at else None,
        "last_viewed_at": link.last_viewed_at.isoformat() if link.last_viewed_at else None,
        "state": _state(link, now),
    }


def _require_owner(identity, group: models.StudentGroup) -> None:
    if not _is_admin(identity) and group.owner_username != _username(identity):
        raise HTTPException(status_code=403, detail="council_link_owner_only")


@router.get("/teacher/groups/{group_id}/council-links")
async def list_council_links(group_id: int, current_user=Depends(auth.get_current_plan_manager),
                             db: Session = Depends(get_db)):
    _require_visible_group(db, current_user, group_id)
    now = _now()
    rows = (
        db.query(models.ClassCouncilLink)
        .filter(models.ClassCouncilLink.group_id == group_id)
        .order_by(models.ClassCouncilLink.id.desc())
        .all()
    )
    return [_serialize(row, now) for row in rows]


@router.post("/teacher/groups/{group_id}/council-links")
async def create_council_link(group_id: int, payload: CouncilLinkCreate,
                              current_user=Depends(auth.get_current_plan_manager),
                              db: Session = Depends(get_db)):
    group = _require_visible_group(db, current_user, group_id)
    _require_owner(current_user, group)
    password = "".join(secrets.choice(PASSWORD_ALPHABET) for _ in range(PASSWORD_LENGTH))
    now = _now()
    link = models.ClassCouncilLink(
        group_id=group.id,
        token=secrets.token_urlsafe(24),
        password_hash=models.get_password_hash(password),
        created_by=_username(current_user) or "",
        expires_at=now + timedelta(days=payload.days),
        failed_attempts=0,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    # The only response that ever carries the password.
    return {**_serialize(link, now), "password": password}


@router.delete("/teacher/council-links/{link_id}")
async def revoke_council_link(link_id: int, current_user=Depends(auth.get_current_plan_manager),
                              db: Session = Depends(get_db)):
    link = db.query(models.ClassCouncilLink).filter(models.ClassCouncilLink.id == link_id).with_for_update().first()
    if link is None:
        raise HTTPException(status_code=404, detail="council_link_not_found")
    group = _require_visible_group(db, current_user, link.group_id)
    _require_owner(current_user, group)
    if link.revoked_at is None:
        link.revoked_at = _now()
        db.commit()
    return _serialize(link, _now())


@router.post("/council/{token}")
async def view_council_link(token: str, payload: CouncilView, current_user=Depends(auth.get_current_user),
                            db: Session = Depends(get_db)):
    now = _now()
    link = db.query(models.ClassCouncilLink).filter(models.ClassCouncilLink.token == token).with_for_update().first()
    # Unknown, revoked and expired links answer alike.
    if link is None or _state(link, now) != "active":
        raise HTTPException(status_code=404, detail="council_link_unavailable")
    group = db.get(models.StudentGroup, link.group_id)
    if group is None or not group.is_active:
        raise HTTPException(status_code=404, detail="council_link_unavailable")
    if (link.failed_attempts >= MAX_FAILED_ATTEMPTS and link.last_failed_at
            and now - link.last_failed_at < LOCKOUT):
        raise HTTPException(status_code=429, detail="council_link_locked")
    if not models.verify_password(payload.password, link.password_hash):
        link.failed_attempts = (link.failed_attempts or 0) + 1
        link.last_failed_at = now
        db.commit()
        raise HTTPException(status_code=403, detail="council_link_wrong_password")
    link.failed_attempts = 0
    link.last_viewed_at = now
    db.add(models.Log(
        session_id=f"council-{link.id}",
        action="class_council_view",
        username=_username(current_user),
        details={"group_id": group.id, "link_id": link.id},
    ))
    db.commit()
    return {**council_overview(db, group), "expires_at": link.expires_at.isoformat()}
