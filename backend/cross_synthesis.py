"""Sintesi cross-strumento (secondo livello inter-strumento).

Costruisce il blocco [MULTI-INSTRUMENT PROFILE] dagli ultimi risultati a
punteggio dello studente (uno per strumento), con bande/zone gia' risolte per
strumento — stessa logica pre-risolta degli step guidati, cosi' il modello legge
le etichette e non deve decidere inversioni o range. Il blocco viene appeso al
prompt `prompt_cross_synthesis` dalla route `/user/cross-synthesis`.
"""

from typing import Optional

from . import models
from .chat_logic import (
    _qsa_assessment_labels,
    _qsa_band_for_score,
    _qsa_factor_names,
    _ztpi_lang,
    _ztpi_zone_for_score,
    _ZTPI_FACTOR_NAMES,
    _ZTPI_ZONE_LABELS,
)

# Strumenti a punteggio con bande risolvibili per fattore. SAVICKAS (narrativo,
# scores vuoti) e i questionari agent-led restano fuori dalla V1.
SCORED_INSTRUMENTS = ("QSA", "QSAr", "ZTPI")

MIN_INSTRUMENTS = 2

MULTI_INSTRUMENT_SENTINEL = "[MULTI-INSTRUMENT PROFILE]"


def latest_scored_results(db, username: str) -> dict[str, "models.QuestionnaireResult"]:
    """Ultimo risultato con punteggi non vuoti per ciascuno strumento supportato."""
    latest: dict[str, models.QuestionnaireResult] = {}
    rows = (
        db.query(models.QuestionnaireResult)
        .filter(
            models.QuestionnaireResult.username == username,
            models.QuestionnaireResult.questionnaire_type.in_(SCORED_INSTRUMENTS),
        )
        .order_by(models.QuestionnaireResult.submitted_at.desc())
        .all()
    )
    for row in rows:
        if row.questionnaire_type not in latest and row.scores:
            latest[row.questionnaire_type] = row
    return latest


def _qsa_instrument_rows(scores: dict, questionnaire_type: str, language: Optional[str]) -> list[str]:
    names = _qsa_factor_names(language, questionnaire_type)
    labels = _qsa_assessment_labels(language)
    rows = []
    for code, name in names.items():
        score = scores.get(code)
        if not isinstance(score, (int, float)):
            continue
        band = _qsa_band_for_score(code, int(score), questionnaire_type)
        rows.append(f"- {code} ({name}): {int(score)}/9 — {labels[band]}")
    return rows


def _ztpi_instrument_rows(scores: dict, language: Optional[str]) -> list[str]:
    lang = _ztpi_lang(language)
    names = _ZTPI_FACTOR_NAMES[lang]
    labels = _ZTPI_ZONE_LABELS[lang]
    rows = []
    for code, name in names.items():
        score = scores.get(code)
        if not isinstance(score, (int, float)):
            continue
        zone = _ztpi_zone_for_score(code, int(score))
        rows.append(f"- {code} ({name}): {int(score)}/9 — {labels[zone]}")
    return rows


def build_multi_instrument_block(
    results: dict[str, "models.QuestionnaireResult"], language: Optional[str]
) -> str:
    """Blocco [MULTI-INSTRUMENT PROFILE] con etichette gia' risolte per strumento."""
    sections = []
    for qtype in SCORED_INSTRUMENTS:  # ordine stabile: QSA, QSAr, ZTPI
        result = results.get(qtype)
        if not result:
            continue
        scores = result.scores or {}
        if qtype == "ZTPI":
            rows = _ztpi_instrument_rows(scores, language)
        else:
            rows = _qsa_instrument_rows(scores, qtype, language)
        if not rows:
            continue
        submitted = result.submitted_at.date().isoformat() if result.submitted_at else ""
        header = f"## {qtype}" + (f" ({submitted})" if submitted else "")
        sections.append("\n".join([header, *rows]))
    if not sections:
        return ""
    return MULTI_INSTRUMENT_SENTINEL + "\n" + "\n\n".join(sections)
