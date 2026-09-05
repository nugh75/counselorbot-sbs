"""Resolve external provider keys from the ai4educ-managed environment only."""
from __future__ import annotations

import os
from dataclasses import dataclass

from sqlalchemy.orm import Session


API_KEY_ENV_MAP: dict[str, tuple[str, ...]] = {
    "openai": ("API_KEY_OPENAI",),
    "anthropic": ("API_KEY_ANTHROPIC",),
    "gemini": ("API_KEY_GEMINI", "GEMINI_API_KEY", "GOOGLE_API_KEY"),
    "mistral": ("API_KEY_MISTRAL",),
    "omniroute": ("OMNIROUTE_API_KEY", "API_KEY_OMNIROUTE"),
    "openrouter": ("API_KEY_OPENROUTER", "OPENROUTER_API_KEY"),
    "groq": ("API_KEY_GROQ", "GROQ_API_KEY"),
    "cerebras": ("API_KEY_CEREBRAS", "CEREBRAS_API_KEY"),
    "deepseek": ("API_KEY_DEEPSEEK", "DEEPSEEK_API_KEY"),
    "together": ("API_KEY_TOGETHER", "TOGETHER_API_KEY"),
    "fireworks": ("API_KEY_FIREWORKS", "FIREWORKS_API_KEY"),
    "deepinfra": ("API_KEY_DEEPINFRA", "DEEPINFRA_API_KEY"),
}


@dataclass(frozen=True)
class ResolvedAPISecret:
    provider: str
    value: str | None
    source: str
    environment_variable: str | None = None


def config_key(provider: str) -> str:
    return f"api_key_{provider}"


def provider_from_config_key(key: str) -> str | None:
    provider = key.removeprefix("api_key_") if key.startswith("api_key_") else None
    return provider if provider in API_KEY_ENV_MAP else None


def environment_secret(provider: str) -> tuple[str | None, str | None]:
    for variable in API_KEY_ENV_MAP[provider]:
        value = (os.environ.get(variable) or "").strip()
        if value:
            return variable, value
    return None, None


def resolve_api_secret(_db: Session, provider: str) -> ResolvedAPISecret:
    if provider not in API_KEY_ENV_MAP:
        raise KeyError(provider)
    variable, value = environment_secret(provider)
    if value:
        return ResolvedAPISecret(provider, value, "environment", variable)
    return ResolvedAPISecret(provider, None, "unset")


def resolve_api_secrets(db: Session) -> dict[str, ResolvedAPISecret]:
    return {provider: resolve_api_secret(db, provider) for provider in API_KEY_ENV_MAP}
