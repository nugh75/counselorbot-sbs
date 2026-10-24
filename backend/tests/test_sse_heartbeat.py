"""SSE transport regressions without a database, provider or 15-second sleeps."""
import asyncio
from contextlib import asynccontextmanager
import json
import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend import sse


@pytest.mark.parametrize("asynchronous", [False, True], ids=["sync", "async"])
def test_silence_emits_repeated_pings_without_restarting_or_reading_ahead(asynchronous):
    async def check():
        release_sync, closed_sync = threading.Event(), threading.Event()
        release_async = asyncio.Event()
        advances = []

        def sync_source():
            try:
                yield 'data: {"session_id":"s"}\n\n'
                advances.append(1)
                assert release_sync.wait(2)
                yield b'data: {"done":true}\n\n'
                advances.append(2)
            finally:
                closed_sync.set()

        async def async_source():
            try:
                yield 'data: {"session_id":"s"}\n\n'
                advances.append(1)
                await release_async.wait()
                yield b'data: {"done":true}\n\n'
                advances.append(2)
            finally:
                closed_sync.set()

        stream = sse.heartbeat(async_source() if asynchronous else sync_source(), interval=.005)
        try:
            assert '"session_id"' in await anext(stream)
            assert advances == []
            for _ in range(3):
                assert await anext(stream) == ": ping\n\n"
            assert advances == [1]
            release_sync.set()
            release_async.set()
            assert await anext(stream) == b'data: {"done":true}\n\n'
            assert advances == [1]  # no prefetch while downstream processes a frame
            with pytest.raises(StopAsyncIteration):
                await anext(stream)
            assert closed_sync.is_set()
        finally:
            release_sync.set()
            release_async.set()
            await stream.aclose()

    asyncio.run(asyncio.wait_for(check(), 3))


def test_default_interval_and_data_reset_the_silence_timer(monkeypatch):
    assert sse.HEARTBEAT_INTERVAL == 15
    wait = asyncio.wait
    timeouts = []

    async def observe(*args, **kwargs):
        timeouts.append(kwargs["timeout"])
        return await wait(*args, **kwargs)

    monkeypatch.setattr(sse.asyncio, "wait", observe)

    async def check():
        async def source():
            for i in range(3):
                yield f"data: {i}\n\n"
        assert [part async for part in sse.heartbeat(source())] == [f"data: {i}\n\n" for i in range(3)]
    asyncio.run(check())
    assert timeouts == [15] * 4


@pytest.mark.parametrize("asynchronous", [False, True])
def test_provider_errors_propagate_and_close_the_source(asynchronous):
    closed = []

    def sync_source():
        try:
            yield "data: start\n\n"
            raise ValueError("synthetic failure")
        finally:
            closed.append(True)

    async def async_source():
        try:
            yield "data: start\n\n"
            raise ValueError("synthetic failure")
        finally:
            closed.append(True)

    async def check():
        stream = sse.heartbeat(async_source() if asynchronous else sync_source())
        assert await anext(stream) == "data: start\n\n"
        with pytest.raises(ValueError, match="synthetic failure"):
            await anext(stream)
        assert closed == [True]
    asyncio.run(check())


@pytest.mark.parametrize("interval", [0, -1, float("inf"), float("nan")])
def test_invalid_interval_is_rejected(interval):
    async def check():
        with pytest.raises(ValueError):
            await anext(sse.heartbeat([], interval=interval))
    asyncio.run(check())


@pytest.mark.parametrize("cancel_inflight", [False, True])
def test_async_disconnect_cancels_and_closes_the_pending_provider(cancel_inflight):
    async def check():
        closed = asyncio.Event()

        async def source():
            try:
                await asyncio.Event().wait()
                yield "unreachable"
            finally:
                closed.set()

        stream = sse.heartbeat(source(), interval=.005)
        assert await anext(stream) == sse.PING
        if cancel_inflight:
            read = asyncio.create_task(anext(stream))
            await asyncio.sleep(0)
            read.cancel()
            with pytest.raises(asyncio.CancelledError):
                await read
        else:
            await stream.aclose()
        assert closed.is_set()
    asyncio.run(asyncio.wait_for(check(), 2))


def test_sync_disconnect_returns_promptly_and_closes_after_the_pending_next():
    async def check():
        release, closed = threading.Event(), threading.Event()
        advances = []

        def source():
            try:
                advances.append(1)
                assert release.wait(2)
                yield "late frame"
                advances.append(2)
            finally:
                closed.set()

        stream = sse.heartbeat(source(), interval=.005)
        try:
            assert await anext(stream) == sse.PING
            await asyncio.wait_for(stream.aclose(), .2)
            assert not closed.is_set()
        finally:
            release.set()
        assert await asyncio.to_thread(closed.wait, 1)
        await asyncio.gather(*sse._closing)
        assert advances == [1]
        assert not sse._closing
    asyncio.run(asyncio.wait_for(check(), 3))


