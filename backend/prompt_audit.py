"""Read-only prompt envelope audit for guided CounselorBot chats."""
from __future__ import annotations

import logging
import re
import time
import uuid
from typing import Any, Callable

logger = logging.getLogger(__name__)

from fastapi import HTTPException
from sqlalchemy.orm import Session

from . import models, model_pricing, pii
from .ai_service import AIError, AIService
from .anonymous_codes import code_for_identity
from .api_models import ChatRequest
from .chat_logic import (
    _annotate_qsa_factor_codes,
    _apply_certified_advice_directive,
    _apply_current_step_factor_scope_directive,
    _apply_current_step_score_profile_directive,
    _apply_language_directive,
    _apply_qsa_factor_directive,
    _apply_register_directive,
    _apply_thinking_directive,
    _clamp_max_tokens,
    _ensure_required_qsa_factor_codes,
    _is_strategy_questionnaire,
    _phase_factor_codes,
    _qsa_step_score_profile,
    _resolve_system_prompt,
    _retrieved_context,
    _sanitize_ztpi_step_label,
    _sanitize_ztpi_user_text,
    _scope_scores_to_codes,
    _should_sanitize_ztpi_text,
    build_context_envelope,
    full_prompt_logging_enabled,
    split_thinking,
)
from .guided_text_i18n import SECONDARY_LANGS
from .prompt_config import (
    GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS,
    MODE_TO_SYSTEM_PROMPT_KEY,
    SYSTEM_PROMPT_DEFAULTS,
)


SUPPORTED_CHAT_LANGUAGES = {"it", *SECONDARY_LANGS}
_FACTOR_TOKEN_RE = re.compile(r"\b([A-Z]{1,3}\d{1,2}r?)\b", re.IGNORECASE)
_GREETING_RE = re.compile(
    r"^\s*(ciao|salve|buongiorno|buonasera|hi|hello|hey|welcome|great)\b",
    re.IGNORECASE,
)
_REFUSAL_RE = re.compile(
    r"(non ho accesso|non ho i punteggi|non posso vedere|i don't have access|i cannot see|i do not have the scores)",
    re.IGNORECASE,
)
_ZTPI_TECHNICAL_RE = re.compile(r"\b(?:ZTPI|PTB|BTP|DBTP-r?|T[1-5])\b", re.IGNORECASE)
# Marcatori di ragionamento trapelato nel testo visibile (deve restare nel canale
# «sto pensando»/<think>, non nella risposta allo studente).
_REASONING_LEAK_RE = re.compile(
    r"(attivazione interna|ho i punteggi|devo (?:mantenere|ricordare|usare|suddividere|rispettare)|"
    r"devo analizzare|identificare il filo rosso|strutturare i contenuti|"
    r"questo (?:e|è) il cuore della risposta|proporre azioni concrete basate|"
    r"<\s*think|internal reasoning|chain[- ]of[- ]thought|come da istruzioni)",
    re.IGNORECASE,
)
_RISKY_PATTERNS = (
    ("legacy_ztpi_high_strength", re.compile(r"punteggio alto\s*\(7-9\)\s*(?:e|è)\s+una\s+forza", re.IGNORECASE)),
    ("legacy_source_reading_visible", re.compile(r"indicazion[ei]\s+di\s+lettura\s+da\s+fonte", re.IGNORECASE)),
    ("legacy_btp_target_visible", re.compile(r"usa\s+la\s+fascia\s+(?:ptb|btp)", re.IGNORECASE)),
)


def _normalize_language(language: str | None) -> str:
    raw = (language or "it").strip().lower()
    primary = raw.replace("_", "-").split("-", 1)[0]
    return primary if primary in SUPPORTED_CHAT_LANGUAGES else "it"


def _usage_cost_usd(usage: dict | None, provider: str | None, model: str | None) -> float | None:
    if isinstance(usage, dict):
        for key in ("cost", "cost_usd", "total_cost"):
            value = usage.get(key)
            if isinstance(value, (int, float)):
                return float(value)
            if isinstance(value, str):
                try:
                    return float(value)
                except ValueError:
                    pass
    return model_pricing.estimate_cost_usd(provider, model, usage)


