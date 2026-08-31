"""Travaso delle colonne per lingua nei campi JSON e derivazione degli stati.

Girano all'avvio, dopo `create_all`. Entrambi idempotenti: la seconda esecuzione
non tocca nulla.
"""
from __future__ import annotations

import logging

from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session

from . import models
from .i18n_fields import merged_i18n

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
