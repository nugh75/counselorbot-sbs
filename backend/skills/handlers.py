"""Registry degli handler Python richiamabili da una skill.

Solo i nomi registrati qui sono accettati in `Skill.handler`: un nome
sconosciuto disattiva la skill invece di eseguire codice arbitrario.
Gli handler sono la meta' "codice" del modello ibrido: qui vivono il parsing
dei punteggi e le chiamate ai servizi di retrieval; le condizioni di
attivazione stanno invece in `conditions.py`, dichiarative.
"""
from __future__ import annotations

import logging
import re
from typing import Callable

from sqlalchemy import func

from .. import models
from ..certified_strategy_service import (
    certified_strategy_memory,
    factor_tokens,
    score_bands,
)
from ..certified_reading_service import certified_reading_memory
from ..reading_themes import themes_from_factors, themes_from_text
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


# Compilazioni conservate per ogni strumento: l'ultima e la precedente, cosi'
# un confronto temporale (QSA di oggi vs QSA di prima) diventa possibile.
PROFILE_RESULTS_PER_INSTRUMENT = 2
# Tetto complessivo dei profili passati alla skill di confronto.
PROFILE_RESULTS_MAX = 8


def load_profile_results(
    db,
    session_id: str,
    username: str,
    language: str,
    questionnaire_type: str = "",
    per_instrument: int = PROFILE_RESULTS_PER_INSTRUMENT,
    limit: int = PROFILE_RESULTS_MAX,
) -> tuple[dict, ...]:
    """Risultati con punteggi dello stesso utente: per ogni strumento l'ultima
    compilazione e le precedenti fino a `per_instrument`, cosi' il confronto puo'
    essere anche temporale. Lo strumento corrente viene per primo."""
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
    # `rows` e' gia' ordinato dal piu' recente: la posizione dentro lo strumento
    # e' quindi anche la sua eta' (0 = attuale, 1 = precedente).
    latest = []
    occurrences: dict[int, int] = {}
    per_type: dict[str, int] = {}
    for row in rows:
        qtype = str(row.questionnaire_type or "").strip()
        if not qtype or not isinstance(row.scores, dict) or not row.scores:
            continue
        key = qtype.upper()
        rank = per_type.get(key, 0)
        if rank >= max(1, per_instrument):
            continue
        per_type[key] = rank + 1
        occurrences[row.id] = rank
        latest.append(row)

    if not latest:
        return ()

    current = (questionnaire_type or "").strip().upper()
    latest.sort(key=lambda row: (
        0 if str(row.questionnaire_type or "").upper() == current else 1,
        occurrences[row.id],
    ))
    latest = latest[:max(1, limit)]

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
        # "current" = compilazione piu' recente di quello strumento, "previous"
        # (e oltre) = compilazioni anteriori dello stesso questionario.
        "occurrence": "current" if occurrences[row.id] == 0 else "previous",
        "occurrence_rank": occurrences[row.id],
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
    repeated = sorted({
        str(profile.get("questionnaire_type", "")).upper()
        for profile in profiles
        if profile.get("occurrence") == "previous"
    })
    if repeated:
        lines.append(
            "Confronto temporale disponibile per: "
            f"{', '.join(repeated)}. Per questi strumenti confronta la compilazione "
            "attuale con quella precedente dello stesso questionario."
        )
    for profile in profiles[:PROFILE_RESULTS_MAX]:
        date = f" ({profile.get('submitted_at')})" if profile.get("submitted_at") else ""
        occurrence = "precedente" if profile.get("occurrence") == "previous" else "attuale"
        lines.append(
            f"## {profile.get('questionnaire_type', 'Profilo')}{date} "
            f"— compilazione {occurrence}"
        )
        for score in profile.get("scores", ()):
            lines.append(f"- {score['code']} ({score['label']}): {score['value']}")
    return SkillOutput(text="\n".join(lines), slot="knowledge")


# Un titolo utile ha lettere e non e' un hash o un identificatore di chunk.
_HASHLIKE_TITLE = re.compile(r"^[0-9a-f]{6,}$")


