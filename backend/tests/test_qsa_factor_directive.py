"""Regression test — direttiva QSA/QSAr a tabella per-fattore.

Blocca il bug per cui un modello piccolo leggeva un fattore INVERTITO ad alto
punteggio (es. A5=9) come "Forza" invece di "Area di crescita": la direttiva
ora pre-risolve l'inversione per fattore (ogni riga porta gia le bande giuste),
quindi il modello non deve piu decidere nulla.

Test PURO: nessuna rete, nessun DB. Esercita solo `_apply_qsa_factor_directive`,
una funzione senza I/O. L'import di `backend.chat_logic` tira pero le dipendenze
del modulo, quindi va eseguito nello stesso ambiente dell'app:

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_qsa_factor_directive
Con pytest:
    pytest backend/tests/test_qsa_factor_directive.py
"""
import os

# Stesse guardie dello smoke test: evitano side-effect (traduzioni async, sync
# admin->contatti) al semplice import del modulo applicativo.
os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from backend.chat_logic import (
    _annotate_qsa_factor_codes,
    _apply_current_step_score_profile_directive,
    _apply_qsa_factor_directive,
    _ensure_required_qsa_factor_codes,
    _sanitize_qsa_inverted_wording,
    _qsa_assessment_labels,
    _qsa_factor_names,
    _QSA_INVERTED_CODES,
    _QSAR_INVERTED_CODES,
)
from backend.prompt_config import (
    DEFAULT_SYSTEM_PROMPT_SECOND_LEVEL,
    DEFAULT_SYSTEM_PROMPT_QSAR_SECOND_LEVEL,
    FACTOR_INTERPLAY_SENTINEL,
)


def _row(code: str, name: str, lbl: dict, inverted: bool) -> str:
    if inverted:
        bands = f"1-3 = {lbl['strength']} · 4-6 = {lbl['normal']} · 7-9 = {lbl['growth']}"
    else:
        bands = f"1-3 = {lbl['growth']} · 4-6 = {lbl['adequate']} · 7-9 = {lbl['strength']}"
    return f"- {code} ({name}): {bands}"


def test_non_strategy_questionnaire_unchanged():
    assert _apply_qsa_factor_directive("BASE", "ZTPI", "it") == "BASE"
    assert _apply_qsa_factor_directive("BASE", "", "it") == "BASE"


def test_qsa_table_and_no_leak_markers():
    out = _apply_qsa_factor_directive("BASE", "QSA", "it")
    # Il system prompt originale e preservato e la sezione codice+nome resta.
    assert out.startswith("BASE")
    assert "[FACTOR LABELS]" in out
    # Nuova sezione tabellare; vecchia logica a liste e marker interno spariti.
    assert "[INTERPRETATION TABLE]" in out
    assert "[CURRENT FACTOR SCOPE]" in out
    assert "[INVERTED FACTORS]" not in out
    assert "[INVERTED]" not in out  # marker mai mostrato allo studente


def test_qsa_every_factor_has_correct_band_row():
    lbl = _qsa_assessment_labels("it")
    names = _qsa_factor_names("it", "QSA")
    out = _apply_qsa_factor_directive("BASE", "QSA", "it")
    for code, name in names.items():
        inverted = code in _QSA_INVERTED_CODES
        assert _row(code, name, lbl, inverted) in out, f"riga errata per {code}"


def test_qsa_factor_directive_scopes_rows_to_current_step():
    out = _apply_qsa_factor_directive("BASE", "QSA", "it", {"C1", "C2", "C3", "C4", "C5", "C6", "C7"})
    assert "C1 (Strategie elaborative)" in out
    assert "C7 (Autointerrogazione)" in out
    assert "A1 (Ansietà di base)" not in out
    assert "A7 (Interferenze emotive)" not in out
    assert "lists only the factor codes allowed in the current step" in out


def test_qsa_a5_is_growth_at_high_score():
    # Regressione esplicita del bug: A5=9 deve essere Area di crescita, non Forza.
    out = _apply_qsa_factor_directive("BASE", "QSA", "it")
    assert "- A5 (Mancanza di perseveranza): 1-3 = Forza · 4-6 = Normale · 7-9 = Area di crescita" in out
    assert "A5 (Mancanza di perseveranza): 1-3 = Area di crescita" not in out


def test_current_step_score_profile_marks_targets_and_resources():
    scores = "\n".join([
        "PROFILO QSA DELLO STUDENTE:",
        "- A2: 6/9",
        "- A5: 3/9",
        "- A6: 3/9",
    ])
    out = _apply_current_step_score_profile_directive("BASE", "QSA", "it", scores, {"A2", "A5", "A6"})
    assert "[CURRENT STEP SCORE PROFILE]" in out
    assert "A5 (Mancanza di perseveranza): 3/9 = Forza" in out
    assert "A6 (Percezione di competenza): 3/9 = Area di crescita" in out
    assert "Primary improvement targets: A6 (Percezione di competenza)" in out
    assert "Strength/resource factors: A5 (Mancanza di perseveranza)" in out
    assert "Azione da fare oggi" in out


