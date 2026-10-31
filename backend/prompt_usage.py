"""Prompts used in real chat turns and defects of the real replies (#762, phase 3).

Every chat turn (guided, free, Telegram, Assistant, Compass) records which
registered prompts were assembled in its request, as registry ids and a short
hash of their text, never the text or the conversation. The final reply is
checked before it is saved by cheap detectors (no model call) and only their
outcome is stored:

- ``visible_json`` / ``visible_reasoning``: JSON or reasoning left in the reply;
- ``too_many_questions``: more questions than the turn's budget in the registry;
- ``strategies_in_factor_step``: advice where the active rules forbid it;
- ``wrong_language``: the reply is clearly in another language;
- ``missing_step_marker``: a closing reply (no question) without the end-of-step
  marker in a step whose rules require it.

The write runs in a background thread with its own session; a failure is
logged and never reaches the student. Rows older than the retention
(``PROMPT_USAGE_RETENTION_DAYS``, default 90) are deleted. Warnings only, shown
only in Administration.
"""
from __future__ import annotations

import hashlib
import inspect
import logging
import os
import re
import threading
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from importlib import import_module

from sqlalchemy.orm import Session

from . import models
from .prompt_registry import (
    AUXILIARY,
    REGISTRY,
    config_entry,
    factory_text,
    is_prompt_config_key,
)

logger = logging.getLogger(__name__)

DEFAULT_RETENTION_DAYS = 90
PURGE_EVERY_SECONDS = 3600
HASH_CHARS = 12

DEFECTS = (
    "visible_json", "visible_reasoning", "too_many_questions",
    "strategies_in_factor_step", "wrong_language", "missing_step_marker",
)


def retention_days() -> int:
    try:
        return max(1, int(os.environ.get("PROMPT_USAGE_RETENTION_DAYS", DEFAULT_RETENTION_DAYS)))
    except ValueError:
        return DEFAULT_RETENTION_DAYS


