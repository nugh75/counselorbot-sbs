#!/usr/bin/env python3
"""P3 spike: compare PII engines on the P2 corpus and the P3 held-out set.

Each engine runs in its own subprocess so RAM is measured per engine.
Unavailable engines (Ollama down, model files missing, onnxruntime or
tokenizers not installed) are reported as ``skipped`` with a reason.

Usage (repository root):
    python3 scripts/spikes/p3_pii_benchmark.py --models ~/p3-models --out report.json --markdown
    python3 scripts/spikes/p3_pii_benchmark.py --engines rules,rules+gazetteer_generic
Models: see docs/privacy/spikes/p3-pii-engine.md §2 (download commands).
Reports hold ids, categories and metrics only, never corpus text.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import p3_pii_engines as E  # noqa: E402
from backend.privacy.corpus.benchmark import BENCH_CTX, evaluate, load_corpus  # noqa: E402
from p3_holdout import holdout_records  # noqa: E402

DEFAULT_MODELS = Path(os.environ.get("P3_MODELS_DIR", Path.home() / ".cache" / "counselorbot" / "p3-models"))
ENGINES = [
    "rules", "gazetteer_generic", "rules+gazetteer_generic", "rules+gazetteer_roster",
    "ollama_ner", "rules+gazetteer_generic+ollama_ner",
    "gliner_multi_pii", "gliner_multi_pii_fp16", "gliner_multi_pii_int8", "gliner_pii_base",
    "rules+gazetteer_generic+gliner_multi_pii_fp16", "rules+gazetteer_generic+gliner_pii_base",
]


class Skip(Exception):
    pass


def build_layer(name: str, models: Path, threshold: float, ollama_url: str, ollama_model: str):
    if name == "rules":
        return E.RulesBaselineDetector()
    if name.startswith("gazetteer_"):
        return E.GazetteerDetector(name.split("_", 1)[1])
    if name == "ollama_ner":
        det = E.OllamaNERDetector(ollama_url, ollama_model)
        reason = det.probe()
        if reason:
            raise Skip(reason)
        return det
    if name in E.GLINER_MODELS:
        subdir, onnx_file, _ = E.GLINER_MODELS[name]
        path = models / subdir / onnx_file
        if not path.is_file():
            raise Skip(f"model file missing: {path}")
        try:
            return E.GlinerOnnxDetector(models / subdir, onnx_file, threshold=threshold, name=name)
        except ImportError as exc:
            raise Skip(f"optional dependency missing: {exc.name}") from None
    raise SystemExit(f"unknown engine layer: {name}")


def disk_mb(name: str, models: Path) -> float:
    total = 0
    for layer in name.split("+"):
        if layer in E.GLINER_MODELS:
            subdir, onnx_file, _ = E.GLINER_MODELS[layer]
            for f in (onnx_file, "tokenizer.json", "gliner_config.json"):
                p = models / subdir / f
                total += p.stat().st_size if p.is_file() else 0
    return round(total / 2**20, 1)


def rss_mb() -> float:
    try:
        import psutil

        return psutil.Process().memory_info().rss / 2**20
    except ImportError:
        import resource

        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return peak / 2**20 if sys.platform == "darwin" else peak / 1024


def peak_rss_mb() -> float | None:
    try:
        import resource
    except ImportError:  # Windows
        return None
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return round(peak / 2**20 if sys.platform == "darwin" else peak / 1024, 1)


def compact(report: dict) -> dict:
    """Drop per-record false negatives; keep counts by category."""
    fns: dict[str, int] = {}
    for fn in report.pop("false_negatives"):
        fns[fn["category"]] = fns.get(fn["category"], 0) + 1
    report["false_negatives_by_category"] = dict(sorted(fns.items()))
    return report


class CachedDetector:
    """Memoizes predictions so masking coverage reuses the timed ML run."""

    def __init__(self, inner):
        self.inner, self.name, self.cache = inner, getattr(inner, "name", None), {}

    def detect_pii(self, text, ctx):
        if text not in self.cache:
            self.cache[text] = self.inner.detect_pii(text, ctx)
        return self.cache[text]


def masking(det, records: list[dict]) -> dict:
    """Share of gold entities whose whole value lies inside one predicted span
    (any category): the value cannot leak, whatever label it got. Stricter
    than overlap, looser than exact; one span over «Mario Rossi» covers two
    adjacent gold entities, which 1:1 matching counts as a miss."""
    total, covered, per = 0, 0, {}
    for rec in records:
        pred = det.detect_pii(rec["text"], BENCH_CTX)
        for ent in rec["entities"]:
            hit = any(p.start <= ent["start"] and p.end >= ent["end"] for p in pred)
            total, covered = total + 1, covered + hit
            c = per.setdefault(ent["category"], [0, 0])
            c[0], c[1] = c[0] + 1, c[1] + hit
    return {"all": round(covered / total, 4) if total else None,
            "per_category": {k: round(v[1] / v[0], 4) for k, v in sorted(per.items())}}


def run_worker(args) -> dict:
    name = args.worker
    out: dict = {"engine": name, "disk_mb": disk_mb(name, args.models)}
    rss0 = rss_mb()
    t0 = time.perf_counter()
    try:
        layers = [build_layer(n, args.models, args.threshold, args.ollama_url, args.ollama_model)
                  for n in name.split("+")]
    except Skip as exc:
        return {**out, "status": "skipped", "reason": str(exc)}
    det = layers[0] if len(layers) == 1 else E.UnionDetector(*layers, name=name)
    out["load_s"] = round(time.perf_counter() - t0, 2)
    out["rss_load_mb"] = round(rss_mb() - rss0, 1)
    corpus = load_corpus()
    if args.limit:
        corpus = corpus[: args.limit]
    repeats = 1 if any(n in E.GLINER_MODELS or n == "ollama_ner" for n in name.split("+")) else 3
    for key, records in (("corpus", corpus), ("holdout", holdout_records())):
        # Best-of-N timing needs real calls; single runs feed the cache.
        cached = CachedDetector(det)
        out[key] = compact(evaluate(det if repeats > 1 else cached, records, repeats=repeats, name=name))
        out[key]["fully_masked"] = masking(cached, records)
    out["rss_total_mb"] = round(rss_mb(), 1)
    out["peak_rss_mb"] = peak_rss_mb()
    out["ollama_errors"] = sum(getattr(layer, "errors", 0) for layer in layers)
    out["status"] = "ok"
    return out


def run_engine(name: str, args) -> dict:
    cmd = [sys.executable, str(Path(__file__).resolve()), "--worker", name, "--models", str(args.models),
           "--threshold", str(args.threshold), "--limit", str(args.limit or 0),
           "--ollama-url", args.ollama_url, "--ollama-model", args.ollama_model]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
    if proc.returncode != 0:
        return {"engine": name, "status": "error", "reason": proc.stderr.strip().splitlines()[-1:]}
    return json.loads(proc.stdout)


def _f(v) -> str:
    return "–" if v is None else f"{v:.2f}"


def markdown(results: list[dict]) -> str:
    cats = ["person", "school", "city", "address", "health", "phone", "fiscal_code", "email"]
    lines = [
        "| motore | P | R | F1 | copertura | " + " | ".join(f"R {c}" for c in cats)
        + " | R holdout | mascherati (persone) | mascherati holdout | ms/frase (p95) | RSS picco MB | disco MB |",
        "|---|" + "---|" * (len(cats) + 10),
    ]
    for r in results:
        if r["status"] != "ok":
            lines.append(f"| {r['engine']} | {r['status']}: {r.get('reason')} |" + " |" * (len(cats) + 9))
            continue
        c, h = r["corpus"], r["holdout"]
        per = c["overlap"]["per_category"]
        lat = c["latency"]
        lines.append(
            f"| {r['engine']} | {_f(c['overlap']['micro']['precision'])} | {_f(c['overlap']['micro']['recall'])} "
            f"| {_f(c['overlap']['micro']['f1'])} | {_f(c['any_category_overlap']['recall'])} | "
            + " | ".join(_f(per.get(cat, {}).get("recall")) for cat in cats)
            + f" | {_f(h['overlap']['micro']['recall'])} | {_f(c['fully_masked']['all'])} "
            f"({_f(c['fully_masked']['per_category'].get('person'))}) | {_f(h['fully_masked']['all'])} "
            f"| {lat['mean_ms_per_sentence']:.2f} ({lat['p95_ms']:.1f}) "
            f"| {r['peak_rss_mb'] or '–'} | {r['disk_mb']:.0f} |")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--engines", default=",".join(ENGINES))
    parser.add_argument("--models", type=Path, default=DEFAULT_MODELS)
    parser.add_argument("--threshold", type=float, default=0.5, help="GLiNER score threshold")
    parser.add_argument("--limit", type=int, default=0, help="first N corpus sentences only (0 = all)")
    parser.add_argument("--ollama-url", default="http://localhost:11434")
    parser.add_argument("--ollama-model", default="qwen3:0.6b")
    parser.add_argument("--out", type=Path)
    parser.add_argument("--markdown", action="store_true", help="print the summary table to stderr")
    parser.add_argument("--worker", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    if args.worker:
        print(json.dumps(run_worker(args), ensure_ascii=False))
        return 0
    results = [run_engine(name, args) for name in args.engines.split(",") if name]
    payload = json.dumps({"threshold": args.threshold, "results": results}, ensure_ascii=False, indent=2)
    if args.out:
        args.out.write_text(payload + "\n", encoding="utf-8")
    else:
        print(payload)
    if args.markdown:
        print(markdown(results), file=sys.stderr)
    return 0 if all(r["status"] in ("ok", "skipped") for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
