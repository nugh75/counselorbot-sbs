"""Offline output planning and real sync/stream transport contracts (#403)."""
from dataclasses import replace
from types import SimpleNamespace as NS
from unittest.mock import Mock

import pytest

from backend import openrouter_capabilities as catalog
from backend.ai_service import AIError, AIService
from backend.model_context import ContextCapacityError, context_profile, estimate_tokens, fit_context, validate_output_capacity
from backend.reasoning_profiles import plan_details, resolve_plan


MODEL = "google/gemini-4-argon"


def make_ai(monkeypatch, *, fallback=False):
    ai = AIService.__new__(AIService)
    ai.config = {}
    ai.personal_target = ai.personal_error = ai.chatgpt_model = ai.shared_owner = None
    ai.personal_reasoning = ai._reasoning_effort_override = ai._preset_reasoning_effort = None
    ai._disable_thinking = False
    ai._reasoning_budget_override = None
    ai.context_data = None
    ai.temperature = None
    ai.last_usage = ai.last_thinking = None
    ai._get_api_key = lambda key: "fixture-key"
    ai._anonymize_external = lambda provider, message, system, history: (message, system, history, {})
    ai._targets = lambda *args: [("openrouter", MODEL)] + ([("openai", "gpt-4o")] if fallback else [])
    reserve = Mock(return_value="Fallback answer.")
    ai._providers = {
        "openrouter": {"call": ai._call_openrouter, "stream": ai._stream_openrouter, "call_max": None, "stream_max": None},
        "openai": {"call": reserve, "stream": None, "call_max": None, "stream_max": None},
    }
    create = Mock()
    monkeypatch.setattr("backend.ai_service.OpenAI", lambda **kwargs: NS(chat=NS(completions=NS(create=create))))
    return ai, create, reserve


@pytest.mark.parametrize("effort,expected", [("low", 32768), ("medium", 32768), ("high", 32768)])
def test_argon_floor_is_total_not_an_extra_reserve(effort, expected):
    plan = resolve_plan(MODEL, provider="openrouter", disable_thinking=False,
                        requested_effort=effort, requested_max_tokens=4000)
    assert plan.max_tokens == expected
    assert plan.reasoning_budget + plan.response_headroom_tokens == expected
    assert plan.requested_response_tokens == 4000
    assert plan_details(plan)["reasoning_reserve_is_local"] is True


@pytest.mark.parametrize("effort,total", [("high", 20000), ("xhigh", 80000), ("max", 80000)])
def test_effort_reserve_scales_with_answer_headroom(effort, total):
    plan = resolve_plan("anthropic/claude-sonnet-5.5", provider="openrouter", disable_thinking=False,
                        requested_effort=effort, requested_max_tokens=4000)
    assert plan.max_tokens == total
    assert plan.reasoning_budget == total - 4000
    assert plan.reasoning_control == "effort"


@pytest.mark.parametrize("provider,model,disabled,budget,expected", [
    ("ollama", "qwen3", False, None, 9000),
    ("ollama", "qwen3", False, 7000, 11000),
    ("anthropic", "claude-sonnet-4", False, None, 10000),
    ("gemini", "gemini-2.5-pro", False, None, 10000),
    ("openai", "gpt-4o", False, None, 4000),
    ("openrouter", "unknown/legacy", False, None, 10000),
    ("openrouter", "mistralai/mistral-large-4-0", True, None, 4000),
])
def test_legacy_presets_and_other_providers_keep_one_addition(provider, model, disabled, budget, expected):
    plan = resolve_plan(model, provider=provider, disable_thinking=disabled,
                        requested_max_tokens=4000, budget_override=budget)
    assert plan.max_tokens == expected


