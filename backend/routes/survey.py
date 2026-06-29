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
from ..pdf_generator import generate_questionnaire_pdf, generate_student_booklet_pdf
from .. import scoring_service

router = APIRouter()
get_db = database.get_db

# Strumenti del libretto: i 7 questionari + due libretti narrativi senza dimensioni
# (eventi significativi), in cui forza/area sono testo libero come per Savickas.
STUDENT_BOOKLET_TYPES = (
    "QSA", "QSAr", "ZTPI", "SAVICKAS", "QPCS", "QPCC", "QAP",
    "EVENTO_STUDIO", "EVENTO_PROFESSIONALE",
)


def _get_owned_questionnaire_result(session_id: str, current_user: dict, db: Session) -> models.QuestionnaireResult:
    result = db.query(models.QuestionnaireResult).filter(
        models.QuestionnaireResult.session_id == session_id
    ).first()
    if not result:
        raise HTTPException(status_code=404, detail="Risultato non trovato")
    if not current_user.get("is_admin") and result.username != current_user.get("username"):
        raise HTTPException(status_code=403, detail="Azione non consentita")
    return result


def _normalize_booklet_type(questionnaire_type: str) -> str:
    for code in STUDENT_BOOKLET_TYPES:
        if code.lower() == str(questionnaire_type or "").lower():
            return code
    raise HTTPException(status_code=404, detail="Strumento non supportato")


def _student_booklet_for_type(db: Session, username: str, questionnaire_type: str) -> Optional[models.StudentBooklet]:
    return (
        db.query(models.StudentBooklet)
        .filter(
            models.StudentBooklet.username == username,
            models.StudentBooklet.questionnaire_type == questionnaire_type,
        )
        .order_by(models.StudentBooklet.updated_at.desc(), models.StudentBooklet.id.desc())
        .first()
    )


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
    identity: dict = Depends(auth.get_identity_view_as),
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
    identity: dict = Depends(auth.get_identity_view_as),
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


