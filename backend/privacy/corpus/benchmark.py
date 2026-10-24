"""PII detection benchmark on the synthetic corpus (P2).

``evaluate`` runs any ``PIIDetector`` and returns a JSON-serializable report:
precision/recall/F1 per category (exact and overlap matching), a
category-agnostic overlap score (is the text protected at all?), recall per
tag, false negatives by record id and latency per sentence. Reports never
contain corpus text, only ids, categories and offsets.
"""
from __future__ import annotations

import json
import statistics
import time
from pathlib import Path
from typing import Callable, Iterable, Sequence

from ..types import PIICategory, PIIDetector, PIISpan, Principal, PrivacyContext, PrivacyRole
from .generator import CORPUS_PATH

BENCH_CTX = PrivacyContext(
    Principal("benchmark", PrivacyRole.SYSTEM, "local", "local"),
    None, "benchmark", "privacy-corpus-benchmark", "it",
)

# backend/pii.py type -> PIICategory (identity documents of other countries
# and vehicle plates have no finer category in the P1 contract).
_RULE_CATEGORIES = {
    "email": PIICategory.EMAIL, "telefono": PIICategory.PHONE, "cf": PIICategory.FISCAL_CODE,
    "iban": PIICategory.IBAN, "url": PIICategory.URL, "ip": PIICategory.IP,
    "social": PIICategory.SOCIAL, "data": PIICategory.DATE, "salute": PIICategory.HEALTH,
    "piva": PIICategory.ID_DOCUMENT, "card": PIICategory.ID_DOCUMENT,
    "targa": PIICategory.ID_DOCUMENT, "dni": PIICategory.ID_DOCUMENT,
    "nir": PIICategory.ID_DOCUMENT, "nino": PIICategory.ID_DOCUMENT,
    "personnummer": PIICategory.ID_DOCUMENT,
}


class RulesBaselineDetector:
    """Current regex engine (``backend/pii.py``) with offsets, as P3 baseline."""

    name = "rules"

    def detect_pii(self, text: str, ctx: PrivacyContext) -> list[PIISpan]:
        from backend import pii

        claimed: list[tuple[int, int]] = []
        spans: list[PIISpan] = []
        # Same priority and overlap rule as pii.find_pii, which drops offsets.
        for ptype, regex, validator in pii._DETECTORS:
            for m in regex.finditer(text):
                if validator is not None and not validator(m.group(0)):
                    continue
                start, end = m.span()
                if any(start < c_end and end > c_start for c_start, c_end in claimed):
                    continue
                claimed.append((start, end))
                spans.append(PIISpan(start, end, _RULE_CATEGORIES[ptype]))
        return sorted(spans, key=lambda s: s.start)


DETECTORS: dict[str, Callable[[], PIIDetector]] = {"rules": RulesBaselineDetector}


def load_corpus(path: Path = CORPUS_PATH) -> list[dict]:
    with open(path, encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def _match(gold: Sequence[dict], pred: Sequence[PIISpan], *, exact: bool,
           by_category: bool) -> tuple[list[bool], list[bool]]:
    """Greedy one-to-one matching; returns matched flags for gold and pred."""
    gold_hit, pred_hit = [False] * len(gold), [False] * len(pred)
    for gi, g in enumerate(gold):
        for pi, p in enumerate(pred):
            if pred_hit[pi] or (by_category and p.category.value != g["category"]):
                continue
            if (p.start == g["start"] and p.end == g["end"]) if exact else (
                    p.start < g["end"] and p.end > g["start"]):
                gold_hit[gi] = pred_hit[pi] = True
                break
    return gold_hit, pred_hit


def _prf(tp: int, fp: int, fn: int) -> dict:
    """Undefined ratios (no predictions / no gold) are ``None``, not 0 or 1."""
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / (tp + fn) if tp + fn else None
    if precision is None or recall is None:
        f1 = None
    else:
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    rnd = lambda v: None if v is None else round(v, 4)  # noqa: E731
    return {"tp": tp, "fp": fp, "fn": fn, "support": tp + fn,
            "precision": rnd(precision), "recall": rnd(recall), "f1": rnd(f1)}


def _percentile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(round(q * (len(ordered) - 1))))]


def evaluate(detector: PIIDetector, records: Iterable[dict], *, ctx: PrivacyContext = BENCH_CTX,
             repeats: int = 1, name: str | None = None) -> dict:
    records = list(records)
    counts = {mode: {} for mode in ("exact", "overlap")}
    any_cat = [0, 0, 0]
    tags: dict[str, list[int]] = {}
    false_negatives: list[dict] = []
    latencies_ms: list[float] = []
    total_chars = 0

    for rec in records:
        text, gold = rec["text"], rec["entities"]
        best = float("inf")
        for _ in range(repeats):
            t0 = time.perf_counter_ns()
            pred = detector.detect_pii(text, ctx)
            best = min(best, (time.perf_counter_ns() - t0) / 1e6)
        latencies_ms.append(best)
        total_chars += len(text)

        for mode in counts:
            gold_hit, pred_hit = _match(gold, pred, exact=mode == "exact", by_category=True)
            for g, hit in zip(gold, gold_hit):
                c = counts[mode].setdefault(g["category"], [0, 0, 0])
                c[0 if hit else 2] += 1
                if mode == "overlap" and not hit:
                    false_negatives.append({"id": rec["id"], "category": g["category"],
                                            "start": g["start"], "end": g["end"]})
            for p, hit in zip(pred, pred_hit):
                if not hit:
                    counts[mode].setdefault(p.category.value, [0, 0, 0])[1] += 1

        gold_hit, pred_hit = _match(gold, pred, exact=False, by_category=False)
        any_cat[0] += sum(gold_hit)
        any_cat[1] += pred_hit.count(False)
        any_cat[2] += gold_hit.count(False)
        for tag in rec["tags"]:
            t = tags.setdefault(tag, [0, 0, 0])
            t[0] += sum(gold_hit)
            t[1] += pred_hit.count(False)
            t[2] += gold_hit.count(False)

    def table(mode: str) -> dict:
        per = {cat: _prf(*c) for cat, c in sorted(counts[mode].items())}
        totals = [sum(c[i] for c in counts[mode].values()) for i in range(3)]
        return {"per_category": per, "micro": _prf(*totals)}

    total_ms = sum(latencies_ms)
    return {
        "detector": name or getattr(detector, "name", type(detector).__name__),
        "records": len(records),
        "entities": sum(len(r["entities"]) for r in records),
        "exact": table("exact"),
        "overlap": table("overlap"),
        "any_category_overlap": _prf(*any_cat),
        "by_tag_any_category": {tag: _prf(*c) for tag, c in sorted(tags.items())},
        "false_negatives": false_negatives,
        "latency": {
            "repeats": repeats,
            "mean_ms_per_sentence": round(statistics.fmean(latencies_ms), 4) if records else 0.0,
            "p50_ms": round(_percentile(latencies_ms, 0.5), 4) if records else 0.0,
            "p95_ms": round(_percentile(latencies_ms, 0.95), 4) if records else 0.0,
            "max_ms": round(max(latencies_ms), 4) if records else 0.0,
            "us_per_char": round(total_ms * 1000 / total_chars, 4) if total_chars else 0.0,
        },
    }
