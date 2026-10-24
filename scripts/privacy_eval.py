#!/usr/bin/env python3
"""Run a PII detector on the synthetic Italian corpus and print a JSON report.

Usage: python3 scripts/privacy_eval.py [--detector rules] [--out report.json]
       [--repeats 5] [--summary]
The report holds only ids, categories, offsets and metrics (no corpus text).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.privacy.corpus.benchmark import DETECTORS, evaluate, load_corpus  # noqa: E402
from backend.privacy.corpus.generator import CORPUS_PATH  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--detector", choices=sorted(DETECTORS), default="rules")
    parser.add_argument("--corpus", type=Path, default=CORPUS_PATH)
    parser.add_argument("--repeats", type=int, default=3, help="best-of-N timing per sentence")
    parser.add_argument("--out", type=Path, help="write the JSON report here instead of stdout")
    parser.add_argument("--summary", action="store_true", help="also print a per-category table to stderr")
    args = parser.parse_args(argv)

    report = evaluate(DETECTORS[args.detector](), load_corpus(args.corpus),
                      repeats=max(1, args.repeats), name=args.detector)
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if args.out:
        args.out.write_text(payload + "\n", encoding="utf-8")
    else:
        print(payload)
    if args.summary:
        print(f"{'category':<14}{'support':>8}{'P':>8}{'R':>8}{'F1':>8}   (overlap)", file=sys.stderr)
        fmt = lambda v: f"{'-':>8}" if v is None else f"{v:>8.3f}"  # noqa: E731
        for cat, m in report["overlap"]["per_category"].items():
            print(f"{cat:<14}{m['support']:>8}{fmt(m['precision'])}{fmt(m['recall'])}{fmt(m['f1'])}",
                  file=sys.stderr)
        lat = report["latency"]
        print(f"latency mean {lat['mean_ms_per_sentence']} ms, p95 {lat['p95_ms']} ms, "
              f"{lat['us_per_char']} us/char", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
