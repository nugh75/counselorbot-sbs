"""Single AI egress gateway (P6, docs/privacy/02-progettazione.md §6).

Every text, image or audio that leaves the backend towards a model or an
external service passes through ``AIGateway``: ``send`` when the gateway runs
the transport and the reply is text, ``prepare`` when the caller runs it
(streaming, async, vectors, audio) with the filtered request it returns.
``backend/tests/test_ai_egress_guard.py`` fails if a provider SDK or an AI
endpoint appears outside the closed list of transport modules.

Steps, in order, each fail-closed:

1. purpose active with a configured legal basis (``require_purpose``);
2. ``authorize_data_access(principal, "send_to_ai", subject, purpose)``;
3. target local only if its URL is loopback or listed in ``PRIVACY_LOCAL_HOSTS``
   (``is_trusted_local``); an empty or unknown host is external;
4. external: texts and context (system prompt, history, RAG, documents) are
   filtered together, then checked for residuals (``ResidualPII``). Images
   and audio towards an external target are blocked;
5. transports keep backend credentials, TLS verification, timeouts and limits;
6. the reply is restored only through the map of this request (P4: only if
   ``restore_authorized`` allows it); logs carry category counts, never text;
7. ``record_privacy_event("ai_transmission")`` before any byte leaves.

``PRIVACY_GATEWAY_MODE``: ``strict`` enforces the seven steps and requires the
P4 engine (``configure_engine``) for external text. ``transitional`` is the
default until P7 (grants), the privacy events of P8 and P9 (purposes) exist:
steps 1, 2 and 7 are evaluated and counted (``shadow_report``) without
blocking, and without a P4 engine external text goes through the existing
``pii_ner`` filter. Steps 3-6 are enforced in both modes. Any other value of
the variable means ``strict``.
"""
from __future__ import annotations

import logging
import os
import re
import threading
from collections import Counter
from ipaddress import ip_address
from typing import Any, Callable, Iterable, Iterator, Mapping, Sequence

from . import policy
from .errors import (
    AccessDenied, EgressBlockedError, KeyUnavailable, PIIDetectorUnavailable, PrivacyError,
    ResidualPII,
)
from .types import (
    AIChunk, AIRequest, AIResponse, Decision, Principal, PrivacyContext, PrivacyEvent,
    PrivacyPurpose, PrivacyRole, PurposePolicy, ResourceRef, Target, _SafeRepresentation,
)

logger = logging.getLogger(__name__)

KINDS = ("chat", "chat_stream", "summary", "vision", "embedding", "tts", "transcription", "ocr", "notify")
MODES = ("transitional", "strict")
#: Spoken by an external engine: deterministic redaction, nothing to restore (P6c).
REDACT_KINDS = {"tts"}
#: Messages and server-rendered diagrams for the data subject on the channel
#: they linked (Telegram): delivered as they are, with purpose, grant and event.
DELIVER_KINDS = {"notify"}
#: Purposes pseudonymized even on a local target (policy.egress_requirements).
_ALWAYS_PSEUDONYMIZE = {PrivacyPurpose.TEACHER_NOTICING.value, PrivacyPurpose.RESEARCH.value}
_LEGACY_TOKEN_RE = re.compile(r"\[\[PII:([A-Z_]+):\d+\]\]")

_shadow: Counter = Counter()
_shadow_lock = threading.Lock()


def mode() -> str:
    value = os.environ.get("PRIVACY_GATEWAY_MODE", "transitional").strip().lower()
    return value if value in MODES else "strict"


def shadow_report() -> dict[str, int]:
    """Steps not enforced in transitional mode, as ``step:error_code`` counts."""
    with _shadow_lock:
        return dict(_shadow)


def context_for(username: str | None, purpose: str = PrivacyPurpose.GUIDED_CHAT.value, *,
                scope_id: str = "", locale: str = "it") -> PrivacyContext:
    """Context of a call the backend makes on behalf of ``username`` (None: no subject)."""
    name = username or "system"
    return PrivacyContext(Principal(name, PrivacyRole.SYSTEM, "backend", "local"),
                          username, purpose, scope_id or f"{purpose}:{name}", locale)


def is_local(target: Target) -> bool:
    """Step 3: classify by host only, never by provider name."""
    host = getattr(target, "resolved_host", "")
    if not isinstance(host, str) or not host:
        return False
    if "://" not in host:
        try:
            host = f"http://[{host}]" if ip_address(host).version == 6 else f"http://{host}"
        except ValueError:
            host = f"http://{host}"
    return policy.is_trusted_local(host)


def _resolve_purposes(ctx: PrivacyContext) -> tuple[PurposePolicy | None, bool]:
    from .consent import resolve_context_policy
    return resolve_context_policy(ctx)


