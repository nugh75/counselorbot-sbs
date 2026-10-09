"""Class paths — Teacher management (Drafts).

Allows teachers to create and manage class paths composed of ordered steps
selected from the tools currently enabled for the class.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas
from ..class_access import resolve_access
from ..class_path_completion import has_automatic_evidence
from ..class_tools import ALWAYS_ON, PERSONAL_TOOL_KEYS, tool_catalog
from .groups import _is_admin, _username, _visible_group_query

router = APIRouter()
get_db = database.get_db


# Personal tools that do not support auto-detection (students self-mark as completed).
SELF_MARK_PERSONAL_KEYS = frozenset({
    "actions",
    "timeline",
    "portfolio",
    "flashcards",
    "cards",
    "comparison",
    "assistant",
})

# Personal tools that support auto-detection.
AUTO_DETECT_PERSONAL_KEYS = frozenset({
    "bussola",
    "tavolo",
    "goals",
    "pqbl",
})

TOOL_START_HREFS = {
    "tavolo": "/profilo/tavolo",
    "goals": "/profilo/obiettivi",
    "actions": "/profilo/azioni",
    "timeline": "/profilo/timeline",
    "portfolio": "/profilo/portfolio",
    "pqbl": "/profilo/pqbl",
    "flashcards": "/profilo/flashcard",
    "cards": "/profilo/carte",
    "comparison": "/profilo/confronto",
    "bussola": "/bussola",
    "assistant": "/assistente",
}


def get_tool_start_href(tool_key: str) -> str:
    key_lower = (tool_key or "").strip().lower()
    if key_lower in TOOL_START_HREFS:
        return TOOL_START_HREFS[key_lower]
    return f"/?start={tool_key}"


def is_tool_available_for_class(db: Session, group_id: int, tool_key: str) -> bool:
    """Check whether a tool is active and enabled for the given class."""
    key_lower = (tool_key or "").strip().lower()
    if key_lower in ALWAYS_ON:
        return True

    settings = db.get(models.ClassSettings, group_id)
    if key_lower in PERSONAL_TOOL_KEYS:
        if settings:
            lock = (settings.locked_tool_keys or {}).get(key_lower)
            if isinstance(lock, dict) and "enabled" in lock:
                return bool(lock["enabled"])
            if key_lower in (settings.disabled_tool_keys or []):
                return False
        return True

    instrument = (
        db.query(models.Instrument)
        .filter(func.lower(models.Instrument.code) == key_lower)
        .first()
    )
    if not instrument or not instrument.is_active or instrument.target_audience != "student":
        return False
    if settings:
        lock = (settings.locked_tool_keys or {}).get(instrument.code)
        if isinstance(lock, dict) and "enabled" in lock:
            return bool(lock["enabled"])
        if instrument.code in (settings.disabled_tool_keys or []):
            return False
    return True



def _require_visible_group(db: Session, identity, group_id: int, *, for_update: bool = False) -> models.StudentGroup:
    query = _visible_group_query(db, identity).filter(models.StudentGroup.id == group_id)
    if for_update:
        query = query.with_for_update()
    group = query.first()
    if not group:
        raise HTTPException(status_code=403, detail="Class path access denied")
    return group


def _require_visible_path(
    db: Session,
    identity,
    path_id: int,
    *,
    for_update: bool = False,
) -> models.ClassPath:
    query = db.query(models.ClassPath).filter(models.ClassPath.id == path_id)
    if for_update:
        query = query.with_for_update()
    path = query.first()
    if not path:
        raise HTTPException(status_code=403, detail="Class path access denied")
    _require_visible_group(db, identity, path.group_id, for_update=for_update)
    return path


def is_auto_detect_tool(db: Session, tool_key: str) -> bool:
    """Check whether a tool supports automatic completion detection (plan §4.2)."""
    key_lower = tool_key.lower()
    if key_lower in SELF_MARK_PERSONAL_KEYS:
        return False
    if key_lower in AUTO_DETECT_PERSONAL_KEYS:
        return True
    if tool_key.upper() == "IDEA":
        return True
    instrument = db.query(models.Instrument).filter(models.Instrument.code == tool_key).first()
    if instrument:
        return True
    return False


def get_class_enabled_tool_keys(db: Session, group_id: int) -> set[str]:
    """Return tool keys currently enabled for the class (excluding always_on tools)."""
    settings = db.get(models.ClassSettings, group_id)
    disabled_keys = settings.disabled_tool_keys if settings else []
    catalog = tool_catalog(db, disabled_keys)
    return {
        row["key"] for row in catalog
        if row["enabled"] and not row.get("always_on", False) and row["key"] not in ALWAYS_ON
    }


def _serialize_step(db: Session, step: models.ClassPathStep) -> dict:
    auto = is_auto_detect_tool(db, step.tool_key)
    return {
        "id": step.id,
        "path_id": step.path_id,
        "position": step.position,
        "tool_key": step.tool_key,
        "title": step.title,
        "instructions": step.instructions,
        "due_date": step.due_date.isoformat() if step.due_date else None,
        "auto_detect": auto,
        "can_self_mark": not auto,
    }


def _serialize_path(db: Session, path: models.ClassPath, *, include_steps: bool = True) -> dict:
    steps_query = (
        db.query(models.ClassPathStep)
        .filter(
            models.ClassPathStep.path_id == path.id,
            models.ClassPathStep.removed_at.is_(None),
        )
        .order_by(models.ClassPathStep.position.asc(), models.ClassPathStep.id.asc())
    )
    steps = steps_query.all() if include_steps else []
    return {
        "id": path.id,
        "group_id": path.group_id,
        "title": path.title,
        "description": path.description,
        "mode": path.mode,
        "status": path.status,
        "published_at": path.published_at.isoformat() if path.published_at else None,
        "created_by": path.created_by,
        "revision": path.revision,
        "steps": [_serialize_step(db, s) for s in steps] if include_steps else [],
        "steps_count": len(steps) if include_steps else steps_query.count(),
        "created_at": path.created_at.isoformat() if path.created_at else None,
        "updated_at": path.updated_at.isoformat() if path.updated_at else None,
        "archived_at": path.archived_at.isoformat() if path.archived_at else None,
    }


def _active_steps(db: Session, path_id: int) -> list[models.ClassPathStep]:
    return (
        db.query(models.ClassPathStep)
        .filter(
            models.ClassPathStep.path_id == path_id,
            models.ClassPathStep.removed_at.is_(None),
        )
        .order_by(models.ClassPathStep.position.asc(), models.ClassPathStep.id.asc())
        .all()
    )


def _load_marks(
    db: Session,
    step_ids: list[int],
    usernames: list[str],
) -> dict[tuple[int, str], dict[str, models.ClassPathProgress]]:
    """Explicit marks keyed by (step_id, username), then by source."""
    if not step_ids or not usernames:
        return {}
    rows = (
        db.query(models.ClassPathProgress)
        .filter(
            models.ClassPathProgress.step_id.in_(step_ids),
            models.ClassPathProgress.username.in_(usernames),
        )
        .all()
    )
    marks: dict[tuple[int, str], dict[str, models.ClassPathProgress]] = {}
    for row in rows:
        marks.setdefault((row.step_id, row.username), {})[row.source] = row
    return marks


def _resolve_cells(
    db: Session,
    path: models.ClassPath,
    steps: list[models.ClassPathStep],
    username: str,
    *,
    available: dict[int, bool],
    auto: dict[int, bool],
    marks: dict[tuple[int, str], dict[str, models.ClassPathProgress]],
) -> tuple[list[dict], int, int, Optional[int]]:
    """Resolve one student's steps; returns (cells, done, total, next_step_id).

    Resolution per step: teacher mark > student mark > automatic evidence >
    not done (plan §4.2). Unavailable steps are excluded from the ratio.
    """
    cells = []
    for step in steps:
        by_source = marks.get((step.id, username), {})
        teacher = by_source.get("teacher")
        mark = None
        if not available[step.id]:
            state, source = "unavailable", None
        else:
            mark = teacher or by_source.get("student")
            if mark:
                state, source = mark.state, mark.source
            elif auto[step.id] and has_automatic_evidence(db, step.tool_key, username, path.published_at):
                state, source = "done", "automatic"
            else:
                state, source = "not_done", None
        cells.append({"step": step, "state": state, "source": source, "mark": mark, "teacher": teacher})

    available_cells = [c for c in cells if c["state"] != "unavailable"]
    next_step_id = next((c["step"].id for c in available_cells if c["state"] != "done"), None)

    # Strict mode: a step counts only once every earlier step is done, so
    # every step after the first undone one renders locked (path only:
    # tool access is unchanged).
    if path.mode == "strict" and next_step_id is not None:
        found_next = False
        for c in available_cells:
            if found_next:
                c["state"], c["source"], c["mark"] = "locked", None, None
            if c["step"].id == next_step_id:
                found_next = True

    done = sum(1 for c in available_cells if c["state"] == "done")
    return cells, done, len(available_cells), next_step_id


# --- Class path management endpoints (Teacher / Researcher / Admin) ---


@router.get("/teacher/groups/{group_id}/paths")
async def list_class_paths(
    group_id: int,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """List all paths for a class (drafts, published, archived)."""
    _require_visible_group(db, current_user, group_id)
    paths = (
        db.query(models.ClassPath)
        .filter(models.ClassPath.group_id == group_id)
        .order_by(models.ClassPath.created_at.desc())
        .all()
    )
    return [_serialize_path(db, p, include_steps=True) for p in paths]


@router.post("/teacher/groups/{group_id}/paths")
async def create_class_path(
    group_id: int,
    payload: schemas.ClassPathCreate,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Create a new class path draft."""
    _require_visible_group(db, current_user, group_id, for_update=True)
    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=422, detail="Title is required")
    mode = payload.mode or "recommended"
    if mode not in ("recommended", "strict"):
        raise HTTPException(status_code=422, detail="Mode must be 'recommended' or 'strict'")

    path = models.ClassPath(
        group_id=group_id,
        title=title,
        description=(payload.description or "").strip() or None,
        mode=mode,
        status="draft",
        created_by=_username(current_user) or "",
        revision=1,
    )
    db.add(path)
    db.commit()
    db.refresh(path)
    return _serialize_path(db, path)


