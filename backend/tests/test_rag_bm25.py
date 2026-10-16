"""Offline lexical/hybrid regressions shared by builtin and dynamic collections."""
import json
from collections import Counter
from unittest.mock import Mock

import numpy as np
import pytest

from backend import rag_index as rag
from backend.tests.test_rag_embedding_degradation import _Corpus, _Embedder, _index


@pytest.fixture(autouse=True)
def isolated_cooldown(monkeypatch, tmp_path):
    monkeypatch.setattr(rag, "INDEX_DIR", str(tmp_path))
    monkeypatch.setattr(rag, "_embedding_cooldown", rag._EmbeddingCooldown(300))


def _corpus(chunks):
    corpus = _Corpus()
    corpus.chunks = lambda: chunks
    return corpus


def _chunk(source, text, title="Materiale"):
    return {"source": source, "title": title, "text": text}


@pytest.mark.parametrize("query, expected", [
    ("Che cosa dice Pellerey?", "Pellerey_2018.md"),
    ("C1", "fattori.md"),
    ("capacita di autoregolazione", "italiano.md"),
    ("self regulated learning", "english.md"),
    ("Hur fungerar sjalvreglerat larande?", "svenska.md"),
    ("regulacion aprendizaje", "espanol.md"),
    ("apprentissage autoregule", "francais.md"),
    ("selbstreguliertes lernen", "deutsch.md"),
])
def test_known_queries_without_embeddings(tmp_path, query, expected):
    chunks = [
        _chunk("Pellerey_2018.md", "Una prospettiva educativa."),
        _chunk("fattori.md", "C1: strategie elaborative. C2: concentrazione."),
        _chunk("italiano.md", "Capacità di autoregolazione e motivazione."),
        _chunk("english.md", "Self-regulated learning supports reflection."),
        _chunk("svenska.md", "Självreglerat lärande och motivation."),
        _chunk("espanol.md", "Regulación del aprendizaje."),
        _chunk("francais.md", "Apprentissage autorégulé."),
        _chunk("deutsch.md", "Selbstreguliertes Lernen."),
    ]
    ai = _Embedder(fail=True)
    index = _index(tmp_path, _corpus(chunks))
    results = index.search(ai, query, min_score=0.2)
    assert results[0]["source"] == expected
    assert ai.calls == 1


def test_tokens_preserve_codes_and_fold_accents():
    assert rag._lexical_tokens("C1 A1 M2 QSA_C2 för più übers élève SJÄLVREGlerat") == [
        "c1", "a1", "m2", "qsa", "c2", "ubers", "eleve", "sjalvreglerat"]
    for query in ("e il per", "the and with", "el y para", "le et pour", "die und mit", "och det att"):
        assert rag._lexical_tokens(query) == []


def test_bm25_formula_and_term_frequency_saturation():
    chunks = [_chunk("", "alpha alpha beta", ""), _chunk("", "beta gamma", "")]
    lexical = rag._BM25Index(chunks)
    expected = np.log1p(1.5 / 1.5) * 2 * 2.2 / (2 + 1.2 * (0.25 + 0.75 * 3 / 2.5))
    assert lexical.scores("alpha")[0] == pytest.approx(expected)
    assert lexical.scores("alpha alpha")[0] == pytest.approx(expected)
    assert lexical.scores("missing").sum() == 0


def test_lexical_mode_does_not_embed_and_roundtrips(tmp_path):
    ai, corpus = _Embedder(), _Corpus()
    index = _index(tmp_path, corpus)
    first = index.search(ai, "Testo", retrieval_mode="lexical")
    assert first and ai.calls == 0
    payload = json.loads((tmp_path / "plain.json").read_text())
    assert payload["lexical"]["version"] == rag._LEXICAL_VERSION
    assert not payload["vectors_available"]
    assert not (tmp_path / "plain.npy").exists()  # No legacy vector file required.
    restored = _index(tmp_path, corpus)
    assert restored.search(ai, "Testo", retrieval_mode="lexical") == first
    assert corpus.calls == 1 and ai.calls == 0
    assert restored.stats()["lexical_available"]
    assert not restored.stats()["vectors_available"]


