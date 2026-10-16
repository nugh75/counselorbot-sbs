"""Admin «Recupero documenti» API (block 6): settings, key presence, test, indexes.

Fake SDK clients and a fake collection only: real HTTP transport fails the test.
"""

import json
import threading

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend import auth, database, embedding_service as embeddings, models, pii_ner, rag_index as rag, rag_reindex_job
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
    # Job state and indexes live in the test directory only.
    monkeypatch.setattr(rag, "INDEX_DIR", str(tmp_path))
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


class _Texts(_Corpus):
    def __init__(self, texts):
        super().__init__(len(texts))
        self.texts = texts

    def chunks(self):
        return [{"source": f"doc{i}.md", "title": f"Doc {i}", "text": t} for i, t in enumerate(self.texts)]

    def signature(self):
        return {f"doc{i}.md": str(hash(t)) for i, t in enumerate(self.texts)}


@pytest.fixture
def collections(monkeypatch, tmp_path, collection):
    """Three public collections; the middle one can be made to fail on its own."""
    corpora = {"alpha": _Texts([f"Alpha {i}" for i in range(40)]),
               "broken": _Texts(["Broken 0"]),
               "gamma": _Texts(["Gamma 0", "Gamma 1"])}
    indexes = {}
    for cid, corpus in corpora.items():
        indexes[cid] = _index(tmp_path, corpus, cid)
        indexes[cid].public_corpus = True
    items = [{"id": cid, "label": cid.title(), "builtin": True, "api_publishable": True, "mode": "plain"}
             for cid in corpora]
    for module in (document_retrieval, rag):
        monkeypatch.setattr(module, "get_index", lambda c: indexes[c])
    monkeypatch.setattr(document_retrieval, "list_collections", lambda: [dict(i) for i in items])
    monkeypatch.setattr(document_retrieval, "collection_exists", lambda c: c in indexes)
    yield corpora, indexes
    assert rag_reindex_job.wait(5)


def _run_all(client):
    response = client.post("/admin/document-retrieval/reindex-all")
    assert response.status_code == 200
    assert rag_reindex_job.wait(5)
    return response.json(), client.get("/admin/document-retrieval/reindex-all").json()


def test_estimate_all_sums_collections_without_provider_calls(client, monkeypatch, collections):
    monkeypatch.setenv("API_KEY_MISTRAL", SECRET)
    _, _, calls = fake_client(monkeypatch, "mistral")
    _put(client, provider="mistral")
    plan = client.get("/admin/document-retrieval/estimate").json()
    assert plan["input_count"] == 43 and plan["price_known"] is True and plan["estimated_cost_usd"] > 0
    assert [c["id"] for c in plan["collections"]] == ["alpha", "broken", "gamma"]
    assert calls == []


def test_reindex_all_runs_in_sequence_with_batch_progress_and_retries(client, monkeypatch, collections):
    monkeypatch.setenv("API_KEY_MISTRAL", SECRET)
    client_mock, _, calls = fake_client(monkeypatch, "mistral")
    succeed = client_mock.embeddings.create.side_effect
    limited = [True]

    def create(**kwargs):
        if limited and kwargs["inputs"][0].startswith("Alpha 32"):
            limited.clear()
            calls.append(kwargs)
            raise type("RateLimitError", (Exception,), {"status_code": 429, "headers": {"retry-after": "0"}})()
        return succeed(**kwargs)

    client_mock.embeddings.create.side_effect = create
    sleeps = []
    monkeypatch.setattr(embeddings, "_sleep", sleeps.append)
    seen = []
    write = rag_reindex_job._write
    monkeypatch.setattr(rag_reindex_job, "_write", lambda state: (
        seen.append((state["current"], state["collections"][0]["done"], state["collections"][0]["total"])),
        write(state)))
    _put(client, provider="mistral")
    started, job = _run_all(client)
    assert started["started"] is True and started["job"]["status"] == "running"
    assert job["status"] == "done" and job["finished_at"] >= job["started_at"]
    assert [(c["id"], c["status"], c["done"], c["total"], c["error"]) for c in job["collections"]] == [
        ("alpha", "done", 40, 40, None), ("broken", "done", 1, 1, None), ("gamma", "done", 2, 2, None)]
    # Progress after each batch of the first collection, then the next ones in order.
    assert ("alpha", 32, 40) in seen and seen.index(("alpha", 32, 40)) < seen.index(("alpha", 40, 40))
    assert sleeps == [0.0] and len(calls) == 5  # 2 alpha batches + 1 retry + broken + gamma
    state = client.get("/admin/document-retrieval").json()
    assert all(c["vectors_match"] and not c["building"] for c in state["collections"][1:])
    assert state["reindex_job"]["status"] == "done" and SECRET not in json.dumps(state)


def test_one_failing_collection_does_not_stop_or_suspend_the_others(client, db, monkeypatch, collections):
    corpora, indexes = collections
    monkeypatch.setenv("API_KEY_MISTRAL", SECRET)
    fake_client(monkeypatch, "mistral")
    _put(client, provider="mistral")
    _run_all(client)
    previous = indexes["broken"].matrix
    # The new corpus has a passage over the per-input limit: only this collection fails.
    corpora["broken"].texts = ["Broken 0", "x" * 9000]
    corpora["alpha"].texts = corpora["alpha"].texts + ["Alpha extra"]
    _, job = _run_all(client)
    assert job["status"] == "done"
    assert [(c["id"], c["status"], c["error"]) for c in job["collections"]] == [
        ("alpha", "done", None), ("broken", "error", "embedding_input_limit"), ("gamma", "done", None)]
    # Previous vectors still serve the failed collection; semantic search is not suspended.
    assert indexes["broken"].matrix is previous and len(indexes["broken"].chunks) == 1
    state = client.get("/admin/document-retrieval").json()
    assert state["semantic_suspended_seconds"] == 0
    assert {c["id"]: c["last_build_error"] for c in state["collections"]}["broken"] == "embedding_input_limit"
    ai = _service(db)
    ai.embed_query = lambda text, **kw: [1.0] * 1024
    assert indexes["gamma"].search(ai, "Gamma")[0]["score"] > 0


