"""Modello del discente auto-dichiarato (open learner model).

Append-only: ogni POST crea una revisione; il profilo corrente è l'ultima.
Lo studente vede, modifica e cancella il proprio modello (trasparenza).
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import auth, models, schemas
from ..database import get_db

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_HISTORY_REVISIONS = 50


def _latest_revision(db: Session, username: str) -> Optional[models.LearnerProfileRevision]:
    return (
        db.query(models.LearnerProfileRevision)
        .filter(models.LearnerProfileRevision.username == username)
        .order_by(models.LearnerProfileRevision.created_at.desc(), models.LearnerProfileRevision.id.desc())
        .first()
    )


@router.get("/user/learner-profile", response_model=Optional[schemas.LearnerProfileResponse])
async def get_learner_profile(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Profilo corrente (ultima revisione) dell'utente autenticato, o null."""
    return _latest_revision(db, current_user["username"])


@router.post("/user/learner-profile", response_model=schemas.LearnerProfileResponse)
async def save_learner_profile(
    payload: schemas.LearnerProfileSave,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Crea una nuova revisione. Se i dati sono identici all'ultima (es. lo
    studente conferma senza modifiche) non duplica: ritorna la revisione esistente."""
    data = {
        key: value
        for key in schemas.LEARNER_PROFILE_FIELDS
        if (value := getattr(payload, key)) is not None
    }
    latest = _latest_revision(db, current_user["username"])
    if latest is not None and latest.data == data:
        return latest
    revision = models.LearnerProfileRevision(
        username=current_user["username"],
        data=data,
        source=payload.source,
        session_id=payload.session_id,
    )
    db.add(revision)
    db.commit()
    db.refresh(revision)
    return revision


@router.get("/user/learner-profile/history", response_model=List[schemas.LearnerProfileResponse])
async def get_learner_profile_history(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Storico del cambiamento: revisioni dalla più recente."""
    return (
        db.query(models.LearnerProfileRevision)
        .filter(models.LearnerProfileRevision.username == current_user["username"])
        .order_by(models.LearnerProfileRevision.created_at.desc(), models.LearnerProfileRevision.id.desc())
        .limit(MAX_HISTORY_REVISIONS)
        .all()
    )


@router.delete("/user/learner-profile")
async def delete_learner_profile(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Cancella il profilo e tutto lo storico dell'utente."""
    removed = (
        db.query(models.LearnerProfileRevision)
        .filter(models.LearnerProfileRevision.username == current_user["username"])
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted_revisions": removed}
