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

DEFAULT_TOTAL_MAX_CHARS = 3000


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
    return (data.get(language) or data.get("it") or "").strip()


def _render_order(binding: SkillBinding) -> tuple:
    # Le skill strutturali (`always`) hanno la precedenza sul budget complessivo.
    return (0 if binding.skill.routing == "always" else 1, binding.sort_order, binding.slug)


def render(bindings: list[SkillBinding], ctx: SkillContext, total_max_chars: int = DEFAULT_TOTAL_MAX_CHARS) -> SkillsResult:
    """Esegue le skill selezionate e produce i blocchi per slot."""
    result = SkillsResult()
    used = 0
    for binding in sorted(bindings, key=_render_order):
        skill = binding.skill
        entry = {"slug": skill.slug, "slot": skill.slot, "chars": 0, "skipped": ""}

        parts = []
        instructions = _instructions(skill, ctx.language or "it")
        if instructions:
            parts.append(instructions)

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
            if output.text:
                parts.append(output.text.strip())
            if output.ids:
                result.ids[skill.slug] = list(output.ids)

        text = "\n\n".join(part for part in parts if part)
        if not text:
            entry["skipped"] = "nessun contenuto"
            result.trace.append(entry)
            continue

        text = truncate(text, int(skill.max_chars or 0) or len(text))
        remaining = total_max_chars - used
        if len(text) > remaining:
            entry["skipped"] = "budget complessivo esaurito"
            result.trace.append(entry)
            continue

        used += len(text)
        entry["chars"] = len(text)
        result.blocks.setdefault(skill.slot, []).append(text)
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
) -> SkillContext:
    """Fotografa il turno: i fattori salienti e le bande si calcolano una volta."""
    return SkillContext(
        questionnaire_type=questionnaire_type or "",
        step_id=step_id,
        step_mode=step_mode,
        language=language or "it",
        query=query or "",
        step_query=step_query or "",
        message=message or "",
        scores_context=scores_context or "",
        salient_factors=handlers.compute_salient_factors(f"{scores_context} {step_query}"),
        score_bands=handlers.compute_score_bands(questionnaire_type, scores_context),
        component_flags=dict(component_flags or {}),
        handler_options=dict(handler_options or {}),
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