def test_reindex_all_is_idempotent_while_running_in_any_worker(client, monkeypatch, collections):
    monkeypatch.setenv("API_KEY_MISTRAL", SECRET)
    client_mock, _, calls = fake_client(monkeypatch, "mistral")
    succeed = client_mock.embeddings.create.side_effect
    entered, release = threading.Event(), threading.Event()

    def blocking(**kwargs):
        entered.set()
        assert release.wait(5)
        return succeed(**kwargs)

    client_mock.embeddings.create.side_effect = blocking
    _put(client, provider="mistral")
    first = client.post("/admin/document-retrieval/reindex-all").json()
    try:
        assert entered.wait(5)
        second = client.post("/admin/document-retrieval/reindex-all").json()
        assert second["started"] is False and second["job"]["started_at"] == first["job"]["started_at"]
        running = client.get("/admin/document-retrieval").json()["reindex_job"]
        assert running["status"] == "running" and running["current"] == "alpha"
        assert running["collections"][0]["phase"] == "embedding"
        assert [c["status"] for c in running["collections"]] == ["running", "pending", "pending"]
    finally:
        release.set()
    assert rag_reindex_job.wait(5)
    assert client.get("/admin/document-retrieval/reindex-all").json()["status"] == "done"
    assert len(calls) == 4  # the second request started nothing


def test_job_left_running_by_a_stopped_worker_is_reported_interrupted(client, tmp_path, collection):
    state_path, _ = rag_reindex_job._paths()
    with open(state_path, "w") as f:
        json.dump({"status": "running", "collections": [{"id": "demo", "status": "running"}]}, f)
    job = client.get("/admin/document-retrieval/reindex-all").json()
    assert job["status"] == "interrupted" and job["collections"][0]["status"] == "interrupted"
    assert client.get("/admin/document-retrieval").json()["reindex_job"]["status"] == "interrupted"


def test_unusual_dimensions_are_saved_with_a_warning(client):
    assert _put(client, provider="openrouter", dimensions="786").json()["dimensions_warning"] == "embedding_dimensions_unusual"
    assert _put(client, provider="openrouter", dimensions="1536").json()["dimensions_warning"] is None
    assert _put(client, provider="mistral").json()["dimensions_warning"] is None


def test_reindex_all_endpoints_are_admin_and_browser_only(client):
    assert TestClient(client.app).post("/admin/document-retrieval/reindex-all").status_code == 403
    client.actor["identity"] = dict(client.actor["identity"], is_admin=False, is_researcher=True)
    for path in ("/admin/document-retrieval/reindex-all", "/admin/document-retrieval/estimate"):
        assert client.get(path).status_code == 403
    assert client.post("/admin/document-retrieval/reindex-all").status_code == 403


def _blocking_client(monkeypatch):
    """Fake Mistral that holds every call until released and records overlap."""
    client_mock, _, calls = fake_client(monkeypatch, "mistral")
    succeed = client_mock.embeddings.create.side_effect
    entered, release = threading.Event(), threading.Event()
    active, peak, lock = [0], [0], threading.Lock()

    def blocking(**kwargs):
        with lock:
            active[0] += 1
            peak[0] = max(peak[0], active[0])
        entered.set()
        try:
            assert release.wait(5)
            return succeed(**kwargs)
        finally:
            with lock:
                active[0] -= 1

    client_mock.embeddings.create.side_effect = blocking
    return calls, entered, release, peak


def test_single_builds_and_reindex_all_share_one_reservation(client, db, monkeypatch, collections):
    _, indexes = collections
    monkeypatch.setenv("API_KEY_MISTRAL", SECRET)
    calls, entered, release, peak = _blocking_client(monkeypatch)
    _put(client, provider="mistral")
    for index in indexes.values():
        del index.start_build  # the real background entrypoint, not the inline test helper
    gamma = indexes["gamma"]
    try:
        assert gamma.start_build(_service(db))
        assert entered.wait(5)
        # A single build is embedding: reindex-all does not start and says why.
        data = client.post("/admin/document-retrieval/reindex-all").json()
        assert (data["started"], data["reason"]) == (False, "build_in_progress")
        assert data["job"]["status"] == "idle"
        # Nor does a single build of another collection.
        assert client.post("/admin/document-retrieval/collections/alpha/reindex").status_code == 409
    finally:
        release.set()
    assert gamma.wait_for_build(5) and not gamma._building
    entered.clear()
    release.clear()
    gamma.matrix = None  # make gamma stale again so a single build would embed
    gamma.embedding_model = "other"
    try:
        assert client.post("/admin/document-retrieval/reindex-all").json()["started"] is True
        assert entered.wait(5)
        # While the job runs, every single build is refused and leaves the job's flag alone.
        assert gamma.start_build(_service(db)) is False
        assert client.post("/admin/document-retrieval/collections/gamma/reindex").status_code == 409
        assert indexes["alpha"]._building is True
    finally:
        release.set()
    assert rag_reindex_job.wait(5)
    job = client.get("/admin/document-retrieval/reindex-all").json()
    assert [c["status"] for c in job["collections"]] == ["done", "done", "done"]
    assert peak[0] == 1  # never two collections embedding at once
    assert not any(index._building for index in indexes.values())
    assert rag._build_reservation.acquire()  # released at the end
    rag._build_reservation.release()