def _no_pid(subject: str) -> str:
    raise KeyUnavailable() from None  # P8 events: subject_pid needs the key ring


class Prepared(_SafeRepresentation):
    """A filtered request ready for its transport, with its restore map."""

    def __init__(self, request: AIRequest, ctx: PrivacyContext, external: bool,
                 counts: Mapping[str, int], mapping: Mapping[str, str] | None, engine: bool):
        self.request = request
        self.external = external
        self.counts = dict(counts)
        self._ctx = ctx
        self._mapping = mapping or {}
        self._engine = engine

    def restore(self, text: str) -> str:
        """Step 6. Without authorization the placeholders stay."""
        if not isinstance(text, str) or not text:
            return text
        if self._engine:
            try:
                return policy.restore_authorized(text, self._ctx)
            except AccessDenied:
                return text
        if not self._mapping:
            return text
        from .. import pii

        return pii.restore(text, dict(self._mapping))

    def stream_restorer(self):
        """``feed``/``flush`` restorer for streamed replies, or None if nothing to restore."""
        if self._engine:
            try:
                return policy._ENGINE.stream_restorer(self._ctx)
            except (AccessDenied, AttributeError):
                return None
        if not self._mapping:
            return None
        from ..pii_ner import StreamRestorer

        return StreamRestorer(dict(self._mapping))


