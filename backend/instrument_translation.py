"""Traduzione degli item, dei fattori e del nome di uno strumento.

Diverso dai tool sotto due aspetti che contano.

La **sorgente non e' l'italiano**: gli originali italiani vivono sul sito
esterno, e in-app la versione autorevole e' l'inglese. Il traduttore riceve
quindi la lingua di partenza.

Il **traguardo e' piu' basso**: una traduzione automatica arriva a `translated` e
si ferma li'. `reviewed`, `pilot` e `validated` richiedono le interviste
cognitive, il pilot e le norme, che sono lavoro di ricerca — il codice offre la
transizione, non la sostituisce
(`docs/validazione/progetto-validazione-qsa-qsar-sv-en.md`).

Una lingua e' `translated` solo se **ogni** item attivo ha testo: una lingua
mezza tradotta non e' una lingua, e dichiararla tale nasconderebbe i buchi.
"""
from __future__ import annotations

import logging
from typing import Callable, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from . import models
from .content_version_service import get_version, upsert_version
from .content_versions import INSTRUMENT_STATUSES
from .counselor_i18n import LANG_NAMES
from .i18n_fields import localized, merged_i18n
from .translation_provider import resolve_target, translate_payload

logger = logging.getLogger(__name__)

# translate(text, source_lang, wanted_langs) -> {lang: testo}
Translator = Callable[[str, str, List[str]], Dict[str, str]]

DEFAULT_SOURCE = "en"


def item_prompt(text: str, source: str, wanted: List[str]) -> Tuple[str, str]:
    """Costruisce (system, user) per tradurre un item mantenendo il costrutto misurato.

    Il principio 1 del protocollo di validazione chiede equivalenza prima della
    traduzione letterale: un item deve conservare cio' che misura e restare
    comprensibile a uno studente. Il prompt lo dice in modo esplicito, perche' un
    traduttore generico produrrebbe calchi che spostano il costrutto.
    """
    source_name = LANG_NAMES.get(source, source)
    targets = ", ".join(f"{code} = {LANG_NAMES.get(code, code)}" for code in wanted)
    system = (
        "You translate items of a validated psychological questionnaire for "
        "students. Preserve the construct the item measures, its direction "
        "(positively or negatively worded) and its register; prefer a natural "
        "school-appropriate sentence over a literal calque. Keep the same "
        "grammatical person and roughly the same length. Return ONLY a JSON "
        "object whose keys are the language codes and whose values are the "
        "translations, with no notes or quotes."
    )
    user = (
        f"Source language: {source_name}.\n"
        f"Target languages (code = name): {targets}.\n"
        f"Item to translate:\n{text}\n\n"
        f"Return JSON with exactly these keys: {', '.join(wanted)}."
    )
    return system, user


def configured_translator(db: Session) -> tuple[Translator, str]:
    """Traduttore vero (provider AI attivo o preset), piu' l'etichetta di provenienza.

    Passa da `AIService`: gli item sono testo editoriale, non dato utente.
    """
    target = resolve_target(db)

    def translate(text: str, source: str, wanted: List[str]) -> Dict[str, str]:
        system, user = item_prompt(text, source, wanted)
        return translate_payload(target, system, user, list(wanted))

    return translate, target.label


def translate_item(
    db: Session, text: str, source: str, wanted: List[str]
) -> Dict[str, str]:
    """Traduce un item con il provider configurato (helper per script e test)."""
    translate, _label = configured_translator(db)
    return translate(text, source, wanted)


def _fill(row, field: str, source: str, targets: List[str], translate: Translator,
          force: bool) -> set[str]:
    """Riempie le lingue mancanti di un campo. Ritorna le lingue effettivamente scritte."""
    current = merged_i18n(row, field)
    text = (current.get(source) or "").strip()
    if not text:
        return set()
    wanted = [lang for lang in targets if force or not (current.get(lang) or "").strip()]
    if not wanted:
        return set()
    produced = translate(text, source, wanted)
    written: set[str] = set()
    for lang in wanted:
        value = (produced.get(lang) or "").strip()
        if value:
            current[lang] = value
            written.add(lang)
    if written:
        setattr(row, f"{field}_i18n", current)
    return written


