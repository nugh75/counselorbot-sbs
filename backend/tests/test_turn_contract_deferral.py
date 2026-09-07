"""Come si dice di no a una richiesta che appartiene a un altro passo.

Sugli step interpretativi il contratto vieta di introdurre azioni pratiche, ma
diceva solo questo: che cosa non fare. Il rifiuto se lo inventava il modello, e
lo inventava retorico — "Non prima.", "Te li do quando il passo è quello.", e un
paragone con gli altri studenti ("e' piu' di quanto molti abbiano") che non
c'entra nulla e suona come una difesa del progetto. Diceva anche "oggi non ti do
titoli", che mette una distanza temporale inesistente: i passi stanno nella
stessa seduta.
"""
from backend.prompt_contract import turn_contract


def _contract(advice_allowed: bool) -> str:
    return turn_contract(language="it", questionnaire_type="QSA", phase="cognitive",
                         advice_allowed=advice_allowed, synthesis=False)


def test_a_step_that_cannot_advise_is_told_how_to_say_so():
    text = _contract(advice_allowed=False)
    assert "what this step is for" in text
    assert "which later step" in text
    assert "separate occasion or a later date" in text


def test_the_rule_gives_no_sentence_to_copy():
    # The first wording said "it comes later in this same path, not another day", and
    # the model handed the student "Non e' un'altra giornata: e' qui dentro, piu'
    # avanti" — both halves translated word for word. A ready-made sentence gets
    # copied; a prohibition has to be obeyed rather than recited.
    text = _contract(advice_allowed=False)
    assert "not another day" not in text
    assert "later in this same path" not in text


def test_the_refusal_bans_formulas_justification_and_comparisons():
    text = _contract(advice_allowed=False)
    assert "no formulas" in text
    assert "never compare the student with anyone else" in text


def test_a_step_that_may_advise_carries_none_of_it():
    text = _contract(advice_allowed=True)
    assert "which later step" not in text
    assert "Offer at most ONE new practical action" in text


def test_the_contract_forbids_reciting_itself():
    # Twice now the model has handed the student the prompt's own words: the three
    # example questions in [ANCHOR] became a fixed closing formula, and "not another
    # day" came back translated. Both were fixed one at a time; this is the class.
    text = _contract(advice_allowed=True)
    assert "not material for the reply" in text
    assert "never reuse their wording" in text
    assert "not material for the reply" in _contract(advice_allowed=False)
