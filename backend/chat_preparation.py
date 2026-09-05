"""Prepare the same counselor turn for sync, streaming and read-only audit.

Retrieval can be replaced by a captured context for reproducible, offline audits.
Writing session memory and recording model output remain endpoint responsibilities.
"""
from dataclasses import dataclass
from .prompt_contract import turn_contract
from .journey_context import SYNTHESIS_STEPS, journey_context, session_evidence
from . import models, recommendation_blocks
from . import recommendation_service as _recommendation_service
from .i18n_fields import localized
from .idea_map import IDEA_INSTRUMENT
from .prompt_config import SYSTEM_PROMPT_DEFAULTS
from .chat_logic import PROMPT_COMPONENT_DEFAULTS
from .skills import engine as skills_engine
from sqlalchemy.orm import Session
from .chat_logic import (
    _annotate_qsa_factor_codes,
    apply_advice_retrieval_policy,
    is_advice_follow_up,
    _apply_global_directives,
    _apply_advice_distribution_directive,
    _apply_follow_up_advice_directive,
    _apply_response_length_directive,
    _apply_certified_advice_directive,
    _apply_current_step_factor_scope_directive,
    _apply_current_step_score_profile_directive,
    _apply_qsa_factor_directive,
    _conversational_retrieval_tail,
    _is_conversational_mode,
    filter_scores_by_components,
    get_prompt_component_flags,
    get_prompt_component_options,
    previous_certified_strategy_ids,
    step_has_improvement_target,
    _is_strategy_questionnaire,
    _phase_factor_codes,
    _resolve_system_prompt,
    _response_length_max_tokens,
    _scope_scores_to_codes,
    _resolve_user_message_for_chat,
    _retrieved_context,
    _sanitize_ztpi_step_label,
    _sanitize_ztpi_user_text,
    _should_sanitize_ztpi_text,
    _should_include_step_analysis_context,
    _step_allows_practical_advice,
    build_context_envelope,
    conversation_id_for,
)

IDEA_VARIANT_KEYS = {
    "student-path": "prompt_idea_variant_student_path",
    "student-open": "prompt_idea_variant_student_open",
    "research": "prompt_idea_variant_research",
    "concept": "prompt_idea_variant_concept",
}


def _apply_idea_variant_directive(system_prompt: str, ai_service, request) -> str:
    """Aggiunge la direttiva della variante scelta all'avvio della sessione Idea.

    Variante ignota o assente: vale quella piu' prudente, l'idea libera, che non
    aggancia il percorso di studio ne' legge niente di psicologico.
    """
    if (request.questionnaire_type or "") != IDEA_INSTRUMENT:
        return system_prompt
    key = IDEA_VARIANT_KEYS.get(request.idea_variant or "", IDEA_VARIANT_KEYS["student-open"])
    directive = ai_service.config.get(key, SYSTEM_PROMPT_DEFAULTS.get(key, ""))
    if not directive or directive.strip() in system_prompt:
        return system_prompt
    return system_prompt.rstrip() + "\n\n" + directive.strip()


def _recommendation_candidates(
    db: Session,
    *,
    reading_ids: list[str],
    strategy_ids: list[str],
    language: str,
) -> tuple[dict[str, str], dict[str, str]]:
    """Id -> titolo delle voci offerte al modello in questo turno.

    Sono candidati, non raccomandazioni: servono a scrivere la direttiva e a
    fare da whitelist quando il modello dichiara che cosa ha davvero proposto.
    """
    readings: dict[str, str] = {}
    if reading_ids:
        rows = (
            db.query(models.CertifiedReading)
            .filter(
                models.CertifiedReading.slug.in_(reading_ids),
                models.CertifiedReading.status == "certified",
                models.CertifiedReading.is_active.is_(True),
            )
            .all()
        )
        by_slug = {row.slug: row for row in rows}
        readings = {
            slug: by_slug[slug].title for slug in reading_ids if slug in by_slug
        }

    strategies: dict[str, str] = {}
    if strategy_ids:
        rows = (
            db.query(models.CertifiedStrategy)
            .filter(
                models.CertifiedStrategy.slug.in_(strategy_ids),
                models.CertifiedStrategy.status == "certified",
                models.CertifiedStrategy.is_active.is_(True),
            )
            .all()
        )
        by_slug = {row.slug: row for row in rows}
        strategies = {
            slug: (localized(by_slug[slug], "name", language) or slug)
            for slug in strategy_ids
            if slug in by_slug
        }
    return readings, strategies


