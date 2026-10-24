"""P4: local detection (rules + gazetteer + GLiNER) and per-scope pseudonymization.

No database and no network. Unit tests use a fake ML layer; the acceptance
thresholds of P3 §7 run on the real model only when ``PRIVACY_PII_MODEL_DIR``
holds ``gliner_multi_pii-v1`` (fp16) and onnxruntime + tokenizers are installed.
"""
from __future__ import annotations

import importlib.util
import os
import re
import sys
from pathlib import Path

import pytest

from backend import privacy as p
from backend.privacy import PIICategory as C, PIISpan
from backend.privacy.corpus.benchmark import BENCH_CTX, RulesBaselineDetector, load_corpus
from backend.privacy.detect import (
    GazetteerLayer, GlinerLayer, LocalPIIDetector, RulesLayer, SchoolContext, fuse,
)
from backend.privacy.gliner_onnx import windows
from backend.privacy.pseudonymization import (
    InMemoryMapStore, PseudonymizationEngine, ScopeMap, neutralize, normalize,
)

ROOT = Path(__file__).resolve().parents[2]


class FakeML:
    """Finds fixed substrings; ``calls`` counts detections."""

    name = "ml"

    def __init__(self, entities: dict[str, C] | None = None, *, fail: bool = False):
        self.entities, self.fail, self.calls = entities or {}, fail, 0

    def detect_pii(self, text, ctx):
        self.calls += 1
        if self.fail:
            raise RuntimeError("onnx exploded with Mario Rossi inside")
        out = []
        for value, cat in self.entities.items():
            start = text.find(value)
            while start >= 0:
                out.append(PIISpan(start, start + len(value), cat, score=0.9, detector="ml"))
                start = text.find(value, start + 1)
        return out


def _ctx(scope="conv-1", locale="it", subject="stud1"):
    principal = p.Principal(subject, p.PrivacyRole.STUDENT, "local", "local")
    return p.PrivacyContext(principal, subject, "guided_chat", scope, locale)


ALLOW = lambda ctx: p.Decision(True, "ok")  # noqa: E731
REPLACE_ALL = p.CategoryPolicy({c: "replace" for c in C})


def _engine(entities=None, *, context=None, authorize=ALLOW, store=None):
    det = LocalPIIDetector(FakeML(entities), context=context)
    return PseudonymizationEngine(det, authorize=authorize, store=store)


def _found(spans, text):
    return {(text[s.start:s.end], s.category) for s in spans}


# --- fusion ---------------------------------------------------------------------------
def test_fuse_keeps_authoritative_rules_whole_and_trims_ml():
    text = "Mario Rossi 334.021.9776 ok"
    spans = [PIISpan(0, 24, C.PERSON, detector="ml"), PIISpan(12, 24, C.PHONE)]
    assert _found(fuse(text, spans), text) == {("Mario Rossi", C.PERSON), ("334.021.9776", C.PHONE)}


def test_fuse_never_drops_uncovered_part_of_an_overlap():
    text = "Liceo Volta Mario"
    spans = [PIISpan(0, 11, C.SCHOOL, detector="gazetteer"), PIISpan(6, 17, C.PERSON, detector="ml")]
    kept = fuse(text, spans)
    covered = {i for s in kept for i in range(s.start, s.end)}
    assert covered >= set(range(0, 11)) | set(range(12, 17))
    assert all(a.end <= b.start for a, b in zip(kept, kept[1:]))


def test_fuse_prefers_specific_category_over_date_and_earlier_layer():
    text = "nato il 03/04/2011"
    spans = [PIISpan(8, 18, C.DATE), PIISpan(8, 18, C.BIRTH_DATE, detector="gazetteer"),
             PIISpan(8, 18, C.BIRTH_DATE, detector="ml")]
    [only] = fuse(text, spans)
    assert (only.category, only.detector) == (C.BIRTH_DATE, "gazetteer")


# --- strato 1: regole -------------------------------------------------------------------
@pytest.mark.parametrize("text, value, cat", [
    ("chiamami al 334.021.9776 dopo cena", "334.021.9776", C.PHONE),
    ("il fisso è 081/73773", "081/73773", C.PHONE),
    ("numero (+39) 392/2027267", "(+39) 392/2027267", C.PHONE),
    ("cell 388 30 36 747 grazie", "388 30 36 747", C.PHONE),
    ("scrivi 348/558.85.14", "348/558.85.14", C.PHONE),
    ("chiamami al3478876543!!!", "3478876543", C.PHONE),
    ("tre tre nove uno due tre quattro cinque sei sette", "tre tre nove uno due tre quattro cinque sei sette",
     C.PHONE),
    ("cf: RSS MRC 09A12 H501 T", "RSS MRC 09A12 H501 T", C.FISCAL_CODE),
    ("marco punto russo chiocciola mail.example.com", "marco punto russo chiocciola mail.example.com",
     C.EMAIL),
])
def test_rules_cover_forms_missed_by_pii_py(text, value, cat):
    spans = fuse(text, RulesLayer().detect_pii(text, BENCH_CTX))
    assert (value, cat) in _found(spans, text)


