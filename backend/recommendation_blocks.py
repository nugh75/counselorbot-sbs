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
from typing import Iterable, Mapping

logger = logging.getLogger(__name__)

# I blocchi completi vengono estratti; quelli parziali sono nascosti allo studente.
BLOCK_RE = re.compile(r"```recommendations[ \t]*\r?\n(.*?)```", re.DOTALL | re.IGNORECASE)
_OPEN_BLOCK_RE = re.compile(r"```recommendations\b[^\n]*(?:\n|$)", re.IGNORECASE)
# Fence ancora in arrivo ("```recomm"): il nome a meta' non deve lampeggiare
# nella risposta visibile mentre lo stream lo compone.
_PARTIAL_FENCE_RE = re.compile(r"(?:^|\n)`{1,3}([A-Za-z]+)[ \t]*$")
_BLOCK_NAME = "recommendations"
_JSON_BLOCK_RE = re.compile(r"```json[ \t]*\r?\n(.*?)```", re.DOTALL | re.IGNORECASE)
_TAG_BLOCK_RE = re.compile(r"<recommendations(?:\s[^>]*)?>(.*?)</recommendations\s*>", re.DOTALL | re.IGNORECASE)
_TAG_OPEN_RE = re.compile(r"<recommendations(?:\s[^>]*)?>", re.IGNORECASE)
_PARTIAL_TAG_RE = re.compile(r"(?:^|\n)<([A-Za-z]*)$")
_JSON_OPEN_RE = re.compile(r"```json[ \t]*\r?\n", re.IGNORECASE)
# Gemini 2.5 Flash, apertura di passo QPCC: il blocco arriva come JSON nudo o in
# un recinto senza nome, anche in testa alla risposta.
_BARE_OPEN_RE = re.compile(r'(?:```[ \t]*\r?\n[ \t]*)?\{(?=\s*")')
_BARE_CLOSE_RE = re.compile(r"\s*```")
_PARTIAL_BARE_RE = re.compile(r'(?:```[ \t]*\r?\n[ \t]*)?(?:\{\s*(?:"(\w*)("?))?)?')
_PRIVATE_KEYS = ("recommendations", "reading", "strategy", "notes")
# Alcuni modelli (Gemini 2.5 Flash, turni di continuazione) avvolgono la
# risposta in {"answer": ..., "recommendations": ...}, spesso dopo lo stesso
# testo in prosa e senza recinto: l'answer e' la risposta visibile.
_ENVELOPE_RE = re.compile(r'(?:```(?:json)?[ \t]*\r?\n?)?\{\s*"answer"\s*:\s*"')
_PARTIAL_ENVELOPE_RE = re.compile(r'\{\s*(?:"(?:a(?:n(?:s(?:w(?:e(?:r(?:"\s*:?\s*)?)?)?)?)?)?)?)?$')


def _unwrap(data):
    """Toglie l'involucro {"recommendations": ...}; una lista di note li' dentro
    (forma prodotta da alcuni modelli) vale come {"notes": [...]}."""
    if isinstance(data, dict) and set(data) == {"recommendations"}:
        data = data["recommendations"]
        if isinstance(data, dict) and "kind" in data:
            data = [data]
        # Anche la lista vuota: {"recommendations": []} e' il blocco privato vuoto.
        if isinstance(data, list) and all(isinstance(item, dict) and "kind" in item for item in data):
            data = {"notes": data}
    return data


def _private_json(raw: str) -> bool:
    try:
        data = json.loads(raw)
    except ValueError:
        return False
    return _private_data(data)


def _private_data(data) -> bool:
    data = _unwrap(data)
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
    if not directive or "[RECOMMENDATION LOG]" in system_prompt or directive.strip() in system_prompt:
        return system_prompt
    return f"{system_prompt.rstrip()}\n\n{directive}"


