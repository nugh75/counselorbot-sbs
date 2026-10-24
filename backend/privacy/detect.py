"""Local PII detection (P4): rules + context gazetteer + GLiNER, fused strictly.

Engine chosen by the P3 spike (docs/privacy/spikes/p3-pii-engine.md §7):

1. **Rules** (``backend/pii.py`` with offsets, plus the Italian phone, fiscal
   code and spelled-out email forms P3 found missing). Spans on structured,
   validated identifiers are *authoritative*: nothing displaces or trims them.
2. **Context gazetteer**: names the system already knows for this context
   (class roster, teachers, ``institutions.name``, values already in the
   conversation's pseudonym map) plus context patterns (schools, addresses,
   titles, birth dates, student ids, health and art. 9 vocabulary). No generic
   name dictionary: P3 showed it overfits.
3. **ML**: GLiNER ``urchade/gliner_multi_pii-v1`` fp16 via onnxruntime,
   threshold 0.5, loaded once and reused.

Fusion never leaves a detected character uncovered: spans are taken in
priority order (authoritative rules, then longest, then a specific category
over ``date``, then rules > gazetteer > ml) and later spans keep only the
parts not already covered. Without the ML layer detection is unavailable
(fail-closed): ``DetectorUnavailable``, never a partial result.
"""
from __future__ import annotations

import os
import re
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Protocol, Sequence

from .errors import PIIDetectorUnavailable, PrivacyError
from .types import PIICategory, PIISpan, PrivacyContext, _SafeRepresentation

C = PIICategory

# Validated/structured rule hits are never displaced by a longer gazetteer or
# ML span (P3 §3.3: GLiNER swallowed phones and fiscal codes otherwise).
AUTHORITATIVE_RULES = frozenset({C.EMAIL, C.PHONE, C.FISCAL_CODE, C.IBAN, C.URL, C.IP,
                                 C.SOCIAL, C.ID_DOCUMENT})
_LAYER_RANK = {"rules": 0, "gazetteer": 1, "ml": 2}


# --- Strato 1: regole -------------------------------------------------------------
# backend/pii.py type -> PIICategory (same mapping as the P2 baseline).
_RULE_CATEGORIES = {
    "email": C.EMAIL, "telefono": C.PHONE, "cf": C.FISCAL_CODE, "iban": C.IBAN, "url": C.URL,
    "ip": C.IP, "social": C.SOCIAL, "data": C.DATE, "salute": C.HEALTH,
    "piva": C.ID_DOCUMENT, "card": C.ID_DOCUMENT, "targa": C.ID_DOCUMENT, "dni": C.ID_DOCUMENT,
    "nir": C.ID_DOCUMENT, "nino": C.ID_DOCUMENT, "personnummer": C.ID_DOCUMENT,
}
_DIGIT_WORDS = r"(?:zero|uno|due|tre|quattro|cinque|sei|sette|otto|nove)"
# Forms missed by pii.py (P2/P3 false negatives): dotted, slashed or grouped
# mobiles with (+39), landlines with «/», numbers spelled digit by digit,
# mobiles glued to a word («al3478876543»), lowercase or spaced fiscal codes,
# «nome punto cognome chiocciola dominio».
_EXTRA_RULES: list[tuple[PIICategory, re.Pattern, Callable[[str], bool] | None]] = [
    (C.EMAIL, re.compile(r"(?<!\w)[\w.%+-]+(?:\s+punto\s+[\w.%+-]+)*\s+chiocciola\s+"
                         r"[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}(?!\w)", re.IGNORECASE), None),
    (C.PHONE, re.compile(r"(?<![\d+])(?:\(\+39\)\s?|\+39[ .]?|0039[ .]?)?3\d{2}(?:[ ./-]?\d){6,7}(?![\w/])"),
     None),
    (C.PHONE, re.compile(r"(?<![\w/])(?:\(\+39\)\s?|\+39[ .]?)?0\d{1,3}[ ./-]\d{5,8}(?![\w/])"), None),
    (C.PHONE, re.compile(rf"(?<!\w){_DIGIT_WORDS}(?:\s+{_DIGIT_WORDS}){{6,10}}(?!\w)", re.IGNORECASE),
     None),
    (C.FISCAL_CODE, re.compile(r"(?<![A-Za-z0-9])[A-Za-z]{3}\s?[A-Za-z]{3}\s?\d{2}[A-Za-z]\d{2}\s?"
                               r"[A-Za-z]\d{3}\s?[A-Za-z](?![A-Za-z0-9])"),
     lambda v: _cf_valid(re.sub(r"\s", "", v).upper())),
]


def _cf_valid(value: str) -> bool:
    from backend import pii

    return pii._cf_checksum_valid(value)


