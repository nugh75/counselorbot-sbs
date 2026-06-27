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
    _apply_qsa_factor_directive,
    _qsa_assessment_labels,
    _qsa_factor_names,
    _QSA_INVERTED_CODES,
    _QSAR_INVERTED_CODES,
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
    assert "[INVERTED FACTORS]" not in out
    assert "[INVERTED]" not in out  # marker mai mostrato allo studente


def test_qsa_every_factor_has_correct_band_row():
    lbl = _qsa_assessment_labels("it")
    names = _qsa_factor_names("it", "QSA")
    out = _apply_qsa_factor_directive("BASE", "QSA", "it")
    for code, name in names.items():
        inverted = code in _QSA_INVERTED_CODES
        assert _row(code, name, lbl, inverted) in out, f"riga errata per {code}"


def test_qsa_a5_is_growth_at_high_score():
    # Regressione esplicita del bug: A5=9 deve essere Area di crescita, non Forza.
    out = _apply_qsa_factor_directive("BASE", "QSA", "it")
    assert "- A5 (Mancanza di perseveranza): 1-3 = Forza · 4-6 = Normale · 7-9 = Area di crescita" in out
    assert "A5 (Mancanza di perseveranza): 1-3 = Area di crescita" not in out


def test_qsar_inverted_codes_use_inverted_bands():
    lbl = _qsa_assessment_labels("it")
    names = _qsa_factor_names("it", "QSAR")
    out = _apply_qsa_factor_directive("BASE", "QSAR", "it")
    assert "[INTERPRETATION TABLE]" in out
    for code, name in names.items():
        inverted = code in _QSAR_INVERTED_CODES
        assert _row(code, name, lbl, inverted) in out, f"riga errata per {code}"


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
