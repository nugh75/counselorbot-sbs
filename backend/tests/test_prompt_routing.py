"""Behavioral contracts for local capacity, failover and external privacy."""
import json
from types import SimpleNamespace

import pytest

from backend.ai_service import AIError, AIService
from backend.model_context import ContextCapacityError, fit_context, validate_routing_config
from backend.journey_context import journey_context


@pytest.fixture
def ai(monkeypatch):
    monkeypatch.setattr(AIService, "_load_config", lambda self: {
        "active_provider": "ollama", "model_name": "local-test", "disable_thinking": "true",
        "ai_fallback_targets": json.dumps([{"provider": "openrouter", "model": "openrouter/free"}]),
    })
    service = AIService(None)
    monkeypatch.setattr("backend.ai_service.pii_ner.anonymize_texts", lambda texts, **kwargs:
                        ([text.replace("Anna Rossi", "[PERSON_1]") for text in texts], {"[PERSON_1]": "Anna Rossi"}, True))
    return service


def fail(*args, **kwargs):
    raise TimeoutError("test")


@pytest.mark.parametrize("streaming", [False, True])
def test_local_to_cloud_redacts_every_input_and_records_actual_model(ai, streaming):
    seen = []
    def cloud(message, system, model, **kwargs):
        seen.append((message, system, kwargs["history"]))
        assert "Anna Rossi" not in repr(seen)
        return "Hello [PERSON_1]"
    ai._providers["ollama"].update(call=fail, stream=fail)
    ai._providers["openrouter"].update(call=cloud, stream=None)
    kwargs = {"history": [{"role": "user", "content": "Anna Rossi studies"}]}
    if streaming:
        reply = "".join(chunk.get("text", "") for chunk in ai.stream_response("Anna Rossi", "About Anna Rossi", "generic", **kwargs))
    else:
        reply = ai.get_response("Anna Rossi", "About Anna Rossi", "generic", **kwargs)
    assert reply == "Hello Anna Rossi"
    assert ai.last_provider == "openrouter"
    assert ai.last_model == "openrouter/free"
    assert [attempt["status"] for attempt in ai.last_attempts] == ["failed", "succeeded"]


@pytest.mark.parametrize("kind", ["content", "reasoning"])
def test_never_mix_models_after_stream_has_started(ai, kind):
    def interrupted(*args, **kwargs):
        yield {"type": kind, "text": "already emitted"}
        raise TimeoutError("interrupted")
    ai._providers["ollama"]["stream"] = interrupted
    ai._providers["openrouter"]["stream"] = lambda *args, **kwargs: pytest.fail("must not switch after output")
    stream = ai.stream_response("question", "system", "generic")
    assert next(stream)["text"] == "already emitted"
    with pytest.raises(AIError, match="interrotta"):
        list(stream)
    assert len(ai.last_attempts) == 1


@pytest.mark.parametrize("auto_model", ["openrouter/auto", "openrouter/auto:free"])
def test_paid_fallback_cannot_bypass_monthly_lock(ai, monkeypatch, auto_model):
    ai.config["ai_fallback_targets"] = json.dumps([
        {"provider": "omniroute", "model": "auto/best-chat"},
        {"provider": "openrouter", "model": "openrouter/free"},
        {"provider": "openrouter", "model": auto_model},
    ])
    monkeypatch.setattr(ai, "_budget_is_locked", lambda: True)
    targets = ai._targets("ollama", "local-test")
    assert targets == [("ollama", "local-test"), ("openrouter", "openrouter/free")]
    assert ai._targets("openrouter", "openrouter/free")[0] == ("openrouter", "openrouter/free")


