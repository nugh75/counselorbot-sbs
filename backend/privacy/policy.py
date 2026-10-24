"""Conservative policy defaults and fail-closed, unconfigured operations.

P1 does not register these stubs with existing routes. P4/P5/P6/P7/P8/P9
will supply detection, crypto, gateway, grants, audit and consent storage.
"""
from __future__ import annotations

from ipaddress import ip_address
from typing import Iterator, Sequence

from .errors import (
    AccessDenied, AuditUnavailable, ConsentMissingError, EgressBlockedError,
    KeyUnavailable, PIIDetectorUnavailable, PolicyBlocked, PurposeDisabledError,
)
from .types import (
    Action, AIChunk, AIRequest, AIResponse, CategoryPolicy, DataAction, Decision,
    EgressRequirements, FieldRef, LegalBasis, PIICategory, PIISpan, Principal,
    PrivacyContext, PrivacyEvent, PrivacyPurpose, PseudonymizedBatch,
    PurposePolicy, ResourceRef, SealedValue, Target,
)


def default_category_policy(*, external: bool = True) -> CategoryPolicy:
    if type(external) is not bool:
        raise PolicyBlocked() from None
    actions: dict[PIICategory, Action] = {
        category: "replace" if external else "keep" for category in PIICategory
    }
    if external:
        for category in (PIICategory.BIRTH_DATE, PIICategory.SCHOOL, PIICategory.ORGANIZATION):
            actions[category] = "generalize"
        for category in (PIICategory.HEALTH, PIICategory.ART9_OTHER):
            actions[category] = "block"
    return CategoryPolicy(actions)


def require_purpose(ctx: PrivacyContext, policy: PurposePolicy | None = None, *,
                    consent_granted: bool = False) -> None:
    """Consent is a current backend decision, never a client checkbox."""
    if (policy is None or policy.purpose != ctx.purpose or policy.active is not True
            or not isinstance(policy.legal_basis, LegalBasis)
            or policy.legal_basis is LegalBasis.UNDEFINED
            or type(policy.requires_consent) is not bool):
        raise PurposeDisabledError() from None
    if (policy.requires_consent or policy.legal_basis is LegalBasis.CONSENT) and consent_granted is not True:
        raise ConsentMissingError() from None


def is_local_target(target: Target, *, local_hosts: Sequence[str] = ()) -> bool:
    """Classify a resolved host, without DNS/network or provider-name inference.

Allowlist entries must be IP literals from trusted backend configuration.
Hostnames and malformed values are treated as external until resolved by P6.
"""
    try:
        address = ip_address(target.resolved_host)
    except ValueError:
        return False
    if address.is_loopback:
        return True
    for host in local_hosts:
        try:
            if address == ip_address(host):
                return True
        except ValueError:
            continue
    return False


def egress_requirements(request: AIRequest, ctx: PrivacyContext,
                        policy: PurposePolicy | None = None, *,
                        consent_granted: bool = False,
                        local_hosts: Sequence[str] = ()) -> EgressRequirements:
    require_purpose(ctx, policy, consent_granted=consent_granted)
    if request.kind not in ("chat", "chat_stream", "summary", "vision", "embedding", "tts",
                            "transcription", "ocr", "notify"):
        raise EgressBlockedError() from None
    external = not is_local_target(request.target, local_hosts=local_hosts)
    if external and (request.images or request.audio is not None):
        raise EgressBlockedError() from None
    pseudonymize = (external or policy is None or policy.pseudonymize_local is not False
                    or ctx.purpose in (PrivacyPurpose.TEACHER_NOTICING, PrivacyPurpose.RESEARCH))
    return EgressRequirements(external, pseudonymize, pseudonymize)


def detect_pii(text: str, ctx: PrivacyContext) -> list[PIISpan]:
    raise PIIDetectorUnavailable() from None


def pseudonymize(texts: Sequence[str], ctx: PrivacyContext,
                 policy: CategoryPolicy) -> PseudonymizedBatch:
    raise PIIDetectorUnavailable() from None


def depseudonymize(text: str, ctx: PrivacyContext) -> str:
    raise AccessDenied() from None


restore_authorized = depseudonymize


def encrypt_sensitive(value: bytes, field: FieldRef) -> SealedValue:
    raise KeyUnavailable() from None


def decrypt_authorized(sealed: SealedValue, field: FieldRef, ctx: PrivacyContext) -> bytes:
    # Authorization precedes all key access, even when no key service exists.
    raise AccessDenied() from None


def authorize_data_access(principal: Principal, action: DataAction,
                          resource: ResourceRef, purpose: str) -> Decision:
    return Decision()


def record_privacy_event(event: PrivacyEvent) -> None:
    raise AuditUnavailable() from None


class AIGateway:
    """No provider is configured in P1; never returns input as a fallback."""

    def send(self, request: AIRequest, ctx: PrivacyContext) -> AIResponse | Iterator[AIChunk]:
        raise EgressBlockedError() from None
