# Always-on lexical document retrieval

Block 2 of [the Ollama replacement plan](audit-ollama-dependencies.md).

Every `SiteRagIndex` collection, including dynamic uploads and the site
assistant, builds BM25 from the existing scoped Markdown chunks. Source paths,
titles and passage text are indexed together, so author names in filenames and
factor codes such as `C1` remain searchable even without an embedding service.
Tokenization uses Unicode case folding, accent normalization and compact
stopword lists for IT/EN/ES/FR/DE/SV. No stemming is applied, preserving names and
factor codes. Lexical retrieval does not translate queries between languages.
No database, tokenizer download, new dependency or network call is needed.

## Retrieval contract

`SiteRagIndex.search(..., retrieval_mode=...)` accepts:

- `hybrid` (default): cosine and BM25 rankings fused by reciprocal rank fusion,
  `sum(1 / (60 + rank))`, with ranks starting at one.
- `lexical`: BM25 only, including collection/build; never calls the embedder.
- `vector`: cosine when available, BM25 fallback when vectors cannot be used.

This is a Python retrieval option. Admin configuration and configurable
embedding providers are documented in [embedding providers](embedding-providers.md);
a dedicated Admin retrieval panel belongs to block 6.
Category and audience weights apply after fusion, then source caps and the
existing raw-result guarantee and graph expansion. The guarantee also respects
the source cap. The return shape and positional arguments are unchanged.
`score` is the raw score for the active ranking (RRF, BM25 or cosine);
`weighted` includes category/audience weights. Scores across modes are not
comparable. `min_score` remains a cosine threshold before fusion and never
filters lexical evidence. As before, if all cosine scores are below the
threshold, the best vector candidates remain available for grounding.
A lexical query with no matching terms returns no passages.

## Persistence and unavailable embeddings

The collection JSON contains versioned lexical postings and document lengths.
Cold starts publish BM25 before scheduling embeddings. Since block 5, vectors
and chunk caches live in immutable provider/model/dimension generations;
the existing JSON path is the atomic publication point. Legacy JSON/`.npy`
indexes remain readable, and missing vectors do not prevent lexical loading.
See [versioned indexes](rag-index-versions.md) for storage and API details.

During a background rebuild or model switch, retrieval uses BM25 over the active
corpus. A failed build preserves that entire previous index. The five-minute
negative cache suppresses repeated embedding attempts; after cooldown the worker
reuses compatible chunk caches. New corpus/scope data is published with a
successful candidate; lexical-only mode can refresh it without embeddings.
`stats()` includes `lexical_available`, `vectors_available` and `building`.
No `.env` change, migration, sudo command or deploy is required by this PR.
The runtime backend image must be rebuilt when this change is later deployed.

## Offline verification and benchmark

Run with backend dependencies installed, temporary writable data directories and
no real provider clients. The focused suite is:

```sh
DATABASE_URL=sqlite:///:memory: SESSION_MEMORY_DIR=/tmp/bm25-test-memory \
  python -m pytest backend/tests/test_rag_bm25.py \
  backend/tests/test_rag_embedding_degradation.py backend/tests/test_rag_markdown.py
python scripts/benchmark-rag-bm25.py --repetitions 20
```

The benchmark uses the real framework collector with default scope, a temporary
index and an embedder that raises if called. It reports collection + tokenization
+ persistence build time, reload time, index size and median/p95 end-to-end query
time (including the existing signature scan and ranking), over five queries
repeated twenty times. Timings are environment dependent; measurements for this
change are recorded in the PR. No production volumes or data are used.

### Measured on 2026-10-16

Default framework scope: 35 selected sources, 7,641 chunks, 8,814,634 text
characters; lexical metadata + chunks JSON is 20,058,576 bytes (~19.1 MiB).
100 searches (the five queries above repeated 20 times):

| Environment | Build, collection and persistence | Reload | Query median | Query p95 |
| --- | ---: | ---: | ---: | ---: |
| macOS arm64, Python 3.11.9 | 15.171 s | 1.420 s | 25.682 ms | 47.574 ms |
| Docker Desktop aarch64, Python 3.10.22, macOS bind mount | 146.836 s | 84.898 s | 223.112 ms | 1,529.164 ms |

The host benchmark used numpy in a temporary venv and a temporary import shim
that supplied only the unused `AIError` class, bypassing optional chat SDK imports;
collector, BM25, persistence and search were unchanged. The container used real
backend dependencies and `--network none`. Both ran on the shared development
machine, not an idle or production server; filesystem/VM contention materially
affects these numbers. These are offline functional measurements, not a latency
SLA or a live LLM quality evaluation. The returned passages include the QSA
factor sheet for `C1 strategie elaborative`, the online feedback paper for
`self regulated learning`, and the pQBL paper for `självreglerat lärande`.
