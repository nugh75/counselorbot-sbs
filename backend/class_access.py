from __future__ import annotations

"""Resolved class access: what a user may use now (plan §5.1, #89).

One resolver backs every guard. The admin platform layer comes first
(instrument active, student audience). Students with an active membership in
an active class then get the union of their classes' settings: a tool is
enabled if at least one class enables it. Staff and users with no class get
the admin layer only. Reads of existing data are never guarded (decision 8).

A student with classes picks the active view (#146): the class view (default,
the union above), one class only, or the full view, which drops the class layer
from every guard. The choice lives in `AccountPreferences.class_view`.
"""
import re
from types import SimpleNamespace
from typing import Any, Optional, Tuple, Union

from fastapi import HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import auth, models
from .class_tools import (
    ALWAYS_ON,
    GUIDED_PATH_KEYS,
    PERSONAL_TOOL_KEYS,
    builtin_guided_paths,
)


class ToolAccessDenied(HTTPException):
    """403 with the tool key next to the detail; plain 403 if no handler is set."""

    def __init__(self, detail: str, tool: str):
        super().__init__(status_code=403, detail=detail)
        self.tool = tool


async def tool_access_denied_handler(_request, exc: ToolAccessDenied) -> JSONResponse:
    return JSONResponse(status_code=403, content={"detail": exc.detail, "tool": exc.tool})


class CounselorAccessDenied(HTTPException):
    """403 with the refused counselor id; plain 403 if no handler is set."""

    def __init__(self, counselor_id):
        super().__init__(status_code=403, detail="counselor_disabled_for_class")
        self.counselor_id = counselor_id


async def counselor_access_denied_handler(_request, exc: CounselorAccessDenied) -> JSONResponse:
    return JSONResponse(status_code=403, content={"detail": exc.detail, "counselor_id": exc.counselor_id})


def _username(identity) -> str:
    return str(identity.get("username") or "").strip() if identity.get("authenticated") else ""


def is_staff(identity) -> bool:
    return bool(identity.get("is_admin") or identity.get("is_researcher")
                or auth.is_teacher(identity.get("groups")))


def _active_classes(db: Session, username: str) -> list[tuple[int, Optional[models.ClassSettings]]]:
    """Active classes of the user, most recently joined first."""
    if not username:
        return []
    rows = (
        db.query(models.GroupMembership.group_id, models.ClassSettings)
        .join(models.StudentGroup, models.StudentGroup.id == models.GroupMembership.group_id)
        .outerjoin(models.ClassSettings, models.ClassSettings.group_id == models.GroupMembership.group_id)
        .filter(models.GroupMembership.username == username, models.StudentGroup.is_active.is_(True))
        .order_by(models.GroupMembership.created_at.desc(), models.GroupMembership.id.desc())
        .all()
    )
    classes = []
    for group_id, settings in rows:
        classes.append((group_id, settings))
    return classes


FULL_VIEW = "all"
CLASS_VIEW = "classes"

# Forum options available in class settings (ADR-0002, F1 forum moderation).
# Each option maps to a `forum_<name>` column on ClassSettings.
FORUM_OPTIONS = ["students_can_open", "premoderation"]


def _scoped_classes(db: Session, username: str, classes) -> tuple[list[Any], Union[str, int]]:
    """Classes that filter access under the stored view, and the effective view.

    A stale choice (class left or deactivated) falls back to the class view.
    """
    prefs = db.get(models.AccountPreferences, username) if classes else None
    stored = (prefs.class_view or "") if prefs else ""
    if stored == FULL_VIEW:
        return [], FULL_VIEW
    if stored.isdigit():
        chosen = [item for item in classes if item[0] == int(stored)]
        if chosen:
            return chosen, int(stored)
    return classes, CLASS_VIEW


def save_view(db: Session, identity, view: Union[str, int]) -> None:
    username = _username(identity)
    if not username:
        return
    db.execute(
        models.AccountPreferences.__table__.update()
        .where(models.AccountPreferences.username == username)
        .values(class_view=view)
    )
    db.commit()


def class_enables(settings: Optional[models.ClassSettings], key: str) -> bool:
    """Admin lock first (decision 21), then the teacher's deny-list."""
    if settings is None:
        return True
    lock = (settings.locked_tool_keys or {}).get(key)
    if isinstance(lock, dict) and "enabled" in lock:
        return bool(lock["enabled"])
    return key not in (settings.disabled_tool_keys or [])


def _class_enables_counselor(settings: Optional[models.ClassSettings], counselor_id: int) -> bool:
    """Same precedence as tools; lock keys are counselor ids as strings."""
    if settings is None:
        return True
    lock = (settings.locked_counselor_ids or {}).get(str(counselor_id))
    if isinstance(lock, dict) and "enabled" in lock:
        return bool(lock["enabled"])
    return counselor_id not in (settings.disabled_counselor_ids or [])


def forum_option(settings: Optional[models.ClassSettings], name: str) -> tuple[bool, bool]:
    """(effective value, locked) of a forum option; an admin lock wins (decision 21)."""
    lock = (settings.locked_forum_options or {}).get(name) if settings is not None else None
    if isinstance(lock, dict) and "value" in lock:
        return bool(lock["value"]), True
    return bool(getattr(settings, f"forum_{name}", False)) if settings is not None else False, False
