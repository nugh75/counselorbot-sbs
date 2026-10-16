"""System-only embedding backends with the external privacy policy (block 4).

External providers receive only public corpus documents and privacy-filtered
queries: same PII filter as external chat, numeric scores removed. Private text
(session memories, episodes, short-text ranking) never leaves the process.
"""

from __future__ import annotations

import json
import math
import re
import threading
import time
from collections.abc import Callable, Mapping
from typing import Any

import httpx
from mistralai.client import Mistral
from openai import OpenAI
from sqlalchemy.orm import Session

from . import models, pii_ner
from .api_secrets import resolve_api_secret

PROVIDERS = {
    "ollama",
    "mistral",
    "openrouter",
    "openai",
    "gemini",
    "together",
    "fireworks",
    "deepinfra",
    "none",
}
SUPPORTED = {"ollama", "mistral", "openrouter", "none"}
DEFAULT_MODELS = {
    "ollama": "qwen3-embedding:4b",
    "mistral": "mistral-embed",
    "openrouter": "google/gemini-embedding-2",
}
# USD per million input tokens. Operator overrides are keyed by provider/model.
DEFAULT_PRICES = {
    "mistral/mistral-embed": 0.10,
    "openrouter/google/gemini-embedding-2": 0.20,
    "openrouter/qwen/qwen3-embedding-8b": 0.01,
    "openrouter/mistralai/mistral-embed-2312": 0.10,
}
CONFIG_DEFINITIONS = [
    (
        "embedding_provider",
        "ollama",
        "Provider embedding: ollama, mistral, openrouter, none; gli altri provider sono riservati e non ancora supportati.",
    ),
    (
        "embedding_dimensions",
        "",
        "Dimensioni embedding opzionali; OpenRouter google/gemini-embedding-2 usa 768 se vuoto (nativo 3072).",
    ),
    (
        "embedding_prices_per_million",
        "{}",
        'Prezzi USD per milione di token input: JSON {"provider/model": prezzo}. Sovrascrive i prezzi embedding predefiniti.',
    ),
]


# "private" = user-derived text (memories, episodes): local providers only.
PURPOSES = {"document", "query", "private"}
# Per-query refusals: the provider is healthy, so they must not trigger the RAG cooldown.
QUERY_LOCAL_ERRORS = {"embedding_privacy_blocked", "embedding_query_empty"}
# Bytes of filtered query sent externally: retrieval needs the opening, not the whole turn.
EXTERNAL_QUERY_MAX_BYTES = 4000
# Scores and score-like figures never reach an external provider: 4/9, 3,5/9,
# 75%, 12/05/2001, "4 su 9", "percentile 75", "75° percentile", "punteggio: 4",
# "4 punti", with the equivalents in the six interface languages.
_NUM = r"\d+(?:[.,]\d+)?"
_SCORE_WORDS = (r"punteggi[oa]?|voto|score[sd]?|puntuaci[oó]n|puntaje|nota|note|"
                r"punktzahl|punktwert|punkte|poäng|resultat|stanine|sten")
_PERCENTILE = r"percentile|percentil|perzentil|centile"
_OF = r"su|out\s+of|of|de|sur|sobre|von|aus|av"
_VALUE = rf"{_NUM}(?:\s*/\s*{_NUM})*(?:\s*%|\s+(?:{_OF})\s+{_NUM})?"
_SCORE_RE = re.compile(
    rf"\b{_NUM}(?:(?:\s*/\s*{_NUM})+|\s*%)"
    rf"|\b{_NUM}\s+(?:{_OF})\s+{_NUM}"
    rf"|\b(?:{_PERCENTILE})\s*[:=]?\s*{_VALUE}"
    rf"|\b{_NUM}\s*(?:°|º|th|st|nd|rd|e|ème|er|\.)?\s*(?:{_PERCENTILE})\b"
    rf"|\b(?:{_SCORE_WORDS})\s*[:=]?\s*{_VALUE}"
    rf"|\b{_NUM}\s*(?:punt[io]s?|points?|pts?|punkte?|poäng)\b",
    re.IGNORECASE,
)
# A failed NER attempt is not retried for this long: the query stays local
# (fail-closed with `block`) without paying the detector timeout on every turn.
NER_RETRY_SECONDS = 60
_ner_failures: dict[tuple[str, str], float] = {}
_ner_lock = threading.Lock()
_clock = time.monotonic
# OpenRouter routing: only providers that neither collect nor retain request data.
OPENROUTER_PRIVACY_ROUTING = {"data_collection": "deny", "zdr": True}


