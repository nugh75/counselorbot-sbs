"""P2 synthetic Italian corpus: integrity, synthetic identifiers and benchmark.

No database or provider: runs identically under either TEST_DB.
"""
from __future__ import annotations

import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

import pytest

from backend import pii
from backend.privacy import PIICategory, PIIDetector, PIISpan
from backend.privacy.corpus import generator as gen
from backend.privacy.corpus.benchmark import RulesBaselineDetector, evaluate, load_corpus

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def corpus() -> list[dict]:
    return load_corpus()


@pytest.fixture(scope="module")
def rules_report(corpus) -> dict:
    return evaluate(RulesBaselineDetector(), corpus, repeats=3)


def test_committed_corpus_matches_generator():
    assert gen.CORPUS_PATH.read_text(encoding="utf-8") == gen.dumps(gen.build_corpus()), (
        "regenerate with: python3 -m backend.privacy.corpus.generator")


def test_records_are_well_formed(corpus):
    assert len(corpus) >= 600
    assert len({r["id"] for r in corpus}) == len(corpus)
    assert len({r["text"] for r in corpus}) == len(corpus)
    labels = {f"[{label}_" for label in gen.PLACEHOLDER_LABELS.values()}
    for rec in corpus:
        last_end = 0
        for ent in rec["entities"]:
            assert PIICategory(ent["category"])
            assert 0 <= last_end <= ent["start"] < ent["end"] <= len(rec["text"])
            assert rec["text"][ent["start"]:ent["end"]] == ent["text"]
            assert any(ent["placeholder"].startswith(p) for p in labels)
            last_end = ent["end"]
        rebuilt, cursor = [], 0
        for ent in rec["entities"]:
            rebuilt += [rec["text"][cursor:ent["start"]], ent["placeholder"]]
            cursor = ent["end"]
        assert "".join(rebuilt) + rec["text"][cursor:] == rec["expected_pseudonymized"]


def test_same_value_same_placeholder_within_record(corpus):
    for rec in corpus:
        by_value: dict[tuple[str, str], set[str]] = {}
        for ent in rec["entities"]:
            by_value.setdefault((ent["category"], ent["text"]), set()).add(ent["placeholder"])
        assert all(len(p) == 1 for p in by_value.values())
        assert len({frozenset(p) for p in by_value.values()}) == len(by_value)


def test_coverage_of_categories_and_edge_cases(corpus):
    cats = Counter(e["category"] for r in corpus for e in r["entities"])
    for cat in ("person", "fiscal_code", "phone", "email", "address", "city", "school",
                "health", "art9_other", "birth_date"):
        assert cats[cat] >= 20, cat
    for cat in ("region", "organization", "iban", "id_document", "student_id", "social", "url", "ip"):
        assert cats[cat] >= 10, cat
    tags = Counter(t for r in corpus for t in r["tags"])
    for tag in ("ambiguo", "negativo", "typo", "punteggiatura", "gergo", "combinazione",
                "indiretto", "registro", "disciplina", "relazioni", "salute"):
        assert tags[tag] >= 5, tag
    assert all(not r["entities"] for r in corpus if "negativo" in r["tags"])
    assert all(r["quasi_identifiers"] >= 3 for r in corpus if "combinazione" in r["tags"])


def test_fiscal_code_algorithm_known_vector_and_corpus_validity(corpus):
    from datetime import date

    # Textbook example: Mario Rossi, male, born 1 Jan 1980 in Rome.
    assert gen.fiscal_code("Mario", "Rossi", "M", date(1980, 1, 1), "H501") == "RSSMRA80A01H501U"
    assert gen.fiscal_code("Maria", "Rossi", "F", date(1980, 1, 1), "H501")[9:11] == "41"
    # Name with >= 4 consonants takes 1st, 3rd, 4th; accents and apostrophes dropped.
    assert gen.fiscal_code("Niccolò", "D'Angelo", "M", date(2010, 5, 3), "F205").startswith("DNGNCL")
    codes = [e["text"] for r in corpus for e in r["entities"]
             if e["category"] == "fiscal_code" and "typo" not in r["tags"]]
    assert len(codes) >= 30
    assert all(len(c) == 16 and pii._cf_checksum_valid(c) for c in codes)
    for c in (e["text"] for r in corpus for e in r["entities"] if e["category"] == "fiscal_code"):
        compact = c.replace(" ", "").upper()
        assert pii._cf_checksum_valid(compact)