def _resolve_counselor(db: Session, counselor_id: int | None) -> tuple[dict[str, Any] | None, str | None, str | None, str | None, bool | None, int | None, list[dict[str, str]]]:
    warnings: list[dict[str, str]] = []
    if not counselor_id:
        return None, None, None, None, None, None, warnings

    counselor = db.query(models.Counselor).filter(models.Counselor.id == counselor_id).first()
    if not counselor:
        warnings.append({"code": "counselor_not_found", "message": f"Counselor {counselor_id} not found."})
        return {"id": counselor_id, "found": False}, None, None, None, None, None, warnings
    if not counselor.is_active:
        warnings.append({"code": "counselor_inactive", "message": f"Counselor {counselor_id} is inactive; global provider/model will be used."})
        return {
            "id": counselor.id,
            "slug": counselor.slug,
            "name": counselor.name,
            "is_active": False,
            "questionnaire_types": counselor.questionnaire_types,
        }, None, None, None, None, None, warnings

    provider = model = None
    disable_thinking = None
    reasoning_budget = None
    preset_info = None
    if counselor.preset_id:
        preset = db.query(models.ModelPreset).filter(models.ModelPreset.id == counselor.preset_id).first()
        if preset:
            provider, model = preset.provider, preset.model
            disable_thinking = bool(preset.disable_thinking)
            reasoning_budget = preset.reasoning_budget
            preset_info = {
                "id": preset.id,
                "name": preset.name,
                "provider": preset.provider,
                "model": preset.model,
                "disable_thinking": bool(preset.disable_thinking),
                "reasoning_budget": preset.reasoning_budget,
            }
        else:
            warnings.append({"code": "preset_not_found", "message": f"Preset {counselor.preset_id} referenced by counselor {counselor.id} not found."})

    return {
        "id": counselor.id,
        "slug": counselor.slug,
        "name": counselor.name,
        "is_active": True,
        "questionnaire_types": counselor.questionnaire_types,
        "preset": preset_info,
        "persona_present": bool((counselor.persona or "").strip()),
    }, provider, model, counselor.persona, disable_thinking, reasoning_budget, warnings


def _apply_counselor_overrides(ai_service: AIService, disable_thinking: bool | None, reasoning_budget: int | None) -> None:
    if disable_thinking is not None:
        ai_service.disable_thinking = bool(disable_thinking)
        ai_service.config["disable_thinking"] = "true" if disable_thinking else "false"
    if reasoning_budget is not None:
        ai_service.reasoning_budget_override = reasoning_budget


def _resolve_effective_message(request: ChatRequest, db: Session, warnings: list[dict[str, str]]) -> tuple[str, str | None, models.GuidedStep | None]:
    step = db.query(models.GuidedStep).filter(models.GuidedStep.id == request.phase).first() if request.phase else None
    if request.phase and not step:
        warnings.append({"code": "missing_step", "message": f"Guided step '{request.phase}' was not found."})
    if request.use_phase_prompt:
        if not request.phase:
            warnings.append({"code": "missing_phase", "message": "phase is required when use_phase_prompt=true; falling back to message."})
            return request.message or "", None, step
        if not step:
            return request.message or "", None, step
        return step.prompt, f"guided_step:{step.id}", step
    return request.message or "", None, step


def _factor_codes_in(text: str) -> set[str]:
    return {match.group(1).upper() for match in _FACTOR_TOKEN_RE.finditer(text or "")}


