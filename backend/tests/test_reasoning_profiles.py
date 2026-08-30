"""Test puri del registro dei profili di reasoning.

Modulo senza rete e senza DB: verifica che i modelli locali in uso siano
riconosciuti, cosi' il budget di output non venga consumato dal pensiero
lasciando la risposta visibile vuota.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_reasoning_profiles
Con pytest:
    pytest backend/tests/test_reasoning_profiles.py
"""
from backend.reasoning_profiles import classify, is_reasoning_model, resolve_plan


def test_local_models_are_known_reasoners():
    for model in ("muse-glimmer:30b", "qwen3.8:latest"):
        profile = classify(model)
        assert profile is not None, f"{model} non riconosciuto: budget calcolato alla cieca"
        assert profile.is_reasoning is True, model
        assert profile.can_disable is True, model


def test_muse_glimmer_reserves_room_for_the_visible_answer():
    """Misurato ~1200 caratteri di pensiero su una domanda banale: con un
    num_predict piccolo la risposta uscirebbe vuota."""
    profile = classify("muse-glimmer:30b")
    assert profile.family == "muse-glimmer"
    plan = resolve_plan("muse-glimmer:30b", disable_thinking=False, requested_max_tokens=700)
    assert plan.enabled is True
    assert plan.max_tokens > 700


def test_disabled_thinking_still_reserves_room_on_a_reasoning_model():
    """Con il pensiero spento questi modelli emettono comunque un canale interno:
    con un cap basso Ollama restituisce una risposta vuota (misurato: 500 token
    -> 0 caratteri; 2000 -> risposta completa)."""
    plan = resolve_plan("muse-glimmer:30b", disable_thinking=True, requested_max_tokens=256)
    assert plan.enabled is False
    assert plan.max_tokens >= 1800, "una risposta 'short' tornerebbe vuota"
    # Una richiesta gia' ampia non viene ridotta.
    assert resolve_plan("muse-glimmer:30b", disable_thinking=True,
                        requested_max_tokens=4000).max_tokens == 4000
    # Nessun budget richiesto: nessun gonfiaggio inventato.
    assert resolve_plan("muse-glimmer:30b", disable_thinking=True).max_tokens is None


def test_disabled_thinking_leaves_the_other_models_untouched():
    """Il minimo vale solo dove il problema e' misurato: per le altre famiglie
    resta il contratto "thinking spento -> nessun gonfiaggio"."""
    for model in ("gemma3:latest", "qwen3.5:9b", "gemma4:e4b"):
        assert resolve_plan(model, disable_thinking=True, requested_max_tokens=256).max_tokens == 256, model


def test_thinking_can_be_disabled_for_the_local_models():
    for model in ("muse-glimmer:30b", "qwen3.8:latest"):
        plan = resolve_plan(model, disable_thinking=True, requested_max_tokens=700)
        assert plan.enabled is False, model
        assert is_reasoning_model(model) is True, model


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
