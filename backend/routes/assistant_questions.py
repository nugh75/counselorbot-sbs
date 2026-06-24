"""Domande suggerite dell'assistente docenti (pulsante "Prepara domanda").

GET pubblico raggruppato per topic (solo attive) per la pagina /assistente;
CRUD riservato agli admin per gestire e ampliare il set di domande.
"""

from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas

router = APIRouter()
get_db = database.get_db


def _normalize_lang(lang: Optional[str]) -> str:
    raw = (lang or "it").strip().lower()
    return raw.replace("_", "-").split("-", 1)[0] or "it"


@router.get("/assistant-questions")
async def list_public_assistant_questions(
    lang: str = Query("it"),
    db: Session = Depends(get_db),
) -> Dict[str, List[str]]:
    """Domande attive raggruppate per topic, per la lingua richiesta.

    Ritorna { topic: [testo, ...] } ordinato per sort_order. I topic privi di
    domande nella lingua richiesta vengono semplicemente omessi: il frontend
    ricade sulle varianti i18n.
    """
    language = _normalize_lang(lang)
    rows = (
        db.query(models.AssistantQuestion)
        .filter(
            models.AssistantQuestion.is_active.is_(True),
            models.AssistantQuestion.language == language,
        )
        .order_by(models.AssistantQuestion.topic, models.AssistantQuestion.sort_order)
        .all()
    )
    result: Dict[str, List[str]] = {}
    for row in rows:
        result.setdefault(row.topic, []).append(row.text)
    return result


@router.get("/admin/assistant-questions", response_model=List[schemas.AssistantQuestionResponse])
async def list_assistant_questions(
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.AssistantQuestion)
        .order_by(
            models.AssistantQuestion.topic,
            models.AssistantQuestion.language,
            models.AssistantQuestion.sort_order,
        )
        .all()
    )


@router.post("/admin/assistant-questions", response_model=schemas.AssistantQuestionResponse)
async def create_assistant_question(
    payload: schemas.AssistantQuestionCreate,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    topic = (payload.topic or "").strip()
    text = (payload.text or "").strip()
    if not topic:
        raise HTTPException(status_code=400, detail="Topic obbligatorio")
    if not text:
        raise HTTPException(status_code=400, detail="Testo della domanda obbligatorio")
    question = models.AssistantQuestion(
        topic=topic,
        language=_normalize_lang(payload.language),
        text=text,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


@router.put("/admin/assistant-questions/{question_id}", response_model=schemas.AssistantQuestionResponse)
async def update_assistant_question(
    question_id: int,
    payload: schemas.AssistantQuestionUpdate,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    question = (
        db.query(models.AssistantQuestion)
        .filter(models.AssistantQuestion.id == question_id)
        .first()
    )
    if not question:
        raise HTTPException(status_code=404, detail="Domanda non trovata")

    updates = payload.model_dump(exclude_unset=True)
    if "topic" in updates:
        topic = (updates["topic"] or "").strip()
        if not topic:
            raise HTTPException(status_code=400, detail="Topic obbligatorio")
        updates["topic"] = topic
    if "text" in updates:
        text = (updates["text"] or "").strip()
        if not text:
            raise HTTPException(status_code=400, detail="Testo della domanda obbligatorio")
        updates["text"] = text
    if "language" in updates:
        updates["language"] = _normalize_lang(updates["language"])

    for field, value in updates.items():
        setattr(question, field, value)
    db.commit()
    db.refresh(question)
    return question


@router.delete("/admin/assistant-questions/{question_id}")
async def delete_assistant_question(
    question_id: int,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    question = (
        db.query(models.AssistantQuestion)
        .filter(models.AssistantQuestion.id == question_id)
        .first()
    )
    if not question:
        raise HTTPException(status_code=404, detail="Domanda non trovata")
    db.delete(question)
    db.commit()
    return {"ok": True, "deleted": question_id}