def test_rules_lowercase_fiscal_codes_of_the_corpus_are_validated():
    # every lowercase/spaced fiscal code of the corpus has a valid checksum
    for rec in load_corpus():
        for ent in rec["entities"]:
            if ent["category"] == "fiscal_code":
                spans = RulesLayer().detect_pii(rec["text"], BENCH_CTX)
                assert any(s.start <= ent["start"] and s.end >= ent["end"] and s.category is C.FISCAL_CODE
                           for s in spans), rec["id"]


def test_rules_reject_fiscal_code_with_bad_checksum_and_dates_as_phones():
    assert RulesLayer().detect_pii("codice rssmrc09a12h501x", BENCH_CTX) == []
    spans = RulesLayer().detect_pii("il 06/12/2011 e il 31/12/2011", BENCH_CTX)
    assert {s.category for s in spans} == {C.DATE}


def test_rules_no_regression_on_the_p2_baseline():
    """Every entity the P2 rules baseline covered stays covered by the new rules."""
    base, rules = RulesBaselineDetector(), RulesLayer()
    for rec in load_corpus():
        old = base.detect_pii(rec["text"], BENCH_CTX)
        new = fuse(rec["text"], rules.detect_pii(rec["text"], BENCH_CTX))
        for ent in rec["entities"]:
            if any(s.start <= ent["start"] and s.end >= ent["end"] for s in old):
                assert any(s.start <= ent["start"] and s.end >= ent["end"] for s in new), rec["id"]


# --- strato 2: gazetteer di contesto ---------------------------------------------------------
def test_gazetteer_uses_class_roster_and_institution_names():
    ctx = SchoolContext(people=("Ginevra Barbieri", "Rosa Neri"), institutions=("IC Rita Levi Montalcini",))
    det = GazetteerLayer(ctx)
    text = "barbieri,Ginevra e GINEVRA BARBIERI dell'IC  Rita Levi Montalcini; la rosa è fiorita, Rosa no."
    found = _found(det.detect_pii(text, BENCH_CTX), text)
    assert ("Ginevra", C.PERSON) in found and ("GINEVRA BARBIERI", C.PERSON) in found
    assert ("IC  Rita Levi Montalcini", C.SCHOOL) in found and ("Rosa", C.PERSON) in found
    assert ("rosa", C.PERSON) not in found and ("barbieri", C.PERSON) not in found


def test_gazetteer_context_patterns_and_known_values():
    det = GazetteerLayer(known=[("Tancredi", C.PERSON)])
    text = "La prof.ssa Fumagalli del Liceo «Galilei» ha visto tancredi; ha la dislessia."
    found = _found(det.detect_pii(text, BENCH_CTX), text)
    assert {("Fumagalli", C.PERSON), ("Liceo «Galilei»", C.SCHOOL), ("tancredi", C.PERSON),
            ("dislessia", C.HEALTH)} <= found


# --- strato 3 e disponibilità -----------------------------------------------------------------
def test_detector_is_unavailable_without_ml_or_when_ml_fails():
    with pytest.raises(p.DetectorUnavailable):
        LocalPIIDetector(None).detect_pii("Mario", BENCH_CTX)
    with pytest.raises(p.DetectorUnavailable) as exc:
        LocalPIIDetector(FakeML(fail=True)).detect_pii("Mario Rossi", BENCH_CTX)
    assert "Mario" not in str(exc.value) + repr(exc.value) and exc.value.__cause__ is None
    assert LocalPIIDetector(FakeML()).detect_pii("   ", BENCH_CTX) == []


