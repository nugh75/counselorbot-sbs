"""SQLite-portable unit & API tests for Issue #779: suggest prompt change via email or GitHub issue.

Runs without PostgreSQL or network access:
    PYTHONPATH=. python3 -m pytest -q backend/tests/test_prompt_suggestions_779.py
"""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

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
    prompt_registry,
    prompt_revisions,
    prompt_suggestions,
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
def _client_for(db, *, is_admin: bool = True, username: str = "school-admin"):
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


def _clear_channel_env(monkeypatch):
    for var in (
        "PROMPT_SUGGESTION_MAINTAINER_EMAIL",
        "SMTP_HOST",
        "SMTP_PORT",
        "SMTP_USERNAME",
        "SMTP_PASSWORD",
        "SMTP_PASSWORD_FILE",
        "SMTP_FROM",
        "SMTP_USE_TLS",
        "SMTP_USE_SSL",
        "PROMPT_SUGGESTION_GITHUB_TOKEN",
        "PROMPT_SUGGESTION_GITHUB_TOKEN_FILE",
        "PROMPT_SUGGESTION_GITHUB_REPO",
        "GITHUB_TOKEN",
        "COUNSELORBOT_INSTANCE_NAME",
        "COUNSELORBOT_HOSTNAME",
    ):
        monkeypatch.delenv(var, raising=False)


def test_rejects_unchanged_prompt_and_unconfigured_channels(db, monkeypatch):
    _clear_channel_env(monkeypatch)
    entry = prompt_registry.config_entry("prompt_generic")
    assert entry is not None
    factory_text = prompt_registry.factory_text(entry) or ""

    db.add(models.Config(key="prompt_generic", value=factory_text, description=""))
    db.commit()

    with _client_for(db) as client:
        card = client.get("/api/admin/prompt-health/prompt", params={"id": "config:prompt_generic"}).json()
        assert card["suggestion_channels"] == []
        res_unconfigured = client.post(
            "/api/admin/prompt-health/suggest",
            json={"prompt_id": "config:prompt_generic", "reason": "Improve clarity"},
        )
        assert res_unconfigured.status_code == 409
        assert res_unconfigured.json()["detail"] == "suggestion_channel_not_configured"

        # Enable email channel; unchanged prompt must still fail with 409 prompt_not_customised
        monkeypatch.setenv("PROMPT_SUGGESTION_MAINTAINER_EMAIL", "maintainer@example.org")
        monkeypatch.setenv("SMTP_HOST", "smtp.example.org")
        res_unchanged = client.post(
            "/api/admin/prompt-health/suggest",
            json={"prompt_id": "config:prompt_generic", "reason": "Improve clarity"},
        )
        assert res_unchanged.status_code == 409
        assert res_unchanged.json()["detail"] == "prompt_not_customised"


def test_email_suggestion_contains_key_instance_diff_and_leaves_factory_untouched(db, monkeypatch):
    _clear_channel_env(monkeypatch)
    monkeypatch.setenv("COUNSELORBOT_INSTANCE_NAME", "Liceo Galilei")
    monkeypatch.setenv("PROMPT_SUGGESTION_MAINTAINER_EMAIL", "maintainer@example.org")
    monkeypatch.setenv("SMTP_HOST", "smtp.example.org")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USERNAME", "bot@example.org")
    monkeypatch.setenv("SMTP_PASSWORD", "super_secret_smtp_pwd")

    entry = prompt_registry.config_entry("prompt_generic")
    assert entry is not None
    factory_before = prompt_registry.factory_text(entry) or ""
    custom_text = factory_before + "\n- Use concrete study examples."
    db.add(models.Config(key="prompt_generic", value=custom_text, description=""))
    prompt_revisions.record(db, prompt_revisions.SCOPE_CONFIG, "prompt_generic", custom_text, prompt_revisions.ORIGIN_ADMIN)
    db.commit()

    sent_messages = []

    class FakeSMTP:
        def __init__(self, host, port, *, use_ssl=False):
            self.host = host
            self.port = port
            self.use_ssl = use_ssl
            self.started_tls = False
            self.logged_in = None

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def starttls(self):
            self.started_tls = True

        def login(self, user, pwd):
            self.logged_in = (user, pwd)

        def send_message(self, msg):
            sent_messages.append((self, msg))

    result = prompt_suggestions.submit_suggestion(
        db,
        "config:prompt_generic",
        "Helps first-year students connect theory with tasks.",
        channel="email",
        actor="dirigente",
        smtp_factory=FakeSMTP,
    )
    assert result == {"prompt_id": "config:prompt_generic", "channel": "email", "recipient": "maintainer@example.org"}
    assert len(sent_messages) == 1
    smtp_conn, email_msg = sent_messages[0]
    assert smtp_conn.started_tls is True
    assert smtp_conn.logged_in == ("bot@example.org", "super_secret_smtp_pwd")
    assert email_msg["To"] == "maintainer@example.org"
    assert "config:prompt_generic" in email_msg["Subject"]
    assert "Liceo Galilei" in email_msg["Subject"]
    body = email_msg.get_content()
    assert "config:prompt_generic" in body
    assert "Liceo Galilei" in body
    assert "Helps first-year students connect theory with tasks." in body
    assert "+- Use concrete study examples." in body
    assert "super_secret_smtp_pwd" not in body
    assert prompt_registry.factory_text(entry) == factory_before


def test_github_issue_suggestion_and_explicit_channel_selection(db, monkeypatch):
    _clear_channel_env(monkeypatch)
    secret_token = "ghp_suggest_secret_779"
    monkeypatch.setenv("COUNSELORBOT_INSTANCE_NAME", "Istituto Volta")
    monkeypatch.setenv("PROMPT_SUGGESTION_MAINTAINER_EMAIL", "maintainer@example.org")
    monkeypatch.setenv("SMTP_HOST", "smtp.example.org")
    monkeypatch.setenv("PROMPT_SUGGESTION_GITHUB_TOKEN", secret_token)
    monkeypatch.setenv("PROMPT_SUGGESTION_GITHUB_REPO", "nugh75/counselorbot-sbs")

    assert prompt_suggestions.available_channels() == ["email", "github"]

    entry = prompt_registry.config_entry("prompt_generic")
    assert entry is not None
    factory_before = prompt_registry.factory_text(entry) or ""
    custom_text = factory_before + "\n- Keep tone encouraging."
    db.add(models.Config(key="prompt_generic", value=custom_text, description=""))
    db.commit()

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.url.path == "/repos/nugh75/counselorbot-sbs/issues"
        assert request.headers.get("Authorization") == f"Bearer {secret_token}"
        payload = json.loads(request.content)
        assert "config:prompt_generic" in payload["title"]
        assert "Istituto Volta" in payload["title"]
        assert "Tone works better with secondary students." in payload["body"]
        assert "+- Keep tone encouraging." in payload["body"]
        assert secret_token not in payload["body"]
        return httpx.Response(201, json={"html_url": "https://github.com/nugh75/counselorbot-sbs/issues/1888", "number": 1888})

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    result = prompt_suggestions.submit_suggestion(
        db,
        "config:prompt_generic",
        "Tone works better with secondary students.",
        channel="github",
        actor="admin2",
        http_client=mock_client,
    )
    assert result["channel"] == "github"
    assert result["issue_number"] == 1888
    assert result["issue_url"] == "https://github.com/nugh75/counselorbot-sbs/issues/1888"
    assert secret_token not in json.dumps(result)
    assert prompt_registry.factory_text(entry) == factory_before