class AIGateway:
    """Fail-closed pipeline of 02 §6.1; without a transport ``send`` never sends."""

    def __init__(self, config: Mapping[str, Any] | None = None, *,
                 transport: Callable[[AIRequest], Any] | None = None,
                 text_filter: Callable[[list[str]], list[str]] | None = None,
                 public_content: bool = False,
                 mode: str | None = None,
                 purposes: Callable[[PrivacyContext], tuple[PurposePolicy | None, bool]] | None = None,
                 authorize: Callable[..., Decision] | None = None,
                 audit: Callable[[PrivacyEvent], None] | None = None,
                 pid_of: Callable[[str], str] | None = None):
        """``config``: the AIService configuration (Ollama URL and NER settings of
        the transitional filter). ``text_filter``: a stricter filter of the caller
        (embedding queries), never restorable; the residual check still runs.
        ``public_content``: embedding of a public corpus, sent unfiltered."""
        self.config = config or {}
        self.transport = transport
        self.text_filter = text_filter
        self.public_content = public_content is True
        self.mode = mode if mode in MODES else globals()["mode"]()
        self.purposes = purposes or _resolve_purposes
        self.authorize = authorize or policy.authorize_data_access
        self.audit = audit or policy.record_privacy_event
        self.pid_of = pid_of or _no_pid

    def send(self, request: AIRequest, ctx: PrivacyContext) -> AIResponse | Iterator[AIChunk]:
        if self.transport is None:
            raise EgressBlockedError() from None
        prepared = self.prepare(request, ctx)
        result = self.transport(prepared.request)
        if request.kind == "chat_stream":
            return self._stream(prepared, result)
        if not isinstance(result, str):
            raise EgressBlockedError() from None
        return AIResponse(prepared.restore(result))

    @staticmethod
    def _stream(prepared: Prepared, pieces: Iterable[str]) -> Iterator[AIChunk]:
        restorer = prepared.stream_restorer()
        for piece in pieces:
            if piece:
                yield AIChunk(restorer.feed(piece) if restorer else piece)
        tail = restorer.flush() if restorer else ""
        if tail:
            yield AIChunk(tail)

    def prepare(self, request: AIRequest, ctx: PrivacyContext) -> Prepared:
        if (not isinstance(request, AIRequest) or request.kind not in KINDS
                or not isinstance(ctx, PrivacyContext) or not isinstance(request.target, Target)):
            raise EgressBlockedError() from None
        purpose = self._step("purpose", lambda: self._purpose(ctx))
        self._step("authorization", lambda: self._authorize(ctx))
        external = not is_local(request.target)
        if (external and (request.images or request.audio is not None)
                and request.kind not in DELIVER_KINDS):
            raise EgressBlockedError() from None
        prepared = self._filter(request, ctx, external, purpose)
        self._step("audit", lambda: self.audit(PrivacyEvent(
            self.pid_of(ctx.subject or ""), self.pid_of(ctx.principal.username), ctx.principal.role,
            "ai_transmission", ctx.purpose, request.target.provider, dict(prepared.counts))))
        logger.debug("AI egress %s, %s target, categories %s", request.kind,
                     "external" if external else "local", prepared.counts)
        return prepared

    def _step(self, name: str, check: Callable[[], Any]):
        try:
            return check()
        except Exception as exc:
            code = exc.code if isinstance(exc, PrivacyError) else "privacy.errors.unavailable"
            if self.mode == "strict":
                if isinstance(exc, PrivacyError):
                    raise
                raise EgressBlockedError() from None
            key = f"{name}:{code}"
            with _shadow_lock:
                first = key not in _shadow
                _shadow[key] += 1
            if first:
                logger.info("Privacy gateway (transitional): step %s not enforced (%s)", name, code)
            return None

    def _purpose(self, ctx: PrivacyContext) -> PurposePolicy:
        purpose, consent = self.purposes(ctx)
        policy.require_purpose(ctx, purpose, consent_granted=consent)
        return purpose

    def _authorize(self, ctx: PrivacyContext) -> None:
        decision = self.authorize(ctx.principal, "send_to_ai",
                                  ResourceRef("conversation", ctx.subject or ""), ctx.purpose)
        if not isinstance(decision, Decision) or decision.allowed is not True:
            raise AccessDenied() from None

    def _filter(self, request: AIRequest, ctx: PrivacyContext, external: bool,
                purpose: PurposePolicy | None) -> Prepared:
        texts = list(request.texts) + list(request.attachments_context)
        if any(text is not None and not isinstance(text, str) for text in texts):
            raise EgressBlockedError() from None
        local_filter = self.mode == "strict" and (
            ctx.purpose in _ALWAYS_PSEUDONYMIZE
            or (purpose is not None and purpose.pseudonymize_local is True))
        if not external and not local_filter:
            return Prepared(request, ctx, False, {}, None, False)
        if request.kind in DELIVER_KINDS:
            return Prepared(request, ctx, external, _rule_counts(texts), None, False)
        if self.public_content:
            if request.kind != "embedding":
                raise EgressBlockedError() from None
            return Prepared(request, ctx, external, {}, None, False)
        mapping, engine = None, False
        if request.kind in REDACT_KINDS:
            out, counts = _redact(texts)
        elif self.text_filter is not None:
            out, counts = self.text_filter(list(texts)), _rule_counts(texts)
        elif policy._ENGINE is not None:
            batch = policy.pseudonymize([t or "" for t in texts], ctx,
                                        policy.default_category_policy(external=True))
            out, engine = batch.texts, True
            counts = {category.value: count for category, count in batch.report.items()}
        elif self.mode == "strict":
            raise PIIDetectorUnavailable() from None
        else:
            out, mapping = self._legacy(texts)
            counts = dict(Counter(m.lower() for t in mapping for m in _LEGACY_TOKEN_RE.findall(t)))
        if not isinstance(out, list) or len(out) != len(texts):
            raise EgressBlockedError() from None
        _verify_residuals(out)
        n = len(request.texts)
        filtered = AIRequest(request.kind, request.target, out[:n], request.images, request.audio, out[n:])
        return Prepared(filtered, ctx, external, counts, mapping, engine)

    def _legacy(self, texts: list[str]) -> tuple[list[str], dict[str, str]]:
        """Pre-P4 filter: rules plus the local NER model, as ``_anonymize_external`` did."""
        from .. import pii_ner

        base = (self.config.get("ollama_ip") or "http://localhost:11434").rstrip("/")
        flag = self.config.get("pii_ner_enabled")
        ner = None if flag is None else str(flag).strip().lower() not in ("0", "false", "no", "off")
        if not policy.is_trusted_local(base):
            if ner if ner is not None else pii_ner.is_ner_enabled():
                # The detector itself would send the original texts to a remote host.
                raise PIIDetectorUnavailable() from None
            ner = False
        out, mapping, ner_ok = pii_ner.anonymize_texts(
            texts, ollama_base=base, ner_enabled=ner, ner_model=self.config.get("pii_ner_model"))
        fallback = (self.config.get("external_pii_fallback") or "block").strip().lower()
        if not ner_ok and fallback == "block":
            raise PIIDetectorUnavailable() from None
        return list(out), dict(mapping)


def _rule_counts(texts: Sequence[str | None]) -> dict[str, int]:
    from .. import pii

    return dict(Counter(kind for text in texts for kind, _value in pii.find_pii(text)))


def _redact(texts: list[str | None]) -> tuple[list[str | None], dict[str, int]]:
    from .. import pii

    try:
        return [pii.redact_always(t, fail_closed=True) for t in texts], _rule_counts(texts)
    except ValueError:
        raise PIIDetectorUnavailable() from None


def _verify_residuals(texts: Sequence[str | None]) -> None:
    """Deterministic rules must find nothing left in what leaves the backend."""
    from .. import pii

    if any(pii.find_pii(text) for text in texts):
        raise ResidualPII() from None