@dataclass
class PreparedTurn:
    prompt_key: str
    phase_prompt_key: str | None
    effective_message: str
    system_prompt: str
    step: object
    step_label: str
    questionnaire_type: str
    effective_response_length: str | None
    max_tokens: int | None
    component_flags: dict
    component_options: dict
    phase_codes: set
    model_message: str
    model_scores_context: str
    message_scores_context: str
    knowledge_context: str
    strategy_ids: list
    certified_strategy_ids: list
    reading_ids: list
    skills_blocks: dict
    recommendation_meta: dict
    reading_candidates: dict
    strategy_candidates: dict
    system_prompt_final: str
    full_message: str
    history: list
    sanitize: bool
    components: dict


def prepare_chat_turn(db, ai_service, request, session_id, identity, *,
                      c_persona="", counselor_name=None, include_retrieval=True,
                      include_history=True, create_anonymous_code=False,
                      component_overrides=None, retrieval_context=None,
                      provider=None, model=None, journey_override=None, allow_generation=False):
    c_name = counselor_name
    conversation_id = conversation_id_for(session_id, request.conversation_id)
    step = db.query(models.GuidedStep).filter(models.GuidedStep.id == request.phase).first() if request.phase else None
    step_label = step.label if step else ""
    questionnaire_type = step.questionnaire_type if step else (request.questionnaire_type or "")
    request = request.copy(update={"questionnaire_type": questionnaire_type})
    effective_response_length = request.response_length
    max_tokens = _response_length_max_tokens(effective_response_length, request.max_tokens)
    # Reserve the private map separately from the student's visible-length choice.
    if questionnaire_type == IDEA_INSTRUMENT:
        max_tokens = (max_tokens or 700) + 1200
    prompt_key, system_prompt = _resolve_system_prompt(ai_service, request.mode, request.phase, db)
    system_prompt = _apply_global_directives(system_prompt, request.language, db)
    system_prompt = _apply_response_length_directive(system_prompt, effective_response_length)
    system_prompt = _apply_idea_variant_directive(system_prompt, ai_service, request)
    effective_message, phase_prompt_key = _resolve_user_message_for_chat(ai_service, request, db)
    components = {}
    component_flags = get_prompt_component_flags(db, questionnaire_type, request.phase)
    # Nei follow-up in-step il mode della richiesta prevale sul mode dello step:
    # puo' approfondire un consiglio gia' emerso senza recuperarne uno nuovo.
    step_mode = request.mode if _is_conversational_mode(request.mode) else (step.system_prompt_mode if step else request.mode)
    # Follow-up in cui lo studente chiede un consiglio: il catalogo certificato
    # si apre anche negli step interpretativi, cosi' la risposta resta tracciabile.
    if component_overrides:
        for key in PROMPT_COMPONENT_DEFAULTS:
            if key in component_overrides:
                component_flags[key] = bool(component_overrides[key])
    advice_requested = is_advice_follow_up(request)
    component_flags = apply_advice_retrieval_policy(
        component_flags, step_mode, request.phase, advice_requested=advice_requested
    )
    component_options = get_prompt_component_options(
        db, questionnaire_type, request.phase, step_mode, advice_requested=advice_requested
    )
    if component_overrides:
        if "certified_strategy_limit" in component_overrides:
            component_options["certified_strategy_limit"] = max(0, min(1, int(component_overrides["certified_strategy_limit"])))
        if isinstance(component_overrides.get("allowed_strategies"), list):
            component_flags["allowed_strategies"] = component_overrides["allowed_strategies"]
            component_options["allowed_strategies"] = component_overrides["allowed_strategies"]
    # La richiesta apre il catalogo solo se l'admin non lo ha spento per questo
    # step: la configurazione per step resta l'ultima parola.
    advice_requested = (
        advice_requested
        and component_options["certified_strategy_limit"] > 0
        and bool(component_flags.get("certified_strategies", True))
    )
    include_analysis_context = _should_include_step_analysis_context(step_mode)
    phase_codes = _phase_factor_codes(db, request.phase) if include_analysis_context else set()
    if include_analysis_context:
        system_prompt = _apply_qsa_factor_directive(system_prompt, questionnaire_type, request.language, phase_codes)
        system_prompt = _apply_current_step_factor_scope_directive(system_prompt, questionnaire_type, phase_codes)
    model_scores_context = (
        _annotate_qsa_factor_codes(request.scores_context, request.language, questionnaire_type=questionnaire_type)
        if _is_strategy_questionnaire(questionnaire_type) else request.scores_context
    )
    component_scores_context = filter_scores_by_components(model_scores_context, questionnaire_type, component_flags)
    if include_analysis_context and component_scores_context:
        allows_advice = _step_allows_practical_advice(step_mode, request.phase)
        is_follow_up = _is_conversational_mode(step_mode)
        include_advice = advice_requested or (
            allows_advice and not is_follow_up and step_has_improvement_target(
                component_scores_context, questionnaire_type, request.language, phase_codes
            )
        )
        system_prompt = _apply_current_step_score_profile_directive(
            system_prompt, questionnaire_type, request.language, component_scores_context, phase_codes, include_advice
        )
        if include_advice:
            system_prompt = _apply_advice_distribution_directive(system_prompt)
            system_prompt = _apply_certified_advice_directive(system_prompt, questionnaire_type)
        elif is_follow_up and allows_advice:
            system_prompt = _apply_follow_up_advice_directive(system_prompt)
        else:
            component_flags = apply_advice_retrieval_policy(component_flags, "factor", request.phase)
            component_options["certified_strategy_limit"] = 0
    elif include_analysis_context and _is_strategy_questionnaire(questionnaire_type) and not advice_requested:
        component_flags = apply_advice_retrieval_policy(component_flags, "factor", request.phase)
        component_options["certified_strategy_limit"] = 0
    model_message = (
        _annotate_qsa_factor_codes(effective_message, request.language, questionnaire_type=questionnaire_type)
        if _is_strategy_questionnaire(questionnaire_type) else effective_message
    )

    # Punteggi nel messaggio scope-ati alla sezione corrente: il modello analizza
    # solo i fattori del suo step, non quelli di altre sezioni. Il profilo intero
    # resta persistito (update_context) per i follow-up cross-sezione.
    message_scores_context = (
        _scope_scores_to_codes(component_scores_context, phase_codes)
        if include_analysis_context and phase_codes
        else component_scores_context
    )

    # Recupera le fonti KNOWLEDGE (grafo + strategie + certificate + votate).
    knowledge_context = ""
    strategy_ids: list[str] = []
    certified_strategy_ids: list[str] = []
    reading_ids: list[str] = []
    skills_blocks: dict[str, list[str]] = {}
    recommendation_meta: dict[str, dict] = {}
    if retrieval_context is not None:
        knowledge_context = retrieval_context.get("knowledge_context", "")
        strategy_ids = retrieval_context.get("strategy_ids", [])
        certified_strategy_ids = retrieval_context.get("certified_strategy_ids", [])
        reading_ids = retrieval_context.get("reading_ids", [])
        skills_blocks = retrieval_context.get("skills_blocks", {})
        recommendation_meta = retrieval_context.get("recommendation_meta", {})
    elif include_retrieval and (component_flags.get("knowledge", True) or skills_engine.enabled(db, questionnaire_type)):
        retrieval_query = f"{step_label} {model_message if component_flags.get('step_prompt', True) else ''} {component_scores_context}".strip()
        # Follow-up in-step: la domanda dello studente spesso non ha contenuto
        # ("puoi approfondire?") — accoda la coda dell'ultima risposta assistant
        # così il retrieval trova il materiale del tema in discussione.
        if _is_conversational_mode(request.mode):
            retrieval_query = f"{retrieval_query} {_conversational_retrieval_tail(session_id)}".strip()
        retrieval_request = request.copy(update={"scores_context": component_scores_context})
        (
            knowledge_context, strategy_ids, certified_strategy_ids, skills_blocks,
            reading_ids, recommendation_meta,
        ) = _retrieved_context(
            db, session_id, retrieval_request, questionnaire_type, retrieval_query,
            ai_service=ai_service,
            certified_strategy_limit=component_options["certified_strategy_limit"],
            component_flags=component_flags,
            excluded_certified_strategy_ids=previous_certified_strategy_ids(db, conversation_id),
            username=identity.get("username", "") if identity else "",
        )
    sanitize = _should_sanitize_ztpi_text(request.mode, request.phase)
    if sanitize:
        knowledge_context = _sanitize_ztpi_user_text(knowledge_context, request.language)

    if sanitize:
        step_label = _sanitize_ztpi_step_label(step_label, request.language)

    # Il catalogo del turno e' un'offerta: il modello dichiara in un blocco
    # privato quali voci ha davvero proposto, e solo quelle vengono registrate.
    reading_candidates, strategy_candidates = _recommendation_candidates(
        db, reading_ids=reading_ids, strategy_ids=certified_strategy_ids,
        language=request.language or "it",
    )
    system_prompt = recommendation_blocks.apply_directive(
        system_prompt, reading_candidates, strategy_candidates, idea=questionnaire_type == IDEA_INSTRUMENT,
    )
    system_prompt += _recommendation_service.conversation_context(
        db, session_id=session_id, username=identity.get("username", ""),
        message=request.message or "", language=request.language or "it",
    )

    # Assembla l'envelope canonico (Fase 5):
    #   SYSTEM = [PERSONA] [SECTION] [STUDENT] [PROFILE] [KNOWLEDGE]
    #   MESSAGES = history verbatim + user (scores scope-ati + msg)
    system_prompt_final, full_message, history = build_context_envelope(
        db, ai_service, request, session_id, identity,
        c_persona=c_persona, counselor_name=c_name, system_prompt=system_prompt, step_label=step_label,
        step_id=request.phase,
        questionnaire_type=questionnaire_type, effective_message=model_message,
        model_scores_context=model_scores_context, message_scores_context=message_scores_context,
        knowledge_context=knowledge_context, include_scores_reference=include_analysis_context,
        component_flags=component_flags,
        skills_blocks=skills_blocks, components=components,
        include_history=include_history, include_session_memory=include_history,
        create_anonymous_code=create_anonymous_code,
    )

    is_synthesis = request.phase in SYNTHESIS_STEPS or (step and step.system_prompt_mode.endswith("-summary"))
    if is_synthesis:
        if journey_override is not None:
            evidence, coverage = journey_override, "supplied"
        else:
            messages = session_evidence(db, session_id, (identity or {}).get("username", ""), request.conversation_id)
            evidence, coverage = journey_context(
                messages, request.language or "it", ai=ai_service if allow_generation else None,
                provider=provider, model=model,
            )
        components["journey_evidence"] = evidence
        components["journey_coverage"] = coverage
        if evidence:
            system_prompt_final += "\n\n[JOURNEY EVIDENCE]\nChronological evidence; later student corrections supersede earlier statements.\n" + evidence
    contract = turn_contract(
        language=request.language or "it", questionnaire_type=questionnaire_type,
        phase=request.phase, advice_allowed=bool(component_options["certified_strategy_limit"] and component_flags.get("certified_strategies", True)),
        synthesis=bool(is_synthesis),
    )
    system_prompt_final += "\n\n" + contract
    components["turn_contract"] = contract
    return PreparedTurn(
        prompt_key=prompt_key,
        phase_prompt_key=phase_prompt_key,
        effective_message=effective_message,
        system_prompt=system_prompt,
        step=step,
        step_label=step_label,
        questionnaire_type=questionnaire_type,
        effective_response_length=effective_response_length,
        max_tokens=max_tokens,
        component_flags=component_flags,
        component_options=component_options,
        phase_codes=phase_codes,
        model_message=model_message,
        model_scores_context=model_scores_context,
        message_scores_context=message_scores_context,
        knowledge_context=knowledge_context,
        strategy_ids=strategy_ids,
        certified_strategy_ids=certified_strategy_ids,
        reading_ids=reading_ids,
        skills_blocks=skills_blocks,
        recommendation_meta=recommendation_meta,
        reading_candidates=reading_candidates,
        strategy_candidates=strategy_candidates,
        system_prompt_final=system_prompt_final,
        full_message=full_message,
        history=history,
        sanitize=sanitize,
        components=components,
    )
