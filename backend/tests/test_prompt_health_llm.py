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
        session.query(models.Config).filter(models.Config.key.like("chatgpt_prompt_health_%")).delete(synchronize_session=False)
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


@pytest.mark.parametrize("mixed_source", [False, True])
def test_code_only_contradictions_are_visible_and_expire_with_the_request(db, monkeypatch, custom_step, mixed_source):
    """Code/code and code/prompt evidence expires when its request changes."""
    quote_b = QUOTE_B if mixed_source else "Never answer as a list."
    request_text = f"Always answer as a list. {quote_b}"
    combo = {"hash": prompt_health._digest(request_text), "text": request_text,
             "surfaces": ["QSA · sl-social · entry"]}
    monkeypatch.setattr(prompt_health_llm, "combinations", lambda *_args, **_kwargs: [combo])
    fake = FakeModel(answer=json.dumps({"contradictions": [{
        "quote_a": "Always answer as a list.", "quote_b": quote_b,
        "severity": "high", "explanation": "The two generated rules disagree.",
    }]}))
    monkeypatch.setattr(prompt_health_llm, "_call_model", fake)
    prompt_health_llm.save_settings(db, "openrouter", "test/cheap-model")

    findings = prompt_health_llm.run(db, language="en")["findings"]
    assert len(findings) == 1
    assert findings[0]["editable"] == ([STEP] if mixed_source else [])
    assert findings[0]["prompts"] == (["code:request", STEP] if mixed_source else ["code:request"])
    assert len(findings[0]["sentences"]) == 2
    assert len(fake.calls) == 1

    # A code change invalidates the old evidence, without asking the model again.
    combo["text"] = "Always answer as a list."
    combo["hash"] = prompt_health._digest(combo["text"])
    assert prompt_health_llm.current_findings(db) == []
    assert len(fake.calls) == 1


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


def _bind_admin(db, username):
    from backend.chatgpt_connections import bind_identity
    bind_identity(db, {"authenticated": True, "username": username, "is_admin": True, "groups": ["admins"]})


@pytest.fixture
def active_plans(monkeypatch):
    from backend import chatgpt_connections as accounts
    plans = {"alice": "gpt-alice-plan", "bob": "gpt-bob-plan", "admin": "gpt-admin-plan"}
    monkeypatch.setattr(accounts, "enabled", lambda _db=None: True)
    monkeypatch.setattr(accounts, "preference", lambda db: plans.get(accounts.owner(db)))
    return plans


def test_chatgpt_selection_is_personal_and_does_not_replace_installation_apis(db, active_plans):
    provider = prompt_health_llm.CHATGPT_PROVIDER
    prompt_health_llm.save_settings(db, "openrouter", "test/system")
    _bind_admin(db, "alice")
    selected = prompt_health_llm.save_settings(db, provider, "gpt-alice-plan")
    assert selected["configured"] and selected["billing"] == "subscription"
    assert db.query(models.Config).filter_by(key=prompt_health_llm.SETTING_KEYS[0]).one().value == "openrouter"
    key = prompt_health_llm._personal_key(db)
    assert key.startswith("chatgpt_") and "alice" not in key

    _bind_admin(db, "bob")
    assert prompt_health_llm.settings(db)["provider"] == "openrouter"
    with pytest.raises(prompt_health_llm.NotConfigured):
        prompt_health_llm.save_settings(db, provider, "gpt-alice-plan")
    prompt_health_llm.save_settings(db, provider, "gpt-bob-plan")
    _bind_admin(db, "alice")
    assert prompt_health_llm.settings(db)["model"] == "gpt-alice-plan"
    # Personal model changes are followed without changing counseling preferences here.
    active_plans["alice"] = "gpt-alice-new"
    assert prompt_health_llm.settings(db)["model"] == "gpt-alice-new"
    active_plans.pop("alice")
    assert prompt_health_llm.settings(db)["configured"] is False
    with pytest.raises(prompt_health_llm.NotConfigured):
        prompt_health_llm.run(db)
    prompt_health_llm.save_settings(db, "", "")
    assert prompt_health_llm.settings(db)["configured"] is False
    _bind_admin(db, "bob")
    assert prompt_health_llm.settings(db)["model"] == "gpt-bob-plan"


