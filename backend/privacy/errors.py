"""Content-free errors: only fixed i18n codes may cross the privacy boundary.

Caller arguments are deliberately discarded, including a supplied ``code``.
Translate provider failures with ``raise PrivacyError() from None``. Never
attach original exceptions, log frame locals or serialize sensitive objects.
"""
from __future__ import annotations

from typing import ClassVar


class PrivacyError(Exception):
    code: ClassVar[str] = "privacy.errors.unavailable"

    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(type(self).code)
        # Hide implicit exception context in standard traceback formatting.
        self.__suppress_context__ = True

    def __str__(self) -> str:
        return type(self).code

    def __repr__(self) -> str:
        return f"{type(self).__name__}({type(self).code!r})"

    def add_note(self, note: str) -> None:
        """Do not retain free-text diagnostic notes (also on Python 3.10)."""
        return None


class PIIDetectorUnavailable(PrivacyError):
    code = "privacy.errors.detector_unavailable"


class KeyUnavailable(PrivacyError):
    code = "privacy.errors.key_unavailable"


class IntegrityError(PrivacyError):
    code = "privacy.errors.integrity_error"


class ConsentMissingError(PrivacyError):
    code = "privacy.errors.consent_missing"


class PurposeDisabledError(PrivacyError):
    code = "privacy.errors.purpose_disabled"


class EgressBlockedError(PrivacyError):
    code = "privacy.errors.egress_blocked"


class PolicyBlocked(PrivacyError):
    code = "privacy.errors.policy_blocked"


class ResidualPII(PrivacyError):
    code = "privacy.errors.residual_pii"


class AccessDenied(PrivacyError):
    code = "privacy.errors.access_denied"


class AuditUnavailable(PrivacyError):
    code = "privacy.errors.audit_unavailable"


# Names used by the design document and downstream P4/P9 blocks.
DetectorUnavailable = PIIDetectorUnavailable
PurposeDisabled = PurposeDisabledError
