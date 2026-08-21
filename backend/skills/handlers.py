"""Registry degli handler Python richiamabili da una skill.

Solo i nomi registrati qui sono accettati in `Skill.handler`: un nome
sconosciuto disattiva la skill invece di eseguire codice arbitrario.
Gli handler sono la meta' "codice" del modello ibrido: qui vivono il parsing
dei punteggi e le chiamate ai servizi di retrieval; le condizioni di
attivazione stanno invece in `conditions.py`, dichiarative.
"""
from __future__ import annotations

import logging
from typing import Callable

from .. import models
from ..certified_strategy_service import (
    certified_strategy_memory,
    factor_tokens,
    score_bands,
)
from ..strategy_memory import APPROVED_STRATEGIES_CONFIG_KEY, strategy_memory
from .context import SkillContext, SkillOutput

logger = logging.getLogger(__name__)

_HANDLERS: dict[str, Callable[[SkillContext, dict], SkillOutput]] = {}


def handler(name: str):
    """Registra una funzione come handler invocabile da `Skill.handler`."""

    def decorator(fn: Callable[[SkillContext, dict], SkillOutput]):
        _HANDLERS[name] = fn
        return fn

    return decorator


def get_handler(name: str) -> Callable[[SkillContext, dict], SkillOutput] | None:
    return _HANDLERS.get(name)


def handler_names() -> list[str]:
    return sorted(_HANDLERS)


def compute_salient_factors(text: str) -> frozenset[str]:
    return frozenset(factor_tokens(text or ""))


def compute_score_bands(questionnaire_type: str, scores_context: str) -> dict[str, str]:
    return score_bands(questionnaire_type, scores_context)


def _allowed(entries: list[dict], allowed_ids) -> list[dict]:
    """Whitelist per step salvata dall'admin. `None` = nessuna whitelist."""
    if allowed_ids is None or not isinstance(allowed_ids, list):
        return entries
    allowed = {str(item).strip() for item in allowed_ids if str(item).strip()}
    return [entry for entry in entries if str(entry.get("id", "")).strip() in allowed]


@handler("certified_strategies")
def certified_strategies(ctx: SkillContext, params: dict) -> SkillOutput:
    """Strategie certificate dal catalogo DB, gate sui fattori e sul profilo."""
    limit = int(params.get("limit", 2) or 0)
    if limit <= 0:
        return SkillOutput()
    entries = certified_strategy_memory.retrieve(
        ctx.db,
        questionnaire_type=ctx.questionnaire_type,
        scores_context=ctx.scores_context,
        # Il catalogo certificato usa la query arricchita di step e punteggi.
        query=ctx.step_query or ctx.query,
        language=ctx.language or "it",
        limit=limit,
        ai_service=ctx.ai_service,
    )
    entries = _allowed(entries, params.get("allowed_strategies"))
    text = certified_strategy_memory.render_context(entries, ctx.language or "it")
    return SkillOutput(text=text, ids=[entry["id"] for entry in entries])


@handler("approved_strategies")
def approved_strategies(ctx: SkillContext, params: dict) -> SkillOutput:
    """Knowledge base Markdown delle strategie approvate (file o config DB)."""
    row = (
        ctx.db.query(models.Config)
        .filter(models.Config.key == APPROVED_STRATEGIES_CONFIG_KEY)
        .first()
    )
    entries = strategy_memory.retrieve(
        questionnaire_type=ctx.questionnaire_type,
        phase=ctx.step_id or "",
        query=ctx.query,
        language=ctx.language or "it",
        ai_service=ctx.ai_service,
        markdown_text=row.value if row else None,
    )
    entries = _allowed(entries, params.get("allowed_strategies"))
    text = strategy_memory.render_context(entries)
    return SkillOutput(text=text, ids=[entry["id"] for entry in entries])
