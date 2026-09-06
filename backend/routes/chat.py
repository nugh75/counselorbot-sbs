"""Endpoint di chat e QSA: /chat, /chat/stream, /chat/message,
/qsa/guided-ui-texts, /qsa/audit, /qsa/upload, /tts."""
import functools
import io
import logging
import os
import tempfile
import uuid
from typing import Literal

import edge_tts
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from .. import auth, database, models, model_pricing
from ..anonymous_codes import code_for_identity
from ..ai_service import AIService, AIError
from ..chat_continuation import continuation_message
from .. import pii
from ..api_models import ChatRequest, QsaAuditRequest, TTSRequest
from ..diagram_blocks import strip_for_speech
from ..idea_map import (
    IDEA_INSTRUMENT,
    IdeaMapError,
    apply_and_store,
    extract_patch,
    names_prior_work,
    strip_patch_for_display,
)
from ..memory_service import session_memory
from ..chat_preparation import prepare_chat_turn
from ..strategy_memory import shared_response_memory
from .. import recommendation_blocks
from .. import recommendation_service as _recommendation_service
from ..certified_reading_service import certified_reading_memory
from ..i18n_fields import localized
from ..qsa_extractor import (
    DEFAULT_OCR_MODEL,
    DEFAULT_PARSER_MODEL,
    extract_questionnaire_data,
)
from ..guided_text_i18n import SECONDARY_LANGS, resolve_text, QUESTIONS_LABEL, PHASE_WORD
from ..guided_step_label_i18n import resolve_step_label, strip_step_ordinal
from ..guided_step_questions_seed import FIXED_QUESTIONS_STEP_ID
from ..prompt_config import (
    DEFAULT_SYSTEM_PROMPT_GENERIC,
    DEFAULT_GUIDED_TEXT_QSAR_QUESTIONS_INTRO,
    DEFAULT_GUIDED_TEXT_QSAR_CONCLUSION,
    DEFAULT_GUIDED_TEXT_ZTPI_QUESTIONS_INTRO,
    DEFAULT_GUIDED_TEXT_ZTPI_CONCLUSION,
    DEFAULT_GUIDED_TEXT_SAVICKAS_QUESTIONS_INTRO,
    DEFAULT_GUIDED_TEXT_SAVICKAS_CONCLUSION,
    DEFAULT_GUIDED_TEXT_QPCS_QUESTIONS_INTRO,
    DEFAULT_GUIDED_TEXT_QPCS_CONCLUSION,
    DEFAULT_GUIDED_TEXT_QPCC_QUESTIONS_INTRO,
    DEFAULT_GUIDED_TEXT_QPCC_CONCLUSION,
    DEFAULT_GUIDED_TEXT_QAP_QUESTIONS_INTRO,
    DEFAULT_GUIDED_TEXT_QAP_CONCLUSION,
    GUIDED_PUBLIC_UI_CONFIG_DEFINITIONS,
    MODE_TO_SYSTEM_PROMPT_KEY,
    SYSTEM_PROMPT_DEFAULTS,
)
from ..chat_logic import (
    _annotate_qsa_factor_codes,
    _apply_global_directives,
    _ensure_questionnaire_guided_steps,
    _ensure_required_qsa_factor_codes,
    _limit_visible_words,
    _is_strategy_questionnaire,
    _phase_factor_codes,
    _requires_complete_factor_output,
    _sanitize_ztpi_step_label,
    _sanitize_ztpi_user_text,
    _should_sanitize_ztpi_text,
    _strip_generic_acknowledgement,
    _student_visible_response,
    _update_markdown_memory_background,
    build_log_envelope,
    conversation_id_for,
    full_prompt_logging_enabled,
    strip_markdown,
)

router = APIRouter()
get_db = database.get_db
logger = logging.getLogger(__name__)
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_UPLOAD_SUFFIXES = {".pdf", ".jpg", ".jpeg", ".png"}
SUPPORTED_CHAT_LANGUAGES = {"it", *SECONDARY_LANGS}


def _normalize_language(language: str | None) -> str:
    raw = (language or "it").strip().lower()
    if not raw:
        return "it"
    primary = raw.replace("_", "-").split("-", 1)[0]
    return primary if primary in SUPPORTED_CHAT_LANGUAGES else "it"


def _usage_cost_usd(usage: dict | None, provider: str | None = None, model: str | None = None) -> float | None:
    # 1. Costo esplicito nell'usage (OpenRouter lo restituisce).
    if isinstance(usage, dict):
        for key in ("cost", "cost_usd", "total_cost"):
            value = usage.get(key)
            if isinstance(value, (int, float)):
                return float(value)
            if isinstance(value, str):
                try:
                    return float(value)
                except ValueError:
                    continue
    # 2. Stima dai token via tabella prezzi (provider diretti senza costo).
    return model_pricing.estimate_cost_usd(provider, model, usage)


def _resolve_counselor(db, counselor_id):
    """(provider, model, persona, name, disable_thinking, reasoning_budget) dal counselor + preset.

    provider/model None -> usa la config globale; persona None -> nessun prefisso
    al system prompt; name None -> placeholder {{counselor_name}} usa il fallback;
    disable_thinking None -> usa la config globale; reasoning_budget None -> usa il
    default della famiglia del modello.
    """
    if not counselor_id:
        return None, None, None, None, None, None
    counselor = (
        db.query(models.Counselor)
        .filter(models.Counselor.id == counselor_id, models.Counselor.is_active.is_(True))
        .first()
    )
    if not counselor:
        return None, None, None, None, None, None
    provider = model = None
    disable_thinking = None
    reasoning_budget = None
    if counselor.preset_id:
        preset = (
            db.query(models.ModelPreset)
            .filter(models.ModelPreset.id == counselor.preset_id)
            .first()
        )
        if preset:
            provider, model = preset.provider, preset.model
            disable_thinking = bool(preset.disable_thinking)
            reasoning_budget = preset.reasoning_budget
    return provider, model, counselor.persona, counselor.name, disable_thinking, reasoning_budget


