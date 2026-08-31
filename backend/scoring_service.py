"""Scoring server-side per gli strumenti multilingue, basato sulle regole salvate nel DB.

Porta lato backend la logica che prima girava nel browser
(frontend/src/lib/test-scoring.ts:calculateExperimentalProfile), come richiesto dal
PROGETTO_VALIDAZIONE §10.5/§12: il browser non deve calcolare i punteggi.

Le regole (item->fattore, reverse, scala, direzione) vengono lette dalle tabelle
instruments/factors/questionnaire_items. Le stanine "vere" sono applicate solo se
esiste una norm_thresholds validata; altrimenti si usa il fallback lineare attuale,
marcato esplicitamente come sperimentale.
"""
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from . import models
from .content_version_service import served_locales, status_map
from .content_versions import APP_LOCALES
from .i18n_fields import localized

# Le lingue ammesse sono quelle dell'interfaccia. Quali siano somministrabili per
# uno strumento lo dice il registro (`content_language_versions`), non una tupla
# scritta a mano: era quella a far sollevare ScoringError per francese e tedesco
# prima ancora che si potesse porre la domanda sui contenuti.
SUPPORTED_LOCALES = APP_LOCALES

# Copy di banda/interpretazione (portata da test-scoring.ts TEXT). Testo generico,
# non dato per-strumento: resta qui per rendere il backend autosufficiente.
_TEXT = {
    "en": {
        "band": {"lower": "Lower frequency", "moderate": "Moderate frequency", "higher": "Higher frequency"},
        "resource": {
            "lower": "Lower reported use of this strategy or resource.",
            "moderate": "Moderate reported use of this strategy or resource.",
            "higher": "Higher reported use of this strategy or resource.",
        },
        "difficulty": {
            "lower": "Lower reported frequency of this difficulty.",
            "moderate": "Moderate reported frequency of this difficulty.",
            "higher": "Higher reported frequency of this difficulty.",
        },
        "neutral": {
            "lower": "Lower reported presence of this dimension.",
            "moderate": "Moderate reported presence of this dimension.",
            "higher": "Higher reported presence of this dimension.",
        },
    },
    "sv": {
        "band": {"lower": "Lägre frekvens", "moderate": "Måttlig frekvens", "higher": "Högre frekvens"},
        "resource": {
            "lower": "Lägre rapporterad användning av denna strategi eller resurs.",
            "moderate": "Måttlig rapporterad användning av denna strategi eller resurs.",
            "higher": "Högre rapporterad användning av denna strategi eller resurs.",
        },
        "difficulty": {
            "lower": "Lägre rapporterad frekvens av denna svårighet.",
            "moderate": "Måttlig rapporterad frekvens av denna svårighet.",
            "higher": "Högre rapporterad frekvens av denna svårighet.",
        },
        "neutral": {
            "lower": "Lägre rapporterad närvaro av denna dimension.",
            "moderate": "Måttlig rapporterad närvaro av denna dimension.",
            "higher": "Högre rapporterad närvaro av denna dimension.",
        },
    },
    "it": {
        "band": {"lower": "Frequenza più bassa", "moderate": "Frequenza moderata", "higher": "Frequenza più alta"},
        "resource": {
            "lower": "Uso dichiarato più basso di questa strategia o risorsa.",
            "moderate": "Uso dichiarato moderato di questa strategia o risorsa.",
            "higher": "Uso dichiarato più alto di questa strategia o risorsa.",
        },
        "difficulty": {
            "lower": "Frequenza dichiarata più bassa di questa difficoltà.",
            "moderate": "Frequenza dichiarata moderata di questa difficoltà.",
            "higher": "Frequenza dichiarata più alta di questa difficoltà.",
        },
        "neutral": {
            "lower": "Presenza dichiarata più bassa di questa dimensione.",
            "moderate": "Presenza dichiarata moderata di questa dimensione.",
            "higher": "Presenza dichiarata più alta di questa dimensione.",
        },
    },
    "es": {
        "band": {"lower": "Frecuencia más baja", "moderate": "Frecuencia moderada", "higher": "Frecuencia más alta"},
        "resource": {
            "lower": "Uso declarado más bajo de esta estrategia o recurso.",
            "moderate": "Uso declarado moderado de esta estrategia o recurso.",
            "higher": "Uso declarado más alto de esta estrategia o recurso.",
        },
        "difficulty": {
            "lower": "Frecuencia declarada más baja de esta dificultad.",
            "moderate": "Frecuencia declarada moderada de esta dificultad.",
            "higher": "Frecuencia declarada más alta de esta dificultad.",
        },
        "neutral": {
            "lower": "Presencia declarada más baja de esta dimensión.",
            "moderate": "Presencia declarada moderada de esta dimensión.",
            "higher": "Presencia declarada más alta de esta dimensión.",
        },
    },
    "fr": {
        "band": {"lower": "Fréquence plus faible", "moderate": "Fréquence modérée", "higher": "Fréquence plus élevée"},
        "resource": {
            "lower": "Recours déclaré plus faible à cette stratégie ou ressource.",
            "moderate": "Recours déclaré modéré à cette stratégie ou ressource.",
            "higher": "Recours déclaré plus élevé à cette stratégie ou ressource.",
        },
        "difficulty": {
            "lower": "Fréquence déclarée plus faible de cette difficulté.",
            "moderate": "Fréquence déclarée modérée de cette difficulté.",
            "higher": "Fréquence déclarée plus élevée de cette difficulté.",
        },
        "neutral": {
            "lower": "Présence déclarée plus faible de cette dimension.",
            "moderate": "Présence déclarée modérée de cette dimension.",
            "higher": "Présence déclarée plus élevée de cette dimension.",
        },
    },
    "de": {
        "band": {"lower": "Geringere Häufigkeit", "moderate": "Mittlere Häufigkeit", "higher": "Höhere Häufigkeit"},
        "resource": {
            "lower": "Geringere berichtete Nutzung dieser Strategie oder Ressource.",
            "moderate": "Mittlere berichtete Nutzung dieser Strategie oder Ressource.",
            "higher": "Höhere berichtete Nutzung dieser Strategie oder Ressource.",
        },
        "difficulty": {
            "lower": "Geringere berichtete Häufigkeit dieser Schwierigkeit.",
            "moderate": "Mittlere berichtete Häufigkeit dieser Schwierigkeit.",
            "higher": "Höhere berichtete Häufigkeit dieser Schwierigkeit.",
        },
        "neutral": {
            "lower": "Geringeres berichtetes Vorhandensein dieser Dimension.",
            "moderate": "Mittleres berichtetes Vorhandensein dieser Dimension.",
            "higher": "Höheres berichtetes Vorhandensein dieser Dimension.",
        },
    },
}