@router.get("/user/student-booklets/instrument/{questionnaire_type}", response_model=Optional[schemas.StudentBookletResponse])
async def get_student_booklet_for_instrument(
    questionnaire_type: str,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Recupera il libretto dello studente per uno strumento."""
    code = _normalize_booklet_type(questionnaire_type)
    return _student_booklet_for_type(db, current_user["username"], code)


@router.put("/user/student-booklets/instrument/{questionnaire_type}", response_model=schemas.StudentBookletResponse)
async def save_student_booklet_for_instrument(
    questionnaire_type: str,
    payload: schemas.StudentBookletSave,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Crea o aggiorna il libretto compilabile legato a uno strumento."""
    code = _normalize_booklet_type(questionnaire_type)
    username = current_user["username"]
    booklet = _student_booklet_for_type(db, username, code)
    if booklet is None:
        booklet = models.StudentBooklet(
            username=username,
            session_id=None,
            questionnaire_type=code,
            data=payload.data,
        )
        db.add(booklet)
    else:
        booklet.session_id = None
        booklet.questionnaire_type = code
        booklet.data = payload.data
    db.commit()
    db.refresh(booklet)
    return booklet


@router.get("/user/student-booklets/instrument/{questionnaire_type}/pdf")
async def download_student_booklet_pdf_for_instrument(
    questionnaire_type: str,
    lang: str = Query("it", description="Lingua del PDF (it, en, es, fr, de, sv)"),
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Scarica il libretto dello studente per lo strumento selezionato."""
    code = _normalize_booklet_type(questionnaire_type)
    booklet = _student_booklet_for_type(db, current_user["username"], code)
    pdf_bytes = generate_student_booklet_pdf(
        questionnaire_type=code,
        scores=None,
        session_id=None,
        booklet_data=booklet.data if booklet else {},
        username=current_user["username"],
        submitted_at=None,
        language=lang,
    )
    filename = f"counselorbot_libretto_{code}.pdf"
    return Response(
        content=pdf_bytes.read(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _owned_booklet(db: Session, booklet_id: int, current_user: dict) -> models.StudentBooklet:
    booklet = db.query(models.StudentBooklet).filter(models.StudentBooklet.id == booklet_id).first()
    if not booklet:
        raise HTTPException(status_code=404, detail="Libretto non trovato")
    if not current_user.get("is_admin") and booklet.username != current_user.get("username"):
        raise HTTPException(status_code=403, detail="Azione non consentita")
    return booklet


@router.get(
    "/user/student-booklets/instrument/{questionnaire_type}/list",
    response_model=List[schemas.StudentBookletResponse],
)
async def list_student_booklets_for_instrument(
    questionnaire_type: str,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Elenca tutte le schede del libretto per uno strumento."""
    code = _normalize_booklet_type(questionnaire_type)
    return (
        db.query(models.StudentBooklet)
        .filter(
            models.StudentBooklet.username == current_user["username"],
            models.StudentBooklet.questionnaire_type == code,
        )
        .order_by(models.StudentBooklet.updated_at.desc(), models.StudentBooklet.id.desc())
        .all()
    )


@router.post(
    "/user/student-booklets/instrument/{questionnaire_type}",
    response_model=schemas.StudentBookletResponse,
)
async def create_student_booklet_for_instrument(
    questionnaire_type: str,
    payload: schemas.StudentBookletSave,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Crea una nuova scheda del libretto per uno strumento."""
    code = _normalize_booklet_type(questionnaire_type)
    booklet = models.StudentBooklet(
        username=current_user["username"],
        session_id=None,
        questionnaire_type=code,
        data=payload.data,
    )
    db.add(booklet)
    db.commit()
    db.refresh(booklet)
    return booklet


@router.get("/user/student-booklets/id/{booklet_id}", response_model=schemas.StudentBookletResponse)
async def get_student_booklet_by_id(
    booklet_id: int,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Recupera una scheda del libretto per id."""
    return _owned_booklet(db, booklet_id, current_user)


@router.put("/user/student-booklets/id/{booklet_id}", response_model=schemas.StudentBookletResponse)
async def update_student_booklet_by_id(
    booklet_id: int,
    payload: schemas.StudentBookletSave,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Aggiorna una scheda del libretto per id."""
    booklet = _owned_booklet(db, booklet_id, current_user)
    booklet.data = payload.data
    db.commit()
    db.refresh(booklet)
    return booklet


@router.delete("/user/student-booklets/id/{booklet_id}")
async def delete_student_booklet_by_id(
    booklet_id: int,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Elimina una scheda del libretto per id."""
    booklet = _owned_booklet(db, booklet_id, current_user)
    db.delete(booklet)
    db.commit()
    return {"ok": True, "deleted": booklet_id}


@router.get("/user/student-booklets/id/{booklet_id}/pdf")
async def download_student_booklet_pdf_by_id(
    booklet_id: int,
    lang: str = Query("it", description="Lingua del PDF (it, en, es, fr, de, sv)"),
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Scarica una scheda del libretto per id."""
    booklet = _owned_booklet(db, booklet_id, current_user)
    pdf_bytes = generate_student_booklet_pdf(
        questionnaire_type=booklet.questionnaire_type,
        scores=None,
        session_id=None,
        booklet_data=booklet.data or {},
        username=booklet.username,
        submitted_at=None,
        language=lang,
    )
    filename = f"counselorbot_libretto_{booklet.questionnaire_type}_{booklet.id}.pdf"
    return Response(
        content=pdf_bytes.read(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _localized_strategy_field(row: models.CertifiedStrategy, prefix: str, lang: str) -> str:
    value = getattr(row, f"{prefix}_{lang}", None) or getattr(row, f"{prefix}_it", None)
    return (value or "").strip()


@router.get("/user/certified-strategies")
async def list_certified_strategies_for_student(
    questionnaire_type: str = Query(..., description="Strumento (QSA, QSAr, ...)"),
    lang: str = Query("it", description="Lingua (it, en, es, sv)"),
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Strategie certificate attive, filtrate per strumento, per il libretto."""
    code = _normalize_booklet_type(questionnaire_type)
    language = lang if lang in ("it", "en", "es", "sv") else "it"
    rows = (
        db.query(models.CertifiedStrategy)
        .filter(
            models.CertifiedStrategy.status == "certified",
            models.CertifiedStrategy.is_active.is_(True),
        )
        .order_by(models.CertifiedStrategy.sort_order.asc(), models.CertifiedStrategy.id.asc())
        .all()
    )
    result = []
    for row in rows:
        scope = {item.upper() for item in (row.questionnaire_types or [])}
        if scope and code.upper() not in scope:
            continue
        name = _localized_strategy_field(row, "name", language)
        description = _localized_strategy_field(row, "description", language)
        if not (name or description):
            continue
        result.append({
            "slug": row.slug,
            "name": name,
            "recommended_when": _localized_strategy_field(row, "recommended_when", language),
            "description": description,
            "factor_codes": row.factor_codes or [],
        })
    return result


@router.get("/user/student-booklets/{session_id}", response_model=Optional[schemas.StudentBookletResponse])
async def get_student_booklet(
    session_id: str,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Compat: recupera il libretto dello strumento della compilazione propria."""
    result = _get_owned_questionnaire_result(session_id, current_user, db)
    return _student_booklet_for_type(db, current_user["username"], result.questionnaire_type)


@router.put("/user/student-booklets/{session_id}", response_model=schemas.StudentBookletResponse)
async def save_student_booklet(
    session_id: str,
    payload: schemas.StudentBookletSave,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Compat: salva il libretto dello strumento della compilazione propria."""
    result = _get_owned_questionnaire_result(session_id, current_user, db)
    return await save_student_booklet_for_instrument(result.questionnaire_type, payload, current_user, db)


@router.get("/user/student-booklets/{session_id}/pdf")
async def download_student_booklet_pdf(
    session_id: str,
    lang: str = Query("it", description="Lingua del PDF (it, en, es, fr, de, sv)"),
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Compat: scarica il libretto dello strumento della compilazione propria."""
    result = _get_owned_questionnaire_result(session_id, current_user, db)
    return await download_student_booklet_pdf_for_instrument(result.questionnaire_type, lang, current_user, db)


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


@router.get("/user/questionnaire-result/{session_id}/conversation")
async def get_user_session_conversation(
    session_id: str,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Restituisce i messaggi della conversazione per una specifica sessione dell'utente."""
    result = db.query(models.QuestionnaireResult).filter(
        models.QuestionnaireResult.session_id == session_id
    ).first()
    if not result:
        raise HTTPException(status_code=404, detail="Risultato non trovato")

    if not current_user.get("is_admin") and result.username != current_user.get("username"):
        raise HTTPException(status_code=403, detail="Non autorizzato a visualizzare questa sessione")

    # Recupera i messaggi
    messages = []
    log_rows = (
        db.query(models.Log)
        .filter(
            models.Log.action == "chat_message",
            models.Log.session_id == session_id,
        )
        .order_by(models.Log.timestamp.asc())
        .all()
    )
    for row in log_rows:
        d = row.details or {}
        user_input = (d.get("user_input") or "").strip()
        bot_response = (d.get("bot_response") or "").strip()
        if user_input:
            messages.append({"role": "student", "text": user_input})
        if bot_response:
            messages.append({"role": "counselor", "text": bot_response})
            
    return messages


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

    # Recupera la conversazione studente/counselor dalla tabella Log
    messages: list[dict] = []
    log_rows = (
        db.query(models.Log)
        .filter(
            models.Log.action == "chat_message",
            models.Log.session_id == session_id,
        )
        .order_by(models.Log.timestamp.asc())
        .all()
    )
    for row in log_rows:
        d = row.details or {}
        # ponytail: usa solo user_input (la vera interazione studente).
        # effective_user_input contiene il prompt di sistema inglese dei guided
        # step: non è una vera interazione e non va nel PDF studente.
        user_input = (d.get("user_input") or "").strip()
        bot_response = (d.get("bot_response") or "").strip()
        if user_input:
            messages.append({"role": "student", "text": user_input})
        if bot_response:
            messages.append({"role": "counselor", "text": bot_response})

    pdf_bytes = generate_questionnaire_pdf(
        questionnaire_type=result.questionnaire_type,
        scores=scores,
        session_id=result.session_id,
        submitted_at=submitted_str,
        language=lang,
        messages=messages or None,
    )

    filename = f"counselorbot_{result.questionnaire_type}_{result.id}.pdf"
    return Response(
        content=pdf_bytes.read(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
