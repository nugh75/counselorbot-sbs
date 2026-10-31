"""LLM contradiction check of the prompt health page (#763): fake model only.

Uses its own Postgres database (`counselorbot_test_prompt_health_llm`),
recreated at import with the factory texts. The model is replaced by a fake:
no real call is ever made.

    python -m pytest backend/tests/test_prompt_health_llm.py
"""
import json
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from urllib.parse import urlsplit, urlunsplit

import psycopg2
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.testclient import TestClient

from backend import (
    auth,
    chat_logic,
    database,
    models,
    prompt_health,
    prompt_health_llm,
    prompt_revisions,
)
from backend.prompt_config import ALL_CONFIG_TEXT_DEFINITIONS

TEST_DB_NAME = "counselorbot_test_prompt_health_llm"
_base = urlsplit(os.environ["DATABASE_URL"])
_test_url = urlunsplit((_base.scheme, _base.netloc, f"/{TEST_DB_NAME}", _base.query, _base.fragment))
_admin_url = urlunsplit((_base.scheme, _base.netloc, "/postgres", _base.query, _base.fragment))


def _recreate_database():
    conn = psycopg2.connect(_admin_url)
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}" WITH (FORCE)')
            cur.execute(f'CREATE DATABASE "{TEST_DB_NAME}"')
    finally:
        conn.close()


_recreate_database()
_engine = create_engine(_test_url)
_Session = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
database.Base.metadata.create_all(bind=_engine)


def _seed_factory():
    db = _Session()
    try:
        for definition in ALL_CONFIG_TEXT_DEFINITIONS:
            db.add(models.Config(key=definition["key"], value=definition.get("default") or "",
                                 description=definition.get("description")))
        db.commit()
        chat_logic._ensure_questionnaire_guided_steps(db, "QSA")
    finally:
        db.close()


_seed_factory()

STEP = "guided_step:sl-social"
QUOTE_A = "Ask exactly two questions in every reply."
QUOTE_B = "Never ask the student any question."
CUSTOM = f"Talk about social learning. {QUOTE_A} Keep it warm. {QUOTE_B}"


class FakeModel:
    """Answers like the model would, from the text it receives. Counts the calls."""

    def __init__(self, answer=None):
        self.calls = []
        self.answer = answer

    def __call__(self, db, provider, model, system, user):
        self.calls.append({"provider": provider, "model": model, "system": system, "user": user})
        if self.answer is not None:
            return self.answer(user) if callable(self.answer) else self.answer
        if QUOTE_A in user and QUOTE_B in user:
            return "```json\n" + json.dumps({"contradictions": [
                {"quote_a": QUOTE_A, "quote_b": QUOTE_B, "severity": "high",
                 "explanation": "One sentence requires two questions, the other forbids questions."},
                {"quote_a": "This sentence is invented.", "quote_b": QUOTE_B, "severity": "low", "explanation": "x"},
            ]}) + "\n```"
        return json.dumps({"contradictions": []})


@pytest.fixture
def fake(monkeypatch):
    model = FakeModel()
    monkeypatch.setattr(prompt_health_llm, "_call_model", model)
    return model


@pytest.fixture
def db():
    session = _Session()
    try:
        yield session
    finally:
        session.rollback()
        session.query(models.PromptHealthLlmResult).delete()
        session.query(models.Config).filter(models.Config.key.in_(prompt_health_llm.SETTING_KEYS)).delete()
        session.commit()
        session.close()


@pytest.fixture
def custom_step(db):
    row = db.query(models.GuidedStep).filter(models.GuidedStep.id == "sl-social").first()
    before = row.prompt
    row.prompt = CUSTOM
    prompt_revisions.record(db, "guided_step", "sl-social", CUSTOM, prompt_revisions.ORIGIN_ADMIN, author="admin")
    db.commit()
    yield row
    db.rollback()
    row = db.query(models.GuidedStep).filter(models.GuidedStep.id == "sl-social").first()
    row.prompt = before
    db.query(models.PromptRevision).filter(models.PromptRevision.target_key == "sl-social").delete()
    db.commit()


def test_no_model_by_default_and_nothing_is_called(db, fake):
    settings = prompt_health_llm.settings(db)
    assert settings["provider"] == "" and settings["model"] == "" and settings["configured"] is False
    estimate = prompt_health_llm.estimate(db, [STEP])
    assert estimate["configured"] is False and estimate["calls"] == estimate["combinations"] > 0
    with pytest.raises(prompt_health_llm.NotConfigured):
        prompt_health_llm.run(db, [STEP])
    assert fake.calls == []


