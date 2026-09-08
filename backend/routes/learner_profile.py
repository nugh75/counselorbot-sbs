"""Taccuino dello studente: modello del discente auto-dichiarato (open learner model).

Nella UI si chiama "taccuino" (da non confondere con il "profilo", che è
l'esito a fattori dei questionari). Append-only: ogni POST crea una
revisione; il taccuino corrente è l'ultima.
Lo studente vede, modifica e cancella il proprio modello (trasparenza).
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from .. import auth, models, schemas
from ..database import get_db
from ..memory_service import session_memory

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


def _ensure_revision_owner(db: Session, username: str, revision_id: Optional[int]) -> None:
    if revision_id is None:
        return
    exists = (
        db.query(models.LearnerProfileRevision.id)
        .filter(
            models.LearnerProfileRevision.id == revision_id,
            models.LearnerProfileRevision.username == username,
        )
        .first()
    )
    if not exists:
        raise HTTPException(status_code=404, detail="Revisione profilo non trovata")


@router.get("/user/learner-profile", response_model=Optional[schemas.LearnerProfileResponse])
async def get_learner_profile(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Profilo corrente (ultima revisione) dell'utente autenticato, o null."""
    return _latest_revision(db, current_user["username"])


@router.get("/user/learner-profile/suggestion")
async def get_learner_profile_suggestion(
    session_id: str = Query(min_length=1, max_length=200),
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Proposta stabile basata soltanto sui contenuti espliciti della sessione."""
    owns_session = (
        db.query(models.Log.id)
        .filter(
            models.Log.session_id == session_id,
            models.Log.username == current_user["username"],
        )
        .first()
    )
    if not owns_session:
        raise HTTPException(status_code=404, detail="Sessione non trovata")
    return session_memory.get_notebook_suggestion(session_id)


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


@router.get("/user/learner-profile/reflections", response_model=List[schemas.LearnerProfileReflectionResponse])
async def get_learner_profile_reflections(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Note dello studente sui cambiamenti del proprio profilo."""
    return (
        db.query(models.LearnerProfileReflection)
        .filter(models.LearnerProfileReflection.username == current_user["username"])
        .order_by(models.LearnerProfileReflection.created_at.desc(), models.LearnerProfileReflection.id.desc())
        .limit(MAX_HISTORY_REVISIONS)
        .all()
    )


@router.post("/user/learner-profile/reflections", response_model=schemas.LearnerProfileReflectionResponse)
async def save_learner_profile_reflection(
    payload: schemas.LearnerProfileReflectionCreate,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Salva una riflessione libera collegata al confronto tra revisioni."""
    username = current_user["username"]
    _ensure_revision_owner(db, username, payload.current_revision_id)
    _ensure_revision_owner(db, username, payload.previous_revision_id)
    reflection = models.LearnerProfileReflection(
        username=username,
        note=payload.note,
        current_revision_id=payload.current_revision_id,
        previous_revision_id=payload.previous_revision_id,
        session_id=payload.session_id,
    )
    db.add(reflection)
    db.commit()
    db.refresh(reflection)
    return reflection


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
    removed_reflections = (
        db.query(models.LearnerProfileReflection)
        .filter(models.LearnerProfileReflection.username == current_user["username"])
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted_revisions": removed, "deleted_reflections": removed_reflections}


class AccountPreferencesSave(BaseModel):
    counselor_id: Optional[int] = None
    complete_setup: bool = False


def _account_preferences(db: Session, username: str):
    prefs = db.get(models.AccountPreferences, username)
    counselor_id = prefs.counselor_id if prefs else None
    if prefs is None:
        previous = (db.query(models.OrientationSession)
                    .filter(models.OrientationSession.username == username,
                            models.OrientationSession.counselor_id.isnot(None))
                    .order_by(models.OrientationSession.created_at.desc()).first())
        if previous:
            counselor_id = previous.counselor_id
        else:
            frozen = (db.query(models.FrozenSession)
                      .filter(models.FrozenSession.username == username)
                      .order_by(models.FrozenSession.updated_at.desc()).first())
            if frozen:
                counselor_id = (frozen.data or {}).get("counselor_id")
    counselor = db.get(models.Counselor, counselor_id) if counselor_id else None
    revision = _latest_revision(db, username)
    notebook_ready = bool((prefs and prefs.notebook_completed) or
                          (revision and any(str(v or "").strip() for v in revision.data.values())))
    return {
        "counselor_id": counselor_id,
        "counselor_ready": bool(counselor and counselor.is_active),
        "notebook_ready": notebook_ready,
        "setup_completed": bool(prefs and prefs.notebook_completed),
    }


@router.get("/user/account-preferences")
async def get_account_preferences(current_user: dict = Depends(auth.get_current_user),
                                  db: Session = Depends(get_db)):
    return _account_preferences(db, current_user["username"])


@router.put("/user/account-preferences")
async def save_account_preferences(payload: AccountPreferencesSave,
                                   current_user: dict = Depends(auth.get_current_user),
                                   db: Session = Depends(get_db)):
    username = current_user["username"]
    state = _account_preferences(db, username)
    counselor_id = payload.counselor_id if payload.counselor_id is not None else state["counselor_id"]
    counselor = db.get(models.Counselor, counselor_id) if counselor_id else None
    if not counselor or not counselor.is_active:
        raise HTTPException(status_code=422, detail="Choose an active counselor")
    if payload.complete_setup and not state["notebook_ready"]:
        raise HTTPException(status_code=422, detail="Complete the notebook first")
    prefs = db.get(models.AccountPreferences, username)
    if prefs is None:
        prefs = models.AccountPreferences(username=username)
        db.add(prefs)
    prefs.counselor_id = counselor_id
    prefs.notebook_completed = state["notebook_ready"]
    db.commit()
    return _account_preferences(db, username)