def test_gliner_layer_fails_closed(tmp_path, monkeypatch):
    with pytest.raises(p.DetectorUnavailable):
        GlinerLayer(tmp_path).detect_pii("Mario", BENCH_CTX)
    (tmp_path / "model_fp16.onnx").write_bytes(b"not a model")
    with pytest.raises(p.DetectorUnavailable):
        GlinerLayer(tmp_path, sha256="0" * 64).load()
    monkeypatch.delenv("PRIVACY_PII_MODEL_SHA256", raising=False)
    monkeypatch.setenv("PRIVACY_PII_MODEL_DIR", str(tmp_path))
    with pytest.raises(p.DetectorUnavailable):
        GlinerLayer.from_env()
    monkeypatch.setenv("PRIVACY_PII_MODEL_SHA256", "a" * 64)
    assert GlinerLayer.from_env().model_dir == tmp_path


def test_windows_overlap_and_cover_every_word():
    assert windows(0) == [] and windows(10) == [(0, 10)]
    spans = windows(400, size=160, overlap=24)
    assert spans[0] == (0, 160) and spans[-1][1] == 400
    assert all(b[0] == a[1] - 24 for a, b in zip(spans, spans[1:]))


# --- pseudonimizzazione -----------------------------------------------------------------------
def test_placeholders_are_consistent_across_turns_and_localized():
    eng = _engine({"Mario Rossi": C.PERSON, "Bologna": C.CITY})
    ctx = _ctx()
    first = eng.pseudonymize(["Sono Mario Rossi di Bologna, mail mario@example.com"], ctx, REPLACE_ALL)
    second = eng.pseudonymize(["Ancora MARIO  ROSSI e Bologna."], ctx, REPLACE_ALL)
    assert first.texts == ["Sono [PERSONA_1] di [CITTÀ_1], mail [EMAIL_1]"]
    assert second.texts == ["Ancora [PERSONA_1] e [CITTÀ_1]."]
    assert first.mapping_ref == second.mapping_ref
    assert first.report == {C.PERSON: 1, C.CITY: 1, C.EMAIL: 1}
    en = eng.pseudonymize(["Mario Rossi"], _ctx("conv-en", "en-GB"), REPLACE_ALL)
    assert en.texts == ["[PERSON_1]"]


def test_known_values_stay_masked_when_the_model_misses_them_later():
    ml = FakeML({"Tancredi": C.PERSON})
    eng = PseudonymizationEngine(LocalPIIDetector(ml), authorize=ALLOW)
    ctx = _ctx()
    eng.pseudonymize(["Ho visto Tancredi"], ctx, REPLACE_ALL)
    ml.entities = {}
    assert eng.pseudonymize(["tancredi è tornato"], ctx, REPLACE_ALL).texts == ["[PERSONA_1] è tornato"]


def test_scopes_are_not_linkable():
    store = InMemoryMapStore()
    eng = _engine({"Mario Rossi": C.PERSON, "Anna Bianchi": C.PERSON}, store=store)
    a = eng.pseudonymize(["Anna Bianchi e Mario Rossi"], _ctx("conv-a"), REPLACE_ALL)
    b = eng.pseudonymize(["Mario Rossi"], _ctx("conv-b", subject="stud2"), REPLACE_ALL)
    assert a.texts == ["[PERSONA_1] e [PERSONA_2]"] and b.texts == ["[PERSONA_1]"]
    assert a.mapping_ref != b.mapping_ref
    assert eng.restore_authorized("[PERSONA_1]", _ctx("conv-a")) == "Anna Bianchi"
    assert eng.restore_authorized("[PERSONA_1]", _ctx("conv-b", subject="stud2")) == "Mario Rossi"
    assert eng.restore_authorized("[PERSONA_1]", _ctx("conv-c")) == "[PERSONA_1]"


def test_user_typed_placeholders_are_neutralized():
    eng = _engine({"Mario": C.PERSON})
    ctx = _ctx()
    out = eng.pseudonymize(["Mario dice [PERSONA_1] e [[PII:NOME:1]]"], ctx, REPLACE_ALL).texts[0]
    assert out == "[PERSONA_1] dice ［PERSONA_1］ e [[PII:NOME:1]]"
    assert eng.restore_authorized(out, ctx) == "Mario dice ［PERSONA_1］ e [[PII:NOME:1]]"
    assert neutralize("[SCUOLA_12] [abc] [A]") == "［SCUOLA_12］ [abc] ［A］"


def test_policy_actions_keep_generalize_block():
    eng = _engine({"Mario": C.PERSON, "Liceo Volta": C.SCHOOL})
    ctx = _ctx()
    policy = p.CategoryPolicy({C.PERSON: "keep", C.SCHOOL: "generalize", C.EMAIL: "replace"})
    out = eng.pseudonymize(["Mario del Liceo Volta"], ctx, policy)
    assert out.texts == ["Mario del [SCUOLA]"] and out.report == {C.SCHOOL: 1}
    with pytest.raises(p.PolicyBlocked):
        eng.pseudonymize(["ha la dislessia"], ctx, p.default_category_policy(external=True))
    with pytest.raises(p.PolicyBlocked):  # missing category => block
        eng.pseudonymize(["scrivi a a@b.it"], ctx, p.CategoryPolicy({}))