@router.get("/teacher/paths/{path_id}")
async def get_class_path(
    path_id: int,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Retrieve details for a class path including active ordered steps."""
    path = _require_visible_path(db, current_user, path_id)
    return _serialize_path(db, path, include_steps=True)


@router.put("/teacher/paths/{path_id}")
async def update_class_path(
    path_id: int,
    payload: schemas.ClassPathUpdate,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Update metadata and steps for a class path (with revision check and tool validation)."""
    path = _require_visible_path(db, current_user, path_id, for_update=True)

    if payload.revision != path.revision:
        raise HTTPException(status_code=409, detail="Class path revision mismatch")

    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=422, detail="Title is required")

    mode = payload.mode or "recommended"
    if mode not in ("recommended", "strict"):
        raise HTTPException(status_code=422, detail="Mode must be 'recommended' or 'strict'")

    # Verify that each tool in the steps is enabled for the class (plan §5.2)
    enabled_tool_keys = get_class_enabled_tool_keys(db, path.group_id)
    for step_input in payload.steps:
        if step_input.tool_key not in enabled_tool_keys:
            raise HTTPException(
                status_code=422,
                detail=f"Tool '{step_input.tool_key}' is not enabled for this class",
            )

    # Manage steps: soft-remove missing IDs and reorder by array index
    existing_steps = (
        db.query(models.ClassPathStep)
        .filter(
            models.ClassPathStep.path_id == path.id,
            models.ClassPathStep.removed_at.is_(None),
        )
        .all()
    )
    existing_by_id = {s.id: s for s in existing_steps}
    submitted_ids = {s.id for s in payload.steps if s.id is not None}

    # Soft-remove omitted steps
    for s in existing_steps:
        if s.id not in submitted_ids:
            s.removed_at = func.now()

    # Update or insert steps in the provided order
    for position, step_input in enumerate(payload.steps, start=1):
        step_title = (step_input.title or "").strip() or None
        step_instructions = (step_input.instructions or "").strip() or None
        if step_input.id is not None and step_input.id in existing_by_id:
            step = existing_by_id[step_input.id]
            step.position = position
            step.tool_key = step_input.tool_key
            step.title = step_title
            step.instructions = step_instructions
            step.due_date = step_input.due_date
        elif step_input.id is not None:
            # Check if the step belongs to this path and was previously removed
            archived_step = (
                db.query(models.ClassPathStep)
                .filter(models.ClassPathStep.id == step_input.id, models.ClassPathStep.path_id == path.id)
                .first()
            )
            if archived_step:
                archived_step.removed_at = None
                archived_step.position = position
                archived_step.tool_key = step_input.tool_key
                archived_step.title = step_title
                archived_step.instructions = step_instructions
                archived_step.due_date = step_input.due_date
            else:
                raise HTTPException(status_code=422, detail=f"Step ID {step_input.id} does not belong to this path")
        else:
            new_step = models.ClassPathStep(
                path_id=path.id,
                position=position,
                tool_key=step_input.tool_key,
                title=step_title,
                instructions=step_instructions,
                due_date=step_input.due_date,
            )
            db.add(new_step)

    path.title = title
    path.description = (payload.description or "").strip() or None
    path.mode = mode
    path.revision += 1
    db.commit()
    db.refresh(path)
    return _serialize_path(db, path, include_steps=True)


