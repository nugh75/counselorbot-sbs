"""SQLite-portable unit & API tests for Issue #777: maintainer mode factory PR promotion.

Runs without PostgreSQL or network access:
    PYTHONPATH=. python3 -m pytest -q backend/tests/test_prompt_maintainer_777.py
"""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

import base64
from contextlib import contextmanager
import json

from fastapi import FastAPI
from fastapi.testclient import TestClient
import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import (
    auth,
    models,
    prompt_factory_source,
    prompt_maintainer,
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
def _client_for(db, *, is_admin: bool = True, username: str = "maintainer-admin"):
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


def test_disabled_by_default_and_partial_config(db, monkeypatch):
    monkeypatch.delenv("PROMPT_MAINTAINER_MODE", raising=False)
    monkeypatch.delenv("PROMPT_MAINTAINER_GITHUB_TOKEN", raising=False)
    monkeypatch.delenv("PROMPT_MAINTAINER_GITHUB_TOKEN_FILE", raising=False)
    assert prompt_maintainer.is_maintainer_mode_enabled() is False

    db.add(models.Config(key="prompt_generic", value="Custom text here", description=""))
    prompt_revisions.record(db, prompt_revisions.SCOPE_CONFIG, "prompt_generic", "Custom text here", prompt_revisions.ORIGIN_ADMIN)
    db.commit()

    with _client_for(db) as client:
        card = client.get("/api/admin/prompt-health/prompt", params={"id": "config:prompt_generic"}).json()
        assert "maintainer_promote" not in card
        res = client.post("/api/admin/prompt-health/promote-factory", json={"prompt_id": "config:prompt_generic"})
        assert res.status_code == 403
        assert res.json()["detail"] == "maintainer_mode_disabled"

    # Partial config: mode on without token still stays disabled
    monkeypatch.setenv("PROMPT_MAINTAINER_MODE", "true")
    assert prompt_maintainer.is_maintainer_mode_enabled() is False

    # Token without mode=true also stays disabled
    monkeypatch.setenv("PROMPT_MAINTAINER_MODE", "false")
    monkeypatch.setenv("PROMPT_MAINTAINER_GITHUB_TOKEN", "ghp_secret_only")
    assert prompt_maintainer.is_maintainer_mode_enabled() is False


def test_factory_source_resolver_and_utf8_inline_roundtrip():
    md_src = prompt_factory_source.resolve_factory_source("config:prompt_generic")
    assert md_src.kind == "md"
    assert md_src.file_path == "backend/prompts/default_system_prompt_generic.md"
    assert prompt_factory_source.apply_factory_text(md_src, "old", "Nuovo testo\n") == "Nuovo testo\n"

    composed_src = prompt_factory_source.resolve_factory_source("config:prompt_second_level")
    assert composed_src.kind == "unsupported"
    assert composed_src.reason == "composed_or_dynamic_factory_source"

    sample_py = (
        "# Commento con accento è à ù\n"
        "ITEMS = [\n"
        "    {'id': 'step-uno', 'prompt': 'Testo precedente con café'},\n"
        "    {'id': 'step-due', 'prompt': 'Altro passo invariato'},\n"
        "]\n"
    )
    inline_src = prompt_factory_source.resolve_factory_source("guided_step:step-uno", prompt_config_source=sample_py)
    assert inline_src.kind == "inline"
    assert inline_src.file_path == "backend/prompt_config.py"

    updated_py = prompt_factory_source.apply_factory_text(inline_src, sample_py, "Nuovo passo con café e\na capo")
    assert "# Commento con accento è à ù" in updated_py
    assert "Altro passo invariato" in updated_py
    reparsed = prompt_factory_source.resolve_factory_source("guided_step:step-uno", prompt_config_source=updated_py)
    assert reparsed.kind == "inline"


def test_promote_to_factory_opens_github_pr_without_leaking_token(db, monkeypatch):
    secret_token = "ghp_super_secret_token_777"
    monkeypatch.setenv("PROMPT_MAINTAINER_MODE", "true")
    monkeypatch.setenv("PROMPT_MAINTAINER_GITHUB_TOKEN", secret_token)
    monkeypatch.setenv("PROMPT_MAINTAINER_GITHUB_REPO", "nugh75/counselorbot-sbs")
    monkeypatch.setenv("PROMPT_MAINTAINER_GITHUB_BASE_BRANCH", "main")

    entry = prompt_registry.config_entry("prompt_generic")
    assert entry is not None
    factory_original = prompt_registry.factory_text(entry) or ""
    custom_text = factory_original + "\n- Extra maintainer rule."

    db.add(models.Config(key="prompt_generic", value=custom_text, description=""))
    prompt_revisions.record(db, prompt_revisions.SCOPE_CONFIG, "prompt_generic", custom_text, prompt_revisions.ORIGIN_ADMIN)
    db.commit()

    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.path, request.headers.get("Authorization")))
        assert request.headers.get("Authorization") == f"Bearer {secret_token}"
        if request.method == "GET" and request.url.path.endswith("/git/ref/heads/main"):
            return httpx.Response(200, json={"object": {"sha": "abc123base"}})
        if request.method == "GET" and request.url.path.endswith("/contents/backend/prompts/default_system_prompt_generic.md"):
            encoded = base64.b64encode((factory_original + "\n").encode("utf-8")).decode("ascii")
            return httpx.Response(200, json={"sha": "blobsha1", "content": encoded})
        if request.method == "POST" and request.url.path.endswith("/git/refs"):
            body = json.loads(request.content)
            assert body["sha"] == "abc123base"
            assert body["ref"].startswith("refs/heads/prompt-factory/config-prompt_generic-")
            return httpx.Response(201, json={"ref": body["ref"]})
        if request.method == "PUT" and request.url.path.endswith("/contents/backend/prompts/default_system_prompt_generic.md"):
            body = json.loads(request.content)
            assert body["sha"] == "blobsha1"
            assert base64.b64decode(body["content"]).decode("utf-8") == custom_text + "\n"
            return httpx.Response(200, json={"commit": {"sha": "commitsha2"}})
        if request.method == "POST" and request.url.path.endswith("/pulls"):
            body = json.loads(request.content)
            assert body["base"] == "main"
            assert "config:prompt_generic" in body["body"]
            assert "Better clarity" in body["body"]
            assert secret_token not in body["body"]
            return httpx.Response(201, json={"html_url": "https://github.com/nugh75/counselorbot-sbs/pull/1999", "number": 1999})
        return httpx.Response(404, json={"message": "unexpected"})

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    result = prompt_maintainer.promote_prompt_to_factory(
        db,
        "config:prompt_generic",
        note="Better clarity",
        actor="nugh75",
        http_client=mock_client,
    )
    assert result["pr_number"] == 1999
    assert result["pr_url"] == "https://github.com/nugh75/counselorbot-sbs/pull/1999"
    assert result["file_path"] == "backend/prompts/default_system_prompt_generic.md"
    assert secret_token not in json.dumps(result)
    assert len(calls) == 5


def test_promote_rejects_unchanged_prompt_with_409(db, monkeypatch):
    monkeypatch.setenv("PROMPT_MAINTAINER_MODE", "true")
    monkeypatch.setenv("PROMPT_MAINTAINER_GITHUB_TOKEN", "ghp_test_token")

    entry = prompt_registry.config_entry("prompt_generic")
    assert entry is not None
    factory_text = prompt_registry.factory_text(entry) or ""
    db.add(models.Config(key="prompt_generic", value=factory_text, description=""))
    db.commit()

    with _client_for(db) as client:
        card = client.get("/api/admin/prompt-health/prompt", params={"id": "config:prompt_generic"}).json()
        assert card["maintainer_promote"]["enabled"] is True
        assert card["maintainer_promote"]["promotable"] is False
        res = client.post("/api/admin/prompt-health/promote-factory", json={"prompt_id": "config:prompt_generic"})
        assert res.status_code == 409
        assert res.json()["detail"] == "prompt_matches_factory"