def strip_for_display(text: str) -> str:
    """Nasconde il blocco completo, aperto o ancora in streaming."""
    if not text:
        return text
    cleaned, payloads = _remove_blocks(text, final=False)
    if payloads:
        cleaned = cleaned.strip()
    open_match = min((match for pattern in (_OPEN_BLOCK_RE, _TAG_OPEN_RE)
                      if (match := pattern.search(cleaned))), key=lambda match: match.start(), default=None)
    if open_match:
        return cleaned[: open_match.start()].rstrip()
    # Some models label private metadata as JSON. Buffer an unfinished JSON
    # fence until its shape is known; ordinary completed code is preserved.
    for match in _JSON_OPEN_RE.finditer(cleaned):
        if "```" not in cleaned[match.end():]:
            return cleaned[:match.start()].rstrip()
    partial_bare = _partial_bare(cleaned)
    if partial_bare is not None:
        return cleaned[:partial_bare].rstrip()
    trailing_fence = re.search(r'(?:^|\n)`{1,3}$', cleaned)
    if trailing_fence and cleaned[:trailing_fence.start()].count('```') % 2 == 0:
        return re.sub(r'(?:^|\n)`{1,3}$', '', cleaned).rstrip()
    partial = _PARTIAL_FENCE_RE.search(cleaned)
    if partial and any(name.startswith(partial.group(1).lower()) for name in (_BLOCK_NAME, "json")):
        return cleaned[: partial.start()].rstrip()
    partial_tag = _PARTIAL_TAG_RE.search(cleaned)
    if partial_tag and "recommendations".startswith(partial_tag.group(1).lower()):
        return cleaned[:partial_tag.start()].rstrip()
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

    cleaned, payloads = _remove_blocks(text, final=True)
    open_match = min((match for pattern in (_OPEN_BLOCK_RE, _TAG_OPEN_RE)
                      if (match := pattern.search(cleaned))), key=lambda match: match.start(), default=None)
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


def _json_string_prefix(text: str, start: int) -> str:
    """Decodifica la stringa JSON che parte da `start`, anche se ancora troncata."""
    end, escaped = start, False
    while end < len(text) and (escaped or text[end] != '"'):
        escaped = not escaped and text[end] == "\\"
        end += 1
    raw = text[start:end]
    for cut in range(len(raw), max(len(raw) - 6, 0) - 1, -1):
        try:
            return json.loads(f'"{raw[:cut]}"')
        except ValueError:
            continue
    return ""


def _envelope_payload(value) -> str | None:
    """Raccomandazioni dell'involucro nella forma del blocco privato."""
    if isinstance(value, dict):
        return json.dumps(value)
    if not isinstance(value, list) or not value:
        return None
    # Lista senza tipo: gli id passano dalla whitelist di ciascun catalogo.
    ids = [item if isinstance(item, str) else item.get("id") or item.get("slug")
           for item in value if isinstance(item, (str, dict))]
    ids = [slug for slug in ids if isinstance(slug, str)]
    return json.dumps({"reading": ids, "strategy": ids})


def _unwrap_envelope(text: str, *, final: bool) -> tuple[str, list[str]]:
    """Sostituisce l'involucro {"answer": ...} con la sua answer, senza duplicare il testo."""
    from .chat_continuation import merge_continuation

    match = _ENVELOPE_RE.search(text)
    if not match:
        partial = None if final else _PARTIAL_ENVELOPE_RE.search(text)
        return (text[:partial.start()].rstrip() if partial else text), []
    prefix = text[:match.start()]
    brace = text.index("{", match.start())
    try:
        data, end = json.JSONDecoder().raw_decode(text, brace)
    except ValueError:
        data = None
    if isinstance(data, dict) and isinstance(data.get("answer"), str):
        answer, rest = data["answer"], re.sub(r"^\s*```", "", text[end:])
        payload = _envelope_payload(data.get("recommendations"))
    else:
        answer, rest, payload = _json_string_prefix(text, match.end()), "", None
    head = prefix.rstrip()
    if not head or answer.startswith(head):
        visible = answer if final or len(answer) >= len(head) else head
    elif head.startswith(answer.rstrip()):
        visible = head
    else:
        visible = merge_continuation(prefix, answer, final=final)
    return visible + rest, [payload] if payload else []


def _remove_blocks(text: str, *, final: bool = True) -> tuple[str, list[str]]:
    """Toglie i blocchi chiusi e restituisce il loro contenuto grezzo."""
    text, envelope = _unwrap_envelope(text, final=final)
    payloads: list[str] = []

    def _take(match: re.Match) -> str:
        payloads.append(match.group(1))
        return ""

    def _take_json(match: re.Match) -> str:
        if _private_json(match.group(1)):
            payloads.append(match.group(1))
            return ""
        return match.group(0)

    cleaned = _TAG_BLOCK_RE.sub(_take, BLOCK_RE.sub(_take, text))
    cleaned = _remove_bare(_JSON_BLOCK_RE.sub(_take_json, cleaned), payloads)
    return cleaned, payloads + envelope


def _remove_bare(text: str, payloads: list[str]) -> str:
    """Toglie il JSON privato nudo o in un recinto senza nome; il resto resta."""
    parts, pos = [], 0
    for match in _BARE_OPEN_RE.finditer(text):
        if match.start() < pos:
            continue
        brace = match.end() - 1
        try:
            data, end = json.JSONDecoder().raw_decode(text, brace)
        except ValueError:
            continue
        if not _private_data(data):
            continue
        if match.group(0).startswith("```") and (close := _BARE_CLOSE_RE.match(text, end)):
            end = close.end()
        payloads.append(text[brace:end])
        parts.append(text[pos:match.start()])
        pos = end
    return "".join(parts) + text[pos:]


