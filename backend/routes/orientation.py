"""API studente per la Bussola CounselorBot."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, validator
from sqlalchemy.orm import Session

from .. import auth, models, schemas
from ..database import get_db
from ..orientation import NOTEBOOK_FIELDS, analyze_turn, normalize_language
from .learner_profile import _latest_revision

router = APIRouter()

MAX_MESSAGES = 40
MAX_MESSAGE_CHARS = 4000

WELCOME = {
    "it": "Sono la Bussola di CounselorBot. Ti spiego come funziona la piattaforma e, partendo da ciò che vuoi affrontare adesso, ti aiuto a scegliere da dove iniziare. Puoi tornare qui ogni volta. Cosa ti porta oggi in CounselorBot?",
    "en": "I am the CounselorBot Compass. I explain how the platform works and help you choose where to begin from what matters to you now. You can return whenever you want. What brings you to CounselorBot today?",
    "es": "Soy la Brújula de CounselorBot. Te explico cómo funciona la plataforma y te ayudo a elegir por dónde empezar según lo que necesitas ahora. Puedes volver cuando quieras. ¿Qué te trae hoy a CounselorBot?",
    "fr": "Je suis la Boussole de CounselorBot. Je vous explique le fonctionnement de la plateforme et vous aide à choisir par où commencer selon votre besoin actuel. Vous pouvez revenir quand vous le souhaitez. Qu’est-ce qui vous amène aujourd’hui?",
    "de": "Ich bin der CounselorBot-Kompass. Ich erkläre die Plattform und helfe dir, ausgehend von deinem aktuellen Anliegen einen Anfang zu wählen. Du kannst jederzeit zurückkommen. Was führt dich heute zu CounselorBot?",
    "sv": "Jag är CounselorBots kompass. Jag förklarar hur plattformen fungerar och hjälper dig välja var du kan börja utifrån det som är viktigt just nu. Du kan återvända när du vill. Vad tar dig till CounselorBot idag?",
}


class StartRequest(BaseModel):
    language: str = "it"
    new_session: bool = False


class MessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    language: str = "it"

    @validator("message", pre=True)
    def _trim_message(cls, value):
        text = str(value or "").strip()
        if not text:
            raise ValueError("message is required")
        return text[:MAX_MESSAGE_CHARS]


class NotebookReviewRequest(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)
    skip: bool = False


def _owner(current_user: dict) -> str:
    return str(current_user.get("username") or "").strip()


def _serialize(row: models.OrientationSession) -> dict:
    return {
        "session_id": row.session_id,
        "language": row.language,
        "status": row.status,
        "messages": list(row.messages or []),
        "recommendations": list(row.recommendations or []),
        "notebook_draft": dict(row.notebook_draft or {}),
        "notebook_reviewed": bool(row.notebook_reviewed),
        "notebook_revision_id": row.notebook_revision_id,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "completed_at": row.completed_at,
    }


def _owned_session(db: Session, owner: str, session_id: str) -> models.OrientationSession:
    row = (
        db.query(models.OrientationSession)
        .filter(
            models.OrientationSession.session_id == session_id,
            models.OrientationSession.username == owner,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Orientation session not found")
    return row


def _latest(db: Session, owner: str, status: str | None = None):
    query = db.query(models.OrientationSession).filter(models.OrientationSession.username == owner)
    if status:
        query = query.filter(models.OrientationSession.status == status)
    return query.order_by(models.OrientationSession.updated_at.desc(), models.OrientationSession.created_at.desc()).first()


def _is_eligible_student(identity: dict) -> bool:
    return not identity.get("is_admin") and not identity.get("is_researcher") and not auth.is_teacher(identity.get("groups"))


def _has_legacy_activity(db: Session, owner: str) -> bool:
    return bool(
        db.query(models.QuestionnaireResult.id).filter(models.QuestionnaireResult.username == owner).first()
        or db.query(models.LearnerProfileRevision.id).filter(
            models.LearnerProfileRevision.username == owner,
            models.LearnerProfileRevision.source != "orientation",
        ).first()
        or db.query(models.StudentBooklet.id).filter(models.StudentBooklet.username == owner).first()
    )


@router.get("/orientation/status")
def orientation_status(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    owner = _owner(current_user)
    latest = _latest(db, owner)
    in_progress = _latest(db, owner, "in_progress")
    completed = _latest(db, owner, "completed")
    eligible = _is_eligible_student(current_user)
    legacy_exempt = completed is None and _has_legacy_activity(db, owner)
    return {
        "eligible": eligible,
        "completed": completed is not None,
        "required": bool(eligible and completed is None and not legacy_exempt),
        "legacy_exempt": legacy_exempt,
        "in_progress_session_id": in_progress.session_id if in_progress else None,
        "latest_session_id": latest.session_id if latest else None,
    }


@router.post("/orientation/sessions")
def start_orientation(
    payload: StartRequest,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    owner = _owner(current_user)
    if not payload.new_session:
        existing = _latest(db, owner, "in_progress")
        if existing is not None:
            return _serialize(existing)
    lang = normalize_language(payload.language)
    row = models.OrientationSession(
        session_id=str(uuid.uuid4()),
        username=owner,
        language=lang,
        status="in_progress",
        messages=[{"role": "assistant", "content": WELCOME[lang]}],
        recommendations=[],
        notebook_draft={},
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.get("/orientation/sessions/{session_id}")
def get_orientation(
    session_id: str,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    return _serialize(_owned_session(db, _owner(current_user), session_id))


@router.post("/orientation/sessions/{session_id}/message")
def orientation_message(
    session_id: str,
    payload: MessageRequest,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    row = _owned_session(db, _owner(current_user), session_id)
    if row.status != "in_progress":
        raise HTTPException(status_code=409, detail="Orientation session already completed")
    history = list(row.messages or [])
    analysis = analyze_turn(db, payload.message, payload.language, history)
    messages = (history + [
        {"role": "user", "content": payload.message},
        {"role": "assistant", "content": analysis.reply},
    ])[-MAX_MESSAGES:]
    row.language = normalize_language(payload.language)
    row.messages = messages
    row.recommendations = analysis.recommendations
    row.notebook_draft = analysis.notebook_draft
    row.notebook_reviewed = False
    row.notebook_revision_id = None
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.post("/orientation/sessions/{session_id}/notebook-review")
def review_orientation_notebook(
    session_id: str,
    payload: NotebookReviewRequest,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    owner = _owner(current_user)
    row = _owned_session(db, owner, session_id)
    if row.status != "in_progress":
        raise HTTPException(status_code=409, detail="Orientation session already completed")

    revision_id = None
    if not payload.skip:
        approved = {}
        for key in NOTEBOOK_FIELDS:
            if key not in payload.data:
                continue
            value = str(payload.data.get(key) or "").strip()[:schemas.LEARNER_PROFILE_MAX_FIELD_CHARS]
            if value:
                approved[key] = value
        if not approved:
            raise HTTPException(status_code=400, detail="Select at least one notebook field or skip")
        latest = _latest_revision(db, owner)
        merged = dict((latest.data if latest else {}) or {})
        merged.update(approved)
        if latest is not None and latest.data == merged:
            revision_id = latest.id
        else:
            revision = models.LearnerProfileRevision(
                username=owner,
                data=merged,
                source="orientation",
                session_id=session_id,
            )
            db.add(revision)
            db.flush()
            revision_id = revision.id

    row.notebook_reviewed = True
    row.notebook_revision_id = revision_id
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.post("/orientation/sessions/{session_id}/complete")
def complete_orientation(
    session_id: str,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    row = _owned_session(db, _owner(current_user), session_id)
    if not row.recommendations:
        raise HTTPException(status_code=409, detail="Write at least one message before completing orientation")
    if not row.notebook_reviewed:
        raise HTTPException(status_code=409, detail="Review the notebook draft before completing orientation")
    row.status = "completed"
    row.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _serialize(row)
