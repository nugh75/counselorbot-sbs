"""LLM contradiction check of the prompt health page (phase 4, #763). Warnings only.

A model chosen by the owner in Administration (no default: nothing runs until
one is chosen) reads the assembled requests of the turns a prompt enters and
lists contradictions of meaning with exact quotes. Quotes are mapped back to
the prompt they come from, with positions for the red highlights of the
compare screen. Each answer is cached by the hash of check version, model,
language and request text, so an unchanged turn is never sent twice.

It runs when a prompt changes (after a save, in the background) or on
request; never at startup. «Proponi correzione» asks the same model to
rewrite only the conflicting sentences: the result is a proposal, never saved.
"""
from __future__ import annotations

import json
import logging
import re

from sqlalchemy.orm import Session

from . import models, prompt_health
from .model_pricing import price_for

logger = logging.getLogger(__name__)

CHECK_VERSION = 1
SETTING_KEYS = ("llm_contradiction_provider", "llm_contradiction_model")
MAX_CALLS_PER_RUN = 20
KEEP_RESULTS = 2000
MAX_OUTPUT_TOKENS = 1500
EXPECTED_OUTPUT_TOKENS = 400
CHARS_PER_TOKEN = 4
SEVERITIES = {prompt_health.HIGH, prompt_health.MEDIUM, prompt_health.LOW}
LANGUAGES = {"it": "Italian", "en": "English", "es": "Spanish", "fr": "French", "de": "German", "sv": "Swedish"}
REQUEST_PROMPT = "code:request"  # a quote found in the request but in no editable prompt

CHECK_SYSTEM = """You review the instructions an AI counsellor receives in one turn.
Find contradictions of meaning: two passages that cannot both be followed in the same reply
(for example a different number of questions, a format required and forbidden, opposite tones,
a strategy both required and excluded). Ignore repetitions, style and passages that only refine each other.

Answer with JSON only:
{"contradictions": [{"quote_a": "...", "quote_b": "...", "severity": "high|medium|low", "explanation": "..."}]}
- quote_a and quote_b are copied EXACTLY from the text, character by character, as short as possible (one sentence).
- severity: high when the reply will surely break one of the two, medium when likely, low when only possible.
- explanation: one sentence in {language}.
- No contradictions: {"contradictions": []}"""

PROPOSE_SYSTEM = """You fix a contradiction between prompt instructions of an AI counsellor.
Rewrite ONLY the sentences in conflict so that the instructions agree, keeping the language,
tone and intent of each prompt. Do not touch anything else.

Answer with JSON only:
{"edits": [{"prompt": "<prompt id>", "find": "<exact sentence from that prompt>", "replace": "<new sentence>"}]}
- find is copied EXACTLY from the prompt text.
- Use the fewest edits that remove the contradiction."""


class NotConfigured(Exception):
    """No model chosen: the LLM check never runs."""


# --- Settings -----------------------------------------------------------------------

def settings(db: Session) -> dict:
    rows = dict(db.query(models.Config.key, models.Config.value).filter(models.Config.key.in_(SETTING_KEYS)).all())
    provider = (rows.get(SETTING_KEYS[0]) or "").strip()
    model = (rows.get(SETTING_KEYS[1]) or "").strip()
    return {"provider": provider, "model": model, "configured": bool(provider and model)}


def save_settings(db: Session, provider: str, model: str) -> dict:
    for key, value in zip(SETTING_KEYS, (provider.strip(), model.strip())):
        row = db.get(models.Config, key)
        if row is None:
            db.add(models.Config(key=key, value=value, description="Prompt health: model of the LLM contradiction check"))
        else:
            row.value = value
    db.commit()
    return settings(db)


def available_providers(db: Session) -> list[str]:
    """Providers usable with the configured APIs (same rule as the other model pickers)."""
    from .ai_service import LOCAL_PROVIDERS, AIService, provider_available
    from .api_secrets import API_KEY_ENV_MAP
    config = AIService(db).config
    names = list(dict.fromkeys([*API_KEY_ENV_MAP, "omniroute", *sorted(LOCAL_PROVIDERS)]))
    return [name for name in names if provider_available(config, name)]


def _call_model(db: Session, provider: str, model: str, system: str, user: str) -> str:
    """The only place that reaches a model (replaced by a fake in the tests)."""
    from .ai_service import AIService
    return AIService(db).call_model(provider, model, user, system, max_tokens=MAX_OUTPUT_TOKENS, json_mode=True)


# --- Combinations ---------------------------------------------------------------------

def combinations(db: Session, prompt_ids=()) -> list[dict]:
    """Distinct assembled requests of the turns the prompts enter (every turn when none given)."""
    turns = prompt_health._turns_for(db, list(prompt_ids)) if prompt_ids else None
    if turns is None:
        turns = list(prompt_health._all_turns(db))
    groups: dict[str, dict] = {}
    for surface, payload in turns:
        try:
            with db.begin_nested():
                text = prompt_health.assembled_request(db, payload)
        except Exception as exc:  # reported by the static check as assembly_failed
            logger.info("Prompt health LLM: turn %s not assembled: %s", surface, type(exc).__name__)
            continue
        digest = prompt_health._digest(text)
        groups.setdefault(digest, {"hash": digest, "text": text, "surfaces": []})["surfaces"].append(surface)
    return list(groups.values())


