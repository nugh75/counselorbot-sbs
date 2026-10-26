"""Capacità di reasoning dichiarate dal catalogo OpenRouter.

OpenRouter espone, per ogni modello, ``supported_parameters`` e un oggetto
``reasoning`` con ``mandatory``, ``supported_efforts`` e ``default_effort``.
Il catalogo viene letto su richiesta (dal pannello admin) e tenuto in cache in
memoria; la chat usa la cache quando c'è, altrimenti una tabella di fallback
prudente per i modelli che conosciamo. Nessuna chiamata di rete parte dal
percorso di chat.
"""
from __future__ import annotations

import logging
import time
from dataclasses import asdict, dataclass
from typing import Any, Iterable, Optional

import httpx

logger = logging.getLogger(__name__)

CATALOG_URL = "https://openrouter.ai/api/v1/models"
CACHE_TTL_SECONDS = 6 * 60 * 60


@dataclass(frozen=True)
class OpenRouterCapability:
    """Capacità reasoning di un modello OpenRouter, come dichiarate dal catalogo."""

    model: str
    mandatory: bool
    supported_efforts: tuple[str, ...]
    default_effort: Optional[str]
    supports_reasoning: bool
    supports_max_tokens: bool
    context_length: Optional[int]
    max_completion_tokens: Optional[int]
    supported_parameters: tuple[str, ...]

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


# Fallback usato quando il catalogo non è ancora stato letto o non è
# raggiungibile. Riproduce i metadati verificati sul catalogo OpenRouter il
# 21 ottobre 2026 per i modelli della milestone; per gli altri resta la tabella
# di famiglie in `reasoning_profiles`.
_FALLBACK: dict[str, OpenRouterCapability] = {
    "google/gemini-3.8-flash": OpenRouterCapability(
        model="google/gemini-3.8-flash",
        mandatory=True,
        supported_efforts=("high", "medium", "low"),
        default_effort="medium",
        supports_reasoning=True,
        supports_max_tokens=True,
        context_length=1048576,
        max_completion_tokens=65536,
        supported_parameters=("reasoning", "reasoning_effort", "max_tokens", "temperature", "top_p"),
    ),
    "google/gemini-4-argon": OpenRouterCapability(
        model="google/gemini-4-argon",
        mandatory=True,
        supported_efforts=("high", "medium", "low"),
        default_effort="medium",
        supports_reasoning=True,
        supports_max_tokens=True,
        context_length=1048576,
        max_completion_tokens=943718,
        supported_parameters=("reasoning", "reasoning_effort", "max_tokens", "temperature", "top_p"),
    ),
    "openai/gpt-6.1-sol": OpenRouterCapability(
        model="openai/gpt-6.1-sol",
        mandatory=True,
        supported_efforts=("max", "xhigh", "high", "medium", "low"),
        default_effort="medium",
        supports_reasoning=True,
        supports_max_tokens=True,
        context_length=1050000,
        max_completion_tokens=128000,
        supported_parameters=("reasoning", "reasoning_effort", "max_tokens", "max_completion_tokens"),
    ),
    "anthropic/claude-sonnet-5.5": OpenRouterCapability(
        model="anthropic/claude-sonnet-5.5",
        mandatory=True,
        supported_efforts=("max", "xhigh", "high", "medium", "low"),
        default_effort="high",
        supports_reasoning=True,
        supports_max_tokens=True,
        context_length=1000000,
        max_completion_tokens=128000,
        supported_parameters=("reasoning", "reasoning_effort", "max_tokens", "max_completion_tokens"),
    ),
    "anthropic/claude-opus-5.5": OpenRouterCapability(
        model="anthropic/claude-opus-5.5",
        mandatory=True,
        supported_efforts=("max", "xhigh", "high", "medium", "low"),
        default_effort="high",
        supports_reasoning=True,
        supports_max_tokens=True,
        context_length=1000000,
        max_completion_tokens=128000,
        supported_parameters=("reasoning", "reasoning_effort", "max_tokens", "max_completion_tokens"),
    ),
    "anthropic/claude-fable-5.1": OpenRouterCapability(
        model="anthropic/claude-fable-5.1",
        mandatory=True,
        supported_efforts=("max", "xhigh", "high", "medium", "low"),
        default_effort="high",
        supports_reasoning=True,
        supports_max_tokens=True,
        context_length=1000000,
        max_completion_tokens=128000,
        supported_parameters=("reasoning", "reasoning_effort", "max_tokens", "max_completion_tokens"),
    ),
    "openai/gpt-6.1-sol-pro": OpenRouterCapability(
        model="openai/gpt-6.1-sol-pro",
        mandatory=True,
        supported_efforts=("max", "xhigh", "high", "medium", "low"),
        default_effort="medium",
        supports_reasoning=True,
        supports_max_tokens=True,
        context_length=1050000,
        max_completion_tokens=128000,
        supported_parameters=("reasoning", "reasoning_effort", "max_tokens", "max_completion_tokens"),
    ),
    "anthropic/claude-haiku-5.5": OpenRouterCapability(
        model="anthropic/claude-haiku-5.5",
        mandatory=False,
        supported_efforts=("max", "xhigh", "high", "medium", "low", "none"),
        default_effort="medium",
        supports_reasoning=True,
        supports_max_tokens=True,
        context_length=1000000,
        max_completion_tokens=128000,
        supported_parameters=("reasoning", "reasoning_effort", "max_tokens", "max_completion_tokens"),
    ),
    "mistralai/mistral-large-4-0": OpenRouterCapability(
        model="mistralai/mistral-large-4-0",
        mandatory=False,
        supported_efforts=("high", "none"),
        default_effort="high",
        supports_reasoning=True,
        supports_max_tokens=True,
        context_length=1048576,
        max_completion_tokens=262144,
        supported_parameters=("reasoning", "reasoning_effort", "max_tokens", "temperature", "top_p"),
    ),
}

