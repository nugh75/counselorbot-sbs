"""Endpoint survey + feedback strategie (pubblici e admin)."""
import hashlib
import json
import logging
from typing import List, Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas, auth, database
from ..anonymous_codes import get_or_create_anonymous_research_code
from ..validation_export import build_validation_csv, validation_query, validation_summary
from ..strategy_memory import APPROVED_STRATEGIES_CONFIG_KEY, shared_response_memory, strategy_memory
from ..pdf_generator import generate_questionnaire_pdf, generate_student_booklet_pdf
from ..diagram_blocks import strip_for_speech
from ..message_diagrams import attach_message_diagrams
from ..visual_tools import load_workspace
from ..ai_service import AIService
from .. import scoring_service, recommendation_service
from .. import content_version_service, i18n_fields

router = APIRouter()
get_db = database.get_db
logger = logging.getLogger(__name__)

# Strumenti del libretto: i questionari e Idea + due libretti narrativi senza dimensioni
# (eventi significativi), in cui forza/area sono testo libero come per Savickas.
STUDENT_BOOKLET_TYPES = (
    "QSA", "QSAr", "ZTPI", "SAVICKAS", "QPCS", "QPCC", "QAP", "IDEA",
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
    strategies_config = db.query(models.Config).filter(models.Config.key == APPROVED_STRATEGIES_CONFIG_KEY).first()
    valid_ids = strategy_memory.approved_ids(strategies_config.value if strategies_config else None)
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


def _locale_unavailable_detail(e: "scoring_service.LocaleUnavailable") -> dict:
    return {
        "message": str(e),
        "locale": e.locale,
        "status": e.status,
        "available_locales": e.available,
    }


@router.get("/instruments")
async def list_instruments(db: Session = Depends(get_db)):
    """Strumenti con, per ogni lingua, lo stato di certificazione.

    Alimenta selettore e pagina di somministrazione: quali lingue siano offerte
    non e' piu' una lista scritta a mano nel frontend.
    """
    out = []
    for instrument in db.query(models.Instrument).order_by(models.Instrument.code).all():
        item_count = (
            db.query(models.QuestionnaireItem)
            .filter(
                models.QuestionnaireItem.instrument_code == instrument.code,
                models.QuestionnaireItem.active == True,  # noqa: E712
            )
            .count()
        )
        out.append({
            "code": instrument.code,
            "name_i18n": i18n_fields.merged_i18n(instrument, "name"),
            "status": instrument.status,
            "report_scale_type": instrument.report_scale_type,
            "item_count": item_count,
            "locales": content_version_service.status_map(db, "instrument", instrument.code),
            "available_locales": content_version_service.served_locales(
                db, "instrument", instrument.code
            ),
        })
    return out


@router.get("/instruments/{code}/rules")
async def get_instrument_rules(code: str, locale: str = Query("en"), db: Session = Depends(get_db)):
    """Regole di scala leggibili (item->fattore, reverse, scala, fattori) per la vista frontend."""
    try:
        return scoring_service.get_rules(db, code, locale)
    except scoring_service.LocaleUnavailable as e:
        # 409, non 404: lo strumento esiste, quella lingua non e' ancora pronta.
        raise HTTPException(status_code=409, detail=_locale_unavailable_detail(e))
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
    except scoring_service.LocaleUnavailable as e:
        raise HTTPException(status_code=409, detail=_locale_unavailable_detail(e))
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


def _localized_strategy_field(
    db: Session, row: models.CertifiedStrategy, prefix: str, lang: str
) -> str:
    locale = content_version_service.served_locale(
        db, "certified_strategy", row.slug, lang, fallbacks=("it",)
    )
    return (i18n_fields.localized(row, prefix, locale) or "").strip() if locale else ""


@router.get("/user/certified-strategies")
async def list_certified_strategies_for_student(
    questionnaire_type: str = Query(..., description="Strumento (QSA, QSAr, ...)"),
    lang: str = Query("it", description="Lingua (it, en, es, fr, de, sv)"),
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Strategie certificate attive, filtrate per strumento, per il libretto."""
    code = _normalize_booklet_type(questionnaire_type)
    language = (lang or "it").strip().lower().replace("_", "-").split("-", 1)[0]
    if language not in scoring_service.SUPPORTED_LOCALES:
        language = "it"
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
        name = _localized_strategy_field(db, row, "name", language)
        description = _localized_strategy_field(db, row, "description", language)
        if not (name or description):
            continue
        result.append({
            "slug": row.slug,
            "name": name,
            "recommended_when": _localized_strategy_field(db, row, "recommended_when", language),
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


PDF_SUMMARY_ACTION = "questionnaire_pdf_summary"
# Contratto della sintesi: cambia quando cambiano prompt o sezioni. Entra
# nell'impronta, cosi' una sintesi scritta col prompt vecchio non torna a galla.
SUMMARY_PROMPT_VERSION = "2"
# Quanta conversazione entra in una sola chiamata. Oltre, si riassume a
# scaglioni e poi si fondono le note: nessun pezzo di discussione resta fuori.
_SUMMARY_CHUNK_CHARS = 12000


_PDF_SUMMARY_FALLBACK = {
    "it": "La sintesi automatica non e' disponibile in questo momento. La trascrizione completa della discussione resta consultabile nelle pagine successive.",
    "en": "The automatic summary is not available right now. The full discussion transcript remains available in the following pages.",
    "es": "El resumen automático no está disponible en este momento. La transcripción completa de la conversación sigue disponible en las páginas siguientes.",
    "fr": "La synthèse automatique n'est pas disponible pour le moment. La transcription complète reste disponible dans les pages suivantes.",
    "de": "Die automatische Zusammenfassung ist momentan nicht verfügbar. Das vollständige Gesprächsprotokoll bleibt auf den folgenden Seiten verfügbar.",
    "sv": "Den automatiska sammanfattningen är inte tillgänglig just nu. Hela samtalsutskriften finns på följande sidor.",
}


# Il PDF breve non porta la trascrizione: rimandarci sarebbe una bugia.
_PDF_SUMMARY_FALLBACK_BRIEF = {
    "it": "La sintesi automatica non e' disponibile in questo momento: scarica il documento completo per rileggere la conversazione.",
    "en": "The automatic summary is not available right now: download the full document to read the conversation again.",
    "es": "El resumen automático no está disponible en este momento: descarga el documento completo para releer la conversación.",
    "fr": "La synthèse automatique n'est pas disponible pour le moment : télécharge le document complet pour relire la conversation.",
    "de": "Die automatische Zusammenfassung ist momentan nicht verfügbar: Lade das vollständige Dokument herunter, um das Gespräch noch einmal zu lesen.",
    "sv": "Den automatiska sammanfattningen är inte tillgänglig just nu: ladda ner det fullständiga dokumentet för att läsa samtalet igen.",
}


_PDF_SUMMARY_LANG_NAME = {
    "it": "Italian",
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "sv": "Swedish",
}


def _pdf_language(lang: str) -> str:
    code = (lang or "it").split("-")[0].lower()
    return code if code in _PDF_SUMMARY_LANG_NAME else "it"


def _session_conversation_messages(db: Session, session_id: str) -> list[dict]:
    messages: list[dict] = []
    log_rows = (
        db.query(models.Log)
        .filter(models.Log.action == "chat_message", models.Log.session_id == session_id)
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
    # I diagrammi salvati a mano vivono in un log separato: senza riattaccarli
    # il PDF perde figure che lo studente vede accanto al messaggio in chat.
    return attach_message_diagrams(db, session_id, messages)


def _final_step_summary(
    db: Session,
    result: models.QuestionnaireResult,
) -> tuple[str | None, int | None]:
    """Ultima risposta dello step di sintesi dello strumento, con il suo id di log.

    L'id serve a sapere se la sintesi e' ancora attuale: da sola direbbe solo
    che qualcosa e' stato scritto, non quando.
    """
    steps = (
        db.query(models.GuidedStep)
        .filter(models.GuidedStep.questionnaire_type == result.questionnaire_type)
        .order_by(models.GuidedStep.sort_order.desc(), models.GuidedStep.id.desc())
        .all()
    )
    if not steps:
        return None, None

    summary_ids = {
        "QSA": "sl-synthesis",
        "QSAR": "qsar-synthesis",
        "ZTPI": "ztpi-btp",
        "SAVICKAS": "savickas-final",
        "QPCS": "qpcs-sintesi",
        "QPCC": "qpcc-factors",
        "QAP": "qap-factors",
        "IDEA": "idea-synthesis",
    }
    preferred_id = summary_ids.get((result.questionnaire_type or "").upper())
    final_step = next((step for step in steps if step.id == preferred_id), None)
    if final_step is None:
        final_step = next(
            (step for step in steps if (step.system_prompt_mode or "").endswith("-summary")),
            steps[0],
        )

    row = (
        db.query(models.Log)
        .filter(
            models.Log.action == "chat_message",
            models.Log.session_id == result.session_id,
            models.Log.phase == final_step.id,
        )
        .order_by(models.Log.timestamp.desc(), models.Log.id.desc())
        .first()
    )
    summary = ((row.details or {}).get("bot_response") or "").strip() if row else ""
    return (summary or None), (row.id if row else None)


def _student_spoke_after(db: Session, session_id: str, log_id: int) -> bool:
    """Vero se lo studente ha ancora parlato dopo la sintesi dello step.

    Quello che la persona decide dopo la sintesi non e' dentro la sintesi:
    riservirla in silenzio consegnerebbe una fotografia vecchia.
    """
    rows = (
        db.query(models.Log)
        .filter(
            models.Log.action == "chat_message",
            models.Log.session_id == session_id,
            models.Log.id > log_id,
        )
        .all()
    )
    return any(((row.details or {}).get("user_input") or "").strip() for row in rows)


def _summary_fingerprint(
    *,
    messages: list[dict],
    scores: dict,
    recommendations: dict[str, list[dict]] | None,
    lang: str,
) -> str:
    """Impronta di tutto cio' da cui la sintesi dipende.

    Contare i turni non basta: correggere l'ultimo messaggio lascia il conto
    invariato e riconsegnerebbe la sintesi scritta prima della correzione.
    """
    payload = json.dumps(
        {
            "version": SUMMARY_PROMPT_VERSION,
            "lang": lang,
            "scores": scores or {},
            "messages": [[msg.get("role", ""), msg.get("text", "")] for msg in messages],
            "recommendations": recommendations or {},
        },
        sort_keys=True,
        ensure_ascii=False,
        default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _cached_summary(db: Session, session_id: str, fingerprint: str) -> str | None:
    rows = (
        db.query(models.Log)
        .filter(models.Log.action == PDF_SUMMARY_ACTION, models.Log.session_id == session_id)
        .order_by(models.Log.timestamp.desc(), models.Log.id.desc())
        .all()
    )
    for row in rows:
        d = row.details or {}
        if d.get("fingerprint") == fingerprint:
            summary = (d.get("summary") or "").strip()
            if summary:
                return summary
    return None


def _store_summary(
    db: Session,
    *,
    result: models.QuestionnaireResult,
    lang: str,
    fingerprint: str,
    summary: str,
    source: str,
    turn_count: int,
) -> None:
    db.add(models.Log(
        session_id=result.session_id,
        action=PDF_SUMMARY_ACTION,
        questionnaire_type=result.questionnaire_type,
        details={
            "language": lang,
            "fingerprint": fingerprint,
            "source": source,
            "turn_count": turn_count,
            "summary": summary,
        },
    ))
    db.commit()


def _summary_chunks(messages: list[dict], lang: str) -> list[str]:
    """Divide la conversazione in scaglioni, senza mai tagliarne la coda.

    Troncare ai primi caratteri buttava via proprio la fine, dove stanno le
    decisioni. Anche un singolo messaggio molto lungo viene diviso in blocchi
    limitati; le note vengono ridotte a livelli quando serve.
    """
    lines = [
        f"{('Student' if msg.get('role') == 'student' else 'Counselor')}: "
        f"{strip_for_speech(msg.get('text', ''), lang=lang).strip()}"
        for msg in messages
        if msg.get("text")
    ]
    transcript = "\n".join(lines)
    return [transcript[start:start + _SUMMARY_CHUNK_CHARS]
            for start in range(0, len(transcript), _SUMMARY_CHUNK_CHARS)]


_SUMMARY_SYSTEM_PROMPT = (
    "You write concise, student-facing counseling summaries. Avoid diagnosis. "
    "Use only what the questionnaire results, the listed certified material and the "
    "conversation support: never invent readings, exercises or personalised actions "
    "that are absent from that material or from what the student already decided."
)


def _ask_model(ai: AIService, user_prompt: str, session_id: str, *, max_tokens: int) -> str | None:
    """Risposta del modello, o None quando non e' raggiungibile."""
    try:
        answer = ai.get_response(user_prompt, _SUMMARY_SYSTEM_PROMPT, "generic", max_tokens=max_tokens)
    except Exception as exc:
        logger.warning("Summary generation failed for session %s: %s", session_id, exc)
        return None
    return (answer or "").strip() or None


def _chunk_prompt(index: int, total: int, lang: str, chunk: str) -> str:
    return f"""
Write in {_PDF_SUMMARY_LANG_NAME[lang]}.

This is part {index} of {total} of a single counseling conversation, in order.

Take dense notes on this part: what the student said about themselves, the themes
discussed, the material proposed and, above all, the decisions, commitments and
corrections the student stated. Keep decisions and corrections in the student's own
words when they are short. Notes only, no preamble and no conclusions, at most 250 words.

Transcript of part {index}:
{chunk}
""".strip()


def _summary_prompt(
    *,
    questionnaire_type: str,
    scores: dict,
    material: str,
    strategies: str,
    transcript: str,
    lang: str,
    from_notes: bool,
) -> str:
    source = (
        "Ordered notes on consecutive parts of the conversation. Later parts are more "
        "recent: where they disagree with earlier ones, the later statement is the one that holds"
        if from_notes
        else "Conversation transcript"
    )
    return f"""
Write in {_PDF_SUMMARY_LANG_NAME[lang]}.

Questionnaire: {questionnaire_type}
Scores: {scores or '-'}
Certified readings and strategies shown to the student:
{material}
Certified or retrieved strategies mentioned in the conversation:
{strategies}

{source}:
{transcript}

Create a short Markdown summary with these four sections:
1. Discussion summary
2. Main results or themes
3. Suggested strategies
4. First practical steps

Report the decisions the student actually made and, where they changed their mind,
the version that holds at the end. Keep it concrete, warm, and useful for the
student. Maximum 350 words.
""".strip()


def _summary_material(recommendations: dict[str, list[dict]] | None) -> str:
    """Le voci certificate ancora in piedi: il modello non puo' andare oltre."""
    lines: list[str] = []
    for item in (recommendations or {}).get("reading") or []:
        if _recommendation_status(item) == "dismissed":
            continue
        lines.append(json.dumps({"type": "reading", **item}, ensure_ascii=False))
    for item in (recommendations or {}).get("strategy") or []:
        if _recommendation_status(item) == "dismissed":
            continue
        lines.append(json.dumps({"type": "strategy", **item}, ensure_ascii=False))
    return "\n".join(dict.fromkeys(line for line in lines if line.strip())) or "-"


def _recommendation_status(item: dict) -> str:
    return str(item.get("status") or "proposed").strip().lower()


def _generate_summary(
    db: Session,
    *,
    result: models.QuestionnaireResult,
    scores: dict,
    messages: list[dict],
    recommendations: dict[str, list[dict]] | None,
    lang: str,
) -> str | None:
    chunks = _summary_chunks(messages, lang)
    if not chunks:
        return None
    ai = AIService(db)
    from_notes = False
    while len(chunks) > 1:
        notes: list[str] = []
        for index, chunk in enumerate(chunks, start=1):
            note = _ask_model(ai, _chunk_prompt(index, len(chunks), lang, chunk), result.session_id, max_tokens=700)
            if note is None:
                return None
            notes.append(f"[Part {index}/{len(chunks)}]\n{note}")
        combined = "\n\n".join(notes)
        if len(combined) >= sum(len(chunk) for chunk in chunks):
            # A provider ignoring the note limit must not create an endless reduction.
            return None
        chunks = [combined[start:start + _SUMMARY_CHUNK_CHARS]
                  for start in range(0, len(combined), _SUMMARY_CHUNK_CHARS)]
        from_notes = True
    transcript = chunks[0]
    return _ask_model(
        ai,
        _summary_prompt(
            questionnaire_type=result.questionnaire_type,
            scores=scores,
            material=_summary_material(recommendations),
            strategies="See the confirmed material above; proposed does not mean chosen.",
            transcript=transcript,
            lang=lang,
            from_notes=from_notes,
        ),
        result.session_id,
        max_tokens=900,
    )


def canonical_summary(
    db: Session,
    *,
    result: models.QuestionnaireResult,
    scores: dict,
    messages: list[dict],
    recommendations: dict[str, list[dict]] | None,
    lang: str,
    regenerate: bool = False,
) -> tuple[str | None, str]:
    """La sintesi che leggono sia l'anteprima sia il PDF, con il suo stato.

    Una sola sintesi per impronta: guardarla nel profilo e poi scaricarla non
    fa girare il modello due volte, e i due posti non possono divergere.
    """
    lang = _pdf_language(lang)
    if not messages:
        return None, "empty"
    fingerprint = _summary_fingerprint(
        messages=messages, scores=scores, recommendations=recommendations, lang=lang,
    )
    if not regenerate:
        cached = _cached_summary(db, result.session_id, fingerprint)
        if cached:
            return cached, "ready"
        step_summary, log_id = _final_step_summary(db, result)
        step_log = db.query(models.Log).filter(models.Log.id == log_id).first() if log_id is not None else None
        same_language = step_log and (step_log.details or {}).get("language") == lang
        choices_changed = any(item.get("status", "proposed") != "proposed" or item.get("helpful") is not None
                              for items in (recommendations or {}).values() for item in items)
        if step_summary and same_language and not choices_changed and not _student_spoke_after(db, result.session_id, log_id):
            _store_summary(
                db, result=result, lang=lang, fingerprint=fingerprint,
                summary=step_summary, source="guided_step", turn_count=len(messages),
            )
            return step_summary, "ready"

    summary = _generate_summary(
        db, result=result, scores=scores, messages=messages,
        recommendations=recommendations, lang=lang,
    )
    if not summary:
        return None, "unavailable"
    _store_summary(
        db, result=result, lang=lang, fingerprint=fingerprint,
        summary=summary, source="generated", turn_count=len(messages),
    )
    return summary, "ready"


def _summary_inputs(db: Session, result: models.QuestionnaireResult, lang: str) -> dict:
    """Gli stessi ingredienti per anteprima e PDF: impronta uguale, sintesi unica."""
    return {
        "result": result,
        "scores": result.scores if isinstance(result.scores, dict) else {},
        "messages": _session_conversation_messages(db, result.session_id),
        "recommendations": recommendation_service.list_for_session(
            db, session_id=result.session_id, username=result.username or "", language=_pdf_language(lang),
        ),
        "lang": lang,
    }


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

    return _session_conversation_messages(db, session_id)


@router.get("/user/questionnaire-result/{session_id}/summary")
async def get_user_session_summary(
    session_id: str,
    lang: str = Query("it", description="Lingua della sintesi (it, en, es, fr, de, sv)"),
    regenerate: bool = Query(False, description="Riscrive la sintesi anche quando ne esiste una in cache"),
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Anteprima della sintesi: e' lo stesso testo che finisce nel PDF."""
    result = _get_owned_questionnaire_result(session_id, current_user, db)
    summary, status = canonical_summary(
        db, **_summary_inputs(db, result, lang), regenerate=regenerate,
    )
    return {"summary": summary, "status": status}


@router.get("/questionnaire-result/{session_id}/pdf")
async def download_questionnaire_pdf(
    session_id: str,
    lang: str = Query("it", description="Lingua del PDF (it, en, es, fr, de, sv)"),
    mode: Literal["brief", "full"] = Query("full", description="full: dettaglio e trascrizione; brief: sintesi, consigli e diagrammi"),
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Scarica il PDF con i risultati del questionario per una sessione."""
    result = _get_owned_questionnaire_result(session_id, current_user, db)

    # ponytail: usa solo user_input (la vera interazione studente).
    # effective_user_input contiene il prompt di sistema inglese dei guided
    # step: non è una vera interazione e non va nel PDF studente.
    inputs = _summary_inputs(db, result, lang)
    summary_text, summary_status = canonical_summary(db, **inputs)
    brief = (mode or "full").strip().lower() == "brief"
    if summary_status == "unavailable":
        # Il PDF dice perche' la sintesi manca e rimanda dove il testo resta.
        fallback = _PDF_SUMMARY_FALLBACK_BRIEF if brief else _PDF_SUMMARY_FALLBACK
        summary_text = fallback[_pdf_language(lang)]

    pdf_bytes = generate_questionnaire_pdf(
        questionnaire_type=result.questionnaire_type,
        scores=inputs["scores"],
        session_id=result.session_id,
        submitted_at=str(result.submitted_at) if result.submitted_at else None,
        language=lang,
        messages=inputs["messages"] or None,
        summary_text=summary_text,
        recommendations=inputs["recommendations"],
        visual_workspace=load_workspace(db, result.session_id, result.username or "")["workspace"],
        mode="brief" if brief else "full",
    )

    filename = f"counselorbot_{result.questionnaire_type}_{result.id}{'_brief' if brief else ''}.pdf"
    return Response(
        content=pdf_bytes.read(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Summary-Status": summary_status,
        },
    )