class RulesLayer:
    name = "rules"

    def detect_pii(self, text: str, ctx: PrivacyContext) -> list[PIISpan]:
        from backend import pii

        spans: list[PIISpan] = []
        for ptype, regex, validator in pii._DETECTORS:
            for m in regex.finditer(text):
                if validator is None or validator(m.group(0)):
                    spans.append(PIISpan(m.start(), m.end(), _RULE_CATEGORIES[ptype]))
        for category, regex, validator in _EXTRA_RULES:
            for m in regex.finditer(text):
                if validator is None or validator(m.group(0)):
                    spans.append(PIISpan(m.start(), m.end(), category))
        return spans


# --- Strato 2: gazetteer di contesto ------------------------------------------------
@dataclass(frozen=True, repr=False)
class SchoolContext(_SafeRepresentation):
    """Names known for a privacy scope: never logged, never sent anywhere."""

    people: tuple[str, ...] = ()        # students of the class, teachers
    institutions: tuple[str, ...] = ()  # institutions.name and known school names


_CAP = r"[A-ZÀ-ÖØ-Þ][\wÀ-ÿ'’-]*"
_QUOTED = r"«[^»]{1,40}»|\"[^\"]{1,40}\""
_LINK = r"(?:di|del|della|dei|degli|delle|d'|in|e)"
SCHOOL_RE = re.compile(
    rf"\b(?:Liceo|Istituto|Istituti|IIS|ITIS|ITC|ITT|IPSIA|IPSSAR|Convitto|Scuola|Università|Politecnico"
    rf"|Accademia|Conservatorio)\b(?:\s+(?:{_CAP}|{_LINK}|{_QUOTED}|\d+))*")
ORG_RE = re.compile(
    rf"\b(?:Associazione|Polisportiva|Parrocchia|Cooperativa|ASD|Centro|Scout|Banda|Oratorio|Fondazione"
    rf"|Circolo|Comitato)\b(?:\s+(?:{_CAP}|{_LINK}|{_QUOTED}|\d+))+")
ADDRESS_RE = re.compile(
    r"\b(?:[Vv]ia|[Vv]iale|[Pp]iazza|[Pp]iazzale|[Cc]orso|[Vv]icolo|[Ll]argo|[Ll]ungomare|[Ss]trada|[Cc]ontrada)"
    r"\s+(?:(?:[\wÀ-ÿ'’.]+)\s+){0,4}?(?:n\.\s*)?\d+(?:\s*/\s*[A-Za-z]|[A-Za-z]{0,3})?(?:\s+int\.\s*\d+)?")
TITLE_RE = re.compile(
    rf"\b(?:prof\.ssa|prof\.|professoressa|professore|maestra|maestro|sig\.ra|sig\.|signora|signor"
    rf"|dott\.ssa|dott\.|dottoressa|dottor)\s+({_CAP}(?:\s+{_CAP})?)")
BIRTH_RE = re.compile(
    r"(?:\bnat[oaie]\b[^,.;]{0,30}?\bil|\bnascita:?|\bcompiuto gli anni il)\s+"
    r"(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio"
    r"|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4})", re.IGNORECASE)
STUDENT_ID_RE = re.compile(r"\b[Mm]atricola:?\s*(?:n\.\s*)?(\d{5,8})\b")
DOC_RE = re.compile(r"\b(?:C[A-Z]\d{5}[A-Z]{2}|[A-Z]{2}\d{7})\b")
HEALTH_TERMS = (
    "dislessia", "discalculia", "disgrafia", "disortografia", "ADHD", "DSA", "BES",
    "certificazione DSA", "diagnosi di DSA", "Legge 104", "L. 104/1992", "legge 104/92",
    "la 104", "PDP", "sostegno", "ansia", "disturbo d'ansia", "attacchi di panico",
    "depressione", "sintomi depressivi", "epilessia", "diabete", "diabete di tipo 1",
    "celiachia", "autismo", "disturbo dello spettro autistico", "sindrome di Asperger",
    "anoressia", "bulimia", "disturbo oppositivo-provocatorio", "logopedista",
    "neuropsichiatra", "psicologa", "psicologo", "psichiatra",
)
ART9_TERMS = (
    "di religione musulmana", "musulmano", "musulmana", "di fede ebraica", "ebreo", "ebrea",
    "testimone di Geova", "di religione evangelica", "evangelico", "di religione sikh",
    "ortodosso praticante", "cattolico praticante", "buddista", "ramadan", "omosessuale",
    "gay", "lesbica", "bisessuale", "transgender", "militante di un partito politico",
    "iscritto al sindacato",
)


def phrase_re(terms: Iterable[str], *, flags: int = 0) -> re.Pattern | None:
    """Whole-word alternation, longest first; inner whitespace is flexible."""
    alts = sorted({t.strip() for t in terms if t and t.strip()}, key=len, reverse=True)
    if not alts:
        return None
    body = "|".join(r"\s+".join(re.escape(w) for w in t.split()) for t in alts)
    return re.compile(rf"(?<!\w)(?:{body})(?!\w)", flags)