def test_numeric_reasoning_budget_keeps_the_legacy_transport(monkeypatch):
    capability = replace(catalog.capability_for(MODEL), supported_efforts=(), default_effort=None)
    monkeypatch.setattr(catalog, "_CACHE", {MODEL: capability})
    ai, _, _ = make_ai(monkeypatch)
    plan = ai._resolve_reasoning(MODEL, 4000, None, provider="openrouter")
    assert plan.max_tokens == 10000
    assert plan.reasoning_control == "token_budget"
    assert ai._openrouter_reasoning(MODEL) == {"enabled": True, "max_tokens": 6000}


@pytest.mark.parametrize("streaming", [False, True])
def test_catalog_limit_blocks_dispatch_without_shortening_profile_or_artifacts(monkeypatch, streaming):
    capability = replace(catalog.capability_for(MODEL), max_completion_tokens=16000)
    monkeypatch.setattr(catalog, "_CACHE", {MODEL: capability})
    plan = resolve_plan(MODEL, provider="openrouter", disable_thinking=False, requested_max_tokens=4000)
    assert plan.max_tokens == 16000
    assert plan.required_output_tokens == 32768
    with pytest.raises(ContextCapacityError, match="32768"):
        validate_output_capacity(plan)
    ai, create, _ = make_ai(monkeypatch)
    system = "[PROFILE]\nAll ten factors.\n[TURN CONTRACT]\nReturn the full goal and diagram."
    with pytest.raises(AIError, match="32768") as caught:
        if streaming:
            list(ai.stream_response("Read the complete profile", system, "generic", max_tokens=4000))
        else:
            ai.get_response("Read the complete profile", system, "generic", max_tokens=4000)
    from backend.chat_logic import is_empty_response_error
    assert not is_empty_response_error(caught.value)
    create.assert_not_called()
    assert ai.last_attempts[0]["reasoning_plan"]["response_headroom_tokens"] == 4000
    assert ai.last_attempts[0]["error_type"] == "ContextCapacityError"


def test_context_counts_total_once_and_respects_the_smaller_window(monkeypatch):
    capability = replace(catalog.capability_for(MODEL), context_length=34000)
    monkeypatch.setattr(catalog, "_CACHE", {MODEL: capability})
    config = {"model_context_profiles": {f"openrouter/{MODEL}": {"context_tokens": 50000}}}
    profile = context_profile(config, "openrouter", MODEL)
    assert profile["context_tokens"] == 34000
    system = "[PROFILE]\nAll scores and essential instructions.\n[GOAL]\nFull structured artifact."
    plan = resolve_plan(MODEL, provider="openrouter", disable_thinking=False, requested_max_tokens=4000)
    fitted, message, _, report = fit_context(system, "current", [], profile, plan.max_tokens)
    assert fitted == system and message == "current"
    assert report["total_tokens"] == estimate_tokens(system) + estimate_tokens("current") + 32768 + 256
    assert report["input_budget"] == 34000 - 32768 - 256
    with pytest.raises(ContextCapacityError):
        fit_context(system * 100, "current", [], profile, plan.max_tokens)


def response(content, reasoning, finish, usage):
    return NS(model=MODEL, usage=usage, choices=[NS(
        message=NS(content=content, reasoning=reasoning), finish_reason=finish)])


def chunks(content, reasoning, finish, usage):
    yield NS(model=MODEL, usage=None, choices=[NS(delta=NS(content=content, reasoning=reasoning), finish_reason=None)])
    yield NS(model=MODEL, usage=None, choices=[NS(delta=NS(content=None, reasoning=None), finish_reason=finish)])
    # Usage commonly arrives *after* the terminal choice in a separate chunk.
    yield NS(model=MODEL, usage=usage, choices=[])


