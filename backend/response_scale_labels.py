"""Etichette della scala di risposta, per strumento e lingua.

Vivevano in `frontend/src/lib/test-administrations.ts`, insieme agli item e alla
cornice dell'interfaccia. Ma un'etichetta di scala non e' cornice: e' una
proprieta' dello strumento, come il numero di gradini. Sta quindi nel catalogo,
in `instruments.response_labels`, e il frontend la riceve con le regole.

Cinque strumenti su sei usano una scala di frequenza; QPCC usa una scala di
accordo. Le lingue qui presenti sono quelle che avevano gia' una versione nel
file cancellato: le altre arrivano con la traduzione dello strumento.
"""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_FREQUENCY = {
    "en": ["Never or almost never", "Sometimes", "Often", "Always or almost always"],
    "es": ["Nunca o casi nunca", "A veces", "A menudo", "Siempre o casi siempre"],
    "sv": ["Aldrig eller nästan aldrig", "Ibland", "Ofta", "Alltid eller nästan alltid"],
}

_AGREEMENT = {
    "en": ["Strongly disagree", "Partly agree", "Fairly agree", "Fully agree"],
    "es": [
        "Totalmente en desacuerdo",
        "Parcialmente de acuerdo",
        "Bastante de acuerdo",
        "Totalmente de acuerdo",
    ],
    "sv": [
        "Instämmer inte alls",
        "Instämmer delvis",
        "Instämmer ganska mycket",
        "Instämmer helt",
    ],
}

RESPONSE_LABELS: dict[str, dict[str, list[str]]] = {
    "QSA": _FREQUENCY,
    "QSAr": _FREQUENCY,
    "ZTPI": _FREQUENCY,
    "QPCS": _FREQUENCY,
    "QAP": _FREQUENCY,
    "QPCC": _AGREEMENT,
}


def seed_response_labels(db: Session, models) -> int:
    """Riempie `instruments.response_labels` dove manca. Idempotente.

    Non sovrascrive: un admin che ha corretto un'etichetta deve tenersela.
    """
    filled = 0
    for code, labels in RESPONSE_LABELS.items():
        row = db.query(models.Instrument).filter(models.Instrument.code == code).first()
        if row is None or row.response_labels:
            continue
        row.response_labels = labels
        filled += 1
    if filled:
        db.commit()
        logger.info("Seeded response scale labels for %d instruments", filled)
    return filled