@router.post("/teacher/paths/{path_id}/publish")
async def publish_class_path(
    path_id: int,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Publish a class path (records published_at once on first publication)."""
    path = _require_visible_path(db, current_user, path_id, for_update=True)
    path.status = "published"
    if path.published_at is None:
        path.published_at = func.now()
    path.archived_at = None
    path.revision += 1
    db.commit()
    db.refresh(path)
    return _serialize_path(db, path, include_steps=True)


@router.post("/teacher/paths/{path_id}/archive")
async def archive_class_path(
    path_id: int,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Archive a class path."""
    path = _require_visible_path(db, current_user, path_id, for_update=True)
    path.status = "archived"
    path.archived_at = func.now()
    path.revision += 1
    db.commit()
    db.refresh(path)
    return _serialize_path(db, path, include_steps=True)


@router.post("/teacher/paths/{path_id}/restore")
async def restore_class_path(
    path_id: int,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Restore an archived class path to its previous status."""
    path = _require_visible_path(db, current_user, path_id, for_update=True)
    path.status = "draft" if path.published_at is None else "published"
    path.archived_at = None
    path.revision += 1
    db.commit()
    db.refresh(path)
    return _serialize_path(db, path, include_steps=True)


@router.delete("/teacher/paths/{path_id}")
async def delete_class_path(
    path_id: int,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Permanently delete a class path draft."""
    path = _require_visible_path(db, current_user, path_id, for_update=True)
    step_ids = [
        s.id for s in db.query(models.ClassPathStep.id).filter(models.ClassPathStep.path_id == path.id).all()
    ]
    if step_ids:
        db.query(models.ClassPathProgress).filter(models.ClassPathProgress.step_id.in_(step_ids)).delete(
            synchronize_session=False
        )
    db.query(models.ClassPathStep).filter(models.ClassPathStep.path_id == path.id).delete()
    db.delete(path)
    db.commit()
    return {"ok": True, "deleted": path_id}


def _require_published(path: models.ClassPath) -> None:
    if path.published_at is None:
        raise HTTPException(status_code=422, detail="Class path is not published")


def _teacher_cell(cell: dict) -> dict:
    mark = cell["mark"]
    teacher = cell["teacher"]
    return {
        "step_id": cell["step"].id,
        "state": cell["state"],
        "source": cell["source"],
        "at": mark.created_at.isoformat() if mark and mark.created_at else None,
        "actor": mark.actor_username if mark else None,
        "reason": mark.reason if mark else None,
        "teacher_state": teacher.state if teacher else None,
    }


def _path_context(db: Session, path: models.ClassPath, usernames: list[str]):
    steps = _active_steps(db, path.id)
    available = {s.id: is_tool_available_for_class(db, path.group_id, s.tool_key) for s in steps}
    auto = {s.id: is_auto_detect_tool(db, s.tool_key) for s in steps}
    marks = _load_marks(db, [s.id for s in steps], usernames)
    return steps, available, auto, marks


@router.get("/teacher/paths/{path_id}/progress")
async def get_class_path_progress(
    path_id: int,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Students × steps matrix of a published path; current members only (plan §5.2)."""
    path = _require_visible_path(db, current_user, path_id)
    _require_published(path)

    usernames = [
        row.username
        for row in db.query(models.GroupMembership.username)
        .filter(models.GroupMembership.group_id == path.group_id)
        .distinct()
        .order_by(models.GroupMembership.username)
        .all()
    ]
    names = dict(
        db.query(models.UserDisplayName.username, models.UserDisplayName.display_name)
        .filter(models.UserDisplayName.username.in_(usernames))
        .all()
    ) if usernames else {}
    steps, available, auto, marks = _path_context(db, path, usernames)

    done_count = {s.id: 0 for s in steps}
    students = []
    for username in usernames:
        cells, done, total, _next = _resolve_cells(
            db, path, steps, username, available=available, auto=auto, marks=marks)
        for cell in cells:
            if cell["state"] == "done":
                done_count[cell["step"].id] += 1
        students.append({
            "username": username,
            "display_name": names.get(username) or username,
            "cells": [_teacher_cell(c) for c in cells],
            "done": done,
            "total": total,
        })

    return {
        "path_id": path.id,
        "group_id": path.group_id,
        "title": path.title,
        "mode": path.mode,
        "status": path.status,
        "published_at": path.published_at.isoformat() if path.published_at else None,
        "steps": [
            {**_serialize_step(db, s), "available": available[s.id], "done_count": done_count[s.id]}
            for s in steps
        ],
        "students": students,
    }


@router.put("/teacher/paths/{path_id}/steps/{step_id}/progress/{username}")
async def override_class_path_progress(
    path_id: int,
    step_id: int,
    username: str,
    payload: schemas.ClassPathProgressOverride,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Teacher mark/unmark of a step for one student, or `clear` to drop the override."""
    path = _require_visible_path(db, current_user, path_id, for_update=True)
    _require_published(path)

    step = (
        db.query(models.ClassPathStep)
        .filter(
            models.ClassPathStep.id == step_id,
            models.ClassPathStep.path_id == path.id,
            models.ClassPathStep.removed_at.is_(None),
        )
        .first()
    )
    if not step:
        raise HTTPException(status_code=404, detail="Class path step not found")
    member = (
        db.query(models.GroupMembership.id)
        .filter(models.GroupMembership.group_id == path.group_id, models.GroupMembership.username == username)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Student is not a member of this class")
    if payload.state != "clear" and not is_tool_available_for_class(db, path.group_id, step.tool_key):
        raise HTTPException(status_code=422, detail="Tool is not available")

    row = (
        db.query(models.ClassPathProgress)
        .filter(
            models.ClassPathProgress.step_id == step.id,
            models.ClassPathProgress.username == username,
            models.ClassPathProgress.source == "teacher",
        )
        .first()
    )
    if payload.state == "clear":
        if row:
            db.delete(row)
    else:
        if not row:
            row = models.ClassPathProgress(step_id=step.id, username=username, source="teacher")
            db.add(row)
        row.state = payload.state
        row.actor_username = _username(current_user) or ""
        row.reason = (payload.reason or "").strip() or None
        row.created_at = func.now()
    db.commit()

    steps, available, auto, marks = _path_context(db, path, [username])
    cells, _done, _total, _next = _resolve_cells(
        db, path, steps, username, available=available, auto=auto, marks=marks)
    cell = next(c for c in cells if c["step"].id == step.id)
    return {"username": username, **_teacher_cell(cell)}


# --- Student endpoints (/user/paths) ---


@router.get("/user/paths", response_model=list[schemas.StudentClassPath])
async def list_student_class_paths(
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Return published class paths for the current user's active classes (plan §5.2)."""
    username = _username(current_user)
    if not username:
        return []

    active_groups = (
        db.query(models.StudentGroup)
        .join(models.GroupMembership, models.GroupMembership.group_id == models.StudentGroup.id)
        .filter(
            models.GroupMembership.username == username,
            models.StudentGroup.is_active.is_(True),
        )
        .all()
    )
    if not active_groups:
        return []

    group_map = {g.id: g.name for g in active_groups}
    group_ids = list(group_map.keys())

    paths = (
        db.query(models.ClassPath)
        .filter(
            models.ClassPath.group_id.in_(group_ids),
            models.ClassPath.status == "published",
        )
        .order_by(models.ClassPath.created_at.desc())
        .all()
    )

    access = resolve_access(db, current_user)
    user_tools = set(access.get("tool_keys", []))
    user_tools_lower = {t.lower() for t in user_tools}

    result = []
    for path in paths:
        steps = _active_steps(db, path.id)
        available = {
            s.id: is_tool_available_for_class(db, path.group_id, s.tool_key) and (
                s.tool_key.strip().lower() in user_tools_lower or s.tool_key in user_tools
            )
            for s in steps
        }
        auto = {s.id: is_auto_detect_tool(db, s.tool_key) for s in steps}
        marks = _load_marks(db, [s.id for s in steps], [username])
        cells, done, total, next_step_id = _resolve_cells(
            db, path, steps, username, available=available, auto=auto, marks=marks)

        result.append({
            "id": path.id,
            "group_id": path.group_id,
            "group_name": group_map.get(path.group_id, ""),
            "title": path.title,
            "description": path.description,
            "mode": path.mode,
            "steps": [
                {
                    "id": cell["step"].id,
                    "tool_key": cell["step"].tool_key,
                    "title": cell["step"].title,
                    "instructions": cell["step"].instructions,
                    "due_date": cell["step"].due_date,
                    "state": cell["state"],
                    "source": cell["source"],
                    "start_href": get_tool_start_href(cell["step"].tool_key),
                    "can_self_mark": available[cell["step"].id] and not auto[cell["step"].id],
                }
                for cell in cells
            ],
            "next_step_id": next_step_id,
            "done": done,
            "total": total,
        })

    return result


def _require_student_step_access(
    db: Session,
    identity,
    path_id: int,
    step_id: int,
) -> tuple[models.ClassPath, models.ClassPathStep]:
    username = _username(identity)
    if not username:
        raise HTTPException(status_code=403, detail="Class path access denied")

    path = db.get(models.ClassPath, path_id)
    if not path or path.status != "published":
        raise HTTPException(status_code=403, detail="Class path access denied")

    membership = (
        db.query(models.GroupMembership)
        .join(models.StudentGroup, models.StudentGroup.id == models.GroupMembership.group_id)
        .filter(
            models.GroupMembership.group_id == path.group_id,
            models.GroupMembership.username == username,
            models.StudentGroup.is_active.is_(True),
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Class path access denied")

    step = (
        db.query(models.ClassPathStep)
        .filter(
            models.ClassPathStep.id == step_id,
            models.ClassPathStep.path_id == path.id,
            models.ClassPathStep.removed_at.is_(None),
        )
        .first()
    )
    if not step:
        raise HTTPException(status_code=404, detail="Class path step not found")

    if not is_tool_available_for_class(db, path.group_id, step.tool_key):
        raise HTTPException(status_code=422, detail="Tool is not available")

    if is_auto_detect_tool(db, step.tool_key):
        raise HTTPException(
            status_code=422,
            detail="Step has automatic completion and cannot be self-marked",
        )

    return path, step


@router.post("/user/paths/{path_id}/steps/{step_id}/done", response_model=schemas.ClassPathProgressResponse)
async def mark_step_done(
    path_id: int,
    step_id: int,
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a class path step as completed by the student."""
    username = _username(current_user)
    _path, step = _require_student_step_access(db, current_user, path_id, step_id)

    prog = (
        db.query(models.ClassPathProgress)
        .filter(
            models.ClassPathProgress.step_id == step.id,
            models.ClassPathProgress.username == username,
            models.ClassPathProgress.source == "student",
        )
        .first()
    )
    if prog:
        prog.state = "done"
        prog.created_at = func.now()
        prog.actor_username = username
    else:
        prog = models.ClassPathProgress(
            step_id=step.id,
            username=username,
            state="done",
            source="student",
            actor_username=username,
        )
        db.add(prog)

    db.commit()
    return {"ok": True, "step_id": step.id, "state": "done", "source": "student"}


@router.delete("/user/paths/{path_id}/steps/{step_id}/done", response_model=schemas.ClassPathProgressResponse)
async def unmark_step_done(
    path_id: int,
    step_id: int,
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Remove student self-mark completion for a class path step."""
    username = _username(current_user)
    _path, step = _require_student_step_access(db, current_user, path_id, step_id)

    prog = (
        db.query(models.ClassPathProgress)
        .filter(
            models.ClassPathProgress.step_id == step.id,
            models.ClassPathProgress.username == username,
            models.ClassPathProgress.source == "student",
        )
        .first()
    )
    if prog:
        db.delete(prog)
        db.commit()

    return {"ok": True, "step_id": step.id, "state": "not_done", "source": None}

