"""File-backed SQLite load and real streaming-route transaction boundaries."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import json
import time
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from cryptography.fernet import Fernet
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker

from backend import database, models
from backend.ai_service import AIError, AIService
from backend.api_models import ChatRequest, SiteChatRequest
from backend.routes import chat, site_chat, voice_reader
from scripts.benchmarks.sqlite_concurrency_stress import run_benchmark


@pytest.fixture
def desktop(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'load.sqlite3'}",
                           connect_args={"check_same_thread": False})
    database.configure_sqlite_engine(engine)
    models.Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False)
    monkeypatch.setattr(database, "SessionLocal", sessions)
    with database.write_session() as db:
        db.add_all(models.Config(key=key, value=value) for key, value in {
            "active_provider": "openai", "model_name": "synthetic-model",
            "pii_ner_enabled": "false", "monthly_budget_usd": "1000000",
            "ai_fallback_targets": "[]",
        }.items())
        db.add(models.GuidedStep(id="load-step", questionnaire_type="QSA", label="Synthetic step",
                                 prompt="Synthetic step prompt", sort_order=1))
        db.commit()
    try:
        yield sessions
    finally:
        engine.dispose()


def test_thirty_students_stream_while_background_writes_and_readers_progress():
    report = run_benchmark(workers=30, rounds=2, chunks=4, chunk_delay=.005)
    assert report["ok"], json.dumps(report, indent=2)
    assert report["lock_errors"] == []
    assert report["completed_turns"] == report["logged_turns"] == 60
    assert report["logged_tokens"] == 240
    assert report["peak_streams"] == 30
    assert report["background_commits_during_stream"] > 0
    assert report["reads_during_stream"] > 0
    for name in ("first_token", "turn", "save", "read", "background"):
        metrics = report["latency"][name]
        assert 0 < metrics["p50_ms"] <= metrics["p95_ms"] <= metrics["p99_ms"] <= metrics["max_ms"]


@pytest.mark.parametrize("route", ["chat", "site_chat", "voice_reader"])
@pytest.mark.parametrize("outcome", ["success", "error", "disconnect"])
def test_routes_commit_and_release_before_provider_and_never_reopen_request_db(
    desktop, monkeypatch, route, outcome,
):
    db = database.as_write_session(desktop())
    begins, probes = [], []
    event.listen(db, "after_begin", lambda *args: begins.append(1))
    db.add(models.Config(key="pending-boundary", value="committed"))
    db.flush()  # Real BEGIN IMMEDIATE, not a MagicMock dependency.

    def probe():
        assert not db.in_transaction(), "request transaction is still open during provider I/O"
        with desktop() as reader:
            assert reader.get(models.Config, "pending-boundary").value == "committed"
        # A second writer must commit before the provider returns any content.
        with database.write_session() as writer:
            writer.add(models.Log(action="boundary-probe"))
            writer.commit()
        probes.append(1)

    def provider(*args, **kwargs):
        probe()
        yield "Synthetic answer. "
        if outcome == "error":
            raise AIError("Synthetic provider failure")
        yield {"type": "usage", "usage": {"completion_tokens": 3}}

    def search(*args, **kwargs):
        probe()  # Embedding/retrieval is also outside the request transaction.
        return [{"source": "synthetic.md", "title": "Synthetic", "text": "Synthetic material."}]

    async def synthesize(segment, *args):
        probe()
        if outcome == "error":
            raise ValueError("Synthetic voice failure")
        return {"type": "chunk", **segment, "audio": "YQ==", "words": []}

    monkeypatch.setattr(AIService, "_stream_openai", provider)
    monkeypatch.setattr(chat, "session_memory", MagicMock())
    monkeypatch.setattr(site_chat, "session_memory", MagicMock())
    monkeypatch.setattr(site_chat, "get_index", lambda *args: SimpleNamespace(search=search))
    monkeypatch.setattr(site_chat, "_normalize_collection", lambda value: "competenze")
    monkeypatch.setattr(chat, "_update_markdown_memory_background", lambda *args, **kwargs: None)
    monkeypatch.setattr(chat, "_record_recommendations", lambda *args, **kwargs: {})
    monkeypatch.setattr(voice_reader, "synthesize", synthesize)

    def prepare(*args, **kwargs):
        return SimpleNamespace(
            prompt_key="test", phase_prompt_key=None, effective_message="Synthetic question",
            step_label="Synthetic step", step=db.get(models.GuidedStep, "load-step"),
            questionnaire_type="QSA", effective_response_length=None, max_tokens=900,
            model_scores_context="", knowledge_context="", strategy_ids=[], certified_strategy_ids=[],
            reading_ids=[], recommendation_meta={}, reading_candidates={}, strategy_candidates={},
            system_prompt_final="Synthetic prompt", full_message="Synthetic question", history=[],
            sanitize=False, components={}, component_options={"certified_strategy_limit": 0},
            component_flags={}, hypothesis_allowed=False, phase_codes=set(),
        )

    monkeypatch.setattr(chat, "prepare_chat_turn", prepare)

    async def run():
        if route == "chat":
            response = await chat.chat_stream(
                ChatRequest(message="Synthetic question", phase="load-step", session_id="load-boundary"),
                db=db, identity={},
            )
        elif route == "site_chat":
            response = await site_chat.site_chat_stream(
                SiteChatRequest(message="Synthetic question", collection="competenze"), db=db, current_user={},
            )
        else:
            response = await voice_reader.stream(voice_reader.ReaderRequest(text="Synthetic text"), db=db)
        assert not db.in_transaction()
        events = []
        try:
            async for frame in response.body_iterator:
                if isinstance(frame, bytes):
                    frame = frame.decode()
                if not frame.startswith("data: "):
                    continue
                item = json.loads(frame[6:])
                events.append(item)
                if outcome == "disconnect" and ("display" in item or item.get("type") == "chunk"):
                    break
        finally:
            await response.body_iterator.aclose()
        return events

    try:
        events = asyncio.run(run())
        assert probes
        assert len(begins) == 1, "stream reopened the request transaction"
        assert not db.in_transaction()
        if outcome == "success":
            assert events[-1].get("done") or events[-1].get("type") == "done", events
            if route != "voice_reader":
                with desktop() as check:
                    action = "chat_message" if route == "chat" else "site_chat"
                    log = check.query(models.Log).filter_by(action=action).one()
                    assert log.details["usage"]["completion_tokens"] == 3
        elif outcome == "error":
            assert any(item.get("error") or item.get("incomplete")
                       or item.get("type") == "chunk_error" for item in events), events
    finally:
        db.close()


def test_wal_reader_completes_while_a_writer_holds_an_uncommitted_update(desktop):
    # Causal check, independent of machine speed: do not release the writer
    # until a different connection has read the last committed value.
    with database.write_session() as writer:
        row = writer.get(models.Config, "monthly_budget_usd")
        row.value = "pending"
        writer.flush()
        with ThreadPoolExecutor(max_workers=1) as pool:
            def read():
                with desktop() as reader:
                    return reader.get(models.Config, "monthly_budget_usd").value
            assert pool.submit(read).result(timeout=2) == "1000000"
        writer.rollback()


def test_lazy_budget_lookup_releases_connection_without_reopening_the_request(desktop):
    with database.write_session() as request_db:
        ai = AIService(request_db)
        request_db.commit()
        request_db.close()
        assert ai._budget_is_locked() is False
        assert not request_db.in_transaction()
        assert request_db.get_bind().pool.checkedout() == 0


def test_read_lookup_does_not_inherit_immediate_or_block_existing_writer(desktop):
    with database.write_session() as request_db:
        request_db.execute(text("SELECT 1"))  # Owns the SQLite writer slot.
        with database.independent_read_session(request_db) as reader:
            assert reader.get(models.Config, "model_name").value == "synthetic-model"


@pytest.mark.parametrize("refresh", [False, True])
def test_chatgpt_credentials_release_all_connections_before_responses_stream(desktop, monkeypatch, refresh):
    from backend import chatgpt_connections as accounts, chatgpt_responses as responses

    monkeypatch.setenv("CHATGPT_ENABLED", "true")
    monkeypatch.setenv("CHATGPT_CREDENTIAL_KEY", Fernet.generate_key().decode())
    monkeypatch.delenv("CHATGPT_CREDENTIAL_KEY_FILE", raising=False)
    with database.write_session() as db:
        db.add(models.PersonalAIRouting(username="load-student", enabled=True,
                                        default_chatgpt_model="synthetic-model"))
        db.add(models.ChatGPTConnection(
            username="load-student", client_id="synthetic-client", subject="synthetic-subject",
            encrypted_credentials=accounts._seal({"access_token": "synthetic-access",
                "refresh_token": "synthetic-refresh", "expires_at": time.time() + (-1 if refresh else 3600)}),
        ))
        db.commit()

    refreshed = []
    if refresh:
        def renew(*args, **kwargs):
            refreshed.append(1)
            return SimpleNamespace(json=lambda: {}, raise_for_status=lambda: None)
        monkeypatch.setattr(accounts.httpx, "Client", lambda **kw: MagicMock(
            __enter__=lambda self: SimpleNamespace(post=renew), __exit__=lambda *args: None))
        monkeypatch.setattr(accounts, "validate_credentials", lambda *args, **kw: (
            {"access_token": "renewed-access", "refresh_token": "renewed-refresh",
             "expires_at": time.time() + 3600}, None, None,
        ))

    request_db = database.write_session()
    accounts.bind_identity(request_db, {"authenticated": True, "username": "load-student"}, "sv")
    # Constructor preference lookup must also work under POST's IMMEDIATE lock.
    ai = AIService(request_db)
    assert ai.chatgpt_model == "synthetic-model"
    request_db.commit()
    request_db.close()
    calls = []

    @contextmanager
    def create(**kwargs):
        assert not request_db.in_transaction()
        assert request_db.get_bind().pool.checkedout() == 0
        with database.write_session() as writer:
            writer.add(models.Log(action="chatgpt-boundary-probe"))
            writer.commit()
        calls.append(1)
        yield iter([SimpleNamespace(type="response.output_text.delta", delta="Synthetic answer"),
                    SimpleNamespace(type="response.completed", response=SimpleNamespace(usage=None))])

    monkeypatch.setattr(responses, "OpenAI", lambda **kwargs: SimpleNamespace(
        responses=SimpleNamespace(create=create), close=lambda: None))
    try:
        assert list(responses.stream(request_db, "synthetic-model", "Question", "Prompt")) == ["Synthetic answer"]
        assert calls == [1]
        assert len(refreshed) == int(refresh)
        if refresh:
            with desktop() as reader:
                assert accounts._credentials(reader.get(models.ChatGPTConnection, "load-student"))["access_token"] == "renewed-access"
    finally:
        request_db.close()
