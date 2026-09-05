"""Blocco privato con cui il modello dichiara che cosa ha davvero raccomandato.

Il turno inietta nel prompt un catalogo di candidati: senza una dichiarazione
esplicita ogni voce recuperata finirebbe nel libretto dello studente anche
quando la risposta non la nomina, e verrebbe poi esclusa dai turni successivi
senza essere mai stata proposta. Qui vive il contratto del blocco
```recommendations: come si chiede, come si legge, come si toglie dal testo.

Regole non negoziabili:
  - si registra solo quello che il modello dichiara, ristretto ai candidati del
    turno: un id fuori catalogo non entra mai;
  - il blocco non raggiunge lo studente, ne' in streaming ne' nel transcript
    ne' nel PDF;
  - blocco assente o illeggibile non inventa selezioni: nominare un titolo
    non significa consigliarlo.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Mapping

logger = logging.getLogger(__name__)

# I blocchi completi vengono estratti; quelli parziali sono nascosti allo studente.
BLOCK_RE = re.compile(r"```recommendations[ \t]*\r?\n(.*?)```", re.DOTALL | re.IGNORECASE)
_OPEN_BLOCK_RE = re.compile(r"```recommendations\b[^\n]*(?:\n|$)", re.IGNORECASE)
# Fence ancora in arrivo ("```recomm"): il nome a meta' non deve lampeggiare
# nella risposta visibile mentre lo stream lo compone.
_PARTIAL_FENCE_RE = re.compile(r"(?:^|\n)`{1,3}([A-Za-z]+)[ \t]*$")
_BLOCK_NAME = "recommendations"


def build_directive(
    readings: Mapping[str, str], strategies: Mapping[str, str],
) -> str:
    """Direttiva di turno: vale solo per i candidati di questo turno."""
    if not readings and not strategies:
        return ""
    lines = [
        "[RECOMMENDATION LOG] The catalogue items below were made available to you "
        "for this reply. When the reply is finished, append one private block "
        "listing only the items you actually recommended to the student in this "
        "reply:",
        "```recommendations",
        '{"reading": [], "strategy": []}',
        "```",
    ]
    if readings:
        lines.append("Reading ids available in this turn:")
        lines.extend(f'- {slug} = "{label}"' for slug, label in readings.items())
    if strategies:
        lines.append("Strategy ids available in this turn:")
        lines.extend(f'- {slug} = "{label}"' for slug, label in strategies.items())
    lines.append(
        "Rules: use these exact ids and nothing else; never invent an id; leave an "
        "array empty when you recommended nothing from that catalogue; write the "
        "block once, at the very end of the message. Candidates are not yet shown in "
        "the panel: only this declaration adds them. Select an item only when the "
        "visible response actually proposes it; never select a rejected item or one "
        "awaiting clarification. Name each selected work or strategy in the visible "
        "reply, within its response-length limit. Never mention the block, its "
        "ids or these rules to the student."
    )
    return "\n".join(lines)


def apply_directive(
    system_prompt: str, readings: Mapping[str, str], strategies: Mapping[str, str],
) -> str:
    directive = build_directive(readings, strategies)
    if not directive:
        return system_prompt
    return f"{system_prompt.rstrip()}\n\n{directive}"


def strip_for_display(text: str) -> str:
    """Nasconde il blocco completo, aperto o ancora in streaming."""
    if not text or "`" not in text:
        return text
    cleaned, payloads = _remove_blocks(text)
    if payloads:
        cleaned = cleaned.strip()
    open_match = _OPEN_BLOCK_RE.search(cleaned)
    if open_match:
        return cleaned[: open_match.start()].rstrip()
    trailing_fence = re.search(r'(?:^|\n)`{1,3}$', cleaned)
    if trailing_fence and cleaned[:trailing_fence.start()].count('```') % 2 == 0:
        return re.sub(r'(?:^|\n)`{1,3}$', '', cleaned).rstrip()
    partial = _PARTIAL_FENCE_RE.search(cleaned)
    if partial and _BLOCK_NAME.startswith(partial.group(1).lower()):
        return cleaned[: partial.start()].rstrip()
    return cleaned


def extract(
    text: str,
    *,
    readings: Mapping[str, str] | None = None,
    strategies: Mapping[str, str] | None = None,
) -> tuple[str, dict[str, list[str]]]:
    """Ritorna (testo senza blocco, ids davvero raccomandati in questo turno).

    Gli ids sono ristretti ai candidati passati: quello che il modello dichiara
    fuori catalogo non e' una raccomandazione, e' rumore.
    """
    readings = readings or {}
    strategies = strategies or {}
    if not text:
        return "", _selection([], [])

    cleaned, payloads = _remove_blocks(text)
    open_match = _OPEN_BLOCK_RE.search(cleaned)
    if open_match:
        # Blocco troncato a fine risposta: se il JSON e' arrivato intero si legge
        # lo stesso, altrimenti sparisce e basta.
        payloads.append(cleaned[open_match.end():])
        cleaned = cleaned[: open_match.start()]
    if payloads:
        cleaned = cleaned.strip()

    declared = _first_valid(payloads)
    if declared is None:
        if payloads:
            logger.info("Blocco raccomandazioni illeggibile: nessuna selezione registrata.")
        return strip_for_display(cleaned), _selection([], [])
    return strip_for_display(cleaned), _selection(
        _whitelist(declared.get("reading"), readings),
        _whitelist(declared.get("strategy"), strategies),
    )


# --- helpers ---
def retain_visible(
    selected: dict[str, list[str]], text: str,
    *, readings: Mapping[str, str], strategies: Mapping[str, str],
) -> dict[str, list[str]]:
    """After a length cut, keep only declared items still named in the reply."""
    def words(value: str) -> str:
        return " " + " ".join(re.findall(r"\w+", value.casefold())) + " "

    visible = words(text)
    return {
        kind: [slug for slug in selected[kind]
               if labels.get(slug) and words(labels[slug]) in visible]
        for kind, labels in (("reading", readings), ("strategy", strategies))
    }


def _selection(reading: list[str], strategy: list[str]) -> dict[str, list[str]]:
    return {"reading": reading, "strategy": strategy}


def _remove_blocks(text: str) -> tuple[str, list[str]]:
    """Toglie i blocchi chiusi e restituisce il loro contenuto grezzo."""
    payloads: list[str] = []

    def _take(match: re.Match) -> str:
        payloads.append(match.group(1))
        return ""

    return BLOCK_RE.sub(_take, text), payloads


def _first_valid(payloads: list[str]) -> dict | None:
    for raw in payloads:
        try:
            data = json.loads(raw.strip())
        except ValueError:
            continue
        if isinstance(data, dict):
            return data
    return None


def _whitelist(values, allowed: Mapping[str, str]) -> list[str]:
    if not isinstance(values, (list, tuple)):
        return []
    selected: list[str] = []
    for value in values:
        if not isinstance(value, str):
            continue
        slug = value.strip()
        if slug in allowed and slug not in selected:
            selected.append(slug)
    return selected