@pytest.mark.parametrize("route", ["chat", "site_chat", "voice_reader", "opencode"])
def test_routes_flush_headers_and_first_frame_before_slow_work(monkeypatch, route):
    from backend.ai_service import AIError
    from backend.api_models import ChatRequest, SiteChatRequest, OpencodeChatRequest
    from backend.routes import chat, site_chat, voice_reader, opencode

    monkeypatch.setattr(sse, "HEARTBEAT_INTERVAL", .005)
    sent, calls = [], []
    release, started = threading.Event(), threading.Event()
    ai = SimpleNamespace(config={}, stream_response=MagicMock())
    db = MagicMock()
    db.info = {"chatgpt_language": "sv"}
    # A stream owns its DB session until its sync generator actually exits.
    sessions = MagicMock()
    monkeypatch.setattr(chat.database, "SessionLocal", sessions)
    monkeypatch.setattr(chat, "AIService", lambda *a, **kw: ai)
    monkeypatch.setattr(site_chat, "AIService", lambda *a, **kw: ai)

    def assert_flushed():
        assert sent[0]["type"] == "http.response.start"
        assert sent[0]["status"] == 200
        assert any(message.get("body", b"").startswith(b"data: ") for message in sent)
        started.set()
        calls.append(route)

    def slow_provider(*a, **kw):
        assert_flushed()
        assert release.wait(2)
        raise AIError("synthetic provider failure", code="personalAPI.errors.quota")
        yield

    def slow_search(*a, **kw):
        assert_flushed()
        assert release.wait(2)
        return []

    async def slow_synthesis(*a, **kw):
        assert_flushed()
        while not release.is_set():
            await asyncio.sleep(.001)
        return {"type": "chunk", "index": 0, "audio": "YQ==", "words": []}

    @asynccontextmanager
    async def slow_connection(*a, **kw):
        assert_flushed()
        while not release.is_set():
            await asyncio.sleep(.001)
        raise RuntimeError("synthetic OpenCode failure")
        yield  # make this a synthetic streaming context manager

    async def check():
        if route == "chat":
            monkeypatch.setattr(chat, "_resolve_counselor", lambda *a: (None,) * 7)
            prepared = SimpleNamespace(
                prompt_key="test", phase_prompt_key=None, effective_message="Test", step_label=None,
                questionnaire_type="QSA", effective_response_length=None, max_tokens=900,
                model_scores_context="", knowledge_context="", strategy_ids=[], certified_strategy_ids=[],
                reading_ids=[], recommendation_meta={}, reading_candidates={}, strategy_candidates={},
                system_prompt_final="Italian", full_message="Test", history=[], sanitize=False,
                components={},
            )
            preparation = MagicMock(return_value=prepared)
            monkeypatch.setattr(chat, "prepare_chat_turn", preparation)
            monkeypatch.setattr(chat, "session_memory", MagicMock())
            ai.stream_response = slow_provider
            response = await chat.chat_stream(ChatRequest(message="Test"), db=db, identity={})
            preparation.assert_called_once()  # preparation and HTTP failures precede the response
        elif route == "site_chat":
            monkeypatch.setattr(site_chat, "get_index", lambda *a: SimpleNamespace(search=slow_search))
            monkeypatch.setattr(site_chat, "_resolve_counselor", lambda *a: (None, None))
            monkeypatch.setattr(site_chat, "_portfolio_context", lambda *a: "")
            monkeypatch.setattr(site_chat, "session_memory", MagicMock())
            response = await site_chat.site_chat_stream(SiteChatRequest(message="Test", collection="competenze"), current_user={}, db=db)
        elif route == "voice_reader":
            monkeypatch.setattr(voice_reader, "synthesize", slow_synthesis)
            response = await voice_reader.stream(voice_reader.ReaderRequest(text="Test"), db=db)
        else:
            monkeypatch.setattr(opencode, "_require_direct_chat", lambda *a: None)
            monkeypatch.setattr(opencode.class_access, "require_tool", lambda *a: None)
            monkeypatch.setattr(opencode, "_workspace_instrument", lambda *a: "")
            monkeypatch.setattr(opencode, "_workspace_session_id", lambda *a: "test-session")
            monkeypatch.setattr(opencode, "_get_api_instance", lambda *a: {"url": "http://unused"})
            monkeypatch.setattr(opencode, "_api_auth", lambda *a: None)
            monkeypatch.setattr(opencode, "_api_json", AsyncMock())
            monkeypatch.setattr(opencode.httpx, "AsyncClient", lambda **kw: slow_connection())
            response = await opencode.chat_opencode("cb-12345678", OpencodeChatRequest(session_id="test-session", message="Test"), identity={}, db=db)
        assert calls == []
        assert response.headers["x-accel-buffering"] == "no"
        assert "no-transform" in response.headers["cache-control"]

        async def send(message):
            sent.append(message)
            if message.get("body") == b": ping\n\n" and started.is_set():
                release.set()

        try:
            await response({"type": "http", "asgi": {"spec_version": "2.4"}}, None, send)
        finally:
            release.set()
        assert calls == [route]
        assert any(message.get("body") == b": ping\n\n" for message in sent)
        events = [json.loads(message["body"][6:]) for message in sent if message.get("body", b"").startswith(b"data: ")]
        assert events[-1].get("error") or events[-1].get("done") or events[-1].get("type") == "done"
        if route == "site_chat":
            stream_db = sessions.return_value.__enter__.return_value
            assert ai.db is stream_db
            stream_db.info.update.assert_called_once_with(db.info)
            sessions.return_value.__exit__.assert_called_once()
    asyncio.run(asyncio.wait_for(check(), 3))
