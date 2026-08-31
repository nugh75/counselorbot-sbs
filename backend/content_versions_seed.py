"""Travaso delle colonne per lingua nei campi JSON e derivazione degli stati.

Girano all'avvio, dopo `create_all`. Entrambi idempotenti: la seconda esecuzione
non tocca nulla.
"""
from __future__ import annotations

import logging

from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session

from . import models
from .content_version_service import get_version, upsert_version
from .content_versions import APP_LOCALES
from .i18n_fields import locales_with_text, merged_i18n

logger = logging.getLogger(__name__)

# (modello, campi da travasare)
_I18N_FIELDS = [
    (models.Instrument, ("name",)),
    (models.Factor, ("label", "description")),
    (models.QuestionnaireItem, ("text",)),
    (models.CertifiedStrategy, ("name", "recommended_when", "description")),
]

# Colonne JSON da aggiungere alle tabelle che nascono con una colonna per lingua.
# `create_all` crea le tabelle mancanti ma non altera quelle esistenti, quindi
# questa lista e' l'unica cosa che porta le colonne su un database gia' popolato.
_I18N_COLUMNS = [
    ("instruments", "name_i18n"),
    ("factors", "label_i18n"),
    ("factors", "description_i18n"),
    ("questionnaire_items", "text_i18n"),
    ("certified_strategies", "name_i18n"),
    ("certified_strategies", "recommended_when_i18n"),
    ("certified_strategies", "description_i18n"),
]


def ensure_i18n_columns(engine) -> None:
    """Aggiunge le colonne JSON se mancano. Idempotente, non distruttiva.

    Vive qui e non fra le migrazioni raw-SQL di `main.py` perche' i test devono
    poter esercitare la migrazione vera invece di una sua copia.
    """
    for table, column in _I18N_COLUMNS:
        try:
            with engine.connect() as conn:
                conn.execute(sa_text(f"ALTER TABLE {table} ADD COLUMN {column} JSON"))
                conn.commit()
        except Exception as e:  # colonna gia' presente, o tabella non ancora creata
            logger.debug("i18n column skipped/failed (%s.%s): %s", table, column, e)


def backfill_i18n_columns(db: Session) -> int:
    """Copia le colonne per lingua nei campi JSON. Ritorna le righe toccate.

    Non svuota le colonne vecchie: restano leggibili finche' esistono, cosi' un
    rollback del codice non perde testi.
    """
    touched = 0
    for model, fields in _I18N_FIELDS:
        for row in db.query(model).all():
            changed = False
            for field in fields:
                if getattr(row, f"{field}_i18n", None):
                    continue  # gia' popolato: non si sovrascrive
                merged = merged_i18n(row, field)
                if merged:
                    setattr(row, f"{field}_i18n", merged)
                    changed = True
            if changed:
                touched += 1
    if touched:
        db.commit()
        logger.info("backfill i18n: %d righe travasate", touched)
    return touched


def _instrument_locales_with_items(db: Session, code: str) -> set[str]:
    items = (
        db.query(models.QuestionnaireItem)
        .filter(
            models.QuestionnaireItem.instrument_code == code,
            models.QuestionnaireItem.active == True,  # noqa: E712
        )
        .all()
    )
    found: set[str] = set()
    for item in items:
        found |= locales_with_text(item, "text")
    return found


def _validated_norm_locales(db: Session, code: str) -> set[str]:
    rows = (
        db.query(models.NormThreshold)
        .filter(
            models.NormThreshold.instrument_code == code,
            models.NormThreshold.status == "validated",
        )
        .all()
    )
    return {r.locale for r in rows}


def derive_instrument_versions(db: Session) -> int:
    """Stato iniziale di ogni (strumento, lingua), dedotto dai dati presenti.

    Nessun indovinello: una lingua senza item e' bozza; una lingua con item ma
    senza norme validate e' `pilot`, che e' esattamente il comportamento di oggi
    (somministrabile con avviso sperimentale e stanine non normate); con norme
    validate e' `validated`. Non tocca mai una riga esistente: una promozione
    decisa da un admin vale piu' di una deduzione.
    """
    created = 0
    for instrument in db.query(models.Instrument).all():
        with_items = _instrument_locales_with_items(db, instrument.code)
        with_norms = _validated_norm_locales(db, instrument.code)
        for locale in APP_LOCALES:
            if get_version(db, "instrument", instrument.code, locale) is not None:
                continue
            if locale not in with_items:
                status = "draft"
            elif locale in with_norms:
                status = "validated"
            else:
                status = "pilot"
            upsert_version(
                db, "instrument", instrument.code, locale,
                status=status, source="derived",
                notes="stato dedotto dai dati alla migrazione",
            )
            created += 1
    return created