class ScoringError(ValueError):
    """Input non valido per il calcolo del profilo (strumento/locale/risposte)."""


class LocaleUnavailable(ScoringError):
    """Lingua nota all'app ma non ancora somministrabile per questo strumento.

    Distinta da una lingua inesistente: qui la risposta giusta e' "non ancora",
    con lo stato e le lingue disponibili, non "non esiste".
    """

    def __init__(self, instrument_code: str, locale: str, status: str, available: List[str]):
        super().__init__(
            f"{instrument_code}: la lingua {locale} non e' somministrabile (stato {status})"
        )
        self.locale = locale
        self.status = status
        self.available = available


def _assert_locale_available(db: Session, instrument_code: str, locale: str) -> str:
    """Rifiuta una lingua sconosciuta o non ancora somministrabile. Ritorna lo stato."""
    if locale not in APP_LOCALES:
        raise ScoringError(f"Locale non supportato: {locale}")
    statuses = status_map(db, "instrument", instrument_code)
    if not statuses:
        # Strumento creato dopo l'avvio (pannello admin, seed di un test): le righe
        # di registro si derivano alla prima richiesta, come gli step guidati.
        # Senza questo, uno strumento nuovo resterebbe non somministrabile in
        # nessuna lingua fino al riavvio, e nulla lo direbbe.
        from .content_versions_seed import derive_instrument_versions

        derive_instrument_versions(db)
        statuses = status_map(db, "instrument", instrument_code)
    available = served_locales(db, "instrument", instrument_code)
    if locale not in available:
        raise LocaleUnavailable(instrument_code, locale, statuses.get(locale, "draft"), available)
    return statuses[locale]


