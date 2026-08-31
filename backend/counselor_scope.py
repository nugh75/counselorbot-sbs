"""Quali strumenti puo' servire un counselor.

`questionnaire_types` vuoto ha sempre voluto dire "tutti", ed e' la regola
giusta finche' gli strumenti si assomigliano. Idea no: ha bisogno di un
modello che ragioni, perche' deve produrre un blocco strutturato a ogni turno,
e un modello senza reasoning salta il turno intero senza dirlo.

Invece di scrivere gli altri sette strumenti su ogni counselor per escluderne
uno - e rifarlo a ogni strumento nuovo - alcuni strumenti sono **a invito**:
per quelli, vuoto vuol dire "nessuno", e vale solo chi li nomina.
"""
from __future__ import annotations

import json
import logging

logger = logging.getLogger(__name__)

RESTRICTED_CONFIG_KEY = "counselor_restricted_instruments"
DEFAULT_RESTRICTED = ("IDEA",)


def restricted_instruments(db) -> set[str]:
    """Strumenti a invito, dalla config; in assenza, quelli di serie."""
    from . import models

    row = db.query(models.Config).filter(models.Config.key == RESTRICTED_CONFIG_KEY).first()
    raw = getattr(row, "value", None)
    if not raw:
        return {code.upper() for code in DEFAULT_RESTRICTED}
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        logger.warning("%s non e' JSON valido: valgono i predefiniti", RESTRICTED_CONFIG_KEY)
        return {code.upper() for code in DEFAULT_RESTRICTED}
    if not isinstance(parsed, list):
        return {code.upper() for code in DEFAULT_RESTRICTED}
    return {str(code).upper() for code in parsed if str(code).strip()}


def suits(counselor, questionnaire_type: str | None, restricted: set[str]) -> bool:
    """Questo counselor puo' servire questo strumento?

    Senza strumento richiesto sono adatti tutti: e' il caso della scelta fatta
    fuori da un percorso, dove non c'e' ancora niente da rispettare.
    """
    if not questionnaire_type:
        return True
    code = questionnaire_type.upper()
    declared = {str(item).upper() for item in (getattr(counselor, "questionnaire_types", None) or [])}
    # `*` vale tutto, inviti compresi: stessa convenzione della colonna
    # `language`, e un counselor buono per tutto non va riscritto a ogni
    # strumento nuovo.
    if "*" in declared or code in declared:
        return True
    if code in restricted:
        # A invito: chi non lo nomina non entra.
        return False
    return not declared


def suitable_names(counselors, questionnaire_type: str | None, restricted: set[str]) -> list[str]:
    """I nomi da proporre quando la scelta corrente non va bene."""
    return [
        counselor.name
        for counselor in counselors
        if getattr(counselor, "is_active", True) and suits(counselor, questionnaire_type, restricted)
    ]
