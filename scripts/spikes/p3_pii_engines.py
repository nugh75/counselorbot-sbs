"""P3 spike: candidate PII engines for the Privacy Layer, measured on the P2 corpus.

Engines (all implement ``backend.privacy.PIIDetector``):

- ``RulesBaselineDetector`` (P2): today's ``backend/pii.py`` with offsets.
- ``GazetteerDetector``: name/surname/place lists plus context patterns for
  schools, addresses, organizations, titles («prof.ssa X»), birth dates,
  student ids and health/art. 9 vocabulary. Two lexicons:
  ``generic`` (written for this spike, independent from the corpus generator)
  and ``roster`` (the generator vocabulary, simulating the 02 §3.4 gazetteer
  of names already known to the system: an upper bound, not a fair test).
- ``OllamaNERDetector``: today's ``backend/pii_ner.py`` prompt; ``probe()``
  reports why it cannot run (daemon down, model missing) instead of raising.
- ``GlinerOnnxDetector``: GLiNER span model via ``p3_gliner_onnx``
  (``onnxruntime`` + ``tokenizers``, no torch), as it would ship in the
  PyInstaller desktop build.
- ``UnionDetector``: overlapping spans resolved as in 02 §3.2: the longest
  wins, ties go to the earlier layer (rules > gazetteer > ml).

Spike code: not imported by the backend. Optional dependencies
(``onnxruntime``, ``tokenizers``) are imported lazily.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Iterable, Sequence

ROOT = Path(__file__).resolve().parents[2]
for _p in (ROOT, Path(__file__).resolve().parent):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

from backend.privacy import PIICategory, PIIDetector, PIISpan, PrivacyContext  # noqa: E402
from backend.privacy.corpus.benchmark import RulesBaselineDetector  # noqa: E402,F401 (re-exported for the bench)

C = PIICategory

# --- Gazetteer lexicons ---------------------------------------------------------
# Generic lexicon: common Italian first names and surnames (ISTAT-style top
# lists), names frequent among families of foreign origin, provincial capitals
# and regions. Written for this spike without looking at generator.py lists;
# overlaps with the corpus are the overlaps a real list would have.
GENERIC_FIRST_NAMES = """
Leonardo Francesco Alessandro Lorenzo Mattia Andrea Gabriele Riccardo Tommaso Edoardo
Matteo Giuseppe Antonio Diego Federico Giovanni Pietro Samuele Filippo Davide Michele
Christian Nicola Luca Marco Simone Daniele Emanuele Stefano Paolo Roberto Fabio Massimo
Salvatore Vincenzo Giorgio Alberto Enrico Carlo Mario Luigi Franco Sergio Claudio Bruno
Elia Achille Enea Ettore Giacomo Jacopo Manuel Cristian Kevin Alex Thomas Nicolò Niccolò
Gioele Noah Liam Ryan Adam Omar Youssef Mohamed Ahmed Ali Amir Hamza Karim Rayan
Sofia Aurora Giulia Ginevra Vittoria Beatrice Alice Ludovica Emma Matilde Anna Camilla
Chiara Giorgia Bianca Nicole Greta Gaia Martina Azzurra Arianna Sara Noemi Isabel Rebecca
Chloe Adele Viola Elisa Francesca Federica Valentina Alessia Silvia Elena Laura Paola
Marta Irene Ilaria Serena Roberta Monica Cristina Daniela Barbara Simona Michela Lucia
Maria Rosa Angela Giovanna Teresa Carmela Antonella Caterina Margherita Eleonora Asia
Mia Lisa Clara Agnese Benedetta Carlotta Diletta Elisabetta Giada Miriam Ambra Aisha
Fatima Amina Yasmin Salma Malak Sara Ioana Andreea Elena Xin Wei Ana Maria
""".split()
GENERIC_SURNAMES = """
Rossi Russo Ferrari Esposito Bianchi Romano Colombo Ricci Marino Greco Bruno Gallo Conti
Mancini Costa Giordano Rizzo Lombardi Moretti Barbieri Fontana Santoro Mariani
Rinaldi Caruso Ferrara Galli Martini Leone Longo Gentile Martinelli Vitale Lombardo Serra
Coppola D'Angelo Marchetti Parisi Villa Conte Ferraro Ferri Fabbri Bianco Marini
Grasso Valentini Messina Sala Gatti Pellegrino Palumbo Sanna Farina Rizzi
Monti Cattaneo Morelli Amato Silvestri Mazza Testa Grassi Pellegrini Carbone Giuliani
Benedetti Barone Rossetti Caputo Montanari Guerra Palmieri Bernardi Martino Fiore
Ferretti Bellini Basile Riva Donati Piras Vitali Battaglia Sartori Neri Costantini Milani
Pagano Ruggiero Sorrentino D'Amico Orlando Damico Negri Popescu Ionescu Chen Hu Zhang
Hoxha Singh Kaur Diallo Nguyen
""".split()
# Two-word surnames are matched as phrases.
GENERIC_SURNAMES += ["De Luca", "De Santis", "De Angelis", "De Rosa", "Di Stefano", "La Rosa", "Lo Russo"]
GENERIC_CITIES = """
Roma Milano Napoli Torino Palermo Genova Bologna Firenze Bari Catania Venezia Verona Messina
Padova Trieste Brescia Parma Taranto Prato Modena Reggio Perugia Livorno Ravenna Cagliari
Foggia Rimini Salerno Ferrara Sassari Latina Monza Siracusa Pescara Bergamo Forlì Trento
Vicenza Terni Bolzano Novara Piacenza Ancona Andria Arezzo Udine Cesena Lecce Pesaro
Como Pisa Lucca Brindisi Treviso Varese Asti Cremona Pavia Potenza Caserta
Matera Campobasso Aosta L'Aquila Catanzaro Cosenza Agrigento Trapani Siena Grosseto
""".split() + ["La Spezia", "Reggio Emilia", "Reggio Calabria", "Ascoli Piceno"]
GENERIC_REGIONS = ["Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna",
                   "Friuli-Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche", "Molise",
                   "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana", "Trentino-Alto Adige",
                   "Umbria", "Valle d'Aosta", "Veneto"]
HEALTH_TERMS = [
    "dislessia", "discalculia", "disgrafia", "disortografia", "ADHD", "DSA", "BES",
    "certificazione DSA", "diagnosi di DSA", "Legge 104", "L. 104/1992", "legge 104/92",
    "la 104", "PDP", "sostegno", "ansia", "disturbo d'ansia", "attacchi di panico",
    "depressione", "sintomi depressivi", "epilessia", "diabete", "diabete di tipo 1",
    "celiachia", "autismo", "disturbo dello spettro autistico", "sindrome di Asperger",
    "anoressia", "bulimia", "disturbo oppositivo-provocatorio", "logopedista",
    "neuropsichiatra", "psicologa", "psicologo", "psichiatra",
]
ART9_TERMS = [
    "di religione musulmana", "musulmano", "musulmana", "di fede ebraica", "ebreo", "ebrea",
    "testimone di Geova", "di religione evangelica", "evangelico", "di religione sikh",
    "ortodosso praticante", "cattolico praticante", "buddista", "ramadan", "omosessuale",
    "gay", "lesbica", "bisessuale", "transgender", "militante di un partito politico",
    "iscritto al sindacato",
]

_CAP = r"[A-ZÀ-ÖØ-Þ][\wÀ-ÿ'’-]*"
_QUOTED = r"«[^»]{1,40}»|\"[^\"]{1,40}\""
_LINK = r"(?:di|del|della|dei|degli|delle|d'|in|e)"
SCHOOL_RE = re.compile(
    rf"\b(?:Liceo|Istituto|Istituti|ITIS|ITC|ITT|IPSIA|IPSSAR|Convitto|Scuola|Università|Politecnico"
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


def _phrase_re(terms: Iterable[str], *, flags: int = 0) -> re.Pattern:
    alts = sorted({t for t in terms}, key=len, reverse=True)
    return re.compile(r"(?<![\wÀ-ÿ])(?:" + "|".join(re.escape(t) for t in alts) + r")(?![\wÀ-ÿ])", flags)


def roster_lexicon() -> dict[str, list[str]]:
    """Generator vocabulary = every person/place in the corpus is "known"."""
    from backend.privacy.corpus import generator as gen

    return {
        "first": [n for n, _ in gen.FIRST_NAMES] + ["Speranza", "Marta", "Giada", "Sara", "Luca"],
        "surname": list(gen.SURNAMES),
        "city": sorted(gen.BIRTH_PLACES) + sorted(gen.FOREIGN_BIRTH),
        "region": list(gen.REGIONS),
    }


def generic_lexicon() -> dict[str, list[str]]:
    return {"first": GENERIC_FIRST_NAMES, "surname": GENERIC_SURNAMES,
            "city": GENERIC_CITIES, "region": GENERIC_REGIONS}


class GazetteerDetector:
    """Lists + context patterns; capitalized tokens only (no lowercase names)."""

    def __init__(self, lexicon: str = "generic"):
        lex = roster_lexicon() if lexicon == "roster" else generic_lexicon()
        self.name = f"gazetteer_{lexicon}"
        self.names = set(lex["first"]) | set(lex["surname"])
        self._name_re = _phrase_re(lex["first"] + lex["surname"])
        self._city_re = _phrase_re(lex["city"])
        self._region_re = _phrase_re(lex["region"])
        self._health_re = _phrase_re(HEALTH_TERMS, flags=re.IGNORECASE)
        self._art9_re = _phrase_re(ART9_TERMS, flags=re.IGNORECASE)
        self._cap_re = re.compile(rf"\s+({_CAP})")

    def _extend_person(self, text: str, start: int, end: int) -> int:
        """Absorb following capitalized tokens (unknown surnames), at most two."""
        for _ in range(2):
            m = self._cap_re.match(text, end)
            if not m or self._city_re.fullmatch(m.group(1)) or self._region_re.fullmatch(m.group(1)):
                break
            end = m.end(1)
        return end

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
        for m in self._name_re.finditer(text):
            found.append((m.start(), self._extend_person(text, m.start(), m.end()), C.PERSON))
        found += [(m.start(), m.end(), C.CITY) for m in self._city_re.finditer(text)]
        found += [(m.start(), m.end(), C.REGION) for m in self._region_re.finditer(text)]
        found += [(m.start(), m.end(), C.HEALTH) for m in self._health_re.finditer(text)]
        found += [(m.start(), m.end(), C.ART9_OTHER) for m in self._art9_re.finditer(text)]
        return resolve_overlaps([PIISpan(s, e, c, detector="gazetteer") for s, e, c in found])


def resolve_overlaps(spans: Sequence[PIISpan], rank: dict[str, int] | None = None) -> list[PIISpan]:
    """Keep non-overlapping spans: longest first, then a specific category over
    the generic ``date`` (a rules date that the gazetteer knows is a birth
    date), then earlier layer, then leftmost."""
    rank = rank or {"rules": 0, "gazetteer": 1, "ml": 2}
    ordered = sorted(spans, key=lambda s: (-(s.end - s.start), s.category is C.DATE,
                                           rank.get(s.detector, 9), s.start))
    kept: list[PIISpan] = []
    for s in ordered:
        if all(s.end <= k.start or s.start >= k.end for k in kept):
            kept.append(s)
    return sorted(kept, key=lambda s: s.start)


# Validated/structured rule hits are never displaced by a longer gazetteer or
# ML span: without this, «vince il più lungo» let GLiNER swallow phone numbers
# and fiscal codes into a wrong-category span (report §4).
AUTHORITATIVE_RULES = {C.EMAIL, C.PHONE, C.FISCAL_CODE, C.IBAN, C.URL, C.IP, C.SOCIAL, C.ID_DOCUMENT}


class UnionDetector:
    def __init__(self, *layers: PIIDetector, name: str | None = None):
        self.layers = layers
        self.name = name or "+".join(getattr(layer, "name", type(layer).__name__) for layer in layers)

    def detect_pii(self, text: str, ctx: PrivacyContext) -> list[PIISpan]:
        spans = [s for layer in self.layers for s in layer.detect_pii(text, ctx)]
        fixed = [s for s in spans if s.detector == "rules" and s.category in AUTHORITATIVE_RULES]
        rest = [s for s in spans if s not in fixed
                and all(s.end <= f.start or s.start >= f.end for f in fixed)]
        return sorted(fixed + resolve_overlaps(rest), key=lambda s: s.start)


# --- Ollama NER (today's pii_ner prompt) ---------------------------------------------
OLLAMA_CATEGORIES = {
    "nome": C.PERSON, "indirizzo": C.ADDRESS, "citta": C.CITY, "scuola": C.SCHOOL,
    "matricola": C.STUDENT_ID, "data_nascita": C.BIRTH_DATE, "salute": C.HEALTH,
}


def find_all(text: str, value: str) -> list[tuple[int, int]]:
    out, pos = [], text.find(value)
    while pos >= 0 and value:
        out.append((pos, pos + len(value)))
        pos = text.find(value, pos + len(value))
    return out


class OllamaNERDetector:
    name = "ollama_ner"

    def __init__(self, base_url: str = "http://localhost:11434", model: str = "qwen3:0.6b"):
        self.base_url, self.model = base_url.rstrip("/"), model
        self.errors = 0

    def probe(self, timeout: float = 2.0) -> str | None:
        """None if usable, otherwise a short reason (never raises)."""
        try:
            import httpx

            resp = httpx.get(f"{self.base_url}/api/tags", timeout=timeout)
            resp.raise_for_status()
            models = {m.get("name") for m in resp.json().get("models", [])}
        except Exception as exc:  # daemon down, refused, timeout, bad JSON
            return f"ollama unreachable at {self.base_url} ({type(exc).__name__})"
        if self.model not in models and f"{self.model}:latest" not in models:
            return f"model {self.model} not pulled (available: {len(models)})"
        return None

    def detect_pii(self, text: str, ctx: PrivacyContext) -> list[PIISpan]:
        from backend import pii_ner

        try:
            entities = pii_ner._ner_entities(text, self.base_url, self.model)
        except Exception:
            # Same fail-open shape as today's ner_ok=False: count it, find nothing.
            self.errors += 1
            return []
        spans = [PIISpan(s, e, OLLAMA_CATEGORIES[etype], detector="ml")
                 for etype, value in entities for s, e in find_all(text, value)]
        return resolve_overlaps(spans)


# --- GLiNER with onnxruntime only (p3_gliner_onnx) ------------------------------
# Labels for the ML layer only: rules keep structured identifiers (02 §3.4).
GLINER_LABELS: dict[str, PIICategory] = {
    "person": C.PERSON, "school": C.SCHOOL, "city": C.CITY, "region": C.REGION,
    "street address": C.ADDRESS, "organization": C.ORGANIZATION, "date of birth": C.BIRTH_DATE,
    "medical condition": C.HEALTH, "religion": C.ART9_OTHER, "sexual orientation": C.ART9_OTHER,
    "student id number": C.STUDENT_ID,
}


class GlinerOnnxDetector:
    def __init__(self, model_dir: Path, onnx_file: str, *, threshold: float = 0.5,
                 labels: dict[str, PIICategory] | None = None, threads: int | None = None,
                 name: str | None = None):
        from p3_gliner_onnx import GlinerOnnx

        self.labels = labels or GLINER_LABELS
        self.name = name or f"gliner:{Path(model_dir).name}"
        self.model = GlinerOnnx(model_dir, onnx_file, list(self.labels), threshold=threshold, threads=threads)

    def detect_pii(self, text: str, ctx: PrivacyContext) -> list[PIISpan]:
        return [PIISpan(s, e, self.labels[label], score=round(min(1.0, p), 4), detector="ml")
                for s, e, label, p in self.model.predict(text)]


# --- Registry ---------------------------------------------------------------------------
GLINER_MODELS = {
    # name: (local directory under --models, ONNX file, Hugging Face repo of the export)
    "gliner_multi_pii": ("gliner_multi_pii-v1", "model.onnx", "onnx-community/gliner_multi_pii-v1"),
    "gliner_multi_pii_fp16": ("gliner_multi_pii-v1", "model_fp16.onnx", "onnx-community/gliner_multi_pii-v1"),
    # Published int8 export: scores collapse (report §3), kept to document it;
    # our own onnxruntime dynamic int8/uint8 quantization collapses the same way.
    "gliner_multi_pii_int8": ("gliner_multi_pii-v1", "model_int8.onnx", "onnx-community/gliner_multi_pii-v1"),
    "gliner_pii_base": ("gliner-pii-base-v1.0", "model_quint8.onnx", "knowledgator/gliner-pii-base-v1.0"),
}
