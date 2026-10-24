"""P3 spike (scripts/spikes/p3_*): PII engines, GLiNER ONNX glue and benchmark CLI.

No database, no network, no model download: GLiNER runs only when
``P3_MODELS_DIR`` holds the model and onnxruntime + tokenizers are installed.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from backend.privacy import PIICategory as C, PIISpan
from backend.privacy.corpus import generator as gen
from backend.privacy.corpus.benchmark import BENCH_CTX, RulesBaselineDetector, evaluate, load_corpus

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "spikes"))

import p3_gliner_onnx as G  # noqa: E402
import p3_pii_engines as E  # noqa: E402
from p3_holdout import holdout_records  # noqa: E402


def _found(det, text):
    return {(text[s.start:s.end], s.category) for s in det.detect_pii(text, BENCH_CTX)}


def test_resolve_overlaps_longest_then_specific_then_layer():
    spans = [PIISpan(0, 5, C.CITY, detector="ml"), PIISpan(0, 12, C.PERSON, detector="ml"),
             PIISpan(20, 30, C.DATE, detector="rules"), PIISpan(20, 30, C.BIRTH_DATE, detector="gazetteer"),
             PIISpan(40, 45, C.EMAIL, detector="rules"), PIISpan(40, 45, C.PERSON, detector="ml")]
    kept = [(s.start, s.end, s.category) for s in E.resolve_overlaps(spans)]
    assert kept == [(0, 12, C.PERSON), (20, 30, C.BIRTH_DATE), (40, 45, C.EMAIL)]


@pytest.mark.parametrize("text, expected", [
    ("La prof.ssa Fumagalli ha rimandato la verifica.", ("Fumagalli", C.PERSON)),
    ("Giulia Esposito ha preso 8 in latino.", ("Giulia Esposito", C.PERSON)),
    ("Frequento il Liceo Scientifico «Galilei» di Pisa.", ("Liceo Scientifico «Galilei»", C.SCHOOL)),
    ("Abito in Via delle Rose 12 a Lecce.", ("Via delle Rose 12", C.ADDRESS)),
    ("Sono nata il 3/4/2011 a Siena.", ("3/4/2011", C.BIRTH_DATE)),
    ("Matricola 482913, corso di Fisica.", ("482913", C.STUDENT_ID)),
    ("Ha una diagnosi di dislessia.", ("dislessia", C.HEALTH)),
])
def test_generic_gazetteer_patterns(text, expected):
    combined = E.UnionDetector(RulesBaselineDetector(), E.GazetteerDetector("generic"))
    assert expected in _found(combined, text)


def test_gazetteer_ignores_lowercase_and_unknown_words():
    det = E.GazetteerDetector("generic")
    assert _found(det, "oggi c'è il sole e la rosa è fiorita") == set()
    assert _found(det, "La palestra è chiusa per lavori fino a gennaio.") == set()


def test_holdout_is_well_formed_and_outside_generator_vocabulary():
    records = holdout_records()
    assert len(records) >= 30 and len({r["text"] for r in records}) == len(records)
    known = {n for n, _ in gen.FIRST_NAMES} | set(gen.SURNAMES)
    persons = [e["text"] for r in records for e in r["entities"] if e["category"] == "person"]
    assert len(persons) >= 20
    for rec in records:
        for ent in rec["entities"]:
            assert rec["text"][ent["start"]:ent["end"]] == ent["text"]
    assert not any(part in known for name in persons for part in name.split()), (
        "held-out names must not come from generator.py")
    corpus_texts = {r["text"] for r in load_corpus()}
    assert not corpus_texts & {r["text"] for r in records}


def test_rules_plus_gazetteer_floors_and_no_rule_regression():
    """Measured 2026-10-24 (report §4): the union must keep every rules hit."""
    corpus = load_corpus()
    rules = evaluate(RulesBaselineDetector(), corpus)["overlap"]["per_category"]
    union = evaluate(E.UnionDetector(RulesBaselineDetector(), E.GazetteerDetector("generic")), corpus)
    per = union["overlap"]["per_category"]
    for cat in ("email", "phone", "fiscal_code", "iban", "ip", "url", "social"):
        assert per[cat]["recall"] >= rules[cat]["recall"], cat
    assert per["person"]["recall"] >= 0.75 and per["school"]["recall"] >= 0.95
    assert union["any_category_overlap"]["recall"] >= 0.80
    assert union["by_tag_any_category"]["negativo"]["fp"] <= 10


def test_ollama_probe_reports_reason_instead_of_raising():
    det = E.OllamaNERDetector("http://127.0.0.1:9", "qwen3:0.6b")
    reason = det.probe(timeout=0.5)
    assert reason and "unreachable" in reason


def test_ollama_detector_maps_offsets_and_counts_failures(monkeypatch):
    from backend import pii_ner

    text = "Marco Rossi abita a Lecce. Marco Rossi gioca a calcio."
    monkeypatch.setattr(pii_ner, "_ner_entities",
                        lambda t, base, model: [("nome", "Marco Rossi"), ("citta", "Lecce")])
    det = E.OllamaNERDetector()
    got = [(s.start, s.end, s.category) for s in det.detect_pii(text, BENCH_CTX)]
    assert got == [(0, 11, C.PERSON), (20, 25, C.CITY), (27, 38, C.PERSON)]

    def boom(*a):
        raise TimeoutError

    monkeypatch.setattr(pii_ner, "_ner_entities", boom)
    assert det.detect_pii(text, BENCH_CTX) == [] and det.errors == 1


def test_gliner_word_split_matches_offsets():
    words = G.split_words("Ciao, sono Anna-Maria (3C)!")
    assert [w for w, _, _ in words] == ["Ciao", ",", "sono", "Anna-Maria", "(", "3C", ")", "!"]
    assert all("Ciao, sono Anna-Maria (3C)!"[s:e] == w for w, s, e in words)


def test_gliner_inputs_and_greedy_decoding():
    np = pytest.importorskip("numpy")
    # [CLS] <<ENT>> person <<SEP>> Mario Ros ##si va [SEP]: prompt = 3 words.
    word_ids = [None, 0, 1, 2, 3, 4, 4, 5, None]
    feeds = G.build_inputs(word_ids, list(range(9)), num_words=3, prompt_len=3, max_width=2)
    assert feeds["words_mask"].tolist() == [[0, 0, 0, 0, 1, 2, 0, 3, 0]]
    assert feeds["span_idx"].tolist() == [[[0, 0], [0, 1], [1, 1], [1, 2], [2, 2], [0, 0]]]
    assert feeds["span_mask"].tolist() == [[True, True, True, True, True, False]]
    assert feeds["text_lengths"].tolist() == [[3]]

    logits = np.full((1, 3, 2, 2), -10.0)
    logits[0, 0, 1, 0] = 3.0   # words 0-1, label 0 (best)
    logits[0, 1, 0, 1] = 1.0   # word 1 alone, label 1: overlaps the best, dropped
    logits[0, 2, 0, 1] = 0.5   # word 2, label 1
    logits[0, 2, 1, 0] = 9.0   # width past the end: ignored
    got = [(s, e, c) for s, e, c, _ in G.decode_spans(logits, 3, threshold=0.5)]
    assert got == [(0, 1, 0), (2, 2, 1)]


def test_benchmark_cli_reports_ok_and_skipped_engines(tmp_path):
    out = tmp_path / "p3.json"
    proc = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "spikes" / "p3_pii_benchmark.py"),
         "--engines", "rules,rules+gazetteer_generic,ollama_ner,gliner_pii_base",
         "--models", str(tmp_path / "no-models"), "--ollama-url", "http://127.0.0.1:9",
         "--limit", "40", "--out", str(out), "--markdown"],
        cwd=ROOT, capture_output=True, text=True, timeout=300)
    assert proc.returncode == 0, proc.stderr
    results = {r["engine"]: r for r in json.loads(out.read_text(encoding="utf-8"))["results"]}
    assert results["rules"]["status"] == results["rules+gazetteer_generic"]["status"] == "ok"
    assert results["rules"]["corpus"]["records"] == 40
    assert results["ollama_ner"]["status"] == "skipped"
    assert results["gliner_pii_base"]["status"] == "skipped"
    assert "| rules |" in proc.stderr
    dumped = out.read_text(encoding="utf-8")
    assert all(e["text"] not in dumped for r in load_corpus()[:40] for e in r["entities"] if len(e["text"]) > 6)


def _models_dir() -> Path | None:
    raw = os.environ.get("P3_MODELS_DIR")
    return Path(raw) if raw else None


@pytest.mark.skipif(not _models_dir(), reason="set P3_MODELS_DIR to run GLiNER on real weights")
@pytest.mark.parametrize("engine", sorted(set(E.GLINER_MODELS) - {"gliner_multi_pii_int8"}))  # int8: broken export
def test_gliner_onnx_finds_people_on_real_weights(engine):
    pytest.importorskip("onnxruntime")
    pytest.importorskip("tokenizers")
    subdir, onnx_file, _ = E.GLINER_MODELS[engine]
    if not (_models_dir() / subdir / onnx_file).is_file():
        pytest.skip(f"{engine} not downloaded")
    det = E.GlinerOnnxDetector(_models_dir() / subdir, onnx_file)
    found = _found(det, "Riccardo Ricci ha preso 6 nella verifica di scienze.")
    assert ("Riccardo Ricci", C.PERSON) in found
