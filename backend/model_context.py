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


DEFAULT_CONTEXT_LEVELS = {
    "totale": {"label": "Totale", "directives_tokens": None, "persona_tokens": None,
               "profile_tokens": None, "knowledge_tokens": None, "knowledge_top_n": None,
               "history_turns": None, "meta": True, "short_prompt": False},
    "ristretto": {"label": "Ristretto", "directives_tokens": None, "persona_tokens": 400,
                  "profile_tokens": 1200, "knowledge_tokens": 1800, "knowledge_top_n": 3,
                  "history_turns": 4, "meta": False, "short_prompt": True},
    "minimo": {"label": "Minimo", "directives_tokens": None, "persona_tokens": 200,
               "profile_tokens": 600, "knowledge_tokens": 900, "knowledge_top_n": 1,
               "history_turns": 2, "meta": False, "short_prompt": True},
}


def context_levels(config: dict) -> dict:
    raw = config.get("model_context_levels")
    if isinstance(raw, str):
        return json.loads(raw) if raw.strip() else DEFAULT_CONTEXT_LEVELS
    return raw or DEFAULT_CONTEXT_LEVELS


def validate_context_levels(value: str) -> None:
    levels = json.loads(value)
    if not isinstance(levels, dict) or not levels or len(levels) > 50:
        raise ValueError("Configura da 1 a 50 livelli di contesto.")
    fields = set(DEFAULT_CONTEXT_LEVELS["totale"])
    for name, level in levels.items():
        if not isinstance(name, str) or not name.strip() or not isinstance(level, dict) or set(level) != fields:
            raise ValueError("Ogni livello richiede nome, label e tutti i limiti dei blocchi.")
        if not isinstance(level["label"], str) or not level["label"].strip():
            raise ValueError("Il nome visibile del livello è obbligatorio.")
        for field in fields - {"label", "meta", "short_prompt"}:
            limit = 2000000 if field.endswith("_tokens") else 1000
            if level[field] is not None and (type(level[field]) is not int or not 0 <= level[field] <= limit):
                raise ValueError(f"{field}: usa null oppure un intero tra 0 e {limit}.")
        if any(type(level[field]) is not bool for field in ("meta", "short_prompt")):
            raise ValueError("meta e short_prompt devono essere booleani.")


def validate_routing_config(key: str, value: str) -> None:
    if key == "model_context_levels":
        validate_context_levels(value)
    elif key == "ai_timeout_seconds":
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
            if not re.fullmatch(r"[^/\s]+/\S+", name) or not isinstance(profile, dict) or set(profile) - {"context_tokens", "input_tokens", "compact", "level"}:
                raise ValueError("Profilo non valido: usa context_tokens, input_tokens, compact e level.")
            if "level" in profile and (not isinstance(profile["level"], str) or not profile["level"].strip()):
                raise ValueError("level deve essere il nome di un livello configurato.")
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
    result = {
        "context_tokens": int(window) if window else None,
        "input_tokens": int(profile["input_tokens"]) if profile.get("input_tokens") else None,
        "compact": bool(profile.get("compact", False)),
    }
    if profile.get("level"):
        levels = context_levels(config)
        if profile["level"] not in levels:
            raise ContextCapacityError("Il livello assegnato al modello non esiste più: aggiorna l'assegnazione.")
        result.update(level=profile["level"], limits=dict(levels[profile["level"]]))
    return result


_SECTION = re.compile(r"(?m)^\[[A-Z][A-Z _-]*\]")


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


def _retain_items(text: str, budget: int | None, count: int | None = None) -> str:
    """Keep whole paragraphs/records, never partial instructions or score rows."""
    if budget is None and count is None:
        return text
    items = re.split(r"\n\s*\n", text.strip()) if text.strip() else []
    if count is not None:
        items = items[:count]
    kept = []
    for item in items:
        candidate = "\n\n".join([*kept, item])
        if budget is not None and estimate_tokens(candidate) > budget:
            break
        kept.append(item)
    return "\n\n".join(kept)


def _retain_knowledge(text: str, budget: int | None, count: int | None) -> str:
    """Ranked RAG sources and catalog entries are indivisible records.

    Preserve the catalog frame with every retained entry, without treating its
    heading as a source. Unknown formats remain complete paragraphs.
    """
    if budget is None and count is None:
        return text
    content = text.removeprefix("[KNOWLEDGE]\n")
    sections = re.split(r"(?m)(?=^\[(?:SOURCE \d+|[A-Z][A-Z_ ]*)\])", content)
    records = []
    for section in sections:
        if not section.strip():
            continue
        if re.match(r"\[SOURCE \d+\]", section):
            records.append(section.strip().removesuffix("---").rstrip())
        elif re.search(r"(?m)^- ", section):
            parts = re.split(r"(?m)(?=^- )", section)
            frame = parts.pop(0).strip() if not section.startswith("- ") else ""
            records.extend((frame + "\n" + part).strip() for part in parts)
        else:
            records.extend(p.strip() for p in re.split(r"\n\s*\n", section) if p.strip())
    kept = []
    for record in records:
        if count is not None and len(kept) >= count:
            break
        candidate = "[KNOWLEDGE]\n" + "\n\n".join([*kept, record])
        if budget is not None and estimate_tokens(candidate) > budget:
            break
        kept.append(record)
    return "[KNOWLEDGE]\n" + "\n\n".join(kept) if kept else ""


