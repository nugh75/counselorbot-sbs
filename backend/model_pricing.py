"""Tabella prezzi modelli per stimare il costo quando il provider NON lo
restituisce nell'usage.

Solo OpenRouter manda `usage.cost`. I provider diretti (groq, cerebras,
deepseek, together, fireworks, deepinfra) restituiscono i token ma non il
costo: qui stimiamo `cost_usd = prompt_tokens * in + completion_tokens * out`.

Prezzi in **USD per 1.000.000 di token** (input, output). Valori indicativi
giugno 2026 — VERIFICA sulle pagine ufficiali dei provider e aggiorna qui se
cambiano (e' dato di riferimento, si modifica nel codice, non in admin).
Chiave esterna = nome provider; chiave interna = id modello esatto.
"""

# provider -> { model_id: (input_per_M, output_per_M) }
PRICES_PER_M = {
    "groq": {
        "llama-3.3-70b-versatile": (0.59, 0.79),
        "llama-3.1-8b-instant": (0.05, 0.08),
        "openai/gpt-oss-120b": (0.15, 0.75),
        "openai/gpt-oss-20b": (0.10, 0.50),
        "qwen/qwen3-32b": (0.29, 0.59),
    },
    "cerebras": {
        "llama-3.3-70b": (0.85, 1.20),
        "qwen-3-32b": (0.40, 0.80),
        "gpt-oss-120b": (0.25, 0.69),
        "llama3.1-8b": (0.10, 0.10),
    },
    "deepseek": {
        "deepseek-v4-flash": (0.09, 0.18),
        "deepseek-v4-pro": (0.435, 0.87),
        "deepseek-chat": (0.27, 1.10),
        "deepseek-reasoner": (0.55, 2.19),
    },
    "together": {
        "meta-llama/Llama-3.3-70B-Instruct-Turbo": (0.88, 0.88),
        "Qwen/Qwen2.5-72B-Instruct-Turbo": (1.20, 1.20),
        "mistralai/Mixtral-8x7B-Instruct-v0.1": (0.60, 0.60),
    },
    "fireworks": {
        "accounts/fireworks/models/llama-v3p3-70b-instruct": (0.90, 0.90),
        "accounts/fireworks/models/qwen2p5-72b-instruct": (0.90, 0.90),
    },
    "deepinfra": {
        "meta-llama/Llama-3.3-70B-Instruct": (0.23, 0.40),
        "Qwen/Qwen2.5-72B-Instruct": (0.13, 0.40),
        "mistralai/Mistral-Small-24B-Instruct-2501": (0.05, 0.08),
    },
}


def _tokens(usage) -> tuple[int, int] | None:
    """(prompt_tokens, completion_tokens) da un usage eterogeneo, o None."""
    if not isinstance(usage, dict):
        return None
    pin = usage.get("prompt_tokens")
    if pin is None:
        pin = usage.get("input_tokens")
    pout = usage.get("completion_tokens")
    if pout is None:
        pout = usage.get("output_tokens")
    if pin is None and pout is None:
        return None
    try:
        return int(pin or 0), int(pout or 0)
    except (ValueError, TypeError):
        return None


def price_for(provider: str | None, model: str | None) -> tuple[float, float] | None:
    """Prezzo (in_per_M, out_per_M) per provider+model; fallback su match del
    solo nome modello tra tutti i provider. None se sconosciuto."""
    if model is None:
        return None
    table = PRICES_PER_M.get(provider or "", {})
    if model in table:
        return table[model]
    for prov_table in PRICES_PER_M.values():
        if model in prov_table:
            return prov_table[model]
    return None


def estimate_cost_usd(provider: str | None, model: str | None, usage) -> float | None:
    """Stima cost_usd dai token e dalla tabella prezzi. None se mancano token
    o il modello non e' a listino."""
    toks = _tokens(usage)
    if toks is None:
        return None
    price = price_for(provider, model)
    if price is None:
        return None
    pin, pout = toks
    in_m, out_m = price
    return round(pin / 1_000_000 * in_m + pout / 1_000_000 * out_m, 8)
