"""Estrazione dei diagrammi dal testo prodotto dal modello.

Il blocco resta dentro il messaggio salvato: e' la fonte di verita' del
diagramma, che viene ridisegnato a ogni lettura. Chi non puo' mostrare
immagini (TTS) riceve la descrizione a parole.
"""
from __future__ import annotations

import logging
import re

from .diagram_render import DiagramSpec, DiagramSpecError, parse_spec

logger = logging.getLogger(__name__)

# Solo i blocchi chiusi: durante lo streaming il fence aperto resta testo.
BLOCK_RE = re.compile(r"```diagram[ \t]*\r?\n(.*?)```", re.DOTALL)


def _find_object_end(text: str, start: int) -> int:
    """Trova la graffa finale di un oggetto JSON rispettando stringhe ed escape."""
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index
    return -1


def _append_text(parts: list[str | DiagramSpec], text: str) -> None:
    if not text:
        return
    if parts and isinstance(parts[-1], str):
        parts[-1] += text
    else:
        parts.append(text)


def _bare_segments(text: str) -> list[str | DiagramSpec]:
    """Riconosce gli spec JSON non recintati, come il parser della UI web."""
    parts: list[str | DiagramSpec] = []
    search_cursor = 0
    emitted_cursor = 0
    while search_cursor < len(text):
        start = text.find("{", search_cursor)
        if start < 0:
            break
        end = _find_object_end(text, start)
        if end < 0:
            break
        raw = text[start:end + 1]
        try:
            spec = parse_spec(raw)
        except DiagramSpecError:
            search_cursor = start + 1
            continue
        _append_text(parts, text[emitted_cursor:start])
        parts.append(spec)
        emitted_cursor = end + 1
        search_cursor = end + 1
    _append_text(parts, text[emitted_cursor:])
    return parts


def segments(text: str) -> list[str | DiagramSpec]:
    """Mantiene l'ordine di prosa e diagrammi, inclusi gli spec JSON senza fence."""
    if not text:
        return []
    parts: list[str | DiagramSpec] = []
    cursor = 0
    for match in BLOCK_RE.finditer(text):
        for part in _bare_segments(text[cursor:match.start()]):
            if isinstance(part, str):
                _append_text(parts, part)
            else:
                parts.append(part)
        try:
            parts.append(parse_spec(match.group(1)))
        except DiagramSpecError as exc:
            logger.info("Blocco diagramma scartato: %s", exc)
        cursor = match.end()
    for part in _bare_segments(text[cursor:]):
        if isinstance(part, str):
            _append_text(parts, part)
        else:
            parts.append(part)
    return parts


def extract(text: str) -> tuple[str, list[DiagramSpec]]:
    """Ritorna (testo senza blocchi, spec validi). Gli spec rotti spariscono."""
    if not text:
        return "", []
    parts = segments(text)
    specs = [part for part in parts if isinstance(part, DiagramSpec)]
    if not specs and "```diagram" not in text:
        return text, []
    cleaned = "".join(part for part in parts if isinstance(part, str))
    return _tidy(cleaned), specs


def strip_for_speech(text: str, lang: str = "it") -> str:
    """Rimuove i diagrammi: il TTS legge soltanto la prosa del messaggio."""
    if not text:
        return ""
    del lang  # mantenuto nel contratto per compatibilita' con i chiamanti.
    parts = segments(text)
    if not any(isinstance(part, DiagramSpec) for part in parts) and "```diagram" not in text:
        return text
    return _tidy("".join(part for part in parts if isinstance(part, str)))


def _tidy(text: str) -> str:
    """Chiude i buchi lasciati dai blocchi rimossi senza toccare il resto."""
    return re.sub(r"\n{3,}", "\n\n", text).strip()