def test_explicit_api_check_does_not_inherit_personal_routing_and_chatgpt_never_falls_back(db, active_plans, monkeypatch):
    from backend import ai_service, chatgpt_connections as accounts
    constructed, calls = [], []

    class Service:
        def __init__(self, session, username=None):
            constructed.append((accounts.owner(session), username))

        def call_model(self, provider, model, *args, **kwargs):
            calls.append((provider, model))
            if provider == prompt_health_llm.CHATGPT_PROVIDER:
                raise RuntimeError("synthetic subscription unavailable")
            return "synthetic API result"

    monkeypatch.setattr(ai_service, "AIService", Service)
    _bind_admin(db, "alice")
    assert prompt_health_llm._call_model(db, "openrouter", "test/system", "instructions", "text") == "synthetic API result"
    assert constructed == [(None, None)] and accounts.owner(db) == "alice"
    prompt_health_llm.save_settings(db, prompt_health_llm.CHATGPT_PROVIDER, "gpt-alice-plan")
    with pytest.raises(RuntimeError):
        prompt_health_llm._call_model(db, prompt_health_llm.CHATGPT_PROVIDER, "gpt-alice-plan", "instructions", "text")
    assert constructed[-1] == ("alice", "alice")
    assert calls == [("openrouter", "test/system"), (prompt_health_llm.CHATGPT_PROVIDER, "gpt-alice-plan")]


def test_background_check_binds_only_the_prompt_editors_identity(db, active_plans, monkeypatch):
    from backend import chatgpt_connections as accounts
    _bind_admin(db, "alice")
    prompt_health_llm.save_settings(db, prompt_health_llm.CHATGPT_PROVIDER, "gpt-alice-plan")
    actors = []
    def capture(session, ids):
        actors.append((accounts.owner(session), prompt_health_llm.settings(session)["model"]))
        return {"calls": 0, "failed": 0}
    monkeypatch.setattr(prompt_health_llm, "run", capture)
    identity = {"username": "alice", "authenticated": True, "is_admin": True, "groups": ["admins"]}
    prompt_health_llm.run_after_change(_Session, STEP, identity)
    prompt_health_llm.run_after_change(_Session, STEP, {**identity, "username": "bob"})
    assert actors == [("alice", "gpt-alice-plan")]


def test_admin_api_can_choose_the_active_subscription_without_an_api_key(db, active_plans, monkeypatch):
    client = _client()
    monkeypatch.setattr(prompt_health_llm, "available_providers", lambda session: [prompt_health_llm.CHATGPT_PROVIDER] if prompt_health_llm._chatgpt_choice(session)["available"] else [])
    choice = client.get("/admin/prompt-health/llm/settings").json()
    assert choice["chatgpt"]["available"] and choice["chatgpt"]["model"] == "gpt-admin-plan"
    response = client.put("/admin/prompt-health/llm/settings", json={"provider": prompt_health_llm.CHATGPT_PROVIDER, "model": "gpt-admin-plan"})
    assert response.status_code == 200 and response.json()["billing"] == "subscription"
    monkeypatch.setattr(prompt_health_llm, "combinations", lambda *_args, **_kwargs: [])
    estimate = client.post("/admin/prompt-health/llm/estimate", json={}).json()
    assert estimate["billing"] == "subscription" and estimate["cost_usd"] is None
    assert client.put("/admin/prompt-health/llm/settings", json={"provider": prompt_health_llm.CHATGPT_PROVIDER, "model": "gpt-another-account"}).status_code == 409


def test_a_sentence_shared_by_several_prompts_lists_all_of_them(db, fake, custom_step):
    """Problem #4: a shared block was attributed to the first prompt in alphabetical order only."""
    prompt_health_llm.save_settings(db, "openrouter", "test/cheap-model")
    prompt_health_llm.run(db, [STEP])
    other = db.query(models.GuidedStep).filter(models.GuidedStep.id == "intro").first()
    before = other.prompt
    try:
        other.prompt = f"{before}\n{QUOTE_B}"
        db.commit()
        finding = prompt_health_llm.current_findings(db)[0]
        shared = next(s for s in finding["sentences"] if s["text"] == QUOTE_B)
        assert shared["prompt"] == STEP and shared["also_in"] == ["guided_step:intro"]
        assert all(s["also_in"] == [] for s in finding["sentences"] if s["text"] != QUOTE_B)
    finally:
        db.rollback()
        other = db.query(models.GuidedStep).filter(models.GuidedStep.id == "intro").first()
        other.prompt = before
        db.commit()
