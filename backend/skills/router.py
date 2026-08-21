"""Selezione delle skill: regole prima, LLM solo sul residuo.

Le skill `always` passano sempre: sono le direttive strutturali, devono essere
riproducibili. Le `optional` passano tutte finche' sono poche; oltre la soglia
un router LLM sceglie le piu' pertinenti al messaggio dello studente.
Qualunque problema (servizio assente, timeout, risposta non parsabile) degrada
sul fallback deterministico: prime K per sort_order.
"""
from __future__ import annotations

import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout

from .context import SkillContext
from .registry import SkillBinding

logger = logging.getLogger(__name__)

ROUTER_SYSTEM_PROMPT = (
    "Sei un selettore di strumenti. Ricevi un elenco di skill con identificatore "
    "e descrizione, piu' il messaggio di uno studente. Scegli SOLO le skill "
    "davvero pertinenti a quel messaggio. Rispondi esclusivamente con un array "
    "JSON di identificatori, senza testo attorno. Se nessuna e' pertinente, "
    "rispondi []."
)

_JSON_ARRAY_RE = re.compile(r"\[[^\]]*\]", re.DOTALL)


def select(candidates: list[SkillBinding], ctx: SkillContext) -> tuple[list[SkillBinding], list[dict]]:
    """Ritorna (skill selezionate, voci di trace del router)."""
    if not candidates:
        return [], []

    always = [b for b in candidates if b.skill.routing == "always"]
    optional = [b for b in candidates if b.skill.routing != "always"]

    from .engine import _config_int

    threshold = _config_int(ctx.db, "skills_router_threshold", 3)
    if len(optional) <= threshold:
        return always + optional, []

    fallback = sorted(optional, key=lambda b: (b.sort_order, b.slug))[:threshold]
    chosen = _llm_select(optional, ctx, threshold)
    if chosen is None:
        return always + fallback, [{"router": "fallback", "chosen": [b.slug for b in fallback]}]
    return always + chosen, [{"router": "llm", "chosen": [b.slug for b in chosen]}]


def _llm_select(optional: list[SkillBinding], ctx: SkillContext, limit: int) -> list[SkillBinding] | None:
    """`None` segnala al chiamante di usare il fallback deterministico."""
    if ctx.ai_service is None:
        return None

    from .engine import _config_int, _config_value

    catalogue = "\n".join(f"- {b.slug}: {(b.skill.description or b.skill.name or '').strip()}" for b in optional)
    user_message = (
        f"MESSAGGIO DELLO STUDENTE:\n{(ctx.message or '').strip()[:800]}\n\n"
        f"STEP CORRENTE: {ctx.step_id or 'nessuno'} ({ctx.step_mode or 'n/d'})\n\n"
        f"SKILL DISPONIBILI:\n{catalogue}\n\n"
        f"Scegli al massimo {limit} identificatori."
    )

    try:
        provider = ctx.ai_service.config.get("active_provider", "openai")
        model = _config_value(ctx.db, "skills_router_model", "") or ctx.ai_service.config.get("model_name", "")
        timeout_s = _config_int(ctx.db, "skills_router_timeout_s", 6)
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(
                ctx.ai_service.call_model,
                provider=provider,
                model=model,
                user_message=user_message,
                system_prompt=ROUTER_SYSTEM_PROMPT,
                max_tokens=200,
            )
            try:
                reply = future.result(timeout=timeout_s)
            except FutureTimeout:
                logger.warning("Router skill: timeout dopo %ss, uso il fallback", timeout_s)
                return None
    except Exception as exc:
        logger.warning("Router skill non disponibile, uso il fallback: %s", exc)
        return None

    slugs = _parse_slugs(reply)
    if slugs is None:
        logger.warning("Router skill: risposta non parsabile, uso il fallback")
        return None

    by_slug = {b.slug: b for b in optional}
    chosen = [by_slug[slug] for slug in slugs if slug in by_slug]
    return chosen[:limit]


def _parse_slugs(reply) -> list[str] | None:
    if not isinstance(reply, str):
        return None
    match = _JSON_ARRAY_RE.search(reply)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except (TypeError, ValueError):
        return None
    if not isinstance(data, list):
        return None
    return [str(item).strip() for item in data if str(item).strip()]
