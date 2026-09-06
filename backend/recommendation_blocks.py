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

import hashlib
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
_JSON_BLOCK_RE = re.compile(r"```json[ \t]*\r?\n(.*?)```", re.DOTALL | re.IGNORECASE)
_JSON_OPEN_RE = re.compile(r"```json[ \t]*\r?\n", re.IGNORECASE)


def _private_json(raw: str) -> bool:
    try:
        data = json.loads(raw)
    except ValueError:
        return False
    return bool(isinstance(data, dict) and data and set(data) <= {"reading", "strategy", "notes"}
                and ("notes" in data or {"reading", "strategy"} <= set(data))
                and all(isinstance(value, list) for value in data.values()))



def build_directive(
    readings: Mapping[str, str], strategies: Mapping[str, str], *, idea: bool = False,
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
    directive = "\n".join(lines)
    if idea:
        directive = directive.replace("at the very end of the message", "after the visible reply and before the final idea patch")
    return directive


def apply_directive(
    system_prompt: str, readings: Mapping[str, str], strategies: Mapping[str, str], *, idea: bool = False,
) -> str:
    directive = build_directive(readings, strategies, idea=idea)
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
    # Some models label private metadata as JSON. Buffer an unfinished JSON
    # fence until its shape is known; ordinary completed code is preserved.
    for match in _JSON_OPEN_RE.finditer(cleaned):
        if "```" not in cleaned[match.end():]:
            return cleaned[:match.start()].rstrip()
    trailing_fence = re.search(r'(?:^|\n)`{1,3}$', cleaned)
    if trailing_fence and cleaned[:trailing_fence.start()].count('```') % 2 == 0:
        return re.sub(r'(?:^|\n)`{1,3}$', '', cleaned).rstrip()
    partial = _PARTIAL_FENCE_RE.search(cleaned)
    if partial and any(name.startswith(partial.group(1).lower()) for name in (_BLOCK_NAME, "json")):
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

    def _take_json(match: re.Match) -> str:
        if _private_json(match.group(1)):
            payloads.append(match.group(1))
            return ""
        return match.group(0)

    cleaned = BLOCK_RE.sub(_take, text)
    return _JSON_BLOCK_RE.sub(_take_json, cleaned), payloads


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


def notes_directive(*, advice_allowed: bool, idea: bool = False) -> str:
    """Log concrete proposals and reflective questions without certifying them."""
    position = "before the final idea patch" if idea else "at the very end"
    return (
        "\n\n[SESSION NOTES] In the same private ```recommendations JSON block "
        "(create it if absent), add a notes array. Each entry has kind (question or advice) "
        "and text: copy ONE complete sentence verbatim from your visible reply, including "
        "punctuation. At most one open reflective question addressed to the student and "
        "one concrete general suggestion actually proposed in this turn. Do not log "
        "rhetorical questions, examples, rejected proposals, books or certified strategies "
        "again as notes. These notes are not certified strategies and never authorize "
        "advice that the current step forbids. Do not invent additional content to fill "
        "the array. Previously logged notes remain available: do not propose the same "
        "thing in other words; revisit it only on request or to check its outcome. "
        "Never close a question yourself: the student marks it closed or reopens it. "
        + ("General advice notes are allowed within this turn's existing advice limit. "
           if advice_allowed else "This turn allows question notes only, no advice notes. ")
        + 'Example shape: {"reading": [], "strategy": [], "notes": '
        '[{"kind": "question", "text": "exact visible question?"}]}. '
        + f"Use the exact fence label recommendations, never json. Write only one recommendations block {position}; never expose it in prose."
    )


def extract_notes(raw: str, visible: str, *, advice_allowed: bool) -> list[dict]:
    """Accept only declared sentences that actually survived in the visible reply."""
    _, payloads = _remove_blocks(raw)
    declared = _first_valid(payloads) or {}
    values = declared.get("notes")
    if not isinstance(values, list):
        return []
    normalize = lambda text: " ".join(re.findall(r"\w+", text.casefold()))
    visible_words = " " + normalize(visible) + " "
    result, kinds = [], set()
    for item in values:
        if not isinstance(item, dict):
            continue
        kind, text = item.get("kind"), item.get("text")
        if kind not in ("question", "advice") or kind in kinds:
            continue
        if kind == "advice" and not advice_allowed:
            continue
        if not isinstance(text, str) or not 8 <= len(text.strip()) <= 600:
            continue
        text = text.strip()
        words = normalize(text)
        if not words or " " + words + " " not in visible_words:
            continue
        if kind == "question" and not text.endswith("?"):
            continue
        slug = "note-" + hashlib.sha256((kind + ":" + words).encode()).hexdigest()[:24]
        result.append({"slug": slug, "name": text, "kind": kind})
        kinds.add(kind)
    return result