def _identifiable_source(entry) -> bool:
    """Vero se la fonte ha titolo e documento realmente citabili."""
    title = str((entry or {}).get("title") or "").strip()
    source = str((entry or {}).get("source") or "").strip()
    if not title or not source:
        return False
    if sum(1 for char in title if char.isalpha()) < 4:
        return False
    return not _HASHLIKE_TITLE.match(title.casefold().replace(" ", ""))


def _certified_readings_block(ctx: SkillContext, params: dict) -> str:
    """Voci del catalogo approvato pertinenti al turno.

    I temi nominati dallo studente contano doppio: aprono il gate e sono gli
    unici che sbloccano il materiale marcato sensibile."""
    if ctx.db is None:
        return ""
    explicit = themes_from_text(ctx.message)
    implicit = themes_from_text(ctx.step_query or ctx.query) | themes_from_factors(ctx.salient_factors)
    row = ctx.db.query(models.Config).filter(
        models.Config.key == "readings_allow_sensitive"
    ).first()
    allow_sensitive = str(getattr(row, "value", "false")).strip().lower() in ("1", "true", "yes", "on")
    entries = certified_reading_memory.retrieve(
        ctx.db,
        themes=implicit,
        explicit_themes=explicit,
        factor_codes=ctx.salient_factors,
        questionnaire_type=ctx.questionnaire_type,
        language=ctx.language or "it",
        query=(ctx.message or ctx.step_query or ctx.query),
        limit=int(params.get("catalog_limit", 2) or 2),
        ai_service=ctx.ai_service,
        allow_sensitive=allow_sensitive,
    )
    return certified_reading_memory.render_context(entries, ctx.language or "it")


@handler("reading_sources")
def reading_sources(ctx: SkillContext, params: dict) -> SkillOutput:
    """Materiale citabile nel turno: il catalogo approvato di letture e film,
    piu' la whitelist dei documenti realmente recuperati. Il divieto di inventare
    riferimenti diventa cosi' un filtro, non solo una direttiva al modello."""
    limit = int(params.get("limit", 6) or 6)
    entries: list[tuple[str, str]] = []
    seen: set[str] = set()
    # Con le fonti disattivate per questo turno nessun riferimento e' citabile:
    # vale come assenza, non come licenza di citare a memoria.
    sources = ctx.knowledge_sources if ctx.component_flags.get("knowledge", True) else ()
    for item in sources or ():
        if not _identifiable_source(item):
            continue
        source = str(item.get("source")).strip()
        if source in seen:
            continue
        seen.add(source)
        entries.append((str(item.get("title")).strip(), source))
        if len(entries) >= limit:
            break

    catalog = _certified_readings_block(ctx, params)

    if not entries:
        if catalog:
            # Nessun documento recuperato, ma il catalogo approvato ha qualcosa:
            # e' materiale citabile a pieno titolo, va nello slot dei dati.
            return SkillOutput(text=catalog, slot="knowledge")
        # L'assenza e' una direttiva, non un dato: resta nello slot della skill
        # cosi' raggiunge il modello anche quando [KNOWLEDGE] non viene composto.
        return SkillOutput(
            text=(
                "Nessuna fonte identificabile e' disponibile in questo turno: "
                "dichiara l'assenza, non citare alcun titolo, autore, DOI o link "
                "e proponi al massimo un tema da cercare."
            ),
        )

    lines = [
        "[READING_SOURCES]",
        "Uniche fonti citabili in questo turno (titolo — documento). "
        "Non citare titoli, autori, DOI o link che non compaiano in questo elenco, "
        "nemmeno se compaiono dentro il testo dei documenti recuperati.",
    ]
    lines.extend(f"- {title} ({source})" for title, source in entries)
    text = "\n".join(lines)
    if catalog:
        text = f"{catalog}\n\n{text}"
    return SkillOutput(
        text=text,
        ids=[source for _, source in entries],
        slot="knowledge",
    )
