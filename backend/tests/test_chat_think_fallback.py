"""Test — Fallback per risposta vuota e rimozione tag <think> dallo stream e dalla risposta sync.

Verifica i 4 requisiti chiave (compito F5):
(a) rimozione completa di <think> sia parziale durante lo streaming sia a fine risposta,
(b) fallback automatico quando il testo emesso è solo <think>ragionamento...</think>,
(c) fallback automatico quando il testo emesso è vuoto o whitespace,
(d) conservazione intatta della risposta normale quando non ci sono tag <think>.
"""
import asyncio
import json
import os
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from backend.ai_service import AIError
from backend.api_models import ChatRequest
from backend.chat_logic import (
    ThinkStreamSplitter,
    is_empty_response_error,
    reflective_empty_fallback,
    strip_thinking,
)
from backend.routes import chat


# -----------------------------------------------------------------------------
# Helper per consumare risposte SSE
# -----------------------------------------------------------------------------
async def parse_sse_events(streaming_response):
    events = []
    async for chunk in streaming_response.body_iterator:
        for line in chunk.splitlines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
    return events


# -----------------------------------------------------------------------------
# Unit test sulle funzioni di chat_logic
# -----------------------------------------------------------------------------
def test_strip_thinking_complete_and_variants():
    # Tag think standard
    assert strip_thinking("<think>ragionamento</think>Ecco la risposta.") == "Ecco la risposta."
    # Tag alternativi (thinking, sto_pensando)
    assert strip_thinking("<thinking>analisi</thinking>Testo visibile.") == "Testo visibile."
    assert strip_thinking("<sto_pensando>riflessione</sto_pensando>Testo.") == "Testo."
    # Multipli blocchi
    assert strip_thinking("<think>uno</think>Parte 1 <think>due</think>Parte 2") == "Parte 1 Parte 2"


def test_strip_thinking_open_and_orphan():
    # Blocco troncato/aperto
    assert strip_thinking("Intro visibile.\n<think>troncato prima di chiudere") == "Intro visibile."
    # Chiusura orfana all'inizio (tutto ciò che precede </think> è rimosso come reasoning)
    assert strip_thinking("ragionamento senza apertura</think>Risposta vera.") == "Risposta vera."
    assert strip_thinking("ragionamento orfano </think> Dopo") == "Dopo"


def test_strip_thinking_empty_when_only_think_or_whitespace():
    assert strip_thinking("<think>solo reasoning interiore</think>") == ""
    assert strip_thinking("<think>interrotto") == ""
    assert strip_thinking("   \n\t  ") == ""
    assert strip_thinking("") == ""


def test_strip_thinking_preserves_normal_text():
    normal = "Questa è una normale risposta di counseling senza tag."
    assert strip_thinking(normal) == normal


def test_reflective_empty_fallback_languages():
    # Con step_label
    step = "Fattore C1: Elaborazione"
    assert "C1" in reflective_empty_fallback(step, "it")
    assert "Prenditi un momento" in reflective_empty_fallback(step, "it")
    assert "Take a moment" in reflective_empty_fallback(step, "en")
    assert "Tómate un momento" in reflective_empty_fallback(step, "es")
    assert "Prenez un moment" in reflective_empty_fallback(step, "fr")
    assert "Nimm dir einen Moment" in reflective_empty_fallback(step, "de")
    assert "Ta en stund" in reflective_empty_fallback(step, "sv")

    # Senza step_label (chat aperta)
    assert "riflettere" in reflective_empty_fallback(None, "it")
    assert "reflect" in reflective_empty_fallback(None, "en")


def test_reflective_empty_fallback_step_entry():
    """All'avvio di uno step (is_entry=True), il fallback deve introdurre il tema
    e non chiedere a vuoto 'da dove preferisci riprendere la riflessione'."""
    res_it = reflective_empty_fallback("2. Comunicazione in Pubblico", "it", is_entry=True)
    assert "Siamo al passaggio su 2. Comunicazione in Pubblico" in res_it
    assert "Possiamo iniziare" in res_it
    assert "da dove preferisci riprendere" not in res_it

    res_en = reflective_empty_fallback("2. Public Speaking", "en", is_entry=True)
    assert "We are now focusing on 2. Public Speaking" in res_en
    assert "where would you like to resume" not in res_en


