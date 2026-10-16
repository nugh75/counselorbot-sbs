"""Traduzione automatica delle descrizioni dei counselor.

La descrizione "sorgente" resta in italiano nel campo `Counselor.description`.
Le traduzioni nelle altre lingue vivono nel campo JSON `Counselor.description_i18n`
come mappa {lang: testo}. La generazione e' best-effort attraverso il provider AI
attivo (o il preset `translation_provider`), non piu' cablata su Ollama: se il
provider non e' raggiungibile la chiamata fallisce in silenzio e la UI fa
fallback all'italiano.
"""
from __future__ import annotations

import logging
import os
import threading
from typing import Callable, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from . import models, database
from .translation_provider import resolve_target, translate_payload

logger = logging.getLogger(__name__)

# Lingue di destinazione (l'italiano e' la sorgente, non si traduce).
TARGET_LANGS: List[str] = ["en", "es", "fr", "de", "sv"]
LANG_NAMES = {
    "en": "English",
    "es": "Spanish (Espanol)",
    "fr": "French (Francais)",
    "de": "German (Deutsch)",
    "sv": "Swedish (Svenska)",
}

# Translator: (testo italiano) -> {lingua: traduzione}
Translator = Callable[[str], Dict[str, str]]


def localized_description(counselor: models.Counselor, lang: Optional[str]) -> Optional[str]:
    """Descrizione nella lingua richiesta, con fallback all'italiano (`description`)."""
    base = counselor.description
    if not lang or lang == "it":
        return base
    i18n = counselor.description_i18n or {}
    if isinstance(i18n, dict):
        val = i18n.get(lang)
        if val:
            return val
    return base


def localized_tagline(counselor: models.Counselor, lang: Optional[str]) -> Optional[str]:
    """Frase distintiva nella lingua richiesta, con fallback all'italiano o al primo valore disponibile."""
    i18n = counselor.tagline_i18n
    if not i18n:
        return None
    if isinstance(i18n, str):
        return i18n
    if isinstance(i18n, dict):
        if lang and i18n.get(lang):
            return i18n[lang]
        if i18n.get("it"):
            return i18n["it"]
        for val in i18n.values():
            if val:
                return str(val)
    return None


def build_description_prompt(
    text: str, context: str = "", targets: Optional[List[str]] = None
) -> Tuple[str, str]:
    """Costruisce (system, user) per tradurre un testo italiano nelle lingue date.

    Un unico prompt chiede tutte le lingue in una risposta JSON: e' il formato
    che il traduttore e i test si aspettano.
    """
    langs = list(targets or TARGET_LANGS)
    targets_desc = ", ".join(f"{code} = {LANG_NAMES.get(code, code)}" for code in langs)
    system = (
        "You are a professional translator for a counseling/education web app. "
        "Translate the given Italian sentence into the requested languages. "
        # L'italiano di questo catalogo usa l'infinito come istruzione ("Collegare
        # i concetti...") e la terza persona per descrivere un'opera ("Mostra il
        # costo..."). Senza questa riga il modello rendeva entrambi all'imperativo,
        # e in svedese una descrizione diventava un ordine.
        "Preserve the grammatical mood of the source: an Italian infinitive used "
        "as an instruction stays an instruction, and a third-person sentence "
        "describing a work stays a description — never turn one into a command. "
        "Return ONLY a JSON object whose keys are the language codes and whose "
        "values are the translations. Keep it natural and concise; do not add "
        "quotes, notes or extra text."
    )
    # Una frase italiana senza soggetto ("Mostra la fatica fisica") e' ambigua
    # fra terza persona e imperativo, e ogni modello provato sceglieva
    # l'imperativo. La regola generale sopra non basta: serve dire di che cosa
    # parla il testo. Il chiamante lo sa, il traduttore no.
    if context:
        system = f"{system} CONTEXT: {context}"
    example = ", ".join(f'"{code}": "..."' for code in langs)
    user = (
        f"Languages (code = name): {targets_desc}.\n"
        f"Italian text to translate:\n{text}\n\n"
        f"Return JSON like {{{example}}}."
    )
    return system, user


def configured_translator(
    db: Session, context: str = "", targets: Optional[List[str]] = None
) -> Tuple[Translator, str]:
    """Traduttore vero (provider AI configurato) piu' l'etichetta di provenienza."""
    target = resolve_target(db)
    langs = list(targets or TARGET_LANGS)

    def translate(text: str) -> Dict[str, str]:
        system, user = build_description_prompt(text, context, langs)
        return translate_payload(target, system, user, langs)

    return translate, target.label


def generate_translations(
    db: Session, text: str, context: str = ""
) -> Dict[str, str]:
    """Traduce `text` in tutte le TARGET_LANGS con una sola chiamata del provider.

    Ritorna {lang: testo}. Solleva eccezione se la chiamata fallisce: il chiamante
    deve gestirla (best-effort).
    """
    translate, _label = configured_translator(db, context)
    return translate(text)


def _needs_translation(counselor: models.Counselor) -> bool:
    if not (counselor.description or "").strip():
        return False
    i18n = counselor.description_i18n or {}
    if not isinstance(i18n, dict):
        return True
    return any(not i18n.get(code) for code in TARGET_LANGS)


def translate_counselor_sync(db: Session, counselor_id: int, force: bool = False) -> None:
    """Genera/aggiorna le traduzioni di un counselor. Best-effort: logga e ignora errori."""
    counselor = db.query(models.Counselor).filter(models.Counselor.owner_username.is_(None)).filter(models.Counselor.id == counselor_id).first()
    if not counselor or not (counselor.description or "").strip():
        return
    if not force and not _needs_translation(counselor):
        return
    try:
        translations = generate_translations(db, counselor.description.strip())
    except Exception as e:  # noqa: BLE001 - best-effort
        logger.warning("Counselor %s translation failed: %s", counselor_id, e)
        return
    if not translations:
        return
    merged = dict(counselor.description_i18n or {})
    merged.update(translations)
    counselor.description_i18n = merged
    db.commit()
    logger.info("Counselor %s translated -> %s", counselor_id, list(translations.keys()))


def _disabled() -> bool:
    return os.environ.get("COUNSELOR_TRANSLATE_DISABLED", "").lower() in ("1", "true", "yes")


def translate_counselor_async(counselor_id: int, force: bool = False) -> None:
    """Avvia la traduzione in un thread con una propria sessione DB (non blocca la request)."""
    if _disabled():
        return

    def _run() -> None:
        try:
            db = database.SessionLocal()
            try:
                translate_counselor_sync(db, counselor_id, force=force)
            finally:
                db.close()
        except Exception as e:  # noqa: BLE001 - best-effort, non deve mai propagare
            logger.warning("Counselor %s async translation failed: %s", counselor_id, e)

    threading.Thread(target=_run, daemon=True).start()


def backfill_async() -> None:
    """Backfill di tutti i counselor con traduzioni mancanti (background, best-effort)."""
    if _disabled():
        return

    def _run() -> None:
        db = database.SessionLocal()
        try:
            rows = db.query(models.Counselor).filter(models.Counselor.owner_username.is_(None)).all()
            pending = [c.id for c in rows if _needs_translation(c)]
            for cid in pending:
                translate_counselor_sync(db, cid)
        except Exception as e:  # noqa: BLE001
            logger.warning("Counselor translation backfill failed: %s", e)
        finally:
            db.close()

    threading.Thread(target=_run, daemon=True).start()
