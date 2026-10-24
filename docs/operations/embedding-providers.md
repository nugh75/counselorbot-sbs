# Configurable embedding providers (block 3)

Backend configuration uses the existing `configs` table. Administrators change
it in **Configuration → General → Document retrieval** (block 6, below) or through
the generic admin-only `GET/POST /admin/config` API (public proxy prefix `/api`).
No migration, personal API credential, `.env` edit or new dependency is required.
The APIs validate provider names, dimensions, prices and the retrieval mode.

| Key | Default / meaning |
| --- | --- |
| `embedding_provider` | `ollama`; implemented: `ollama`, `mistral`, `openrouter`, `none` |
| `embedding_model` | Existing Ollama setting remains compatible. Empty/missing selects the provider default below. When switching provider, explicitly save the new model or clear the old value. |
| `embedding_dimensions` | Empty = native dimensions, except OpenRouter `google/gemini-embedding-2`, which defaults to **768** (Matryoshka, native 3072). Mistral accepts empty/1024. |
| `embedding_prices_per_million` | JSON mapping `provider/model` to USD per million input tokens, e.g. `{"mistral/mistral-embed": 0.10}`. Overrides the defaults below. Unknown models require an explicit price. |
| `ai_timeout_seconds` | Existing setting, 120 seconds, bounded to 10–600 seconds |
| `monthly_budget_usd` | Existing system budget, 0 = unlimited; checked before each external batch |
| `rag_retrieval_mode` | `hybrid` (BM25 + vectors, RRF), `lexical` (BM25 only, never calls the provider) or `vector` (vectors, BM25 fallback). Applies to every search without an explicit mode |

`openai`, `gemini`, `together`, `fireworks` and `deepinfra` are reserved valid
provider names but **not implemented in this block**. Calls fail with
`embedding_unsupported_provider` and document retrieval uses BM25. There is no
implicit provider failover and no paid request during tests.

| Provider | Default model | System key | Default USD/M input tokens |
| --- | --- | --- | --- |
| Ollama | `qwen3-embedding:4b` | None; existing `OLLAMA_BASE_URL` / `ollama_ip` | Local |
| Mistral | `mistral-embed` | `API_KEY_MISTRAL` | 0.10 |
| OpenRouter | `google/gemini-embedding-2` | `API_KEY_OPENROUTER` | 0.20 |
| OpenRouter alternative | `qwen/qwen3-embedding-8b` | Same system key | 0.01 |
| OpenRouter alternative | `mistralai/mistral-embed-2312` | Same system key | 0.10 |
| None | No model | No key | No requests; BM25 only |

Prices above are configurable operational defaults supplied for this rollout,
not a live billing guarantee. Verify the provider's current price and context
limit before choosing a custom model. Defaults for dimensions are model-specific;
other OpenRouter models receive no `dimensions` parameter unless configured.

