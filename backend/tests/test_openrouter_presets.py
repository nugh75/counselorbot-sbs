"""Test unitari per la gestione dei preset e del reasoning su OpenRouter.

Verifica che i modelli OpenRouter con reasoning obbligatorio non falliscano con
HTTP 400 (Reasoning is mandatory for this endpoint and cannot be disabled) quando
il preset o lo step ha `disable_thinking=True`.
"""
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
    _is_openrouter_reasoning_error,
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
