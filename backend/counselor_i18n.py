"""Traduzione automatica delle descrizioni dei counselor.

La descrizione "sorgente" resta in italiano nel campo `Counselor.description`.
Le traduzioni nelle altre lingue vivono nel campo JSON `Counselor.description_i18n`
come mappa {lang: testo}. La generazione e' best-effort via Ollama (modello
configurabile, default gemma): se Ollama non e' raggiungibile la chiamata
fallisce in silenzio e la UI fa fallback all'italiano.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from typing import Dict, List, Optional

import httpx
from sqlalchemy.orm import Session

from . import models, database

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

DEFAULT_MODEL = "gemma4:e4b"


def _ollama_base(db: Session) -> str:
    env = os.environ.get("OLLAMA_BASE_URL")
    if env:
        return env.rstrip("/")
    row = db.query(models.Config).filter(models.Config.key == "ollama_ip").first()
    if row and row.value:
        return str(row.value).rstrip("/")
    return "http://localhost:11434"


def _model(db: Session) -> str:
    env = os.environ.get("COUNSELOR_TRANSLATE_MODEL")
    if env:
        return env
    row = db.query(models.Config).filter(models.Config.key == "counselor_translate_model").first()
    if row and row.value:
        return str(row.value)
    return DEFAULT_MODEL


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


def generate_translations(base_url: str, model: str, text: str) -> Dict[str, str]:
    """Traduce `text` (italiano) in tutte le TARGET_LANGS con una sola chiamata Ollama.

    Ritorna {lang: testo}. Solleva eccezione se la chiamata fallisce: il chiamante
    deve gestirla (best-effort).
    """
    targets = ", ".join(f"{code} = {LANG_NAMES[code]}" for code in TARGET_LANGS)
    system = (
        "You are a professional translator for a counseling/education web app. "
        "Translate the given Italian sentence into the requested languages. "
        "Return ONLY a JSON object whose keys are the language codes and whose "
        "values are the translations. Keep it natural and concise; do not add "
        "quotes, notes or extra text."
    )
    user = (
        f"Languages (code = name): {targets}.\n"
        f"Italian text to translate:\n{text}\n\n"
        f'Return JSON like {{"en": "...", "es": "...", "fr": "...", "de": "...", "sv": "..."}}.'
    )
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "stream": False,
        "format": "json",
        "keep_alive": "5m",
        "think": False,
        "options": {"temperature": 0.2},
    }
    resp = httpx.post(
        f"{base_url}/api/chat",
        json=payload,
        timeout=httpx.Timeout(180.0, connect=4.0),
    )
    resp.raise_for_status()
    content = resp.json().get("message", {}).get("content", "") or "{}"
    data = json.loads(content)
    return {code: str(data[code]).strip() for code in TARGET_LANGS if data.get(code)}


def _needs_translation(counselor: models.Counselor) -> bool:
    if not (counselor.description or "").strip():
        return False
    i18n = counselor.description_i18n or {}
    if not isinstance(i18n, dict):
        return True
    return any(not i18n.get(code) for code in TARGET_LANGS)


def translate_counselor_sync(db: Session, counselor_id: int, force: bool = False) -> None:
    """Genera/aggiorna le traduzioni di un counselor. Best-effort: logga e ignora errori."""
    counselor = db.query(models.Counselor).filter(models.Counselor.id == counselor_id).first()
    if not counselor or not (counselor.description or "").strip():
        return
    if not force and not _needs_translation(counselor):
        return
    try:
        translations = generate_translations(_ollama_base(db), _model(db), counselor.description.strip())
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
            rows = db.query(models.Counselor).all()
            pending = [c.id for c in rows if _needs_translation(c)]
            for cid in pending:
                translate_counselor_sync(db, cid)
        except Exception as e:  # noqa: BLE001
            logger.warning("Counselor translation backfill failed: %s", e)
        finally:
            db.close()

    threading.Thread(target=_run, daemon=True).start()