def _add_static_warnings(
    warnings: list[dict[str, str]],
    *,
    ai_service: AIService,
    request: ChatRequest,
    step: models.GuidedStep | None,
    questionnaire_type: str,
    counselor: dict[str, Any] | None,
    prompt_key: str,
    system_prompt: str,
    effective_message: str,
    required_codes: set[str],
    scores_context: str,
) -> None:
    if counselor and counselor.get("is_active") and counselor.get("questionnaire_types"):
        allowed = {str(item).upper() for item in counselor.get("questionnaire_types") or []}
        if questionnaire_type and questionnaire_type.upper() not in allowed:
            warnings.append({
                "code": "counselor_instrument_mismatch",
                "message": f"Counselor '{counselor.get('name')}' is not configured for {questionnaire_type}.",
            })
    if step and request.questionnaire_type and step.questionnaire_type != request.questionnaire_type:
        warnings.append({
            "code": "step_instrument_mismatch",
            "message": f"Step '{step.id}' belongs to {step.questionnaire_type}, request asked for {request.questionnaire_type}.",
        })
    if request.mode and request.mode not in MODE_TO_SYSTEM_PROMPT_KEY and not step:
        warnings.append({"code": "unknown_mode", "message": f"Mode '{request.mode}' is not mapped; prompt_generic is used as fallback."})
    if step and step.system_prompt_mode not in MODE_TO_SYSTEM_PROMPT_KEY and step.id not in GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS:
        warnings.append({"code": "unknown_step_mode", "message": f"Step mode '{step.system_prompt_mode}' is not mapped; prompt_generic is used as fallback."})
    if prompt_key not in ai_service.config and prompt_key not in SYSTEM_PROMPT_DEFAULTS and prompt_key not in {item["key"] for item in GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS.values()}:
        warnings.append({"code": "fallback_prompt", "message": f"Prompt key '{prompt_key}' has no config/default row; generic fallback may be in use."})
    if required_codes:
        present = _factor_codes_in(scores_context)
        missing = sorted(code for code in required_codes if code not in present)
        if missing:
            warnings.append({"code": "missing_factor_scores", "message": f"Scores context lacks factors required by this step: {', '.join(missing)}."})
    scan_text = f"{system_prompt}\n\n{effective_message}"
    for code, pattern in _RISKY_PATTERNS:
        if pattern.search(scan_text):
            warnings.append({"code": code, "message": "Legacy/risky prompt wording detected."})


