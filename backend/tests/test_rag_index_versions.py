"""Generation, concurrency and planning contracts. All embedding clients are fake."""

import json
import os
import threading
from unittest.mock import Mock

import httpx
import numpy as np
import pytest

from backend import embedding_service, rag_index as rag
from backend.ai_service import AIError
from backend.tests.test_rag_embedding_degradation import _Corpus


class Embedder:
    def __init__(self, dimensions=1024, model="old", provider="ollama"):
        self.embedding_provider = provider
        self.embedding_model = model
        self.embedding_dimensions = dimensions
        self.config = {}
        self.calls = 0
        self.entered = threading.Event()
        self.release = threading.Event()
        self.block = False
        self.fail = False

    @property
    def embedding_cache_key(self):
        return embedding_service.identity(
            self.embedding_provider, self.embedding_model, self.embedding_dimensions
        )

    def embed_texts(self, texts, **kwargs):
        self.calls += 1
        self.entered.set()
        if self.block:
            assert self.release.wait(5), "test must release the fake builder"
        if self.fail:
            raise AIError("fake embedding failure")
        return [[1.0] * self.embedding_dimensions for _ in texts]

    def embed_query(self, text):
        return [1.0] * self.embedding_dimensions


def index_at(tmp_path, corpus=None):
    corpus = corpus or _Corpus()
    return rag.SiteRagIndex(
        docs_dir=str(tmp_path),
        index_path=str(tmp_path / "index.json"),
        emb_path=str(tmp_path / "legacy.npy"),
        cache_path=str(tmp_path / "legacy.npz"),
        lock_path=str(tmp_path / ".lock"),
        collector=corpus.collect,
        graph_loader=rag._empty_graph,
        signature_fn=corpus.signature,
        public_corpus=True,
    )


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    monkeypatch.setattr(rag, "_embedding_cooldown", rag._EmbeddingCooldown(300))
    monkeypatch.setattr(
        httpx.Client, "send", Mock(side_effect=AssertionError("no network"))
    )


def test_model_change_1024_to_1536_serves_bm25_until_atomic_swap(tmp_path):
    index = index_at(tmp_path)
    old, new = Embedder(), Embedder(1536, "new")
    index.build(old)
    previous = index.generation
    new.block = True
    try:
        assert index.search(new, "Testo")
        assert new.entered.wait(2)
        assert index.stats()["building"]
        assert index.matrix.shape == (2, 1024)
        assert (
            json.loads((tmp_path / "index.json").read_text())["generation"] == previous
        )
        new.embed_query = Mock(side_effect=AssertionError("BM25 during build"))
        assert index.search(new, "Testo")
        assert not index.start_build(new)
    finally:
        new.release.set()
        assert index.wait_for_build(5)
    new.embed_query = lambda text: [1.0] * 1536
    assert index.search(new, "Testo")
    assert index.matrix.shape == (2, 1536)
    assert index.generation != previous and "-d1536-" in index.generation
    assert index_at(tmp_path)._load_from_disk()
    restored = index_at(tmp_path)
    assert restored._load_from_disk() and restored.matrix.shape == (2, 1536)


@pytest.mark.parametrize("change_corpus", [False, True])
def test_failed_build_preserves_previous_memory_and_disk(tmp_path, change_corpus):
    corpus = _Corpus()
    index = index_at(tmp_path, corpus)
    old, new = Embedder(), Embedder(1536, "new")
    index.build(old)
    matrix, chunks, generation = index.matrix, index.chunks, index.generation
    manifest = (tmp_path / "index.json").read_bytes()
    if change_corpus:
        corpus.n = 3
    new.fail = True
    assert index.start_build(new)
    assert index.wait_for_build(5)
    assert index.matrix is matrix and index.chunks is chunks
    assert index.generation == generation
    assert (tmp_path / "index.json").read_bytes() == manifest
    assert index.search(new, "Testo")
    assert index.last_build_error == "rag_build_failed"
    restored = index_at(tmp_path, corpus)
    assert restored._load_from_disk() and restored.matrix.shape == (2, 1024)