Dispatch follows the official [Mistral embeddings API](https://docs.mistral.ai/api/endpoint/embeddings)
and [OpenRouter embeddings API](https://openrouter.ai/docs/api/api-reference/embeddings/create-embeddings)
(`https://openrouter.ai/api/v1/embeddings`, OpenAI-compatible client). Clients are
closed after each operation. Batches contain at most 32 texts and, for external
providers, at most 16,000 UTF-8 bytes for Mistral or 32,000 for OpenRouter;
each external text is limited to 8,000 bytes. These conservative limits avoid downloading
a tokenizer. A longer text is truncated on a character boundary (its opening
places the passage); an empty or whitespace-only input fails before the first
paid batch with `embedding_input_empty`. Index builds never send blank chunks:
they stay in BM25 with a zero vector row, which keeps the matrix aligned and is
never ranked by meaning. Custom models with smaller context limits may still
reject a batch. OpenRouter retries are disabled; Mistral uses the SDK's explicit
no-retry policy. Ollama keeps its existing batches of 32 texts.

Zero-retention OpenRouter endpoints may not support batches:
`google/gemini-embedding-2` with the routing below accepts one input but
answers 404 for two or more. On an OpenRouter 404 for a batch, the call sends
that batch and the rest one input per request (same retries, progress after
each request, same routing). It is slower but costs the same; Mistral direct and
`mistralai/mistral-embed-2312` via OpenRouter accept batches of 32 and keep them.

## Privacy policy (block 4)

Enforced in `embedding_service.embed_texts`, the single exit point, with no
config bypass. "External" means any provider other than `ollama`.

| Text | Purpose | External provider |
| --- | --- | --- |
| Built-in corpus documents | `document`, `public_corpus=True` | Allowed |
| Dynamic collection documents | `document` | Only if the admin flags the collection `api_publishable` (default no → BM25 only) |
| Retrieval query (chat, site assistant) | `query` | Only against a public collection, after `filter_external_query` |
| Session memories, episodes, strategy/catalog ranking (`MemoryEmbedder`) | `private` | Never: local Ollama or keyword fallback |

`filter_external_query` runs `pii_ner.anonymize_texts` with the external chat
settings (`pii_ner_enabled`, `pii_ner_model`, `external_pii_fallback`). With
`block`, an unreachable NER detector refuses the query (`embedding_privacy_blocked`)
and the search uses BM25 for that turn without starting the provider cooldown.
A failed NER attempt is not retried for `NER_RETRY_SECONDS` (60 s) per
`ollama_ip`/model and process: meanwhile the query is refused at once (still
fail-closed) instead of waiting for the 10 s detector timeout on every turn and
collection. With `send_raw` the deterministic filter alone applies meanwhile.
Redaction is always applied (since P6 `external_pii_redact=false` is ignored
everywhere): retrieval never needs the real values. The filtered query then passes the
AI gateway residual check (`docs/privacy/p6-gateway.md`). Score-like figures (`4/9`, `3,5/9`, `75%`,
dates written with slashes, `4 su 9`/`4 out of 9`, `percentile 75`/`75° percentile`,
`punteggio: 4`/`score: 4`, `4 punti`, with the equivalents in the six interface
languages) are then removed and the query is capped to 4,000
UTF-8 bytes. A query left empty is refused (`embedding_query_empty`).

The guided chat also composes a separate `vector_query` without
`scores_context` when the provider is external; BM25 and local vectors keep the
full query in-process. Dynamic collections store the flag in
`.collection.json` (`PATCH /admin/rag/collections/{slug}`), read at each use so
every worker applies a change immediately.

OpenRouter requests carry `provider: {"data_collection": "deny", "zdr": true}`
([provider routing](https://openrouter.ai/docs/api/api-reference/embeddings/create-embeddings)).
If no zero-retention endpoint serves the chosen model, OpenRouter returns a 404
"No endpoints found matching your data policy": even a single input fails with
`embedding_privacy_unavailable` and retrieval falls back to BM25. The routing
is never relaxed to make a model work.

Processors: Mistral direct is established in the EU. OpenRouter (US) is an
additional processor that forwards to the model provider (Google for the default
`google/gemini-embedding-2`), with an extra-EU transfer. The privacy notice, DPAs
and transfer assessment require review by the data controller; the texts in this
repository are not legal wording.

### Installations without Ollama (NER)

The platform defaults are `pii_ner_enabled=true` and `external_pii_fallback=block`.
On an installation without Ollama the local NER detector is unreachable, so
**student queries are never embedded externally**: documents are indexed with
vectors, but every query falls back to BM25. This is deliberate (fail-closed) and
is never changed automatically. The Document retrieval panel shows it as
"local detector unreachable → external questions disabled" once a query or the
**Test** button has met the failure. The documented choice is up to the
administrator:

1. restore the local detector (Ollama with `pii_ner_model`, default `qwen3:0.6b`);
2. or choose **Basic filter only (without Ollama)** (`pii_ner_enabled=false`,
   `external_pii_redact=true`, `external_pii_fallback=block`), from the panel button
   or from "Data protection for external models". The deterministic filter then
   removes e-mails, phone numbers and recognised identifiers, but not every name
   or address in free text: it does not guarantee anonymity.

The NER status is the last outcome seen by the worker answering the request; a
fresh worker reports `unknown` until its first query or test.

## Admin panel (block 6)

Configuration → General → **Document retrieval**, administrators only, with the
same guards as the other AI settings (`require_admin`, `no-store`, the
`X-Requested-With: CounselorBot` header for writes, view-as refused).

| Endpoint (prefix `/api`) | Purpose |
| --- | --- |
| `GET /admin/document-retrieval` | Provider, model, dimensions, mode; for each provider its default/suggested models, key variable names and `key_present` (boolean, **never the value**); NER status; per-collection index status |
| `PUT /admin/document-retrieval` | `{provider, model, dimensions, mode}`. Empty model = provider default, saved explicitly; dimensions are cleared for Ollama/none and validated per model |
| `POST /admin/document-retrieval/test` | Embeds one fixed fictitious, non-personal sentence with the saved settings; for external providers it also runs the query filter locally (`query_filter`). Returns only sanitized codes |
| `GET /admin/document-retrieval/estimate` | Sum of the offline estimates of every collection, shown before «Reindicizza tutto» |
| `POST /admin/document-retrieval/reindex-all` | Starts one job that indexes every collection in sequence and returns `{started, job, reason}`. Nothing starts when a job already runs (`reason: reindex_running`), when a single-collection build holds the reservation (`build_in_progress`) or when the worker thread cannot start (`job_start_failed`, state `error`, locks released) |
| `GET /admin/document-retrieval/reindex-all` | Job state: `status` (`idle`, `running`, `done`, `error`, `interrupted`), `current`, `started_at`/`finished_at`, and per collection `status`, `phase` (`collecting`, `embedding`, `saving`), `done`/`total` uncached chunks and a classified `error` |
| `GET /admin/document-retrieval/collections/{id}/estimate` | Offline token/cost estimate (block 5), no provider call |
| `POST /admin/document-retrieval/collections/{id}/reindex` | Starts the background build (block 5); kept for compatibility, no longer a panel button. `409` while another build or the job holds the reservation |

System keys stay in the server `.env` (`API_KEY_MISTRAL`, `API_KEY_OPENROUTER`);
the panel explains this and never accepts a key. Switching to an external provider
applies the block 4 privacy policy above, which the panel recalls. After a model
change, use «Reindicizza tutto»: until a collection is reindexed, its searches use BM25.

The job state is `reindex-all.json` in the index directory, written after every
batch, and an exclusive `flock` on `.reindex-all.lock` is held for the whole job.
Every worker and a page reload therefore see the same progress. A state still
`running` without a lock holder (worker restarted) is reported as `interrupted`.
Builds that embed share one exclusive reservation (thread lock plus a flock on
`.embedding-build.lock`): `start_build()` of any collection and the job never
overlap, so at most one collection embeds at a time across workers. A refused
background build is retried by the next search that finds the index stale. A
collection deleted after the job took its list is recorded as `skipped`
(`collection_removed`) and never falls back to the default collection: the job
uses the strict `find_index()` (no default), and a deletion after the lookup makes
the build fail under the collection lock, after which the job checks existence
again. Deleting a dynamic collection does not wait for the job.
`GET /admin/document-retrieval` also returns `reindex_job`, `dimensions_warning`
(`embedding_dimensions_unusual` for `google/gemini-embedding-2` outside 768, 1536
or 3072) and `semantic_suspended_seconds` (remaining query cooldown).

## Accounting, failures and caches

Each successful external batch creates a separate `Log(action="embedding")`
with provider/model, `cost_usd`, token counts, purpose, dimensions and system
credential source. It contains no input texts or API keys. Cost is token count
multiplied by the configured price, including a successful response with malformed
vectors. Missing usage uses a conservative UTF-8-byte token estimate marked
`usage_estimated=true`. Logs commit separately from the caller so a later batch
failure or caller rollback cannot erase incurred costs. Chat `last_usage` and
provider/model remain unchanged. The existing monthly budget includes these
system logs and stops subsequent external batches; as with chat, this is a check
on recorded spending, not an atomic reservation across concurrent requests.

Missing key (`embedding_missing_key`), budget (`embedding_budget_exceeded`),
unsupported provider, missing price, invalid input/response and timeout are
classified `AIError`s with sanitized messages. Provider errors are classified
from the SDK exception type and HTTP status, never returning bodies:
`embedding_auth_failed` (401/403), `embedding_quota_exceeded` (402),
`embedding_model_unavailable` (404), `embedding_privacy_unavailable` (404 whose
parsed SDK error names the data policy: no endpoint meets the zero-retention
routing; the message itself is never kept), `embedding_request_rejected` (400/413/422),
`embedding_rate_limited` (429), `embedding_provider_error` (5xx),
`embedding_network`, `embedding_timeout` and `embedding_dimensions_mismatch`
(a requested size the provider ignored). Index builds retry a batch up to 5 times
on 429, 5xx, network errors and timeouts. They honour `Retry-After`, otherwise
back off exponentially (2, 4, 8… s, at most 60 s), and report progress after every
batch. Queries, the panel test and private ranking never retry. Existing RAG
cooldown and BM25 handle failures. The embedding path resolves system environment keys again at
call time; personal/shared chat connections cannot replace them.

Cache and cooldown identities include provider/model/dimensions; legacy Ollama
cache identities remain valid when no dimensions are specified. This prevents
cross-provider reuse now. Indexes and caches now live in provider/model/dimension-specific immutable
generations with atomic background publication (block 5). The existing JSON path
remains the commit point and legacy portable files are recognized. See
[model-versioned indexes](rag-index-versions.md) for reindexing, offline cost
estimates and orphan cleanup.

## Offline verification

The focused suite `backend/tests/test_embedding_provider.py` uses fake clients
and forbids real HTTP sends. It covers every implemented provider plus explicit
unsupported errors, keys, batch ordering/limits, dimensions, prices, accounting,
monthly budget, privacy and BM25. Run it alongside `test_rag_bm25.py`,
`test_rag_embedding_degradation.py` and `test_rag_markdown.py`. A temporary database
is required for route imports; never point tests at production.

Rebuild the backend image when deploying later. This session builds the isolated
`counselorbot-embedding-validation:s15` image only; no portable stack restart,
deploy or sudo step is part of block 3.