def test_failed_batch_does_not_commit_map_entries():
    store = InMemoryMapStore()
    eng = _engine({"Mario Rossi": C.PERSON}, store=store)
    ctx = _ctx()
    with pytest.raises(p.PolicyBlocked):
        eng.pseudonymize(["Mario Rossi", "ha la dislessia"], ctx, p.default_category_policy(external=True))
    assert store.get("conv-1") is None
    assert eng.pseudonymize(["Anna"], ctx, REPLACE_ALL).texts == ["Anna"]


class LateML(FakeML):
    """Finds «Rossi» only once its context changed (residual check case)."""

    def detect_pii(self, text, ctx):
        self.calls += 1
        out = []
        if "Mario Rossi" in text:
            i = text.index("Mario")
            out.append(PIISpan(i, i + 5, C.PERSON, detector="ml"))
        elif "Rossi" in text and self.calls <= self.find_until:
            i = text.index("Rossi")
            out.append(PIISpan(i, i + 5, C.PERSON, detector="ml"))
        return out


def test_residual_check_replaces_late_finds_then_fails_closed():
    ml = LateML()
    ml.find_until = 2
    eng = PseudonymizationEngine(LocalPIIDetector(ml), authorize=ALLOW)
    assert eng.pseudonymize(["Mario Rossi"], _ctx(), REPLACE_ALL).texts == ["[PERSONA_1] [PERSONA_2]"]
    assert ml.calls == 3  # first pass, residual found, residual clean

    class Stubborn(FakeML):
        """Every pass finds one more letter outside the placeholders."""

        def detect_pii(self, text, ctx):
            bare = re.sub(r"\[[A-Z]+\]", lambda m: "#" * len(m.group()), text)
            i = next((i for i, ch in enumerate(bare) if ch.isalnum()), None)
            return [] if i is None else [PIISpan(i, i + 1, C.PERSON, detector="ml")]

    eng = PseudonymizationEngine(LocalPIIDetector(Stubborn()), authorize=ALLOW)
    with pytest.raises(p.ResidualPII):
        eng.pseudonymize(["abc"], _ctx("conv-s"), p.CategoryPolicy({C.PERSON: "generalize"}))


def test_ml_spans_on_our_placeholders_are_not_residuals():
    eng = _engine({"Mario": C.PERSON, "[PERSONA_1]": C.PERSON, "PERSONA": C.PERSON})
    assert eng.pseudonymize(["Mario"], _ctx(), REPLACE_ALL).texts == ["[PERSONA_1]"]


def test_restore_requires_authorization():
    eng = _engine({"Mario Rossi": C.PERSON}, authorize=None)  # P1/P7 default: deny
    ctx = _ctx()
    text = eng.pseudonymize(["Mario Rossi"], ctx, REPLACE_ALL).texts[0]
    with pytest.raises(p.AccessDenied):
        eng.restore_authorized(text, ctx)
    with pytest.raises(p.AccessDenied):
        eng.stream_restorer(ctx)
    broken = _engine(authorize=lambda ctx: 1 / 0)
    with pytest.raises(p.AccessDenied):
        broken.restore_authorized("[PERSONA_1]", ctx)


def test_stream_restorer_handles_split_placeholders():
    eng = _engine({"Mario Rossi": C.PERSON})
    ctx = _ctx()
    eng.pseudonymize(["Mario Rossi"], ctx, REPLACE_ALL)
    restorer = eng.stream_restorer(ctx)
    out = "".join(restorer.feed(c) for c in ["Ciao [PER", "SONA", "_1]", "!"]) + restorer.flush()
    assert out == "Ciao Mario Rossi!"


def test_forget_deletes_the_scope_map():
    eng = _engine({"Mario": C.PERSON})
    ctx = _ctx()
    eng.pseudonymize(["Mario"], ctx, REPLACE_ALL)
    eng.forget(ctx)
    assert eng.restore_authorized("[PERSONA_1]", ctx) == "[PERSONA_1]"