def test_ibans_valid_and_contacts_use_reserved_domains(corpus):
    ents = [e for r in corpus for e in r["entities"]]
    ibans = [e["text"] for e in ents if e["category"] == "iban"]
    assert ibans and all(i.startswith("IT") and len(i) == 27 and pii._iban_mod97_valid(i) for i in ibans)
    emails = [e["text"].lower() for e in ents if e["category"] == "email" and "@" in e["text"]]
    assert emails and all(e.rsplit("@", 1)[1] in gen.EMAIL_DOMAINS
                          or e.rsplit("@", 1)[1].endswith(".example") for e in emails)
    assert all(e["text"].startswith("192.0.2.") for e in ents if e["category"] == "ip")


def test_metrics_math_with_oracle_and_empty_detectors(corpus):
    class Oracle:
        def __init__(self):
            self.gold = {r["text"]: r["entities"] for r in corpus}

        def detect_pii(self, text, ctx):
            return [PIISpan(e["start"], e["end"], PIICategory(e["category"])) for e in self.gold[text]]

    class Empty:
        def detect_pii(self, text, ctx):
            return []

    assert isinstance(Oracle(), PIIDetector)
    perfect = evaluate(Oracle(), corpus)
    assert perfect["exact"]["micro"]["f1"] == perfect["any_category_overlap"]["recall"] == 1.0
    assert all(m["precision"] == m["recall"] == 1.0 for m in perfect["exact"]["per_category"].values())
    assert perfect["false_negatives"] == []
    empty = evaluate(Empty(), corpus)
    assert empty["overlap"]["micro"]["recall"] == 0.0
    assert empty["overlap"]["micro"]["precision"] is None
    assert len(empty["false_negatives"]) == empty["entities"]


def test_overlap_matching_counts_partial_span_but_exact_does_not():
    rec = [{"id": "x", "text": "ha la certificazione DSA", "tags": ["salute"],
            "entities": [{"start": 6, "end": 24, "category": "health", "text": "certificazione DSA"}]}]

    class Partial:
        def detect_pii(self, text, ctx):
            return [PIISpan(21, 24, PIICategory.HEALTH)]

    report = evaluate(Partial(), rec)
    assert report["overlap"]["per_category"]["health"]["tp"] == 1
    assert report["exact"]["per_category"]["health"]["fn"] == 1
    assert report["exact"]["per_category"]["health"]["fp"] == 1


def test_rules_baseline_regression_floors(rules_report):
    """Floors measured on 2026-10-24 for backend/pii.py; P3/P4 must not regress."""
    per = rules_report["overlap"]["per_category"]
    assert per["email"]["recall"] >= 0.95 and per["email"]["precision"] == 1.0
    assert per["iban"]["recall"] == per["ip"]["recall"] == 1.0
    assert per["fiscal_code"]["recall"] >= 0.70 and per["fiscal_code"]["precision"] == 1.0
    assert per["phone"]["recall"] >= 0.60
    assert per["health"]["recall"] >= 0.50
    assert rules_report["by_tag_any_category"]["negativo"]["fp"] == 0
    # Known gaps of the regex engine, documented for P3: no names, schools, places.
    assert per["person"]["recall"] == 0.0


def test_report_never_contains_corpus_text(corpus, rules_report):
    dumped = json.dumps(rules_report, ensure_ascii=False)
    for rec in corpus[:50]:
        for ent in rec["entities"]:
            if len(ent["text"]) > 6:
                assert ent["text"] not in dumped


def test_rules_latency_budget(rules_report):
    lat = rules_report["latency"]
    assert lat["p95_ms"] < 5.0, lat
    assert lat["mean_ms_per_sentence"] < 2.0, lat


def test_cli_writes_json_report(tmp_path):
    out = tmp_path / "report.json"
    proc = subprocess.run([sys.executable, str(ROOT / "scripts" / "privacy_eval.py"), "--repeats", "1",
                           "--out", str(out), "--summary"],
                          cwd=ROOT, capture_output=True, text=True, timeout=120)
    assert proc.returncode == 0, proc.stderr
    report = json.loads(out.read_text(encoding="utf-8"))
    assert report["detector"] == "rules" and report["records"] >= 600
    assert "fiscal_code" in proc.stderr
