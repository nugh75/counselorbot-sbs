# Model-versioned RAG indexes and safe reindexing (block 5)

`RAG_INDEX_DIR` and the portable `rag_index` volume remain unchanged. No schema
migration, new environment variable, provider request, deploy or sudo step is
needed to adopt the storage format. Rebuild the backend image at the later deploy.

## Storage and compatibility

Each collection keeps its existing JSON path as the **atomic commit point**.
New immutable generations live in `<index-path>.versions/v2-<identity-hash>-d<dimension>-<unique>/`:

- `index.json`: corpus, BM25 postings, graph, signature and embedding metadata;
- `vectors.npy`: validated finite float32 matrix, when vectors are available;
- `cache.npz`: chunk hashes and vectors for incremental reindexing.

The namespace hashes provider, model and configured dimension override; the name
also includes the actual output dimension. The JSON records the provider,
embedding identity and actual dimension. Changing model/provider/dimensions never
reuses an incompatible matrix. Returning to an earlier model can reuse its cache
until its old generation is cleaned up. Duplicate chunk texts are embedded once.

Existing JSON + `.npy` indexes are recognized, with BM25 restored locally if
absent. Legacy Ollama chunk caches remain reusable with their original identity.
Invalid/missing vectors trigger lexical retrieval and reconstruction. Legacy files
are never removed or overwritten by the new writer, so no manual volume reset is
needed. After a v2 write, older application versions cannot interpret the new
manifest: rollback should rebuild indexes from the corpus or restore the prior
index-volume backup together with the older application image.

## Build lifecycle and API

A cold start collects and publishes BM25 locally before scheduling embeddings.
`SiteRagIndex.ensure()` starts at most one background build per process; a file
lock serializes builders across workers, and waiting workers reuse a completed
build. The background service owns its SQLAlchemy session and a configuration
snapshot, independent of the HTTP request session.

A candidate collects/chunks/builds separately. Readers retain a coherent snapshot
of chunks, graph and matrix. While rebuilding or switching models, searches use
BM25 over the active corpus. After the candidate is complete and validated, its
files are written, the collection JSON is replaced atomically, and the in-memory
snapshot is published. An embedding, collection or disk-publication failure leaves
the prior active index intact in memory and on disk. The existing cooldown avoids
repeated failed embedding attempts. Query dimension/finite-value checks precede
matrix multiplication; incompatible queries fall back to BM25 and invalidate the
vectors for a later rebuild.

`POST /site-chat/reindex?collection=...` (admin only) now returns promptly with
`status: "building"`, `stats` and `estimate`. Poll existing
`GET /site-chat/stats?collection=...` for `building`, `last_build_error`,
`generation`, `embedding_provider`, `embedding_dimensions` and `built_at`.
`last_build_error` is a sanitized code. A repeated start while building coalesces.
Upload, delete and document-scope updates schedule the same background worker.
Existing Admin panels accept the response; progress/estimate presentation belongs
to block 6. `build()` remains the synchronous worker/testing entrypoint.

Privacy gates remain in force for every document and query operation; a cached
index does not authorize sending a private collection to an external provider.

## Offline cost planning for block 6

`index.estimate_reindex(ai_service)` is read-only and never resolves credentials,
opens an embedding client or writes an index. It collects the current corpus if
needed and counts unique uncached chunks for the selected provider/model/dimension.
It returns corpus/unique/cache counts, eligibility (`vectors_allowed`), dimensions,
input count, `estimated_tokens`, `upper_bound_tokens`, price and estimated/upper
USD cost. A denied collection or `none` sends zero inputs. Cache counts describe
unique texts, rather than source passages.

Reusable pure helper: `embedding_service.estimate_cost(config, texts)`.
The approximate token count is `ceil(characters / 3)` per text; the conservative
upper estimate is UTF-8 bytes, matching accounting's missing-usage estimate.
Both use the existing configurable USD-per-million price table. Unknown prices
return `price_known: false` and null costs rather than claiming a free API call.
These are planning estimates, not an exact tokenizer result or billing quote;
actual accounting and budget checks remain in the embedding service.

## Orphan cleanup

After successful publication, `cleanup_orphaned_indexes()` removes this
collection's unreferenced v2 generation directories older than **24 hours**.
It protects both disk-active and locally active generations, skips symlinks and
unrecognized names, and uses the same cross-worker build lock. No orphan cleanup runs
against legacy files or other collections. Deleting a dynamic collection also
removes its generations under the build lock, and a queued builder cannot
republish a removed collection. Failures postpone cleanup without
undoing a successful build. The method is reusable for an administrative cleanup
job; its grace interval can be supplied explicitly in isolated tests.

## Verification

`backend/tests/test_rag_index_versions.py` covers 1024→1536 changes, BM25 while
building, failed builds/publication, coherent concurrent readers, cross-worker
serialization, separate DB sessions, legacy portable files, query shape guards,
cache reuse, token/cost estimates, the admin endpoint and orphan retention.
All embedders/transports are fake. Run with the other offline retrieval suites
under a disposable database and data/index directories; never production data.