_CACHE: dict[str, OpenRouterCapability] = {}
_LOADED_AT = 0.0
_SOURCE = "fallback"


def _normalize_model(model: Optional[str]) -> str:
    return model.strip().lower() if isinstance(model, str) and model.strip() else ""


def _catalog_key(model: str) -> str:
    """Chiave di ricerca tollerante alle varianti OpenRouter ``:batch``/``:free``."""
    key = model.lower()
    for suffix in (":batch", ":free"):
        if key.endswith(suffix):
            return key[: -len(suffix)]
    return key


def _positive_int(value: Any) -> Optional[int]:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def parse_catalog(payload: Any) -> dict[str, OpenRouterCapability]:
    """Trasforma la risposta di ``/api/v1/models`` in capacità indicizzate per id."""
    rows = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(rows, Iterable) or isinstance(rows, (str, bytes, dict)):
        return {}
    capabilities: dict[str, OpenRouterCapability] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        model = _normalize_model(row.get("id"))
        if not model:
            continue
        supported = row.get("supported_parameters")
        supported_parameters = tuple(
            str(item).strip().lower() for item in supported if isinstance(item, str) and item.strip()
        ) if isinstance(supported, (list, tuple)) else ()
        reasoning = row.get("reasoning")
        reasoning = reasoning if isinstance(reasoning, dict) else {}
        efforts_raw = reasoning.get("supported_efforts")
        supported_efforts = tuple(
            str(item).strip().lower() for item in efforts_raw if isinstance(item, str) and item.strip()
        ) if isinstance(efforts_raw, (list, tuple)) else ()
        default_effort = reasoning.get("default_effort")
        default_effort = str(default_effort).strip().lower() if isinstance(default_effort, str) else None
        if default_effort and supported_efforts and default_effort not in supported_efforts:
            default_effort = None
        top_provider = row.get("top_provider")
        top_provider = top_provider if isinstance(top_provider, dict) else {}
        supports_reasoning = bool(reasoning) or "reasoning" in supported_parameters or "reasoning_effort" in supported_parameters
        supports_max_tokens = (
            "max_tokens" in supported_parameters
            or "max_completion_tokens" in supported_parameters
            or bool(reasoning.get("supports_max_tokens"))
        )
        capabilities[model] = OpenRouterCapability(
            model=model,
            mandatory=bool(reasoning.get("mandatory", False)),
            supported_efforts=supported_efforts,
            default_effort=default_effort,
            supports_reasoning=supports_reasoning,
            supports_max_tokens=supports_max_tokens,
            context_length=_positive_int(row.get("context_length") or top_provider.get("context_length")),
            max_completion_tokens=_positive_int(
                top_provider.get("max_completion_tokens") or row.get("max_completion_tokens")
            ),
            supported_parameters=supported_parameters,
        )
    return capabilities


def refresh(api_key: Optional[str] = None, *, force: bool = False, timeout: float = 15.0) -> dict[str, OpenRouterCapability]:
    """Legge il catalogo OpenRouter e aggiorna la cache in memoria.

    Senza chiave o con catalogo irraggiungibile non svuota la cache: la chat
    continua con i dati precedenti o con il fallback. ``force`` serve al
    pulsante di ricarica del pannello admin.
    """
    global _CACHE, _LOADED_AT, _SOURCE
    now = time.monotonic()
    if not force and _CACHE and now - _LOADED_AT < CACHE_TTL_SECONDS:
        return _CACHE
    if not api_key:
        return _CACHE
    try:
        response = httpx.get(
            CATALOG_URL,
            headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
            timeout=timeout,
        )
        response.raise_for_status()
        parsed = parse_catalog(response.json())
        if parsed:
            _CACHE = parsed
            _LOADED_AT = now
            _SOURCE = "catalog"
            logger.info("Catalogo OpenRouter aggiornato: %s modelli", len(parsed))
        return _CACHE
    except Exception as exc:
        logger.warning("Catalogo OpenRouter non aggiornato (%s); uso la cache/fallback", type(exc).__name__)
        return _CACHE


def set_catalog(capabilities: dict[str, OpenRouterCapability], *, source: str = "test") -> None:
    """Sostituisce la cache (usato dai test e dal caricamento del catalogo)."""
    global _CACHE, _LOADED_AT, _SOURCE
    _CACHE = {_normalize_model(key): value for key, value in capabilities.items() if _normalize_model(key)}
    _LOADED_AT = time.monotonic()
    _SOURCE = source


def clear_cache() -> None:
    global _CACHE, _LOADED_AT, _SOURCE
    _CACHE = {}
    _LOADED_AT = 0.0
    _SOURCE = "fallback"


def cached() -> dict[str, OpenRouterCapability]:
    return _CACHE


def source() -> str:
    return _SOURCE


def capability_for(model: Optional[str]) -> Optional[OpenRouterCapability]:
    """Capacità del modello dalla cache o dal fallback, senza rete."""
    key = _normalize_model(model)
    if not key:
        return None
    for candidate in (key, _catalog_key(key)):
        if candidate in _CACHE:
            return _CACHE[candidate]
        if candidate in _FALLBACK:
            return _FALLBACK[candidate]
    return None


def mandatory_for(model: Optional[str]) -> bool:
    capability = capability_for(model)
    return bool(capability and capability.mandatory)


def efforts_for(model: Optional[str]) -> tuple[str, ...]:
    capability = capability_for(model)
    return capability.supported_efforts if capability else ()


def default_effort_for(model: Optional[str]) -> Optional[str]:
    capability = capability_for(model)
    return capability.default_effort if capability else None