def _hash(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()[:HASH_CHARS]


# --- Which prompts are in a request --------------------------------------------------

def _probes(text: str) -> tuple[str | None, str | None]:
    """Opening and closing fragments of a text, outside placeholders."""
    text = (text or "").strip()
    first = text.split("\n", 1)[0].split("{", 1)[0].strip()[:60]
    last = text.rsplit("\n", 1)[-1].rsplit("}", 1)[-1].strip()[-60:]
    return (first if len(first) >= 15 else None), (last if len(last) >= 15 else None)


def _present(text: str, envelope: str) -> bool:
    first, last = _probes(text)
    if first is None:
        return False
    return first in envelope and (last is None or last in envelope)


@lru_cache(maxsize=None)
def _code_hash(entry_id: str) -> str:
    """Code prompts: hash of the function that builds them."""
    module_name, _, func_name = REGISTRY[entry_id].consumer.partition(":")
    try:
        return _hash(inspect.getsource(getattr(import_module(module_name), func_name)))
    except (OSError, TypeError, AttributeError, ImportError):
        return ""


@dataclass
class TurnPlan:
    surface: str
    instrument: str | None
    step: str | None
    language: str
    prompts: dict = field(default_factory=dict)   # prompt id -> hash
    question_budget: int | None = None
    strategies_forbidden: bool = False
    marker_required: bool = False


def plan_turn(surface: str, envelope: str, configs: dict, *, instrument: str | None = None,
              step: str | None = None, step_text: str | None = None, language: str = "it",
              always=()) -> TurnPlan:
    """Prompts present in an assembled request and the rules they impose.

    Pure: reads the configs already loaded for the turn, no query. `always`
    lists config keys known to be in the request (e.g. the system prompt key).
    """
    plan = TurnPlan(surface=surface, instrument=instrument, step=step, language=(language or "it")[:2].lower())
    envelope = envelope or ""
    seen = set()
    for key, value in configs.items():
        if not isinstance(key, str) or not is_prompt_config_key(key):
            continue
        entry = config_entry(key)
        if entry is None:
            continue
        seen.add(key)
        text = value or (factory_text(entry) if entry.empty_fallback else "") or ""
        if key in always or _present(text, envelope):
            plan.prompts[f"config:{key}"] = _hash(text)
    for entry in REGISTRY.values():
        if entry.family:
            continue
        if entry.kind == "config" and entry.key not in seen:
            text = factory_text(entry) or ""
            if entry.key in always or _present(text, envelope):
                plan.prompts[entry.id] = _hash(text)
        elif entry.kind == "code" and entry.marker and entry.marker in envelope:
            plan.prompts[entry.id] = _code_hash(entry.id)
    if step and step_text and _present(step_text, envelope):
        plan.prompts[f"guided_step:{step}"] = _hash(step_text)
    _apply_rules(plan, envelope)
    return plan


def _entry(prompt_id: str):
    kind, _, key = prompt_id.partition(":")
    if kind == "config":
        return config_entry(key)
    return REGISTRY.get(prompt_id)


def _apply_rules(plan: TurnPlan, envelope: str) -> None:
    """Rules of the recorded prompts whose sentence is in the request."""
    budgets, strategies, markers = [], set(), set()
    for prompt_id in plan.prompts:
        entry = _entry(prompt_id)
        for rule in (entry.rules if entry else ()):
            if rule.evidence not in envelope:
                continue
            if rule.field == "questions":
                budgets.append(rule.value[1])
            elif rule.field == "strategies":
                strategies.add(rule.value)
            elif rule.field == "step_marker":
                markers.add(rule.value)
    plan.question_budget = min(budgets) if budgets else None
    plan.strategies_forbidden = strategies == {"none"}
    plan.marker_required = markers == {"required"}


# --- Detectors (no model) -----------------------------------------------------------

_JSON_RE = re.compile(r"```json|^\s*[\{\[]\s*\"[\w \-]+\"\s*:", re.MULTILINE)
_REASONING_RE = re.compile(
    r"</?(?:think|thinking|reasoning|sto_pensando)>"
    r"|^\s*(?:reasoning|thinking|thought process|chain of thought|ragionamento)\s*:",
    re.IGNORECASE | re.MULTILINE,
)
_QUESTION_RE = re.compile(r"\?+(?=[\s\"'»”)\]*_]|$)")
_ADVICE_RE = re.compile(
    r"\b(?:ti consiglio|ti suggerisco|strategia pratica|ecco (?:alcune|qualche) strategi"
    r"|I (?:recommend|suggest)|here are (?:some )?strateg"
    r"|te recomiendo|te sugiero|je te conseille|je vous conseille|ich empfehle|jag rekommenderar)",
    re.IGNORECASE,
)
_WORD_RE = re.compile(r"[^\W\d_]+", re.UNICODE)
# Frequent words that belong to one language only among the six of the UI.
_STOPWORDS = {
    "it": {"il", "che", "di", "non", "per", "sono", "della", "nel", "anche", "perché", "più", "questo", "hai", "cosa", "gli", "questa"},
    "en": {"the", "and", "you", "that", "is", "of", "to", "what", "your", "this", "with", "are", "have", "how", "it", "for"},
    "es": {"el", "los", "las", "y", "por", "para", "es", "qué", "cómo", "más", "pero", "está", "usted", "muy", "también", "cuando"},
    "fr": {"le", "les", "des", "est", "et", "vous", "une", "pour", "dans", "pas", "qui", "sur", "avec", "ce", "je", "au"},
    "de": {"der", "die", "das", "und", "ist", "nicht", "ich", "sie", "mit", "zu", "ein", "eine", "auf", "für", "wie", "auch"},
    "sv": {"och", "att", "det", "är", "som", "på", "för", "med", "inte", "jag", "vad", "har", "av", "om", "kan", "hur"},
}
MIN_WORDS_FOR_LANGUAGE = 12


def count_questions(text: str) -> int:
    return len(_QUESTION_RE.findall(text or ""))


def detect_language(text: str) -> str | None:
    """The language of a reply when the evidence is clear, else None."""
    words = [w.lower() for w in _WORD_RE.findall(text or "")]
    if len(words) < MIN_WORDS_FOR_LANGUAGE:
        return None
    scores = {lang: sum(1 for w in words if w in stop) for lang, stop in _STOPWORDS.items()}
    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    (best, top), (_, second) = ranked[0], ranked[1]
    if top < 3 or top < 2 * second:
        return None
    return best


def detect_defects(plan: TurnPlan, reply: str, *, control_signals=(), strategy_ids=()) -> list[str]:
    reply = reply or ""
    if not reply.strip():
        return []
    defects = []
    if _JSON_RE.search(reply) or (reply.strip().startswith("{") and reply.strip().endswith("}")):
        defects.append("visible_json")
    if _REASONING_RE.search(reply):
        defects.append("visible_reasoning")
    questions = count_questions(reply)
    if plan.question_budget is not None and questions > plan.question_budget:
        defects.append("too_many_questions")
    if plan.strategies_forbidden and (strategy_ids or _ADVICE_RE.search(reply)):
        defects.append("strategies_in_factor_step")
    found = detect_language(reply)
    if found and plan.language in _STOPWORDS and found != plan.language:
        defects.append("wrong_language")
    if plan.marker_required and questions == 0 and "AVANZA_STEP" not in set(control_signals or ()):
        defects.append("missing_step_marker")
    return defects


# --- Write ----------------------------------------------------------------------------

def _spawn(target) -> None:
    threading.Thread(target=target, daemon=True, name="prompt-usage").start()


_last_purge = 0.0
_purge_lock = threading.Lock()


def purge(db: Session, *, now: datetime | None = None) -> int:
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=retention_days())
    deleted = db.query(models.PromptUsageTurn).filter(models.PromptUsageTurn.created_at < cutoff).delete(
        synchronize_session=False)
    db.commit()
    return deleted


