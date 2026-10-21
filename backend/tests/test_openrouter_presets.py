"""Test unitari per la gestione dei preset e del reasoning su OpenRouter.

Verifica che i modelli OpenRouter con reasoning obbligatorio non falliscano con
HTTP 400 (Reasoning is mandatory for this endpoint and cannot be disabled) quando
il preset o lo step ha `disable_thinking=True`.
"""
import asyncio
from unittest.mock import MagicMock, patch
import pytest
from openai import BadRequestError
import httpx

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend import models
from backend.ai_service import (
    AIService,
    _is_openrouter_mandatory_reasoning_model,
    _mark_openrouter_mandatory_reasoning,
    _is_openrouter_reasoning_error,
    _OPENROUTER_MANDATORY_REASONING_MODELS,
)
from backend.reasoning_profiles import ReasoningPlan


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    for table in (models.Config, models.Log, models.ModelPreset, models.Counselor):
        table.__table__.create(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def _fake_bad_request_mandatory_reasoning() -> BadRequestError:
    req = httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions")
    resp = httpx.Response(
        400,
        request=req,
        json={"error": {"message": "Reasoning is mandatory for this endpoint and cannot be disabled.", "code": 400}},
    )
    return BadRequestError(
        message="Error code: 400 - {'error': {'message': 'Reasoning is mandatory for this endpoint and cannot be disabled.', 'code': 400}}",
        response=resp,
        body={"message": "Reasoning is mandatory for this endpoint and cannot be disabled.", "code": 400},
    )


def test_openrouter_mandatory_reasoning_detection():
    assert _is_openrouter_mandatory_reasoning_model("google/gemini-3.8-flash")
    assert _is_openrouter_mandatory_reasoning_model("deepseek/deepseek-r1")
    assert not _is_openrouter_mandatory_reasoning_model("mistralai/mistral-large-4-0")

    err = _fake_bad_request_mandatory_reasoning()
    assert _is_openrouter_reasoning_error(err)

    other_err = ValueError("Something else")
    assert not _is_openrouter_reasoning_error(other_err)


def test_openrouter_reasoning_payload(db):
    ai = AIService(db)

    # Quando il reasoning e' attivo, invia enabled=True e max_tokens se impostato
    ai._reasoning_plan = ReasoningPlan(enabled=True, reasoning_budget=2000, max_tokens=4000)
    extra = ai._openrouter_reasoning("google/gemini-3.8-flash")
    assert extra == {"enabled": True, "max_tokens": 2000}

    # Quando il reasoning e' spento su modello non-mandatory, invia enabled=False
    ai._reasoning_plan = ReasoningPlan(enabled=False, reasoning_budget=0, max_tokens=None)
    extra_non_mandatory = ai._openrouter_reasoning("mistralai/mistral-large-4-0")
    assert extra_non_mandatory == {"enabled": False}

    # Quando il reasoning e' spento su modello mandatory, omette reasoning (None)
    extra_mandatory = ai._openrouter_reasoning("google/gemini-3.8-flash")
    assert extra_mandatory is None


def test_call_openrouter_retries_on_mandatory_reasoning_error(db):
    ai = AIService(db)
    ai.config["api_key_openrouter"] = "test-key"
    ai._reasoning_plan = ReasoningPlan(enabled=False, reasoning_budget=0, max_tokens=None)

    fake_model = "test-provider/test-reasoner-unknown"
    assert not _is_openrouter_mandatory_reasoning_model(fake_model)

    # Simuliamo il primo tentativo che fallisce con 400 mandatory reasoning, e il retry che ha successo
    mock_success_response = MagicMock()
    mock_success_response.choices = [MagicMock(message=MagicMock(content="Risposta di test"))]
    mock_success_response.usage = MagicMock(prompt_tokens=10, completion_tokens=5, total_tokens=15)
    mock_success_response.model = fake_model

    err = _fake_bad_request_mandatory_reasoning()

    with patch("backend.ai_service.OpenAI") as mock_openai_cls:
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.side_effect = [err, mock_success_response]

        res = ai._call_openrouter("Ciao", "Sei un assistente", fake_model)
        assert res == "Risposta di test"

        # Verifica che siano state fatte due chiamate: la prima con extra_body, la seconda senza
        assert mock_client.chat.completions.create.call_count == 2
        call_1_kwargs = mock_client.chat.completions.create.call_args_list[0].kwargs
        call_2_kwargs = mock_client.chat.completions.create.call_args_list[1].kwargs

        assert "extra_body" in call_1_kwargs
        assert "extra_body" not in call_2_kwargs

        # Verifica che il modello sia stato memorizzato come mandatory
        assert _is_openrouter_mandatory_reasoning_model(fake_model)

        # Prossima chiamata: non invia nemmeno extra_body
        mock_client.chat.completions.create.side_effect = [mock_success_response]
        res2 = ai._call_openrouter("Ciao 2", "Sei un assistente", fake_model)
        assert res2 == "Risposta di test"
        call_3_kwargs = mock_client.chat.completions.create.call_args_list[2].kwargs
        assert "extra_body" not in call_3_kwargs


def test_stream_openrouter_retries_on_mandatory_reasoning_error(db):
    ai = AIService(db)
    ai.config["api_key_openrouter"] = "test-key"
    ai._reasoning_plan = ReasoningPlan(enabled=False, reasoning_budget=0, max_tokens=None)

    fake_stream_model = "test-provider/test-stream-reasoner"
    assert not _is_openrouter_mandatory_reasoning_model(fake_stream_model)

    err = _fake_bad_request_mandatory_reasoning()

    # Stream finto per il retry
    def fake_stream_chunks():
        chunk = MagicMock()
        chunk.choices = [MagicMock(delta=MagicMock(content="Chunk test", reasoning=None))]
        chunk.usage = None
        yield chunk

    with patch("backend.ai_service.OpenAI") as mock_openai_cls:
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.side_effect = [err, fake_stream_chunks()]

        items = list(ai._stream_openrouter("Ciao", "Sei un assistente", fake_stream_model))
        text = "".join(item["text"] for item in items if isinstance(item, dict) and item.get("type") == "content")
        assert "Chunk test" in text

        # Verifica che create sia stato chiamato 2 volte: la prima con extra_body, la seconda senza
        assert mock_client.chat.completions.create.call_count == 2
        c1 = mock_client.chat.completions.create.call_args_list[0].kwargs
        c2 = mock_client.chat.completions.create.call_args_list[1].kwargs
        assert "extra_body" in c1
        assert "extra_body" not in c2


def test_openrouter_reasoning_payload_uses_effort_from_catalog(db):
    ai = AIService(db)
    ai._reasoning_plan = ReasoningPlan(
        enabled=True, reasoning_budget=8000, max_tokens=10000, effort="high",
    )
    assert ai._openrouter_reasoning("anthropic/claude-sonnet-5.5") == {"effort": "high"}

    # Un modello che impone reasoning e una richiesta «off»: il piano ha già
    # risolto il livello minimo e il trasporto non invia una disattivazione.
    ai._reasoning_plan = ReasoningPlan(
        enabled=True, reasoning_budget=2500, max_tokens=4500,
        effort="low", requested_effort="off", effort_honored=False,
    )
    assert ai._openrouter_reasoning("google/gemini-4-argon") == {"effort": "low"}

    # Modello adattivo spento davvero (non mandatory): nessun effort inventato.
    ai._reasoning_plan = ReasoningPlan(
        enabled=False, reasoning_budget=0, max_tokens=1000, effort="none",
    )
    assert ai._openrouter_reasoning("anthropic/claude-haiku-5.5") == {"enabled": False}


def test_fallback_re_resolves_effort_for_each_attempt(db, monkeypatch):
    from backend import openrouter_capabilities
    from backend.openrouter_capabilities import OpenRouterCapability

    openrouter_capabilities.set_catalog({
        "vendor/mandatory": OpenRouterCapability(
            model="vendor/mandatory", mandatory=True,
            supported_efforts=("low", "high"), default_effort="high",
            supports_reasoning=True, supports_max_tokens=False,
            context_length=64000, max_completion_tokens=4096,
            supported_parameters=("reasoning", "reasoning_effort"),
        ),
        "vendor/optional": OpenRouterCapability(
            model="vendor/optional", mandatory=False,
            supported_efforts=("none", "high"), default_effort="high",
            supports_reasoning=True, supports_max_tokens=False,
            context_length=64000, max_completion_tokens=4096,
            supported_parameters=("reasoning", "reasoning_effort"),
        ),
    })
    try:
        ai = AIService(db)
        ai.disable_thinking = True
        seen = []

        def fake_attempt(provider, model, message, system, history, max_tokens, streaming):
            plan = ai._resolve_reasoning(
                model, requested_max_tokens=max_tokens,
                fallback_max_tokens=4096, provider=provider,
            )
            seen.append((model, plan.effort, plan.effort_honored, plan.enabled))

            def call(*_args, **_kwargs):
                return "" if model == "vendor/mandatory" else "ok"

            return {"call": call}, plan.max_tokens, message, system, history, {}

        monkeypatch.setattr(ai, "_attempt_input", fake_attempt)
        monkeypatch.setattr(ai, "_targets", lambda provider, model: [
            ("openrouter", "vendor/mandatory"),
            ("openrouter", "vendor/optional"),
        ])

        result = ai._response_with_fallback(
            "Ciao", "Sistema", "openrouter", "vendor/mandatory", 100, None, False,
        )
        assert result == "ok"
        assert seen == [
            ("vendor/mandatory", "low", False, True),
            ("vendor/optional", "none", True, False),
        ]
    finally:
        openrouter_capabilities.clear_cache()


def test_openrouter_omits_sampling_parameters_the_catalog_does_not_support(db):
    from backend import openrouter_capabilities
    from backend.openrouter_capabilities import OpenRouterCapability

    openrouter_capabilities.set_catalog({
        "vendor/no-temperature": OpenRouterCapability(
            model="vendor/no-temperature", mandatory=False,
            supported_efforts=("high",), default_effort="high",
            supports_reasoning=True, supports_max_tokens=True,
            context_length=64000, max_completion_tokens=4096,
            supported_parameters=("reasoning", "reasoning_effort", "max_tokens"),
        ),
    })
    try:
        ai = AIService(db)
        ai.config["api_key_openrouter"] = "test-key"
        ai.temperature = 0.7
        ai._reasoning_plan = ReasoningPlan(
            enabled=True, reasoning_budget=8000, max_tokens=10000, effort="high",
        )
        response = MagicMock()
        response.choices = [MagicMock(message=MagicMock(content="ok"))]
        response.usage = None
        response.model = "vendor/no-temperature"
        with patch("backend.ai_service.OpenAI") as mock_openai_cls:
            mock_openai_cls.return_value.chat.completions.create.return_value = response
            assert ai._call_openrouter("Ciao", "Sistema", "vendor/no-temperature") == "ok"
            kwargs = mock_openai_cls.return_value.chat.completions.create.call_args.kwargs
            assert "temperature" not in kwargs
            assert kwargs["extra_body"] == {"reasoning": {"effort": "high"}}
    finally:
        openrouter_capabilities.clear_cache()


@pytest.mark.parametrize("model,expected", [
    ("anthropic/claude-sonnet-5.5", "high"),
    ("openai/gpt-6.1-sol", "medium"),
    ("anthropic/claude-haiku-5.5", "medium"),
    ("google/gemini-4-argon", "medium"),
])
def test_target_models_receive_a_verifiable_catalog_effort(db, model, expected):
    ai = AIService(db)
    plan = ai._resolve_reasoning(
        model, requested_max_tokens=None, fallback_max_tokens=4096,
        provider="openrouter",
    )
    assert plan.enabled is True
    assert plan.effort == expected
    assert plan.effort_honored is True
    ai._reasoning_plan = plan
    assert ai._openrouter_reasoning(model) == {"effort": expected}


@pytest.mark.parametrize("model", [
    "anthropic/claude-sonnet-5.5", "openai/gpt-6.1-sol", "google/gemini-4-argon",
])
def test_mandatory_models_clamp_off_to_the_lowest_effort(db, model):
    ai = AIService(db)
    ai.disable_thinking = True
    plan = ai._resolve_reasoning(
        model, requested_max_tokens=None, fallback_max_tokens=4096,
        provider="openrouter",
    )
    assert plan.enabled is True
    assert plan.effort == "low"
    assert plan.effort_honored is False
    ai._reasoning_plan = plan
    assert ai._openrouter_reasoning(model) == {"effort": "low"}



def test_admin_models_exposes_catalog_capabilities(db, monkeypatch):
    from backend.routes import admin
    from backend import openrouter_capabilities
    from backend.openrouter_capabilities import OpenRouterCapability

    capability = OpenRouterCapability(
        model="vendor/model", mandatory=True,
        supported_efforts=("low", "high"), default_effort="high",
        supports_reasoning=True, supports_max_tokens=True,
        context_length=64000, max_completion_tokens=4096,
        supported_parameters=("reasoning", "reasoning_effort"),
    )

    class FakeAI:
        config = {}

        def __init__(self, _db):
            pass

        def list_models(self, _provider):
            return ["vendor/model"]

        def _get_api_key(self, _key):
            return "test-key"

    monkeypatch.setattr(admin, "AIService", FakeAI)
    monkeypatch.setattr(openrouter_capabilities, "refresh", lambda _key, force=False: {"vendor/model": capability})
    monkeypatch.setattr(openrouter_capabilities, "source", lambda: "catalog")

    payload = asyncio.run(admin.list_provider_models(
        provider="openrouter", refresh=True, current_user=MagicMock(), db=db,
    ))
    assert payload["capabilities"]["vendor/model"]["mandatory"] is True
    assert payload["capabilities"]["vendor/model"]["default_effort"] == "high"
    assert payload["capabilities_source"] == "catalog"
