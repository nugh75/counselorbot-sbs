"""Test puri del registro dei profili di reasoning.

Modulo senza rete e senza DB: verifica che i modelli locali in uso siano
riconosciuti, cosi' il budget di output non venga consumato dal pensiero
lasciando la risposta visibile vuota.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_reasoning_profiles
Con pytest:
    pytest backend/tests/test_reasoning_profiles.py
"""
from backend.reasoning_profiles import (
    DEEP_REASONING_BUDGET,
    classify,
    effort_overrides,
    is_reasoning_model,
    supports_reasoning,
    resolve_plan,
)
from backend import openrouter_capabilities


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


def test_qwen3_reserves_the_same_room_with_thinking_off():
    """qwen3 emette <think> anche a pensiero spento — per questo esiste
    `_ThinkSplitter` — quindi un turno 'short' da 256 token tornava vuoto come
    su muse-glimmer. Vale per il preset "no reasoning" e per il modello globale
    di default, entrambi qwen3."""
    for model in ("qwen3.8:latest", "qwen3.5:9b"):
        assert resolve_plan(model, disable_thinking=True,
                            requested_max_tokens=256).max_tokens >= 1800, model
        assert resolve_plan(model, disable_thinking=True,
                            requested_max_tokens=4000).max_tokens == 4000, model


def test_disabled_thinking_leaves_the_other_models_untouched():
    """Il minimo vale solo dove il problema e' misurato: per le altre famiglie
    resta il contratto "thinking spento -> nessun gonfiaggio"."""
    for model in ("gemma3:latest", "gemma4:e4b"):
        assert resolve_plan(model, disable_thinking=True, requested_max_tokens=256).max_tokens == 256, model


def test_thinking_can_be_disabled_for_the_local_models():
    for model in ("muse-glimmer:30b", "qwen3.8:latest"):
        plan = resolve_plan(model, disable_thinking=True, requested_max_tokens=700)
        assert plan.enabled is False, model
        assert is_reasoning_model(model) is True, model


def test_standard_effort_imposes_nothing():
    """Chi non tocca il selettore deve vedere il comportamento di sempre: la
    scelta "standard" non scrive ne' il flag ne' il budget, cosi' decidono il
    preset del counselor o la config globale."""
    assert effort_overrides("standard") == (None, None)
    assert effort_overrides(None) == (None, None)
    assert effort_overrides("") == (None, None)


def test_off_effort_disables_thinking():
    disable, budget = effort_overrides("off")
    assert disable is True
    assert budget is None


def test_deep_effort_widens_the_budget_of_a_known_reasoner():
    disable, budget = effort_overrides("deep")
    assert disable is False
    assert budget == DEEP_REASONING_BUDGET
    family = resolve_plan("qwen3.8:latest", disable_thinking=False)
    deep = resolve_plan("qwen3.8:latest", disable_thinking=False, budget_override=budget)
    assert deep.reasoning_budget > family.reasoning_budget


def test_supports_reasoning_hides_the_lever_only_for_known_non_reasoners():
    assert supports_reasoning("gemma3:latest") is False
    assert supports_reasoning("llama3.1:8b") is False
    assert supports_reasoning("qwen3.8:latest") is True
    # Sconosciuto: la leva resta, come in resolve_plan.
    assert supports_reasoning("modello-mai-visto:1b") is True


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


def test_openrouter_catalog_parses_effort_capabilities():
    payload = {"data": [{
        "id": "vendor/model-a",
        "context_length": 100000,
        "top_provider": {"max_completion_tokens": 8000},
        "supported_parameters": ["reasoning", "reasoning_effort", "max_tokens"],
        "reasoning": {
            "mandatory": True,
            "supported_efforts": ["high", "medium", "low"],
            "default_effort": "medium",
        },
    }]}
    parsed = openrouter_capabilities.parse_catalog(payload)
    capability = parsed["vendor/model-a"]
    assert capability.mandatory is True
    assert capability.supported_efforts == ("high", "medium", "low")
    assert capability.default_effort == "medium"
    assert capability.supports_reasoning is True
    assert capability.max_completion_tokens == 8000


def test_openrouter_mandatory_off_uses_lowest_effort_and_is_not_honored():
    plan = resolve_plan(
        "google/gemini-4-argon", disable_thinking=True,
        requested_max_tokens=1000, requested_effort="off", provider="openrouter",
    )
    assert plan.enabled is True
    assert plan.effort == "low"
    assert plan.effort_honored is False


def test_openrouter_preset_effort_is_clamped_to_catalog_values():
    plan = resolve_plan(
        "anthropic/claude-haiku-5.5", disable_thinking=False,
        requested_max_tokens=1000, requested_effort="minimal", provider="openrouter",
    )
    assert plan.effort == "low"
    assert plan.effort_honored is False

    best = resolve_plan(
        "anthropic/claude-haiku-5.5", disable_thinking=False,
        requested_max_tokens=1000, requested_effort="max", provider="openrouter",
    )
    assert best.effort == "max"
    assert best.effort_honored is True


def test_openrouter_off_on_an_optional_model_stays_off():
    plan = resolve_plan(
        "anthropic/claude-haiku-5.5", disable_thinking=True,
        requested_max_tokens=1000, requested_effort="off", provider="openrouter",
    )
    assert plan.enabled is False
    assert plan.effort == "none"


def test_preset_schema_accepts_only_supported_effort_values():
    from pydantic import ValidationError
    from backend.schemas import ModelPresetCreate
    assert ModelPresetCreate(name="n", provider="openrouter", model="m", reasoning_effort="high").reasoning_effort == "high"
    try:
        ModelPresetCreate(name="n", provider="openrouter", model="m", reasoning_effort="super")
    except ValidationError:
        pass
    else:
        raise AssertionError("un effort sconosciuto deve essere rifiutato")


def test_openrouter_catalog_can_enable_reasoning_for_a_family_known_as_plain():
    assert supports_reasoning("mistralai/mistral-large-4-0", "openrouter") is True
    assert supports_reasoning("mistral-large-4-0", "mistral") is False


def test_openrouter_live_cache_overrides_the_fallback_table():
    capability = openrouter_capabilities.OpenRouterCapability(
        model="vendor/model-b", mandatory=False,
        supported_efforts=("low", "high"), default_effort="low",
        supports_reasoning=True, supports_max_tokens=True,
        context_length=64000, max_completion_tokens=4096,
        supported_parameters=("reasoning", "reasoning_effort"),
    )
    openrouter_capabilities.set_catalog({"vendor/model-b": capability})
    try:
        loaded = openrouter_capabilities.capability_for("vendor/model-b:free")
        assert loaded is not None and loaded.default_effort == "low"
        plan = resolve_plan(
            "vendor/model-b:free", disable_thinking=False,
            requested_max_tokens=1000, provider="openrouter",
        )
        assert plan.effort == "low"
    finally:
        openrouter_capabilities.clear_cache()
