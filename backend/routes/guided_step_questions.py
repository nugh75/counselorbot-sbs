from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas

router = APIRouter()
get_db = database.get_db


def _normalize_lang(lang: Optional[str]) -> str:
    raw = (lang or "it").strip().lower()
    return raw.replace("_", "-").split("-", 1)[0] or "it"


@router.get("/admin/guided-step-questions", response_model=List[schemas.GuidedStepQuestionResponse])
async def list_guided_step_questions(
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Elenco di tutte le domande suggerite per gli step della chat guidata."""
    return (
        db.query(models.GuidedStepQuestion)
        .order_by(
            models.GuidedStepQuestion.questionnaire_type,
            models.GuidedStepQuestion.step_id,
            models.GuidedStepQuestion.language,
            models.GuidedStepQuestion.sort_order,
        )
        .all()
    )


@router.post("/admin/guided-step-questions", response_model=schemas.GuidedStepQuestionResponse)
async def create_guided_step_question(
    payload: schemas.GuidedStepQuestionCreate,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Crea una nuova domanda suggerita per uno step della chat guidata."""
    q_type = (payload.questionnaire_type or "").strip()
    step_id = (payload.step_id or "").strip()
    text = (payload.text or "").strip()
    if not q_type:
        raise HTTPException(status_code=400, detail="Questionnaire type obbligatorio")
    if not step_id:
        raise HTTPException(status_code=400, detail="Step ID obbligatorio")
    if not text:
        raise HTTPException(status_code=400, detail="Testo della domanda obbligatorio")

    question = models.GuidedStepQuestion(
        questionnaire_type=q_type,
        step_id=step_id,
        language=_normalize_lang(payload.language),
        text=text,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


@router.put("/admin/guided-step-questions/{question_id}", response_model=schemas.GuidedStepQuestionResponse)
async def update_guided_step_question(
    question_id: int,
    payload: schemas.GuidedStepQuestionUpdate,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Aggiorna una domanda suggerita esistente."""
    question = (
        db.query(models.GuidedStepQuestion)
        .filter(models.GuidedStepQuestion.id == question_id)
        .first()
    )
    if not question:
        raise HTTPException(status_code=404, detail="Domanda non trovata")

    updates = payload.model_dump(exclude_unset=True)
    if "questionnaire_type" in updates:
        q_type = (updates["questionnaire_type"] or "").strip()
        if not q_type:
            raise HTTPException(status_code=400, detail="Questionnaire type obbligatorio")
        updates["questionnaire_type"] = q_type
    if "step_id" in updates:
        step_id = (updates["step_id"] or "").strip()
        if not step_id:
            raise HTTPException(status_code=400, detail="Step ID obbligatorio")
        updates["step_id"] = step_id
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


@router.delete("/admin/guided-step-questions/{question_id}")
async def delete_guided_step_question(
    question_id: int,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Elimina una domanda suggerita per uno step della chat guidata."""
    question = (
        db.query(models.GuidedStepQuestion)
        .filter(models.GuidedStepQuestion.id == question_id)
        .first()
    )
    if not question:
        raise HTTPException(status_code=404, detail="Domanda non trovata")
    db.delete(question)
    db.commit()
    return {"ok": True, "deleted": question_id}