def _label_for(factor: models.Factor, locale: str) -> str:
    # Nessun ripiego sull'inglese: un fattore senza etichetta nella lingua servita
    # mostra il codice, che e' neutro. L'inglese sarebbe una schermata mista.
    return localized(factor, "label", locale) or factor.code


def _experimental_band(average: float) -> str:
    """Fallback lineare attuale (NON normato). Soglie su scala 1-4."""
    if average < 2:
        return "lower"
    if average < 3:
        return "moderate"
    return "higher"


def _normed_stanine(
    norms: List[models.NormThreshold], raw_score: float
) -> Optional[int]:
    for n in norms:
        if n.raw_min <= raw_score <= n.raw_max:
            return n.stanine
    return None


def compute_profile(
    db: Session,
    instrument_code: str,
    locale: str,
    answers: Dict[int, int],
) -> dict:
    """Calcola il profilo a partire dalle risposte item-level.

    answers: {item_number: valore}. Ritorna dict con metadati + lista risultati per fattore.
    """
    instrument = db.query(models.Instrument).filter(
        models.Instrument.code == instrument_code
    ).first()
    if not instrument:
        raise ScoringError(f"Strumento sconosciuto: {instrument_code}")

    # Un codice sbagliato resta "strumento sconosciuto"; una lingua non ancora
    # somministrabile e' un'altra risposta, e arriva solo dopo.
    _assert_locale_available(db, instrument_code, locale)

    factors = (
        db.query(models.Factor)
        .filter(models.Factor.instrument_code == instrument_code)
        .order_by(models.Factor.sort_order)
        .all()
    )
    items = (
        db.query(models.QuestionnaireItem)
        .filter(
            models.QuestionnaireItem.instrument_code == instrument_code,
            models.QuestionnaireItem.active == True,  # noqa: E712
        )
        .all()
    )

    scale_min = instrument.response_scale_min
    scale_max = instrument.response_scale_max
    span = scale_max - scale_min  # ampiezza per la riscalatura sperimentale

    # raw_score = -(scala+1) per item reverse: generalizza il "5 - x" su scala 1-4.
    reverse_pivot = scale_max + scale_min

    # Raggruppa item per fattore
    items_by_factor: Dict[str, List[models.QuestionnaireItem]] = {}
    for it in items:
        if it.factor_code:
            items_by_factor.setdefault(it.factor_code, []).append(it)

    # Normative disponibili per questo strumento/locale?
    norms_all = (
        db.query(models.NormThreshold)
        .filter(
            models.NormThreshold.instrument_code == instrument_code,
            models.NormThreshold.locale == locale,
            models.NormThreshold.status == "validated",
        )
        .all()
    )
    norms_by_factor: Dict[str, List[models.NormThreshold]] = {}
    for n in norms_all:
        norms_by_factor.setdefault(n.factor_code, []).append(n)
    has_norms = bool(norms_all)

    copy = _TEXT.get(locale) or _TEXT["en"]
    results = []
    for factor in factors:
        fitems = items_by_factor.get(factor.code, [])
        if not fitems:
            continue
        total = 0.0
        count = 0
        for it in fitems:
            if it.item_number not in answers:
                raise ScoringError(f"Risposta mancante per item {it.item_number}")
            val = answers[it.item_number]
            if not (scale_min <= val <= scale_max):
                raise ScoringError(
                    f"Valore {val} fuori scala [{scale_min},{scale_max}] (item {it.item_number})"
                )
            total += (reverse_pivot - val) if it.reverse_scoring else val
            count += 1
        average = total / count if count else 0.0
        band = _experimental_band(average)

        # Stanine: normata se disponibile, altrimenti riscalatura lineare sperimentale.
        factor_norms = norms_by_factor.get(factor.code, [])
        stanine = _normed_stanine(factor_norms, total) if factor_norms else None
        is_normed = stanine is not None
        if stanine is None and span > 0:
            stanine = round(1 + (average - scale_min) * (8 / span))

        percentage = ((average - scale_min) / span) * 100 if span > 0 else 0.0

        results.append({
            "code": factor.code,
            "label": _label_for(factor, locale),
            "dimension": factor.dimension,
            "orientation": factor.orientation,
            "raw_average": round(average, 4),
            "raw_total": round(total, 4),
            "percentage": round(percentage, 2),
            "band": band,
            "band_label": copy["band"][band],
            "interpretation": copy.get(factor.orientation, copy["neutral"])[band],
            "stanine": stanine,
            "stanine_is_normed": is_normed,
        })

    return {
        "instrument": instrument_code,
        "locale": locale,
        "status": instrument.status,
        "report_scale_type": instrument.report_scale_type,
        "uses_validated_norms": has_norms,
        "results": results,
    }


