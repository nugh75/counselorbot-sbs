#!/usr/bin/env python3
"""Measure the real framework collector/build/search offline in temporary storage.

Run from the repository root: python scripts/benchmark-rag-bm25.py --repetitions 20
Requires backend dependencies. Does not read .env, connect to a DB or call an API.
"""
import argparse
import json
import platform
from pathlib import Path
import statistics
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend import rag_index as rag  # noqa: E402


class OfflineEmbedder:
    embedding_model = "benchmark-offline"

    def embed_texts(self, texts, **kwargs):
        raise AssertionError("Lexical benchmark must never request embeddings")

    def embed_query(self, query):
        raise AssertionError("Lexical benchmark must never request embeddings")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repetitions", type=int, default=20)
    args = parser.parse_args()
    if args.repetitions < 1:
        parser.error("--repetitions must be positive")
    queries = ["Pellerey", "C1 strategie elaborative", "capacità di autoregolazione",
               "self regulated learning", "självreglerat lärande"]
    with tempfile.TemporaryDirectory(prefix="rag-bm25-benchmark-") as directory:
        root = Path(directory)
        rag.SCOPE_CONFIG_PATH = str(root / "scope.json")  # Repository defaults only.
        def index():
            return rag.SiteRagIndex(
                docs_dir=rag.DOCS_DIR, index_path=str(root / "framework.json"),
                emb_path=str(root / "framework.npy"), cache_path=str(root / "cache.npz"),
                lock_path=str(root / ".build.lock"), collector=rag._collect_framework,
                graph_loader=rag._load_graph,
                signature_fn=lambda: rag._scoped_corpus_signature(rag.COLLECTION_FRAMEWORK),
            )
        ai, current = OfflineEmbedder(), index()
        started = time.perf_counter()
        current.build(ai, require_vectors=False)
        build = time.perf_counter() - started
        started = time.perf_counter()
        restored = index()
        restored.ensure(ai, retrieval_mode="lexical")
        reload_time = time.perf_counter() - started
        samples, matches = [], {}
        for _ in range(args.repetitions):
            for query in queries:
                started = time.perf_counter()
                results = current.search(ai, query, retrieval_mode="lexical")
                samples.append(1000 * (time.perf_counter() - started))
                matches[query] = [r["source"] for r in results[:3]]
        ordered = sorted(samples)
        print(json.dumps({
            "python": platform.python_version(), "machine": platform.machine(),
            "collection": "framework", "chunks": len(current.chunks),
            "sources": len({c["source"] for c in current.chunks}),
            "characters": sum(len(c["text"]) for c in current.chunks),
            "build_collect_tokenize_persist_seconds": round(build, 4),
            "reload_seconds": round(reload_time, 4),
            "index_json_bytes": (root / "framework.json").stat().st_size,
            "queries": len(samples), "query_median_ms": round(statistics.median(samples), 3),
            "query_p95_ms": round(ordered[min(len(ordered)-1, int(len(ordered)*0.95))], 3),
            "top_sources": matches,
        }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
