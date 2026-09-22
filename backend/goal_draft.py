"""Blocco privato con cui la sintesi del percorso Obiettivo precompila un obiettivo personale.

A fine percorso il modello riassume l'obiettivo in un blocco ```goal che la
persona non vede mai: il client lo riceve come bozza, lo mostra in un modulo
modificabile e crea l'obiettivo solo su conferma. Qui vive il contratto:
come si chiede, come si legge, come si toglie dal testo.

Regole:
  - il blocco non raggiunge lo studente, ne' in streaming ne' nel transcript;
  - blocco assente o illeggibile non propone niente: il modulo si apre vuoto;
  - un valore fuori contratto si scarta, non si indovina.
"""
from __future__ import annotations

import json
import logging
import re

logger = logging.getLogger(__name__)

GOAL_INSTRUMENTS = ("OBIETTIVO_STUDIO", "OBIETTIVO_DOCENZA")
MAX_TEXT = 1500
MAX_TITLE = 160
MAX_ITEMS = 6

_BLOCK_NAME = "goal"
_BLOCK_RE = re.compile(r"```goal[ \t]*\r?\n(.*?)```", re.DOTALL | re.IGNORECASE)
_OPEN_BLOCK_RE = re.compile(r"```goal\b[^\n]*(?:\n|$)", re.IGNORECASE)
_PARTIAL_FENCE_RE = re.compile(r"(?:^|\n)`{1,3}([A-Za-z]*)[ \t]*$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

DIRECTIVE = (
    "[GOAL DRAFT] After the visible summary and before the final marker line, append one "
    "private block that the person never sees. It pre-fills a personal-goal draft, which they "
    "review before saving. Use only what the person actually said or agreed in this path:\n"
    "```goal\n"
    '{"title": "", "motivation": "", "criteria": "", "reflection": "", '
    '"review_date": ""}\n'
    "```\n"
    "Keys: title = the objective in one sentence as the person agreed it ('I want to be able "
    "to...'), at most 160 characters; motivation = the starting area and why the objective "
    "matters to the person; criteria = how success is seen and measured, including the proof "
    "they chose; reflection = the first steps and the if-then plan as agreed; review_date = "
    "YYYY-MM-DD only if the person gave a day, otherwise empty. Write the values in the "
    "language of the conversation. Leave a value empty when the person did not say it. Never "
    "mention the block to the person."
)


def is_goal_instrument(questionnaire_type: str | None) -> bool:
    return (questionnaire_type or "") in GOAL_INSTRUMENTS


def strip_for_display(text: str) -> str:
    """Nasconde il blocco completo, aperto o ancora in streaming."""
    if not text or "`" not in text:
        return text
    cleaned = _BLOCK_RE.sub("", text)
    open_match = _OPEN_BLOCK_RE.search(cleaned)
    if open_match:
        cleaned = cleaned[: open_match.start()]
    partial = _PARTIAL_FENCE_RE.search(cleaned)
    if partial and _BLOCK_NAME.startswith(partial.group(1).lower()):
        cleaned = cleaned[: partial.start()]
    return cleaned.rstrip() if cleaned != text else text


def extract(text: str) -> tuple[str, dict | None]:
    """Ritorna (testo senza blocco, bozza dell'obiettivo o None)."""
    if not text:
        return "", None
    payloads = [match.group(1) for match in _BLOCK_RE.finditer(text)]
    cleaned = _BLOCK_RE.sub("", text)
    open_match = _OPEN_BLOCK_RE.search(cleaned)
    if open_match:
        # Blocco troncato a fine risposta: si legge solo se il JSON e' intero.
        payloads.append(cleaned[open_match.end():])
        cleaned = cleaned[: open_match.start()]
    if payloads:
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    for raw in payloads:
        try:
            data = json.loads(raw.strip())
        except ValueError:
            continue
        if isinstance(data, dict):
            return cleaned, _draft(data)
    if payloads:
        logger.info("Blocco obiettivo illeggibile: nessuna bozza proposta.")
    return cleaned, None


def _draft(data: dict) -> dict:
    date = _text(data.get("review_date"))
    return {
        "title": _text(data.get("title"), MAX_TITLE),
        "motivation": _text(data.get("motivation")),
        "criteria": _text(data.get("criteria")),
        "reflection": _text(data.get("reflection")),
        "review_date": date if _DATE_RE.match(date) else "",
    }


def _text(value, limit: int = MAX_TEXT) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""
