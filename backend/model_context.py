"""Deterministic context budgets, independent of the transport/provider.

Profiles describe tested deployment limits, not guesses based on model size.
The estimate is deliberately conservative; it is not a model tokenizer.
Essential instructions, current input and structured artifacts are never sliced.
"""
from __future__ import annotations

import json
import math
import re


class ContextCapacityError(ValueError):
    pass


def validate_routing_config(key: str, value: str) -> None:
    if key == "ai_timeout_seconds":
        if not 10 <= int(value) <= 600:
            raise ValueError("Il timeout deve essere compreso tra 10 e 600 secondi.")
    elif key == "ai_fallback_targets":
        from .ai_service import OPENAI_COMPAT_PROVIDERS
        providers = {"openai", "anthropic", "gemini", "mistral", "openrouter", "ollama", "llamacpp", *OPENAI_COMPAT_PROVIDERS}
        targets = json.loads(value)
        if not isinstance(targets, list) or len(targets) > 3:
            raise ValueError("Configura una lista JSON con al massimo tre ripieghi.")
        for target in targets:
            if (not isinstance(target, dict) or set(target) != {"provider", "model"}
                    or target["provider"] not in providers or not isinstance(target["model"], str)
                    or not target["model"].strip()):
                raise ValueError("Ogni ripiego richiede provider e model validi.")
    elif key == "model_context_profiles":
        profiles = json.loads(value)
        if not isinstance(profiles, dict):
            raise ValueError("I profili devono essere un oggetto JSON indicizzato per provider/modello.")
        for name, profile in profiles.items():
            if "/" not in name or not isinstance(profile, dict) or set(profile) - {"context_tokens", "input_tokens", "compact"}:
                raise ValueError("Profilo non valido: usa context_tokens, input_tokens e compact.")
            for field in ("context_tokens", "input_tokens"):
                if field in profile and (type(profile[field]) is not int or not 1024 <= profile[field] <= 2000000):
                    raise ValueError(f"{field} deve essere un intero tra 1024 e 2000000.")
            if "compact" in profile and type(profile["compact"]) is not bool:
                raise ValueError("compact deve essere true o false.")


def estimate_tokens(text: str) -> int:
    return math.ceil(len((text or "").encode("utf-8")) / 3) + 8


def context_profile(config: dict, provider: str, model: str) -> dict:
    raw = config.get("model_context_profiles", "{}")
    profiles = json.loads(raw) if isinstance(raw, str) else raw
    profile = (profiles or {}).get(f"{provider}/{model}", {})
    # An unknown remote window remains unknown: do not advertise a guessed limit.
    window = profile.get("context_tokens")
    if window is None and provider == "ollama":
        window = int(config.get("ollama_num_ctx") or 16384)
    return {
        "context_tokens": int(window) if window else None,
        "input_tokens": int(profile["input_tokens"]) if profile.get("input_tokens") else None,
        "compact": bool(profile.get("compact", False)),
    }


_SECTION = re.compile(
    r"(?m)^\[(?:PERSONA|SECTION|META SYSTEM PROMPT|STUDENT|GUIDED PATH|PROFILE|"
    r"BOOKLET|IDEA REFERENCE|IDEA SOURCES|IDEA MAP|KNOWLEDGE|JOURNEY EVIDENCE|TURN CONTRACT)\]"
)


def _without_background(system: str) -> tuple[str, list[str]]:
    """Only optional theory and navigation lists; never sources or map contracts."""
    matches = list(_SECTION.finditer(system))
    removed = []
    for i in range(len(matches) - 1, -1, -1):
        match = matches[i]
        if match.group() != "[META SYSTEM PROMPT]":
            continue
        end = matches[i + 1].start() if i + 1 < len(matches) else len(system)
        system = system[:match.start()] + system[end:]
        removed.append("optional_theory")
    return system.strip(), removed


def fit_context(system: str, message: str, history: list, profile: dict, output_tokens: int | None):
    """Return fitted inputs and a report; fail before dispatch if essentials cannot fit."""
    history = [dict(turn) for turn in history]
    report = {"removed": [], "history_messages_dropped": 0, "estimated": True, **profile}
    if profile.get("compact"):
        system, report["removed"] = _without_background(system)
    window = profile.get("context_tokens")
    budget = profile.get("input_tokens")
    if window:
        available = window - (output_tokens or 1024) - 256
        budget = min(budget, available) if budget else available
    def size():
        return estimate_tokens(system) + estimate_tokens(message) + sum(estimate_tokens(t["content"]) for t in history)
    report["original_input_tokens"] = size()
    if budget and size() > budget:
        system, removed = _without_background(system)
        report["removed"].extend(removed)
        # Remove complete old exchanges, retaining chronological native roles.
        while history and size() > budget:
            history.pop(0)
            report["history_messages_dropped"] += 1
            while history and history[0]["role"] != "user":
                history.pop(0)
                report["history_messages_dropped"] += 1
    report["input_tokens"] = size()
    report["input_budget"] = budget
    if budget is not None and size() > budget:
        raise ContextCapacityError(
            f"Il contesto essenziale richiede circa {size()} token; il modello ne ha {max(0, budget)} disponibili. "
            "Configura un modello con piu contesto o un ripiego adatto."
        )
    return system, message, history, report
