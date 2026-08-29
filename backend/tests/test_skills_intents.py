"""Test puri della classificazione deterministica dell'intenzione studente."""

from backend.skills.intents import classify


def test_explicit_behaviour_intents_are_distinct():
    assert classify("Dammi un consiglio concreto per organizzarmi") == "advice"
    assert classify("Suggeriscimi una lettura o un articolo") == "reading"
    assert classify("Confronta questo profilo con quello precedente") == "compare"
    assert classify("Non capisco cosa significa questo risultato") == "clarify"


def test_cross_language_signals_are_supported():
    assert classify("Can you recommend a book to read?") == "reading"
    assert classify("Compare this with my previous result") == "compare"
    assert classify("Was bedeutet dieses Ergebnis?") == "clarify"


def test_specific_intents_win_over_generic_advice_words():
    assert classify("Confronta le strategie dei miei due profili") == "compare"
    assert classify("Consigliami un libro per approfondire") == "reading"


def test_guided_internal_turn_has_its_own_intent():
    assert classify("", guided=True) == "guided"
    assert classify("Grazie") == ""


def test_negated_behaviour_does_not_activate_the_wrong_skill():
    assert classify("Senza consigli: aiutami a capire questo risultato") == "clarify"
    assert classify("Non confrontare i profili") == ""
    assert classify("Don't recommend a book; help me understand the result") == "clarify"


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"ok   {test.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {test.__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
