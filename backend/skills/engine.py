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
