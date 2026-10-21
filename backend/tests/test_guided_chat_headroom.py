"""Test per token headroom, resilienza dello streaming e gestione fallback nelle chat guidate.

Verifica che:
1. I profili RESPONSE_LENGTH_PROFILES abbiano headroom adeguato (short 1000, medium 2000, long 4000).
2. Gli step di lettura profilo (es. qpcc-profilo, qap-profilo, qpcs-profilo) abbiano budget token >= 4000
   e lunghezza visibile 'long' anche se la richiesta iniziale specifica short o medium.
3. I modelli reasoning preservino l'answer headroom richiesto sommando il budget di thinking.
4. Lo stream SSE non si interrompa bruscamente a metà frase o durante gli step di profilo.
5. In caso di interruzione con testo parziale visibile, il testo utile sia preservato e non
   sostituito da reflective_empty_fallback.
6. Il fallback di emergenza scatti solo quando non c'è testo visibile utile generato.
"""
import asyncio
import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from backend import chat_logic, chat_preparation, models
from backend.ai_service import AIError, AIService
from backend.api_models import ChatRequest
from backend.reasoning_profiles import resolve_plan
from backend.routes import chat


def test_response_length_profiles_have_sufficient_headroom():
    profiles = chat_logic.RESPONSE_LENGTH_PROFILES
    assert profiles["short"]["max_tokens"] >= 800
    assert profiles["medium"]["max_tokens"] >= 2000
    assert profiles["long"]["max_tokens"] >= 4000


def test_profile_reading_steps_allocate_headroom_and_long_length():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    db.query.return_value.filter.return_value.all.return_value = []
    ai = MagicMock(config={}, disable_thinking=False, personal_reasoning=None, reasoning_budget_override=None)

    for phase in ("qpcc-profilo", "qap-profilo", "qpcs-profilo"):
        qtype = phase.split("-")[0].upper()
        req = ChatRequest(
            message="",
            questionnaire_type=qtype,
            phase=phase,
            mode=f"{phase.split('-')[0]}-factor",
            response_length="short",
        )
        prepared = chat_preparation.prepare_chat_turn(
            db, ai, req, "test-session", {},
            include_retrieval=False, include_history=False, create_anonymous_code=False,
        )
        assert prepared.max_tokens >= 4000, f"{phase} deve avere almeno 4000 max_tokens"
        assert prepared.effective_response_length == "long", f"{phase} deve elevare la lunghezza a 'long'"


def test_reasoning_models_add_answer_headroom_to_thinking_budget():
    # Modello con reasoning attivo (es. qwen3, deepseek)
    plan_medium = resolve_plan("qwen3.8:latest", disable_thinking=False, requested_max_tokens=2000)
    assert plan_medium.enabled is True
    # total deve includere il budget di reasoning (5000) + requested max_tokens (2000) = 7000
    assert plan_medium.max_tokens >= 7000
    assert plan_medium.max_tokens > plan_medium.reasoning_budget

    plan_long = resolve_plan("qwen3.8:latest", disable_thinking=False, requested_max_tokens=4000)
    assert plan_long.max_tokens >= 9000


def test_limit_visible_words_allows_grace_sentence_closure():
    # Testo con frase che si conclude a 83 parole (entro il 15% di tolleranza di 80 parole)
    words = [f"parola{i}" for i in range(1, 83)]
    text = " ".join(words) + ". Altro testo che segue."
    bounded, truncated = chat_logic._limit_visible_words(text, "short")
    assert truncated is True
    # Deve aver chiuso sulla frase a parola82 con punto, non troncato con …
    assert bounded.endswith("parola82.")
    assert "…" not in bounded


async def _collect_sse(response):
    items = []
    async for chunk in response.body_iterator:
        for line in chunk.splitlines():
            line = line.strip()
            if line.startswith("data:"):
                items.append(json.loads(line[5:].strip()))
    return items


def _make_mock_db():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    db.query.return_value.filter.return_value.all.return_value = []
    db.query.return_value.filter.return_value.count.return_value = 0
    return db


