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


def test_answering_distress_does_not_unlock_advice():
    # Prompt health #38: answering distress directly was read as permission to
    # give practical advice in steps that forbid it.
    assert "does not by itself allow practical advice where the step forbids it" in _directive()


def test_the_opening_rule_survives():
    assert "Never open with ritual acknowledgements" in _directive()


def test_an_invitation_to_start_is_not_an_encouraging_close():
    # Prompt health #67: the intro closes with an invitation to start the first step.
    assert "an invitation to start or continue a step is not such a remark." in _directive()