def is_external(provider: str | None) -> bool:
    return (provider or "ollama") not in {"ollama", "none"}


def _ner_settings(config: Mapping) -> tuple[bool, str, str]:
    flag = config.get("pii_ner_enabled")
    enabled = (
        pii_ner.is_ner_enabled()
        if flag is None
        else str(flag).strip().lower() not in ("0", "false", "no", "off")
    )
    base = (config.get("ollama_ip") or "http://localhost:11434").rstrip("/")
    return enabled, base, config.get("pii_ner_model") or pii_ner.get_ner_model()


def ner_status(config: Mapping) -> str:
    """Last NER outcome seen by this process: disabled, unreachable or unknown."""
    enabled, base, model = _ner_settings(config)
    if not enabled:
        return "disabled"
    with _ner_lock:
        failed_at = _ner_failures.get((base, model))
    return "unreachable" if failed_at is not None else "unknown"


def filter_external_query(config: Mapping, texts: list[str]) -> list[str]:
    """Apply the external chat PII policy to query texts, then drop numeric scores.

    Unlike chat, redaction is not optional here: placeholders cost retrieval
    nothing and there is no response to restore. `pii_ner_enabled` and
    `external_pii_fallback` (block | send_raw) follow the chat settings.
    """
    ner_enabled, base, model = _ner_settings(config)
    key = (base, model)
    with _ner_lock:
        failed_at = _ner_failures.get(key)
    cooling = (
        ner_enabled
        and failed_at is not None
        and _clock() - failed_at < NER_RETRY_SECONDS
    )
    anonymized, _mapping, ner_ok = pii_ner.anonymize_texts(
        list(texts),
        ollama_base=base,
        ner_enabled=ner_enabled and not cooling,
        ner_model=model,
    )
    if cooling:
        ner_ok = False
    elif ner_enabled:
        with _ner_lock:
            if ner_ok:
                _ner_failures.pop(key, None)
            else:
                _ner_failures[key] = _clock()
    fallback = (config.get("external_pii_fallback") or "block").strip().lower()
    if not ner_ok and fallback == "block":
        raise EmbeddingError("embedding_privacy_blocked")
    out = []
    for text in anonymized:
        text = " ".join(_SCORE_RE.sub(" ", text or "").split())
        text = text.encode("utf-8")[:EXTERNAL_QUERY_MAX_BYTES].decode("utf-8", "ignore")
        if not text.strip():
            raise EmbeddingError("embedding_query_empty")
        out.append(text)
    return out


class EmbeddingError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def validate_config(key: str, value: str):
    if key == "embedding_provider" and value not in PROVIDERS:
        raise ValueError("Unknown embedding provider")
    if (
        key == "embedding_dimensions"
        and value
        and (not value.isdigit() or not 1 <= int(value) <= 65536)
    ):
        raise ValueError(
            "Embedding dimensions must be empty or an integer between 1 and 65536"
        )
    if key == "embedding_prices_per_million":
        prices = json.loads(value)
        if not isinstance(prices, dict) or any(
            not isinstance(k, str)
            or "/" not in k
            or isinstance(v, bool)
            or not isinstance(v, (int, float))
            or not math.isfinite(v)
            or v < 0
            for k, v in prices.items()
        ):
            raise ValueError(
                "Embedding prices must map provider/model to a finite non-negative USD price"
            )


def options(config: Mapping):
    provider = (config.get("embedding_provider") or "ollama").strip().lower()
    model = (config.get("embedding_model") or DEFAULT_MODELS.get(provider, "")).strip()
    raw = config.get("embedding_dimensions") or ""
    try:
        validate_config("embedding_dimensions", str(raw))
        dimensions = int(raw) if raw else None
    except (TypeError, ValueError) as exc:
        raise EmbeddingError("embedding_invalid_config") from exc
    if (
        dimensions is None
        and provider == "openrouter"
        and model == "google/gemini-embedding-2"
    ):
        dimensions = 768
    return provider, model, dimensions


def identity(provider: str, model: str, dimensions: int | None):
    # Preserve existing Ollama caches unless a dimension override was requested.
    return (
        model
        if provider == "ollama" and dimensions is None
        else f"{provider}/{model}/dimensions={dimensions}"
    )