def _partial_bare(text: str) -> int | None:
    """Inizio di un JSON privato nudo ancora in arrivo, da non mostrare."""
    for match in _PARTIAL_BARE_RE.finditer(text):
        if not match.group(0):
            continue
        key, closed = match.group(1), match.group(2)
        fenced = match.group(0).startswith("```")
        if match.end() == len(text):
            if "{" not in match.group(0):
                # Recinto senza nome appena aperto: si aspetta di vedere cosa contiene.
                if fenced and text[:match.start()].count("```") % 2 == 0:
                    return match.start()
                continue
            if not closed and any(name.startswith(key or "") for name in _PRIVATE_KEYS):
                return match.start()
            if closed and key in _PRIVATE_KEYS:
                return match.start()
            continue
        if closed and key in _PRIVATE_KEYS:
            try:
                json.JSONDecoder().raw_decode(text, text.index("{", match.start()))
            except ValueError:
                return match.start()
    return None


def _first_valid(payloads: list[str]) -> dict | None:
    for raw in payloads:
        try:
            data = json.loads(raw.strip())
        except ValueError:
            continue
        if isinstance(data, dict):
            if set(data) == {"recommendations"} and _private_json(raw):
                return _unwrap(data)
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


def notes_directive(*, advice_allowed: bool, idea: bool = False, hypothesis_allowed: bool = False, example_lens: str = "A5") -> str:
    """Log concrete proposals, reflective questions and interpretive hypotheses without certifying them."""
    position = "before the final idea patch" if idea else "at the very end"
    kinds = "question, advice or hypothesis" if hypothesis_allowed else "question or advice"
    hyp_sentence = (
        " and one interpretive reading offered as an open hypothesis (with optional lens: factor code)"
        if hypothesis_allowed else ""
    )
    hyp_clause = (
        "This turn allows interpretive hypothesis notes (kind: hypothesis) offered as open readings, with optional lens (factor code). "
        if hypothesis_allowed else ""
    )
    example_notes = (
        f'[{{"kind": "hypothesis", "lens": "{example_lens}", "text": "exact visible reading"}}]'
        if hypothesis_allowed else
        '[{"kind": "question", "text": "exact visible question?"}]'
    )
    return (
        "\n\n[SESSION NOTES] In the same private ```recommendations JSON block "
        f"(create it if absent), add a notes array. Each entry has kind ({kinds}) "
        "and text: copy ONE complete sentence verbatim from your visible reply, including "
        "punctuation. At most one open reflective question addressed to the student and "
        "one concrete general suggestion actually proposed in this turn"
        + hyp_sentence
        + ". Do not log rhetorical questions, examples, rejected proposals, books or certified strategies "
        "again as notes. These notes are not certified strategies and never authorize "
        "advice that the current step forbids. Do not invent additional content to fill "
        "the array. Previously logged notes remain available: do not propose the same "
        "thing in other words; revisit it only on request or to check its outcome. "
        "Never close a question yourself: the student marks it closed or reopens it. "
        + ("General advice notes are allowed within this turn's existing advice limit. "
           if advice_allowed else "This turn allows question notes only, no advice notes. ")
        + hyp_clause
        + f'Example shape: {{"reading": [], "strategy": [], "notes": {example_notes}}}. '
        + f"Use the exact fence label recommendations, never json. Write only one recommendations block {position}; never expose it in prose."
    )


def extract_notes(
    raw: str,
    visible: str,
    *,
    advice_allowed: bool,
    hypothesis_allowed: bool = False,
    allowed_lenses: Iterable[str] | None = None,
) -> list[dict]:
    """Accept only declared sentences that actually survived in the visible reply."""
    _, payloads = _remove_blocks(raw)
    declared = _first_valid(payloads) or {}
    values = declared.get("notes")
    if not isinstance(values, list):
        return []
    normalize = lambda text: " ".join(re.findall(r"\w+", text.casefold()))
    visible_words = " " + normalize(visible) + " "
    result, kinds = [], set()
    valid_lenses = set(allowed_lenses) if allowed_lenses else None
    for item in values:
        if not isinstance(item, dict):
            continue
        kind, text = item.get("kind"), item.get("text")
        if kind not in ("question", "advice", "hypothesis") or kind in kinds:
            continue
        if kind == "advice" and not advice_allowed:
            continue
        if kind == "hypothesis" and not hypothesis_allowed:
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
        note_entry: dict = {"slug": slug, "name": text, "kind": kind}
        if kind == "hypothesis":
            lens = item.get("lens")
            if isinstance(lens, str):
                lens = lens.strip()
                if valid_lenses is None or lens in valid_lenses:
                    note_entry["lens"] = lens
        result.append(note_entry)
        kinds.add(kind)
    return result