def build_prompt_audit(
    db: Session,
    payload,
    *,
    ai_service_cls: Callable[[Session], AIService] = AIService,
) -> dict[str, Any]:
    request = ChatRequest(**payload.model_dump(exclude={"include_knowledge", "include_history"}, exclude_none=False))
    request.language = _normalize_language(request.language)
    session_id = request.session_id or f"prompt-audit-{uuid.uuid4()}"
    warnings: list[dict[str, str]] = []

    ai_service = ai_service_cls(db)
    counselor, c_provider, c_model, c_persona, c_disable_thinking, c_reasoning_budget, counselor_warnings = _resolve_counselor(db, request.counselor_id)
    warnings.extend(counselor_warnings)
    _apply_counselor_overrides(ai_service, c_disable_thinking, c_reasoning_budget)

    max_tokens = _clamp_max_tokens(request.max_tokens)
    effective_message, phase_prompt_key, step = _resolve_effective_message(request, db, warnings)
    if step:
        step_label = step.label
        questionnaire_type = step.questionnaire_type
    else:
        step_label = ""
        questionnaire_type = request.questionnaire_type or ""

    prompt_key, system_prompt = _resolve_system_prompt(ai_service, request.mode, request.phase, db)
    system_prompt = _apply_language_directive(system_prompt, request.language)
    system_prompt = _apply_register_directive(system_prompt, request.language)
    required_codes = _phase_factor_codes(db, request.phase)
    system_prompt = _apply_qsa_factor_directive(system_prompt, questionnaire_type, request.language)
    system_prompt = _apply_current_step_factor_scope_directive(system_prompt, questionnaire_type, required_codes)

    model_scores_context = (
        _annotate_qsa_factor_codes(request.scores_context, request.language, questionnaire_type=questionnaire_type)
        if _is_strategy_questionnaire(questionnaire_type) else request.scores_context
    )
    system_prompt = _apply_current_step_score_profile_directive(
        system_prompt, questionnaire_type, request.language, model_scores_context, required_codes
    )
    system_prompt = _apply_certified_advice_directive(system_prompt, questionnaire_type, request.language)
    system_prompt = _apply_thinking_directive(system_prompt, request.language)
    model_message = (
        _annotate_qsa_factor_codes(effective_message, request.language, questionnaire_type=questionnaire_type)
        if _is_strategy_questionnaire(questionnaire_type) else effective_message
    )
    message_scores_context = _scope_scores_to_codes(model_scores_context, required_codes)

    knowledge_context = ""
    strategy_ids: list[str] = []
    certified_strategy_ids: list[str] = []
    if bool(getattr(payload, "include_knowledge", True)):
        retrieval_query = f"{step_label} {model_message} {model_scores_context}".strip()
        knowledge_context, strategy_ids, certified_strategy_ids = _retrieved_context(
            db, session_id, request, questionnaire_type, retrieval_query, ai_service=ai_service
        )

    sanitize_ztpi = _should_sanitize_ztpi_text(request.mode, request.phase)
    if sanitize_ztpi:
        knowledge_context = _sanitize_ztpi_user_text(knowledge_context, request.language)
        step_label_for_envelope = _sanitize_ztpi_step_label(step_label, request.language)
    else:
        step_label_for_envelope = step_label

    system_prompt_final, full_message, history = build_context_envelope(
        db,
        ai_service,
        request,
        session_id,
        {},
        c_persona=c_persona,
        counselor_name=(counselor or {}).get("name"),
        system_prompt=system_prompt,
        step_label=step_label_for_envelope,
        questionnaire_type=questionnaire_type,
        effective_message=model_message,
        model_scores_context=model_scores_context,
        message_scores_context=message_scores_context,
        knowledge_context=knowledge_context,
        include_history=bool(getattr(payload, "include_history", False)),
        include_session_memory=bool(getattr(payload, "include_history", False)),
        create_anonymous_code=False,
    )

    provider = c_provider or ai_service.config.get("active_provider", "unknown")
    model = c_model or ai_service.config.get("model_name", "unknown")
    _add_static_warnings(
        warnings,
        ai_service=ai_service,
        request=request,
        step=step,
        questionnaire_type=questionnaire_type,
        counselor=counselor,
        prompt_key=prompt_key,
        system_prompt=system_prompt,
        effective_message=effective_message,
        required_codes=required_codes,
        scores_context=model_scores_context,
    )

    return {
        "_ai_service": ai_service,
        "_provider_override": c_provider,
        "_model_override": c_model,
        "_max_tokens": max_tokens,
        "_sanitize_ztpi": sanitize_ztpi,
        "_questionnaire_type": questionnaire_type,
        "resolved": {
            "provider": provider,
            "model": model,
            "counselor": counselor,
            "prompt_key": prompt_key,
            "guided_phase_prompt_key": phase_prompt_key,
            "step": {
                "id": step.id if step else request.phase,
                "label": step_label,
                "mode": step.system_prompt_mode if step else request.mode,
                "questionnaire_type": step.questionnaire_type if step else None,
            },
            "questionnaire_type": questionnaire_type,
            "language": request.language,
            "max_tokens": max_tokens,
        },
        "envelope": {
            "system_prompt_final": system_prompt_final,
            "full_message": full_message,
            "history": history,
        },
        "inputs": {
            "raw_message": request.message,
            "effective_user_message": effective_message,
            "model_user_message": model_message,
            "full_scores_context": model_scores_context,
            "scoped_scores_context": message_scores_context,
            "phase_prompt_key": phase_prompt_key,
        },
        "knowledge": {
            "included": bool(getattr(payload, "include_knowledge", True)),
            "context_length": len(knowledge_context),
            "strategy_ids": strategy_ids,
            "certified_strategy_ids": certified_strategy_ids,
            "context": knowledge_context,
        },
        "warnings": warnings,
    }


def _strip_internal(result: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in result.items() if not key.startswith("_")}


def _language_check(text: str, language: str) -> dict[str, Any]:
    lower = (text or "").lower()
    if not text.strip():
        return {"expected": language, "ok": False, "note": "Empty response."}
    if language == "it":
        hits = sum(1 for word in (" che ", " di ", " per ", " il ", " la ", " una ", " puoi ") if word in f" {lower} ")
        return {"expected": language, "ok": hits >= 2, "matches": hits}
    if language == "en":
        hits = sum(1 for word in (" the ", " and ", " you ", " can ", " your ") if word in f" {lower} ")
        return {"expected": language, "ok": hits >= 2, "matches": hits}
    return {"expected": language, "ok": None, "note": "No strict heuristic for this language."}


