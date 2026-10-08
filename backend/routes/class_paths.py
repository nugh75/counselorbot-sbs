"""Class paths — Teacher management (Drafts).

Allows teachers to create and manage class paths composed of ordered steps
selected from the tools currently enabled for the class.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas
from ..class_tools import ALWAYS_ON, tool_catalog
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
    db.query(models.ClassPathStep).filter(models.ClassPathStep.path_id == path.id).delete()
    db.delete(path)
    db.commit()
    return {"ok": True, "deleted": path_id}
