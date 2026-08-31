"""Test della sintesi finale di Idea: fallback deterministico, lingua, cache.

La persistenza e la rete non servono: il modello e' sostituito da una funzione
finta e il DB da una classe che restituisce zero righe di config.

Eseguibile senza pytest:
    python -m backend.tests.test_idea_synthesis
Con pytest:
    pytest backend/tests/test_idea_synthesis.py
"""
import pytest

from backend.ai_service import AIError, AIService
from backend.diagram_render import describe, parse_spec
import backend.idea_synthesis as synthesis_module
from backend.idea_synthesis import synthesis_for


class _ConfigRows:
    def all(self):
        return []


class _ConfigDB:
    def query(self, _model):
        return _ConfigRows()


SPEC = parse_spec({
    "type": "mindmap",
    "title": "Fare la tesi",
    "nodes": [
        {"id": "idea", "label": "Tesi sulla dispersione", "role": "idea", "accent": True},
        {"id": "a1", "label": "I dati siano accessibili", "role": "assumption"},
    ],
    "edges": [{"from": "idea", "to": "a1", "kind": "drives"}],
})


@pytest.fixture(autouse=True)
def _clear_cache():
    # La cache vive nel modulo: senza svuotarla, un test precedente puo'
    # rispondere a quello successivo che usa la stessa mappa.
    with synthesis_module._cache_lock:
        synthesis_module._cache.clear()
    yield
    with synthesis_module._cache_lock:
        synthesis_module._cache.clear()


def _raising_get_response(self, *args, **kwargs):
    raise AIError("nessun modello disponibile")


def test_falls_back_to_deterministic_when_the_model_fails(monkeypatch):
    monkeypatch.setattr(AIService, "get_response", _raising_get_response)
    assert synthesis_for(_ConfigDB(), SPEC, "it") == describe(SPEC, "it")


def test_uses_the_model_and_the_requested_language(monkeypatch):
    seen = {}

    def fake_get_response(self, user_message, system_prompt, mode, **kwargs):
        seen["system"] = system_prompt
        seen["user"] = user_message
        return "Una sintesi in prosa."

    monkeypatch.setattr(AIService, "get_response", fake_get_response)
    result = synthesis_for(_ConfigDB(), SPEC, "it")
    assert result == "Una sintesi in prosa."
    # Il prompt impone la lingua della sessione e riceve il testo grezzo.
    assert "Italian" in seen["system"]
    assert seen["user"] == describe(SPEC, "it")


def test_the_language_follows_the_interaction(monkeypatch):
    seen = {}

    def fake_get_response(self, user_message, system_prompt, mode, **kwargs):
        seen["system"] = system_prompt
        return "Eine klare Synthese."

    monkeypatch.setattr(AIService, "get_response", fake_get_response)
    synthesis_for(_ConfigDB(), SPEC, "de")
    assert "German" in seen["system"]


def test_same_map_and_language_are_synthesised_once(monkeypatch):
    calls = []

    def fake_get_response(self, user_message, system_prompt, mode, **kwargs):
        calls.append(1)
        return "Sintesi."

    monkeypatch.setattr(AIService, "get_response", fake_get_response)
    synthesis_for(_ConfigDB(), SPEC, "en")
    synthesis_for(_ConfigDB(), SPEC, "en")
    assert len(calls) == 1


if __name__ == "__main__":
    import sys

    failures = 0
    for name, fn in sorted(globals().items()):
        if not name.startswith("test_") or not callable(fn):
            continue
        try:
            fn()
        except Exception as exc:  # pragma: no cover - percorso di esecuzione manuale
            failures += 1
            print(f"FAIL {name}: {exc}")
    print("OK: test_idea_synthesis" if not failures else f"{failures} test falliti")
    sys.exit(1 if failures else 0)