def estimate_cost(config: Mapping, texts: list[str]) -> dict:
    """Offline planning estimate, using the same operator prices as accounting.

    Three characters/token is approximate; UTF-8 bytes give the conservative
    upper estimate used by accounting when a provider omits usage. No key/DB.
    """
    provider, model, dimensions = options(config)
    validate_config(
        "embedding_prices_per_million",
        config.get("embedding_prices_per_million") or "{}",
    )
    prices = {
        **DEFAULT_PRICES,
        **json.loads(config.get("embedding_prices_per_million") or "{}"),
    }
    price = 0.0 if provider in {"ollama", "none"} else prices.get(f"{provider}/{model}")
    tokens = sum(math.ceil(len(text) / 3) for text in texts)
    upper = sum(len(text.encode("utf-8")) for text in texts)
    return {
        "provider": provider,
        "model": model,
        "dimensions": dimensions,
        "input_count": len(texts),
        "estimated_tokens": tokens,
        "upper_bound_tokens": upper,
        "price_per_million": price,
        "estimated_cost_usd": None if price is None else tokens * price / 1_000_000,
        "upper_bound_cost_usd": None if price is None else upper * price / 1_000_000,
        "price_known": price is not None,
        "approximate": True,
    }


def _field(obj, key, default=None):
    return (
        obj.get(key, default) if isinstance(obj, dict) else getattr(obj, key, default)
    )


def _batches(texts: list[str], provider: str):
    # Conservative UTF-8 byte limits also bound tokens without a downloaded tokenizer.
    # Mistral: <= 8k tokens/text; OpenRouter models: operator must check custom limits.
    if provider == "ollama":
        for start in range(0, len(texts), 32):
            yield texts[start : start + 32]
        return
    limit = 8000
    batch_limit = 16000 if provider == "mistral" else 32000
    batch: list[str] = []
    size = 0
    for text in texts:
        length = len(text.encode("utf-8"))
        if not text.strip() or length > limit:
            raise EmbeddingError("embedding_input_limit")
        if len(batch) >= 32 or size + length > batch_limit:
            yield batch
            batch, size = [], 0
        batch.append(text)
        size += length
    if batch:
        yield batch