def test_run_finds_contradictions_with_positions_and_caches_by_text_hash(db, fake, custom_step):
    prompt_health_llm.save_settings(db, "openrouter", "test/cheap-model")
    estimate = prompt_health_llm.estimate(db, [STEP])
    assert estimate["configured"] and estimate["cached"] == 0
    assert estimate["calls"] == estimate["combinations"] and estimate["input_tokens"] > 0

    result = prompt_health_llm.run(db, [STEP])
    assert result["calls"] == len(fake.calls) == estimate["calls"] and result["failed"] == 0
    assert all(call["model"] == "test/cheap-model" for call in fake.calls)
    findings = [f for f in result["findings"] if f["code"] == "llm_contradiction"]
    assert len(findings) == 1, "the invented quote is dropped, the same contradiction is merged across turns"
    finding = findings[0]
    assert finding["prompts"] == [STEP] and finding["severity"] == "high"
    assert finding["params"]["explanation"] and finding["params"]["model"] == "test/cheap-model"
    assert len(finding["surfaces"]) == estimate["combinations"]
    for sentence in finding["sentences"]:
        assert CUSTOM[sentence["start"]:sentence["end"]] == sentence["text"]

    # Same texts and model: everything comes from the cache.
    again = prompt_health_llm.estimate(db, [STEP])
    assert again["calls"] == 0 and again["cached"] == again["combinations"]
    assert prompt_health_llm.run(db, [STEP])["calls"] == 0 and len(fake.calls) == result["calls"]

    # Another model is another cache.
    prompt_health_llm.save_settings(db, "openrouter", "test/other-model")
    assert prompt_health_llm.estimate(db, [STEP])["calls"] == estimate["calls"]


def test_findings_follow_the_current_texts(db, fake, custom_step):
    prompt_health_llm.save_settings(db, "openrouter", "test/cheap-model")
    prompt_health_llm.run(db, [STEP])
    assert [f["code"] for f in prompt_health_llm.current_findings(db)] == ["llm_contradiction"]
    custom_step.prompt = CUSTOM.replace(QUOTE_B, "Ask about the student's friends.")
    db.commit()
    assert prompt_health_llm.current_findings(db) == []


def test_failed_or_malformed_answers_are_not_cached(db, monkeypatch, custom_step):
    prompt_health_llm.save_settings(db, "openrouter", "test/cheap-model")
    broken = FakeModel(answer="not json at all")
    monkeypatch.setattr(prompt_health_llm, "_call_model", broken)
    result = prompt_health_llm.run(db, [STEP])
    assert result["calls"] == 0 and result["failed"] == len(broken.calls) > 0
    assert prompt_health_llm.estimate(db, [STEP])["cached"] == 0


def test_calls_per_run_are_capped(db, fake, custom_step, monkeypatch):
    prompt_health_llm.save_settings(db, "openrouter", "test/cheap-model")
    monkeypatch.setattr(prompt_health_llm, "MAX_CALLS_PER_RUN", 1)
    total = prompt_health_llm.estimate(db, [STEP])["calls"]
    result = prompt_health_llm.run(db, [STEP])
    assert result["calls"] == 1 and result["remaining"] == total - 1


def test_propose_correction_rewrites_only_the_conflicting_sentences(db, monkeypatch, custom_step):
    prompt_health_llm.save_settings(db, "openrouter", "test/cheap-model")
    rewrite = FakeModel(answer=json.dumps({"edits": [
        {"prompt": STEP, "find": QUOTE_B, "replace": "Ask at most two short questions."},
        {"prompt": STEP, "find": "A sentence that is not there.", "replace": "x"},
        {"prompt": "config:prompt_meta_QSA", "find": "anything", "replace": "y"},
    ]}))
    monkeypatch.setattr(prompt_health_llm, "_call_model", rewrite)
    draft = CUSTOM + " Unsaved draft line."
    sentences = [{"prompt": STEP, "text": QUOTE_A}, {"prompt": STEP, "text": QUOTE_B}]
    result = prompt_health_llm.propose(db, sentences=sentences, explanation="Two questions vs none.",
                                       drafts={STEP: draft})
    assert result["proposals"] == [{
        "prompt_id": STEP, "before": draft,
        "after": draft.replace(QUOTE_B, "Ask at most two short questions."),
    }]
    assert QUOTE_A in rewrite.calls[0]["user"] and "Unsaved draft line." in rewrite.calls[0]["user"]
    db.refresh(custom_step)
    assert custom_step.prompt == CUSTOM, "a proposal is never saved"


