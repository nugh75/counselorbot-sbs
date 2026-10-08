"""Percorsi di classe (Class paths) — Gestione docente (Bozze).

Consente al docente di creare e gestire percorsi di classe composti da step ordinati
scelti tra gli strumenti attualmente abilitati per la classe.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas
from ..class_tools import ALWAYS_ON, tool_catalog

router = APIRouter()
get_db = database.get_db


# Strumenti personali che NON hanno completamento automatico (lo studente segna come fatto).
SELF_MARK_PERSONAL_KEYS = frozenset({
    "actions",
    "timeline",
    "portfolio",
    "flashcards",
    "cards",
    "comparison",
    "assistant",
})

# Strumenti personali con completamento automatico.
AUTO_DETECT_PERSONAL_KEYS = frozenset({
    "bussola",
    "tavolo",
    "goals",
    "pqbl",
})


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
    shared_ids = db.query(models.GroupShare.group_id).filter(
        models.GroupShare.shared_with_username == (username or "").lower()
    )
    return query.filter(
        or_(
            models.StudentGroup.owner_username == username,
            models.StudentGroup.id.in_(shared_ids),
        )
    )


def _require_visible_group(db: Session, identity, group_id: int, *, for_update: bool = False) -> models.StudentGroup:
    query = _visible_group_query(db, identity).filter(models.StudentGroup.id == group_id)
    if for_update:
        query = query.with_for_update()
    group = query.first()
    if not group:
        raise HTTPException(status_code=403, detail="Class path access denied")
    return group


def is_auto_detect_tool(db: Session, tool_key: str) -> bool:
    """Verifica se uno strumento supporta il completamento automatico (plan §4.2)."""
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
    """Insieme delle chiavi strumento attualmente abilitate per la classe (escluse always_on)."""
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


# --- Endpoints gestione percorsi di classe (Docente / Ricercatore / Admin) ---


@router.get("/teacher/groups/{group_id}/paths")
async def list_class_paths(
    group_id: int,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Elenco di tutti i percorsi di una classe (bozze, pubblicati, archiviati)."""
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
    """Crea una nuova bozza di percorso di classe."""
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
    """Dettaglio di un percorso di classe con i relativi passi attivi ordinati."""
    path = db.get(models.ClassPath, path_id)
    if not path:
        raise HTTPException(status_code=404, detail="Percorso di classe non trovato")
    _require_visible_group(db, current_user, path.group_id)
    return _serialize_path(db, path, include_steps=True)


@router.put("/teacher/paths/{path_id}")
async def update_class_path(
    path_id: int,
    payload: schemas.ClassPathUpdate,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Aggiorna metadati e passi di un percorso di classe (con controllo revisione e tool abilitati)."""
    path = (
        db.query(models.ClassPath)
        .filter(models.ClassPath.id == path_id)
        .with_for_update()
        .first()
    )
    if not path:
        raise HTTPException(status_code=404, detail="Percorso di classe non trovato")
    _require_visible_group(db, current_user, path.group_id, for_update=True)

    if payload.revision != path.revision:
        raise HTTPException(status_code=409, detail="Class path revision mismatch")

    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=422, detail="Title is required")

    mode = payload.mode or "recommended"
    if mode not in ("recommended", "strict"):
        raise HTTPException(status_code=422, detail="Mode must be 'recommended' or 'strict'")

    # Controllo che ogni strumento nei passi sia abilitato per la classe (plan §5.2)
    enabled_tool_keys = get_class_enabled_tool_keys(db, path.group_id)
    for step_input in payload.steps:
        if step_input.tool_key not in enabled_tool_keys:
            raise HTTPException(
                status_code=422,
                detail=f"Tool '{step_input.tool_key}' is not enabled for this class",
            )

    # Gestione passi: soft-remove per gli ID assenti e riordino per indice nell'array
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

    # Soft-remove dei passi mancanti
    for s in existing_steps:
        if s.id not in submitted_ids:
            s.removed_at = func.now()

    # Aggiornamento o inserimento dei passi nell'ordine fornito
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
            # Controllo se appartiene a questo percorso ed era stato precedentemente rimosso
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
    """Archivia un percorso di classe."""
    path = db.get(models.ClassPath, path_id)
    if not path:
        raise HTTPException(status_code=404, detail="Percorso di classe non trovato")
    _require_visible_group(db, current_user, path.group_id, for_update=True)
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
    """Ripristina un percorso archiviato allo stato precedente."""
    path = db.get(models.ClassPath, path_id)
    if not path:
        raise HTTPException(status_code=404, detail="Percorso di classe non trovato")
    _require_visible_group(db, current_user, path.group_id, for_update=True)
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
    """Elimina definitivamente una bozza di percorso di classe."""
    path = db.get(models.ClassPath, path_id)
    if not path:
        raise HTTPException(status_code=404, detail="Percorso di classe non trovato")
    _require_visible_group(db, current_user, path.group_id, for_update=True)
    db.query(models.ClassPathStep).filter(models.ClassPathStep.path_id == path.id).delete()
    db.delete(path)
    db.commit()
    return {"ok": True, "deleted": path_id}