def test_publish_failure_leaves_previous_generation_readable(tmp_path, monkeypatch):
    index = index_at(tmp_path)
    index.build(Embedder())
    generation = index.generation
    monkeypatch.setattr(
        rag.os, "replace", Mock(side_effect=OSError("simulated disk failure"))
    )
    with pytest.raises(OSError):
        index.build(Embedder(1536, "new"))
    assert index.generation == generation
    restored = index_at(tmp_path)
    assert restored._load_from_disk() and restored.matrix.shape == (2, 1024)


def test_wrong_query_dimension_falls_back_and_invalidates_vectors(tmp_path):
    index, ai = index_at(tmp_path), Embedder()
    index.build(ai)
    ai.embed_query = lambda text: [1.0] * 1536
    assert index.search(ai, "Testo")
    assert index._invalid_vectors
    assert index.needs_rebuild(ai)
    assert index.search(ai, "Testo")  # cooldown, no shape error


def test_legacy_portable_index_loads_without_reembedding(tmp_path):
    corpus, ai = _Corpus(), Embedder(1024, "legacy")
    ai.embedding_dimensions = None
    ai.embed_query = lambda text: [1.0] * 1024
    np.save(tmp_path / "legacy.npy", np.ones((2, 1024), dtype=np.float32))
    (tmp_path / "index.json").write_text(
        json.dumps(
            {
                "embedding_model": "legacy",
                "chunks": corpus.chunks(),
                "signature": corpus.signature(),
            }
        )
    )
    index = index_at(tmp_path, corpus)
    assert index.search(ai, "Testo")
    assert ai.calls == corpus.calls == 0
    assert index.embedding_dimensions == 1024


def test_corrupt_legacy_matrix_uses_bm25_then_rebuilds(tmp_path):
    corpus = _Corpus()
    np.save(tmp_path / "legacy.npy", np.ones((1, 7)))
    (tmp_path / "index.json").write_text(
        json.dumps({"chunks": corpus.chunks(), "embedding_model": "old"})
    )
    index = index_at(tmp_path, corpus)
    assert index.search(Embedder(), "Testo", retrieval_mode="lexical")
    assert index.matrix is None


def test_estimate_counts_unique_misses_and_reuses_model_cache(tmp_path):
    corpus, ai = _Corpus(), Embedder(1024, "mistral-embed", "mistral")
    corpus.chunks = lambda: [
        {"source": str(i), "title": "Doc", "text": text}
        for i, text in enumerate(["abc" * 100, "abc" * 100, "città"])
    ]
    index = index_at(tmp_path, corpus)
    plan = index.estimate_reindex(ai)
    assert plan["n_chunks"] == 3 and plan["unique_chunks"] == 2
    assert plan["input_count"] == 2 and plan["estimated_tokens"] == 102
    assert plan["estimated_cost_usd"] == pytest.approx(102 * 0.1 / 1_000_000)
    assert plan["upper_bound_tokens"] == 306
    assert ai.calls == 0 and not (tmp_path / "index.json").exists()
    index.build(ai)
    assert index.estimate_reindex(ai)["input_count"] == 0
    assert index.estimate_reindex(ai)["estimated_cost_usd"] == 0
    ai.embedding_dimensions = 1536
    assert index.estimate_reindex(ai)["input_count"] == 2
    assert ai.calls == 1


def test_cost_overrides_unknown_price_and_disabled_privacy(tmp_path):
    texts = ["abc" * 1000]
    config = {"embedding_provider": "openrouter", "embedding_model": "custom"}
    assert embedding_service.estimate_cost(config, texts)["estimated_cost_usd"] is None
    config["embedding_prices_per_million"] = '{"openrouter/custom": 2}'
    assert embedding_service.estimate_cost(config, texts)["estimated_cost_usd"] == 0.002
    index = index_at(tmp_path)
    ai = Embedder(1024, "mistral-embed", "mistral")
    index.public_corpus = False
    plan = index.estimate_reindex(ai)
    assert not plan["vectors_allowed"] and plan["input_count"] == 0
    assert plan["estimated_cost_usd"] == 0


