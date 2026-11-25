"""SQLite-portable unit & API tests for Issue #778: first- and second-level prompts.

Runs without PostgreSQL or an LLM:
    PYTHONPATH=. python3 -m pytest -q backend/tests/test_prompt_levels_778.py
"""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from contextlib import contextmanager

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import (
    auth,
    models,
    prompt_factory_proposals,
    prompt_health,
    prompt_registry,
    prompt_revisions,
)
from backend.routes import prompt_health as prompt_health_routes


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    models.Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@contextmanager
def _client_for(db, *, is_admin: bool = True, username: str = "admin-user"):
    app = FastAPI()
    app.include_router(prompt_health_routes.router, prefix="/api")
    app.dependency_overrides[prompt_health_routes.get_db] = lambda: db
    app.dependency_overrides[auth.get_current_user] = lambda: {
        "username": username,
        "is_admin": is_admin,
        "is_researcher": False,
        "authenticated": True,
        "groups": ["admins"] if is_admin else ["teacher"],
    }
    with TestClient(app) as client:
        yield client


def test_every_registry_entry_declares_valid_level():
    for pid, entry in prompt_registry.REGISTRY.items():
        assert entry.level in prompt_registry.LEVELS, pid

    assert prompt_registry.prompt_level("code:turn_contract") == 1
    assert prompt_registry.prompt_level("code:format_rule") == 1
    assert prompt_registry.prompt_level("code:bussola_guide") == 1
    assert prompt_registry.prompt_level("config:prompt_free_chat_contract") == 1
    assert prompt_registry.prompt_level("config:directive_language") == 1
    assert prompt_registry.prompt_level("config:directive_conversation_quality") == 1
    assert prompt_registry.prompt_level("config:prompt_savickas_summary") == 1

    assert prompt_registry.prompt_level("guided_step:sl-social") == 2
    assert prompt_registry.prompt_level("config:directive_register") == 2
    assert prompt_registry.prompt_level("config:prompt_meta_QSA") == 2
    assert prompt_registry.prompt_level("config:prompt_meta_QSA__level_compact") == 2


def test_map_card_and_proposals_expose_prompt_levels(db):
    db.add_all([
        models.Config(key="directive_language", value="Custom language directive", description=""),
        models.Config(key="prompt_meta_QSA", value="Custom meta QSA", description=""),
    ])
    prompt_revisions.record(db, prompt_revisions.SCOPE_CONFIG, "directive_language", "Custom language directive", prompt_revisions.ORIGIN_ADMIN)
    prompt_revisions.record(db, prompt_revisions.SCOPE_CONFIG, "prompt_meta_QSA", "Custom meta QSA", prompt_revisions.ORIGIN_ADMIN)
    db.commit()

    levels = prompt_health.all_prompt_levels(db)
    assert levels["config:directive_language"] == 1
    assert levels["config:prompt_meta_QSA"] == 2

    proposals = {p["prompt_id"]: p for p in prompt_factory_proposals.list_proposals(db)["proposals"]}
    assert proposals["config:directive_language"]["level"] == 1
    assert proposals["config:prompt_meta_QSA"]["level"] == 2

    with _client_for(db) as client:
        card1 = client.get("/api/admin/prompt-health/prompt", params={"id": "config:directive_language"}).json()
        card2 = client.get("/api/admin/prompt-health/prompt", params={"id": "config:prompt_meta_QSA"}).json()
        assert card1["level"] == 1
        assert card2["level"] == 2
        map_res = client.get("/api/admin/prompt-health/map").json()
        assert map_res["prompt_levels"]["config:directive_language"] == 1
        assert map_res["prompt_levels"]["config:prompt_meta_QSA"] == 2


def test_first_level_save_and_merge_require_explicit_double_confirmation(db, monkeypatch):
    monkeypatch.setattr(prompt_health_routes, "_rerun_after_save", lambda: None)
    monkeypatch.setattr(prompt_health_routes, "_llm_after_change", lambda *_args, **_kwargs: None)

    db.add_all([
        models.Config(key="directive_language", value="Initial language rule", description=""),
        models.Config(key="prompt_meta_QSA", value="Initial meta QSA", description=""),
    ])
    prompt_revisions.record(db, prompt_revisions.SCOPE_CONFIG, "directive_language", "Initial language rule", prompt_revisions.ORIGIN_ADMIN)
    prompt_revisions.record(db, prompt_revisions.SCOPE_CONFIG, "prompt_meta_QSA", "Initial meta QSA", prompt_revisions.ORIGIN_ADMIN)
    db.commit()

    with _client_for(db) as client:
        # Level 2 saves without extra confirmation.
        ok2 = client.post(
            "/api/admin/prompt-health/save",
            json={"prompt_id": "config:prompt_meta_QSA", "text": "Updated meta QSA"},
        )
        assert ok2.status_code == 200
        assert db.query(models.Config).filter_by(key="prompt_meta_QSA").one().value == "Updated meta QSA"

        # Level 1 refuses save without confirm_first_level=True and leaves DB untouched.
        denied = client.post(
            "/api/admin/prompt-health/save",
            json={"prompt_id": "config:directive_language", "text": "Changed language rule"},
        )
        assert denied.status_code == 409
        assert denied.json()["detail"] == "first_level_confirmation_required"
        assert db.query(models.Config).filter_by(key="directive_language").one().value == "Initial language rule"

        # With confirm_first_level=True, Level 1 is editable and saves cleanly.
        confirmed = client.post(
            "/api/admin/prompt-health/save",
            json={
                "prompt_id": "config:directive_language",
                "text": "Changed language rule",
                "confirm_first_level": True,
            },
        )
        assert confirmed.status_code == 200
        assert db.query(models.Config).filter_by(key="directive_language").one().value == "Changed language rule"

        # Manual merge of a Level 1 proposal also enforces confirm_first_level=True.
        props = {p["prompt_id"]: p for p in client.get("/api/admin/prompt-health/proposals").json()["proposals"]}
        prop = props["config:directive_language"]
        merge_denied = client.post(
            "/api/admin/prompt-health/proposals/merge",
            json={
                "scope": prop["scope"],
                "key": prop["key"],
                "expected_current_hash": prop["current_hash"],
                "expected_factory_hash": prop["factory_hash"],
                "merged_text": "Merged language rule",
            },
        )
        assert merge_denied.status_code == 409
        assert merge_denied.json()["detail"] == "first_level_confirmation_required"

        merge_ok = client.post(
            "/api/admin/prompt-health/proposals/merge",
            json={
                "scope": prop["scope"],
                "key": prop["key"],
                "expected_current_hash": prop["current_hash"],
                "expected_factory_hash": prop["factory_hash"],
                "merged_text": "Merged language rule",
                "confirm_first_level": True,
            },
        )
        assert merge_ok.status_code == 200
        assert db.query(models.Config).filter_by(key="directive_language").one().value == "Merged language rule"