@pytest.fixture(autouse=True)
def _restore_shared_app():
    """Leave the shared app as found: other suites install their overrides at import."""
    import backend.main as main_module
    from backend.routes import prompt_health as routes
    overrides = dict(main_module.app.dependency_overrides)
    hooks = (routes._rerun_after_save, routes._session_factory)
    yield
    main_module.app.dependency_overrides.clear()
    main_module.app.dependency_overrides.update(overrides)
    routes._rerun_after_save, routes._session_factory = hooks


def _client():
    from backend import main as main_module
    from backend.routes import prompt_health as routes

    def _override_get_db():
        session = _Session()
        try:
            yield session
        finally:
            session.close()

    def _fake_admin():
        return {"email": "admin@example.test", "username": "admin", "name": "Admin", "groups": ["admins"],
                "is_admin": True, "is_researcher": True, "authenticated": True}

    def _rerun():
        pass

    routes._rerun_after_save = _rerun
    routes._session_factory = _Session
    main_module.app.dependency_overrides[database.get_db] = _override_get_db
    main_module.app.dependency_overrides[auth.get_current_active_admin] = _fake_admin
    return TestClient(main_module.app)


def test_admin_api_settings_estimate_run_and_propose(db, fake, custom_step, monkeypatch):
    client = _client()
    monkeypatch.setattr(prompt_health_llm, "available_providers", lambda _db: ["openrouter", "ollama"])
    response = client.get("/admin/prompt-health/llm/settings")
    assert response.status_code == 200, response.text
    assert response.json()["configured"] is False and response.json()["providers"] == ["openrouter", "ollama"]
    assert client.put("/admin/prompt-health/llm/settings", json={"provider": "unknown", "model": "m"}).status_code == 422
    assert client.post("/admin/prompt-health/llm/run", json={"prompt_ids": [STEP]}).status_code == 409

    saved = client.put("/admin/prompt-health/llm/settings", json={"provider": "openrouter", "model": "test/cheap-model"})
    assert saved.status_code == 200 and saved.json()["configured"] is True
    estimate = client.post("/admin/prompt-health/llm/estimate", json={"prompt_ids": [STEP]}).json()
    assert estimate["calls"] > 0
    run = client.post("/admin/prompt-health/llm/run", json={"prompt_ids": [STEP]}).json()
    assert run["calls"] == estimate["calls"]
    listed = client.get("/admin/prompt-health/llm").json()
    assert [f["code"] for f in listed["findings"]] == ["llm_contradiction"]
    assert listed["findings"][0]["ack"] is None

    monkeypatch.setattr(prompt_health_llm, "_call_model", FakeModel(answer=json.dumps({"edits": [
        {"prompt": STEP, "find": QUOTE_B, "replace": "Ask one question."}]})))
    proposal = client.post("/admin/prompt-health/llm/propose", json={
        "sentences": [{"prompt": STEP, "text": QUOTE_A}, {"prompt": STEP, "text": QUOTE_B}],
        "explanation": "conflict", "drafts": {}}).json()
    assert proposal["proposals"][0]["after"] == CUSTOM.replace(QUOTE_B, "Ask one question.")


def test_saving_a_prompt_runs_the_check_only_when_a_model_is_chosen(db, fake, custom_step):
    client = _client()
    response = client.post("/admin/prompt-health/save", json={"prompt_id": STEP, "text": CUSTOM + " More."})
    assert response.status_code == 200 and fake.calls == [], "no model chosen: no call on change"

    prompt_health_llm.save_settings(db, "openrouter", "test/cheap-model")
    response = client.post("/admin/prompt-health/save", json={"prompt_id": STEP, "text": CUSTOM})
    assert response.status_code == 200
    assert fake.calls and all(QUOTE_A in call["user"] for call in fake.calls)
    assert prompt_health_llm.estimate(db, [STEP])["calls"] == 0


def test_startup_never_runs_the_llm_check():
    import inspect
    assert "prompt_health_llm" not in inspect.getsource(prompt_health.run_at_startup)
