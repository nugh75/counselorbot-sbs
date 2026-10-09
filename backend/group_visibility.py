"""Which classes a staff identity may manage: owned or shared with them.

Kept apart from the class routes so the forum boundary can scope staff
classes without importing the class-management router and its dependencies.
"""
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from . import models


def _username(identity) -> Optional[str]:
    value = (identity.get("username") if isinstance(identity, dict) else getattr(identity, "username", "")) or ""
    return str(value).strip() or None


def _is_admin(identity) -> bool:
    return bool(identity.get("is_admin") if isinstance(identity, dict) else getattr(identity, "is_admin", False))


def _visible_group_query(db: Session, identity):
    query = db.query(models.StudentGroup)
    if _is_admin(identity):
        return query
    username = _username(identity)
    # Proprietario o condivisa (shared_with_username e' salvato lowercase)
    shared_ids = db.query(models.GroupShare.group_id).filter(
        models.GroupShare.shared_with_username == (username or "").lower()
    )
    return query.filter(
        or_(
            models.StudentGroup.owner_username == username,
            models.StudentGroup.id.in_(shared_ids),
        )
    )
