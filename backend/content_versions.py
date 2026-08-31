"""Stato di certificazione di un contenuto in una lingua.

`instruments.status` e' per strumento e `certified_strategies.status` e' per
riga, ma il protocollo di validazione impone che ogni lingua abbia un cammino
suo: lo svedese puo' essere validato mentre il francese e' ancora bozza. Qui
vivono i vocabolari di stato e la regola di transizione; il registro che li
applica sta in `content_version_service.py`.
"""
from __future__ import annotations

# Le lingue dell'interfaccia. Unica lista autorevole lato backend.
APP_LOCALES = ("it", "en", "es", "fr", "de", "sv")

# Strumenti psicometrici: il cammino del protocollo di validazione
# (docs/validazione/progetto-validazione-qsa-qsar-sv-en.md).
INSTRUMENT_STATUSES = ("draft", "translated", "reviewed", "pilot", "validated")

# Tool: non sono misure, non hanno norme, si fermano alla revisione admin.
TOOL_STATUSES = ("draft", "translated", "certified")

CONTENT_TYPES: dict[str, tuple[str, ...]] = {
    "instrument": INSTRUMENT_STATUSES,
    "certified_strategy": TOOL_STATUSES,
    "certified_reading": TOOL_STATUSES,
    "guided_step_question": TOOL_STATUSES,
    "assistant_question": TOOL_STATUSES,
}

# Stati in cui il contenuto arriva all'utente finale.
_SERVED: dict[str, tuple[str, ...]] = {
    "instrument": ("pilot", "validated"),
    "certified_strategy": ("certified",),
    "certified_reading": ("certified",),
    "guided_step_question": ("certified",),
    "assistant_question": ("certified",),
}


class ContentVersionError(ValueError):
    """Tipo di contenuto, stato o transizione fuori vocabolario."""


def statuses_for(content_type: str) -> tuple[str, ...]:
    try:
        return CONTENT_TYPES[content_type]
    except KeyError:
        raise ContentVersionError(f"Tipo di contenuto sconosciuto: {content_type}") from None


def is_served(content_type: str, status: str) -> bool:
    """Il contenuto in questo stato viene mostrato all'utente finale?"""
    return status in _SERVED.get(content_type, ())


def can_transition(content_type: str, current: str, target: str) -> bool:
    """Avanti di un gradino alla volta; indietro di quanto serve.

    La promozione salta-gradini nasconderebbe un passo del protocollo (per
    esempio le interviste cognitive prima del pilot). La retrocessione invece e'
    sempre legittima: una traduzione trovata sbagliata deve poter tornare in
    bozza subito, non un gradino per volta.
    """
    ladder = statuses_for(content_type)
    if current not in ladder or target not in ladder:
        return False
    delta = ladder.index(target) - ladder.index(current)
    return delta == 1 or delta < 0


def assert_transition(content_type: str, current: str, target: str) -> None:
    if not can_transition(content_type, current, target):
        raise ContentVersionError(
            f"Transizione non ammessa per {content_type}: {current} -> {target}"
        )