def _factor_code_format_check(text: str, questionnaire_type: str) -> dict[str, Any]:
    if not _is_strategy_questionnaire(questionnaire_type):
        return {"applicable": False, "ok": None, "isolated_codes": []}
    isolated = []
    for match in _FACTOR_TOKEN_RE.finditer(text or ""):
        end = match.end()
        if not (text[end:end + 2].lstrip().startswith("(")):
            isolated.append(match.group(1))
    return {"applicable": True, "ok": not isolated, "isolated_codes": sorted(set(isolated))}


def _factor_coverage_check(text: str, required_codes: set[str]) -> dict[str, Any]:
    if not required_codes:
        return {"applicable": False, "ok": None, "covered": [], "missing": []}
    present = _factor_codes_in(text)
    missing = sorted(code for code in required_codes if code not in present)
    covered = sorted(code for code in required_codes if code in present)
    return {"applicable": True, "ok": not missing, "covered": covered, "missing": missing}


def _factor_scope_check(text: str, required_codes: set[str]) -> dict[str, Any]:
    if not required_codes:
        return {"applicable": False, "ok": None, "unexpected": []}
    present = _factor_codes_in(text)
    unexpected = sorted(code for code in present if code not in required_codes)
    return {"applicable": True, "ok": not unexpected, "unexpected": unexpected}


_A5_STRENGTH_PROBLEM_RE = re.compile(
    r"(mancanza\s+di\s+perseveranza\s+(?:è|e')\s+una\s+forza|"
    r"(?<!mancanza di )perseveranza[^.\n]{0,60}\b(?:bassa|debole|ancora bassa)\b|"
    r"\blavor\w+\s+su\s+A5\b|"
    r"\bA5\b[^.\n]{0,90}\b(?:migliorare|da migliorare)\b)",
    re.IGNORECASE,
)


def _inverted_resource_wording_check(result: dict[str, Any], text: str) -> dict[str, Any]:
    questionnaire_type = result.get("_questionnaire_type") or ""
    if questionnaire_type != "QSA":
        return {"applicable": False, "ok": None, "matches": []}
    language = result["resolved"].get("language") or "it"
    required_codes = _phase_factor_codes_in_scoped_context(result["inputs"].get("scoped_scores_context") or "")
    profile = _qsa_step_score_profile(
        result["inputs"].get("scoped_scores_context") or "",
        questionnaire_type,
        language,
        required_codes,
    )
    a5_is_strength = any(item["code"] == "A5" and item["band"] == "strength" for item in profile)
    if not a5_is_strength:
        return {"applicable": False, "ok": None, "matches": []}
    matches = sorted(set(match.group(0).strip() for match in _A5_STRENGTH_PROBLEM_RE.finditer(text or "")))
    return {"applicable": True, "ok": not matches, "matches": matches}


def response_checks(result: dict[str, Any], response_text: str) -> dict[str, Any]:
    language = result["resolved"].get("language") or "it"
    questionnaire_type = result.get("_questionnaire_type") or ""
    phase = (result["resolved"].get("step") or {}).get("id") or ""
    required_codes = _phase_factor_codes_in_scoped_context(result["inputs"].get("scoped_scores_context") or "")
    return {
        "language": _language_check(response_text, language),
        "no_greeting": {"ok": not bool(_GREETING_RE.search(response_text or ""))},
        "factor_code_format": _factor_code_format_check(response_text, questionnaire_type),
        "factor_coverage": _factor_coverage_check(response_text, required_codes),
        "factor_scope": _factor_scope_check(response_text, required_codes),
        "inverted_resource_wording": _inverted_resource_wording_check(result, response_text),
        "refusal": {"ok": not bool(_REFUSAL_RE.search(response_text or ""))},
        "reasoning_leak": {"ok": not bool(_REASONING_LEAK_RE.search(response_text or ""))},
        "ztpi_technical_leakage": {
            "applicable": questionnaire_type == "ZTPI",
            "ok": None if questionnaire_type != "ZTPI" else not bool(_ZTPI_TECHNICAL_RE.search(response_text or "")),
        },
        "savickas_advance_marker": {
            "applicable": questionnaire_type == "SAVICKAS",
            "present": "[[AVANZA_STEP]]" in (response_text or "") if questionnaire_type == "SAVICKAS" else None,
            "phase": phase,
        },
    }


