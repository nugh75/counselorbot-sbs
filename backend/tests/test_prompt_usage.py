"""Prompts used in real turns and defects of real replies (#762, phase 3).

Uses its own Postgres database (`counselorbot_test_prompt_usage`), recreated at
import with the factory texts. No model is called; the background write runs
inline (`prompt_usage._spawn`).

    python -m pytest backend/tests/test_prompt_usage.py
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from urllib.parse import urlsplit, urlunsplit

import psycopg2
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.testclient import TestClient

from backend import auth, chat_logic, database, models, prompt_usage
from backend.prompt_config import ALL_CONFIG_TEXT_DEFINITIONS

TEST_DB_NAME = "counselorbot_test_prompt_usage"
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
        for instrument in ("QSA", "SAVICKAS"):
            chat_logic._ensure_questionnaire_guided_steps(db, instrument)
    finally:
        db.close()


_seed_factory()


def _configs():
    db = _Session()
    try:
        return {key: value for key, value in db.query(models.Config.key, models.Config.value).all()}
    finally:
        db.close()


def _inline_write(monkeypatch):
    """Run the background write inline, on the test database."""
    monkeypatch.setattr(prompt_usage, "_spawn", lambda target: target())
    monkeypatch.setattr(database, "write_session", _Session)


def _clear():
    db = _Session()
    db.query(models.PromptUsageTurn).delete()
    db.commit()
    db.close()


# --- Detectors ---------------------------------------------------------------------

def _plan(**kwargs):
    return prompt_usage.TurnPlan(surface="guided", instrument="QSA", step="sl-social", language=kwargs.pop("language", "it"), **kwargs)


IT_REPLY = ("Hai descritto bene il modo in cui ti organizzi per lo studio e anche quello che non funziona, "
            "perché il tempo per te è una cosa importante e questo si vede.")


def test_question_budget_from_the_registry():
    assert prompt_usage.count_questions("Come stai? E la scuola?? Vedi https://x.it/?q=1 ok") == 2
    assert prompt_usage.detect_defects(_plan(question_budget=1), IT_REPLY + " Cosa provi? Cosa fai?") == ["too_many_questions"]
    assert prompt_usage.detect_defects(_plan(question_budget=1), IT_REPLY + " Cosa provi?") == []
    assert prompt_usage.detect_defects(_plan(), IT_REPLY + " Cosa provi? Cosa fai?") == []  # no budget, no warning


def test_visible_json_and_reasoning():
    assert "visible_json" in prompt_usage.detect_defects(_plan(), '{"reply": "ciao", "tools": []}')
    assert "visible_json" in prompt_usage.detect_defects(_plan(), IT_REPLY + '\n```json\n{"a": 1}\n```')
    assert "visible_reasoning" in prompt_usage.detect_defects(_plan(), "<think>devo capire</think> " + IT_REPLY)
    assert "visible_reasoning" in prompt_usage.detect_defects(_plan(), "Reasoning: the student\n" + IT_REPLY)
    assert prompt_usage.detect_defects(_plan(), IT_REPLY) == []


def test_strategies_where_the_rules_forbid_them():
    advice = IT_REPLY + " Ti consiglio di fare una pausa ogni ora."
    assert prompt_usage.detect_defects(_plan(strategies_forbidden=True), advice) == ["strategies_in_factor_step"]
    assert prompt_usage.detect_defects(_plan(strategies_forbidden=True), IT_REPLY, strategy_ids=["s1"]) == ["strategies_in_factor_step"]
    assert prompt_usage.detect_defects(_plan(), advice) == []


def test_wrong_language_only_with_clear_evidence():
    english = "You described how you organise your study and what does not work, and this is the part that matters for you."
    assert prompt_usage.detect_language(IT_REPLY) == "it"
    assert prompt_usage.detect_language(english) == "en"
    assert prompt_usage.detect_language("Ok, grazie mille!") is None
    assert prompt_usage.detect_defects(_plan(language="it"), english) == ["wrong_language"]
    assert prompt_usage.detect_defects(_plan(language="en"), english) == []


def test_missing_step_marker_only_on_a_closing_reply():
    plan = _plan(marker_required=True)
    assert prompt_usage.detect_defects(plan, IT_REPLY) == ["missing_step_marker"]
    assert prompt_usage.detect_defects(plan, IT_REPLY, control_signals=["AVANZA_STEP"]) == []
    assert prompt_usage.detect_defects(plan, IT_REPLY + " Cosa ne pensi?") == []


# --- Prompts in a request ----------------------------------------------------------------

def test_plan_records_ids_and_hashes_never_text():
    configs = _configs()
    factor = configs["prompt_factor"]
    envelope = factor + "\n\n[TURN CONTRACT]\nAsk at most ONE focused question, then wait."
    plan = prompt_usage.plan_turn("guided", envelope, configs, instrument="QSA", step="sl-social", language="it",
                                  always=("prompt_factor",))
    assert plan.prompts["config:prompt_factor"] == prompt_usage._hash(factor)
    assert "code:turn_contract" in plan.prompts
    assert plan.question_budget == 1
    assert plan.strategies_forbidden  # prompt_factor forbids advice and its sentence is in the request
    assert all(len(value) == prompt_usage.HASH_CHARS for value in plan.prompts.values())
    assert "config:prompt_strategies" not in plan.prompts


def test_plan_finds_the_step_prompt_by_its_text():
    db = _Session()
    step = db.query(models.GuidedStep).filter(models.GuidedStep.id == "savickas-final").one()
    db.close()
    plan = prompt_usage.plan_turn("guided", "Intro\n\n" + step.prompt, {}, instrument="SAVICKAS",
                                  step=step.id, step_text=step.prompt, language="it")
    assert "guided_step:savickas-final" in plan.prompts
    assert plan.marker_required


# --- Record, retention, report ------------------------------------------------------------

def test_observe_stores_only_ids_hashes_and_defect_codes(monkeypatch):
    _inline_write(monkeypatch)
    _clear()
    plan = prompt_usage.TurnPlan(surface="free_chat", instrument="QSA", step=None, language="it",
                                 prompts={"config:prompt_free_chat": "abc123abc123"}, question_budget=1)
    defects = prompt_usage.observe(plan, IT_REPLY + " Uno? Due?")
    assert defects == ["too_many_questions"]
    db = _Session()
    try:
        row = db.query(models.PromptUsageTurn).one()
        assert row.prompts == [["config:prompt_free_chat", "abc123abc123"]]
        assert row.defects == ["too_many_questions"]
        assert row.surface == "free_chat"
        assert not {"session_id", "username", "text", "reply"} & set(models.PromptUsageTurn.__table__.columns.keys())
    finally:
        db.close()


def test_observe_never_raises(monkeypatch):
    monkeypatch.setattr(prompt_usage, "_spawn", lambda target: (_ for _ in ()).throw(RuntimeError("down")))
    assert prompt_usage.observe(_plan(), IT_REPLY) == []
    assert prompt_usage.observe(None, IT_REPLY) == []


def _add(db, when, prompts, defects, step="sl-social"):
    db.add(models.PromptUsageTurn(created_at=when, surface="guided", instrument="QSA", step=step,
                                  prompts=[[p, "h"] for p in prompts], defects=defects))


def test_retention_deletes_old_rows(monkeypatch):
    monkeypatch.setenv("PROMPT_USAGE_RETENTION_DAYS", "10")
    _clear()
    now = datetime.now(timezone.utc)
    db = _Session()
    try:
        _add(db, now - timedelta(days=11), ["config:prompt_factor"], [])
        _add(db, now - timedelta(days=2), ["config:prompt_factor"], [])
        db.commit()
        assert prompt_usage.purge(db, now=now) == 1
        assert db.query(models.PromptUsageTurn).count() == 1
    finally:
        db.close()


def test_report_last_use_unused_prompts_and_defect_trend():
    _clear()
    now = datetime.now(timezone.utc)
    db = _Session()
    try:
        # Previous window: 2 turns, 0 defects. Current window: 2 turns, 3 defects.
        _add(db, now - timedelta(days=12), ["config:prompt_factor"], [])
        _add(db, now - timedelta(days=11), ["config:prompt_factor"], [])
        _add(db, now - timedelta(days=3), ["config:prompt_factor", "code:turn_contract"], ["too_many_questions", "wrong_language"])
        _add(db, now - timedelta(days=1), ["config:prompt_factor"], ["too_many_questions"])
        _add(db, now - timedelta(days=40), ["config:prompt_strategies"], [])
        db.commit()
        result = prompt_usage.report(db, days=10, now=now)
    finally:
        db.close()
    prompts = {p["id"]: p for p in result["prompts"]}
    factor = prompts["config:prompt_factor"]
    assert factor["uses"] == 2 and factor["defects"] == {"too_many_questions": 2, "wrong_language": 1}
    assert factor["trend"] == "up" and factor["previous_total"] == 0
    assert factor["last_used"].startswith((now - timedelta(days=1)).date().isoformat())
    assert prompts["config:prompt_strategies"]["uses"] == 0  # last use still shown
    assert "config:prompt_strategies" in result["never_used"]
    assert "config:prompt_factor" not in result["never_used"]
    assert "guided_step:sl-social" in result["never_used"]
    assert not any(pid.startswith("config:prompt_cross_synthesis") for pid in result["never_used"])  # one-shot generator
    step = next(s for s in result["steps"] if s["step"] == "sl-social")
    assert step["turns"] == 2 and step["defects_total"] == 3 and step["trend"] == "up"
    assert result["turns"] == 2 and not result["partial"]


def test_report_without_traffic_lists_nothing_as_unused():
    _clear()
    db = _Session()
    try:
        result = prompt_usage.report(db, days=30)
    finally:
        db.close()
    assert result["turns"] == 0 and result["never_used"] == [] and result["partial"]


# --- API and chat route ----------------------------------------------------------------

ADMIN = {"email": "admin@example.test", "username": "admin", "name": "Admin", "groups": ["admins"],
         "is_admin": True, "is_researcher": True, "authenticated": True}


def _client(identity=ADMIN):
    import backend.main as main_module

    def _override_get_db():
        db = _Session()
        try:
            yield db
        finally:
            db.close()

    main_module.app.dependency_overrides[database.get_db] = _override_get_db
    main_module.app.dependency_overrides[auth.get_current_active_admin] = lambda: ADMIN
    main_module.app.dependency_overrides[auth.get_identity_view_as] = lambda: identity
    return TestClient(main_module.app)


def test_usage_endpoint_is_admin_only():
    import backend.main as main_module
    client = _client()
    assert client.get("/admin/prompt-health/usage?days=7").json()["days"] == 7
    main_module.app.dependency_overrides.pop(auth.get_current_active_admin)
    try:
        assert TestClient(main_module.app).get("/admin/prompt-health/usage").status_code in (401, 403)
    finally:
        main_module.app.dependency_overrides.clear()


def test_a_chat_turn_records_its_prompts_and_reply_defects(monkeypatch):
    from backend.routes import chat
    _inline_write(monkeypatch)
    _clear()
    client = _client()
    reply = "You described how you organise your study and what does not work, and this is what matters. One? Two?"
    try:
        with patch.object(chat.AIService, "get_response", return_value=reply):
            response = client.post("/chat", json={"message": "Ciao", "mode": "factor", "questionnaire_type": "QSA",
                                                  "phase": "sl-social", "language": "it"})
        assert response.status_code == 200, response.text
    finally:
        import backend.main as main_module
        main_module.app.dependency_overrides.clear()
    db = _Session()
    try:
        row = db.query(models.PromptUsageTurn).one()
    finally:
        db.close()
    ids = [pid for pid, _ in row.prompts]
    assert row.surface == "guided" and row.instrument == "QSA" and row.step == "sl-social"
    assert any(pid.startswith("config:prompt_") for pid in ids)
    assert "wrong_language" in row.defects
    assert "Ciao" not in str(row.prompts) and reply not in str(row.prompts)
