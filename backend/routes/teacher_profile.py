"""Taccuino del docente: auto-descrizione del suo ruolo professionale.

Specchio ridotto del taccuino dello studente (routes/learner_profile.py):
salvataggi espliciti append-only, nessun autosalvataggio, storico delle
revisioni. Il contesto entra solo nella chat guidata docenza via
`teacher_context.teacher_notebook_context`. Ruolo: docenti, ricercatori,
admin (come la gestione piani/classi).
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import auth, models, schemas
from ..database import get_db

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_HISTORY_REVISIONS = 50


@router.get("/user/teacher-notebook", response_model=Optional[schemas.TeacherProfileResponse])
async def get_teacher_notebook(
    current_user: dict = Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Ultima revisione del taccuino del docente autenticato, o null."""
    username = current_user["username"]
    return (
        db.query(models.TeacherProfileRevision)
        .filter(models.TeacherProfileRevision.username == username)
        .order_by(models.TeacherProfileRevision.created_at.desc(), models.TeacherProfileRevision.id.desc())
        .first()
    )


@router.post("/user/teacher-notebook", response_model=schemas.TeacherProfileResponse)
async def save_teacher_notebook(
    payload: schemas.TeacherProfileSave,
    current_user: dict = Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Salvataggio esplicito: crea una revisione, lo storico resta leggibile.

    Contenuti identici all'ultima revisione non generano duplicati."""
    username = current_user["username"]
    data = {
        key: value
        for key in schemas.TEACHER_PROFILE_FIELDS
        if (value := getattr(payload, key)) is not None
    }
    latest = (
        db.query(models.TeacherProfileRevision)
        .filter(models.TeacherProfileRevision.username == username)
        .order_by(models.TeacherProfileRevision.created_at.desc(), models.TeacherProfileRevision.id.desc())
        .first()
    )
    if latest is not None and latest.data == data:
        return latest
    revision = models.TeacherProfileRevision(username=username, data=data, source="manual")
    db.add(revision)
    db.commit()
    db.refresh(revision)
    return revision


@router.get("/user/teacher-notebook/history", response_model=List[schemas.TeacherProfileResponse])
async def get_teacher_notebook_history(
    current_user: dict = Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Revisioni esplicite dalla più recente."""
    username = current_user["username"]
    return (
        db.query(models.TeacherProfileRevision)
        .filter(models.TeacherProfileRevision.username == username)
        .order_by(models.TeacherProfileRevision.created_at.desc(), models.TeacherProfileRevision.id.desc())
        .limit(MAX_HISTORY_REVISIONS)
        .all()
    )


@router.delete("/user/teacher-notebook")
async def delete_teacher_notebook(
    current_user: dict = Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Cancella il taccuino del docente e tutto lo storico."""
    username = current_user["username"]
    removed = (
        db.query(models.TeacherProfileRevision)
        .filter(models.TeacherProfileRevision.username == username)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted_revisions": removed}
