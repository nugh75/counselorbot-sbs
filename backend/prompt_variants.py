"""Administrator-owned prompt texts for each manually assigned context level.

Totale keeps the existing owner (Config, GuidedStep or Counselor). Other
levels use Config rows and the existing revision/save API. Empty means inherit.
"""
from urllib.parse import quote

from .model_context import DEFAULT_CONTEXT_LEVELS, context_levels, estimate_tokens


def variant_key(key: str, level: str) -> str:
    encoded = quote(level, safe='').replace('_', '%5F')
    return f"{key}__level_{encoded}"


def base_key(key: str) -> str:
    """The prompt a stored variant (`__level_*` or legacy `__short`) belongs to."""
    return key.rsplit("__level_", 1)[0] if "__level_" in key else key.removesuffix("__short")


def variant_levels(config: dict) -> dict:
    # The three standard editors remain available even before assignment.
    return {**DEFAULT_CONTEXT_LEVELS, **context_levels(config)}


def variant_text(config: dict, key: str, level: str) -> str:
    if level == "totale":
        return ""
    target = variant_key(key, level)
    if target in config:
        return config[target] or ""
    # Existing short texts belong to Ristretto only. Saving an empty new row
    # explicitly clears that inheritance; Minimo never borrows Ristretto.
    return (config.get(key + "__short") or "") if level == "ristretto" else ""


def level_config(config: dict, level: str) -> dict:
    result = dict(config)
    if level != "totale":
        bases = {base_key(key) for key in config}
        for key in bases:
            value = variant_text(config, key, level)
            if value.strip():
                result[key] = value
    return result


def attach_variants(entry: dict, configs: dict) -> dict:
    """Nested editor descriptors preserve the base prompt's exact consumers."""
    values = {key: row.value for key, row in configs.items()}
    entry["variants"] = {}
    for level, limits in variant_levels(values).items():
        if level == "totale":
            continue
        key = variant_key(entry["key"], level)
        value = variant_text(values, entry["key"], level)
        entry["variants"][level] = {
            **{k: v for k, v in entry.items() if k not in {"variants", "translations", "effective"}},
            "key": key, "kind": "config", "value": value, "stored": key in configs,
            "default": None, "variant_of": entry["key"], "context_level": level,
            "context_label": limits["label"], "editor": {"method": "POST", "path": "/admin/config"},
            "read_only": False, "estimated_tokens": estimate_tokens(value),
        }
    return entry
