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
from ..student_context import latest_learner_profile

router = APIRouter()

MAX_MESSAGES = 40
MAX_MESSAGE_CHARS = 4000

WELCOME = {
    "it": "Sono la Bussola di CounselorBot: ti consiglio uno strumento da cui partire, in base a ciò che vuoi affrontare. Non serve farli tutti: lavoriamo una domanda alla volta, in più turni e, se serve, in più incontri. Per un primo dialogo puoi riservare circa 20–40 minuti: è un tempo da organizzare secondo le tue esigenze, non una durata fissa; possiamo anche affrontare un solo tema e continuare più avanti. In alto trovi la Guida e l’Assistente; nell’Area personale restano taccuino, libretti e sessioni. Cosa vuoi affrontare oggi?",
    "en": "I am the CounselorBot Compass: I suggest one tool to start with, based on what you want to address. You do not need to do them all: we work one question at a time, over several turns and, if needed, several visits. You can set aside about 20–40 minutes for a first conversation: this is a flexible planning window, not a fixed duration; we can also address just one topic and continue later. The Guide and Assistant are at the top; your Personal area keeps your notebook, booklets and sessions. What would you like to address today?",
    "es": "Soy la Brújula de CounselorBot: te recomiendo una herramienta para empezar según lo que quieras abordar. No hace falta hacerlas todas: trabajamos una pregunta a la vez, en varios turnos y, si hace falta, varios encuentros. Puedes reservar unos 20–40 minutos para un primer diálogo: es una orientación para organizarte, no una duración fija; también podemos abordar un solo tema y continuar más adelante. Arriba están la Guía y el Asistente; el Área personal guarda tu cuaderno, cuadernillos y sesiones. ¿Qué quieres abordar hoy?",
    "fr": "Je suis la Boussole de CounselorBot : je vous conseille un outil pour commencer selon votre besoin. Il n’est pas nécessaire de tous les faire : avançons une question à la fois, sur plusieurs tours et, si nécessaire, plusieurs rencontres. Vous pouvez réserver environ 20–40 minutes pour un premier dialogue : c’est un repère pour vous organiser, pas une durée fixe ; nous pouvons aussi aborder un seul sujet et continuer plus tard. Le Guide et l’Assistant sont en haut ; l’Espace personnel conserve votre carnet, vos livrets et vos sessions. Que souhaitez-vous aborder aujourd’hui ?",
    "de": "Ich bin der CounselorBot-Kompass: Ich empfehle dir ein Werkzeug für den Einstieg, passend zu deinem Anliegen. Du musst nicht alle nutzen: Wir arbeiten mit einer Frage nach der anderen, in mehreren Dialogschritten und bei Bedarf mehreren Treffen. Für ein erstes Gespräch kannst du etwa 20–40 Minuten einplanen: Das ist ein flexibler Zeitrahmen, keine feste Dauer; wir können auch nur ein Thema angehen und später fortfahren. Oben findest du Anleitung und Assistent; im Persönlichen Bereich bleiben Notizbuch, Arbeitshefte und Sitzungen. Was möchtest du heute angehen?",
    "sv": "Jag är CounselorBots kompass: jag föreslår ett verktyg att börja med utifrån det du vill arbeta med. Du behöver inte göra alla: vi tar en fråga i taget, över flera turer och vid behov flera tillfällen. Du kan avsätta ungefär 20–40 minuter för ett första samtal: det är en flexibel planeringsram, ingen fast tidsåtgång; vi kan också ta bara ett ämne och fortsätta senare. Guiden och Assistenten finns högst upp; Personlig sida sparar din anteckningsbok, dina arbetshäften och dina sessioner. Vad vill du arbeta med idag?"
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


# Il pannello e' un riepilogo della sessione, non dell'ultimo turno. Prima
# `row.recommendations` veniva sostituito in blocco: la conversazione si
# accumulava e le schede no, cosi' lo strumento su cui lo studente aveva appena
# deciso di partire spariva appena il turno seguente ne nominava altri. Le nuove
# proposte entrano in testa, le vecchie scalano, e il totale resta tre — lo
# stesso tetto che _clean_analysis applica a un singolo turno.
MAX_RECOMMENDATIONS = 3


def _merged_recommendations(
    previous: list[dict] | None,
    incoming: list[dict[str, str]],
) -> list[dict]:
    if not incoming:
        return list(previous or [])
    merged: list[dict] = []
    seen: set[str] = set()
    for row in list(incoming) + list(previous or []):
        tool_id = str((row or {}).get("id") or "")
        if not tool_id or tool_id in seen:
            continue
        merged.append(row)
        seen.add(tool_id)
        if len(merged) == MAX_RECOMMENDATIONS:
            break
    return merged


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
    notebook = latest_learner_profile(db, owner)
    opening = None
    if notebook is not None and isinstance(notebook.data, dict) and any(str(value or "").strip() for value in notebook.data.values()):
        opening = analyze_turn(
            db, "Begin the Compass conversation using the student context provided.", lang,
            counselor_id=counselor.id if counselor else None, username=owner, opening=True,
        )
    row = models.OrientationSession(
        session_id=str(uuid.uuid4()),
        username=owner,
        language=lang,
        counselor_id=counselor.id if counselor else None,
        status="in_progress",
        messages=[{"role": "assistant", "content": opening.reply if opening else _welcome(lang, counselor)}],
        recommendations=opening.recommendations[:1] if opening else [],
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
    analysis = analyze_turn(db, payload.message, payload.language, history, row.counselor_id, row.username,
                            current_recommendations=list(row.recommendations or []))
    messages = (history + [
        {"role": "user", "content": payload.message},
        {"role": "assistant", "content": analysis.reply},
    ])[-MAX_MESSAGES:]
    row.language = normalize_language(payload.language)
    row.messages = messages
    if analysis.state_action == "clear":
        row.recommendations = []
    elif analysis.state_action == "replace":
        row.recommendations = analysis.recommendations
    elif analysis.state_action == "merge":
        row.recommendations = _merged_recommendations(row.recommendations, analysis.recommendations)
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
