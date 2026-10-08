"""Resolved class access: what a user may use now (plan §5.1, #89).

One resolver backs every guard. The admin platform layer comes first
(instrument active, student audience). Students with an active membership in
an active class then get the union of their classes' settings: a tool is
enabled if at least one class enables it. Staff and users with no class get the
admin layer only. Reads of existing data are never guarded (decision 8).
"""
from fastapi import HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import auth, models
from .class_tools import ALWAYS_ON, PERSONAL_TOOL_KEYS


class ToolAccessDenied(HTTPException):
    """403 with the tool key next to the detail; plain 403 if no handler is set."""

    def __init__(self, detail: str, tool: str):
        super().__init__(status_code=403, detail=detail)
        self.tool = tool


async def tool_access_denied_handler(_request, exc: ToolAccessDenied) -> JSONResponse:
    return JSONResponse(status_code=403, content={"detail": exc.detail, "tool": exc.tool})


def _username(identity) -> str:
    return str(identity.get("username") or "").strip() if identity.get("authenticated") else ""


def is_staff(identity) -> bool:
    return bool(identity.get("is_admin") or identity.get("is_researcher")
                or auth.is_teacher(identity.get("groups")))


def _active_classes(db: Session, username: str) -> list[tuple[int, models.ClassSettings | None]]:
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
    seen, classes = set(), []
    for group_id, settings in rows:
        if group_id not in seen:
            seen.add(group_id)
            classes.append((group_id, settings))
    return classes


def _class_enables(settings: models.ClassSettings | None, key: str) -> bool:
    """Admin lock first (decision 21), then the teacher's deny-list."""
    if settings is None:
        return True
    lock = (settings.locked_tool_keys or {}).get(key)
    if isinstance(lock, dict) and "enabled" in lock:
        return bool(lock["enabled"])
    return key not in (settings.disabled_tool_keys or [])


def _admin_tool_keys(db: Session) -> list[str]:
    reserved = [*PERSONAL_TOOL_KEYS, *ALWAYS_ON]
    codes = [code for (code,) in db.query(models.Instrument.code).filter(
        models.Instrument.is_active.is_(True),
        models.Instrument.target_audience == "student",
        models.Instrument.code.notin_(reserved),
    ).order_by(models.Instrument.code)]
    return codes + list(PERSONAL_TOOL_KEYS) + sorted(ALWAYS_ON)


def resolve_access(db: Session, identity) -> dict:
    """GET /user/access payload. Counselor fields stay null until S6 (#93)."""
    admin_keys = _admin_tool_keys(db)
    classes = [] if is_staff(identity) else _active_classes(db, _username(identity))
    if classes:
        tool_keys = [key for key in admin_keys
                     if key in ALWAYS_ON or any(_class_enables(settings, key) for _, settings in classes)]
    else:
        tool_keys = admin_keys
    return {
        "restricted": bool(classes),
        "tool_keys": tool_keys,
        "counselor_ids": None,
        "default_counselor_id": None,
        "class_ids": [group_id for group_id, _ in classes],
    }


def require_tool(db: Session, identity, tool_key: str | None) -> None:
    """Guard for every start/write entry point of a tool.

    Keys that are neither instruments nor personal tools (generic chat, legacy
    types) are not toggleable and pass. Instrument codes match case-insensitively
    so a client cannot dodge the guard by changing case.
    """
    key = (tool_key or "").strip()
    if not key or key in ALWAYS_ON:
        return
    if key in PERSONAL_TOOL_KEYS:
        canonical = key
    else:
        rows = db.query(models.Instrument).filter(func.lower(models.Instrument.code) == key.lower()).all()
        rows = [row for row in rows if row.code == key] or rows
        if not rows:
            return
        canonical = rows[0].code
        # Platform admins configure the catalog and test drafts in the sandbox.
        if identity.get("is_admin"):
            return
        for row in rows:
            if not row.is_active or (row.target_audience != "student" and not is_staff(identity)):
                raise ToolAccessDenied("tool_unavailable", row.code)
    if is_staff(identity):
        return
    classes = _active_classes(db, _username(identity))
    if classes and not any(_class_enables(settings, canonical) for _, settings in classes):
        raise ToolAccessDenied("tool_disabled_for_class", canonical)
