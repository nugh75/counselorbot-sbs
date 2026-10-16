"""Offline provider/config/accounting/temporary privacy contract: no network clients."""

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend import embedding_service as embeddings, models, rag_index as rag
from backend.ai_service import AIError, AIService
from backend.api_secrets import API_KEY_ENV_MAP
from backend.memory_embeddings import MemoryEmbedder
from backend.tests.test_rag_embedding_degradation import _Corpus, _Embedder, _index

ORIGINAL_HTTP_SEND = httpx.Client.send


@pytest.fixture
def db(monkeypatch):
    for names in API_KEY_ENV_MAP.values():
        for name in names:
            monkeypatch.delenv(name, raising=False)
    engine = create_engine("sqlite:///:memory:")
    # Full metadata contains PostgreSQL-only types. Only these tables are needed.
    models.Config.__table__.create(engine)
    models.Log.__table__.create(engine)
    models.PromptRevision.__table__.create(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail("Real HTTP transport forbidden")

    monkeypatch.setattr(httpx.Client, "send", forbidden)
    monkeypatch.setattr(rag, "_embedding_cooldown", rag._EmbeddingCooldown(300))


def service(db, provider=None, **config):
    if provider is not None:
        config["embedding_provider"] = provider
    config.setdefault("embedding_model", "")
    for key, value in config.items():
        db.merge(models.Config(key=key, value=str(value)))
    db.commit()
    # Exercise real config loading while avoiding unrelated personal/chat DB tables.
    ai = AIService.__new__(AIService)
    ai.db = db
    ai.config = ai._load_config()
    ai.embedding_provider, ai.embedding_model, ai.embedding_dimensions = (
        embeddings.options(ai.config)
    )
    ai.monthly_budget_usd = float(config.get("monthly_budget_usd", 0))
    ai._budget_locked_cache = None
    ai.last_usage = {"prompt_tokens": 123}
    ai.last_provider, ai.last_model = "chat-provider", "chat-model"
    return ai


def fake_client(monkeypatch, provider, dimensions=None, fail_on=None, usage=100):
    client = MagicMock()
    calls = []

    def create(**kwargs):
        batch = kwargs.get("inputs", kwargs.get("input"))
        calls.append(kwargs)
        if fail_on == len(calls):
            raise httpx.ReadTimeout("sensitive key and raw text must not escape")
        n = kwargs.get(
            "dimensions", dimensions or (1024 if provider == "mistral" else 768)
        )
        return SimpleNamespace(
            data=[
                SimpleNamespace(index=i, embedding=[float(i + 1)] * n)
                for i in reversed(range(len(batch)))
            ],
            usage=SimpleNamespace(prompt_tokens=usage),
        )

    client.embeddings.create.side_effect = create
    constructor = Mock(return_value=client)
    monkeypatch.setattr(
        embeddings, "Mistral" if provider == "mistral" else "OpenAI", constructor
    )
    return client, constructor, calls


@pytest.mark.parametrize(
    "provider,model,dimensions,cost",
    [
        ("mistral", "mistral-embed", 1024, 0.00001),
        ("openrouter", "google/gemini-embedding-2", 768, 0.00002),
    ],
)
def test_external_dispatch_batches_dimensions_usage_cost(
    db, monkeypatch, provider, model, dimensions, cost
):
    monkeypatch.setenv(f"API_KEY_{provider.upper()}", "fake-system")
    client, constructor, calls = fake_client(monkeypatch, provider)
    ai = service(db, provider)
    ai.config[f"api_key_{provider}"] = "fake-personal-must-not-be-used"
    vectors = ai.embed_texts([f"public {i}" for i in range(33)], public_corpus=True)
    assert len(vectors) == 33 and len(vectors[0]) == dimensions
    assert vectors[0][0] == 1 and vectors[31][0] == 32  # reordered by response index
    assert len(calls) == 2 and constructor.call_args.kwargs["api_key"] == "fake-system"
    assert calls[0]["model"] == model
    if provider == "openrouter":
        assert (
            constructor.call_args.kwargs["base_url"] == "https://openrouter.ai/api/v1"
        )
        assert constructor.call_args.kwargs["max_retries"] == 0
        assert constructor.call_args.kwargs["timeout"] == 120.0
        assert calls[0]["dimensions"] == 768
        client.close.assert_called_once()
    else:
        assert constructor.call_args.kwargs["timeout_ms"] == 120000
        assert calls[0]["timeout_ms"] == 120000
        client.__exit__.assert_called_once()
    rows = db.query(models.Log).all()
    assert len(rows) == 2 and all(row.cost_usd == pytest.approx(cost) for row in rows)
    assert all(row.provider == provider and row.action == "embedding" for row in rows)
    assert rows[0].details["credential_source"] == "system"
    assert rows[0].details["usage"]["prompt_tokens"] == 100
    assert "public 0" not in json.dumps(rows[0].details)
    assert ai.last_usage == {"prompt_tokens": 123}
    assert (ai.last_provider, ai.last_model) == ("chat-provider", "chat-model")


def test_openrouter_custom_model_price_and_dimensions(db, monkeypatch):
    monkeypatch.setenv("API_KEY_OPENROUTER", "fake-system")
    _, _, calls = fake_client(monkeypatch, "openrouter")
    ai = service(
        db,
        "openrouter",
        embedding_dimensions=256,
        embedding_model="custom/model",
        embedding_prices_per_million='{"openrouter/custom/model": 0.35}',
    )
    assert len(ai.embed_texts(["public"], public_corpus=True)[0]) == 256
    assert calls[0]["dimensions"] == 256
    assert db.query(models.Log).one().cost_usd == pytest.approx(0.000035)


@pytest.mark.parametrize(
    "model,price",
    [("qwen/qwen3-embedding-8b", 0.01), ("mistralai/mistral-embed-2312", 0.10)],
)
def test_openrouter_alternative_models(db, monkeypatch, model, price):
    monkeypatch.setenv("API_KEY_OPENROUTER", "fake")
    _, _, calls = fake_client(monkeypatch, "openrouter")
    ai = service(db, "openrouter", embedding_model=model)
    ai.embed_texts(["public"], public_corpus=True)
    assert "dimensions" not in calls[0]
    assert db.query(models.Log).one().details["price_per_million"] == price


def test_ollama_default_batch_timeout_and_query_purpose(db, monkeypatch):
    client = MagicMock()
    client.post.side_effect = lambda url, json: SimpleNamespace(
        raise_for_status=lambda: None,
        json=lambda: {"embeddings": [[1.0, 2.0] for _ in json["input"]]},
    )
    constructor = Mock(return_value=client)
    monkeypatch.setattr(embeddings.httpx, "Client", constructor)
    ai = service(db, ai_timeout_seconds=45, ollama_ip="http://127.0.0.1:9999/")
    assert (
        ai.embedding_provider == "ollama" and ai.embedding_model == "qwen3-embedding:4b"
    )
    assert len(ai.embed_texts(["text"] * 33)) == 33
    assert len(client.post.call_args_list) == 2
    assert client.post.call_args.args == ("http://127.0.0.1:9999/api/embed",)
    assert constructor.call_args.kwargs["timeout"].read == 45
    assert ai.embed_query("private query") == [1.0, 2.0]
    assert db.query(models.Log).count() == 0


@pytest.mark.parametrize(
    "provider", ["openai", "gemini", "together", "fireworks", "deepinfra", "invalid"]
)
def test_unimplemented_providers_fail_explicitly(db, provider):
    with pytest.raises(AIError) as exc:
        service(db, provider).embed_texts(["public"], public_corpus=True)
    assert exc.value.code == "embedding_unsupported_provider"


@pytest.mark.parametrize("provider", ["mistral", "openrouter"])
def test_missing_key_classified_and_bm25_fallback(db, monkeypatch, tmp_path, provider):
    ai = service(db, provider)
    with pytest.raises(AIError) as exc:
        ai.embed_texts(["public"], public_corpus=True)
    assert exc.value.code == "embedding_missing_key"
    index = _index(tmp_path, _Corpus())
    index.public_corpus = True
    assert index.search(ai, "Testo")
    assert index.matrix is None and db.query(models.Log).count() == 0


@pytest.mark.parametrize("provider", ["mistral", "openrouter"])
def test_external_queries_and_private_documents_never_leave_process(
    db, monkeypatch, provider, tmp_path
):
    monkeypatch.setenv(f"API_KEY_{provider.upper()}", "fake")
    _, constructor, _ = fake_client(monkeypatch, provider)
    ai = service(db, provider)
    for call in [
        lambda: ai.embed_query("student scores and name"),
        lambda: ai.embed_texts(["memory transcript"]),
        lambda: ai.embed_texts(["private"], purpose="query", public_corpus=True),
    ]:
        with pytest.raises(AIError) as exc:
            call()
        assert exc.value.code == "embedding_privacy_blocked"
    embedder = MemoryEmbedder(tmp_path / "memory.npz")
    assert embedder.rank(ai, "private", ["transcript"], 1) is None
    index = _index(tmp_path, _Corpus())  # private/dynamic default
    assert index.search(ai, "Testo")
    assert index.matrix is None
    constructor.assert_not_called()
    index.public_corpus = True
    assert index.search(ai, "student Testo")  # documents only are embedded
    assert constructor.call_count == 1
    assert all(
        "student" not in t
        for t in constructor.return_value.embeddings.create.call_args.kwargs.get(
            "inputs",
            constructor.return_value.embeddings.create.call_args.kwargs.get("input"),
        )
    )
    ai.embed_query = Mock(side_effect=AssertionError("external query called"))
    assert index.search(ai, "Testo", retrieval_mode="vector")
    ai.embed_query.assert_not_called()


def test_none_skips_cached_vectors_and_all_clients(db, tmp_path):
    index = _index(tmp_path, _Corpus())
    index.build(_Embedder(fail=False))
    assert index.matrix is not None
    ai = service(db, "none")
    ai.embed_texts = Mock(side_effect=AssertionError("disabled"))
    ai.embed_query = Mock(side_effect=AssertionError("disabled"))
    assert index.search(ai, "Testo", retrieval_mode="vector")
    assert not index.needs_rebuild(ai)
    ai.embed_texts.assert_not_called()
    ai.embed_query.assert_not_called()
    assert (
        MemoryEmbedder(tmp_path / "memory.npz").rank(ai, "private", ["item"], 1) is None
    )


@pytest.mark.parametrize("provider", ["mistral", "openrouter"])
def test_budget_blocks_next_batch_and_cost_survives_later_failure(
    db, monkeypatch, provider
):
    monkeypatch.setenv(f"API_KEY_{provider.upper()}", "fake")
    _, _, calls = fake_client(monkeypatch, provider, fail_on=2)
    ai = service(db, provider, monthly_budget_usd=0.000001)
    with pytest.raises(AIError) as exc:
        ai.embed_texts(["public"] * 33, public_corpus=True)
    assert exc.value.code == "embedding_budget_exceeded" and len(calls) == 1
    assert db.query(models.Log).count() == 1
    ai.monthly_budget_usd = 0
    with pytest.raises(AIError) as exc:
        ai.embed_texts(["public"], public_corpus=True)
    assert exc.value.code == "embedding_timeout"
    assert "sensitive" not in str(exc.value)
    assert db.query(models.Log).count() == 1


def test_missing_usage_is_estimated_and_accounted(db, monkeypatch):
    monkeypatch.setenv("API_KEY_MISTRAL", "fake")
    fake_client(monkeypatch, "mistral", usage=None)
    service(db, "mistral").embed_texts(["public"], public_corpus=True)
    row = db.query(models.Log).one()
    assert row.details["usage_estimated"] and row.details["usage"]["prompt_tokens"] == 6
    assert row.cost_usd > 0


@pytest.mark.parametrize(
    "config,code",
    [
        ({"embedding_model": "custom"}, "embedding_price_missing"),
        ({"embedding_dimensions": "12"}, "embedding_invalid_dimensions"),
        (
            {"embedding_prices_per_million": '{"mistral/mistral-embed": -1}'},
            "embedding_invalid_config",
        ),
    ],
)
def test_bad_config_does_not_call_client(db, monkeypatch, config, code):
    monkeypatch.setenv("API_KEY_MISTRAL", "fake")
    _, constructor, _ = fake_client(monkeypatch, "mistral")
    with pytest.raises(AIError) as exc:
        service(db, "mistral", **config).embed_texts(["public"], public_corpus=True)
    assert exc.value.code == code
    constructor.assert_not_called()


def test_full_input_validated_before_first_paid_batch(db, monkeypatch):
    monkeypatch.setenv("API_KEY_MISTRAL", "fake")
    _, constructor, _ = fake_client(monkeypatch, "mistral")
    with pytest.raises(AIError) as exc:
        service(db, "mistral").embed_texts(
            ["public"] * 32 + ["a" * 16001], public_corpus=True
        )
    assert exc.value.code == "embedding_input_limit"
    constructor.assert_not_called()


def test_malformed_paid_response_is_accounted(db, monkeypatch):
    monkeypatch.setenv("API_KEY_OPENROUTER", "fake")
    client, _, _ = fake_client(monkeypatch, "openrouter")
    client.embeddings.create.side_effect = None
    client.embeddings.create.return_value = {
        "data": [{"index": 0, "embedding": [float("nan")]}],
        "usage": {"prompt_tokens": 10},
    }
    with pytest.raises(AIError) as exc:
        service(db, "openrouter").embed_texts(["public"], public_corpus=True)
    assert exc.value.code == "embedding_invalid_response"
    assert db.query(models.Log).count() == 1


def test_config_persists_via_existing_admin_api(db):
    from backend.routes.admin import create_or_update_config
    from backend.schemas import ConfigCreate

    for key, value in [
        ("embedding_provider", "openrouter"),
        ("embedding_dimensions", "512"),
        ("embedding_model", "google/gemini-embedding-2"),
        (
            "embedding_prices_per_million",
            '{"openrouter/google/gemini-embedding-2": 0.3}',
        ),
    ]:
        asyncio.run(
            create_or_update_config(
                ConfigCreate(key=key, value=value),
                current_user={"is_admin": True},
                db=db,
            )
        )
    ai = service(db, embedding_model="google/gemini-embedding-2")
    assert ai.embedding_provider == "openrouter" and ai.embedding_dimensions == 512


def test_cache_identity_separates_providers_dimensions_and_preserves_legacy():
    assert embeddings.identity("ollama", "local-model", None) == "local-model"
    assert embeddings.identity("openrouter", "same", 768) != embeddings.identity(
        "mistral", "same", 768
    )
    assert embeddings.identity("openrouter", "same", 768) != embeddings.identity(
        "openrouter", "same", 3072
    )


@pytest.mark.parametrize("provider", ["mistral", "openrouter"])
def test_real_sdk_contract_with_mock_transport(db, monkeypatch, provider):
    # Keep real SDK serialization/parsing while replacing its entire transport.
    from mistralai.client import Mistral
    from openai import OpenAI
    from httpx._client import Client as HTTPClient

    monkeypatch.setenv(f"API_KEY_{provider.upper()}", "fake-system")
    requests = []
    dimensions = 1024 if provider == "mistral" else 768

    def respond(request):
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "id": "fake-response",
                "model": "mistral-embed"
                if provider == "mistral"
                else "google/gemini-embedding-2",
                "object": "list",
                "data": [
                    {"object": "embedding", "index": 0, "embedding": [1.0] * dimensions}
                ],
                "usage": {
                    "prompt_tokens": 12,
                    "total_tokens": 12,
                    "completion_tokens": 0,
                },
            },
        )

    transport = httpx.MockTransport(respond)
    # The fixture blocks send globally; bind the original implementation only on
    # this client, whose sole transport is MockTransport (no socket transport).
    http = HTTPClient(transport=transport)
    http.send = ORIGINAL_HTTP_SEND.__get__(http, HTTPClient)
    if provider == "mistral":
        monkeypatch.setattr(
            embeddings, "Mistral", lambda **kwargs: Mistral(client=http, **kwargs)
        )
    else:
        monkeypatch.setattr(
            embeddings, "OpenAI", lambda **kwargs: OpenAI(http_client=http, **kwargs)
        )
    try:
        assert (
            len(
                service(db, provider).embed_texts(
                    ["public corpus"], public_corpus=True
                )[0]
            )
            == dimensions
        )
        assert len(requests) == 1 and requests[0].url.path.endswith("/embeddings")
        body = json.loads(requests[0].content)
        assert body["input"] == ["public corpus"]
        if provider == "openrouter":
            assert body["dimensions"] == 768
        assert db.query(models.Log).one().details["usage"]["prompt_tokens"] == 12
    finally:
        http.close()


