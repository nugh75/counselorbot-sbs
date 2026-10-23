"""Valutatore dichiarativo delle condizioni di attivazione.

Sostituisce le regex di policy del vecchio gating: qui si dichiara *quando* una
skill vale, non *come* si estraggono i dati (quello resta negli handler).
Regola: chiave sconosciuta => la skill NON si attiva (fail closed), cosi' un
errore di battitura dell'admin non inietta materiale in tutti i turni.
"""
from __future__ import annotations

import logging

from .context import SkillContext

logger = logging.getLogger(__name__)

KNOWN_CONDITION_KEYS = frozenset({
    "questionnaire_types",
    "step_modes",
    "step_ids",
    "factor_bands",
    "min_salient_factors",
    "languages",
    "requires_scores",
    "intents",
})


_LIST_KEYS = ("questionnaire_types", "step_modes", "step_ids", "languages", "intents")


def validate(conditions) -> list[str]:
    """Errori di forma delle condizioni, per rifiutarle al salvataggio.

    `match` resta fail closed a runtime; qui l'admin scopre subito l'errore
    invece di vedere la skill che non si attiva mai.
    """
    from .intents import KNOWN_INTENTS

    if conditions is None:
        return []
    if not isinstance(conditions, dict):
        return ["conditions deve essere un oggetto JSON"]
    errors = []
    unknown = sorted(set(conditions) - KNOWN_CONDITION_KEYS)
    if unknown:
        errors.append(
            f"chiavi di condizione sconosciute: {', '.join(unknown)} "
            f"(ammesse: {', '.join(sorted(KNOWN_CONDITION_KEYS))})"
        )
    for key in _LIST_KEYS:
        value = conditions.get(key)
        if value is not None and not (isinstance(value, list) and all(isinstance(v, str) for v in value)):
            errors.append(f"{key} deve essere una lista di testi")
    intents = conditions.get("intents")
    if isinstance(intents, list):
        bad = sorted({str(v) for v in intents} - set(KNOWN_INTENTS))
        if bad:
            errors.append(f"intent sconosciuti: {', '.join(bad)} (ammessi: {', '.join(KNOWN_INTENTS)})")
    minimum = conditions.get("min_salient_factors")
    if minimum is not None and (isinstance(minimum, bool) or not isinstance(minimum, int) or minimum < 0):
        errors.append("min_salient_factors deve essere un intero >= 0")
    requires = conditions.get("requires_scores")
    if requires is not None and not isinstance(requires, bool):
        errors.append("requires_scores deve essere true o false")
    bands = conditions.get("factor_bands")
    if bands is not None and not (isinstance(bands, dict) and isinstance(bands.get("any_of"), list)):
        errors.append("factor_bands richiede {\"any_of\": [...]}")
    return errors


def match(conditions: dict | None, ctx: SkillContext) -> tuple[bool, str]:
    """Ritorna (attiva, motivo). `motivo` e' vuoto quando attiva; altrimenti
    spiega l'esclusione ed e' mostrato nella preview del pannello admin."""
    if not conditions:
        return True, ""
    if not isinstance(conditions, dict):
        return False, "conditions non e' un oggetto JSON"

    unknown = sorted(set(conditions) - KNOWN_CONDITION_KEYS)
    if unknown:
        logger.warning("Skill con condizioni sconosciute %s: non attivata", unknown)
        return False, f"chiavi di condizione sconosciute: {', '.join(unknown)}"

    values = conditions.get("questionnaire_types")
    if values and (ctx.questionnaire_type or "").upper() not in {str(v).upper() for v in values}:
        return False, "strumento non ammesso"

    values = conditions.get("step_modes")
    if values and (ctx.step_mode or "").strip().lower() not in {str(v).strip().lower() for v in values}:
        return False, "step_mode non ammesso"

    values = conditions.get("step_ids")
    if values and (ctx.step_id or "") not in {str(v) for v in values}:
        return False, "step non ammesso"

    values = conditions.get("languages")
    if values and (ctx.language or "it").strip().lower() not in {str(v).strip().lower() for v in values}:
        return False, "lingua non ammessa"

    values = conditions.get("intents")
    if values and (ctx.intent or "").strip().lower() not in {str(v).strip().lower() for v in values}:
        return False, "intenzione non ammessa"

    if conditions.get("requires_scores") and not (ctx.scores_context or "").strip():
        return False, "punteggi assenti nel turno"

    minimum = conditions.get("min_salient_factors")
    if minimum is not None:
        try:
            needed = int(minimum)
        except (TypeError, ValueError):
            return False, "min_salient_factors non numerico"
        if len(ctx.salient_factors) < needed:
            return False, f"fattori salienti < {needed}"

    bands = conditions.get("factor_bands")
    if bands:
        if not isinstance(bands, dict) or "any_of" not in bands:
            return False, "factor_bands richiede la chiave any_of"
        wanted = {str(b).strip().lower() for b in (bands.get("any_of") or [])}
        present = {str(b).strip().lower() for b in (ctx.score_bands or {}).values()}
        if not (wanted & present):
            return False, "nessun fattore nelle bande richieste"

    return True, ""
