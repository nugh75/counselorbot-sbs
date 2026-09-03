"""Esecuzione delle skill: rendering, budget, trace.

Il motore non solleva mai: ogni errore diventa una voce di `trace` e un blocco
mancante, perche' un turno di chat non deve fallire per una skill.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from . import handlers
from .context import SkillContext, SkillOutput
from .registry import SkillBinding

logger = logging.getLogger(__name__)

# Le istruzioni delle skill sono cresciute: a 3000 il contratto dei
# diagrammi da solo ne occupava 1977 e il materiale certificato non ci
# stava piu'. Il tetto vive per non far esplodere il prompt, non per
# scegliere fra due blocchi che servono entrambi.
DEFAULT_TOTAL_MAX_CHARS = 4500


@dataclass
class SkillsResult:
    # slot -> blocchi renderizzati, nell'ordine di iniezione
    blocks: dict[str, list[str]] = field(default_factory=dict)
    # slug -> identificatori del materiale usato (per i log e il feedback)
    ids: dict[str, list[str]] = field(default_factory=dict)
    # diagnostica per la preview admin
    trace: list[dict] = field(default_factory=list)


def truncate(text: str, limit: int) -> str:
    """Taglia a `limit` caratteri sul confine di riga piu' vicino."""
    if limit <= 0:
        return ""
    if len(text) <= limit:
        return text
    cut = text[:limit]
    newline = cut.rfind("\n")
    return (cut[:newline] if newline > 0 else cut).rstrip()


def _instructions(skill, language: str) -> str:
    data = skill.instructions_i18n or {}
    if not isinstance(data, dict):
        return ""
    value = data.get("en")
    return value.strip() if isinstance(value, str) else ""


# Chi prende il budget per primo. Fuori dalle strutturali contava solo
# `sort_order`, e un numero deciso quando due skill sono nate in momenti
# diversi faceva passare un'illustrazione facoltativa davanti al materiale
# della risposta: `concept-diagram` (optional, 35) si prendeva due terzi del
# budget e `certified-advice` (primary, 50) restava senza, in silenzio.
_ROUTING_RANK = {"always": 0, "support": 0, "primary": 1}
_OPTIONAL_RANK = 2


def _render_order(binding: SkillBinding) -> tuple:
    """Strutturali, poi il comportamento primario del turno, poi il resto."""
    rank = _ROUTING_RANK.get(binding.skill.routing, _OPTIONAL_RANK)
    return (rank, binding.sort_order, binding.slug)


def render(bindings: list[SkillBinding], ctx: SkillContext, total_max_chars: int = DEFAULT_TOTAL_MAX_CHARS) -> SkillsResult:
    """Esegue le skill selezionate e produce i blocchi per slot."""
    result = SkillsResult()
    used = 0
    for binding in sorted(bindings, key=_render_order):
        skill = binding.skill
        entry = {"slug": skill.slug, "slot": skill.slot, "chars": 0, "skipped": ""}

        parts = []
        output_ids = []
        output = SkillOutput()

        if skill.handler:
            fn = handlers.get_handler(skill.handler)
            if fn is None:
                entry["skipped"] = f"handler sconosciuto: {skill.handler}"
                logger.warning("Skill %s: %s", skill.slug, entry["skipped"])
                result.trace.append(entry)
                continue
            try:
                output = fn(ctx, binding.params) or SkillOutput()
            except Exception as exc:  # una skill rotta non deve rompere il turno
                entry["skipped"] = f"handler fallito: {exc}"
                logger.warning("Skill %s: %s", skill.slug, entry["skipped"])
                result.trace.append(entry)
                continue
            if not output.applicable:
                entry["skipped"] = output.reason or "skill non applicabile"
                result.trace.append(entry)
                continue

        instructions = _instructions(skill, ctx.language or "it")
        if instructions:
            parts.append(instructions)
        if output.text:
            parts.append(output.text.strip())
        if output.ids:
            output_ids = list(output.ids)

        # Normalmente istruzioni e materiale condividono lo slot e restano un
        # unico blocco. Un handler puo' separare dati e direttiva.
        segments: list[tuple[str, str]] = []
        output_slot = output.slot or skill.slot
        if output.text and output_slot != skill.slot:
            if instructions:
                segments.append((skill.slot, instructions))
            segments.append((output_slot, output.text.strip()))
        else:
            text = "\n\n".join(part for part in parts if part)
            if text:
                segments.append((skill.slot, text))

        if not segments:
            entry["skipped"] = "nessun contenuto"
            result.trace.append(entry)
            continue

        skill_limit = int(skill.max_chars or 0) or sum(len(text) for _, text in segments)
        limited_segments = []
        skill_used = 0
        for slot, text in segments:
            limited = truncate(text, max(0, skill_limit - skill_used))
            if limited:
                limited_segments.append((slot, limited))
                skill_used += len(limited)
        if output.text and output_slot != skill.slot:
            rendered_output = next(
                (text for slot, text in limited_segments if slot == output_slot),
                "",
            )
            minimum_useful_output = min(len(output.text.strip()), 64)
            if len(rendered_output) < minimum_useful_output:
                entry["skipped"] = "materiale escluso dal budget della skill"
                result.trace.append(entry)
                continue
        remaining = total_max_chars - used
        if not limited_segments or skill_used > remaining:
            entry["skipped"] = "budget complessivo esaurito"
            result.trace.append(entry)
            continue

        used += skill_used
        entry["chars"] = skill_used
        for slot, text in limited_segments:
            result.blocks.setdefault(slot, []).append(text)
        if output_ids:
            result.ids[skill.slug] = output_ids
        result.trace.append(entry)
    return result