def derive_strategy_versions(db: Session) -> int:
    """Stato iniziale di ogni (strategia, lingua).

    Una strategia gia' `certified` conserva la certificazione italiana. Ogni
    altro testo esistente nasce `translated` e richiede una certificazione
    esplicita della singola lingua; le lingue senza testo restano bozza.
    """
    created = 0
    for strategy in db.query(models.CertifiedStrategy).all():
        with_text = locales_with_text(strategy, "description") | locales_with_text(strategy, "name")
        for locale in APP_LOCALES:
            if get_version(db, "certified_strategy", strategy.slug, locale) is not None:
                continue
            if locale == "it" and locale in with_text and strategy.status == "certified":
                status = "certified"
            elif locale in with_text:
                status = "translated"
            else:
                status = "draft"
            upsert_version(
                db, "certified_strategy", strategy.slug, locale,
                status=status, source="derived",
                notes="stato dedotto dai dati alla migrazione",
            )
            created += 1
    return created


def _complete_json_locales(row, fields: tuple[str, ...], source_locale: str = "it") -> set[str]:
    """Lingue complete per tutti i campi che hanno un testo sorgente."""
    required = [
        field for field in fields
        if ((getattr(row, f"{field}_i18n", None) or {}).get(source_locale) or "").strip()
    ]
    if not required:
        return set()
    return {
        locale
        for locale in APP_LOCALES
        if all(
            ((getattr(row, f"{field}_i18n", None) or {}).get(locale) or "").strip()
            for field in required
        )
    }


def derive_reading_versions(db: Session) -> int:
    """Crea lo stato iniziale per ogni coppia (lettura, lingua)."""
    existing = {
        (row.content_key, row.locale)
        for row in db.query(models.ContentLanguageVersion).filter(
            models.ContentLanguageVersion.content_type == "certified_reading"
        ).all()
    }
    created = 0
    for reading in db.query(models.CertifiedReading).all():
        complete = _complete_json_locales(reading, ("why", "summary", "synopsis"))
        for locale in APP_LOCALES:
            if (reading.slug, locale) in existing:
                continue
            if locale in complete and reading.status == "certified":
                status = "certified"
            elif locale in complete:
                status = "translated"
            else:
                status = "draft"
            db.add(models.ContentLanguageVersion(
                content_type="certified_reading", content_key=reading.slug,
                locale=locale, status=status, source="derived",
                notes="stato dedotto dai dati alla migrazione",
            ))
            existing.add((reading.slug, locale))
            created += 1
    if created:
        db.commit()
    return created


def guided_step_question_key(questionnaire_type: str, step_id: str, sort_order: int) -> str:
    """Chiave condivisa dalle traduzioni della stessa domanda guidata."""
    return f"{questionnaire_type}::{step_id}::{sort_order}"


def derive_guided_step_question_versions(db: Session) -> int:
    """Crea sei stati per ogni domanda guidata logica gia' presente nel DB."""
    groups: dict[str, set[str]] = {}
    for row in db.query(models.GuidedStepQuestion).all():
        key = guided_step_question_key(row.questionnaire_type, row.step_id, row.sort_order)
        if (row.text or "").strip():
            groups.setdefault(key, set()).add(row.language)

    existing = {
        (row.content_key, row.locale)
        for row in db.query(models.ContentLanguageVersion).filter(
            models.ContentLanguageVersion.content_type == "guided_step_question"
        ).all()
    }
    created = 0
    for key, available in groups.items():
        for locale in APP_LOCALES:
            if (key, locale) in existing:
                continue
            db.add(models.ContentLanguageVersion(
                content_type="guided_step_question", content_key=key, locale=locale,
                status="certified" if locale in available else "draft",
                source="derived", notes="stato dedotto dai dati alla migrazione",
            ))
            existing.add((key, locale))
            created += 1
    if created:
        db.commit()
    return created


def assistant_question_key(topic: str, sort_order: int) -> str:
    """Chiave condivisa dalle traduzioni della stessa domanda assistente."""
    return f"{topic}::{sort_order}"


def derive_assistant_question_versions(db: Session) -> int:
    """Crea sei stati per ogni domanda assistente logica gia' presente nel DB."""
    groups: dict[str, set[str]] = {}
    for row in db.query(models.AssistantQuestion).all():
        key = assistant_question_key(row.topic, row.sort_order)
        if (row.text or "").strip():
            groups.setdefault(key, set()).add(row.language)

    existing = {
        (row.content_key, row.locale)
        for row in db.query(models.ContentLanguageVersion).filter(
            models.ContentLanguageVersion.content_type == "assistant_question"
        ).all()
    }
    created = 0
    for key, available in groups.items():
        for locale in APP_LOCALES:
            if (key, locale) in existing:
                continue
            db.add(models.ContentLanguageVersion(
                content_type="assistant_question", content_key=key, locale=locale,
                status="certified" if locale in available else "draft",
                source="derived", notes="stato dedotto dai dati alla migrazione",
            ))
            existing.add((key, locale))
            created += 1
    if created:
        db.commit()
    return created
