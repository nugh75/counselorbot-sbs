"""Blocco privato con cui la sintesi dell'Evento significativo precompila il libretto.

A fine percorso il modello riassume l'evento in un blocco ```booklet che la
persona non vede mai: il client lo riceve come bozza, la mostra in un modulo
modificabile e la salva nel libretto solo su conferma. Qui vive il contratto:
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

EVENT_INSTRUMENTS = ("EVENTO_STUDIO", "EVENTO_PROFESSIONALE")
ROLES = ("protagonist", "observer", "alongside")
MAX_TEXT = 1000
MAX_ITEMS = 5

_BLOCK_NAME = "booklet"
_BLOCK_RE = re.compile(r"```booklet[ \t]*\r?\n(.*?)```", re.DOTALL | re.IGNORECASE)
_OPEN_BLOCK_RE = re.compile(r"```booklet\b[^\n]*(?:\n|$)", re.IGNORECASE)
_PARTIAL_FENCE_RE = re.compile(r"(?:^|\n)`{1,3}([A-Za-z]*)[ \t]*$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

DIRECTIVE = (
    "[BOOKLET DRAFT] After the visible summary and before the final marker line, append one "
    "private block that the person never sees. It pre-fills a milestone in their Timeline, which they "
    "review before saving. Use only what the person actually said in this path:\n"
    "```booklet\n"
    '{"title": "", "event_date": "", "role": "", "context": "", "worked": [], '
    '"did_not_work": [], "reading": "", "try": "", "how_when": ""}\n'
    "```\n"
    "Keys: title = the event in a few words; event_date = YYYY-MM-DD only if the person gave a "
    "day, otherwise empty; role = protagonist, observer or alongside; context = where it "
    "happened, by role and setting, never by name; worked and did_not_work = short items; "
    "reading = the person's own reading; try = the one thing they chose to try; how_when = how "
    "and when. Write the values in the language of the conversation. Leave a value empty when "
    "the person did not say it. Never mention the block to the person."
)


def is_event_instrument(questionnaire_type: str | None) -> bool:
    return (questionnaire_type or "") in EVENT_INSTRUMENTS


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
    """Ritorna (testo senza blocco, bozza del libretto o None)."""
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
        logger.info("Blocco libretto illeggibile: nessuna bozza proposta.")
    return cleaned, None


def _draft(data: dict) -> dict:
    role = _text(data.get("role"))
    date = _text(data.get("event_date"))
    return {
        "title": _text(data.get("title")),
        "bio_date": date if _DATE_RE.match(date) else "",
        "event_role": role if role in ROLES else "",
        "bio_context": _text(data.get("context")),
        "strength": _items(data.get("worked")),
        "growth_area": _items(data.get("did_not_work")),
        "discovery": _text(data.get("reading")),
        "objective": _text(data.get("try")),
        "strategy": _text(data.get("how_when")),
    }


def _text(value) -> str:
    return value.strip()[:MAX_TEXT] if isinstance(value, str) else ""


def _items(value) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in (_text(entry) for entry in value) if item][:MAX_ITEMS]
