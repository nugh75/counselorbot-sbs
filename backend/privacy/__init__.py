"""Public Privacy Layer contracts (P1); no I/O, keys or database on import.

The local engine (P4) lives in ``detect`` and ``pseudonymization``, imported on demand.
"""
from .errors import (
    AccessDenied, AuditUnavailable, ConsentMissingError, DetectorUnavailable,
    EgressBlockedError, IntegrityError, KeyUnavailable, PIIDetectorUnavailable,
    PolicyBlocked, PrivacyError, PurposeDisabled, PurposeDisabledError, ResidualPII,
)
from .policy import (
    AIGateway, authorize_data_access, configure_engine, decrypt_authorized, default_category_policy,
    depseudonymize, detect_pii, egress_requirements, encrypt_sensitive,
    is_local_target, is_trusted_local, pseudonymize, record_privacy_event, require_purpose,
    restore_authorized,
)
from .types import (
    Action, AIChunk, AIKind, AIRequest, AIResponse, Category, CategoryPolicy,
    DataAction, Decision, Depseudonymizer, Detector, EgressRequirements, FieldRef,
    LegalBasis, PIICategory, PIIDetector, PIISpan, Principal, PrivacyContext,
    PrivacyEvent, PrivacyPurpose, PrivacyRole, PseudonymizedBatch, Pseudonymizer,
    PseudonymMap, PurposePolicy, ResourceRef, SealedValue, SensitivityLevel, Span,
    Target, TreatmentMode,
)

__all__ = [
    "AccessDenied", "Action", "AIChunk", "AIGateway", "AIKind", "AIRequest", "AIResponse",
    "AuditUnavailable", "Category", "CategoryPolicy", "ConsentMissingError", "DataAction",
    "Decision", "Depseudonymizer", "Detector", "DetectorUnavailable", "EgressBlockedError",
    "EgressRequirements", "FieldRef", "IntegrityError", "KeyUnavailable", "LegalBasis",
    "PIICategory", "PIIDetector", "PIIDetectorUnavailable", "PIISpan", "PolicyBlocked",
    "Principal", "PrivacyContext", "PrivacyError", "PrivacyEvent", "PrivacyPurpose",
    "PrivacyRole", "PseudonymizedBatch", "Pseudonymizer", "PseudonymMap", "PurposeDisabled",
    "PurposeDisabledError", "PurposePolicy", "ResidualPII", "ResourceRef", "SealedValue",
    "SensitivityLevel", "Span", "Target", "TreatmentMode", "authorize_data_access",
    "configure_engine",
    "decrypt_authorized", "default_category_policy", "depseudonymize", "detect_pii",
    "egress_requirements", "encrypt_sensitive", "is_local_target", "is_trusted_local", "pseudonymize",
    "record_privacy_event", "require_purpose", "restore_authorized",
]
