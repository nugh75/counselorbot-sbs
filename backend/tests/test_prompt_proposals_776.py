"""SQLite-portable unit & API tests for Issue #776: factory prompt update proposals.

Runs without PostgreSQL or an LLM:
    PYTHONPATH=. python3 -m pytest -q backend/tests/test_prompt_proposals_776.py
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
    prompt_config,
    prompt_factory_proposals,
    prompt_revisions,
    prompt_updates,
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


def _seed_config(db, key: str, value: str, *, origin: str = prompt_revisions.ORIGIN_SEED, author: str | None = None):
    db.add(models.Config(key=key, value=value, description=""))
    prompt_revisions.record(db, prompt_revisions.SCOPE_CONFIG, key, value, origin, author=author)
    db.commit()


def test_auto_apply_updates_only_uncustomised_prompts_and_keeps_history(db, monkeypatch):
    monkeypatch.setitem(prompt_config.SYSTEM_PROMPT_DEFAULTS, "prompt_generic", "New factory generic v2")
    monkeypatch.setitem(prompt_config.SYSTEM_PROMPT_DEFAULTS, "prompt_factor", "New factory factor v2")
    monkeypatch.setattr(
        prompt_config,
        "ALL_CONFIG_TEXT_DEFINITIONS",
        [
            {"key": "prompt_generic", "default": "New factory generic v2"},
            {"key": "prompt_factor", "default": "New factory factor v2"},
            *(
                item for item in prompt_config.ALL_CONFIG_TEXT_DEFINITIONS
                if item["key"] not in {"prompt_generic", "prompt_factor"}
            ),
        ],
    )

    _seed_config(db, "prompt_generic", "Old factory generic v1", origin=prompt_revisions.ORIGIN_SEED)
    _seed_config(db, "prompt_factor", "Customised factor text", origin=prompt_revisions.ORIGIN_ADMIN, author="docente")

    result = prompt_factory_proposals.auto_apply_uncustomised(db)
    assert result["updated"] == 1
    assert result["keys"] == ["config:prompt_generic"]

    generic_row = db.query(models.Config).filter_by(key="prompt_generic").one()
    factor_row = db.query(models.Config).filter_by(key="prompt_factor").one()
    assert generic_row.value == "New factory generic v2"
    assert factor_row.value == "Customised factor text"

    revs = prompt_revisions.history(db, scope=prompt_revisions.SCOPE_CONFIG, target_key="prompt_generic")
    assert [r.value for r in revs] == ["New factory generic v2", "Old factory generic v1"]
    assert revs[0].origin == prompt_revisions.ORIGIN_MIGRATION


def test_accept_proposal_applies_factory_text_and_rejects_stale_hash(db):
    factory_text = next(
        d["default"] for d in prompt_config.ALL_CONFIG_TEXT_DEFINITIONS if d["key"] == "prompt_generic"
    )
    _seed_config(db, "prompt_generic", "Customised generic v1", origin=prompt_revisions.ORIGIN_ADMIN, author="admin1")

    listing = prompt_factory_proposals.list_proposals(db)
    assert listing["pending_count"] == 1
    proposal = listing["proposals"][0]
    assert proposal["key"] == "prompt_generic"
    assert proposal["status"] == "customised"
    assert proposal["current_text"] == "Customised generic v1"
    assert proposal["factory_text"] == factory_text

    # Stale hash must raise ValueError before writing anything.
    with pytest.raises(ValueError, match="stale_proposal"):
        prompt_factory_proposals.accept_proposal(
            db,
            "config",
            "prompt_generic",
            expected_current_hash="0" * 64,
            expected_factory_hash=proposal["factory_hash"],
            author="admin1",
        )

    res = prompt_factory_proposals.accept_proposal(
        db,
        "config",
        "prompt_generic",
        expected_current_hash=proposal["current_hash"],
        expected_factory_hash=proposal["factory_hash"],
        author="admin1",
    )
    assert res["action"] == "accepted"
    assert res["pending_count"] == 0
    assert db.query(models.Config).filter_by(key="prompt_generic").one().value == factory_text

    revs = prompt_revisions.history(db, scope=prompt_revisions.SCOPE_CONFIG, target_key="prompt_generic")
    assert revs[0].value == factory_text
    assert revs[0].origin == prompt_revisions.ORIGIN_MIGRATION
    assert revs[1].value == "Customised generic v1"


def test_ignore_reopen_and_reappear_when_new_release_changes_factory(db, monkeypatch):
    _seed_config(db, "prompt_generic", "Instance custom text", origin=prompt_revisions.ORIGIN_ADMIN, author="admin1")

    def _patch_factory(new_text: str):
        monkeypatch.setattr(
            prompt_config,
            "ALL_CONFIG_TEXT_DEFINITIONS",
            [
                {"key": "prompt_generic", "default": new_text},
                *(item for item in prompt_config.ALL_CONFIG_TEXT_DEFINITIONS if item["key"] != "prompt_generic"),
            ],
        )

    _patch_factory("Factory release 1")
    first = prompt_factory_proposals.list_proposals(db)
    assert first["pending_count"] == 1
    p1 = first["proposals"][0]

    ignored_res = prompt_factory_proposals.ignore_proposal(
        db,
        "config",
        "prompt_generic",
        expected_current_hash=p1["current_hash"],
        expected_factory_hash=p1["factory_hash"],
        author="admin1",
    )
    assert ignored_res["pending_count"] == 0

    after_ignore = prompt_factory_proposals.list_proposals(db)
    assert after_ignore["pending_count"] == 0
    assert len(after_ignore["ignored"]) == 1
    assert after_ignore["ignored"][0]["key"] == "prompt_generic"

    # Reopen puts it back into pending.
    prompt_factory_proposals.reopen_proposal(db, "config", "prompt_generic")
    assert prompt_factory_proposals.list_proposals(db)["pending_count"] == 1

    # Ignore again for release 1, then simulate release 2 changing the factory text.
    prompt_factory_proposals.ignore_proposal(
        db,
        "config",
        "prompt_generic",
        expected_current_hash=p1["current_hash"],
        expected_factory_hash=p1["factory_hash"],
        author="admin1",
    )
    assert prompt_factory_proposals.list_proposals(db)["pending_count"] == 0

    _patch_factory("Factory release 2")
    second = prompt_factory_proposals.list_proposals(db)
    assert second["pending_count"] == 1
    assert second["proposals"][0]["factory_text"] == "Factory release 2"
    assert second["ignored"] == []


def test_merge_proposal_records_admin_revision_and_resolves_release(db, monkeypatch):
    _seed_config(db, "prompt_generic", "Custom start", origin=prompt_revisions.ORIGIN_ADMIN, author="admin1")

    def _patch_factory(new_text: str):
        monkeypatch.setattr(
            prompt_config,
            "ALL_CONFIG_TEXT_DEFINITIONS",
            [
                {"key": "prompt_generic", "default": new_text},
                *(item for item in prompt_config.ALL_CONFIG_TEXT_DEFINITIONS if item["key"] != "prompt_generic"),
            ],
        )

    _patch_factory("Factory release 1")
    p1 = prompt_factory_proposals.list_proposals(db)["proposals"][0]

    res = prompt_factory_proposals.merge_proposal(
        db,
        "config",
        "prompt_generic",
        merged_text="Custom start + Factory release 1",
        expected_current_hash=p1["current_hash"],
        expected_factory_hash=p1["factory_hash"],
        author="admin1",
    )
    assert res["action"] == "merged"
    assert res["pending_count"] == 0
    assert db.query(models.Config).filter_by(key="prompt_generic").one().value == "Custom start + Factory release 1"

    revs = prompt_revisions.history(db, scope=prompt_revisions.SCOPE_CONFIG, target_key="prompt_generic")
    assert revs[0].origin == prompt_revisions.ORIGIN_ADMIN
    assert revs[0].value == "Custom start + Factory release 1"
    assert revs[1].value == "Custom start"

    # Resolved for release 1 (neither pending nor ignored), reopens on release 2.
    listing = prompt_factory_proposals.list_proposals(db)
    assert listing["pending_count"] == 0
    assert listing["ignored"] == []

    _patch_factory("Factory release 2")
    listing2 = prompt_factory_proposals.list_proposals(db)
    assert listing2["pending_count"] == 1
    assert listing2["proposals"][0]["factory_text"] == "Factory release 2"

    # Merging with exact factory text restores factory ownership.
    p2 = listing2["proposals"][0]
    prompt_factory_proposals.merge_proposal(
        db,
        "config",
        "prompt_generic",
        merged_text="Factory release 2",
        expected_current_hash=p2["current_hash"],
        expected_factory_hash=p2["factory_hash"],
        author="admin1",
    )
    latest = prompt_revisions.latest(db, prompt_revisions.SCOPE_CONFIG, "prompt_generic")
    assert latest is not None and latest.origin == prompt_revisions.ORIGIN_MIGRATION


def test_proposals_http_routes_and_health_counter(db, monkeypatch):
    monkeypatch.setattr(prompt_health_routes, "_rerun_after_save", lambda: None)
    monkeypatch.setattr(prompt_health_routes, "_llm_after_change", lambda *_args, **_kwargs: None)
    _seed_config(db, "prompt_generic", "Customised API prompt", origin=prompt_revisions.ORIGIN_ADMIN, author="admin1")

    with _client_for(db, is_admin=False) as student_client:
        assert student_client.get("/api/admin/prompt-health/proposals").status_code == 403

    with _client_for(db, is_admin=True) as client:
        health_res = client.get("/api/admin/prompt-health")
        assert health_res.status_code == 200
        assert health_res.json()["pending_proposals"] == 1

        list_res = client.get("/api/admin/prompt-health/proposals")
        assert list_res.status_code == 200
        data = list_res.json()
        assert data["pending_count"] == 1
        prop = data["proposals"][0]

        stale_res = client.post(
            "/api/admin/prompt-health/proposals/accept",
            json={
                "scope": prop["scope"],
                "key": prop["key"],
                "expected_current_hash": prompt_updates.digest("wrong"),
                "expected_factory_hash": prop["factory_hash"],
            },
        )
        assert stale_res.status_code == 409

        missing_res = client.post(
            "/api/admin/prompt-health/proposals/reopen",
            json={"scope": "config", "key": "non_existent_prompt_key"},
        )
        assert missing_res.status_code == 404

        ignore_res = client.post(
            "/api/admin/prompt-health/proposals/ignore",
            json={
                "scope": prop["scope"],
                "key": prop["key"],
                "expected_current_hash": prop["current_hash"],
                "expected_factory_hash": prop["factory_hash"],
            },
        )
        assert ignore_res.status_code == 200
        assert ignore_res.json()["pending_count"] == 0

        reopen_res = client.post(
            "/api/admin/prompt-health/proposals/reopen",
            json={"scope": prop["scope"], "key": prop["key"]},
        )
        assert reopen_res.status_code == 200
        assert reopen_res.json()["pending_count"] == 1

        accept_res = client.post(
            "/api/admin/prompt-health/proposals/accept",
            json={
                "scope": prop["scope"],
                "key": prop["key"],
                "expected_current_hash": prop["current_hash"],
                "expected_factory_hash": prop["factory_hash"],
            },
        )
        assert accept_res.status_code == 200
        assert accept_res.json()["pending_count"] == 0
