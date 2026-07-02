"""Test puri per la sintesi cross-strumento (nessuna rete, nessun DB).

Esercitano `build_multi_instrument_block` (bande/zone pre-risolte per strumento)
e i default del prompt `prompt_cross_synthesis`.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_cross_synthesis
Con pytest:
    pytest backend/tests/test_cross_synthesis.py
"""
import os
from datetime import datetime
from types import SimpleNamespace

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from backend.cross_synthesis import (
    MULTI_INSTRUMENT_SENTINEL,
    SCORED_INSTRUMENTS,
    build_multi_instrument_block,
)
from backend.prompt_config import (
    DEFAULT_SYSTEM_PROMPT_CROSS_SYNTHESIS,
    SECOND_LEVEL_METHOD_SENTINEL,
)


def _result(scores, submitted="2026-07-01"):
    return SimpleNamespace(scores=scores, submitted_at=datetime.fromisoformat(submitted))


def test_block_resolves_bands_per_instrument():
    results = {
        "QSA": _result({"A5": 9, "C1": 8}),
        "QSAr": _result({"C4r": 3}),
        "ZTPI": _result({"T1": 3}),
    }
    block = build_multi_instrument_block(results, "it")
    assert block.startswith(MULTI_INSTRUMENT_SENTINEL)
    # A5 invertito: 9 = Area di crescita, non Forza.
    assert "- A5 (Mancanza di perseveranza): 9/9 — Area di crescita" in block
    assert "- C1 (Strategie elaborative): 8/9 — Forza" in block
    # C4r invertito: 3 = Forza.
    assert "3/9 — Forza" in block.split("## QSAr")[1].split("##")[0]
    # ZTPI T1: banda ideale 2-4 -> in linea col profilo equilibrato.
    assert "- T1 (Passato Negativo): 3/9 — In linea con il profilo equilibrato" in block


def test_block_stable_instrument_order_and_headers():
    results = {
        "ZTPI": _result({"T5": 6}),
        "QSA": _result({"C2": 5}),
    }
    block = build_multi_instrument_block(results, "it")
    # Ordine stabile QSA prima di ZTPI, con data di compilazione nell'header.
    assert block.index("## QSA (2026-07-01)") < block.index("## ZTPI (2026-07-01)")
    assert "## QSAr" not in block


def test_block_empty_without_usable_scores():
    assert build_multi_instrument_block({}, "it") == ""
    assert build_multi_instrument_block({"QSA": _result({})}, "it") == ""


def test_default_cross_synthesis_prompt_contract():
    # Il prompt di default deve citare il blocco profilo e imporre il metodo del
    # secondo livello (ipotesi + domanda riflessiva prima dei consigli).
    assert MULTI_INSTRUMENT_SENTINEL in DEFAULT_SYSTEM_PROMPT_CROSS_SYNTHESIS
    assert SECOND_LEVEL_METHOD_SENTINEL in DEFAULT_SYSTEM_PROMPT_CROSS_SYNTHESIS
    assert "ACROSS instruments" in DEFAULT_SYSTEM_PROMPT_CROSS_SYNTHESIS
    assert set(SCORED_INSTRUMENTS) == {"QSA", "QSAr", "ZTPI"}


if __name__ == "__main__":
    import sys

    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"ok   {name}")
            except AssertionError as e:
                failures += 1
                print(f"FAIL {name}: {e}")
    print(f"\n{'FAILED' if failures else 'passed'}")
    sys.exit(1 if failures else 0)
