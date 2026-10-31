"""Passo «Strategie e consigli» sugli impianti gia' popolati (#749).

Il seed dei passi guidati riempie solo i percorsi vuoti: qui il passo nuovo
entra una volta, dopo l'ultimo passo del percorso (la sintesi), senza spostare
gli altri. Le sessioni in corso puntano a id e posizioni che non cambiano.

Nella stessa occasione un elenco di prova di letture verificabili passa da
bozza a certificato (decisione 2.8), cosi' il passo puo' proporre libri.
"""
from __future__ import annotations

from . import models
from .prompt_config import (
    DEFAULT_GUIDED_STEPS,
    DEFAULT_QAP_GUIDED_STEPS,
    DEFAULT_QPCC_GUIDED_STEPS,
    DEFAULT_QPCS_GUIDED_STEPS,
    DEFAULT_QSAR_GUIDED_STEPS,
    DEFAULT_ZTPI_GUIDED_STEPS,
    STRATEGIES_STEP_MODE,
    strategies_step,
)

STRATEGIES_STEP_MARKER = "guided_strategies_step_v1"
TEST_READINGS_MARKER = "certified_readings_test_catalogue_v1"

_DEFAULT_STEPS = {
    "QSA": DEFAULT_GUIDED_STEPS,
    "QSAr": DEFAULT_QSAR_GUIDED_STEPS,
    "ZTPI": DEFAULT_ZTPI_GUIDED_STEPS,
    "QPCS": DEFAULT_QPCS_GUIDED_STEPS,
    "QPCC": DEFAULT_QPCC_GUIDED_STEPS,
    "QAP": DEFAULT_QAP_GUIDED_STEPS,
}

# Letture di prova certificate (decisione 2.8): saggi e articoli su studio,
# motivazione, orientamento e competenze strategiche, con autore, titolo e anno
# verificabili. Romanzi e film restano in bozza. L'elenco e' nella PR #749.
TEST_CATALOGUE_READING_SLUGS = (
    # studio
    "dunlosky-learning-techniques",
    "brown-make-it-stick",
    "newport-deep-work",
    "clear-atomic-habits",
    "foer-moonwalking",
    # motivazione
    "dweck-mindset",
    "pink-drive",
    "gruber-states-of-curiosity",
    # orientamento
    "savickas-porfeli-caas",
    "zimbardo-boyd-time-paradox",
    "yeager-lay-theory-college",
    "epstein-range",
    # competenze strategiche: emozioni, ansia da prestazione, autoregolazione
    "ramirez-beilock-writing-worries",
    "beilock-choke",
    "goleman-intelligenza-emotiva",
)


def _marked(db, key: str) -> bool:
    return db.query(models.Config.key).filter(models.Config.key == key).first() is not None


def _mark(db, key: str, description: str) -> None:
    db.add(models.Config(key=key, value="applied", description=description))


def ensure_strategies_steps(db) -> int:
    """Aggiunge il passo ai percorsi esistenti, una volta. Ritorna i passi creati."""
    if _marked(db, STRATEGIES_STEP_MARKER):
        return 0
    created = 0
    for questionnaire_type, defaults in _DEFAULT_STEPS.items():
        step_default = next(s for s in defaults if s["system_prompt_mode"] == STRATEGIES_STEP_MODE)
        rows = db.query(models.GuidedStep).filter(models.GuidedStep.questionnaire_type == questionnaire_type).all()
        if not rows or any(row.id == step_default["id"] for row in rows):
            continue
        if db.query(models.GuidedStep.id).filter(models.GuidedStep.id == step_default["id"]).first():
            continue
        last = max((row.sort_order or 0) for row in rows)
        db.add(models.GuidedStep(**strategies_step(questionnaire_type, last + 1)))
        created += 1
    _mark(db, STRATEGIES_STEP_MARKER, "Migrazione una tantum: passo «Strategie e consigli» (#749).")
    db.commit()
    return created


def certify_test_readings(db) -> int:
    """Certifica una volta le letture di prova ancora in bozza. Ritorna quante."""
    if _marked(db, TEST_READINGS_MARKER):
        return 0
    rows = (
        db.query(models.CertifiedReading)
        .filter(models.CertifiedReading.slug.in_(TEST_CATALOGUE_READING_SLUGS),
                models.CertifiedReading.status == "draft")
        .all()
    )
    for row in rows:
        row.status = "certified"
        row.certified_by = "Catalogo di prova #749 (decisione 2.8), da rivedere"
    _mark(db, TEST_READINGS_MARKER, "Migrazione una tantum: letture di prova certificate (#749).")
    db.commit()
    return len(rows)
