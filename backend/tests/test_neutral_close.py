"""La chiusura non giudica lo studente.

Il divieto di paragonare lo studente con altri e' sopravvissuto in forma
attenuata: la pacca sulla spalla. "Che gia' lo fai", "e' piu' di quanto molti
abbiano" — un verdetto sul suo impegno messo in fondo al turno. La direttiva
globale vietava le aperture rituali e non diceva niente sulle chiusure.
"""
from backend.prompt_config import ALL_CONFIG_TEXT_DEFINITIONS


def _directive() -> str:
    return next(item["default"] for item in ALL_CONFIG_TEXT_DEFINITIONS
                if item["key"] == "directive_conversation_quality")


def test_the_close_carries_no_verdict_on_the_student():
    text = _directive()
    assert "do not praise" in text
    assert "encouraging remark" in text


def test_distress_is_still_answered_rather_than_softened():
    # Neutrality is about unsolicited praise, not about ignoring a student who
    # says they are struggling.
    assert "distress" in _directive()


def test_the_opening_rule_survives():
    assert "Never open with ritual acknowledgements" in _directive()