def test_reflective_empty_fallback_patto_step_zero():
    """Al Passo 0 (Patto di Collaborazione), il fallback all'ingresso deve dare il benvenuto
    e proporre di partire, senza presupporre una riflessione già avviata."""
    res_it = reflective_empty_fallback("0. Patto di Collaborazione", "it", is_entry=True)
    assert "Benvenuto/a" in res_it
    assert "0. Patto di Collaborazione" in res_it
    assert "possiamo partire?" in res_it
    assert "da dove preferisci riprendere" not in res_it

    res_en = reflective_empty_fallback("0. Collaboration Agreement", "en", is_entry=True)
    assert "Welcome" in res_en
    assert "0. Collaboration Agreement" in res_en
    assert "ready to start?" in res_en


def test_is_empty_response_error():
    assert is_empty_response_error(AIError("Il modello ha terminato senza contenuto"))
    assert is_empty_response_error(AIError("Il modello ha restituito una risposta vuota"))
    assert is_empty_response_error(AIError("Nessun modello configurato ha completato la risposta (AIError)"))
    assert is_empty_response_error(AIError("The provider returned no continuation."))
    assert is_empty_response_error(AIError("senza contenuto visibile"))
    assert not is_empty_response_error(AIError("Invalid API key"))


# -----------------------------------------------------------------------------
# Fixture per mockare il turno di chat
# -----------------------------------------------------------------------------
@pytest.fixture
def mock_chat_context(monkeypatch):
    persist = MagicMock()
    monkeypatch.setattr(chat, "session_memory", MagicMock())
    monkeypatch.setattr(chat, "_update_markdown_memory_background", persist)
    monkeypatch.setattr(chat, "_resolve_counselor", lambda *a: (None,) * 7)
    monkeypatch.setattr(chat, "_apply_counselor_overrides", lambda *a: None)
    monkeypatch.setattr(chat, "_apply_idea_patch", lambda text, **kw: (text, None))
    monkeypatch.setattr(chat, "_record_recommendations", MagicMock(return_value={}))
    monkeypatch.setattr(chat.database, "SessionLocal", MagicMock())
    monkeypatch.setattr(chat.class_access, "require_chat_turn", lambda *a, **kw: None)
    monkeypatch.setattr(chat.class_access, "require_counselor", lambda *a, **kw: None)
    monkeypatch.setattr(chat.personal_api, "bind_counselor", lambda *a, **kw: None)
    return persist


def _make_prepared(step_label="Passo 1: Riflessione", questionnaire_type="QSA"):
    return SimpleNamespace(
        prompt_key="test_prompt",
        phase_prompt_key=None,
        effective_message="Come posso migliorare?",
        step_label=step_label,
        questionnaire_type=questionnaire_type,
        effective_response_length=None,
        max_tokens=800,
        model_scores_context="",
        knowledge_context="",
        strategy_ids=[],
        certified_strategy_ids=[],
        reading_ids=[],
        recommendation_meta={},
        reading_candidates={},
        strategy_candidates={},
        system_prompt_final="System prompt",
        full_message="Come posso migliorare?",
        history=[],
        sanitize=False,
        components={},
        component_options={"certified_strategy_limit": 0},
        component_flags={"certified_strategies": True},
        hypothesis_allowed=False,
        phase_codes=[],
    )