def _apply_counselor_overrides(
    ai_service: AIService,
    disable_thinking: bool | None,
    reasoning_budget: int | None = None,
) -> None:
    if disable_thinking is not None:
        ai_service.disable_thinking = bool(disable_thinking)
        ai_service.config["disable_thinking"] = "true" if disable_thinking else "false"
    if reasoning_budget is not None:
        ai_service.reasoning_budget_override = reasoning_budget

# Questionari condotti dall'agente AI: testi intro/conclusione per tipo
# (chiave_intro, default_intro, chiave_conclusione, default_conclusione).
_AGENT_GUIDED_TEXTS = {
    "QPCS": ("text_qpcs_questions_intro", DEFAULT_GUIDED_TEXT_QPCS_QUESTIONS_INTRO,
             "text_qpcs_conclusion", DEFAULT_GUIDED_TEXT_QPCS_CONCLUSION),
    "QPCC": ("text_qpcc_questions_intro", DEFAULT_GUIDED_TEXT_QPCC_QUESTIONS_INTRO,
             "text_qpcc_conclusion", DEFAULT_GUIDED_TEXT_QPCC_CONCLUSION),
    "QAP": ("text_qap_questions_intro", DEFAULT_GUIDED_TEXT_QAP_QUESTIONS_INTRO,
            "text_qap_conclusion", DEFAULT_GUIDED_TEXT_QAP_CONCLUSION),
}

_REFLECTION_FIXED_QUESTIONS = {
    "it": [
        "Quale risultato o tema ti fa riflettere di piu'?",
        "Quale punto di forza puoi usare meglio da subito?",
        "Quale piccola strategia vuoi provare questa settimana?",
    ],
    "en": [
        "Which result or theme makes you reflect the most?",
        "Which strength can you use better right away?",
        "Which small strategy do you want to try this week?",
    ],
    "es": [
        "¿Qué resultado o tema te hace reflexionar más?",
        "¿Qué fortaleza puedes aprovechar mejor desde ahora?",
        "¿Qué pequeña estrategia quieres probar esta semana?",
    ],
    "fr": [
        "Quel résultat ou thème te fait le plus réfléchir ?",
        "Quelle force peux-tu mieux utiliser dès maintenant ?",
        "Quelle petite stratégie veux-tu essayer cette semaine ?",
    ],
    "de": [
        "Welches Ergebnis oder Thema bringt dich am meisten zum Nachdenken?",
        "Welche Stärke kannst du ab sofort besser nutzen?",
        "Welche kleine Strategie möchtest du diese Woche ausprobieren?",
    ],
    "sv": [
        "Vilket resultat eller tema får dig att reflektera mest?",
        "Vilken styrka kan du använda bättre redan nu?",
        "Vilken liten strategi vill du prova den här veckan?",
    ],
}


@router.get("/qsa/guided-ui-texts")
async def get_guided_ui_texts(questionnaire_type: str = "QSA", lang: str = "it", db: Session = Depends(get_db)):
    """Public endpoint with guided-chat UI texts/labels and step definitions.

    Pass ?questionnaire_type=QSAr, ZTPI or SAVICKAS for dedicated guided paths.
    Pass ?lang=en|es|fr|de|sv to get the student-facing texts in that language
    (falls back to the Italian base value when a translation is missing).
    """
    lang = _normalize_language(lang)
    ai_service = AIService(db)
    _ensure_questionnaire_guided_steps(db, questionnaire_type)
    cfg_get = ai_service.config.get

    # Localized "Questions" phase label/banner fragments (number set per questionnaire below).
    qlabel = QUESTIONS_LABEL.get(lang, QUESTIONS_LABEL["it"])
    phase_word = PHASE_WORD.get(lang, PHASE_WORD["it"])

    result: dict = {"language": lang}
    # Static config texts (questions labels, conclusion label, static messages),
    # resolved to the requested language (suffixed key -> base/Italian fallback).
    for ui_def in GUIDED_PUBLIC_UI_CONFIG_DEFINITIONS:
        result[ui_def["key"]] = resolve_text(cfg_get, ui_def["key"], lang, ui_def["default"])
    result["label_guided_questions"] = strip_step_ordinal(result["label_guided_questions"])
    result["label_guided_conclusion"] = strip_step_ordinal(result["label_guided_conclusion"])

    # Dynamic steps filtered by questionnaire_type
    steps = (
        db.query(models.GuidedStep)
        .filter(models.GuidedStep.questionnaire_type == questionnaire_type)
        .order_by(models.GuidedStep.sort_order)
        .all()
    )
    question_rows = (
        db.query(models.GuidedStepQuestion)
        .filter(
            models.GuidedStepQuestion.questionnaire_type == questionnaire_type,
            models.GuidedStepQuestion.language == lang,
            models.GuidedStepQuestion.is_active.is_(True),
        )
        .order_by(models.GuidedStepQuestion.step_id, models.GuidedStepQuestion.sort_order)
        .all()
    )
    questions_by_step: dict[str, list[str]] = {}
    for row in question_rows:
        questions_by_step.setdefault(row.step_id, []).append(row.text)

    result["guided_steps"] = [
        {
            "id": s.id,
            "sort_order": s.sort_order,
            "label": strip_step_ordinal(
                _sanitize_ztpi_step_label(resolve_step_label(s, lang), lang)
                if questionnaire_type == "ZTPI"
                else resolve_step_label(s, lang)
            ),
            "system_prompt_mode": s.system_prompt_mode,
            "color_theme": s.color_theme,
            "suggested_questions": questions_by_step.get(s.id, []),
        }
        for s in steps
    ]
    result["fixed_phase_questions"] = (
        questions_by_step.get(FIXED_QUESTIONS_STEP_ID)
        or _REFLECTION_FIXED_QUESTIONS.get(lang)
        or _REFLECTION_FIXED_QUESTIONS["it"]
    )

    # Override questions/conclusion texts per questionnaire
    if questionnaire_type == "QSAr":
        result["label_guided_questions"] = qlabel
        result["text_guided_questions_phase_banner"] = f"--- {phase_word} 8: {qlabel} ---"
        result["text_guided_questions_intro"] = resolve_text(
            cfg_get, "text_qsar_questions_intro", lang, DEFAULT_GUIDED_TEXT_QSAR_QUESTIONS_INTRO
        )
        result["text_guided_conclusion"] = resolve_text(
            cfg_get, "text_qsar_conclusion", lang, DEFAULT_GUIDED_TEXT_QSAR_CONCLUSION
        )
    elif questionnaire_type == "ZTPI":
        result["text_guided_questions_intro"] = _sanitize_ztpi_user_text(
            resolve_text(cfg_get, "text_ztpi_questions_intro", lang, DEFAULT_GUIDED_TEXT_ZTPI_QUESTIONS_INTRO),
            lang,
        )
        result["text_guided_conclusion"] = _sanitize_ztpi_user_text(
            resolve_text(cfg_get, "text_ztpi_conclusion", lang, DEFAULT_GUIDED_TEXT_ZTPI_CONCLUSION),
            lang,
        )
    elif questionnaire_type == "SAVICKAS":
        result["label_guided_questions"] = qlabel
        result["text_guided_questions_phase_banner"] = f"--- {phase_word} 7: {qlabel} ---"
        result["text_guided_questions_intro"] = resolve_text(
            cfg_get, "text_savickas_questions_intro", lang, DEFAULT_GUIDED_TEXT_SAVICKAS_QUESTIONS_INTRO
        )
        result["text_guided_conclusion"] = resolve_text(
            cfg_get, "text_savickas_conclusion", lang, DEFAULT_GUIDED_TEXT_SAVICKAS_CONCLUSION
        )
    elif questionnaire_type in _AGENT_GUIDED_TEXTS:
        intro_key, intro_default, concl_key, concl_default = _AGENT_GUIDED_TEXTS[questionnaire_type]
        result["text_guided_questions_intro"] = resolve_text(cfg_get, intro_key, lang, intro_default)
        result["text_guided_conclusion"] = resolve_text(cfg_get, concl_key, lang, concl_default)

    return result



