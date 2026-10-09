"""Class paths — Teacher management (Drafts).

Allows teachers to create and manage class paths composed of ordered steps
selected from the tools currently enabled for the class.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas
from ..class_access import class_enables, resolve_access
from ..path_step_types import (step_descriptor, completion_evidence, validate_step_input, validate_composition,
                               apply_step_target, administration_target)
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
    """Check whether a tool is active and enabled for the given class.

    The class rule is the access resolver's (`class_access`), so the paths tab
    and the student view agree with /user/access (bug 838e6852).
    """
    key_lower = (tool_key or "").strip().lower()
    if key_lower in ALWAYS_ON:
        return True
    if key_lower in PERSONAL_TOOL_KEYS:
        canonical = key_lower
    else:
        instrument = (
            db.query(models.Instrument)
            .filter(func.lower(models.Instrument.code) == key_lower)
            .first()
        )
        if not instrument or not instrument.is_active or instrument.target_audience != "student":
            return False
        canonical = instrument.code
    return class_enables(db.get(models.ClassSettings, group_id), canonical)


def _require_visible_group(db: Session, identity, group_id: int, *, for_update: bool = False) -> models.StudentGroup:
    query = _visible_group_query(db, identity).filter(models.StudentGroup.id == group_id)
    if for_update:
        query = query.populate_existing().with_for_update()
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
        query = query.populate_existing().with_for_update()
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
    descriptor = step_descriptor(db, db.get(models.ClassPath, step.path_id), step)
    auto = descriptor["auto_detect"]
    return {
        "step_type": step.step_type,
        "administration_plan_id": step.administration_plan_id,
        "results_step_id": step.results_step_id,
        "assignment_id": step.assignment_id,
        "active_from": step.active_from,
        "target_summary": descriptor["target_summary"],
        "availability_reason": descriptor["availability_reason"],
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
        evidence = None
        if not available[step.id]:
            state, source = "unavailable", None
        else:
            mark = teacher or (by_source.get("student") if step.step_type == "tool" else None)
            if mark:
                state, source = mark.state, mark.source
            elif auto[step.id] and (evidence := completion_evidence(db, path, step, username)):
                state, source = "done", "automatic"
            else:
                state, source = "not_done", None
        cells.append({"step": step, "state": state, "source": source, "mark": mark, "teacher": teacher, "evidence": evidence})

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

    for step_input in payload.steps:
        validate_step_input(db, path, step_input)
    validate_composition(db, path, payload.steps)
    ids = [row.id for row in payload.steps if row.id is not None]
    if len(ids) != len(set(ids)):
        raise HTTPException(422, "duplicate_step_id")
    # Validate every identity before mutating any row.
    for value in payload.steps:
        if value.id is not None:
            step = db.query(models.ClassPathStep).filter_by(id=value.id, path_id=path.id).first()
            if not step:
                raise HTTPException(422, "step_path_mismatch")
            from ..path_step_types import target_identity
            if step.active_from is not None and target_identity(step) != target_identity(value):
                raise HTTPException(409, "activated_step_target_immutable")

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
            apply_step_target(step, step_input)
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
                apply_step_target(archived_step, step_input)
                if archived_step.active_from is None and path.status == "published":
                    archived_step.active_from = datetime.now(timezone.utc)
                archived_step.title = step_title
                archived_step.instructions = step_instructions
                archived_step.due_date = step_input.due_date
            else:
                raise HTTPException(status_code=422, detail=f"Step ID {step_input.id} does not belong to this path")
        else:
            new_step = models.ClassPathStep(
                path_id=path.id,
                position=position,
                step_type=step_input.step_type,
                tool_key=step_input.tool_key if step_input.step_type == "tool" else None,
                administration_plan_id=step_input.administration_plan_id if step_input.step_type == "questionnaire_administration" else None,
                results_step_id=step_input.results_step_id if step_input.step_type == "guided_results_chat" else None,
                assignment_id=step_input.assignment_id if step_input.step_type == "assignment" else None,
                active_from=datetime.now(timezone.utc) if path.status == "published" else None,
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
    activation = datetime.now(timezone.utc)
    for step in _active_steps(db, path.id):
        descriptor = step_descriptor(db, path, step)
        if not descriptor["available"]:
            raise HTTPException(409, descriptor["availability_reason"])
        if step.active_from is None:
            step.active_from = activation
    path.status = "published"
    if path.published_at is None:
        path.published_at = activation
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
    # The teacher's own mark stays visible on locked or unavailable cells.
    teacher = cell["teacher"]
    mark = teacher or cell["mark"]
    return {
        "completion_kind": cell["evidence"]["kind"] if cell["evidence"] else None,
        "completion_at": cell["evidence"]["at"] if cell["evidence"] else None,
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
    descriptors = {s.id: step_descriptor(db, path, s) for s in steps}
    available = {s.id: descriptors[s.id]["available"] for s in steps}
    auto = {s.id: descriptors[s.id]["auto_detect"] for s in steps}
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
    if payload.state != "clear" and not step_descriptor(db, path, step)["available"]:
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
        descriptors = {s.id: step_descriptor(db, path, s) for s in steps}
        available = {s.id: descriptors[s.id]["available"] and
                     (descriptors[s.id]["instrument_code"] or "").lower() in user_tools_lower for s in steps}
        auto = {s.id: descriptors[s.id]["auto_detect"] for s in steps}
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
                    **_serialize_step(db, cell["step"]),
                    "completion_kind": cell["evidence"]["kind"] if cell["evidence"] else None,
                    "completion_at": cell["evidence"]["at"] if cell["evidence"] else None,
                    "id": cell["step"].id,
                    "tool_key": cell["step"].tool_key,
                    "title": cell["step"].title,
                    "instructions": cell["step"].instructions,
                    "due_date": cell["step"].due_date,
                    "state": cell["state"],
                    "source": cell["source"],
                    "start_href": descriptors[cell["step"].id]["start_href"],
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

    if not step_descriptor(db, path, step)["available"]:
        raise HTTPException(status_code=422, detail="Tool is not available")

    if step.step_type != "tool" or is_auto_detect_tool(db, step.tool_key):
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



def require_step_launch(db, identity, path_id, step_id, *, for_update=False):
    """Authorization/order seam shared by launch and administration entry writers."""
    username = _username(identity)
    query = db.query(models.ClassPath).filter_by(id=path_id, status="published")
    if for_update:
        query = query.populate_existing().with_for_update()
    path = query.first()
    if not username or not path:
        raise HTTPException(403, "class_path_access_denied")
    group = db.get(models.StudentGroup, path.group_id)
    if not group or not group.is_active or not db.query(models.GroupMembership.id).filter_by(group_id=group.id, username=username).first():
        raise HTTPException(403, "class_path_access_denied")
    steps, available, auto, marks = _path_context(db, path, [username])
    step = next((row for row in steps if row.id == step_id), None)
    if not step:
        raise HTTPException(404, "class_path_step_not_found")
    descriptor = step_descriptor(db, path, step)
    if not available[step.id]:
        raise HTTPException(409, descriptor["availability_reason"])
    from ..class_access import require_tool
    require_tool(db, identity, descriptor["instrument_code"])
    cells, *_ = _resolve_cells(db, path, steps, username, available=available, auto=auto, marks=marks)
    if next(cell for cell in cells if cell["step"].id == step_id)["state"] == "locked":
        raise HTTPException(409, "class_path_step_locked")
    return path, step, descriptor


@router.post("/user/paths/{path_id}/steps/{step_id}/launch")
async def launch_step(path_id: int, step_id: int, current_user=Depends(auth.get_current_user), db: Session=Depends(get_db)):
    path, step, descriptor = require_step_launch(db, current_user, path_id, step_id)
    if step.step_type == "tool":
        return {"step_type":"tool", "start_href":descriptor["start_href"]}
    if step.step_type == "guided_results_chat":
        return {"step_type":step.step_type, "path_id":path.id, "step_id":step.id,
                "results_step_id":step.results_step_id, "start_href":descriptor["start_href"]}
    if step.step_type == "assignment":
        # Opening the assignment is not evidence: only its explicit submission is.
        return {"step_type":step.step_type, "path_id":path.id, "step_id":step.id,
                "assignment_id":step.assignment_id, "start_href":descriptor["start_href"]}
    from ..path_step_types import EXTERNAL_IT_HREF
    plan, institution = administration_target(db, path.group_id, step.administration_plan_id)
    return {"step_type":step.step_type, "path_id":path.id, "step_id":step.id, "administration_plan_id":plan.id,
            "instrument_code":plan.instrument_code, "locale":plan.locale, "delivery_mode":plan.delivery_mode,
            "external_href":EXTERNAL_IT_HREF if plan.delivery_mode == "external_it" else None,
            "score_factors":[{"code":factor.code, "label_i18n":factor.label_i18n or {}, "label_it":factor.label_it,
                              "label_en":factor.label_en} for factor in db.query(models.Factor).filter_by(
                                  instrument_code=plan.instrument_code).order_by(models.Factor.sort_order, models.Factor.id)],
            "institution":{"id":institution.id, "name":institution.name, "institution_code":institution.institution_code}}


@router.post("/user/paths/{path_id}/steps/{step_id}/guided-entry")
async def guided_entry(path_id: int, step_id: int, payload: schemas.AdministrationGuidedEntryInput,
                       current_user=Depends(auth.get_current_user), db: Session=Depends(get_db)):
    from ..questionnaire_entry import accept_guided_entry
    return accept_guided_entry(db, current_user, path_id, step_id, payload)


@router.post("/user/paths/{path_id}/steps/{step_id}/score")
async def score_step(path_id: int, step_id: int, payload: schemas.AdministrationRunnerInput,
                     current_user=Depends(auth.get_current_user), db: Session=Depends(get_db)):
    from ..questionnaire_entry import score_in_app_step
    return score_in_app_step(db, current_user, path_id, step_id, payload)


@router.post("/user/paths/{path_id}/steps/{step_id}/deep-dive")
async def start_deep_dive(path_id: int, step_id: int,
                          current_user=Depends(auth.get_current_user), db: Session=Depends(get_db)):
    from ..results_deep_dive import start_results_deep_dive
    return start_results_deep_dive(db, current_user, path_id, step_id)
