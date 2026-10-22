"""Class-shared external password shown in the administration step.

The password issued by competenzestrategiche.it belongs to the institute and is
shared with every student of the class: it identifies the class on the external
site and is not a personal secret. CounselorBot still verifies it against the
bcrypt verifier; this module keeps a separate encrypted copy so that class
members can read it in the external administration step. Teacher and
administrator responses never return it.

The copy is encrypted with the installation Fernet key. The existing
``personal_api_credentials`` volume is reused deliberately: no new deployment
volume is required, and the managed key file is the one already used for personal
API credentials. ``INSTITUTION_CREDENTIAL_KEY`` (or ``_FILE``) can override it
with a dedicated key, and the directory follows ``PERSONAL_API_CREDENTIALS_DIR``.
"""
import logging
import os

from cryptography.fernet import InvalidToken

from .credential_storage import CredentialStorageError, CredentialStore

logger = logging.getLogger(__name__)

# Share the personal-credentials volume (and its managed key when no explicit
# INSTITUTION_CREDENTIAL_KEY is set), including deployments that relocate it.
_directory = os.getenv("PERSONAL_API_CREDENTIALS_DIR", "").strip() or "personal_api_credentials"
storage = CredentialStore("INSTITUTION", _directory)


def remember(password: str, *, has_stored: bool) -> str | None:
    """Encrypt the display copy; ``None`` only when the installation key is unusable.

    Saving the verifier is never blocked by this helper: the teacher keeps the
    working credential flow, and the student page falls back to asking the
    teacher when no readable display copy exists.
    """
    try:
        storage.prepare(lambda: has_stored)
        return storage.cipher().encrypt(password.encode("utf-8")).decode("ascii")
    except (CredentialStorageError, OSError, ValueError) as exc:
        logger.warning(
            "Institute password display copy unavailable (%s)", type(exc).__name__
        )
        return None


def reveal(sealed: str | None) -> str | None:
    """Return the readable class password, or ``None`` when no copy can be opened."""
    if not sealed:
        return None
    try:
        return storage.cipher().decrypt(sealed.encode("ascii")).decode("utf-8")
    except (
        CredentialStorageError,
        InvalidToken,
        UnicodeDecodeError,
        ValueError,
    ) as exc:
        logger.warning(
            "Institute password display copy unreadable (%s)", type(exc).__name__
        )
        return None
