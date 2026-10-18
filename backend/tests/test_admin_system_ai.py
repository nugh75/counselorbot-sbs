"""Admin «Riserva di sistema» test endpoint (POST /admin/system-ai/test).

Fake clients and unit calls only: no real network or paid API calls.
"""
import json
import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend import auth, database, models
from backend.ai_service import AIError, AIService
from backend.routes import admin

SECRET_PROBE_KEY = "sk-super-secret-system-ai-test-token"


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    for table in (models.Config, models.Log, models.PromptRevision):
        table.__table__.create(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


@pytest.fixture
def client(db):
    app = FastAPI()
    app.include_router(admin.router)
    actor = {"user": models.User(id=1, username="admin", is_admin=True)}
    app.dependency_overrides[database.get_db] = lambda: db
    app.dependency_overrides[auth.get_current_active_admin] = lambda: actor["user"]
    with TestClient(app, headers={"X-Requested-With": "CounselorBot"}) as c:
        c.actor = actor
        yield c


def test_browser_mutation_required(client):
    res = client.post("/admin/system-ai/test", headers={"X-Requested-With": ""})
    assert res.status_code == 403


def test_admin_required(client):
    client.app.dependency_overrides[auth.get_current_active_admin] = lambda: (_ for _ in ()).throw(
        admin.HTTPException(status_code=403, detail="Forbidden")
    )
    res = client.post("/admin/system-ai/test")
    assert res.status_code == 403


def test_unconfigured_system_ai_reports_not_configured_status(client, db):
    # active_provider and model_name not in DB
    res = client.post("/admin/system-ai/test")
    assert res.status_code == 200
    data = res.json()
    assert data["system_configured"] is False
    assert len(data["results"]) == 1
    primary = data["results"][0]
    assert primary["role"] == "primary"
    assert primary["ok"] is False
    assert primary["error_code"] == "not_configured"
    assert primary["elapsed_ms"] == 0


def test_configured_system_ai_successful_call(client, db, monkeypatch):
    db.merge(models.Config(key="active_provider", value="mistral"))
    db.merge(models.Config(key="model_name", value="mistral-small-latest"))
    db.commit()

    called = []

    def fake_call_model(self, provider, model, user_message, system_prompt, max_tokens=None):
        called.append((provider, model, user_message, max_tokens))
        self.last_model = model
        return "OK"

    monkeypatch.setattr(AIService, "call_model", fake_call_model)

    res = client.post("/admin/system-ai/test")
    assert res.status_code == 200
    data = res.json()
    assert data["system_configured"] is True
    assert len(data["results"]) == 1
    primary = data["results"][0]
    assert primary["role"] == "primary"
    assert primary["provider"] == "mistral"
    assert primary["model"] == "mistral-small-latest"
    assert primary["effective_model"] == "mistral-small-latest"
    assert primary["ok"] is True
    assert primary["error_code"] is None
    assert primary["elapsed_ms"] >= 1
    assert called == [("mistral", "mistral-small-latest", "Ping", 16)]


@pytest.mark.parametrize(
    ("raised_exc", "expected_code"),
    [
        (AIError("Mistral API Key non configurata"), "auth"),
        (type("Err", (Exception,), {"status_code": 401, "body": {"error": {"message": "invalid api key"}}})(), "auth"),
        (type("Err", (Exception,), {"status_code": 404, "body": {"error": {"code": "model_not_found"}}})(), "model_not_found"),
        (type("Err", (Exception,), {"status_code": 402, "body": {"error": {"message": "insufficient_quota"}}})(), "quota"),
        (httpx.ReadTimeout("Request timed out"), "timeout"),
        (httpx.ConnectError("Failed to connect"), "network"),
        (type("Err", (Exception,), {"status_code": 429, "body": {"error": {"message": "rate limit exceeded"}}})(), "rate_limit"),
        (type("Err", (Exception,), {"status_code": 400, "body": {"error": {"message": "invalid request"}}})(), "invalid_request"),
        (RuntimeError("something unexpected"), "unknown"),
    ],
)
def test_error_classification_without_secrets(client, db, monkeypatch, raised_exc, expected_code):
    db.merge(models.Config(key="active_provider", value="mistral"))
    db.merge(models.Config(key="model_name", value="mistral-small-latest"))
    db.commit()

    def fake_failing_call(self, provider, model, user_message, system_prompt, max_tokens=None):
        raise raised_exc

    monkeypatch.setattr(AIService, "call_model", fake_failing_call)

    res = client.post("/admin/system-ai/test")
    assert res.status_code == 200
    data = res.json()
    primary = data["results"][0]
    assert primary["ok"] is False
    assert primary["error_code"] == expected_code
    # Ensure no sensitive values leaked in response payload
    serialized = json.dumps(data)
    assert SECRET_PROBE_KEY not in serialized


def test_probes_each_fallback_in_order(client, db, monkeypatch):
    db.merge(models.Config(key="active_provider", value="mistral"))
    db.merge(models.Config(key="model_name", value="mistral-small-latest"))
    db.merge(
        models.Config(
            key="ai_fallback_targets",
            value=json.dumps([
                {"provider": "openrouter", "model": "openrouter/free"},
                {"provider": "ollama", "model": "local-fallback"},
            ]),
        )
    )
    db.commit()

    called = []

    def fake_call_model(self, provider, model, user_message, system_prompt, max_tokens=None):
        called.append((provider, model))
        if provider == "openrouter":
            raise AIError("openrouter rate limit", code="rate_limit")
        return "OK"

    monkeypatch.setattr(AIService, "call_model", fake_call_model)

    res = client.post("/admin/system-ai/test")
    assert res.status_code == 200
    data = res.json()
    assert data["system_configured"] is True
    assert len(data["results"]) == 3

    assert data["results"][0]["role"] == "primary"
    assert data["results"][0]["provider"] == "mistral"
    assert data["results"][0]["ok"] is True

    assert data["results"][1]["role"] == "fallback"
    assert data["results"][1]["provider"] == "openrouter"
    assert data["results"][1]["ok"] is False
    assert data["results"][1]["error_code"] == "rate_limit"

    assert data["results"][2]["role"] == "fallback"
    assert data["results"][2]["provider"] == "ollama"
    assert data["results"][2]["ok"] is True

    assert called == [
        ("mistral", "mistral-small-latest"),
        ("openrouter", "openrouter/free"),
        ("ollama", "local-fallback"),
    ]
