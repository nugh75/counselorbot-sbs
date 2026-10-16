"""BM25 remains available through embedding failure and recovery; SSE stays safe."""
import asyncio
import json
import logging
from unittest.mock import MagicMock

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
            assert index.search(ai, "Testo")
    assert corpus.calls == 1
    assert ai.calls == 1
    assert len([r for r in caplog.records if "sospesa" in r.getMessage()]) == 1

    clock.now += rag.EMBEDDING_FAILURE_COOLDOWN_SECONDS - 1
    assert index.search(ai, "Testo")
    assert corpus.calls == 1

    clock.now += 2
    assert index.search(ai, "Testo")
    assert corpus.calls == 1  # retry embeddings without recollecting unchanged corpus


def test_cooldown_covers_every_collection_of_the_same_model(clock, tmp_path):
    first, second, ai = _Corpus(), _Corpus(), _Embedder(fail=True)
    assert _index(tmp_path, first, "a").search(ai, "Testo")
    assert _index(tmp_path, second, "b").search(ai, "Testo")
    assert (first.calls, second.calls, ai.calls) == (1, 1, 1)


def test_failed_rebuild_publishes_new_lexical_chunks_and_recovers(clock, tmp_path):
    corpus, ai = _Corpus(n=2), _Embedder(fail=False)
    index = _index(tmp_path, corpus)
    assert len(index.search(ai, "domanda")) == 2

    corpus.n, ai.fail = 3, True
    assert index.search(ai, "Testo")
    assert len(index.chunks) == 3
    assert index.matrix is None  # New lexical chunks must never use stale vectors.
    assert index.needs_rebuild(ai)

    clock.now += rag.EMBEDDING_FAILURE_COOLDOWN_SECONDS + 1
    ai.fail = False
    assert len(index.search(ai, "domanda")) == 3
    assert len(index.chunks) == len(index.matrix) == 3


@pytest.mark.parametrize("language", ["it", "en", "es", "fr", "de", "sv"])
@pytest.mark.parametrize("lexical_fallback", [True, False])
def test_site_chat_sse_uses_bm25_or_localized_error(monkeypatch, clock, tmp_path, language, lexical_fallback):
    from backend.routes import site_chat
    from backend.api_models import SiteChatRequest

    ai = _Embedder(fail=True)
    ai.config = {}
    ai.stream_response = MagicMock(side_effect=lambda *a, **kw: iter(["Risposta dai materiali."]))
    if lexical_fallback:
        index = _index(tmp_path, _Corpus())
    else:
        # Keep coverage of the localized route error for failures beyond BM25.
        index = MagicMock()
        index.search.side_effect = rag.EmbeddingUnavailable(_TRANSPORT_ERROR)
    monkeypatch.setattr(site_chat.database, "SessionLocal", MagicMock())
    monkeypatch.setattr(site_chat, "AIService", lambda db, username=None: ai)
    monkeypatch.setattr(site_chat, "get_index", lambda collection: index)
    monkeypatch.setattr(site_chat, "_resolve_site_prompt", lambda *a: "Prompt")
    monkeypatch.setattr(site_chat, "_apply_language_directive", lambda text, *a, **kw: text)
    monkeypatch.setattr(site_chat, "_resolve_counselor", lambda *a: (None, None))
    monkeypatch.setattr(site_chat, "_portfolio_context", lambda *a: "")
    monkeypatch.setattr(site_chat, "_top_k", lambda ai: 3)
    monkeypatch.setattr(site_chat, "_retrieval_params", lambda ai: ({}, {}, 2, 0))
    monkeypatch.setattr(site_chat, "log_error", MagicMock())
    memory = MagicMock()
    memory.get_relevant_context.return_value = ""
    monkeypatch.setattr(site_chat, "session_memory", memory)

    async def run():
        response = await site_chat.site_chat_stream(
            SiteChatRequest(message="Testo", collection="competenzestrategiche", language=language),
            current_user={}, db=MagicMock(),
        )
        return [chunk async for chunk in response.body_iterator]

    for _ in range(2):  # primo errore e turno successivo in cooldown
        chunks = asyncio.run(run())
        raw = "".join(chunks)
        for detail in ("Ollama", "Errno", "Connection refused", "fake-embed", "Embedding"):
            assert detail not in raw
        last = json.loads(chunks[-1].removeprefix("data: ").strip())
        if lexical_fallback:
            assert last["done"] and last["sources"]
            assert last["response"] == "Risposta dai materiali."
            assert "error" not in last
        else:
            assert last == {"error": site_chat._RETRIEVAL_UNAVAILABLE_MESSAGE_BY_LANG[language]}
    if lexical_fallback:
        assert ai.calls == 1
        assert ai.stream_response.call_count == 2
        assert "Testo" in ai.stream_response.call_args.args[0]
    else:
        ai.stream_response.assert_not_called()