_HEALTH_RE = phrase_re(HEALTH_TERMS, flags=re.IGNORECASE)
_ART9_RE = phrase_re(ART9_TERMS, flags=re.IGNORECASE)


class GazetteerLayer:
    """Context patterns plus the names of one :class:`SchoolContext`.

    A full name matches in any case; a single first name or surname of the
    roster matches only when written with a capital («Rosa», «ROSSI»), so the
    flower in «la rosa» stays. ``known`` adds (value, category) pairs already
    in the scope's map: once seen, a value stays masked in later turns even
    if the model misses it there.
    """

    name = "gazetteer"

    def __init__(self, context: SchoolContext | None = None,
                 known: Sequence[tuple[str, PIICategory]] = ()):
        context = context or SchoolContext()
        people = [p for p in context.people if p and p.strip()]
        tokens = {w for p in people for w in p.split() if len(w) >= 3}
        self._full = phrase_re([p for p in people if len(p.split()) > 1], flags=re.IGNORECASE)
        self._token = phrase_re(tokens, flags=re.IGNORECASE)
        self._school = phrase_re(context.institutions, flags=re.IGNORECASE)
        by_cat: dict[PIICategory, list[str]] = {}
        for value, category in known:
            by_cat.setdefault(category, []).append(value)
        self._known = [(cat, phrase_re(vals, flags=re.IGNORECASE)) for cat, vals in by_cat.items()]

    def detect_pii(self, text: str, ctx: PrivacyContext) -> list[PIISpan]:
        found: list[tuple[int, int, PIICategory]] = []
        for regex, cat in ((SCHOOL_RE, C.SCHOOL), (ORG_RE, C.ORGANIZATION), (ADDRESS_RE, C.ADDRESS)):
            for m in regex.finditer(text):
                end = m.end()
                if cat is not C.ADDRESS and (quote := text.find("»", m.start(), end)) >= 0:
                    end = quote + 1  # «Volta» closes the name; a following «di Pisa» is a city
                if end - m.start() > len("Scuola"):
                    found.append((m.start(), end, cat))
        for regex, cat in ((TITLE_RE, C.PERSON), (BIRTH_RE, C.BIRTH_DATE), (STUDENT_ID_RE, C.STUDENT_ID)):
            found += [(m.start(1), m.end(1), cat) for m in regex.finditer(text)]
        found += [(m.start(), m.end(), C.ID_DOCUMENT) for m in DOC_RE.finditer(text)]
        found += [(m.start(), m.end(), C.HEALTH) for m in _HEALTH_RE.finditer(text)]
        found += [(m.start(), m.end(), C.ART9_OTHER) for m in _ART9_RE.finditer(text)]
        if self._full:
            found += [(m.start(), m.end(), C.PERSON) for m in self._full.finditer(text)]
        if self._token:
            found += [(m.start(), m.end(), C.PERSON) for m in self._token.finditer(text)
                      if m.group()[0].isupper()]
        if self._school:
            found += [(m.start(), m.end(), C.SCHOOL) for m in self._school.finditer(text)]
        for cat, regex in self._known:
            if regex:
                found += [(m.start(), m.end(), cat) for m in regex.finditer(text)]
        return [PIISpan(s, e, c, detector="gazetteer") for s, e, c in found]


# --- Strato 3: GLiNER ONNX ------------------------------------------------------------
# Labels for the ML layer only: rules keep structured identifiers (02 §3.4).
GLINER_LABELS: dict[str, PIICategory] = {
    "person": C.PERSON, "school": C.SCHOOL, "city": C.CITY, "region": C.REGION,
    "street address": C.ADDRESS, "organization": C.ORGANIZATION, "date of birth": C.BIRTH_DATE,
    "medical condition": C.HEALTH, "religion": C.ART9_OTHER, "sexual orientation": C.ART9_OTHER,
    "student id number": C.STUDENT_ID,
}
DEFAULT_ONNX_FILE = "model_fp16.onnx"
DEFAULT_THRESHOLD = 0.5


class MLLayer(Protocol):
    def detect_pii(self, text: str, ctx: PrivacyContext) -> list[PIISpan]: ...


