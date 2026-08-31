"""Sintesi finale dello strumento Idea: la descrizione a parole della mappa,
riscritta dal modello in prosa chiara, nella lingua dell'interazione.

Il testo deterministico di `diagram_render.describe` resta il fallback (screen
reader, TTS, alt-text e quando la chiamata al modello non riesce). Qui si chiede
al modello di trasformarlo in una sintesi leggibile, senza aggiungere nodi o
relazioni: la mappa resta la fonte di verita'.
"""
from __future__ import annotations

import logging
import threading
from collections import OrderedDict

from sqlalchemy.orm import Session

from .ai_service import AIService, AIError
from .chat_logic import SUPPORTED_AI_LANGUAGES
from .diagram_render import DiagramSpec, describe, spec_fingerprint

logger = logging.getLogger(__name__)

# Il risultato dipende solo da (mappa, lingua): si conserva in memoria per non
# richiamare il modello due volte per la stessa mappa (es. concludi e scarichi
# subito il PDF). I testi sono corti e il contenuto e' deterministico.
_CACHE_MAX = 64
_cache: "OrderedDict[tuple[str, str], str]" = OrderedDict()
_cache_lock = threading.Lock()

_SYNTHESIS_SYSTEM_PROMPT = (
    "You turn a raw, flat description of a student's idea map into a clear, "
    "short synthesis. The map is the outcome of a counselling chat that brought "
    "an idea into focus; every item carries an argumentative role (idea, "
    "assumption, evidence, alternative, implication, open question, constraint, "
    "step, decision, task). Rules: keep EVERY item and EVERY relation present in "
    "the raw text; do not invent content, names, scores or links; write in short "
    "natural sentences, not a list; mention a role only when it clarifies; keep "
    "the informal second-person register. Answer ONLY in {lang}; output ONLY the "
    "rewritten synthesis, with no heading, no preamble and no surrounding quotes."
)


def _lang_name(lang: str) -> str:
    """Nome stabile della lingua per il prompt; le lingue non note ricadono sull'italiano."""
    code = (lang or "it").lower()[:2]
    return SUPPORTED_AI_LANGUAGES.get(code, SUPPORTED_AI_LANGUAGES["it"])[0]


def synthesis_for(db: Session, spec: DiagramSpec, lang: str) -> str:
    """La sintesi in prosa scritta dal modello; il testo deterministico come fallback."""
    raw = describe(spec, lang)
    code = (lang or "it").lower()[:2]
    key = (spec_fingerprint(spec), code)

    with _cache_lock:
        cached = _cache.get(key)
    if cached is not None:
        return cached

    system_prompt = _SYNTHESIS_SYSTEM_PROMPT.format(lang=_lang_name(lang))
    try:
        service = AIService(db)
        text = service.get_response(raw, system_prompt, "idea-synthesis")
    except AIError as exc:
        logger.warning("Sintesi Idea non generata dal modello, fallback: %s", exc)
        return raw
    except Exception as exc:  # pragma: no cover - difesa su provider esotici
        logger.warning("Sintesi Idea non generata, fallback: %s", exc)
        return raw

    cleaned = (text or "").strip().strip('"').strip()
    if not cleaned:
        return raw

    with _cache_lock:
        _cache.pop(key, None)
        _cache[key] = cleaned
        while len(_cache) > _CACHE_MAX:
            _cache.popitem(last=False)
    return cleaned