def _phase_factor_codes_in_scoped_context(scoped_scores_context: str) -> set[str]:
    return _factor_codes_in(scoped_scores_context)


def _identity_as_dict(identity: Any) -> dict[str, Any]:
    if isinstance(identity, dict):
        return identity
    if identity is None:
        return {}
    return {
        "username": getattr(identity, "username", "") or "",
        "email": getattr(identity, "email", "") or "",
        "is_admin": bool(getattr(identity, "is_admin", False)),
        "authenticated": bool(getattr(identity, "username", "")),
    }


def _log_prompt_audit_live(db: Session, payload, result: dict[str, Any], public: dict[str, Any], identity: dict | None) -> None:
    """Persiste il run di prompt-audit /live nella tabella `logs` (action
    `prompt_audit_live`), così le prove sui counselor compaiono nel visualizzatore
    log dell'app. Best-effort: un fallimento di logging non deve rompere l'audit.

    Ricalca il logging di /chat: redazione PII su scores/risposta/reasoning e, se
    `log_full_prompt` e' attivo, envelope completo (system prompt + messaggio +
    history) redatto."""
    try:
        resolved = public.get("resolved", {})
        ident = _identity_as_dict(identity)
        session_id = (getattr(payload, "session_id", None) or f"prompt-audit-live-{uuid.uuid4()}")
        details = pii.redact_details({
            "audit": True,
            "source": "prompt-audit-live",
            "mode": payload.mode,
            "phase": payload.phase,
            "counselor_id": getattr(payload, "counselor_id", None),
            "counselor": resolved.get("counselor"),
            "step": resolved.get("step"),
            "prompt_key": resolved.get("prompt_key"),
            "language": resolved.get("language"),
            "scores_context": public.get("inputs", {}).get("full_scores_context"),
            "bot_response": public.get("response_visible"),
            "reasoning": public.get("reasoning"),
            "checks": public.get("checks"),
            "warnings": public.get("warnings"),
            "usage": public.get("usage"),
            "cost_usd": public.get("cost_usd"),
            "duration_ms": public.get("duration_ms"),
            "knowledge_context_length": public.get("knowledge", {}).get("context_length"),
            "strategy_ids": public.get("knowledge", {}).get("strategy_ids"),
            "certified_strategy_ids": public.get("knowledge", {}).get("certified_strategy_ids"),
        }, "scores_context", "bot_response", "reasoning")
        if full_prompt_logging_enabled(db):
            details["envelope"] = pii.redact_envelope(result.get("envelope", {}))
        db.add(models.Log(
            session_id=session_id,
            action="prompt_audit_live",
            username=ident.get("username") or None,
            email=ident.get("email") or None,
            anonymous_research_code=(code_for_identity(db, ident) if ident.get("username") else None),
            provider=resolved.get("provider"),
            model_name=resolved.get("model"),
            cost_usd=public.get("cost_usd"),
            questionnaire_type=result.get("_questionnaire_type") or getattr(payload, "questionnaire_type", None),
            phase=payload.phase or None,
            mode=payload.mode or None,
            details=details,
        ))
        db.commit()
    except Exception as e:  # pragma: no cover - difensivo
        logger.warning(f"Logging prompt_audit_live fallito: {e}")
        try:
            db.rollback()
        except Exception:
            pass