def test_qsar_inverted_codes_use_inverted_bands():
    lbl = _qsa_assessment_labels("it")
    names = _qsa_factor_names("it", "QSAR")
    out = _apply_qsa_factor_directive("BASE", "QSAR", "it")
    assert "[INTERPRETATION TABLE]" in out
    for code, name in names.items():
        inverted = code in _QSAR_INVERTED_CODES
        assert _row(code, name, lbl, inverted) in out, f"riga errata per {code}"


def test_annotate_does_not_duplicate_name():
    # Bug storico: il modello scrive "codice nome" senza parentesi e l'annotazione
    # ci infilava di nuovo il nome → "A6 (Percezione di competenza) Percezione di competenza".
    out = _annotate_qsa_factor_codes("C1 Strategie elaborative 7/9 Forza", "it")
    assert out.startswith("C1 (Strategie elaborative) 7/9"), out
    assert out.count("Strategie elaborative") == 1, out

    out = _annotate_qsa_factor_codes("A6: Percezione di competenza è bassa", "it")
    assert out.startswith("A6 (Percezione di competenza) è bassa"), out
    assert out.count("Percezione di competenza") == 1, out


def test_annotate_collapses_model_side_duplication():
    # Il modello stesso ha gia prodotto "(nome) nome": va collassato.
    out = _annotate_qsa_factor_codes("C1 (Strategie elaborative) Strategie elaborative 7/9", "it")
    assert out.count("Strategie elaborative") == 1, out


def test_annotate_bare_code_still_annotated():
    out = _annotate_qsa_factor_codes("il C2 va bene", "it")
    assert out == "il C2 (Autoregolazione) va bene", out


def test_annotate_bare_factor_name_gets_first_code_for_coverage():
    out = _annotate_qsa_factor_codes("La Disponibilità alla collaborazione è una risorsa.", "it")
    assert "C4 (Disponibilità alla collaborazione)" in out, out
    assert out.count("C4 (Disponibilità alla collaborazione)") == 1, out


def test_annotate_common_factor_alias_gets_code_for_coverage():
    out = _annotate_qsa_factor_codes("Il tuo livello di disponibilità a collaborare è adeguato.", "it")
    assert "C4 (Disponibilità alla collaborazione)" in out, out


def test_sanitize_inverted_wording_for_a5_strength_phrase():
    out = _sanitize_qsa_inverted_wording("La tua mancanza di perseveranza è una forza.", "it", "QSA")
    assert "buona tenuta" in out, out
    assert "mancanza di perseveranza è una forza" not in out.lower(), out
    out = _sanitize_qsa_inverted_wording("La mancanza di perseveranza è bassa.", "it", "QSA")
    assert "basso livello di mancanza di perseveranza indica una buona tenuta" in out, out


def test_ensure_required_factor_codes_adds_scope_prefix():
    out = _ensure_required_qsa_factor_codes(
        "La collaborazione può essere strutturata meglio.",
        "QSA",
        "it",
        {"C4"},
    )
    assert out.startswith("Fattori trattati: C4 (Disponibilità alla collaborazione)"), out


def test_annotate_idempotent_on_correct_form():
    out = _annotate_qsa_factor_codes("C1 (Strategie elaborative): 7/9", "it")
    assert out.count("Strategie elaborative") == 1, out
    assert "C1 (Strategie elaborative)" in out, out


def test_annotate_c5_canonical_name():
    out = _annotate_qsa_factor_codes("C5 7/9", "it")
    assert "C5 (Uso di organizzatori semantici)" in out, out


def test_second_level_defaults_require_factor_interplay():
    # I default di secondo livello devono imporre la sintesi tra fattori, non solo
    # l'analisi uno-per-uno (flag poca-connessione della batteria).
    for prompt in (DEFAULT_SYSTEM_PROMPT_SECOND_LEVEL, DEFAULT_SYSTEM_PROMPT_QSAR_SECOND_LEVEL):
        assert FACTOR_INTERPLAY_SENTINEL in prompt, prompt
        assert "influence each other" in prompt, prompt


def test_localization_uses_target_language_labels():
    # In spagnolo le bande devono uscire localizzate, non in italiano/inglese.
    lbl_es = _qsa_assessment_labels("es")
    out = _apply_qsa_factor_directive("BASE", "QSA", "es")
    assert lbl_es["growth"] in out  # "Área de mejora"
    assert "Area di crescita" not in out
    assert "Area for growth" not in out


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"ok   {t.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {t.__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
