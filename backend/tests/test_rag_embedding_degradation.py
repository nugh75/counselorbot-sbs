"""Recupero senza backend di embedding: cooldown e indice coerente."""
import logging

import pytest

from backend import rag_index as rag
from backend.ai_service import AIError

_TRANSPORT_ERROR = "Errore embeddings Ollama (modello 'fake-embed'): [Errno 61] Connection refused"


class _Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


class _Embedder:
    def __init__(self, fail=True):
        self.fail = fail
        self.embedding_model = "fake-embed"
        self.calls = 0

    def embed_texts(self, texts):
        self.calls += 1
        if self.fail:
            raise AIError(_TRANSPORT_ERROR)
        return [[1.0, float(i)] for i, _ in enumerate(texts)]

    def embed_query(self, text):
        return self.embed_texts([text])[0]


class _Corpus:
    def __init__(self, n=2):
        self.n = n
        self.calls = 0

    def chunks(self):
        return [{"source": f"doc{i}.md", "title": f"Doc {i}", "text": f"Testo {i}"} for i in range(self.n)]

    def collect(self):
        self.calls += 1
        return self.chunks(), self.signature()

    def signature(self):
        return {f"doc{i}.md": "v1" for i in range(self.n)}


@pytest.fixture
def clock(monkeypatch, tmp_path):
    monkeypatch.setattr(rag, "INDEX_DIR", str(tmp_path))
    monkeypatch.setattr(rag, "_embedding_cooldown", rag._EmbeddingCooldown(rag.EMBEDDING_FAILURE_COOLDOWN_SECONDS))
    fake = _Clock()
    monkeypatch.setattr(rag.time, "monotonic", fake)
    return fake


def _index(tmp_path, corpus, name="plain"):
    return rag.SiteRagIndex(
        docs_dir=str(tmp_path), index_path=str(tmp_path / f"{name}.json"),
        emb_path=str(tmp_path / f"{name}.npy"), cache_path=str(tmp_path / f"{name}.npz"),
        lock_path=str(tmp_path / f".{name}.lock"), collector=corpus.collect,
        graph_loader=rag._empty_graph, signature_fn=corpus.signature, mode="plain",
    )


def test_failed_embeddings_collect_the_corpus_once_per_cooldown(clock, tmp_path, caplog):
    corpus, ai = _Corpus(), _Embedder(fail=True)
    index = _index(tmp_path, corpus)

    with caplog.at_level(logging.WARNING, logger=rag.logger.name):
        for _ in range(3):
            with pytest.raises(rag.EmbeddingUnavailable):
                index.search(ai, "domanda")
    assert corpus.calls == 1
    assert ai.calls == 1
    assert len([r for r in caplog.records if "sospesa" in r.getMessage()]) == 1

    clock.now += rag.EMBEDDING_FAILURE_COOLDOWN_SECONDS - 1
    with pytest.raises(rag.EmbeddingUnavailable):
        index.search(ai, "domanda")
    assert corpus.calls == 1

    clock.now += 2
    with pytest.raises(rag.EmbeddingUnavailable):
        index.search(ai, "domanda")
    assert corpus.calls == 2


def test_cooldown_covers_every_collection_of_the_same_model(clock, tmp_path):
    first, second, ai = _Corpus(), _Corpus(), _Embedder(fail=True)
    with pytest.raises(rag.EmbeddingUnavailable):
        _index(tmp_path, first, "a").search(ai, "domanda")
    with pytest.raises(rag.EmbeddingUnavailable):
        _index(tmp_path, second, "b").search(ai, "domanda")
    assert (first.calls, second.calls, ai.calls) == (1, 0, 1)


def test_failed_rebuild_keeps_the_previous_index_aligned_and_recovers(clock, tmp_path):
    corpus, ai = _Corpus(n=2), _Embedder(fail=False)
    index = _index(tmp_path, corpus)
    assert len(index.search(ai, "domanda")) == 2

    corpus.n, ai.fail = 3, True
    with pytest.raises(rag.EmbeddingUnavailable):
        index.search(ai, "domanda")
    assert len(index.chunks) == len(index.matrix) == 2
    assert index.needs_rebuild(ai)

    clock.now += rag.EMBEDDING_FAILURE_COOLDOWN_SECONDS + 1
    ai.fail = False
    assert len(index.search(ai, "domanda")) == 3
    assert len(index.chunks) == len(index.matrix) == 3

