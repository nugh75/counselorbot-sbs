# Configurable embedding providers (block 3)

Backend configuration uses the existing `configs` table and admin-only
`GET/POST /admin/config` API (public proxy prefix `/api`). No migration, personal
API credential, `.env` edit or new dependency is required. Dedicated Admin UI
belongs to block 6. The API validates provider names, dimensions and prices.

| Key | Default / meaning |
| --- | --- |
| `embedding_provider` | `ollama`; implemented: `ollama`, `mistral`, `openrouter`, `none` |
| `embedding_model` | Existing Ollama setting remains compatible. Empty/missing selects the provider default below. When switching provider, explicitly save the new model or clear the old value. |
| `embedding_dimensions` | Empty = native dimensions, except OpenRouter `google/gemini-embedding-2`, which defaults to **768** (Matryoshka, native 3072). Mistral accepts empty/1024. |
| `embedding_prices_per_million` | JSON mapping `provider/model` to USD per million input tokens, e.g. `{"mistral/mistral-embed": 0.10}`. Overrides the defaults below. Unknown models require an explicit price. |
| `ai_timeout_seconds` | Existing setting, 120 seconds, bounded to 10–600 seconds |
| `monthly_budget_usd` | Existing system budget, 0 = unlimited; checked before each external batch |

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
a tokenizer. Oversized/empty inputs fail before the first paid batch; custom
models with smaller context limits may still reject a batch. No automatic
truncation. OpenRouter retries are disabled; Mistral uses the SDK's explicit
no-retry policy. Ollama keeps its existing batches of 32 texts.

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
Unlike chat, redaction is always applied, even with `external_pii_redact=false`:
retrieval never needs the real values. Score-like figures (`4/9`, `3,5/9`, `75%`,
dates written with slashes) are then removed and the query is capped to 4,000
UTF-8 bytes. A query left empty is refused (`embedding_query_empty`).

The guided chat also composes a separate `vector_query` without
`scores_context` when the provider is external; BM25 and local vectors keep the
full query in-process. Dynamic collections store the flag in
`.collection.json` (`PATCH /admin/rag/collections/{slug}`), read at each use so
every worker applies a change immediately.

OpenRouter requests carry `provider: {"data_collection": "deny", "zdr": true}`
([provider routing](https://openrouter.ai/docs/api/api-reference/embeddings/create-embeddings)).
If no zero-retention endpoint serves the chosen model, OpenRouter returns an
error and retrieval falls back to BM25: this has not been tested against the
live API.

Processors: Mistral direct is established in the EU. OpenRouter (US) is an
additional processor that forwards to the model provider (Google for the default
`google/gemini-embedding-2`), with an extra-EU transfer. The privacy notice, DPAs
and transfer assessment require review by the data controller; the texts in this
repository are not legal wording.

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
classified `AIError`s with sanitized messages. Existing RAG cooldown and BM25
handle failures. The embedding path resolves system environment keys again at
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