class GlinerLayer:
    """One onnxruntime session, loaded on first use and shared by threads.

    ``sha256`` pins the model file: a different or truncated file is not
    loaded. Any loading or inference failure is ``DetectorUnavailable``.
    """

    name = "ml"

    def __init__(self, model_dir: Path | str, *, onnx_file: str = DEFAULT_ONNX_FILE,
                 sha256: str | None = None, threshold: float = DEFAULT_THRESHOLD,
                 threads: int | None = None):
        self.model_dir, self.onnx_file = Path(model_dir), onnx_file
        self.sha256, self.threshold, self.threads = sha256, threshold, threads
        self._model = None
        self._lock = threading.Lock()

    @classmethod
    def from_env(cls) -> "GlinerLayer":
        """``PRIVACY_PII_MODEL_DIR`` + ``PRIVACY_PII_MODEL_SHA256`` (both
        required), optional ``PRIVACY_PII_MODEL_FILE`` and ``PRIVACY_PII_THRESHOLD``."""
        model_dir = os.environ.get("PRIVACY_PII_MODEL_DIR", "").strip()
        sha256 = os.environ.get("PRIVACY_PII_MODEL_SHA256", "").strip().lower()
        if not model_dir or not re.fullmatch(r"[0-9a-f]{64}", sha256):
            raise PIIDetectorUnavailable() from None
        try:
            threshold = float(os.environ.get("PRIVACY_PII_THRESHOLD", DEFAULT_THRESHOLD))
        except ValueError:
            raise PIIDetectorUnavailable() from None
        return cls(model_dir, onnx_file=os.environ.get("PRIVACY_PII_MODEL_FILE", DEFAULT_ONNX_FILE),
                   sha256=sha256, threshold=threshold)

    def load(self):
        if self._model is not None:
            return self._model
        with self._lock:
            if self._model is None:
                from .gliner_onnx import GlinerOnnx, sha256_file

                try:
                    path = self.model_dir / self.onnx_file
                    if self.sha256 and sha256_file(path) != self.sha256.lower():
                        raise PIIDetectorUnavailable()
                    self._model = GlinerOnnx(self.model_dir, self.onnx_file, list(GLINER_LABELS),
                                             threshold=self.threshold, threads=self.threads)
                except Exception:
                    raise PIIDetectorUnavailable() from None
        return self._model

    def detect_pii(self, text: str, ctx: PrivacyContext) -> list[PIISpan]:
        model = self.load()
        try:
            return [PIISpan(s, e, GLINER_LABELS[label], score=round(min(1.0, p), 4), detector="ml")
                    for s, e, label, p in model.predict(text)]
        except Exception:
            raise PIIDetectorUnavailable() from None


# --- Fusione --------------------------------------------------------------------------
def _priority(s: PIISpan) -> tuple:
    authoritative = s.detector == "rules" and s.category in AUTHORITATIVE_RULES
    return (not authoritative, -(s.end - s.start), s.category is C.DATE,
            _LAYER_RANK.get(s.detector, 9), s.start)


def uncovered(text: str, span: PIISpan, covered: Iterable[tuple[int, int]]) -> list[PIISpan]:
    """Parts of ``span`` outside ``covered``; cut pieces are trimmed of
    spaces and punctuation and dropped when nothing alphanumeric is left."""
    pieces = [(span.start, span.end)]
    for c_start, c_end in covered:
        pieces = [p for a, b in pieces for p in ((a, min(b, c_start)), (max(a, c_end), b)) if p[0] < p[1]]
    out = []
    for a, b in pieces:
        if (a, b) != (span.start, span.end):
            while a < b and not text[a].isalnum():
                a += 1
            while b > a and not text[b - 1].isalnum():
                b -= 1
            if a >= b:
                continue
        out.append(PIISpan(a, b, span.category, score=span.score, detector=span.detector))
    return out


def fuse(text: str, spans: Iterable[PIISpan]) -> list[PIISpan]:
    """Non-overlapping spans covering every character any layer detected.

    Spans are taken in priority order; a span overlapping kept ones keeps
    only its uncovered pieces, so a lost overlap never leaves part of a value
    in clear text.
    """
    kept: list[PIISpan] = []
    for s in sorted(spans, key=_priority):
        kept += uncovered(text, s, [(k.start, k.end) for k in kept])
    return sorted(kept, key=lambda s: s.start)


ContextProvider = Callable[[PrivacyContext], SchoolContext]


class LocalPIIDetector:
    """The three layers of P3 §7; ``ml=None`` means detection is unavailable."""

    def __init__(self, ml: MLLayer | None, *, context: ContextProvider | None = None):
        self.rules = RulesLayer()
        self.ml = ml
        self.context = context

    def detect_pii(self, text: str, ctx: PrivacyContext, *,
                   known: Sequence[tuple[str, PIICategory]] = ()) -> list[PIISpan]:
        if self.ml is None or not isinstance(text, str):
            raise PIIDetectorUnavailable() from None
        if not text.strip():
            return []
        try:
            school = self.context(ctx) if self.context else None
            spans = (self.rules.detect_pii(text, ctx)
                     + GazetteerLayer(school, known).detect_pii(text, ctx)
                     + self.ml.detect_pii(text, ctx))
            return fuse(text, spans)
        except PrivacyError:
            raise
        except Exception:
            raise PIIDetectorUnavailable() from None