def test_legacy_vector_index_upgrades_without_recollecting(tmp_path):
    ai, corpus = _Embedder(fail=False), _Corpus()
    index = _index(tmp_path, corpus)
    index.build(ai)
    payload = json.loads((tmp_path / "plain.json").read_text())
    payload.pop("lexical")
    payload.pop("vectors_available")
    (tmp_path / "plain.json").write_text(json.dumps(payload))
    restored = _index(tmp_path, corpus)
    assert restored.search(ai, "Testo", retrieval_mode="lexical")
    assert corpus.calls == 1 and ai.calls == 1


@pytest.mark.parametrize("mode", ["hybrid", "vector"])
def test_query_embedding_failure_uses_bm25_and_cooldown(tmp_path, mode):
    ai, corpus = _Embedder(fail=False), _Corpus()
    index = _index(tmp_path, corpus)
    index.build(ai)
    ai.fail = True
    for _ in range(3):
        assert index.search(ai, "Testo", retrieval_mode=mode)
    assert ai.calls == 2 and corpus.calls == 1


def test_rrf_orders_by_ranks_not_score_scales(tmp_path):
    chunks = [_chunk("a.md", "rare " * 30), _chunk("b.md", "rare"), _chunk("c.md", "other")]
    ai = _Embedder(fail=False)
    ai.embed_texts = Mock(return_value=[[0, 1], [1, 0], [0.8, 0.6]])
    ai.embed_query = Mock(return_value=[1, 0])
    index = _index(tmp_path, _corpus(chunks))
    index.build(ai)
    hybrid = index.search(ai, "rare", retrieval_mode="hybrid")
    assert hybrid[0]["source"] == "b.md"  # vector #1 + lexical #2 beats lexical #1 + vector #3
    expected = rag._rank_fusion([1, 2, 0], [0, 1])
    assert hybrid[0]["score"] == round(expected[1], 4)
    assert index.search(ai, "rare", retrieval_mode="vector")[0]["source"] == "b.md"
    assert index.search(ai, "rare", retrieval_mode="lexical")[0]["source"] == "a.md"


def test_category_audience_weights_and_graph_expansion(tmp_path):
    chunks = [_chunk(f"questionari/{i}.md", "alpha") for i in range(5)]
    chunks.append(_chunk("fonti/neighbor.md", "alpha"))
    index = _index(tmp_path, _corpus(chunks))
    index._graph_loader = lambda: ({"a": {"b"}}, {chunks[0]["source"]: "a"}, {"b": chunks[-1]["source"]})
    results = index.search(_Embedder(), "alpha", top_k=1, retrieval_mode="lexical",
                           weights={"strumenti": 1, "altro": 0.1},
                           audience_weights={"studente": {"strumenti": 2}})
    assert results[0]["weighted"] == pytest.approx(results[0]["score"] * 2, abs=0.0002)
    assert "fonti/neighbor.md" in {r["source"] for r in results}


def test_raw_guarantee_respects_source_cap(tmp_path):
    chunks = [_chunk("same.md", "alpha") for _ in range(5)] + [_chunk("different.md", "alpha")]
    index = _index(tmp_path, _corpus(chunks))
    results = index.search(_Embedder(), "alpha", top_k=1, max_per_source=1, retrieval_mode="lexical")
    assert max(Counter(r["source"] for r in results).values()) == 1


def test_dynamic_collection_uses_lexical_fallback(tmp_path, monkeypatch):
    # Use the real dynamic factory and scoped plain collector with isolated roots.
    monkeypatch.setattr(rag, "_dynamic_dir", lambda slug: str(tmp_path / slug))
    monkeypatch.setattr(rag, "SCOPE_CONFIG_PATH", str(tmp_path / "scope.json"))
    docs = tmp_path / "custom"
    docs.mkdir()
    (docs / "notes.md").write_text("# Studio\nSjälvreglerat lärande.")
    index = rag._make_dynamic_index("custom")
    assert index.search(_Embedder(), "sjalvreglerat")[0]["source"] == "notes.md"


def test_empty_unknown_queries_and_invalid_mode(tmp_path):
    index = _index(tmp_path, _Corpus())
    ai = _Embedder()
    assert index.search(ai, "   ") == []
    assert ai.calls == 0
    assert index.search(ai, "nonexistent", retrieval_mode="lexical") == []
    assert index.search(ai, "the and", retrieval_mode="lexical") == []
    with pytest.raises(ValueError, match="retrieval_mode"):
        index.search(ai, "Testo", retrieval_mode="invalid")
