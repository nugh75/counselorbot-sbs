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

from sqlalchemy import func

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


def load_profile_results(db, session_id: str, username: str, language: str) -> tuple[dict, ...]:
    """Ultimo risultato con punteggi per strumento, limitato allo stesso utente."""
    if db is None:
        return ()
    owner = (username or "").strip()
    if not owner and session_id:
        current = db.query(models.QuestionnaireResult).filter(
            models.QuestionnaireResult.session_id == session_id
        ).first()
        owner = (current.username or "").strip() if current else ""
    if not owner:
        return ()

    rows = (
        db.query(models.QuestionnaireResult)
        .filter(func.lower(models.QuestionnaireResult.username) == owner.casefold())
        .order_by(models.QuestionnaireResult.submitted_at.desc(), models.QuestionnaireResult.id.desc())
        .all()
    )
    latest = []
    seen = set()
    for row in rows:
        qtype = str(row.questionnaire_type or "").strip()
        if not qtype or qtype.upper() in seen or not isinstance(row.scores, dict) or not row.scores:
            continue
        seen.add(qtype.upper())
        latest.append(row)

    if not latest:
        return ()
    factors = db.query(models.Factor).filter(
        models.Factor.instrument_code.in_([row.questionnaire_type for row in latest])
    ).all()
    labels = {}
    lang = (language or "it").lower()
    for factor in factors:
        label = getattr(factor, f"label_{lang}", None) or factor.label_it or factor.label_en or factor.code
        labels[(factor.instrument_code, factor.code)] = label

    return tuple({
        "questionnaire_type": row.questionnaire_type,
        "submitted_at": row.submitted_at.date().isoformat() if row.submitted_at else "",
        "scores": tuple(
            {
                "code": str(code),
                "label": labels.get((row.questionnaire_type, str(code)), str(code)),
                "value": value,
            }
            for code, value in row.scores.items()
            if isinstance(value, (int, float))
        ),
    } for row in latest)


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
        return SkillOutput(applicable=False, reason="consigli disabilitati per questo turno")
    entries = certified_strategy_memory.retrieve(
        ctx.db,
        questionnaire_type=ctx.questionnaire_type,
        scores_context=ctx.scores_context,
        # Il catalogo certificato usa la query arricchita di step e punteggi.
        query=ctx.step_query or ctx.query,
        language=ctx.language or "it",
        limit=limit,
        ai_service=ctx.ai_service,
        excluded_ids=set(params.get("excluded_strategy_ids") or []),
        allowed_ids=(
            set(params["allowed_strategies"])
            if isinstance(params.get("allowed_strategies"), list)
            else None
        ),
    )
    entries = _allowed(entries, params.get("allowed_strategies"))
    text = certified_strategy_memory.render_context(entries, ctx.language or "it")
    if not entries:
        return SkillOutput(applicable=False, reason="nessuna strategia certificata pertinente")
    return SkillOutput(
        text=text,
        ids=[entry["id"] for entry in entries],
        slot="knowledge",
    )


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
    if not entries:
        return SkillOutput(applicable=False, reason="nessuna strategia approvata pertinente")
    return SkillOutput(text=text, ids=[entry["id"] for entry in entries])


@handler("profile_comparison")
def profile_comparison(ctx: SkillContext, params: dict) -> SkillOutput:
    """Dati strutturati per un confronto, senza inventare profili mancanti."""
    if not ctx.component_flags.get("knowledge", True):
        return SkillOutput(applicable=False, reason="dati profilo disabilitati per questo turno")
    profiles = list(ctx.profile_results or ())
    lines = ["[COMPARABLE_PROFILES]"]
    if len(profiles) < 2:
        lines.append(
            f"Profili strutturati disponibili: {len(profiles)}. "
            "Non eseguire un confronto fittizio: chiedi quale secondo risultato confrontare."
        )
    for profile in profiles[:7]:
        date = f" ({profile.get('submitted_at')})" if profile.get("submitted_at") else ""
        lines.append(f"## {profile.get('questionnaire_type', 'Profilo')}{date}")
        for score in profile.get("scores", ()):
            lines.append(f"- {score['code']} ({score['label']}): {score['value']}")
    return SkillOutput(text="\n".join(lines), slot="knowledge")