def embed_texts(
    config: Mapping,
    db: Session,
    budget_locked: Callable[[], bool],
    texts: list[str],
    *,
    purpose: str = "document",
    public_corpus: bool = False,
    model: str | None = None,
):
    if purpose not in PURPOSES:
        raise EmbeddingError("embedding_invalid_purpose")
    if not texts:
        return []
    effective_config = {**config, "embedding_model": model} if model else config
    provider, model, dimensions = options(effective_config)
    if provider not in SUPPORTED:
        raise EmbeddingError("embedding_unsupported_provider")
    if provider == "none":
        raise EmbeddingError("embedding_disabled")
    external = provider != "ollama"
    # Privacy policy, no config bypass: private text never leaves the process;
    # documents only from a public corpus; queries only against a public corpus
    # and only after the PII filter and score removal.
    if external and (purpose == "private" or not public_corpus):
        raise EmbeddingError("embedding_privacy_blocked")
    if not model:
        raise EmbeddingError("embedding_invalid_config")
    if provider == "mistral" and dimensions not in (None, 1024):
        raise EmbeddingError("embedding_invalid_dimensions")
    if (
        provider == "openrouter"
        and model == "google/gemini-embedding-2"
        and dimensions
        and dimensions > 3072
    ):
        raise EmbeddingError("embedding_invalid_dimensions")
    if external and purpose == "query":
        texts = filter_external_query(config, texts)
    # Validate the whole input before spending on its first batch.
    batches = list(_batches(texts, provider))
    try:
        timeout = max(10, min(600, int(config.get("ai_timeout_seconds") or 120)))
        validate_config(
            "embedding_prices_per_million",
            config.get("embedding_prices_per_million") or "{}",
        )
        prices = {
            **DEFAULT_PRICES,
            **json.loads(config.get("embedding_prices_per_million") or "{}"),
        }
    except (TypeError, ValueError) as exc:
        raise EmbeddingError("embedding_invalid_config") from exc
    price = prices.get(f"{provider}/{model}")
    key = None
    if external:
        # Resolve again: a personal chat connection may have overwritten config keys.
        key = resolve_api_secret(db, provider).value
        if not key:
            raise EmbeddingError("embedding_missing_key")
        if price is None:
            raise EmbeddingError("embedding_price_missing")
        if budget_locked():
            raise EmbeddingError("embedding_budget_exceeded")
    vectors: list[list[float]] = []
    client: Any
    try:
        if provider == "mistral":
            client = Mistral(api_key=key, timeout_ms=timeout * 1000)
        elif provider == "openrouter":
            client = OpenAI(
                api_key=key,
                base_url="https://openrouter.ai/api/v1",
                timeout=float(timeout),
                max_retries=0,
            )
        else:
            client = httpx.Client(timeout=httpx.Timeout(timeout, connect=10.0))
        try:
            for batch in batches:
                if external and budget_locked():
                    raise EmbeddingError("embedding_budget_exceeded")
                if provider == "ollama":
                    payload = {
                        "model": model,
                        "input": batch,
                        "keep_alive": config.get("ollama_keep_alive") or "5m",
                    }
                    if dimensions:
                        payload["dimensions"] = dimensions
                    response = client.post(
                        f"{(config.get('ollama_ip') or 'http://localhost:11434').rstrip('/')}/api/embed",
                        json=payload,
                    )
                    response.raise_for_status()
                    response = response.json()
                    raw = response.get("embeddings")
                elif provider == "mistral":
                    response = client.embeddings.create(
                        model=model,
                        inputs=batch,
                        timeout_ms=timeout * 1000,
                        retries=None,
                    )
                    raw = None
                else:
                    kwargs = {
                        "model": model,
                        "input": batch,
                        "encoding_format": "float",
                    }
                    if dimensions:
                        kwargs["dimensions"] = dimensions
                    # OpenRouter is an extra US processor: refuse providers that keep data.
                    kwargs["extra_body"] = {"provider": dict(OPENROUTER_PRIVACY_ROUTING)}
                    response = client.embeddings.create(**kwargs)
                    raw = None
                # Account for every successful paid response, even malformed vectors.
                if external:
                    usage = _field(response, "usage")
                    tokens = _field(
                        usage, "prompt_tokens", _field(usage, "input_tokens")
                    )
                    estimated = tokens is None
                    # A conservative byte-based estimate keeps missing usage in the budget.
                    tokens = (
                        sum(len(t.encode("utf-8")) for t in batch)
                        if estimated
                        else int(tokens)
                    )
                    if tokens < 0:
                        raise EmbeddingError("embedding_invalid_response")
                    with Session(bind=db.get_bind()) as accounting:
                        accounting.add(
                            models.Log(
                                action="embedding",
                                provider=provider,
                                model_name=model,
                                cost_usd=tokens * float(price or 0) / 1_000_000,
                                details={
                                    "credential_source": "system",
                                    "purpose": purpose,
                                    "usage": {
                                        "prompt_tokens": tokens,
                                        "total_tokens": tokens,
                                    },
                                    "usage_estimated": estimated,
                                    "input_count": len(batch),
                                    "dimensions": dimensions,
                                    "price_per_million": price,
                                },
                            )
                        )
                        accounting.commit()
                    data = _field(response, "data", [])
                    if sorted(_field(row, "index", -1) for row in data) != list(
                        range(len(batch))
                    ):
                        raise EmbeddingError("embedding_invalid_response")
                    raw = [
                        _field(row, "embedding")
                        for row in sorted(data, key=lambda r: _field(r, "index"))
                    ]
                if not isinstance(raw, list) or len(raw) != len(batch):
                    raise EmbeddingError("embedding_invalid_response")
                expected = dimensions or (len(vectors[0]) if vectors else None)
                for vector in raw:
                    if (
                        not isinstance(vector, list)
                        or not vector
                        or any(
                            isinstance(v, bool)
                            or not isinstance(v, (float, int))
                            or not math.isfinite(v)
                            for v in vector
                        )
                    ):
                        raise EmbeddingError("embedding_invalid_response")
                    expected = expected or len(vector)
                    if len(vector) != expected:
                        raise EmbeddingError("embedding_invalid_response")
                vectors.extend(raw)
        finally:
            if provider == "mistral":
                client.__exit__(None, None, None)
            else:
                client.close()
    except EmbeddingError:
        raise
    except Exception as exc:
        # Never propagate response bodies, input texts, keys or transport URLs.
        code = (
            "embedding_timeout"
            if isinstance(exc, (TimeoutError, httpx.TimeoutException))
            or "timeout" in type(exc).__name__.lower()
            else "embedding_unavailable"
        )
        raise EmbeddingError(code) from None
    return vectors
