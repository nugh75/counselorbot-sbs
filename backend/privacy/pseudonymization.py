"""Pseudonymization with per-scope maps and authorized restore (P4).

- Placeholders ``[PERSONA_1]``, ``[SCUOLA_1]``… (labels in the scope's
  language, 02 §3.3). Numbering lives in one map per ``scope_id``
  (conversation): the same value gets the same placeholder in every turn,
  counters restart in every scope, no value hash in the placeholder, so
  ``[PERSONA_1]`` of two conversations cannot be linked.
- Bracketed uppercase tokens already in the user's text are neutralized
  (fullwidth brackets) before detection: they can neither collide with real
  placeholders nor be expanded by the restore.
- After replacement a second detection runs on the result (residual check).
  Residuals are replaced once more; if any remain, ``ResidualPII``.
- The map (placeholder <-> original) never leaves the backend. Restoring
  requires a positive ``authorize_data_access`` decision (P7); until then
  every restore is ``AccessDenied``. Maps live in a :class:`MapStore`; the
  default keeps them in process memory only, ``map_store.SqlAlchemyMapStore``
  keeps them encrypted in ``privacy_pseudonym_maps`` (P8). Each map belongs to
  one ``subject_pid``, set by ``subject_pid_of`` from ``PrivacyContext.subject``.
"""
from __future__ import annotations

import json
import re
import secrets
import threading
from collections import Counter
from dataclasses import dataclass, field
from typing import Callable, Protocol, Sequence

from .detect import LocalPIIDetector, uncovered
from .errors import AccessDenied, PolicyBlocked, PrivacyError, ResidualPII
from .types import (
    CategoryPolicy, Decision, PIICategory, PIISpan, PrivacyContext, PseudonymizedBatch,
    PseudonymMap, ResourceRef, _SafeRepresentation,
)

C = PIICategory

LABELS: dict[str, dict[PIICategory, str]] = {
    "it": {
        C.PERSON: "PERSONA", C.EMAIL: "EMAIL", C.PHONE: "TELEFONO", C.FISCAL_CODE: "CODICE_FISCALE",
        C.ADDRESS: "INDIRIZZO", C.CITY: "CITTÀ", C.REGION: "REGIONE", C.SCHOOL: "SCUOLA",
        C.ORGANIZATION: "ORGANIZZAZIONE", C.IBAN: "IBAN", C.ID_DOCUMENT: "DOCUMENTO",
        C.STUDENT_ID: "MATRICOLA", C.BIRTH_DATE: "DATA_NASCITA", C.DATE: "DATA", C.URL: "URL",
        C.IP: "IP", C.SOCIAL: "SOCIAL", C.HEALTH: "SALUTE", C.ART9_OTHER: "DATO_PARTICOLARE",
        C.COMBINATION: "COMBINAZIONE",
    },
    "en": {
        C.PERSON: "PERSON", C.EMAIL: "EMAIL", C.PHONE: "PHONE", C.FISCAL_CODE: "FISCAL_CODE",
        C.ADDRESS: "ADDRESS", C.CITY: "CITY", C.REGION: "REGION", C.SCHOOL: "SCHOOL",
        C.ORGANIZATION: "ORGANIZATION", C.IBAN: "IBAN", C.ID_DOCUMENT: "DOCUMENT",
        C.STUDENT_ID: "STUDENT_ID", C.BIRTH_DATE: "BIRTH_DATE", C.DATE: "DATE", C.URL: "URL",
        C.IP: "IP", C.SOCIAL: "SOCIAL", C.HEALTH: "HEALTH", C.ART9_OTHER: "SPECIAL_DATA",
        C.COMBINATION: "COMBINATION",
    },
}

# Any bracketed uppercase token: the shape of our placeholders in any language.
PLACEHOLDER_RE = re.compile(r"\[[A-ZÀ-ÖØ-Þ]+(?:_[A-ZÀ-ÖØ-Þ]+)*(?:_\d+)?\]")
_DIGIT_WORDS = {w: str(i) for i, w in enumerate(
    "zero uno due tre quattro cinque sei sette otto nove".split())}


def labels_for(locale: str) -> dict[PIICategory, str]:
    return LABELS.get((locale or "").split("-")[0].lower(), LABELS["en"])


def neutralize(text: str) -> str:
    """``[PERSONA_1]`` typed by a user becomes ``［PERSONA_1］``."""
    return PLACEHOLDER_RE.sub(lambda m: "［" + m.group()[1:-1] + "］", text)


