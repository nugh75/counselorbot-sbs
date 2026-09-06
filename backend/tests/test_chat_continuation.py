import asyncio
import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

from backend.api_models import ChatRequest, SiteChatRequest, OpencodeChatRequest
from backend.chat_continuation import continuation_message
from backend.routes import chat, site_chat


async def events(response):
    return [json.loads(chunk.removeprefix("data: ").strip()) async for chunk in response.body_iterator]


@pytest.mark.parametrize("model,values", [
    (ChatRequest, {}), (SiteChatRequest, {}), (OpencodeChatRequest, {"session_id": "s"}),
])
def test_partial_answer_is_bounded_at_the_api_boundary(model, values):
    with pytest.raises(ValidationError):
        model(**values, partial_response="x" * 60001)


def test_continuation_quotes_the_partial_and_preserves_the_original_question():
    assert continuation_message("Question", "") == "Question"
    prompt = continuation_message("Question", 'Text\n"quoted"')
    assert prompt.startswith("Question\n\n")
    assert json.loads(prompt.splitlines()[-1]) == 'Text\n"quoted"'


@pytest.mark.parametrize("suffix", [" verifica.", ""])
def test_guided_continuation_streams_and_persists_one_complete_answer(monkeypatch, suffix):
    ai = SimpleNamespace(config={}, last_provider=None, last_model=None,
                         stream_response=MagicMock(return_value=iter([suffix])))
    prepared = SimpleNamespace(
        prompt_key="test", phase_prompt_key=None, effective_message="Come studio?",
        step_label=None, questionnaire_type="QSA", effective_response_length="short",
        max_tokens=900, model_scores_context="", knowledge_context="", strategy_ids=[],
        certified_strategy_ids=[], reading_ids=[], recommendation_meta={}, reading_candidates={},
        strategy_candidates={}, system_prompt_final="Italian", full_message="Come studio?",
        history=[], sanitize=False, components={},
    )
    monkeypatch.setattr(chat, "AIService", lambda db: ai)
    monkeypatch.setattr(chat, "_resolve_counselor", lambda *a: (None,) * 6)
    monkeypatch.setattr(chat, "_apply_counselor_overrides", lambda *a: None)
    monkeypatch.setattr(chat, "prepare_chat_turn", lambda *a, **kw: prepared)
    monkeypatch.setattr(chat, "session_memory", MagicMock())
    monkeypatch.setattr(chat, "_apply_idea_patch", lambda text, **kw: (text, None))
    monkeypatch.setattr(chat, "_record_recommendations", lambda *a, **kw: {})
    monkeypatch.setattr(chat.database, "SessionLocal", MagicMock())
    persist = MagicMock()
    monkeypatch.setattr(chat, "_update_markdown_memory_background", persist)

    async def run():
        response = await chat.chat_stream(ChatRequest(message="Come studio?", session_id="continuation-test",
            partial_response="Studia e", response_length="short"), db=MagicMock(), identity={})
        return await events(response)

    output = asyncio.run(run())
    assert output[0]["session_id"] == "continuation-test"
    if suffix:
        assert output[-1]["done"] is True
        assert output[-1]["response"] == "Studia e verifica."
        assert persist.call_count == 1
        assert persist.call_args.args[1:3] == ("Come studio?", "Studia e verifica.")
        assert json.loads(ai.stream_response.call_args.args[0].splitlines()[-1]) == "Studia e"
    else:
        assert "error" in output[-1]
        persist.assert_not_called()


def test_site_continuation_uses_original_question_for_retrieval_and_saves_complete_answer(monkeypatch):
    ai = SimpleNamespace(config={}, stream_response=MagicMock(return_value=iter([" verifica."])))
    index = SimpleNamespace(search=MagicMock(return_value=[{"source": "test"}]))
    monkeypatch.setattr(site_chat, "AIService", lambda db: ai)
    monkeypatch.setattr(site_chat, "get_index", lambda collection: index)
    monkeypatch.setattr(site_chat, "_resolve_site_prompt", lambda *a: "Italian")
    monkeypatch.setattr(site_chat, "_apply_language_directive", lambda text, *a, **kw: text)
    monkeypatch.setattr(site_chat, "_resolve_counselor", lambda *a: (None, None))
    monkeypatch.setattr(site_chat, "_portfolio_context", lambda *a: "")
    monkeypatch.setattr(site_chat, "_top_k", lambda ai: 3)
    monkeypatch.setattr(site_chat, "_retrieval_params", lambda ai: ({}, {}, 2, 0))
    monkeypatch.setattr(site_chat, "_filter_single_instrument_results", lambda q, rows: rows)
    monkeypatch.setattr(site_chat, "build_context", lambda rows: ("Materials", ["test"]))
    memory = MagicMock()
    memory.get_relevant_context.return_value = ""
    monkeypatch.setattr(site_chat, "session_memory", memory)
    monkeypatch.setattr(site_chat.database, "SessionLocal", MagicMock())

    async def run():
        response = await site_chat.site_chat_stream(SiteChatRequest(message="Come studio?",
            partial_response="Studia e", session_id="continuation-test"), current_user={}, db=MagicMock())
        return await events(response)

    output = asyncio.run(run())
    assert index.search.call_args.args[1] == "Come studio?"
    assert output[-1]["response"] == "Studia e verifica."
    assert memory.record_interaction.call_count == 1
    assert memory.record_interaction.call_args.kwargs["bot_response"] == "Studia e verifica."


def test_opencode_restore_hides_internal_continuation_turn_and_joins_answer(tmp_path, monkeypatch):
    from backend.routes import opencode

    workspace = tmp_path / "test"
    workspace.mkdir()
    (workspace / ".opencode-session").write_text("ses_test123")
    monkeypatch.setattr(opencode, "OPENCODE_WS_ROOT", str(tmp_path))
    turns = [("user", "Come studio?"), ("assistant", "Studia e"),
             ("user", continuation_message("Come studio?", "Studia e")), ("assistant", " verifica.")]

    async def api(config, method, path, **kwargs):
        return [{"info": {"role": role}, "parts": [{"type": "text", "text": text}]} for role, text in turns] if path.endswith("/message?directory=%2Fwork") else {}

    monkeypatch.setattr(opencode, "_api_json", api)
    _, history, needs_seed = asyncio.run(opencode._ensure_opencode_session("test", {}))
    assert history == [{"role": "user", "content": "Come studio?"}, {"role": "assistant", "content": "Studia e verifica."}]
    assert not needs_seed
