"""Traduzione dei contenuti certificati (strategie e letture) nelle sei lingue.

La sorgente e' l'italiano. Le traduzioni arrivano da Ollama e nascono
`translated`, mai `certified`: una macchina propone, l'admin certifica. Lo stato
per lingua vive nel registro `content_language_versions`, non nella riga: una
strategia certificata in italiano non e' certificata in tedesco solo perche' il
tedesco esiste.

Il traduttore e' un parametro, non una dipendenza fissa: i test lo sostituiscono
e non toccano la rete.
"""
from __future__ import annotations

import logging
from typing import Callable, Dict, Optional

from sqlalchemy.orm import Session

from . import models
from .content_version_service import get_version, upsert_version
from .counselor_i18n import TARGET_LANGS, _model, _ollama_base, generate_translations
from .i18n_fields import merged_i18n

logger = logging.getLogger(__name__)

# Le lingue di destinazione: le sei dell'app meno l'italiano, che e' la sorgente.
TOOL_TARGET_LANGS = tuple(TARGET_LANGS)

Translator = Callable[[str], Dict[str, str]]

_STRATEGY_FIELDS = ("name", "recommended_when", "description")
_READING_FIELDS = ("why", "summary", "synopsis")


def ollama_translator(db: Session) -> tuple[Translator, str]:
    """Traduttore vero, piu' l'etichetta del modello da registrare come provenienza."""
    base_url = _ollama_base(db)
    model = _model(db)

    def translate(text: str) -> Dict[str, str]:
        return generate_translations(base_url, model, text)

    return translate, model


def _missing_langs(current: Dict[str, str], force: bool) -> list[str]:
    if force:
        return list(TOOL_TARGET_LANGS)
    return [lang for lang in TOOL_TARGET_LANGS if not (current.get(lang) or "").strip()]


def _register(db: Session, content_type: str, key: str, langs: list[str], model_label: str) -> None:
    """Segna le lingue come `translated`, senza mai retrocedere una gia' certificata.

    Una lingua rivista e certificata da una persona non torna indietro perche' lo
    script e' passato di nuovo.
    """
    for lang in langs:
        existing = get_version(db, content_type, key, lang)
        if existing and existing.status == "certified":
            continue
        upsert_version(
            db, content_type, key, lang,
            status="translated", source=f"llm:{model_label}",
            notes="traduzione automatica, da rivedere",
        )


def translate_strategies(
    db: Session,
    *,
    translate: Optional[Translator] = None,
    model_label: str = "ollama",
    force: bool = False,
    limit: Optional[int] = None,
) -> int:
    """Traduce le strategie certificate dall'italiano. Ritorna le righe toccate."""
    if translate is None:
        translate, model_label = ollama_translator(db)

    touched = 0
    rows = db.query(models.CertifiedStrategy).order_by(models.CertifiedStrategy.id).all()
    for row in rows:
        if limit is not None and touched >= limit:
            break
        changed_langs: set[str] = set()
        for field in _STRATEGY_FIELDS:
            source = (getattr(row, f"{field}_it", None) or "").strip()
            if not source:
                continue
            current = merged_i18n(row, field)
            # La sorgente italiana entra nel JSON: senza, il lettore dovrebbe
            # ripiegare sulla colonna vecchia proprio per la lingua sorgente.
            current.setdefault("it", source)
            missing = _missing_langs(current, force)
            if missing:
                produced = translate(source)
                for lang in missing:
                    value = (produced.get(lang) or "").strip()
                    if value:
                        current[lang] = value
                        changed_langs.add(lang)
            setattr(row, f"{field}_i18n", current)
        if changed_langs:
            _register(db, "certified_strategy", row.slug, sorted(changed_langs), model_label)
            touched += 1
    db.commit()
    if touched:
        logger.info("Tradotte %d strategie certificate", touched)
    return touched


def translate_readings(
    db: Session,
    *,
    translate: Optional[Translator] = None,
    model_label: str = "ollama",
    force: bool = False,
    limit: Optional[int] = None,
) -> int:
    """Completa le lingue mancanti delle letture certificate. Ritorna le righe toccate.

    I campi sono gia' JSON: qui si riempiono solo le lingue vuote, e una lingua
    scritta da una persona non viene sovrascritta se non con `force`.
    """
    if translate is None:
        translate, model_label = ollama_translator(db)

    touched = 0
    rows = db.query(models.CertifiedReading).order_by(models.CertifiedReading.id).all()
    for row in rows:
        if limit is not None and touched >= limit:
            break
        changed_langs: set[str] = set()
        for field in _READING_FIELDS:
            current = dict(getattr(row, f"{field}_i18n", None) or {})
            source = (current.get("it") or "").strip()
            if not source:
                continue
            missing = _missing_langs(current, force)
            if missing:
                produced = translate(source)
                for lang in missing:
                    value = (produced.get(lang) or "").strip()
                    if value:
                        current[lang] = value
                        changed_langs.add(lang)
                setattr(row, f"{field}_i18n", current)
        if changed_langs:
            _register(db, "certified_reading", row.slug, sorted(changed_langs), model_label)
            touched += 1
    db.commit()
    if touched:
        logger.info("Tradotte %d letture certificate", touched)
    return touched