def normalize(category: PIICategory, value: str) -> str:
    """Key under which two spellings of one value share a placeholder."""
    if category is C.PHONE:
        words = value.lower().split()
        digits = ("".join(_DIGIT_WORDS[w] for w in words) if words and all(w in _DIGIT_WORDS for w in words)
                  else re.sub(r"\D", "", value))
        return re.sub(r"^(?:0039|39)(?=\d{9,10}$)", "", digits)
    if category in (C.FISCAL_CODE, C.IBAN, C.EMAIL):
        return re.sub(r"\s", "", value).casefold()
    return " ".join(value.split()).casefold()


@dataclass(repr=False)
class ScopeMap(_SafeRepresentation):
    """Bidirectional map of one scope. Backend only: never log or serialize
    it except through the sealed store."""

    scope_id: str
    locale: str
    mapping_ref: str = field(default_factory=lambda: secrets.token_urlsafe(16))
    forward: dict[str, str] = field(default_factory=dict)      # "<category>\x1f<key>" -> placeholder
    reverse: dict[str, str] = field(default_factory=dict)      # placeholder -> original
    categories: dict[str, str] = field(default_factory=dict)   # placeholder -> category value
    counters: dict[str, int] = field(default_factory=dict)     # label -> last number
    subject_pid: str = ""

    def placeholder(self, category: PIICategory, value: str) -> str:
        key = f"{category.value}\x1f{normalize(category, value)}"
        if key not in self.forward:
            label = labels_for(self.locale)[category]
            self.counters[label] = self.counters.get(label, 0) + 1
            token = f"[{label}_{self.counters[label]}]"
            self.forward[key], self.reverse[token], self.categories[token] = token, value, category.value
        return self.forward[key]

    def known(self) -> list[tuple[str, PIICategory]]:
        return [(value, PIICategory(self.categories[token])) for token, value in self.reverse.items()]

    def restore(self, text: str) -> str:
        return PLACEHOLDER_RE.sub(lambda m: self.reverse.get(m.group(), m.group()), text)

    def as_pseudonym_map(self) -> PseudonymMap:
        return PseudonymMap(self.scope_id, dict(self.reverse))

    def copy(self) -> "ScopeMap":
        return ScopeMap(self.scope_id, self.locale, self.mapping_ref, dict(self.forward),
                        dict(self.reverse), dict(self.categories), dict(self.counters), self.subject_pid)

    def to_bytes(self) -> bytes:
        return json.dumps({"v": 1, "scope_id": self.scope_id, "locale": self.locale,
                           "mapping_ref": self.mapping_ref, "forward": self.forward,
                           "reverse": self.reverse, "categories": self.categories,
                           "counters": self.counters, "subject_pid": self.subject_pid},
                          ensure_ascii=False).encode("utf-8")

    @classmethod
    def from_bytes(cls, data: bytes) -> "ScopeMap":
        try:
            raw = json.loads(data.decode("utf-8"))
            if raw.get("v") != 1:
                raise ValueError
            return cls(raw["scope_id"], raw["locale"], raw["mapping_ref"], dict(raw["forward"]),
                       dict(raw["reverse"]), dict(raw["categories"]),
                       {k: int(v) for k, v in raw["counters"].items()}, raw.get("subject_pid", ""))
        except Exception:
            raise PrivacyError() from None


class MapStore(Protocol):
    def get(self, scope_id: str) -> ScopeMap | None: ...
    def put(self, smap: ScopeMap) -> None: ...
    def delete(self, scope_id: str) -> None: ...


class InMemoryMapStore:
    """Process memory only: maps are lost on restart (no restore after it)."""

    def __init__(self) -> None:
        self._maps: dict[str, bytes] = {}
        self._lock = threading.Lock()

    def get(self, scope_id: str) -> ScopeMap | None:
        with self._lock:
            data = self._maps.get(scope_id)
        return ScopeMap.from_bytes(data) if data is not None else None

    def put(self, smap: ScopeMap) -> None:
        data = smap.to_bytes()
        with self._lock:
            self._maps[smap.scope_id] = data

    def delete(self, scope_id: str) -> None:
        with self._lock:
            self._maps.pop(scope_id, None)


def _default_authorize(ctx: PrivacyContext) -> Decision:
    from .policy import authorize_data_access

    return authorize_data_access(ctx.principal, "read_clear",
                                 ResourceRef("conversation", ctx.subject or ""), ctx.purpose)