@pytest.mark.parametrize(
    "key,value",
    [
        ("embedding_provider", "arbitrary"),
        ("embedding_dimensions", "-1"),
        ("embedding_dimensions", "0"),
        ("embedding_dimensions", "2.5"),
        ("embedding_prices_per_million", "[]"),
        ("embedding_prices_per_million", '{"mistral/mistral-embed": true}'),
        ("embedding_prices_per_million", '{"mistral/mistral-embed": NaN}'),
    ],
)
def test_admin_rejects_invalid_embedding_config(db, key, value):
    from fastapi import HTTPException
    from backend.routes.admin import create_or_update_config
    from backend.schemas import ConfigCreate

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            create_or_update_config(
                ConfigCreate(key=key, value=value),
                current_user={"is_admin": True},
                db=db,
            )
        )
    assert exc.value.status_code == 400
    assert db.query(models.Config).filter_by(key=key).first() is None


def test_paid_accounting_survives_caller_rollback(db, monkeypatch):
    monkeypatch.setenv("API_KEY_MISTRAL", "fake")
    fake_client(monkeypatch, "mistral")
    ai = service(db, "mistral")
    ai.embed_texts(["public"], public_corpus=True)
    db.rollback()
    assert db.query(models.Log).count() == 1


def test_none_direct_error_and_empty_input(db):
    ai = service(db, "none")
    assert ai.embed_texts([]) == []
    with pytest.raises(AIError) as exc:
        ai.embed_texts(["text"])
    assert exc.value.code == "embedding_disabled"