def _cache_key(provider: str, model: str, language: str, text_hash: str) -> str:
    return prompt_health._digest(f"{CHECK_VERSION}|{provider}|{model}|{language}|{text_hash}")


def _cached(db: Session, keys) -> dict[str, models.PromptHealthLlmResult]:
    keys = list(keys)
    if not keys:
        return {}
    rows = db.query(models.PromptHealthLlmResult).filter(models.PromptHealthLlmResult.cache_key.in_(keys)).all()
    return {row.cache_key: row for row in rows}


def _language(language: str | None) -> str:
    return language if language in LANGUAGES else "it"


def estimate(db: Session, prompt_ids=(), language: str | None = None) -> dict:
    """Calls a run would make (the rest is cached), tokens and cost when the model is priced."""
    current = settings(db)
    language = _language(language)
    combos = combinations(db, prompt_ids)
    keys = {c["hash"]: _cache_key(current["provider"], current["model"], language, c["hash"]) for c in combos}
    cached = _cached(db, keys.values()) if current["configured"] else {}
    to_call = [c for c in combos if keys[c["hash"]] not in cached]
    input_tokens = sum((len(CHECK_SYSTEM) + len(c["text"])) // CHARS_PER_TOKEN for c in to_call)
    output_tokens = EXPECTED_OUTPUT_TOKENS * len(to_call)
    price = price_for(current["provider"], current["model"]) if current["configured"] else None
    cost = round(input_tokens / 1e6 * price[0] + output_tokens / 1e6 * price[1], 4) if price else None
    return {
        **current, "combinations": len(combos), "cached": len(combos) - len(to_call), "calls": len(to_call),
        "max_calls_per_run": MAX_CALLS_PER_RUN, "input_tokens": input_tokens, "output_tokens": output_tokens,
        "cost_usd": cost,
    }


# --- Answers ----------------------------------------------------------------------------

def _json_object(answer: str) -> dict:
    """The JSON object of an answer, also inside a code fence or after some text."""
    text = (answer or "").strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("no JSON object")
    value = json.loads(text[start:end + 1])
    if not isinstance(value, dict):
        raise ValueError("not an object")
    return value


def _in_text(quote: str, text: str) -> bool:
    return bool(quote) and (quote in text or quote.lower() in text.lower())


def _contradictions(answer: str, request_text: str) -> list[dict]:
    """Contradictions of an answer whose two quotes really are in the request."""
    items = _json_object(answer).get("contradictions")
    if not isinstance(items, list):
        raise ValueError("contradictions is not a list")
    out = []
    for item in items:
        if not isinstance(item, dict):
            continue
        a, b = str(item.get("quote_a") or "").strip(), str(item.get("quote_b") or "").strip()
        if not (_in_text(a, request_text) and _in_text(b, request_text)) or a == b:
            continue  # an invented or paraphrased quote cannot be highlighted
        severity = item.get("severity") if item.get("severity") in SEVERITIES else prompt_health.MEDIUM
        out.append({"quote_a": a, "quote_b": b, "severity": severity,
                    "explanation": str(item.get("explanation") or "").strip()[:600]})
    return out


def _with_sources(found: list[dict], texts: dict[str, str]) -> list[dict]:
    """Each quote tagged with the prompt it comes from, read when the model answered."""
    return [{**item, "prompt_a": _source(item["quote_a"], texts), "prompt_b": _source(item["quote_b"], texts)}
            for item in found]


def run(db: Session, prompt_ids=(), language: str | None = None) -> dict:
    """Ask the model about the turns not in the cache, at most MAX_CALLS_PER_RUN per run."""
    current = settings(db)
    if not current["configured"]:
        raise NotConfigured()
    language = _language(language)
    combos = combinations(db, prompt_ids)
    keys = {c["hash"]: _cache_key(current["provider"], current["model"], language, c["hash"]) for c in combos}
    cached = _cached(db, keys.values())
    to_call = [c for c in combos if keys[c["hash"]] not in cached]
    system = CHECK_SYSTEM.replace("{language}", LANGUAGES[language])
    texts = prompt_health.active_texts(db)
    calls = failed = 0
    for combo in to_call[:MAX_CALLS_PER_RUN]:
        try:
            answer = _call_model(db, current["provider"], current["model"], system, combo["text"])
            found = _with_sources(_contradictions(answer, combo["text"]), texts)
        except Exception as exc:  # the check never breaks a save: count it and go on
            failed += 1
            logger.warning("Prompt health LLM: %s on %s", type(exc).__name__, combo["surfaces"][0])
            continue
        calls += 1
        db.merge(models.PromptHealthLlmResult(cache_key=keys[combo["hash"]], provider=current["provider"],
                                              model=current["model"], surfaces=combo["surfaces"],
                                              contradictions=found))
        db.commit()
    _prune(db)
    return {
        **current, "calls": calls, "failed": failed, "cached": len(combos) - len(to_call),
        "remaining": max(0, len(to_call) - MAX_CALLS_PER_RUN), "combinations": len(combos),
        "findings": current_findings(db),
    }


def _prune(db: Session) -> None:
    stale = (db.query(models.PromptHealthLlmResult.cache_key)
             .order_by(models.PromptHealthLlmResult.created_at.desc()).offset(KEEP_RESULTS).all())
    if stale:
        db.query(models.PromptHealthLlmResult).filter(
            models.PromptHealthLlmResult.cache_key.in_([row.cache_key for row in stale])).delete(synchronize_session=False)
        db.commit()


# --- Findings -----------------------------------------------------------------------------

def _source(quote: str, texts: dict[str, str]) -> str:
    """The prompt a quote comes from: exact match first, then ignoring case."""
    for match in (lambda text: quote in text, lambda text: quote.lower() in text.lower()):
        for pid in sorted(texts):
            if texts[pid] and match(texts[pid]):
                return pid
    return REQUEST_PROMPT


def current_findings(db: Session, texts: dict[str, str] | None = None) -> list[dict]:
    """Cached contradictions still present in the current texts, merged across turns.

    A finding stays only while every quote is still in the prompt it came from:
    fixing either sentence makes it disappear without a new call. Quotes from
    the code-built part of the request (no prompt) cannot be fixed here.
    """
    texts = prompt_health.active_texts(db) if texts is None else texts
    merged: dict[str, dict] = {}
    rows = db.query(models.PromptHealthLlmResult).order_by(models.PromptHealthLlmResult.created_at.desc()).all()
    for row in rows:
        for item in row.contradictions or []:
            pa, pb = item.get("prompt_a", REQUEST_PROMPT), item.get("prompt_b", REQUEST_PROMPT)
            if pa == pb == REQUEST_PROMPT:
                continue  # neither quote is in a prompt the owner can change
            if any(pid != REQUEST_PROMPT and not _in_text(quote, texts.get(pid, ""))
                   for pid, quote in ((pa, item["quote_a"]), (pb, item["quote_b"]))):
                continue  # one of the sentences was changed: the contradiction is gone
            (p1, q1), (p2, q2) = sorted(((pa, item["quote_a"]), (pb, item["quote_b"])))
            finding = prompt_health._finding("llm_contradiction", item["severity"], [p1, p2],
                                             sentences=[{"prompt": p1, "text": q1}, {"prompt": p2, "text": q2}],
                                             params={"model": row.model})
            kept = merged.setdefault(finding["id"], {**finding, "params": {**finding["params"], "explanation": item["explanation"]}})
            kept["surfaces"].extend(s for s in row.surfaces or [] if s not in kept["surfaces"])
    findings = sorted(merged.values(), key=prompt_health._sort_key)
    return prompt_health.annotate(findings, texts)


# --- «Proponi correzione» -------------------------------------------------------------------

def propose(db: Session, *, sentences: list[dict], explanation: str, drafts: dict[str, str] | None = None) -> dict:
    """A rewrite of the conflicting sentences, as full texts before/after. Nothing is saved."""
    current = settings(db)
    if not current["configured"]:
        raise NotConfigured()
    drafts = drafts or {}
    saved = prompt_health.active_texts(db)
    ids = [s["prompt"] for s in sentences if s.get("prompt") in drafts or s.get("prompt") in saved]
    texts = {pid: drafts.get(pid, saved.get(pid, "")) for pid in dict.fromkeys(ids)}
    if not texts:
        raise LookupError("no editable prompt in the finding")
    user = "\n\n".join([
        "Contradiction: " + (explanation or "").strip(),
        "Sentences in conflict:\n" + "\n".join(f"- [{s['prompt']}] {s['text']}" for s in sentences),
        *[f"=== PROMPT {pid} ===\n{text}\n=== END {pid} ===" for pid, text in texts.items()],
    ])
    answer = _call_model(db, current["provider"], current["model"], PROPOSE_SYSTEM, user)
    after = dict(texts)
    for edit in _json_object(answer).get("edits") or []:
        if not isinstance(edit, dict):
            continue
        pid, find, replace = edit.get("prompt"), str(edit.get("find") or ""), str(edit.get("replace") or "")
        if pid in after and find and find in after[pid]:
            after[pid] = after[pid].replace(find, replace, 1)
    return {"proposals": [{"prompt_id": pid, "before": texts[pid], "after": after[pid]}
                          for pid in texts if after[pid] != texts[pid]],
            "model": current["model"]}


def run_after_change(session_factory, prompt_id: str) -> None:
    """Background check of a prompt just changed; only when a model is chosen."""
    db = session_factory()
    try:
        if settings(db)["configured"]:
            result = run(db, [prompt_id])
            logger.info("Prompt health LLM after change of %s: %s calls, %s failed", prompt_id, result["calls"], result["failed"])
    except Exception:
        db.rollback()
        logger.warning("Prompt health LLM check after change failed", exc_info=True)
    finally:
        db.close()