def _fill_response_labels(
    instrument: models.Instrument,
    source: str,
    targets: List[str],
    translate: Translator,
    force: bool,
) -> set[str]:
    """Traduce ogni gradino della scala senza ripiegare su un'altra lingua."""
    current = dict(instrument.response_labels or {})
    source_labels = current.get(source) or []
    if not source_labels:
        return set()
    wanted = [lang for lang in targets if force or not current.get(lang)]
    if not wanted:
        return set()

    produced: dict[str, list[str]] = {lang: [] for lang in wanted}
    for label in source_labels:
        translated = translate(str(label), source, wanted)
        for lang in wanted:
            value = (translated.get(lang) or "").strip()
            if value:
                produced[lang].append(value)

    written = {
        lang for lang, labels in produced.items()
        if len(labels) == len(source_labels)
    }
    for lang in written:
        current[lang] = produced[lang]
    if written:
        instrument.response_labels = current
    return written


def refresh_instrument_status(db: Session, code: str, locales: List[str]) -> None:
    """Ricalcola `draft`/`translated` dalla copertura degli item.

    Non tocca una lingua che ha gia' superato `translated`: da li' in poi lo
    stato lo decide una persona, e un conteggio di item non deve poter annullare
    una decisione di ricerca.
    """
    items = (
        db.query(models.QuestionnaireItem)
        .filter(
            models.QuestionnaireItem.instrument_code == code,
            models.QuestionnaireItem.active == True,
        )
        .all()
    )
    if not items:
        return
    instrument = db.query(models.Instrument).filter(models.Instrument.code == code).first()
    factors = db.query(models.Factor).filter(models.Factor.instrument_code == code).all()
    beyond = INSTRUMENT_STATUSES.index("translated")
    for locale in locales:
        existing = get_version(db, "instrument", code, locale)
        if existing and INSTRUMENT_STATUSES.index(existing.status) > beyond:
            continue
        labels = (instrument.response_labels or {}).get(locale) if instrument else None
        expected_labels = (
            instrument.response_scale_max - instrument.response_scale_min + 1
            if instrument else 0
        )
        covered = bool(
            instrument
            and localized(instrument, "name", locale)
            and labels
            and len(labels) == expected_labels
            and all(str(label).strip() for label in labels)
            and factors
            and all(localized(factor, "label", locale) for factor in factors)
            and all(localized(item, "text", locale) for item in items)
        )
        status = "translated" if covered else "draft"
        if existing and existing.status == status:
            continue
        upsert_version(db, "instrument", code, locale, status=status)


def translate_instrument(
    db: Session,
    code: str,
    *,
    targets: List[str],
    translate: Optional[Translator] = None,
    model_label: str = "ollama",
    source: str = DEFAULT_SOURCE,
    force: bool = False,
    limit: Optional[int] = None,
) -> int:
    """Traduce nome, fattori e item di uno strumento. Ritorna gli item toccati."""
    if translate is None:
        translate, model_label = configured_translator(db)

    instrument = db.query(models.Instrument).filter(models.Instrument.code == code).first()
    if not instrument:
        raise ValueError(f"Strumento sconosciuto: {code}")

    written_langs: set[str] = set()
    written_langs |= _fill(instrument, "name", source, targets, translate, force)
    written_langs |= _fill_response_labels(instrument, source, targets, translate, force)

    factors = db.query(models.Factor).filter(models.Factor.instrument_code == code).all()
    for factor in factors:
        written_langs |= _fill(factor, "label", source, targets, translate, force)

    items = (
        db.query(models.QuestionnaireItem)
        .filter(
            models.QuestionnaireItem.instrument_code == code,
            models.QuestionnaireItem.active == True,
        )
        .order_by(models.QuestionnaireItem.item_number)
        .all()
    )
    touched = 0
    for item in items:
        if limit is not None and touched >= limit:
            break
        written = _fill(item, "text", source, targets, translate, force)
        if written:
            written_langs |= written
            touched += 1
    db.commit()

    # La provenienza si registra su tutte le lingue toccate; lo stato lo decide
    # la copertura, non il fatto che il traduttore sia passato.
    for lang in sorted(written_langs):
        existing = get_version(db, "instrument", code, lang)
        if existing and INSTRUMENT_STATUSES.index(existing.status) > INSTRUMENT_STATUSES.index("translated"):
            continue
        upsert_version(
            db, "instrument", code, lang,
            status=existing.status if existing else "draft",
            source=f"llm:{model_label}",
            notes="traduzione automatica, da sottoporre a revisione di equivalenza",
        )
    refresh_instrument_status(db, code, targets)

    if touched:
        logger.info("Tradotti %d item di %s verso %s", touched, code, ",".join(targets))
    return touched
