import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import models, schemas
from backend.api_secrets import API_KEY_ENV_MAP, resolve_api_secret
from backend.ai_service import AIService
from backend.routes import admin


@pytest.fixture()
def db(monkeypatch):
    for variables in API_KEY_ENV_MAP.values():
        for variable in variables:
            monkeypatch.delenv(variable, raising=False)
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


def test_environment_is_the_only_runtime_source(db, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "environment-value")

    resolved = resolve_api_secret(db, "gemini")

    assert resolved.source == "environment"
    assert resolved.environment_variable == "GEMINI_API_KEY"
    assert resolved.value == "environment-value"
    assert AIService(db).config["api_key_gemini"] == "environment-value"


def test_missing_environment_key_is_unset_without_database_fallback(db):
    db.add(models.Config(key="api_key_openai", value="legacy-secret", description="legacy"))
    db.add(models.APISecret(provider="openai", encrypted_value="legacy-encrypted-secret"))
    db.commit()

    resolved = resolve_api_secret(db, "openai")

    assert resolved.source == "unset"
    assert resolved.value is None
    assert AIService(db).config.get("api_key_openai") is None


def test_admin_api_is_read_only_and_never_returns_secret(db, monkeypatch):
    monkeypatch.setenv("API_KEY_OPENAI", "environment-secret")

    statuses = asyncio.run(admin.list_api_keys(current_user={}, db=db))
    openai = next(item for item in statuses if item["provider"] == "openai")
    assert openai == {
        "provider": "openai",
        "configured": True,
        "source": "environment",
        "editable": False,
        "environment_variable": "API_KEY_OPENAI",
        "preferred_environment_variable": "API_KEY_OPENAI",
        "updated_at": None,
    }
    assert "environment-secret" not in repr(statuses)
    assert all(item["editable"] is False for item in statuses)

    for operation in (
        lambda: admin.update_api_key(
            "mistral",
            admin.APIKeyUpdate(value="replacement"),
            current_user={"username": "admin"},
            db=db,
        ),
        lambda: admin.remove_api_key("mistral", current_user={}, db=db),
    ):
        with pytest.raises(HTTPException) as exc:
            asyncio.run(operation())
        assert exc.value.status_code == 409
        assert "ai4educ Console" in exc.value.detail

    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin.create_or_update_config(
            schemas.ConfigCreate(key="api_key_openai", value="replacement", description="legacy"),
            current_user={},
            db=db,
        ))
    assert exc.value.status_code == 409


def test_explicit_verification_uses_environment_key(db, monkeypatch):
    monkeypatch.setenv("API_KEY_DEEPSEEK", "environment-secret")

    class WorkingService:
        def __init__(self, _db):
            pass

        def verify_api_key(self, provider):
            return provider == "deepseek"

    monkeypatch.setattr(admin, "AIService", WorkingService)
    result = asyncio.run(admin.verify_api_key("deepseek", current_user={}, db=db))
    assert result == {"provider": "deepseek", "working": True}


def test_gemini_verification_keeps_client_alive_while_models_are_read(db, monkeypatch):
    from google import genai

    monkeypatch.setenv("GEMINI_API_KEY", "environment-value")

    class Models:
        def __init__(self):
            self.closed = False

        def list(self):
            def items():
                if self.closed:
                    raise RuntimeError("client closed before models were read")
                yield object()

            return items()

    class Client:
        def __init__(self, **_kwargs):
            self.models = Models()

        def __del__(self):
            self.models.closed = True

    monkeypatch.setattr(genai, "Client", Client)

    assert AIService(db).verify_api_key("gemini") is True