def test_model_override_uses_its_own_dimension_default(db, monkeypatch):
    monkeypatch.setenv("API_KEY_OPENROUTER", "fake")
    _, _, calls = fake_client(monkeypatch, "openrouter")
    service(db, "openrouter").embed_texts(
        ["public"], model="qwen/qwen3-embedding-8b", public_corpus=True
    )
    assert "dimensions" not in calls[0]


def test_local_memory_ranking_and_cache_stay_available(tmp_path):
    ai = Mock(
        embedding_provider="ollama",
        embedding_model="fake-local",
        embedding_cache_key="fake-local",
    )
    ai.embed_texts.return_value = [[1.0] * 8, [1.0] * 8]
    embedder = MemoryEmbedder(tmp_path / "memory.npz")
    assert embedder.rank(ai, "query", ["item"], 1) == [0]
    assert embedder.rank(ai, "query", ["item"], 1) == [0]
    ai.embed_texts.assert_called_once_with(["query", "item"])


@pytest.mark.parametrize(
    "provider,expected", [("mistral", [2, 1]), ("openrouter", [3])]
)
def test_external_batch_payload_byte_limit(db, monkeypatch, provider, expected):
    monkeypatch.setenv(f"API_KEY_{provider.upper()}", "fake")
    _, _, calls = fake_client(monkeypatch, provider)
    service(db, provider).embed_texts(["a" * 8000] * 3, public_corpus=True)
    assert [len(call.get("input", call.get("inputs"))) for call in calls] == expected
