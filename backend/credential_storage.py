"""Private, persistent encryption keys prepared by administrative activation."""
import os
import tempfile
from pathlib import Path

from cryptography.fernet import Fernet
from sqlalchemy.exc import SQLAlchemyError

from .privacy import crypto
from .privacy.errors import IntegrityError, KeyUnavailable

SWITCH_VARIABLE = "PRIVACY_CREDENTIAL_ENCRYPTION"
PURPOSES = {"PERSONAL_API": "cred_api", "CHATGPT": "cred_chatgpt", "INSTITUTION": "cred_institute"}


def dek_enabled():
    value = os.getenv(SWITCH_VARIABLE, "").strip().lower()
    if value not in {"", "0", "off", "false", "no", "1", "on", "true", "yes"}:
        raise CredentialStorageError("notConfigured")
    return value in {"1", "on", "true", "yes"}


class _CredentialCipher:
    """Fernet-compatible byte interface, with strict version dispatch."""

    def __init__(self, store):
        self.store = store

    def encrypt(self, value):
        if not dek_enabled():
            return self.store.legacy_cipher().encrypt(value)
        key_id, key = self.store._with_ring(lambda ring: ring.active(self.store.purpose, create=False))
        return crypto.seal(key, key_id, value, self.store.aad).encode("ascii")

    def decrypt(self, value):
        if not value.startswith(b"v1."):
            return self.store.legacy_cipher().decrypt(value)
        try:
            token = value.decode("ascii")
            key_id = crypto.key_id_of(token)
            key = self.store._with_ring(lambda ring: ring.key(key_id, self.store.purpose))
            return crypto.open_sealed(key, token, self.store.aad)
        except (IntegrityError, UnicodeError):
            raise CredentialStorageError("notConfigured") from None


class CredentialStorageError(ValueError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


class CredentialStore:
    def __init__(self, prefix, directory, key_variable=None, *, session_factory=None):
        self.session_factory = session_factory
        self.purpose = PURPOSES[prefix]
        self.aad = f"credential_store:{self.purpose}:v1".encode("ascii")
        self.prefix = prefix
        self.directory = directory
        self.key_variable = key_variable or prefix + "_CREDENTIAL_KEY"

    def path(self):
        directory = os.getenv(self.prefix + "_CREDENTIALS_DIR", "").strip()
        root = Path(directory) if directory else Path(__file__).resolve().parents[1] / self.directory
        return root / "credential.key"

    def source(self):
        if dek_enabled():
            return "environment"
        return "environment" if os.getenv(self.key_variable, "").strip() or os.getenv(self.key_variable + "_FILE", "").strip() else "managed"

    def _with_ring(self, use):
        from .privacy.keys import KeyRing
        factory = self.session_factory
        if factory is None:
            from .database import SessionLocal as factory
        try:
            with factory() as db:
                result = use(KeyRing(db))
                db.commit()
                return result
        except KeyUnavailable:
            raise CredentialStorageError("keyMissing") from None
        except (IntegrityError, SQLAlchemyError):
            raise CredentialStorageError("notConfigured") from None

    def cipher(self):
        # Readiness is checked separately: versioned reads also work with the switch off.
        return _CredentialCipher(self)

    def check_ready(self):
        if dek_enabled():
            self._with_ring(lambda ring: ring.active(self.purpose, create=False))
        else:
            self.legacy_cipher()

    def legacy_cipher(self):
        key = os.getenv(self.key_variable, "").strip()
        filename = os.getenv(self.key_variable + "_FILE", "").strip()
        try:
            if filename or not key:
                key = (Path(filename) if filename else self.path()).read_text().strip()
            return Fernet(key.encode())
        except (ValueError, OSError, UnicodeError):
            raise CredentialStorageError("notConfigured") from None

    def prepare(self, has_credentials):
        if dek_enabled():
            self.check_ready()
            return
        if self.source() == "environment":
            self.legacy_cipher()
            return
        path = self.path()
        if not path.exists():
            if has_credentials():
                raise CredentialStorageError("keyMissing")
            temporary = None
            try:
                path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                path.parent.chmod(0o700)
                fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".key-")
                with os.fdopen(fd, "wb") as output:
                    output.write(Fernet.generate_key())
                    output.flush()
                    os.fsync(output.fileno())
                try:
                    os.link(temporary, path)
                except FileExistsError:
                    pass
                directory_fd = os.open(path.parent, os.O_RDONLY)
                try:
                    os.fsync(directory_fd)
                finally:
                    os.close(directory_fd)
            except OSError:
                raise CredentialStorageError("notConfigured") from None
            finally:
                if temporary is not None:
                    Path(temporary).unlink(missing_ok=True)
        self.legacy_cipher()

    def status(self, has_credentials):
        try:
            source = self.source()
        except CredentialStorageError:
            return {"ready": False, "reason": "notConfigured", "key_source": "environment"}
        try:
            self.check_ready()
            return {"ready": True, "reason": None, "key_source": source}
        except CredentialStorageError as exc:
            reason = exc.code
            if source == "managed" and not self.path().exists() and has_credentials():
                reason = "keyMissing"
            return {"ready": False, "reason": reason, "key_source": source}


def ensure_keys():
    """Pre-create credential DEKs outside request write transactions (SQLite)."""
    if dek_enabled():
        from . import chatgpt_connections, institution_password, personal_api
        for store in (personal_api.storage, chatgpt_connections.storage, institution_password.storage):
            def initialize(ring):
                from . import models
                columns = {
                    "PERSONAL_API": (models.PersonalAPISettings.encrypted_key, models.PersonalAPIConnection.encrypted_key),
                    "CHATGPT": (models.ChatGPTConnection.encrypted_credentials,),
                    "INSTITUTION": (models.Institution.encrypted_password,),
                }[store.prefix]
                # Never replace a lost active DEK when the database already contains this format.
                has_versioned = any(ring.db.query(column).filter(column.like("v1.%")).first() is not None
                                    for column in columns)
                return ring.active(store.purpose, create=not has_versioned)
            store._with_ring(initialize)