def _apply_idea_patch(response_content: str, *, questionnaire_type: str, username: str | None,
                      session_id: str, step_id: str | None,
                      user_message: str = "", lang: str = "it") -> tuple[str, int | None]:
    """Toglie la patch della mappa dal testo e la fonde nella mappa di sessione.

    Il blocco non deve arrivare allo studente ne' finire nella memoria della
    sessione: e' l'istruzione con cui il modello disegna, non una sua frase.
    """
    if questionnaire_type != IDEA_INSTRUMENT or not username:
        return response_content, None
    cleaned, patch = extract_patch(response_content)
    if patch is None:
        return cleaned, None
    map_db = database.SessionLocal()
    try:
        revision = apply_and_store(
            map_db, username, session_id, patch, source="turn", step_id=step_id,
            promote_prior_work=names_prior_work(user_message, lang),
            prior_work_message=user_message,
        )
        return cleaned, revision.id
    except IdeaMapError as exc:
        # Patch fuori contratto: la mappa resta quella di prima e la risposta
        # resta leggibile. La sessione non si interrompe per un disegno.
        logger.info("Patch della mappa Idea non applicata (%s): %s", session_id, exc)
        return cleaned, None
    finally:
        map_db.close()



def _record_recommendations(
    db: Session,
    *,
    session_id: str,
    username: str,
    language: str,
    reading_ids: list[str],
    strategy_ids: list[str],
    turn_index: int,
    matched_on: dict[str, dict] | None = None,
) -> dict[str, list[dict]]:
    """Persist the items the completed turn actually recommended.

    Gli ids arrivano dalla dichiarazione del modello, non dal recupero: quello
    che era solo disponibile non entra nel libretto dello studente.
    """
    if not username:
        return {"reading": [], "strategy": []}

    # `payloads_for_slugs` rirende la voce dal solo slug e non sa piu' perche'
    # era entrata: la provenienza arriva dal turno, non dal catalogo.
    provenance = matched_on or {}
    reading_payloads = [
        {
            "slug": entry["id"],
            **{key: value for key, value in entry.items() if key != "id"},
            **provenance.get(entry["id"], {}),
        }
        for entry in certified_reading_memory.payloads_for_slugs(db, reading_ids, language)
    ]
    if reading_payloads:
        _recommendation_service.record(
            db,
            session_id=session_id,
            username=username,
            recommendation_type="reading",
            payloads=reading_payloads,
            turn_index=turn_index,
        )

    strategy_rows = (
        db.query(models.CertifiedStrategy)
        .filter(
            models.CertifiedStrategy.slug.in_(strategy_ids),
            models.CertifiedStrategy.status == "certified",
            models.CertifiedStrategy.is_active.is_(True),
        )
        .all()
        if strategy_ids else []
    )
    strategy_by_slug = {row.slug: row for row in strategy_rows}
    strategy_payloads = []
    for slug in strategy_ids:
        entry = strategy_by_slug.get(slug)
        if entry is None:
            continue
        strategy_payloads.append({
            "slug": entry.slug,
            "name": localized(entry, "name", language) or entry.slug,
            "description": localized(entry, "description", language) or "",
            "recommended_when": localized(entry, "recommended_when", language) or "",
            **provenance.get(slug, {}),
        })
    if strategy_payloads:
        _recommendation_service.record(
            db,
            session_id=session_id,
            username=username,
            recommendation_type="strategy",
            payloads=strategy_payloads,
            turn_index=turn_index,
        )

    return _recommendation_service.list_for_session(
        db, session_id=session_id, username=username,
    )


