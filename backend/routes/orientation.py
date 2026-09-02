"""API studente per la Bussola CounselorBot."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, validator
from sqlalchemy.orm import Session

from .. import auth, models
from ..database import get_db
from ..orientation import analyze_turn, normalize_language

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
    counselor_id: int | None = None


class MessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    language: str = "it"

    @validator("message", pre=True)
    def _trim_message(cls, value):
        text = str(value or "").strip()
        if not text:
            raise ValueError("message is required")
        return text[:MAX_MESSAGE_CHARS]


def _owner(current_user: dict) -> str:
    return str(current_user.get("username") or "").strip()


def _serialize(row: models.OrientationSession) -> dict:
    return {
        "session_id": row.session_id,
        "language": row.language,
        "counselor_id": row.counselor_id,
        "status": row.status,
        "messages": list(row.messages or []),
        "recommendations": list(row.recommendations or []),
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


def _active_counselor(db: Session, counselor_id: int | None) -> models.Counselor | None:
    if counselor_id is None:
        return None
    counselor = (
        db.query(models.Counselor)
        .filter(models.Counselor.id == counselor_id, models.Counselor.is_active.is_(True))
        .first()
    )
    if counselor is None:
        raise HTTPException(status_code=400, detail="Choose an active counselor")
    return counselor


def _welcome(language: str, counselor: models.Counselor | None) -> str:
    base = WELCOME[language]
    if counselor is None:
        return base
    introductions = {
        "it": f"Hai scelto {counselor.name} come counselor. Sarà la sua voce ad accompagnarti nella Bussola. ",
        "en": f"You chose {counselor.name} as your counselor. Their voice will accompany you in the Compass. ",
        "es": f"Has elegido a {counselor.name} como counselor. Su voz te acompañará en la Brújula. ",
        "fr": f"Vous avez choisi {counselor.name} comme counselor. Sa voix vous accompagnera dans la Boussole. ",
        "de": f"Du hast {counselor.name} als Counselor gewählt. Diese Stimme begleitet dich im Kompass. ",
        "sv": f"Du har valt {counselor.name} som counselor. Den rösten följer dig i Kompassen. ",
    }
    return introductions[language] + base


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
    counselor = _active_counselor(db, payload.counselor_id)
    if not payload.new_session:
        existing = _latest(db, owner, "in_progress")
        if existing is not None:
            if existing.counselor_id is None and counselor is not None:
                existing.counselor_id = counselor.id
                intro = _welcome(existing.language, counselor)
                messages = list(existing.messages or [])
                if messages and messages[0].get("content") == WELCOME[normalize_language(existing.language)]:
                    messages[0] = {"role": "assistant", "content": intro}
                else:
                    messages.append({"role": "assistant", "content": intro})
                existing.messages = messages[-MAX_MESSAGES:]
                db.commit()
                db.refresh(existing)
            return _serialize(existing)
    lang = normalize_language(payload.language)
    row = models.OrientationSession(
        session_id=str(uuid.uuid4()),
        username=owner,
        language=lang,
        counselor_id=counselor.id if counselor else None,
        status="in_progress",
        messages=[{"role": "assistant", "content": _welcome(lang, counselor)}],
        recommendations=[],
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
    analysis = analyze_turn(db, payload.message, payload.language, history, row.counselor_id)
    messages = (history + [
        {"role": "user", "content": payload.message},
        {"role": "assistant", "content": analysis.reply},
    ])[-MAX_MESSAGES:]
    row.language = normalize_language(payload.language)
    row.messages = messages
    if not analysis.informational:
        row.recommendations = analysis.recommendations
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
    row.status = "completed"
    row.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _serialize(row)