def run_prompt_audit_live(
    db: Session,
    payload,
    identity: dict | None = None,
    *,
    ai_service_cls: Callable[[Session], AIService] = AIService,
) -> dict[str, Any]:
    result = build_prompt_audit(db, payload, ai_service_cls=ai_service_cls)
    ai_service = result["_ai_service"]
    t0 = time.monotonic()
    try:
        response_raw = ai_service.get_response(
            result["envelope"]["full_message"],
            result["envelope"]["system_prompt_final"],
            payload.mode,
            conversation_summary="",
            max_tokens=result["_max_tokens"],
            provider=result["_provider_override"],
            model=result["_model_override"],
            history=result["envelope"]["history"],
        )
    except AIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    duration_ms = int((time.monotonic() - t0) * 1000)

    # «sto pensando» confinato: preferisci il thinking nativo (Ollama), poi estrai
    # eventuali tag <think> inlineati nel testo. Il visibile prosegue ripulito.
    reasoning_native = getattr(ai_service, "last_thinking", None)
    reasoning_tagged, response_raw = split_thinking(response_raw)
    reasoning = (reasoning_native or reasoning_tagged) or None

    questionnaire_type = result["_questionnaire_type"]
    if result["_sanitize_ztpi"]:
        response_visible = _sanitize_ztpi_user_text(response_raw, payload.language)
    elif _is_strategy_questionnaire(questionnaire_type):
        response_visible = _annotate_qsa_factor_codes(
            response_raw, payload.language, questionnaire_type=questionnaire_type
        )
        response_visible = _ensure_required_qsa_factor_codes(
            response_visible,
            questionnaire_type,
            payload.language,
            _phase_factor_codes(db, payload.phase),
        )
    else:
        response_visible = response_raw

    usage = getattr(ai_service, "last_usage", None)
    provider = result["resolved"].get("provider")
    model = result["resolved"].get("model")
    public = _strip_internal(result)
    public.update({
        "response_raw": response_raw,
        "response_visible": response_visible,
        "reasoning": reasoning,
        "usage": usage,
        "cost_usd": _usage_cost_usd(usage, provider, model),
        "duration_ms": duration_ms,
        "checks": response_checks(result, response_visible),
    })
    _log_prompt_audit_live(db, payload, result, public, identity)
    return public


def prompt_audit_matrix(
    db: Session,
    payload,
    *,
    ai_service_cls: Callable[[Session], AIService] = AIService,
) -> dict[str, Any]:
    questionnaire_type = payload.questionnaire_type or "QSA"
    steps = (
        db.query(models.GuidedStep)
        .filter(models.GuidedStep.questionnaire_type == questionnaire_type)
        .order_by(models.GuidedStep.sort_order.asc(), models.GuidedStep.id.asc())
        .all()
    )
    if payload.counselor_ids:
        counselor_ids: list[int | None] = list(payload.counselor_ids)
    else:
        counselor_ids = [
            row.id for row in (
                db.query(models.Counselor)
                .filter(models.Counselor.is_active.is_(True))
                .order_by(models.Counselor.sort_order.asc(), models.Counselor.id.asc())
                .all()
            )
        ]
        if not counselor_ids:
            counselor_ids = [None]

    rows = []
    for counselor_id in counselor_ids:
        for step in steps:
            request_payload = _MatrixAuditRequestAdapter(
                questionnaire_type=questionnaire_type,
                language=payload.language,
                phase=step.id,
                mode=step.system_prompt_mode,
                use_phase_prompt=True,
                message="",
                scores_context=payload.scores_context,
                session_id=f"prompt-audit-matrix-{uuid.uuid4()}",
                counselor_id=counselor_id,
                max_tokens=payload.max_tokens,
                include_knowledge=payload.include_knowledge,
                include_history=False,
            )
            result = build_prompt_audit(db, request_payload, ai_service_cls=ai_service_cls)
            public = _strip_internal(result)
            rows.append({
                "counselor_id": counselor_id,
                "step_id": step.id,
                "step_label": step.label,
                "prompt_key": public["resolved"]["prompt_key"],
                "provider": public["resolved"]["provider"],
                "model": public["resolved"]["model"],
                "system_prompt_length": len(public["envelope"]["system_prompt_final"]),
                "full_message_length": len(public["envelope"]["full_message"]),
                "knowledge_context_length": public["knowledge"]["context_length"],
                "warnings": public["warnings"],
            })
    return {
        "questionnaire_type": questionnaire_type,
        "language": _normalize_language(payload.language),
        "steps_count": len(steps),
        "counselors_count": len(counselor_ids),
        "rows": rows,
    }


class _MatrixAuditRequestAdapter:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)

    def model_dump(self, *args, **kwargs):
        exclude = set(kwargs.get("exclude") or set())
        return {key: value for key, value in self.__dict__.items() if key not in exclude}
