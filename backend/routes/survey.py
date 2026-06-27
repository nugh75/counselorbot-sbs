"""Endpoint survey + feedback strategie (pubblici e admin)."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas, auth, database
from ..anonymous_codes import get_or_create_anonymous_research_code
from ..validation_export import build_validation_csv, validation_query, validation_summary
from ..strategy_memory import shared_response_memory, strategy_memory
from ..pdf_generator import generate_questionnaire_pdf
from .. import scoring_service

router = APIRouter()
get_db = database.get_db


def _normalize_validation_metadata(metadata: Optional[dict], username: Optional[str], db: Session) -> dict:
    normalized = dict(metadata or {})
    if username:
        code = get_or_create_anonymous_research_code(db, username)
        normalized["participant_code"] = code
        normalized["anonymous_research_code"] = code
        normalized["participant_code_source"] = "server_db"
    return normalized


def _metadata_study_code(metadata: dict) -> Optional[str]:
    for key in ("study_code", "study"):
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip().upper()
    return None


def _plan_researcher_names(db: Session, plan_id: int) -> list[str]:
    links = (
        db.query(models.AdministrationPlanResearcher)
        .filter(models.AdministrationPlanResearcher.plan_id == plan_id)
        .order_by(models.AdministrationPlanResearcher.id.asc())
        .all()
    )
    contact_ids = [link.research_contact_id for link in links if link.research_contact_id]
    contacts = {
        contact.id: contact
        for contact in db.query(models.ResearchContact)
        .filter(models.ResearchContact.id.in_(contact_ids))
        .all()
    } if contact_ids else {}
    names = []
    for link in links:
        if link.research_contact_id and link.research_contact_id in contacts:
            names.append(contacts[link.research_contact_id].name)
        elif link.external_name:
            names.append(link.external_name)
    return names


def _resolve_administration_context(db: Session, metadata: dict) -> tuple[Optional[int], Optional[int]]:
    study_code = _metadata_study_code(metadata)
    if not study_code:
        return None, None

    plan = (
        db.query(models.AdministrationPlan)
        .filter(func.upper(models.AdministrationPlan.code) == study_code)
        .first()
    )
    if plan:
        researcher_names = _plan_researcher_names(db, plan.id)
        metadata.update({
            "administration_plan_id": plan.id,
            "administration_plan_code": plan.code,
            "administration_plan_title": plan.title,
            "administration_plan_instrument_code": plan.instrument_code,
            "administration_plan_locale": plan.locale,
            "administration_plan_scheduled_at": plan.scheduled_at.isoformat() if plan.scheduled_at else "",
            "administration_plan_location": plan.location or "",
            "administration_plan_notes": plan.notes or "",
            "administration_plan_researchers": "; ".join(researcher_names),
        })
        return plan.id, None

    contact = (
        db.query(models.ResearchContact)
        .filter(func.upper(models.ResearchContact.code) == study_code)
        .first()
    )
    if contact:
        metadata.update({
            "research_contact_id": contact.id,
            "research_contact_code": contact.code,
            "research_contact_name": contact.name,
            "research_contact_email": contact.email or "",
            "research_contact_institution": contact.institution or "",
        })
        return None, contact.id

    return None, None


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


@router.get("/user/anonymous-research-code")
async def get_anonymous_research_code(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Restituisce il codice pseudonimo stabile per l'utente autenticato."""
    code = get_or_create_anonymous_research_code(db, current_user["username"])
    db.commit()
    return {"anonymous_research_code": code}


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
        if payload.save_validation and not username:
            raise HTTPException(
                status_code=401,
                detail="Authentication required to save validation responses with an anonymous research code",
            )
        factor_scores = scoring_service.mapped_stanine_scores(profile)
        response_metadata = _normalize_validation_metadata(payload.response_metadata, username, db)
        administration_plan_id, research_contact_id = _resolve_administration_context(db, response_metadata)
        db.add(models.QuestionnaireResult(
            session_id=payload.session_id,
            questionnaire_type=code,
            scores=factor_scores,
            username=username,
            administration_plan_id=administration_plan_id,
            research_contact_id=research_contact_id,
        ))
        if payload.save_validation:
            db.add(models.ValidationResponse(
                session_id=payload.session_id,
                instrument_code=code,
                locale=payload.locale,
                version_label=(payload.version_label or "draft").strip() or "draft",
                answers={str(k): v for k, v in payload.answers.items()},
                factor_scores=factor_scores,
                response_metadata=response_metadata,
                username=username,
                administration_plan_id=administration_plan_id,
                research_contact_id=research_contact_id,
                duration_seconds=payload.duration_seconds,
            ))
        db.commit()

    return profile


@router.get("/admin/validation/summary", response_model=schemas.ValidationSummaryResponse)
async def get_validation_summary(
    instrument_code: Optional[str] = Query(None),
    locale: Optional[str] = Query(None),
    version_label: Optional[str] = Query(None),
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Statistiche rapide sul dataset grezzo disponibile per validazione."""
    return validation_summary(db, instrument_code, locale, version_label)


@router.get("/admin/validation/responses", response_model=List[schemas.ValidationResponseResponse])
async def get_validation_responses(
    instrument_code: Optional[str] = Query(None),
    locale: Optional[str] = Query(None),
    version_label: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Risposte grezze item-level per controllo admin."""
    return (
        validation_query(db, instrument_code, locale, version_label)
        .order_by(models.ValidationResponse.submitted_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/admin/validation/export.csv")
async def export_validation_csv(
    instrument_code: Optional[str] = Query(None),
    locale: Optional[str] = Query(None),
    version_label: Optional[str] = Query(None),
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Export CSV item-per-item per analisi in R/JASP/SPSS/Mplus."""
    rows = (
        validation_query(db, instrument_code, locale, version_label)
        .order_by(models.ValidationResponse.submitted_at.asc())
        .all()
    )
    csv_text = build_validation_csv(rows, db)
    suffix = "-".join(part for part in [instrument_code, locale, version_label] if part)
    filename = f"validation-responses{('-' + suffix) if suffix else ''}.csv"
    return Response(
        content=csv_text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