def _write(row: dict) -> None:
    global _last_purge
    from .database import write_session
    db = write_session()
    try:
        db.add(models.PromptUsageTurn(**row))
        db.commit()
        with _purge_lock:
            due = time.monotonic() - _last_purge > PURGE_EVERY_SECONDS
            if due:
                _last_purge = time.monotonic()
        if due:
            purge(db)
    except Exception as exc:  # never reaches the student
        db.rollback()
        logger.warning("Prompt usage not recorded: %s", type(exc).__name__)
    finally:
        db.close()


def observe(plan: TurnPlan | None, reply: str, *, control_signals=(), strategy_ids=()) -> list[str]:
    """Check the final reply and record the turn in the background. Never raises."""
    if plan is None:
        return []
    try:
        defects = detect_defects(plan, reply, control_signals=control_signals, strategy_ids=strategy_ids)
        row = {
            "surface": plan.surface, "instrument": plan.instrument, "step": plan.step,
            "prompts": [[pid, digest] for pid, digest in sorted(plan.prompts.items())],
            "defects": defects,
        }
        _spawn(lambda: _write(row))
        return defects
    except Exception as exc:
        logger.warning("Prompt usage check failed: %s", type(exc).__name__)
        return []


def safe_plan(*args, **kwargs) -> TurnPlan | None:
    """`plan_turn` that never breaks a chat turn."""
    try:
        return plan_turn(*args, **kwargs)
    except Exception as exc:
        logger.warning("Prompt usage plan failed: %s", type(exc).__name__)
        return None


# --- Report for the prompt health page ------------------------------------------------

RECORDED_SURFACES = {"guided", "telegram", "free_chat", "assistant", "bussola"}


def expected_prompts(db: Session) -> list[str]:
    """Prompts a real turn can assemble: registered, not one-shot generators, steps in the database."""
    ids = [
        entry.id for entry in REGISTRY.values()
        if not entry.family and entry.kind != "guided_step"
        and set(entry.surfaces) & RECORDED_SURFACES and AUXILIARY not in entry.surfaces
    ]
    ids += [f"guided_step:{step_id}" for (step_id,) in db.query(models.GuidedStep.id).all()]
    return sorted(set(ids))


