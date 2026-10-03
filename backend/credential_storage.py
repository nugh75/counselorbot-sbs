"""Private, persistent encryption keys prepared by administrative activation."""
import os
from pathlib import Path
import tempfile

from cryptography.fernet import Fernet


class CredentialStorageError(ValueError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


class CredentialStore:
    def __init__(self, prefix, directory, key_variable=None):
        self.prefix = prefix
        self.directory = directory
        self.key_variable = key_variable or prefix + "_CREDENTIAL_KEY"

    def path(self):
        directory = os.getenv(self.prefix + "_CREDENTIALS_DIR", "").strip()
        root = Path(directory) if directory else Path(__file__).resolve().parents[1] / self.directory
        return root / "credential.key"

    def source(self):
        return "environment" if os.getenv(self.key_variable, "").strip() or os.getenv(self.key_variable + "_FILE", "").strip() else "managed"

    def cipher(self):
        key = os.getenv(self.key_variable, "").strip()
        filename = os.getenv(self.key_variable + "_FILE", "").strip()
        try:
            if filename or not key:
                key = (Path(filename) if filename else self.path()).read_text().strip()
            return Fernet(key.encode())
        except (ValueError, OSError):
            raise CredentialStorageError("notConfigured") from None

    def prepare(self, has_credentials):
        if self.source() == "environment":
            self.cipher()
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
        self.cipher()

    def status(self, has_credentials):
        try:
            self.cipher()
            return {"ready": True, "reason": None, "key_source": self.source()}
        except CredentialStorageError as exc:
            reason = exc.code
            if self.source() == "managed" and not self.path().exists() and has_credentials():
                reason = "keyMissing"
            return {"ready": False, "reason": reason, "key_source": self.source()}
