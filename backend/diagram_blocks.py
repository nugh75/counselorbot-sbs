"""Estrazione dei blocchi ```diagram dal testo prodotto dal modello.

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


def extract(text: str) -> tuple[str, list[DiagramSpec]]:
    """Ritorna (testo senza blocchi, spec validi). Gli spec rotti spariscono."""
    if not text or "```diagram" not in text:
        return text or "", []

    specs: list[DiagramSpec] = []

    def _replace(match: re.Match) -> str:
        try:
            specs.append(parse_spec(match.group(1)))
        except DiagramSpecError as exc:
            logger.info("Blocco diagramma scartato: %s", exc)
        return ""

    cleaned = BLOCK_RE.sub(_replace, text)
    return _tidy(cleaned), specs


def strip_for_speech(text: str, lang: str = "it") -> str:
    """Rimuove i diagrammi: il TTS legge soltanto la prosa del messaggio."""
    if not text or "```diagram" not in text:
        return text or ""
    del lang  # mantenuto nel contratto per compatibilita' con i chiamanti.
    return _tidy(BLOCK_RE.sub("", text))


def _tidy(text: str) -> str:
    """Chiude i buchi lasciati dai blocchi rimossi senza toccare il resto."""
    return re.sub(r"\n{3,}", "\n\n", text).strip()