def _config_value(db, key: str, default: str = "") -> str:
    from .. import models as _models

    row = db.query(_models.Config).filter(_models.Config.key == key).first()
    return (row.value if row and row.value is not None else default) or default


def _config_int(db, key: str, default: int) -> int:
    try:
        return int(_config_value(db, key, str(default)))
    except (TypeError, ValueError):
        return default


def enabled(db, questionnaire_type: str) -> bool:
    """Il motore gira solo se acceso globalmente e per questo strumento."""
    import json as _json

    if _config_value(db, "skills_engine_enabled", "false").strip().lower() not in ("1", "true", "yes", "on"):
        return False
    try:
        instruments = _json.loads(_config_value(db, "skills_engine_instruments", "[]") or "[]")
    except (TypeError, ValueError):
        return False
    if not isinstance(instruments, list):
        return False
    return (questionnaire_type or "").upper() in {str(i).upper() for i in instruments}


def _audience_band(db, username: str) -> str | None:
    """Fascia dello studente; un errore qui non deve rompere il turno."""
    from ..reading_audience import resolve_audience_band

    try:
        return resolve_audience_band(db, username)
    except Exception as exc:
        logger.warning("Fascia di pubblico non risolta: %s", exc)
        return None


def build_context(
    db,
    ai_service,
    *,
    questionnaire_type: str,
    step_id: str | None,
    step_mode: str | None,
    language: str,
    query: str,
    step_query: str,
    message: str,
    scores_context: str,
    component_flags: dict | None = None,
    handler_options: dict | None = None,
    intent: str | None = None,
    session_id: str = "",
    username: str = "",
    knowledge_sources: list[dict] | None = None,
) -> SkillContext:
    """Fotografa il turno: i fattori salienti e le bande si calcolano una volta."""
    from .intents import classify

    resolved_intent = intent if intent is not None else classify(
        message,
        guided=bool(step_id and not (message or "").strip()),
    )
    return SkillContext(
        questionnaire_type=questionnaire_type or "",
        step_id=step_id,
        step_mode=step_mode,
        language=language or "it",
        intent=resolved_intent,
        session_id=session_id or "",
        session_username=username or "",
        query=query or "",
        step_query=step_query or "",
        message=message or "",
        scores_context=scores_context or "",
        salient_factors=handlers.compute_salient_factors(f"{scores_context} {step_query}"),
        score_bands=handlers.compute_score_bands(questionnaire_type, scores_context),
        component_flags=dict(component_flags or {}),
        handler_options=dict(handler_options or {}),
        profile_results=(
            handlers.load_profile_results(
                db, session_id, username, language, questionnaire_type=questionnaire_type or ""
            )
            if resolved_intent == "compare"
            else ()
        ),
        knowledge_sources=tuple(knowledge_sources or ()),
        audience_band=_audience_band(db, username),
        db=db,
        ai_service=ai_service,
    )


def run_skills(ctx: SkillContext, *, router_enabled: bool = True) -> SkillsResult:
    """Filtra, seleziona e rende le skill agganciate allo step corrente."""
    from . import conditions as _conditions
    from .registry import COMPONENT_FLAG_BY_SLUG, bindings_for

    result = SkillsResult()
    try:
        bindings = bindings_for(ctx.db, ctx.questionnaire_type, ctx.step_id)
    except Exception as exc:
        logger.warning("Caricamento skill fallito: %s", exc)
        return result

    candidates = []
    for binding in bindings:
        flag = COMPONENT_FLAG_BY_SLUG.get(binding.slug)
        if flag is not None and not bool(ctx.component_flags.get(flag, True)):
            result.trace.append({"slug": binding.slug, "skipped": f"componente {flag} disattivata"})
            continue
        ok, reason = _conditions.match(binding.skill.conditions, ctx)
        if not ok:
            result.trace.append({"slug": binding.slug, "skipped": reason})
            continue
        # Le opzioni per step configurate dall'admin vincono sui parametri skill.
        params = dict(binding.params)
        if binding.slug == "certified-advice" and "certified_strategy_limit" in ctx.handler_options:
            params["limit"] = ctx.handler_options["certified_strategy_limit"]
        if binding.slug == "certified-advice" and "excluded_strategy_ids" in ctx.handler_options:
            params["excluded_strategy_ids"] = ctx.handler_options["excluded_strategy_ids"]
        if "allowed_strategies" in ctx.handler_options:
            params["allowed_strategies"] = ctx.handler_options["allowed_strategies"]
        binding.params = params
        candidates.append(binding)

    if router_enabled:
        from .router import select

        selected, router_trace = select(candidates, ctx)
        result.trace.extend(router_trace)
    else:
        selected = candidates

    rendered = render(selected, ctx, total_max_chars=_config_int(ctx.db, "skills_total_max_chars", DEFAULT_TOTAL_MAX_CHARS))
    result.blocks = rendered.blocks
    result.ids = rendered.ids
    result.trace.extend(rendered.trace)
    return result