def test_cleanup_protects_active_and_legacy_files(tmp_path):
    index = index_at(tmp_path)
    index.build(Embedder())
    previous = index.generation
    index.build(Embedder(1536, "new"))
    legacy = tmp_path / "legacy.npy"
    legacy.write_bytes(b"untouched portable file")
    directory = tmp_path / "index.json.versions" / previous
    os.utime(directory, (0, 0))
    assert index.cleanup_orphaned_indexes() == 1
    assert not directory.exists()
    assert legacy.read_bytes() == b"untouched portable file"
    assert (tmp_path / "index.json.versions" / index.generation).exists()
    assert index.cleanup_orphaned_indexes() == 0


def test_readers_hold_consistent_snapshot_during_publish(tmp_path):
    corpus, ai = _Corpus(), Embedder()
    index = index_at(tmp_path, corpus)
    index.build(ai)
    entered, release = threading.Event(), threading.Event()

    def query(text):
        entered.set()
        assert release.wait(5)
        return [1.0] * 1024

    ai.embed_query = query
    results = []
    reader = threading.Thread(target=lambda: results.extend(index.search(ai, "Testo")))
    reader.start()
    try:
        assert entered.wait(2)
        corpus.n = 3
        index.build(Embedder(1536, "new"))
        assert index.matrix.shape == (3, 1536)
    finally:
        release.set()
        reader.join(5)
    assert len(results) == 2


def test_cross_worker_lock_avoids_duplicate_embedding_calls(tmp_path):
    first, second = index_at(tmp_path), index_at(tmp_path)
    first.build(Embedder())
    ai = Embedder(1536, "new")
    ai.block = True
    try:
        assert first.start_build(ai)
        assert ai.entered.wait(2)
        assert second.search(ai, "Testo")
        assert second.stats()["building"]
        # The shared build reservation refuses a second build while one embeds.
        assert second.start_build(ai) is False
    finally:
        ai.release.set()
        assert first.wait_for_build(5)
    # The next search adopts the committed generation without embedding again.
    assert second.search(ai, "Testo")
    assert second.wait_for_build(5)
    assert ai.calls == 1
    assert first.generation == second.generation


def test_background_build_owns_session_and_config_snapshot(tmp_path, monkeypatch):
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import Session
    from backend.ai_service import AIService

    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}")
    original = Session(engine)
    ai = AIService.__new__(AIService)
    ai.db = original
    ai.config = {"test_snapshot": "original"}
    ai.embedding_provider, ai.embedding_model, ai.embedding_dimensions = (
        "ollama",
        "test",
        3,
    )
    entered, release = threading.Event(), threading.Event()
    sessions = []

    def embed(self, texts, **kwargs):
        sessions.append(self.db)
        entered.set()
        assert release.wait(5)
        assert self.config["test_snapshot"] == "original"
        assert self.db is not original
        assert self.db.execute(text("select 1")).scalar() == 1
        return [[1.0] * 3 for _ in texts]

    monkeypatch.setattr(AIService, "embed_texts", embed)
    index = index_at(tmp_path)
    try:
        assert index.start_build(ai)
        assert entered.wait(2)
        original.close()
        ai.config["test_snapshot"] = "caller changed"
        assert index.search(Embedder(3, "test"), "Testo", retrieval_mode="lexical")
    finally:
        release.set()
        assert index.wait_for_build(5)
        engine.dispose()
    assert len(sessions) == 1 and index.last_build_error is None
    assert index.matrix.shape == (2, 3)


def test_switch_back_reuses_own_generation_cache(tmp_path):
    index, old = index_at(tmp_path), Embedder()
    index.build(old)
    index.build(Embedder(1536, "new"))
    index.build(old)
    assert old.calls == 1
    assert index.matrix.shape == (2, 1024)


def test_reindex_route_returns_background_status_and_offline_estimate(
    tmp_path, monkeypatch
):
    import asyncio
    from backend.routes import site_chat

    ai, index = Embedder(), index_at(tmp_path)
    ai.block = True
    monkeypatch.setattr(site_chat, "AIService", lambda db: ai)
    monkeypatch.setattr(site_chat, "get_index", lambda collection: index)
    try:
        response = asyncio.run(
            site_chat.site_chat_reindex(
                collection="competenzestrategiche", current_user={}, db=Mock()
            )
        )
        assert ai.entered.wait(2)
        assert response["status"] == "building"
        assert response["estimate"]["input_count"] == 2
        assert index.search(ai, "Testo")
    finally:
        ai.release.set()
        assert index.wait_for_build(5)