def test_omniroute_primary_uses_its_own_model_and_endpoint(ai, monkeypatch):
    ai.config["omniroute_url"] = "http://private-gateway:20128/v1"
    assert ai._selected_target("omniroute", None) == ("omniroute", "auto/best-chat")
    seen = {}
    monkeypatch.setattr("backend.ai_service.OpenAI", lambda **kwargs: seen.update(kwargs))
    ai._openai_compatible_client("omniroute")
    assert seen["base_url"] == "http://private-gateway:20128/v1"
    assert seen["max_retries"] == 0


def test_unknown_provider_does_not_silently_select_openai(ai):
    with pytest.raises(AIError, match="sconosciuto"):
        ai._provider("typo")


def test_context_reduction_preserves_current_scores_sources_and_map():
    required = '[KNOWLEDGE]\n[CERTIFIED_READINGS]\nbook-1\n[IDEA MAP]\n{"nodes":[{"id":"n1"}]}\n[TURN CONTRACT]\nFollow exact schema'
    system = "Core instructions\n[META SYSTEM PROMPT]\n" + "optional theory " * 500 + "\n" + required
    history = [{"role": role, "content": "old " * 100} for _ in range(6) for role in ("user", "assistant")]
    result, message, retained, report = fit_context(system, "C4r: 8/9; latest correction", history,
                                                  {"context_tokens": 2048, "compact": True}, 700)
    assert required in result
    assert message == "C4r: 8/9; latest correction"
    assert "optional theory" not in result
    assert report["history_messages_dropped"] > 0
    assert retained[0]["role"] == "user"


def test_essential_overflow_fails_instead_of_cutting_json():
    with pytest.raises(ContextCapacityError):
        fit_context("essential " * 1000, '{"complete":"request"}', [], {"context_tokens": 2048}, 800)


@pytest.mark.parametrize("key,value", [
    ("ai_fallback_targets", '[{"provider":"typo","model":"x"}]'),
    ("ai_fallback_targets", '[{"provider":"ollama"}]'),
    ("model_context_profiles", '{"ollama/a":{"context_tokens":0}}'),
    ("model_context_profiles", '{"ollama/a":{"compact":"false"}}'),
    ("ai_timeout_seconds", "900"),
])
def test_invalid_runtime_profiles_are_rejected(key, value):
    with pytest.raises(ValueError):
        validate_routing_config(key, value)


def test_gemini_receives_native_roles_and_system_instruction(ai, monkeypatch):
    seen = {}
    def generate_content(**kwargs):
        seen.update(kwargs)
        return SimpleNamespace(text="answer")
    from google import genai
    monkeypatch.setattr(genai, "Client", lambda **kwargs: SimpleNamespace(models=SimpleNamespace(generate_content=generate_content)))
    ai.config["api_key_gemini"] = "synthetic"
    ai._call_gemini("current", "system rules", "test-model", history=[{"role":"user","content":"early"}, {"role":"assistant","content":"reply"}])
    assert seen["config"].system_instruction == "system rules"
    assert [turn.role for turn in seen["contents"]] == ["user", "model", "user"]
    assert seen["contents"][0].parts[0].text == "early"


def test_whole_journey_keeps_early_middle_late_and_corrections_without_generation():
    messages = [{"role": "student", "text": f"Question {i}: personal evidence {i}"} for i in range(1, 16)]
    messages.append({"role":"student", "text":"Correction: I rejected the proposed plan; I chose music."})
    context, coverage = journey_context(messages, "it")
    assert coverage == "complete"
    for text in ("Question 1:", "Question 8:", "Question 15:", "I rejected", "I chose music"):
        assert text in context


def test_long_journey_requires_all_chunks_and_no_silent_tail_cut():
    messages = [{"role":"student", "text":"Beginning " + "x" * 1000 + " Final correction"}]
    context, coverage = journey_context(messages, "it", max_chars=200)
    assert coverage == "requires_reduction"
    assert "Beginning" in context and "Final correction" in context
    class FailingNotes:
        def get_response(self, *args, **kwargs):
            return ""
    with pytest.raises(AIError):
        journey_context(messages, "it", max_chars=200, ai=FailingNotes())