def test_scope_map_round_trip_and_safe_repr():
    smap = ScopeMap("conv-1", "it")
    token = smap.placeholder(C.PHONE, "+39 334 021 9776")
    assert smap.placeholder(C.PHONE, "334.021.9776") == token == "[TELEFONO_1]"
    again = ScopeMap.from_bytes(smap.to_bytes())
    assert again.reverse == smap.reverse and again.counters == {"TELEFONO": 1}
    assert again.as_pseudonym_map().entries == {"[TELEFONO_1]": "+39 334 021 9776"}
    assert "334" not in repr(smap) + str(smap) + repr(again.as_pseudonym_map())
    with pytest.raises(p.PrivacyError):
        ScopeMap.from_bytes(b'{"v": 2}')
    assert normalize(C.PHONE, "tre tre quattro") == "334" and normalize(C.FISCAL_CODE, "ab c") == "abc"


def test_invalid_inputs_are_blocked():
    eng = _engine()
    with pytest.raises(p.PolicyBlocked):
        eng.pseudonymize("one string", _ctx(), REPLACE_ALL)
    with pytest.raises(p.PolicyBlocked):
        eng.pseudonymize(["x"], _ctx(scope="  "), REPLACE_ALL)
    with pytest.raises(p.PolicyBlocked):
        eng.pseudonymize([None], _ctx(), REPLACE_ALL)


def test_public_api_delegates_to_the_configured_engine():
    ctx = _ctx()
    try:
        with pytest.raises(p.DetectorUnavailable):
            p.pseudonymize(["Mario"], ctx, REPLACE_ALL)
        eng = _engine({"Mario": C.PERSON})
        p.configure_engine(eng)
        assert p.pseudonymize(["Mario"], ctx, REPLACE_ALL).texts == ["[PERSONA_1]"]
        assert _found(p.detect_pii("Mario", ctx), "Mario") == {("Mario", C.PERSON)}
        assert p.restore_authorized("[PERSONA_1]", ctx) == "Mario"
    finally:
        p.configure_engine(None)
    with pytest.raises(p.AccessDenied):
        p.depseudonymize("[PERSONA_1]", ctx)


# --- modello reale: soglie di P3 §7 ---------------------------------------------------------------
MODEL_DIR = os.environ.get("PRIVACY_PII_MODEL_DIR", "")
needs_model = pytest.mark.skipif(
    not (MODEL_DIR and (Path(MODEL_DIR) / "model_fp16.onnx").exists()
         and importlib.util.find_spec("onnxruntime") and importlib.util.find_spec("tokenizers")),
    reason="PRIVACY_PII_MODEL_DIR with gliner_multi_pii-v1 fp16 and onnxruntime + tokenizers required")


@pytest.fixture(scope="module")
def real_detector():
    layer = GlinerLayer(MODEL_DIR)
    layer.load()
    return LocalPIIDetector(layer)


def _masked(det, records):
    per = {}
    for rec in records:
        pred = det.detect_pii(rec["text"], BENCH_CTX)
        for ent in rec["entities"]:
            hit = any(s.start <= ent["start"] and s.end >= ent["end"] for s in pred)
            c = per.setdefault(ent["category"], [0, 0])
            c[0], c[1] = c[0] + 1, c[1] + hit
    total = sum(v[0] for v in per.values())
    return sum(v[1] for v in per.values()) / total, {k: v[1] / v[0] for k, v in per.items()}


@needs_model
def test_real_model_meets_p3_thresholds(real_detector):
    sys.path.insert(0, str(ROOT / "scripts" / "spikes"))
    from p3_holdout import holdout_records

    _, corpus = _masked(real_detector, load_corpus())
    holdout_all, _ = _masked(real_detector, holdout_records())
    assert corpus["person"] >= 0.95 and corpus["school"] >= 0.95, corpus
    assert holdout_all >= 0.90
    for cat in ("email", "phone", "fiscal_code", "iban", "url", "ip", "social"):
        assert corpus[cat] >= 0.95, (cat, corpus[cat])


@needs_model
def test_real_model_pseudonymized_text_has_no_person_values(real_detector):
    eng = PseudonymizationEngine(real_detector, authorize=ALLOW)
    records = [r for r in load_corpus() if any(e["category"] == "person" for e in r["entities"])][:40]
    for rec in records:
        out = eng.pseudonymize([rec["text"]], _ctx(rec["id"]), REPLACE_ALL).texts[0]
        for ent in rec["entities"]:
            if ent["category"] == "person" and len(ent["text"]) > 3:
                assert ent["text"] not in out, rec["id"]
        assert eng.restore_authorized(out, _ctx(rec["id"])) == neutralize(rec["text"])