# -----------------------------------------------------------------------------
# Test STREAMING (/chat/stream)
# -----------------------------------------------------------------------------
def test_stream_think_removal_chunk_by_chunk_and_final(monkeypatch, mock_chat_context):
    """(a) Rimozione completa di <think> sia parziale durante streaming sia a fine risposta."""
    # Chunk spezzettati con tag spezzati tra chunk
    chunks = [
        "<th",
        "ink>inizio ragionamento ",
        "intermedio</th",
        "ink>Ecco ",
        "la risposta ",
        "visibile.",
    ]
    ai = SimpleNamespace(
        config={},
        last_provider="test_provider",
        last_model="test_model",
        stream_response=MagicMock(return_value=iter(chunks)),
        get_response=MagicMock(return_value=""),
    )
    monkeypatch.setattr(chat, "AIService", lambda db, username=None: ai)
    monkeypatch.setattr(chat, "prepare_chat_turn", lambda *a, **kw: _make_prepared())

    req = ChatRequest(message="Come posso migliorare?", session_id="stream-think-test", language="it")
    resp = asyncio.run(chat.chat_stream(req, db=MagicMock(), identity={}))
    events = asyncio.run(parse_sse_events(resp))

    # Verifica eventi intermedi: nessun display o delta deve contenere tag <think> o 'ragionamento'
    displays = [e["display"] for e in events if "display" in e]
    deltas = [e["delta"] for e in events if "delta" in e]
    for d in displays + deltas:
        assert "<think>" not in d
        assert "</think>" not in d
        assert "ragionamento" not in d

    # L'ultimo display deve essere esattamente il testo visibile
    assert displays[-1] == "Ecco la risposta visibile."

    # L'evento finale done deve avere la risposta visibile senza tracce di think
    done_event = events[-1]
    assert done_event.get("done") is True
    assert done_event.get("response") == "Ecco la risposta visibile."
    assert "<think>" not in done_event.get("response")

    # Persistenza in session_memory deve contenere la risposta pulita
    mock_chat_context.assert_called_once()
    saved_response = mock_chat_context.call_args.args[2]
    assert saved_response == "Ecco la risposta visibile."


def test_stream_fallback_when_only_think(monkeypatch, mock_chat_context):
    """(b) Fallback automatico quando il testo emesso è solo <think>ragionamento...</think>."""
    chunks = [
        "<think>",
        "sto elaborando mentalmente la strategia ideale ma non emetto testo visibile",
        "</think>",
    ]
    ai = SimpleNamespace(
        config={},
        last_provider="test_provider",
        last_model="test_model",
        stream_response=MagicMock(return_value=iter(chunks)),
        get_response=MagicMock(return_value=""),  # retry restituisce vuoto
    )
    monkeypatch.setattr(chat, "AIService", lambda db, username=None: ai)
    step_label = "Fattore C1: Elaborazione"
    monkeypatch.setattr(chat, "prepare_chat_turn", lambda *a, **kw: _make_prepared(step_label=step_label))

    req = ChatRequest(message="Aiutami", session_id="stream-only-think-test", language="it")
    resp = asyncio.run(chat.chat_stream(req, db=MagicMock(), identity={}))
    events = asyncio.run(parse_sse_events(resp))

    # Nessun errore deve essere emesso
    assert not any("error" in e for e in events)

    # Evento done finale
    done_event = events[-1]
    assert done_event.get("done") is True
    final_response = done_event.get("response")

    # La risposta finale deve essere il fallback gentile contestualizzato sullo step
    assert len(final_response) > 0
    assert "<think>" not in final_response
    assert "Prenditi un momento" in final_response
    assert "Fattore C1: Elaborazione" in final_response

    # Salvataggio in transcript/session_memory
    mock_chat_context.assert_called_once()
    assert mock_chat_context.call_args.args[2] == final_response


def test_stream_fallback_when_empty_or_whitespace(monkeypatch, mock_chat_context):
    """(c) Fallback automatico quando il testo emesso è vuoto o whitespace."""
    chunks = ["   ", "\n\t  ", "  "]
    ai = SimpleNamespace(
        config={},
        last_provider="test_provider",
        last_model="test_model",
        stream_response=MagicMock(return_value=iter(chunks)),
        get_response=MagicMock(return_value=""),
    )
    monkeypatch.setattr(chat, "AIService", lambda db, username=None: ai)
    step_label = "Passo 2: Strategie"
    monkeypatch.setattr(chat, "prepare_chat_turn", lambda *a, **kw: _make_prepared(step_label=step_label))

    req = ChatRequest(message="Come faccio?", session_id="stream-empty-test", language="it")
    resp = asyncio.run(chat.chat_stream(req, db=MagicMock(), identity={}))
    events = asyncio.run(parse_sse_events(resp))

    assert not any("error" in e for e in events)
    done_event = events[-1]
    assert done_event.get("done") is True
    final_response = done_event.get("response")
    assert "Prenditi un momento" in final_response
    assert "Passo 2: Strategie" in final_response
    mock_chat_context.assert_called_once()