def mapped_stanine_scores(profile: dict) -> Dict[str, int]:
    """{factor_code: stanine} per il salvataggio in QuestionnaireResult.scores."""
    return {r["code"]: r["stanine"] for r in profile["results"] if r["stanine"] is not None}


def get_rules(db: Session, instrument_code: str, locale: str) -> dict:
    """Regole leggibili (sola lettura) per la vista frontend + somministrazione.

    Include metadati strumento, scala, fattori e item (testo nella locale richiesta).
    """
    instrument = db.query(models.Instrument).filter(
        models.Instrument.code == instrument_code
    ).first()
    if not instrument:
        raise ScoringError(f"Strumento sconosciuto: {instrument_code}")
    locale_status = _assert_locale_available(db, instrument_code, locale)

    factors = (
        db.query(models.Factor)
        .filter(models.Factor.instrument_code == instrument_code)
        .order_by(models.Factor.sort_order)
        .all()
    )
    items = (
        db.query(models.QuestionnaireItem)
        .filter(models.QuestionnaireItem.instrument_code == instrument_code)
        .order_by(models.QuestionnaireItem.sort_order)
        .all()
    )
    has_norms = (
        db.query(models.NormThreshold)
        .filter(
            models.NormThreshold.instrument_code == instrument_code,
            models.NormThreshold.locale == locale,
            models.NormThreshold.status == "validated",
        )
        .count() > 0
    )

    labels = (instrument.response_labels or {}).get(locale) if instrument.response_labels else None

    return {
        "instrument": {
            "code": instrument.code,
            "name": localized(instrument, "name", locale) or instrument.code,
            "response_scale_min": instrument.response_scale_min,
            "response_scale_max": instrument.response_scale_max,
            "response_labels": labels,
            "report_scale_type": instrument.report_scale_type,
            "status": instrument.status,
        },
        "uses_validated_norms": has_norms,
        "locale_status": locale_status,
        "available_locales": served_locales(db, "instrument", instrument.code),
        "factors": [
            {
                "code": f.code,
                "dimension": f.dimension,
                "orientation": f.orientation,
                "is_interpretation_inverted": f.is_interpretation_inverted,
                "label": _label_for(f, locale),
                "item_numbers": [
                    it.item_number for it in items
                    if it.factor_code == f.code and it.active
                ],
                "reverse_item_numbers": [
                    it.item_number for it in items
                    if it.factor_code == f.code and it.reverse_scoring and it.active
                ],
            }
            for f in factors
        ],
        "items": [
            {
                "item_number": it.item_number,
                "factor_code": it.factor_code,
                "reverse_scoring": it.reverse_scoring,
                "active": it.active,
                "text": localized(it, "text", locale),
            }
            for it in items
        ],
    }