def token_breakdown(system: str, message: str, history: list, fragments: dict | None = None) -> dict:
    blocks = {}
    remainder = system
    for name, text in (fragments or {}).items():
        if isinstance(text, str) and text and text in remainder:
            blocks[name] = len(text.encode("utf-8")) / 3
            remainder = remainder.replace(text, "", 1)
    # Attribute one system-message overhead, rather than one per conceptual
    # component. Round by differences so block totals match the envelope total.
    allocated = 0
    for name in blocks:
        rounded = round(blocks[name])
        blocks[name] = rounded
        allocated += rounded
    blocks["instructions_and_contracts"] = estimate_tokens(system) - allocated
    blocks["current_message"] = estimate_tokens(message)
    blocks["history"] = sum(estimate_tokens(t["content"]) for t in history)
    return blocks


def fit_context(system: str, message: str, history: list, profile: dict, output_tokens: int | None,
                *, context_data: dict | None = None):
    """Return fitted inputs and a report; fail before dispatch if essentials cannot fit."""
    history = [dict(turn) for turn in history]
    report = {"removed": [], "history_messages_dropped": 0, "estimated": True, **profile}
    report["original_input_tokens"] = estimate_tokens(system) + estimate_tokens(message) + sum(estimate_tokens(t["content"]) for t in history)
    # Metadata belongs to one exact prepared envelope; secondary generation must
    # never inherit the previous counselor turn's substitutions.
    data = context_data if context_data and context_data.get("system") == system else {}
    fragments = dict(data.get("fragments", {}))
    limits = profile.get("limits", {})
    if limits:
        variant = data.get("variants", {}).get(profile.get("level"))
        if limits.get("short_prompt") and variant and data.get("message") == message:
            system, message = variant["system"], variant["message"]
            fragments = dict(variant["fragments"])
            report["prompt_variant"] = profile["level"]
        elif limits.get("short_prompt") and data.get("short") and profile.get("level") not in {"minimo", "totale"}:
            base = data.get("base", "")
            if base and system.count(base) == 1:
                system = system.replace(base, data["short"], 1)
                report["prompt_variant"] = "short"
            else:
                report["prompt_variant"] = "normal_unmatched"
        else:
            report["prompt_variant"] = "normal"
        directive_limit = limits.get("directives_tokens")
        if directive_limit is not None and fragments.get("directives") and estimate_tokens(fragments["directives"]) > directive_limit:
            raise ContextCapacityError("Le direttive obbligatorie superano il tetto del livello: aumenta directives_tokens.")
        for name in ("persona", "profile", "knowledge", "meta"):
            original = fragments.get(name, "")
            if not original or original not in system:
                continue
            replacement = original
            if name == "meta" and not limits.get("meta", True):
                replacement = ""
            elif name != "meta":
                budget = limits.get(f"{name}_tokens")
                count = limits.get("knowledge_top_n") if name == "knowledge" else None
                # Persona is instruction text: retain or omit it as one unit.
                if name == "persona":
                    replacement = "" if budget is not None and estimate_tokens(original) > budget else original
                elif name == "knowledge":
                    replacement = _retain_knowledge(original, budget, count)
                else:
                    replacement = _retain_items(original, budget, count)
            if replacement != original:
                system = system.replace(original, replacement, 1)
                fragments[name] = replacement
                report["removed"].append(name)
        turns = limits.get("history_turns")
        if turns is not None:
            starts = [i for i, turn in enumerate(history) if turn["role"] == "user"]
            start = starts[-turns] if turns and len(starts) > turns else (len(history) if turns == 0 else 0)
            report["history_messages_dropped"] += start
            history = history[start:]
    if profile.get("compact"):
        system, removed = _without_background(system)
        report["removed"].extend(removed)
    window = profile.get("context_tokens")
    budget = profile.get("input_tokens")
    if window:
        available = window - (output_tokens or 1024) - 256
        budget = min(budget, available) if budget else available
    def size():
        return estimate_tokens(system) + estimate_tokens(message) + sum(estimate_tokens(t["content"]) for t in history)
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
    report["blocks"] = token_breakdown(system, message, history, fragments)
    if budget is not None and size() > budget:
        raise ContextCapacityError(
            f"Il contesto essenziale richiede circa {size()} token; il modello ne ha {max(0, budget)} disponibili. "
            "Configura un modello con piu contesto o un ripiego adatto."
        )
    return system, message, history, report