def test_model_alias_dimension_change_rebuilds_without_stale_cache(
    tmp_path, monkeypatch
):
    index, ai = index_at(tmp_path), Embedder()
    ai.embedding_dimensions = None
    ai.embed_texts = Mock(return_value=[[1.0] * 1024] * 2)
    ai.embed_query = lambda text: [1.0] * 1536
    index.build(ai)
    assert index.search(ai, "Testo")
    assert index._invalid_vectors
    monkeypatch.setattr(rag, "_embedding_cooldown", rag._EmbeddingCooldown(300))
    ai.embed_texts.return_value = [[1.0] * 1536] * 2
    index.build(ai)
    assert ai.embed_texts.call_count == 2
    assert index.matrix.shape == (2, 1536)
    assert index.search(ai, "Testo")


def test_other_worker_reports_building_and_serves_bm25(tmp_path):
    first, second, ai = index_at(tmp_path), index_at(tmp_path), Embedder()
    first.build(ai)
    assert second._load_from_disk()
    ai.block = True
    new = Embedder(1536, "new")
    new.block = True
    try:
        assert first.start_build(new)
        assert new.entered.wait(2)
        assert second.stats()["building"]
        ai.embed_query = Mock(
            side_effect=AssertionError("BM25 while another worker builds")
        )
        assert second.search(ai, "Testo")
    finally:
        new.release.set()
        assert first.wait_for_build(5)


def test_upload_reindex_uses_background_entrypoint(monkeypatch):
    from backend.routes import rag_docs

    index = Mock()
    index.stats.return_value = {"building": True}
    ai = object()
    monkeypatch.setattr(rag_docs, "get_index", lambda collection: index)
    monkeypatch.setattr(rag_docs, "AIService", lambda db: ai)
    assert rag_docs._reindex(Mock(), "framework") == {"building": True}
    index.start_build.assert_called_once_with(ai)
    index.build.assert_not_called()


def test_deleted_collection_removes_versions_and_cannot_be_republished(
    tmp_path, monkeypatch
):
    monkeypatch.setattr(rag, "DYNAMIC_ROOT", str(tmp_path / "collections"))
    monkeypatch.setattr(rag, "INDEX_DIR", str(tmp_path / "indexes"))
    monkeypatch.setattr(rag, "SCOPE_CONFIG_PATH", str(tmp_path / "scope.json"))
    monkeypatch.setattr(rag, "_dynamic_indexes", {})
    rag.create_dynamic_collection("extra", "Extra")
    (tmp_path / "collections" / "extra" / "notes.md").write_text(
        "# Notes\nTesto da cercare."
    )
    index = rag.get_dynamic_index("extra")
    index.build(Embedder())
    assert os.path.isdir(index.versions_dir)
    rag.delete_dynamic_collection("extra")
    assert not os.path.exists(index.versions_dir)
    assert not os.path.exists(index.index_path)
    with pytest.raises(ValueError, match="collection removed"):
        index.build(Embedder(1536, "new"))
    assert not os.path.exists(index.index_path)


def test_empty_collection_with_dimensions_becomes_current_without_embedding(tmp_path):
    corpus = _Corpus(n=0)
    index, ai = index_at(tmp_path, corpus), Embedder()
    index.build(ai)
    generation = index.generation
    for _ in range(3):
        assert index.search(ai, "Testo") == []
        assert not index.needs_rebuild(ai)
    assert ai.calls == 0 and index.generation == generation
    assert not index.stats()["building"]


def test_zero_width_legacy_cache_is_ignored_and_rebuilt(tmp_path):
    corpus, ai = _Corpus(), Embedder()
    ai.embedding_dimensions = None
    ai.embed_texts = Mock(return_value=[[1.0] * 1024] * 2)
    keys = [
        rag._EmbeddingCache.key(ai.embedding_cache_key, c["text"])
        for c in corpus.chunks()
    ]
    rag._EmbeddingCache(str(tmp_path / "legacy.npz")).save(
        keys, np.zeros((2, 0)), ai.embedding_cache_key
    )
    index = index_at(tmp_path, corpus)
    index.build(ai)
    assert ai.embed_texts.call_count == 1
    assert index.matrix.shape == (2, 1024)