class PseudonymizationEngine:
    """``detect_pii`` / ``pseudonymize`` / ``restore_authorized`` of 02 §3.2."""

    RESIDUAL_ROUNDS = 2

    def __init__(self, detector: LocalPIIDetector, *, store: MapStore | None = None,
                 authorize: Callable[[PrivacyContext], Decision] | None = None,
                 subject_pid_of: Callable[[str], str] | None = None):
        self.detector = detector
        self.store = store if store is not None else InMemoryMapStore()
        self.authorize = authorize or _default_authorize
        self.subject_pid_of = subject_pid_of
        self._locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()

    def _scope_lock(self, scope_id: str) -> threading.Lock:
        with self._locks_guard:
            return self._locks.setdefault(scope_id, threading.Lock())

    @staticmethod
    def _scope_id(ctx: PrivacyContext) -> str:
        if not isinstance(ctx, PrivacyContext) or type(ctx.scope_id) is not str or not ctx.scope_id.strip():
            raise PolicyBlocked() from None
        return ctx.scope_id

    def _load(self, ctx: PrivacyContext) -> ScopeMap:
        scope_id = self._scope_id(ctx)
        smap = self.store.get(scope_id)
        if self.subject_pid_of is None:
            return smap or ScopeMap(scope_id, ctx.locale)
        if type(ctx.subject) is not str or not ctx.subject.strip():
            raise PolicyBlocked() from None
        pid = self.subject_pid_of(ctx.subject)
        if smap is None:
            return ScopeMap(scope_id, ctx.locale, subject_pid=pid)
        if smap.subject_pid != pid:  # a scope never mixes the values of two subjects
            raise PolicyBlocked() from None
        return smap

    def detect_pii(self, text: str, ctx: PrivacyContext) -> list[PIISpan]:
        return self.detector.detect_pii(neutralize(text), ctx, known=self._load(ctx).known())

    def pseudonymize(self, texts: Sequence[str], ctx: PrivacyContext,
                     policy: CategoryPolicy) -> PseudonymizedBatch:
        if isinstance(texts, str) or not isinstance(policy, CategoryPolicy):
            raise PolicyBlocked() from None
        scope_id = self._scope_id(ctx)
        with self._scope_lock(scope_id):
            smap = self._load(ctx).copy()  # committed only if every text passes
            report: Counter = Counter()
            out = [self._one(t, ctx, policy, smap, report) for t in texts]
            self.store.put(smap)
        return PseudonymizedBatch(out, smap.mapping_ref, dict(report))

    def _one(self, text: str, ctx: PrivacyContext, policy: CategoryPolicy,
             smap: ScopeMap, report: Counter) -> str:
        if not isinstance(text, str):
            raise PolicyBlocked() from None
        text = neutralize(text)
        spans = self.detector.detect_pii(text, ctx, known=smap.known())
        for attempt in range(self.RESIDUAL_ROUNDS + 1):
            pending = [s for s in spans if policy.action_for(s.category) != "keep"]
            if not pending:
                return text
            if attempt == self.RESIDUAL_ROUNDS:
                raise ResidualPII() from None
            text = self._apply(text, pending, policy, smap, report)
            # Residual check: detect again, ignoring what our placeholders cover.
            ours = [m.span() for m in PLACEHOLDER_RE.finditer(text)]
            spans = [p for s in self.detector.detect_pii(text, ctx, known=smap.known())
                     for p in uncovered(text, s, ours)]
        raise ResidualPII() from None

    @staticmethod
    def _apply(text: str, spans: Sequence[PIISpan], policy: CategoryPolicy,
               smap: ScopeMap, report: Counter) -> str:
        parts, pos = [], 0
        for s in sorted(spans, key=lambda s: s.start):
            action = policy.action_for(s.category)
            if action == "block":
                raise PolicyBlocked() from None
            if action == "replace":
                token = smap.placeholder(s.category, text[s.start:s.end])
            else:  # generalize: category only, not numbered nor restorable
                token = f"[{labels_for(smap.locale)[s.category]}]"
            parts += [text[pos:s.start], token]
            pos = s.end
            report[s.category] += 1
        return "".join(parts) + text[pos:]

    def _authorized_map(self, ctx: PrivacyContext) -> ScopeMap:
        try:
            decision = self.authorize(ctx)
        except Exception:
            raise AccessDenied() from None
        if not isinstance(decision, Decision) or decision.allowed is not True:
            raise AccessDenied() from None
        return self._load(ctx)

    def restore_authorized(self, text: str, ctx: PrivacyContext) -> str:
        return self._authorized_map(ctx).restore(text)

    def stream_restorer(self, ctx: PrivacyContext):
        """Chunk-safe restore for streamed replies (``pii_ner.StreamRestorer``)."""
        from backend.pii_ner import StreamRestorer

        return StreamRestorer(dict(self._authorized_map(ctx).reverse))

    def forget(self, ctx: PrivacyContext) -> None:
        """Delete the scope's map with its conversation (02 §3.3)."""
        self.store.delete(self._scope_id(ctx))