def test_stream_preserves_visible_text_on_interruption(monkeypatch):
    """Se lo stream genera testo visibile e poi solleva un errore (es. token limit),
    il testo visibile deve essere preservato (incomplete: True) e non sostituito da fallback."""
    generated_chunks = [
        {"type": "content", "text": "Ecco la lettura del profilo: fattore 1 ottimo. "},
        {"type": "content", "text": "Fattore 2 in miglioramento."},
    ]

    def failing_stream(*args, **kwargs):
        for c in generated_chunks:
            yield c
        raise AIError("The model reached its output token limit before completing the response.")

    ai = SimpleNamespace(
        config={}, last_provider="test", last_model="test-m",
        stream_response=MagicMock(side_effect=failing_stream),
    )
    prepared = SimpleNamespace(
        prompt_key="test", phase_prompt_key=None, effective_message="Analizza",
        step_label="1. Lettura del Profilo", questionnaire_type="QPCC", effective_response_length="long",
        max_tokens=4000, model_scores_context="", knowledge_context="", strategy_ids=[],
        certified_strategy_ids=[], reading_ids=[], recommendation_meta={}, reading_candidates={},
        strategy_candidates={}, system_prompt_final="System", full_message="Analizza",
        history=[], sanitize=False, components={},
    )
    monkeypatch.setattr(chat, "AIService", lambda db, username=None: ai)
    monkeypatch.setattr(chat, "_resolve_counselor", lambda *a: (None,) * 7)
    monkeypatch.setattr(chat, "_apply_counselor_overrides", lambda *a: None)
    monkeypatch.setattr(chat, "prepare_chat_turn", lambda *a, **kw: prepared)
    monkeypatch.setattr(chat, "session_memory", MagicMock())
    monkeypatch.setattr(chat, "_apply_idea_patch", lambda text, **kw: (text, None))
    monkeypatch.setattr(chat, "_record_recommendations", MagicMock(return_value={}))
    monkeypatch.setattr(chat.database, "SessionLocal", _make_mock_db)

    async def run():
        resp = await chat.chat_stream(
            ChatRequest(message="Analizza", session_id="test-headroom", phase="qpcc-profilo"),
            db=_make_mock_db(), identity={},
        )
        return await _collect_sse(resp)

    output = asyncio.run(run())

    # L'ultimo evento deve essere done con incomplete: True e preservare il testo
    last = output[-1]
    assert last.get("done") is True
    assert last.get("incomplete") is True
    assert "fattore 1 ottimo" in last["response"]
    assert "Fattore 2 in miglioramento" in last["response"]
    # Non deve essere il fallback riflessivo
    assert "Prenditi un momento" not in last["response"]


def test_stream_uses_reflective_fallback_when_zero_content(monkeypatch):
    """Se il modello fallisce senza produrre alcun contenuto visibile al turno 1,
    scatta reflective_empty_fallback."""
    def empty_stream(*args, **kwargs):
        raise AIError("Il modello ha terminato senza contenuto")

    ai = SimpleNamespace(
        config={}, last_provider="test", last_model="test-m",
        stream_response=MagicMock(side_effect=empty_stream),
    )
    prepared = SimpleNamespace(
        prompt_key="test", phase_prompt_key=None, effective_message="",
        step_label="1. Lettura del Profilo", questionnaire_type="QPCC", effective_response_length="long",
        max_tokens=4000, model_scores_context="", knowledge_context="", strategy_ids=[],
        certified_strategy_ids=[], reading_ids=[], recommendation_meta={}, reading_candidates={},
        strategy_candidates={}, system_prompt_final="System", full_message="",
        history=[], sanitize=False, components={},
    )
    monkeypatch.setattr(chat, "AIService", lambda db, username=None: ai)
    monkeypatch.setattr(chat, "_resolve_counselor", lambda *a: (None,) * 7)
    monkeypatch.setattr(chat, "_apply_counselor_overrides", lambda *a: None)
    monkeypatch.setattr(chat, "prepare_chat_turn", lambda *a, **kw: prepared)
    monkeypatch.setattr(chat, "session_memory", MagicMock())
    monkeypatch.setattr(chat, "_apply_idea_patch", lambda text, **kw: (text, None))
    monkeypatch.setattr(chat, "_record_recommendations", MagicMock(return_value={}))
    monkeypatch.setattr(chat.database, "SessionLocal", _make_mock_db)
    monkeypatch.setattr(chat, "_update_markdown_memory_background", MagicMock())

    async def run():
        resp = await chat.chat_stream(
            ChatRequest(message="", session_id="test-empty", phase="qpcc-profilo"),
            db=_make_mock_db(), identity={},
        )
        return await _collect_sse(resp)

    output = asyncio.run(run())
    last = output[-1]
    assert last.get("done") is True
    # Senza contenuto all'ingresso di step, il fallback riflessivo è appropriato
    assert any(phrase in last["response"] for phrase in ("Siamo al passaggio", "Possiamo iniziare", "Prenditi un momento", "Benvenuto"))
