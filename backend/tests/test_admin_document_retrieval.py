"""Admin «Recupero documenti» API (block 6): settings, key presence, test, indexes.

Fake SDK clients and a fake collection only: real HTTP transport fails the test.
"""

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend import auth, database, embedding_service as embeddings, models, pii_ner
from backend.ai_service import AIService
from backend.api_secrets import API_KEY_ENV_MAP
from backend.routes import document_retrieval
from backend.tests.test_embedding_provider import fake_client, no_network  # noqa: F401
from backend.tests.test_rag_embedding_degradation import _Corpus, _index

SECRET = "sk-very-secret-value-0123456789"


@pytest.fixture
def db(monkeypatch):
    for names in API_KEY_ENV_MAP.values():
        for name in names:
            monkeypatch.delenv(name, raising=False)
    # Routes run in the TestClient threadpool: share one in-memory connection.
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    for table in (models.Config, models.Log, models.PromptRevision):
        table.__table__.create(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def _service(db):
    # Real config loading without the unrelated personal/chat tables.
    ai = AIService.__new__(AIService)
    ai.db = db
    ai.config = ai._load_config()
    ai.embedding_provider, ai.embedding_model, ai.embedding_dimensions = embeddings.options(ai.config)
    ai.monthly_budget_usd = 0.0
    ai._budget_locked_cache = None
    return ai


@pytest.fixture
def collection(monkeypatch, tmp_path):
    index = _index(tmp_path, _Corpus())
    index.public_corpus = True
    item = {"id": "demo", "label": "Demo", "builtin": True, "api_publishable": True, "mode": "plain"}
    monkeypatch.setattr(document_retrieval, "list_collections", lambda: [dict(item)])
    monkeypatch.setattr(document_retrieval, "collection_exists", lambda c: c == "demo")
    monkeypatch.setattr(document_retrieval, "get_index", lambda c: index)
    return index


@pytest.fixture
def client(db, monkeypatch, collection):
    monkeypatch.setattr(document_retrieval, "AIService", _service)
    monkeypatch.setattr(embeddings, "_ner_failures", {})
    db.merge(models.Config(key="pii_ner_enabled", value="false"))
    db.commit()
    app = FastAPI()
    app.include_router(document_retrieval.router)
    actor = {"identity": dict(auth._anonymous_identity(), authenticated=True, username="admin", is_admin=True)}
    app.dependency_overrides[database.get_db] = lambda: db
    app.dependency_overrides[auth.get_identity] = lambda: actor["identity"]
    with TestClient(app, headers={"X-Requested-With": "CounselorBot"}) as c:
        c.actor = actor
        yield c


def _put(client, **body):
    return client.put("/admin/document-retrieval", json={"provider": "ollama", "mode": "hybrid", **body})


def test_reading_settings_reports_key_presence_never_its_value(client, monkeypatch):
    monkeypatch.setenv("API_KEY_MISTRAL", SECRET)
    response = client.get("/admin/document-retrieval")
    assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
    data = response.json()
    assert (data["provider"], data["model"], data["mode"]) == ("ollama", "qwen3-embedding:4b", "hybrid")
    providers = {p["id"]: p for p in data["providers"]}
    assert providers["mistral"]["key_present"] is True and providers["mistral"]["key_env"] == ["API_KEY_MISTRAL"]
    assert providers["openrouter"]["key_present"] is False
    assert providers["openrouter"]["default_model"] == "google/gemini-embedding-2"
    assert providers["ollama"]["key_present"] is None and providers["none"]["external"] is False
    assert data["collections"][0]["id"] == "demo" and data["collections"][0]["vectors_allowed"] is True
    assert SECRET not in response.text


def test_switching_local_external_and_none_saves_explicit_models(client, db):
    data = _put(client, provider="mistral").json()
    assert (data["provider"], data["model"], data["dimensions"]) == ("mistral", "mistral-embed", None)
    data = _put(client, provider="openrouter").json()
    assert (data["model"], data["dimensions"]) == ("google/gemini-embedding-2", 768)
    data = _put(client, provider="openrouter", model="qwen/qwen3-embedding-8b", dimensions="1024").json()
    assert (data["model"], data["dimensions"]) == ("qwen/qwen3-embedding-8b", 1024)
    data = _put(client, provider="none", mode="lexical").json()
    assert (data["provider"], data["mode"]) == ("none", "lexical")
    assert data["collections"][0]["vectors_allowed"] is False
    data = _put(client, provider="ollama", dimensions="512").json()
    assert (data["provider"], data["model"], data["dimensions"]) == ("ollama", "qwen3-embedding:4b", None)
    rows = {r.key: r.value for r in db.query(models.Config).filter(models.Config.key.in_(document_retrieval.KEYS))}
    assert rows == {"embedding_provider": "ollama", "embedding_model": "qwen3-embedding:4b",
                    "embedding_dimensions": "", "rag_retrieval_mode": "hybrid"}


@pytest.mark.parametrize("body,status", [
    ({"provider": "mistral", "dimensions": "768"}, 400),
    ({"provider": "openrouter", "dimensions": "4096"}, 400),
    ({"provider": "openrouter", "dimensions": "abc"}, 400),
    ({"provider": "openai"}, 422),
    ({"mode": "semantic"}, 422),
    ({"api_key": SECRET}, 422),
])
def test_invalid_settings_are_rejected_without_writes(client, db, body, status):
    response = _put(client, **body)
    assert response.status_code == status and SECRET not in response.text
    assert db.query(models.Config).filter_by(key="embedding_provider").first() is None


def test_admin_only_and_browser_only_mutations(client):
    for call in (lambda c: c.put("/admin/document-retrieval", json={"provider": "none", "mode": "lexical"}),
                 lambda c: c.post("/admin/document-retrieval/test"),
                 lambda c: c.post("/admin/document-retrieval/collections/demo/reindex")):
        assert call(TestClient(client.app)).status_code == 403  # no X-Requested-With
    client.actor["identity"] = dict(client.actor["identity"], is_admin=False, is_researcher=True)
    for path in ("/admin/document-retrieval", "/admin/document-retrieval/collections/demo/estimate"):
        assert client.get(path).status_code == 403
    assert client.post("/admin/document-retrieval/test").status_code == 403


@pytest.mark.parametrize("provider,dims", [("mistral", 1024), ("openrouter", 768)])
def test_probe_embeds_only_the_fixed_fictitious_text(client, monkeypatch, provider, dims):
    monkeypatch.setenv(f"API_KEY_{provider.upper()}", SECRET)
    _, _, calls = fake_client(monkeypatch, provider)
    _put(client, provider=provider)
    response = client.post("/admin/document-retrieval/test")
    data = response.json()
    assert data["ok"] is True and data["dimensions"] == dims and data["query_filter"] == "ok"
    assert [call.get("inputs", call.get("input")) for call in calls] == [[document_retrieval.TEST_TEXT]]
    assert SECRET not in response.text


def test_probe_reports_classified_errors_without_details(client, monkeypatch):
    _put(client, provider="mistral")
    data = client.post("/admin/document-retrieval/test").json()
    assert (data["ok"], data["error"]) == (False, "embedding_missing_key")
    _put(client, provider="none", mode="lexical")
    data = client.post("/admin/document-retrieval/test").json()
    assert (data["ok"], data["error"]) == (False, "embedding_disabled") and "query_filter" not in data


def test_unreachable_ner_is_shown_as_blocked_external_queries(client, db, monkeypatch):
    monkeypatch.setenv("API_KEY_MISTRAL", SECRET)
    fake_client(monkeypatch, "mistral")
    db.merge(models.Config(key="pii_ner_enabled", value="true"))
    db.commit()
    _put(client, provider="mistral")
    privacy = client.get("/admin/document-retrieval").json()["privacy"]
    assert privacy["ner_required"] is True and privacy["queries_blocked"] is False

    def ner_down(*args):
        raise httpx.ConnectError("detector down")

    monkeypatch.setattr(pii_ner, "_ner_entities", ner_down)
    data = client.post("/admin/document-retrieval/test").json()
    # Documents still work; the query filter fails closed and the panel says so.
    assert data["ok"] is True and data["query_filter"] == "embedding_privacy_blocked"
    privacy = client.get("/admin/document-retrieval").json()["privacy"]
    assert privacy["ner_status"] == "unreachable" and privacy["queries_blocked"] is True
    # The panel offers the choice; it never changes the policy by itself.
    assert db.query(models.Config).filter_by(key="pii_ner_enabled").one().value == "true"


def test_estimate_and_reindex_per_collection(client, monkeypatch, collection):
    monkeypatch.setenv("API_KEY_MISTRAL", SECRET)
    _, _, calls = fake_client(monkeypatch, "mistral")
    _put(client, provider="mistral")
    plan = client.get("/admin/document-retrieval/collections/demo/estimate").json()
    assert plan["input_count"] == 2 and plan["price_known"] is True and calls == []
    response = client.post("/admin/document-retrieval/collections/demo/reindex")
    data = response.json()
    assert data["status"] == "building" and data["collection"]["vectors_match"] is True
    assert len(calls) == 1 and SECRET not in response.text
    assert client.get("/admin/document-retrieval/collections/missing/estimate").status_code == 404
    assert client.post("/admin/document-retrieval/collections/missing/reindex").status_code == 404


def test_configured_lexical_mode_never_calls_the_provider(client, db, monkeypatch, collection):
    monkeypatch.setenv("API_KEY_MISTRAL", SECRET)
    _, constructor, _ = fake_client(monkeypatch, "mistral")
    _put(client, provider="mistral", mode="lexical")
    assert collection.search(_service(db), "Testo 1")
    constructor.assert_not_called()