def test_stream_fallback_when_provider_raises_empty_error(monkeypatch, mock_chat_context):
    """(c2) Fallback automatico quando il provider solleva errore di risposta vuota."""
    def fail_stream(*a, **kw):
        raise AIError("Il modello ha terminato senza contenuto")

    ai = SimpleNamespace(
        config={},
        last_provider="test_provider",
        last_model="test_model",
        stream_response=fail_stream,
        get_response=MagicMock(return_value=""),
    )
    monkeypatch.setattr(chat, "AIService", lambda db, username=None: ai)
    step_label = "Fase finale"
    monkeypatch.setattr(chat, "prepare_chat_turn", lambda *a, **kw: _make_prepared(step_label=step_label))

    req = ChatRequest(message="Concludi", session_id="stream-err-test", language="en")
    resp = asyncio.run(chat.chat_stream(req, db=MagicMock(), identity={}))
    events = asyncio.run(parse_sse_events(resp))

    # Non deve mandare {"error": ...} ma completare con fallback in lingua inglese
    assert not any("error" in e for e in events)
    done_event = events[-1]
    assert done_event.get("done") is True
    assert "Take a moment" in done_event.get("response")
    assert "Fase finale" in done_event.get("response")


def test_stream_preserves_normal_response(monkeypatch, mock_chat_context):
    """(d) Conservazione intatta della risposta normale quando non ci sono tag <think>."""
    chunks = ["Il metodo di studio ", "richiede costanza ", "e riflessione attiva."]
    ai = SimpleNamespace(
        config={},
        last_provider="test_provider",
        last_model="test_model",
        stream_response=MagicMock(return_value=iter(chunks)),
        get_response=MagicMock(return_value=""),
    )
    monkeypatch.setattr(chat, "AIService", lambda db, username=None: ai)
    monkeypatch.setattr(chat, "prepare_chat_turn", lambda *a, **kw: _make_prepared())

    req = ChatRequest(message="Consigli?", session_id="stream-normal-test", language="it")
    resp = asyncio.run(chat.chat_stream(req, db=MagicMock(), identity={}))
    events = asyncio.run(parse_sse_events(resp))

    done_event = events[-1]
    assert done_event.get("done") is True
    expected = "Il metodo di studio richiede costanza e riflessione attiva."
    assert done_event.get("response") == expected
    assert mock_chat_context.call_args.args[2] == expected


# -----------------------------------------------------------------------------
# Test SINCRONO (/chat)
# -----------------------------------------------------------------------------
def test_sync_chat_strips_think(monkeypatch, mock_chat_context):
    """(a-sync) Rimozione di <think> nella risposta sincrona."""
    raw = "<think>Analisi interna dello studente</think>Ecco il suggerimento pratico."
    ai = SimpleNamespace(
        config={},
        last_provider="test_provider",
        last_model="test_model",
        get_response=MagicMock(return_value=raw),
    )
    monkeypatch.setattr(chat, "AIService", lambda db, username=None: ai)
    monkeypatch.setattr(chat, "prepare_chat_turn", lambda *a, **kw: _make_prepared())

    from fastapi import BackgroundTasks
    req = ChatRequest(message="Cosa faccio?", session_id="sync-think-test", language="it")
    res = asyncio.run(chat.chat(req, BackgroundTasks(), db=MagicMock(), identity={}))

    assert res["response"] == "Ecco il suggerimento pratico."
    assert "<think>" not in res["response"]
    assert mock_chat_context.call_args.args[2] == "Ecco il suggerimento pratico."


