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


def test_disorientation_activates_clarification():
    assert classify("Mi sento perso rispetto al risultato") == "clarify"
    assert classify("Non so da dove partire per interpretarlo") == "clarify"
    assert classify("In che senso questo punteggio e' basso?") == "clarify"
    assert classify("Non mi torna questo dato") == "clarify"
    assert classify("I feel lost with this profile") == "clarify"
    assert classify("Estoy perdido con este resultado") == "clarify"
    assert classify("Je suis perdu avec ce resultat") == "clarify"
    assert classify("Ich fuehle mich verloren mit diesem Ergebnis") == "clarify"
    assert classify("Jag kanner mig vilse med det har resultatet") == "clarify"


def test_generic_rispetto_a_is_not_a_comparison():
    assert classify("Mi sento perso rispetto al risultato") == "clarify"
    assert classify("Come sto rispetto al profilo precedente?") == "compare"


def test_a_factual_question_about_a_work_is_not_a_reading_request():
    assert classify("Di cosa parla Mindset?") == "factual"
    assert classify("Chi ha scritto Il posto delle fragole?") == "factual"
    assert classify("Who wrote Grit?") == "factual"
    assert classify("De que trata Wonder?") == "factual"
    # La richiesta di una lettura resta una richiesta di lettura.
    assert classify("Consigliami un libro per approfondire") == "reading"


def test_an_encyclopedic_question_reaches_the_lookup_in_every_language():
    assert classify("Cos'e' la metacognizione?") == "factual"
    assert classify("Chi era Vygotskij?") == "factual"
    assert classify("Cosa significa procrastinare") == "factual"
    assert classify("What is metacognition?") == "factual"
    assert classify("Who was Piaget?") == "factual"
    assert classify("Que es la resiliencia?") == "factual"
    assert classify("Qu'est-ce que la resilience?") == "factual"
    assert classify("Was ist Metakognition?") == "factual"
    assert classify("Vad ar metakognition?") == "factual"


def test_a_question_about_oneself_never_becomes_a_web_lookup():
    assert classify("Di cosa parla il mio risultato?") != "factual"
    assert classify("Non capisco cosa significa questo risultato") == "clarify"
    # Un codice fattore non e' una voce di enciclopedia.
    assert classify("Non capisco cosa significa A6") == "clarify"
    assert classify("Cosa significa questo punteggio?") == "clarify"
    # Nemmeno una domanda di significato che continua oltre il termine.
    assert classify("Cosa significa che sono nella fascia bassa?") == "clarify"
    assert classify("Was bedeutet dieses Ergebnis?") == "clarify"


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
