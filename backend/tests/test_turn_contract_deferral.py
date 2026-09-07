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
    assert "not another day" in text


def test_the_refusal_bans_formulas_justification_and_comparisons():
    text = _contract(advice_allowed=False)
    assert "no refusal formulas" in text
    assert "never compare the student with anyone else" in text


def test_a_step_that_may_advise_carries_none_of_it():
    text = _contract(advice_allowed=True)
    assert "which later step" not in text
    assert "Offer at most ONE new practical action" in text