def test_sync_chat_fallback_when_only_think(monkeypatch, mock_chat_context):
    """(b-sync) Fallback su risposta sincrona contenente solo <think>."""
    raw = "<think>ragionamento senza risposta finale</think>"
    ai = SimpleNamespace(
        config={},
        last_provider="test_provider",
        last_model="test_model",
        get_response=MagicMock(return_value=raw),
    )
    monkeypatch.setattr(chat, "AIService", lambda db, username=None: ai)
    step_label = "Fattore Motiva"
    monkeypatch.setattr(chat, "prepare_chat_turn", lambda *a, **kw: _make_prepared(step_label=step_label))

    from fastapi import BackgroundTasks
    req = ChatRequest(message="Aiuto", session_id="sync-only-think-test", language="it")
    res = asyncio.run(chat.chat(req, BackgroundTasks(), db=MagicMock(), identity={}))

    assert len(res["response"]) > 0
    assert "<think>" not in res["response"]
    assert "Prenditi un momento" in res["response"]
    assert "Fattore Motiva" in res["response"]
    assert mock_chat_context.call_args.args[2] == res["response"]


def test_sync_chat_fallback_when_empty_or_whitespace(monkeypatch, mock_chat_context):
    """(c-sync) Fallback su risposta sincrona vuota o whitespace."""
    raw = "   \n\t   "
    ai = SimpleNamespace(
        config={},
        last_provider="test_provider",
        last_model="test_model",
        get_response=MagicMock(return_value=raw),
    )
    monkeypatch.setattr(chat, "AIService", lambda db, username=None: ai)
    monkeypatch.setattr(chat, "prepare_chat_turn", lambda *a, **kw: _make_prepared(step_label="Pianificazione"))

    from fastapi import BackgroundTasks
    req = ChatRequest(message="Prosegui", session_id="sync-empty-test", language="it")
    res = asyncio.run(chat.chat(req, BackgroundTasks(), db=MagicMock(), identity={}))

    assert len(res["response"]) > 0
    assert "Prenditi un momento" in res["response"]
    assert "Pianificazione" in res["response"]
    assert mock_chat_context.call_args.args[2] == res["response"]


def test_sync_chat_fallback_when_ai_error_empty(monkeypatch, mock_chat_context):
    """(c2-sync) Fallback su eccezione di risposta vuota invece di 502."""
    def fail_call(*a, **kw):
        raise AIError("Il modello ha restituito una risposta vuota")

    ai = SimpleNamespace(
        config={},
        last_provider="test_provider",
        last_model="test_model",
        get_response=fail_call,
    )
    monkeypatch.setattr(chat, "AIService", lambda db, username=None: ai)
    monkeypatch.setattr(chat, "prepare_chat_turn", lambda *a, **kw: _make_prepared(step_label=None))

    from fastapi import BackgroundTasks
    req = ChatRequest(message="Dimmi", session_id="sync-err-test", language="it")
    res = asyncio.run(chat.chat(req, BackgroundTasks(), db=MagicMock(), identity={}))

    assert len(res["response"]) > 0
    assert "Prenditi un momento per riflettere" in res["response"]


def test_sync_chat_preserves_normal_response(monkeypatch, mock_chat_context):
    """(d-sync) Conservazione intatta della risposta normale sincrona."""
    expected = "Questa è una risposta eccellente e completa per lo studente."
    ai = SimpleNamespace(
        config={},
        last_provider="test_provider",
        last_model="test_model",
        get_response=MagicMock(return_value=expected),
    )
    monkeypatch.setattr(chat, "AIService", lambda db, username=None: ai)
    monkeypatch.setattr(chat, "prepare_chat_turn", lambda *a, **kw: _make_prepared())

    from fastapi import BackgroundTasks
    req = ChatRequest(message="Come fare?", session_id="sync-normal-test", language="it")
    res = asyncio.run(chat.chat(req, BackgroundTasks(), db=MagicMock(), identity={}))

    assert res["response"] == expected
    assert mock_chat_context.call_args.args[2] == expected
