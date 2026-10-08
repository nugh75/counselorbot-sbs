"""Resolved class access: what a user may use now (plan §5.1, #89).

One resolver backs every guard. The admin platform layer comes first
(instrument active, student audience). Students with an active membership in
an active class then get the union of their classes' settings: a tool is
enabled if at least one class enables it. Staff and users with no class get the
admin layer only. Reads of existing data are never guarded (decision 8).
"""
import re
from types import SimpleNamespace

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


def require_tool(db: Session, identity, tool_key: str | None, *, preview: bool = False) -> None:
    """Guard for every start/write entry point of a tool.

    Keys that are neither instruments nor personal tools (generic chat, legacy
    types) are not toggleable and pass. Instrument codes match case-insensitively
    so a client cannot dodge the guard by changing case. The global disable binds
    admins too, except in the admin sandbox preview (decisions 5/21, C4), which
    the chat routes already restrict to admins.
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
        if preview and identity.get("is_admin"):
            return
        for row in rows:
            if not row.is_active or (row.target_audience != "student" and not is_staff(identity)):
                raise ToolAccessDenied("tool_unavailable", row.code)
    if is_staff(identity):
        return
    classes = _active_classes(db, _username(identity))
    if classes and not any(_class_enables(settings, canonical) for _, settings in classes):
        raise ToolAccessDenied("tool_disabled_for_class", canonical)


# Generic prompts are not instrument prompts: they never name an owner.
GENERIC_PROMPT_KEYS = frozenset({"prompt_generic"})


def _default_steps():
    from . import prompt_config
    for name, value in vars(prompt_config).items():
        if name.startswith("DEFAULT_") and name.endswith("GUIDED_STEPS"):
            for step in value:
                yield SimpleNamespace(id=step.get("id"), system_prompt_mode=step.get("system_prompt_mode"),
                                      questionnaire_type=step.get("questionnaire_type"))


def prompt_owners(db: Session, prompt_key: str | None) -> set[str]:
    """Instruments whose guided flow uses `prompt_key` as its system prompt.

    Owners come from the default and stored guided steps (entry prompt and the
    follow-up prompt of the step mode) and from the per-instrument config keys
    (`prompt_meta_<CODE>`, `prompt_components_<CODE>_…`, `prompt_guidance_<CODE>_…`).
    """
    from .chat_logic import FOLLOW_UP_MODE_BY_STEP_MODE, MODE_TO_SYSTEM_PROMPT_KEY, guided_step_system_prompt_key
    from .prompt_variants import base_key
    # A stored variant is the same instrument prompt at another context level.
    key = base_key((prompt_key or "").strip())
    if not key or key in GENERIC_PROMPT_KEYS:
        return set()
    owners = set()
    for step in [*_default_steps(), *db.query(models.GuidedStep).all()]:
        if not step.questionnaire_type:
            continue
        follow_up = MODE_TO_SYSTEM_PROMPT_KEY.get(FOLLOW_UP_MODE_BY_STEP_MODE.get(step.system_prompt_mode))
        if key in (guided_step_system_prompt_key(step), follow_up):
            owners.add(step.questionnaire_type)
    upper = key.upper()
    for (code,) in db.query(models.Instrument.code):
        q = re.sub(r"[^A-Za-z0-9_-]+", "-", code.strip().upper())
        for base in (f"PROMPT_META_{q}", f"PROMPT_COMPONENTS_{q}", f"PROMPT_GUIDANCE_{q}"):
            if upper == base or upper.startswith(base + "_"):
                owners.add(code)
    return {owner for owner in owners if owner.strip().upper() != "GENERIC"}


def _ownerless_prompt_keys(db: Session) -> set[str]:
    """Prompts the server selects without an instrument: generic, known modes, guided phases, steps."""
    from .chat_logic import GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS, MODE_TO_SYSTEM_PROMPT_KEY, guided_step_system_prompt_key
    keys = {*GENERIC_PROMPT_KEYS, *MODE_TO_SYSTEM_PROMPT_KEY.values()}
    keys.update(definition["key"] for definition in GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS.values())
    keys.update(guided_step_system_prompt_key(step) for step in [*_default_steps(), *db.query(models.GuidedStep).all()])
    return keys


def require_chat_turn(db: Session, identity, instrument: str | None, prompt_key: str | None,
                      *, preview: bool = False, mode: str | None = None) -> None:
    """Guard a model turn by its instrument and by the prompt the server selected.

    The client's `questionnaire_type` and `mode` are claims: an omitted, unknown
    or mismatched instrument must not reach a disabled instrument prompt. When
    the prompt belongs to the turn's instrument, the instrument guard suffices;
    otherwise at least one owner of the prompt must be allowed. A raw `prompt_*`
    `mode` whose owner cannot be resolved fails closed for students.
    """
    from .prompt_variants import base_key
    require_tool(db, identity, instrument, preview=preview)
    owners = prompt_owners(db, prompt_key)
    claimed = (instrument or "").strip().lower()
    key = (prompt_key or "").strip()
    raw = key.startswith("prompt_") and key == (mode or "").strip()
    if not owners and raw and not is_staff(identity) and not (preview and identity.get("is_admin")) \
            and base_key(key) not in _ownerless_prompt_keys(db):
        raise ToolAccessDenied("tool_unavailable", key)
    if not owners or claimed in {owner.lower() for owner in owners}:
        return
    denied = None
    for owner in sorted(owners):
        try:
            require_tool(db, identity, owner, preview=preview)
            return
        except ToolAccessDenied as exc:
            denied = denied or exc
    raise denied