@pytest.mark.parametrize("streaming", [False, True])
@pytest.mark.parametrize("content,reasoning,finish,tokens,status", [
    ("Visible answer.", "Thinking", "stop", (120, 100), "complete"),
    (None, "Thinking only", "stop", (120, 120), "reasoning_only"),
    ("  ", None, "stop", (0, 0), "empty"),
    ("Partial answer", "Thinking", "length", (120, 100), "length"),
    (None, "Thinking only", "length", (120, 120), "reasoning_exhausted"),
    (None, None, "length", (120, 120), "reasoning_exhausted"),
    (None, "Some thinking", "length", (120, 100), "length"),
    ("<think>Inline only</think>", None, "stop", (120, 120), "reasoning_only"),
])
def test_sync_and_stream_output_outcomes(monkeypatch, streaming, content, reasoning, finish, tokens, status):
    ai, create, reserve = make_ai(monkeypatch)
    usage = {"completion_tokens": tokens[0], "completion_tokens_details": {"reasoning_tokens": tokens[1]}}
    create.return_value = chunks(content, reasoning, finish, usage) if streaming else response(content, reasoning, finish, usage)
    output = []
    def invoke():
        if streaming:
            output.extend(ai.stream_response("question", "system", "generic", max_tokens=4000))
        else:
            output.append(ai.get_response("question", "system", "generic", max_tokens=4000))
    if status == "complete":
        invoke()
    else:
        with pytest.raises(AIError):
            invoke()
    assert ai.last_completion["status"] == status
    assert ai.last_completion["visible_output_tokens"] == tokens[0] - tokens[1]
    assert ai.last_attempts[0]["completion"] == ai.last_completion
    assert create.call_args.kwargs["max_tokens"] == 32768
    assert create.call_args.kwargs["extra_body"] == {"reasoning": {"effort": "medium"}}
    reserve.assert_not_called()
    if streaming and status == "length" and content:
        assert "".join(item.get("text", "") for item in output if item.get("type") == "content") == content


def test_stream_never_switches_model_after_visible_output(monkeypatch):
    ai, create, reserve = make_ai(monkeypatch, fallback=True)
    create.return_value = chunks("Partial answer", None, "length", None)
    output = []
    with pytest.raises(AIError):
        for item in ai.stream_response("question", "system", "generic", max_tokens=4000):
            output.append(item)
    assert "".join(item.get("text", "") for item in output) == "Partial answer"
    assert ai.last_completion["status"] == "length"
    reserve.assert_not_called()


@pytest.mark.parametrize("streaming", [False, True])
def test_reasoning_only_can_fallback_and_retains_first_attempt_diagnostics(monkeypatch, streaming):
    ai, create, reserve = make_ai(monkeypatch, fallback=True)
    usage = {"completion_tokens": 100, "completion_tokens_details": {"reasoning_tokens": 100}}
    create.return_value = chunks(None, "Thinking", "length", usage) if streaming else response(None, "Thinking", "length", usage)
    if streaming:
        result = "".join(i.get("text", "") for i in ai.stream_response("q", "s", "generic", max_tokens=4000) if i.get("type") == "content")
    else:
        result = ai.get_response("q", "s", "generic", max_tokens=4000)
    assert result == "Fallback answer."
    assert ai.last_attempts[0]["completion"]["status"] == "reasoning_exhausted"
    assert ai.last_attempts[1]["status"] == "succeeded"
    assert reserve.call_count == 1


def test_error_log_keeps_diagnostics_without_response_or_thinking_text(monkeypatch):
    from backend import chat_logic
    from backend.ai_service import generation_details
    monkeypatch.setattr(chat_logic, "code_for_identity", lambda *args: None)
    ai, create, _ = make_ai(monkeypatch)
    create.return_value = chunks("Partial answer", "Private thinking", "length", None)
    with pytest.raises(AIError):
        list(ai.stream_response("q", "s", "generic", max_tokens=4000))
    db = Mock()
    chat_logic.log_error(db, "fixture-session", "output limit", generation_details=generation_details(ai))
    entry = db.add.call_args.args[0]
    assert entry.details["completion"]["status"] == "length"
    assert entry.details["reasoning_plan"]["total_output_tokens"] == 32768
    assert "Private thinking" not in str(entry.details)
    assert "Partial answer" not in str(entry.details)
