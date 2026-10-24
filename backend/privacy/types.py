"""Database-independent contracts; object diagnostics never include payloads.

Fields remain accessible to authorized backend code. Safe repr/str does not
make ``dataclasses.asdict``, attribute access or serialization safe for logs.
Enum values follow docs/privacy/02-progettazione.md, not UI translations.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Literal, Mapping, Protocol, Sequence, runtime_checkable

from .errors import PolicyBlocked, PrivacyError


class PIICategory(str, Enum):
    PERSON = "person"
    EMAIL = "email"
    PHONE = "phone"
    FISCAL_CODE = "fiscal_code"
    ADDRESS = "address"
    CITY = "city"
    REGION = "region"
    SCHOOL = "school"
    ORGANIZATION = "organization"
    IBAN = "iban"
    ID_DOCUMENT = "id_document"
    STUDENT_ID = "student_id"
    BIRTH_DATE = "birth_date"
    DATE = "date"
    URL = "url"
    IP = "ip"
    SOCIAL = "social"
    HEALTH = "health"
    ART9_OTHER = "art9_other"
    COMBINATION = "combination"


class SensitivityLevel(str, Enum):
    PUBLIC = "public"
    PERSONAL = "personal"
    SPECIAL_CATEGORY = "special_category"


class TreatmentMode(str, Enum):
    PSEUDONYMIZATION = "pseudonymization"
    REDACTION = "redaction"
    ENCRYPTION = "encryption"


class PrivacyRole(str, Enum):
    STUDENT = "student"
    TEACHER = "teacher"
    RESEARCHER = "researcher"
    ADMIN = "admin"
    SYSTEM = "system"


class PrivacyPurpose(str, Enum):
    GUIDED_CHAT = "guided_chat"
    TEACHER_NOTICING = "teacher_noticing"
    TEACHING = "teaching"
    ORIENTATION = "orientation"
    RESEARCH = "research"


class LegalBasis(str, Enum):
    UNDEFINED = "undefined"
    CONSENT = "consent"
    LEGAL_OBLIGATION = "legal_obligation"
    PUBLIC_TASK = "public_task"
    CONTRACT = "contract"
    VITAL_INTERESTS = "vital_interests"
    LEGITIMATE_INTERESTS = "legitimate_interests"


Category = PIICategory
Action = Literal["replace", "generalize", "keep", "block"]
Detector = Literal["rules", "gazetteer", "ml"]
DataAction = Literal["read_clear", "read_pseudonymized", "export", "send_to_ai", "modify", "delete"]
AIKind = Literal["chat", "chat_stream", "summary", "vision", "embedding", "tts", "transcription", "ocr", "notify"]


class _SafeRepresentation:
    __slots__ = ()

    def __repr__(self) -> str:
        return f"{type(self).__name__}(<redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


@dataclass(frozen=True, repr=False)
class Principal(_SafeRepresentation):
    username: str
    role: PrivacyRole
    auth_provider: str
    origin: Literal["local", "tunnel"]
    session_id: str | None = None


@dataclass(frozen=True, repr=False)
class PrivacyContext(_SafeRepresentation):
    principal: Principal
    subject: str | None
    purpose: str
    scope_id: str
    locale: str


@dataclass(frozen=True, repr=False)
class PIISpan(_SafeRepresentation):
    start: int
    end: int
    category: PIICategory
    text_masked: str = ""
    score: float = 1.0
    text_hash: str = ""
    detector: Detector = "rules"

    def __post_init__(self) -> None:
        if (type(self.start) is not int or type(self.end) is not int
                or not 0 <= self.start < self.end
                or not isinstance(self.category, PIICategory)
                or type(self.score) not in (int, float) or not 0 <= self.score <= 1
                or self.detector not in ("rules", "gazetteer", "ml")):
            raise PrivacyError() from None


Span = PIISpan


@dataclass(frozen=True, repr=False)
class PseudonymMap(_SafeRepresentation):
    """Backend-only map: placeholder -> original; persist encrypted in P4/P5."""

    scope_id: str
    entries: Mapping[str, str] = field(default_factory=dict)


@dataclass(frozen=True, repr=False)
class PseudonymizedBatch(_SafeRepresentation):
    texts: list[str]
    mapping_ref: str
    report: dict[PIICategory, int]


@dataclass(frozen=True, repr=False)
class CategoryPolicy(_SafeRepresentation):
    """Complete category -> action mapping; missing categories must block."""

    actions: Mapping[PIICategory, Action] = field(default_factory=dict)

    def action_for(self, category: PIICategory) -> Action:
        action = self.actions.get(category, "block")
        if action not in ("replace", "generalize", "keep", "block"):
            raise PolicyBlocked() from None
        return action


@dataclass(frozen=True, repr=False)
class PurposePolicy(_SafeRepresentation):
    purpose: str
    active: bool = False
    legal_basis: LegalBasis = LegalBasis.UNDEFINED
    requires_consent: bool = True
    pseudonymize_local: bool = False


@dataclass(frozen=True, repr=False)
class FieldRef(_SafeRepresentation):
    table: str
    column: str
    row_id: str
    subject_pid: str


@dataclass(frozen=True, repr=False)
class SealedValue(_SafeRepresentation):
    value: str


@dataclass(frozen=True, repr=False)
class ResourceRef(_SafeRepresentation):
    kind: Literal["result", "conversation", "notebook", "portfolio", "note", "map", "reference"]
    subject: str
    owner_group: str | None = None
    created_at: datetime | None = None


@dataclass(frozen=True, repr=False)
class Decision(_SafeRepresentation):
    allowed: bool = False
    reason_code: str = "privacy.errors.access_denied"
    grant_id: str | None = None


@dataclass(frozen=True, repr=False)
class PrivacyEvent(_SafeRepresentation):
    subject_pid: str
    actor_pid: str
    actor_role: PrivacyRole
    event_type: Literal["notice_viewed", "consent_given", "consent_refused", "consent_withdrawn",
                        "grant_created", "grant_revoked", "data_accessed", "ai_transmission",
                        "break_glass", "export", "erasure"]
    purpose: str


@dataclass(frozen=True, repr=False)
class Target(_SafeRepresentation):
    provider: str
    model: str
    resolved_host: str


@dataclass(frozen=True, repr=False)
class AIRequest(_SafeRepresentation):
    kind: AIKind
    target: Target
    texts: list[str]
    images: Sequence[bytes] = ()
    audio: bytes | None = None
    attachments_context: Sequence[str] = ()


@dataclass(frozen=True, repr=False)
class AIResponse(_SafeRepresentation):
    text: str


@dataclass(frozen=True, repr=False)
class AIChunk(_SafeRepresentation):
    text: str


@dataclass(frozen=True, repr=False)
class EgressRequirements(_SafeRepresentation):
    """A filter plan, never an authorization to send bytes."""

    external: bool
    pseudonymize: bool
    verify_residuals: bool
    authorize: bool = True
    record_event: bool = True


@runtime_checkable
class PIIDetector(Protocol):
    def detect_pii(self, text: str, ctx: PrivacyContext) -> list[PIISpan]: ...


@runtime_checkable
class Pseudonymizer(Protocol):
    def pseudonymize(self, texts: Sequence[str], ctx: PrivacyContext,
                     policy: CategoryPolicy) -> PseudonymizedBatch: ...


@runtime_checkable
class Depseudonymizer(Protocol):
    def depseudonymize(self, text: str, ctx: PrivacyContext) -> str: ...