@router.post("/chat")
async def chat(request: ChatRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db), identity: dict = Depends(auth.get_identity_view_as)):
    session_id = request.session_id or str(uuid.uuid4())
    conversation_id = conversation_id_for(session_id, request.conversation_id)
    request.language = _normalize_language(request.language)

    # 1. Retrieve Configuration and System Prompt based on Mode
    ai_service = AIService(db)
    c_provider, c_model, c_persona, c_name, c_disable_thinking, c_reasoning_budget = _resolve_counselor(db, request.counselor_id)
    _apply_counselor_overrides(ai_service, c_disable_thinking, c_reasoning_budget)
    step = db.query(models.GuidedStep).filter(models.GuidedStep.id == request.phase).first() if request.phase else None
    is_first_step = False
    if request.use_phase_prompt and step:
        first_step = db.query(models.GuidedStep).filter(models.GuidedStep.questionnaire_type == step.questionnaire_type).order_by(models.GuidedStep.sort_order).first()
        is_first_step = bool(first_step and first_step.id == step.id)
        if is_first_step:
            session_memory.clear(session_id)
    prepared = prepare_chat_turn(
        db, ai_service, request, session_id, identity,
        c_persona=c_persona, counselor_name=c_name, provider=c_provider, model=c_model,
        create_anonymous_code=False, allow_generation=True,
    )
    prompt_key = prepared.prompt_key
    phase_prompt_key = prepared.phase_prompt_key
    effective_message = prepared.effective_message
    step_label = prepared.step_label
    questionnaire_type = prepared.questionnaire_type
    effective_response_length = prepared.effective_response_length
    max_tokens = prepared.max_tokens
    model_scores_context = prepared.model_scores_context
    knowledge_context = prepared.knowledge_context
    strategy_ids = prepared.strategy_ids
    certified_strategy_ids = prepared.certified_strategy_ids
    reading_ids = prepared.reading_ids
    recommendation_meta = prepared.recommendation_meta
    reading_candidates = prepared.reading_candidates
    strategy_candidates = prepared.strategy_candidates
    system_prompt_final = prepared.system_prompt_final
    full_message = prepared.full_message
    history = prepared.history
    sanitize = prepared.sanitize
    session_memory.update_context(
        session_id, questionnaire_type=questionnaire_type,
        scores_context=model_scores_context, language=request.language or "",
        phase=request.phase or "", step_label=step_label,
    )
    has_recommendation_candidates = bool(reading_candidates or strategy_candidates)

    # 4. Get AI Response (KNOWLEDGE nel system, continuity nella history -> no summary).
    try:
        response_content = ai_service.get_response(
            full_message, system_prompt_final, request.mode,
            conversation_summary="",
            max_tokens=max_tokens,
            provider=c_provider, model=c_model,
            history=history,
        )
    except AIError as e:
        logger.error(f"Errore AI chat session {session_id}: {e}")
        from ..chat_logic import log_error as _log_error
        _log_error(db, session_id, str(e), identity=identity, questionnaire_type=questionnaire_type,
                   mode=request.mode, phase=request.phase, conversation_id=conversation_id)
        raise HTTPException(status_code=502, detail=str(e))
    # Il blocco privato esce subito: non deve raggiungere lo studente, il
    # transcript, il log o il PDF.
    response_content, recommended = recommendation_blocks.extract(
        response_content, readings=reading_candidates, strategies=strategy_candidates,
    )
    if _should_sanitize_ztpi_text(request.mode, request.phase):
        response_content = _sanitize_ztpi_user_text(response_content, request.language)
    elif _is_strategy_questionnaire(questionnaire_type):
        response_content = _annotate_qsa_factor_codes(
            response_content, request.language, questionnaire_type=questionnaire_type
        )
        if _requires_complete_factor_output(request.mode):
            response_content = _ensure_required_qsa_factor_codes(
                response_content, questionnaire_type, request.language, _phase_factor_codes(db, request.phase)
            )
    response_content, idea_revision_id = _apply_idea_patch(
        response_content,
        questionnaire_type=questionnaire_type,
        username=identity.get("username"),
        session_id=session_id,
        step_id=request.phase,
        user_message=request.message or "",
        lang=request.language or "it",
    )
    response_content = _strip_generic_acknowledgement(response_content)
    response_content, truncated = _limit_visible_words(response_content, effective_response_length)
    if truncated:
        recommended = recommendation_blocks.retain_visible(
            recommended, response_content, readings=reading_candidates, strategies=strategy_candidates,
        )

    if _should_sanitize_ztpi_text(request.mode, request.phase):
        step_label = _sanitize_ztpi_step_label(step_label, request.language)

    # Transcript verbatim role-tagged per la sessione (Fase 2).
    if request.internal_message:
        _transcript_user = ""
    elif request.memory_message is not None:
        _transcript_user = request.memory_message
    elif step_label:
        _transcript_user = f"[Avvio analisi: {step_label}]"
    else:
        _transcript_user = request.message
    _memory_user_message = request.memory_message if request.memory_message is not None else ("" if request.internal_message else request.message)

    # Deterministic local write: complete it before the client can advance phase.
    _update_markdown_memory_background(
        session_id, _memory_user_message, response_content,
        step_label, is_first_step, knowledge_context, request.phase or "", model_scores_context,
        questionnaire_type, request.language or "", False,
        transcript_user=_transcript_user,
    )

    # 6. Log Interaction
    _provider = getattr(ai_service, "last_provider", None) or c_provider or ai_service.config.get('active_provider', 'unknown')
    _model = getattr(ai_service, "last_model", None) or c_model or ai_service.config.get('model_name', 'unknown')
    _usage = getattr(ai_service, "last_usage", None)
    _cost_usd = _usage_cost_usd(_usage, _provider, _model)
    _details = pii.redact_details({
        "conversation_id": conversation_id,
        "mode": request.mode,
        "phase": request.phase,
        "user_input": "" if request.internal_message else request.message,
        "effective_user_input": effective_message,
        "bot_response": response_content,
        "system_prompt_key": prompt_key,
        "guided_phase_prompt_key": phase_prompt_key,
        "provider": _provider,
        "model_attempts": getattr(ai_service, "last_attempts", []),
        "context_budget": getattr(ai_service, "last_context_report", None),
        "journey_coverage": prepared.components.get("journey_coverage"),
        "model": _model,
        "questionnaire_type": questionnaire_type,
        "knowledge_context_length": len(knowledge_context),
        "strategy_ids": strategy_ids,
        # `certified_strategy_ids` resta l'elenco iniettato nel prompt; i
        # `recommended_*` sono quello che la risposta ha davvero proposto.
        "certified_strategy_ids": certified_strategy_ids,
        "recommended_strategy_ids": recommended["strategy"],
        "recommended_reading_ids": recommended["reading"],
        "language": request.language or "it",
        "usage": _usage,
        "cost_usd": _cost_usd,
    }, "user_input", "effective_user_input", "bot_response")
    if full_prompt_logging_enabled(db):
        _details["envelope"] = pii.redact_envelope(
            build_log_envelope(system_prompt_final, full_message, history)
        )
    log_entry = models.Log(
        session_id=session_id,
        conversation_id=conversation_id,
        action="chat_message",
        username=identity.get("username") or None,
        email=identity.get("email") or None,
        anonymous_research_code=code_for_identity(db, identity),
        provider=_provider,
        model_name=_model,
        cost_usd=_cost_usd,
        questionnaire_type=questionnaire_type,
        phase=request.phase or None,
        mode=request.mode or None,
        details=_details,
    )
    db.add(log_entry)
    response_id = shared_response_memory.create_candidate(
        db,
        response_content,
        questionnaire_type,
        request.phase or "",
        request.language or "it",
    )
    if response_id:
        log_entry.response_id = response_id
    db.commit()
    recommendations_for_response = _record_recommendations(
        db,
        session_id=session_id,
        username=identity.get("username", "") if identity else "",
        language=request.language or "it",
        reading_ids=recommended["reading"],
        strategy_ids=recommended["strategy"],
        matched_on=recommendation_meta,
        turn_index=max(0, len(session_memory.get_transcript(session_id)) - 1),
    )

    return {
        "response": response_content,
        "session_id": session_id,
        "conversation_id": conversation_id,
        "strategy_ids": strategy_ids,
        "certified_strategy_ids": recommended["strategy"],
        "response_id": response_id,
        "idea_revision_id": idea_revision_id,
        "recommendations": recommendations_for_response,
    }


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest, db: Session = Depends(get_db), identity: dict = Depends(auth.get_identity_view_as)):
    """
    Variante streaming di /chat (Server-Sent Events).
    Eventi: {"delta": "..."} per ogni pezzo, poi {"done": true, "response": <full>, "session_id": ...}.
    Il logging e l'aggiornamento della memoria Markdown avvengono al termine dello stream.
    NB: la sessione `db` viene chiusa al ritorno della funzione (prima che il
    generatore venga consumato), perciò l'AIService carica la config subito e
    il logging usa una sessione fresca.
    """
    import json as _json

    session_id = request.session_id or str(uuid.uuid4())
    conversation_id = conversation_id_for(session_id, request.conversation_id)
    request.language = _normalize_language(request.language)

    # Preparazione (usa la db della richiesta, ancora aperta qui)
    ai_service = AIService(db)
    c_provider, c_model, c_persona, c_name, c_disable_thinking, c_reasoning_budget = _resolve_counselor(db, request.counselor_id)
    _apply_counselor_overrides(ai_service, c_disable_thinking, c_reasoning_budget)
    step = db.query(models.GuidedStep).filter(models.GuidedStep.id == request.phase).first() if request.phase else None
    is_first_step = False
    if request.use_phase_prompt and step:
        first_step = db.query(models.GuidedStep).filter(models.GuidedStep.questionnaire_type == step.questionnaire_type).order_by(models.GuidedStep.sort_order).first()
        is_first_step = bool(first_step and first_step.id == step.id)
        if is_first_step and not request.partial_response:
            session_memory.clear(session_id)
    prepared = prepare_chat_turn(
        db, ai_service, request, session_id, identity,
        c_persona=c_persona, counselor_name=c_name, provider=c_provider, model=c_model,
        create_anonymous_code=False, allow_generation=True,
    )
    prompt_key = prepared.prompt_key
    phase_prompt_key = prepared.phase_prompt_key
    effective_message = prepared.effective_message
    step_label = prepared.step_label
    questionnaire_type = prepared.questionnaire_type
    effective_response_length = None if request.partial_response else prepared.effective_response_length
    max_tokens = prepared.max_tokens
    model_scores_context = prepared.model_scores_context
    knowledge_context = prepared.knowledge_context
    strategy_ids = prepared.strategy_ids
    certified_strategy_ids = prepared.certified_strategy_ids
    reading_ids = prepared.reading_ids
    recommendation_meta = prepared.recommendation_meta
    reading_candidates = prepared.reading_candidates
    strategy_candidates = prepared.strategy_candidates
    system_prompt_final = prepared.system_prompt_final
    full_message = continuation_message(prepared.full_message, request.partial_response)
    history = prepared.history
    sanitize = prepared.sanitize
    session_memory.update_context(
        session_id, questionnaire_type=questionnaire_type,
        scores_context=model_scores_context, language=request.language or "",
        phase=request.phase or "", step_label=step_label,
    )
    has_recommendation_candidates = bool(reading_candidates or strategy_candidates)

    provider = c_provider or ai_service.config.get('active_provider', 'unknown')
    model = c_model or ai_service.config.get('model_name', 'unknown')

    def _log_stream(
        response_content: str,
        usage: dict | None = None,
        recommended: dict[str, list[str]] | None = None,
    ) -> str | None:
        provider = getattr(ai_service, "last_provider", None) or c_provider or ai_service.config.get("active_provider", "unknown")
        model = getattr(ai_service, "last_model", None) or c_model or ai_service.config.get("model_name", "unknown")
        log_db = database.SessionLocal()
        try:
            cost_usd = _usage_cost_usd(usage, provider, model)
            _details = pii.redact_details({
                "conversation_id": conversation_id,
                "mode": request.mode,
                "phase": request.phase,
                "user_input": "" if request.internal_message else request.message,
                "effective_user_input": effective_message,
                "bot_response": response_content,
                "system_prompt_key": prompt_key,
                "guided_phase_prompt_key": phase_prompt_key,
                "provider": provider,
                "model": model,
                "model_attempts": getattr(ai_service, "last_attempts", []),
                "context_budget": getattr(ai_service, "last_context_report", None),
                "journey_coverage": prepared.components.get("journey_coverage"),
                "questionnaire_type": questionnaire_type,
                "knowledge_context_length": len(knowledge_context),
                "strategy_ids": strategy_ids,
                # `certified_strategy_ids` resta l'elenco iniettato nel prompt; i
                # `recommended_*` sono quello che la risposta ha davvero proposto.
                "certified_strategy_ids": certified_strategy_ids,
                "recommended_strategy_ids": (recommended or {}).get("strategy", []),
                "recommended_reading_ids": (recommended or {}).get("reading", []),
                "language": request.language or "it",
                "streamed": True,
                "response_length": request.response_length,
                "usage": usage,
                "cost_usd": cost_usd,
            }, "user_input", "effective_user_input", "bot_response")
            if full_prompt_logging_enabled(log_db):
                _details["envelope"] = pii.redact_envelope(
                    build_log_envelope(system_prompt_final, full_message, history)
                )
            log_entry = models.Log(
                session_id=session_id,
                conversation_id=conversation_id,
                action="chat_message",
                username=identity.get("username") or None,
                email=identity.get("email") or None,
                anonymous_research_code=code_for_identity(log_db, identity),
                provider=provider,
                model_name=model,
                cost_usd=cost_usd,
                questionnaire_type=questionnaire_type,
                phase=request.phase or None,
                mode=request.mode or None,
                details=_details,
            )
            log_db.add(log_entry)
            response_id = shared_response_memory.create_candidate(
                log_db,
                response_content,
                questionnaire_type,
                request.phase or "",
                request.language or "it",
            )
            if response_id:
                log_entry.response_id = response_id
            log_db.commit()
            return response_id
        except Exception as e:
            logger.error(f"Errore log stream session {session_id}: {e}")
            log_db.rollback()
            return None
        finally:
            log_db.close()

    def event_gen():
        yield f"data: {_json.dumps({'session_id': session_id, 'conversation_id': conversation_id})}\n\n"
        chunks = [request.partial_response]
        usage_info = None
        previous_display = ""
        try:
            for item in ai_service.stream_response(
                full_message, system_prompt_final, request.mode,
                conversation_summary="",
                max_tokens=max_tokens,
                provider=c_provider, model=c_model,
                history=history,
            ):
                if isinstance(item, dict) and item.get("type") == "usage":
                    usage_info = item.get("usage")
                    continue
                text = item.get("text") if isinstance(item, dict) else item
                if not text:
                    continue
                # Reasoning / thinking: streammato a parte, NON entra nella risposta finale.
                if isinstance(item, dict) and item.get("type") == "reasoning":
                    yield f"data: {_json.dumps({'reasoning': text})}\n\n"
                    continue
                chunks.append(text)
                raw_response = "".join(chunks)
                display_response = _student_visible_response(
                    raw_response, questionnaire_type, request.language, sanitize
                )
                if questionnaire_type == IDEA_INSTRUMENT:
                    display_response = strip_patch_for_display(display_response)
                display_response = recommendation_blocks.strip_for_display(display_response)
                display_response, truncated = _limit_visible_words(display_response, effective_response_length)
                event = {"display": display_response}
                if effective_response_length is None:
                    event["delta"] = display_response[len(previous_display):] if display_response.startswith(previous_display) else ""
                previous_display = display_response
                yield f"data: {_json.dumps(event)}\n\n"
                # IDEA manda la patch tecnica in fondo: continuiamo a consumare
                # lo stream anche quando il testo visibile ha gia' raggiunto il
                # limite, altrimenti il diagramma non riceve mai l'aggiornamento.
                # Stesso motivo per il blocco delle raccomandazioni: senza, il
                # turno non sa che cosa e' stato davvero proposto.
                if truncated and questionnaire_type != IDEA_INSTRUMENT and not has_recommendation_candidates:
                    break

            raw_response = "".join(chunks)
            if request.partial_response and not "".join(chunks[1:]).strip():
                raise AIError("The provider returned no continuation.")
            # Il blocco privato esce prima di ogni altra elaborazione: non deve
            # raggiungere lo studente, il transcript, il log o il PDF.
            raw_response, recommended = recommendation_blocks.extract(
                raw_response, readings=reading_candidates, strategies=strategy_candidates,
            )
            if questionnaire_type == IDEA_INSTRUMENT:
                response_content, idea_revision_id = _apply_idea_patch(
                    raw_response,
                    questionnaire_type=questionnaire_type,
                    username=identity.get("username"),
                    session_id=session_id,
                    step_id=request.phase,
                    user_message=request.message or "",
                    lang=request.language or "it",
                )
                response_content = _student_visible_response(
                    response_content, questionnaire_type, request.language, sanitize
                )
            else:
                response_content = _student_visible_response(
                    raw_response, questionnaire_type, request.language, sanitize
                )
                if _requires_complete_factor_output(request.mode):
                    response_content = _ensure_required_qsa_factor_codes(
                        response_content, questionnaire_type, request.language, _phase_factor_codes(db, request.phase)
                    )
                response_content, idea_revision_id = _apply_idea_patch(
                    response_content,
                    questionnaire_type=questionnaire_type,
                    username=identity.get("username"),
                    session_id=session_id,
                    step_id=request.phase,
                    user_message=request.message or "",
                    lang=request.language or "it",
                )
            response_content, truncated = _limit_visible_words(response_content, effective_response_length)
            if truncated:
                recommended = recommendation_blocks.retain_visible(
                    recommended, response_content, readings=reading_candidates, strategies=strategy_candidates,
                )
            if not response_content.strip():
                raise AIError(
                    "Il provider AI ha terminato lo stream senza contenuto visibile. "
                    "Se stai usando un modello reasoning, abilita 'No reasoning' nel preset "
                    "del counselor o nella configurazione globale."
                )

            if truncated and questionnaire_type != IDEA_INSTRUMENT:
                yield f"data: {_json.dumps({'done': True, 'incomplete': True, 'response': response_content, 'session_id': session_id, 'conversation_id': conversation_id})}\n\n"
                return

            # Transcript verbatim role-tagged per la sessione (Fase 2).
            if request.internal_message:
                _transcript_user = ""
            elif request.memory_message is not None:
                _transcript_user = request.memory_message
            elif step_label:
                _transcript_user = f"[Avvio analisi: {step_label}]"
            else:
                _transcript_user = request.message
            _memory_user_message = request.memory_message if request.memory_message is not None else ("" if request.internal_message else request.message)

            # Complete the local memory write before the frontend records a phase transition.
            _update_markdown_memory_background(
                session_id,
                _memory_user_message,
                response_content,
                step_label,
                is_first_step and not request.partial_response,
                knowledge_context,
                request.phase or "",
                model_scores_context,
                questionnaire_type,
                request.language or "",
                False,
                transcript_user=_transcript_user,
            )

            response_id = _log_stream(response_content, usage_info, recommended)
            recommendations_for_response: dict[str, list[dict]] = {"reading": [], "strategy": []}
            recommendation_db = database.SessionLocal()
            try:
                recommendations_for_response = _record_recommendations(
                    recommendation_db,
                    session_id=session_id,
                    username=identity.get("username", "") if identity else "",
                    language=request.language or "it",
                    reading_ids=recommended["reading"],
                    strategy_ids=recommended["strategy"],
                    matched_on=recommendation_meta,
                    turn_index=max(0, len(session_memory.get_transcript(session_id)) - 1),
                )
            except Exception as exc:
                logger.warning("Recommendation persistence failed for %s: %s", session_id, exc)
            finally:
                recommendation_db.close()

            yield f"data: {_json.dumps({'done': True, 'response': response_content, 'session_id': session_id, 'conversation_id': conversation_id, 'strategy_ids': strategy_ids, 'certified_strategy_ids': recommended['strategy'], 'response_id': response_id, 'idea_revision_id': idea_revision_id, 'recommendations': recommendations_for_response})}\n\n"
        except Exception as e:
            logger.error(f"Errore stream chat session {session_id}: {e}")
            try:
                from ..chat_logic import log_error as _log_error
                _err_db = database.SessionLocal()
                try:
                    _log_error(_err_db, session_id, str(e), identity=identity,
                               questionnaire_type=questionnaire_type, mode=request.mode, phase=request.phase,
                               conversation_id=conversation_id)
                finally:
                    _err_db.close()
            except Exception:
                pass
            yield f"data: {_json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disabilita il buffering di nginx
            "Connection": "keep-alive",
        },
    )