def _trend(total: int, turns: int, prev_total: int, prev_turns: int) -> str | None:
    if not prev_turns:
        return None
    rate, prev_rate = total / max(turns, 1), prev_total / prev_turns
    if abs(rate - prev_rate) < 1e-9:
        return "flat"
    return "up" if rate > prev_rate else "down"


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def report(db: Session, *, days: int = 30, now: datetime | None = None) -> dict:
    """Last use of each prompt, expected prompts unused in `days`, defects with trend.

    The trend compares the defect rate of the window with the window before it.
    """
    keep = retention_days()
    days = max(1, min(int(days), keep))
    now = now or datetime.now(timezone.utc)
    start, prev_start = now - timedelta(days=days), now - timedelta(days=2 * days)
    rows = (db.query(models.PromptUsageTurn.created_at, models.PromptUsageTurn.surface,
                     models.PromptUsageTurn.instrument, models.PromptUsageTurn.step,
                     models.PromptUsageTurn.prompts, models.PromptUsageTurn.defects)
            .filter(models.PromptUsageTurn.created_at >= now - timedelta(days=keep)).all())

    last_used: dict[str, datetime] = {}
    prompt_stats = defaultdict(lambda: {"uses": 0, "defects": Counter(), "prev_uses": 0, "prev_defects": 0})
    step_stats = defaultdict(lambda: {"turns": 0, "defects": Counter(), "prev_turns": 0, "prev_defects": 0})
    tracking_since, window_turns = None, 0
    for created_at, surface, instrument, step, prompts, defects in rows:
        created_at = _aware(created_at)
        tracking_since = created_at if tracking_since is None else min(tracking_since, created_at)
        ids = [pair[0] for pair in prompts or []]
        for pid in ids:
            if pid not in last_used or created_at > last_used[pid]:
                last_used[pid] = created_at
        defects = list(defects or [])
        skey = (surface, instrument, step)
        if created_at >= start:
            window_turns += 1
            step_stats[skey]["turns"] += 1
            step_stats[skey]["defects"].update(defects)
            for pid in ids:
                prompt_stats[pid]["uses"] += 1
                prompt_stats[pid]["defects"].update(defects)
        elif created_at >= prev_start:
            step_stats[skey]["prev_turns"] += 1
            step_stats[skey]["prev_defects"] += len(defects)
            for pid in ids:
                prompt_stats[pid]["prev_uses"] += 1
                prompt_stats[pid]["prev_defects"] += len(defects)

    def stat_row(stats, uses_key, prev_key):
        total = sum(stats["defects"].values())
        return {
            "defects": dict(stats["defects"]), "defects_total": total,
            "previous_total": stats["prev_defects"],
            "trend": _trend(total, stats[uses_key], stats["prev_defects"], stats[prev_key]),
        }

    prompts_out = [
        {"id": pid, "last_used": last_used[pid].isoformat(), "uses": prompt_stats[pid]["uses"],
         **stat_row(prompt_stats[pid], "uses", "prev_uses")}
        for pid in last_used
    ]
    prompts_out.sort(key=lambda p: (-p["defects_total"], p["id"]))
    steps_out = [
        {"surface": surface, "instrument": instrument, "step": step, "turns": stats["turns"],
         **stat_row(stats, "turns", "prev_turns")}
        for (surface, instrument, step), stats in step_stats.items() if stats["turns"] or stats["prev_turns"]
    ]
    steps_out.sort(key=lambda s: (-s["defects_total"], s["surface"] or "", s["instrument"] or "", s["step"] or ""))
    used_in_window = {pid for pid, stats in prompt_stats.items() if stats["uses"]}
    never_used = [pid for pid in expected_prompts(db) if pid not in used_in_window] if window_turns else []
    return {
        "days": days, "retention_days": keep, "turns": window_turns,
        "tracking_since": tracking_since.isoformat() if tracking_since else None,
        "partial": tracking_since is None or tracking_since > start,
        "prompts": prompts_out, "steps": steps_out, "never_used": never_used,
    }
