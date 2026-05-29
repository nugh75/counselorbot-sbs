"""Endpoint survey + feedback strategie (pubblici e admin)."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import models, schemas, auth, database
from ..strategy_memory import shared_response_memory, strategy_memory
from ..pdf_generator import generate_questionnaire_pdf
from .. import scoring_service

router = APIRouter()
get_db = database.get_db


@router.post("/survey", response_model=schemas.SurveyResponseSchema)
async def submit_survey(survey: schemas.SurveyCreate, db: Session = Depends(get_db)):
    """Submit an anonymous survey response (public endpoint)"""
    db_survey = models.SurveyResponse(**survey.model_dump())
    db.add(db_survey)
    db.commit()
    db.refresh(db_survey)
    return db_survey


@router.post("/strategy-feedback")
async def submit_strategy_feedback(feedback: schemas.StrategyFeedbackCreate, db: Session = Depends(get_db)):
    """Registra feedback anonimo e promuove risposte AI utili alla memoria condivisa."""
    valid_ids = strategy_memory.approved_ids()
    accepted = [strategy_id for strategy_id in feedback.strategy_ids if strategy_id in valid_ids]
    for strategy_id in accepted:
        db.add(models.StrategyFeedback(
            strategy_id=strategy_id,
            questionnaire_type=feedback.questionnaire_type,
            phase=feedback.phase,
            language=feedback.language,
            helpful=feedback.helpful,
        ))
    response_recorded = bool(
        feedback.response_id
        and shared_response_memory.rate(db, feedback.response_id, feedback.helpful)
    )
    if not accepted and not response_recorded:
        raise HTTPException(status_code=400, detail="No valid feedback target supplied")
    db.commit()
    return {"status": "success", "recorded": len(accepted) + int(response_recorded)}


@router.get("/admin/surveys", response_model=List[schemas.SurveyResponseSchema])
async def get_surveys(skip: int = 0, limit: int = 100, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Get all survey responses (admin only)"""
    surveys = db.query(models.SurveyResponse).order_by(models.SurveyResponse.submitted_at.desc()).offset(skip).limit(limit).all()
    return surveys


@router.delete("/admin/survey/{survey_id}")
async def delete_survey(survey_id: int, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Delete a survey response (admin only)"""
    survey = db.query(models.SurveyResponse).filter(models.SurveyResponse.id == survey_id).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    db.delete(survey)
    db.commit()
    return {"status": "success", "message": "Survey deleted"}


@router.get("/admin/strategy-feedback")
async def strategy_feedback_summary(current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Aggregati anonimi utili alla revisione editoriale delle strategie."""
    totals = {}
    for feedback in db.query(models.StrategyFeedback).all():
        row = totals.setdefault(feedback.strategy_id, {"strategy_id": feedback.strategy_id, "positive": 0, "negative": 0})
        row["positive" if feedback.helpful else "negative"] += 1
    return sorted(totals.values(), key=lambda row: (row["positive"] - row["negative"]), reverse=True)


@router.post("/questionnaire-result", response_model=schemas.QuestionnaireResultResponse)
async def submit_questionnaire_result(
    result: schemas.QuestionnaireResultCreate,
    identity: dict = Depends(auth.get_identity),
    db: Session = Depends(get_db),
):
    """Salva i risultati di un questionario completato (endpoint pubblico)."""
    username = identity.get("username") if identity.get("authenticated") else None

    data = result.model_dump()
    data["username"] = username

    db_result = models.QuestionnaireResult(**data)
    db.add(db_result)
    db.commit()
    db.refresh(db_result)
    return db_result


@router.get("/instruments/{code}/rules")
async def get_instrument_rules(code: str, locale: str = Query("en"), db: Session = Depends(get_db)):
    """Regole di scala leggibili (item->fattore, reverse, scala, fattori) per la vista frontend."""
    try:
        return scoring_service.get_rules(db, code, locale)
    except scoring_service.ScoringError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/instruments/{code}/score")
async def score_instrument(
    code: str,
    payload: schemas.ScoreRequest,
    identity: dict = Depends(auth.get_identity),
    db: Session = Depends(get_db),
):
    """Calcola il profilo lato server dalle risposte item-level e (opzionale) lo salva.

    Sostituisce il calcolo nel browser (PROGETTO §10.5). Ritorna il profilo completo;
    se save=True salva uno QuestionnaireResult con i punteggi stanine mappati.
    """
    try:
        profile = scoring_service.compute_profile(db, code, payload.locale, payload.answers)
    except scoring_service.ScoringError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if payload.save:
        username = identity.get("username") if identity.get("authenticated") else None
        db.add(models.QuestionnaireResult(
            session_id=payload.session_id,
            questionnaire_type=code,
            scores=scoring_service.mapped_stanine_scores(profile),
            username=username,
        ))
        db.commit()

    return profile


@router.get("/user/questionnaire-results", response_model=List[schemas.QuestionnaireResultResponse])
async def get_user_questionnaire_results(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Recupera i risultati dei questionari salvati dall'utente corrente (autenticato)."""
    results = db.query(models.QuestionnaireResult).filter(
        models.QuestionnaireResult.username == current_user["username"]
    ).order_by(models.QuestionnaireResult.submitted_at.desc()).all()
    return results


@router.get("/admin/questionnaire-results", response_model=List[schemas.QuestionnaireResultResponse])
async def get_questionnaire_results(
    skip: int = 0,
    limit: int = 100,
    questionnaire_type: Optional[str] = Query(None, description="Filtra per tipo (QSA, QSAr, ZTPI, SAVICKAS)"),
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Recupera i risultati dei questionari (solo admin)."""
    q = db.query(models.QuestionnaireResult)
    if questionnaire_type:
        q = q.filter(models.QuestionnaireResult.questionnaire_type == questionnaire_type)
    results = q.order_by(models.QuestionnaireResult.submitted_at.desc()).offset(skip).limit(limit).all()
    return results


@router.delete("/questionnaire-result/{session_id}")
async def delete_questionnaire_result(
    session_id: str,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Elimina un risultato di questionario associato all'utente corrente."""
    result = db.query(models.QuestionnaireResult).filter(
        models.QuestionnaireResult.session_id == session_id
    ).first()
    if not result:
        raise HTTPException(status_code=404, detail="Risultato non trovato")

    # Check ownership: only the user who created it (or an admin) can delete it
    if not current_user.get("is_admin") and result.username != current_user.get("username"):
        raise HTTPException(status_code=403, detail="Azione non consentita")

    db.delete(result)
    db.commit()
    return {"status": "success", "message": "Risultato eliminato con successo"}


@router.get("/questionnaire-result/{session_id}/pdf")
async def download_questionnaire_pdf(
    session_id: str,
    lang: str = Query("it", description="Lingua del PDF (it, en, es, fr, de, sv)"),
    db: Session = Depends(get_db),
):
    """Scarica il PDF con i risultati del questionario per una sessione."""
    result = db.query(models.QuestionnaireResult).filter(
        models.QuestionnaireResult.session_id == session_id
    ).first()
    if not result:
        raise HTTPException(status_code=404, detail="Risultato non trovato per questa sessione")

    scores = result.scores if isinstance(result.scores, dict) else {}
    submitted_str = str(result.submitted_at) if result.submitted_at else None

    pdf_bytes = generate_questionnaire_pdf(
        questionnaire_type=result.questionnaire_type,
        scores=scores,
        session_id=result.session_id,
        submitted_at=submitted_str,
        language=lang,
    )

    filename = f"counselorbot_{result.questionnaire_type}_{result.id}.pdf"
    return Response(
        content=pdf_bytes.read(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