@router.post("/chat/message")
async def chat_message(
    message: str,
    session_id: str,
    mode: str,
    background_tasks: BackgroundTasks,
    conversation_id: str | None = None,
    questionnaire_type: str = "",
    language: str = "",
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    resolved_conversation_id = conversation_id_for(session_id, conversation_id)
    language = _normalize_language(language)
    # 1. Retrieve Configuration and System Prompt based on Mode
    ai_service = AIService(db)

    prompt_key = MODE_TO_SYSTEM_PROMPT_KEY.get(mode, "prompt_generic")
    system_prompt = ai_service.config.get(
        prompt_key,
        SYSTEM_PROMPT_DEFAULTS.get(prompt_key, DEFAULT_SYSTEM_PROMPT_GENERIC),
    )
    system_prompt = _apply_global_directives(system_prompt, language, db)

    session_memory.update_context(
        session_id,
        questionnaire_type=questionnaire_type,
        language=language,
    )

    # 2. Recupera una porzione compatta e pertinente della memoria Markdown.
    conversation_summary = session_memory.get_relevant_context(session_id, query=message)
    if _should_sanitize_ztpi_text(mode, None):
        conversation_summary = _sanitize_ztpi_user_text(conversation_summary, language)

    # 3. Get AI Response (con contesto conversazionale)
    history = session_memory.get_transcript(session_id)
    response_content = ai_service.get_response(
        message, system_prompt, mode,
        conversation_summary=conversation_summary,
        history=history,
    )
    if _should_sanitize_ztpi_text(mode, None):
        response_content = _sanitize_ztpi_user_text(response_content, language)

    # 4. Aggiorna memoria Markdown prima di restituire la risposta.
    _update_markdown_memory_background(
        session_id, message, response_content, "", False, conversation_summary,
        "", "", questionnaire_type, language, False,
        transcript_user=message,
    )

    # 5. Log Interaction
    provider = ai_service.config.get('active_provider', 'unknown')
    model = ai_service.config.get('model_name', 'unknown')
    usage = getattr(ai_service, "last_usage", None)
    cost_usd = _usage_cost_usd(usage, provider, model)
    _details = pii.redact_details({
        "conversation_id": resolved_conversation_id,
        "mode": mode,
        "user_input": message,
        "bot_response": response_content,
        "provider": provider,
        "model": model,
        "questionnaire_type": questionnaire_type,
        "conversation_summary_length": len(conversation_summary),
        "usage": usage,
        "cost_usd": cost_usd,
    }, "user_input", "bot_response")
    if full_prompt_logging_enabled(db):
        _details["envelope"] = pii.redact_envelope(
            build_log_envelope(system_prompt, message, history)
        )
    log_entry = models.Log(
        session_id=session_id,
        conversation_id=resolved_conversation_id,
        action="chat_message",
        username=identity.get("username") or None,
        email=identity.get("email") or None,
        anonymous_research_code=code_for_identity(db, identity),
        provider=provider,
        model_name=model,
        cost_usd=cost_usd,
        questionnaire_type=questionnaire_type or None,
        mode=mode or None,
        details=_details,
    )
    db.add(log_entry)
    response_id = shared_response_memory.create_candidate(
        db, response_content, questionnaire_type, "", language or "it"
    )
    if response_id:
        log_entry.response_id = response_id
    db.commit()
    recommendations_for_response = _recommendation_service.list_for_session(
        db,
        session_id=session_id,
        username=identity.get("username", "") if identity else "",
    )

    return {
        "response": response_content,
        "conversation_id": resolved_conversation_id,
        "response_id": response_id,
        "recommendations": recommendations_for_response,
    }


@router.post("/qsa/audit")
async def audit_qsa(
    request: QsaAuditRequest,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    # Log completion for QSA-family profile analyses.
    log_entry = models.Log(
        session_id=request.session_id,
        conversation_id=request.session_id,
        action="qsa_completed",
        username=identity.get("username") or None,
        email=identity.get("email") or None,
        anonymous_research_code=code_for_identity(db, identity),
        questionnaire_type=request.questionnaire_type,
        details={
            "questionnaire_type": request.questionnaire_type,
            "scores": request.scores,
        },
    )
    db.add(log_entry)
    db.commit()
    return {"status": "ok"}


@router.post("/qsa/upload")
async def upload_qsa_document(
    file: UploadFile = File(...),
    questionnaire_type: str = Form("QSA"),
    db: Session = Depends(get_db),
):
    temp_dir = ".tmp"
    os.makedirs(temp_dir, exist_ok=True)
    suffix = os.path.splitext(file.filename or "")[1].lower()
    if suffix not in ALLOWED_UPLOAD_SUFFIXES:
        raise HTTPException(status_code=400, detail="Formato non supportato. Usa PDF, JPG o PNG.")

    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()
    if not contents:
        raise HTTPException(status_code=400, detail="Il file è vuoto.")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Il file supera la dimensione massima di 10 MB.")

    with tempfile.NamedTemporaryFile(dir=temp_dir, suffix=suffix, delete=False) as buffer:
        temp_file_path = buffer.name
        buffer.write(contents)

    try:
        ai_service = AIService(db)
        extractor = functools.partial(
            extract_questionnaire_data,
            temp_file_path,
            questionnaire_type=questionnaire_type,
            ollama_url=ai_service.config.get("ollama_ip"),
            ocr_model=ai_service.config.get("qsa_ocr_model") or DEFAULT_OCR_MODEL,
            parser_model=ai_service.config.get("qsa_parser_model") or DEFAULT_PARSER_MODEL,
        )
        extraction_data = await run_in_threadpool(extractor)
        if "error" in extraction_data:
            raise HTTPException(status_code=400, detail=extraction_data["error"])

        # Save PDF to uploads/qsa with a token
        import shutil
        import uuid
        token = uuid.uuid4().hex  # 32 characters hex
        storage_dir = "uploads/qsa"
        os.makedirs(storage_dir, exist_ok=True)
        dest_path = os.path.join(storage_dir, f"{token}.pdf")
        shutil.copy(temp_file_path, dest_path)

        extraction_data["pdf_token"] = token
        return extraction_data
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)


TTS_CHUNK_MAX_CHARS = 3000


@router.get("/session/{session_id}/recommendations")
async def get_session_recommendations(
    session_id: str,
    lang: str | None = None,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """Log persistente delle raccomandazioni per la sidebar.

    Con `?lang=` i testi tornano nella lingua richiesta, ma solo dove esiste una
    traduzione certificata: provenienza e stato dello studente non cambiano.
    """
    username = identity.get("username", "") if identity else ""
    return _recommendation_service.list_for_session(
        db, session_id=session_id, username=username,
        language=_normalize_language(lang) if lang else None,
    )


class RecommendationStateUpdate(BaseModel):
    """Stato che lo studente puo' dare a una voce del suo libretto."""

    status: Literal["proposed", "selected", "tried", "dismissed"] | None = None
    helpful: bool | None = None


@router.patch("/session/{session_id}/recommendations/{recommendation_type}/{slug}")
async def update_session_recommendation(
    session_id: str,
    recommendation_type: str,
    slug: str,
    update: RecommendationStateUpdate,
    lang: str | None = None,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """Marca una raccomandazione dello studente e ritorna il libretto aggiornato.

    Solo il proprietario: la voce di un altro studente non e' un bersaglio e non
    viene ne' letta ne' scritta.
    """
    username = identity.get("username", "") if identity else ""
    if not username:
        raise HTTPException(status_code=403, detail="Serve un profilo per aggiornare le raccomandazioni")
    if recommendation_type not in _recommendation_service.RECOMMENDATION_TYPES:
        raise HTTPException(status_code=400, detail="Tipo di raccomandazione non valido")
    fields = update.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="Nessun campo da aggiornare")
    row = _recommendation_service.set_state(
        db,
        session_id=session_id,
        username=username,
        recommendation_type=recommendation_type,
        slug=slug,
        status=fields.get("status"),
        helpful=fields["helpful"] if "helpful" in fields else _recommendation_service.UNSET,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Raccomandazione non trovata")
    return _recommendation_service.list_for_session(
        db, session_id=session_id, username=username,
        language=_normalize_language(lang) if lang else None,
    )


def _split_text_for_tts(text: str, max_len: int = TTS_CHUNK_MAX_CHARS) -> list[str]:
    """Split text into chunks of at most max_len chars, preferring sentence
    boundaries (periods), then spaces, so no sentence is cut mid-word."""
    chunks: list[str] = []
    remaining = text
    while len(remaining) > max_len:
        cut = remaining.rfind(".", 0, max_len)
        if cut == -1:
            cut = remaining.rfind(" ", 0, max_len)
        if cut == -1:
            cut = max_len - 1
        chunks.append(remaining[:cut + 1].strip())
        remaining = remaining[cut + 1:]
    if remaining.strip():
        chunks.append(remaining.strip())
    return chunks


@router.post("/tts")
async def text_to_speech(request: TTSRequest, db: Session = Depends(get_db)):
    try:
        # I blocchi ```diagram sono esclusivamente visivi e non entrano nel TTS.
        spoken = strip_for_speech(request.text, lang=(request.voice or 'it')[:2])
        clean_text = strip_markdown(spoken)

        voice = request.voice
        if request.counselor_id:
            counselor = db.query(models.Counselor).filter(models.Counselor.id == request.counselor_id).first()
            if counselor and counselor.voice_mapping:
                lang_code = request.voice.split("-")[0].lower()
                custom_voice = counselor.voice_mapping.get(lang_code)
                if custom_voice:
                    voice = custom_voice

        audio_bytes = io.BytesIO()
        for text_chunk in _split_text_for_tts(clean_text):
            communicate = edge_tts.Communicate(text_chunk, voice)
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_bytes.write(chunk["data"])

        audio_bytes.seek(0)

        return StreamingResponse(
            audio_bytes,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=speech.mp3"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS Error: {str(e)}")
