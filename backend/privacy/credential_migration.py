"""Offline, bounded and idempotent P12 rewrite. Stop credential writers before use.

Run ``python -m backend.privacy.credential_migration --apply`` with the same protected
key environment as the backend. Only counters or fixed error codes reach stdout/stderr.
"""
import argparse
import json

from cryptography.fernet import InvalidToken
from sqlalchemy.exc import SQLAlchemyError

from .. import models, personal_api, chatgpt_connections, institution_password
from ..credential_storage import CredentialStorageError, dek_enabled, ensure_keys
from . import crypto


def targets():
    return (
        (models.PersonalAPISettings, "username", "encrypted_key", personal_api.storage),
        (models.PersonalAPIConnection, "id", "encrypted_key", personal_api.storage),
        (models.ChatGPTConnection, "username", "encrypted_credentials", chatgpt_connections.storage),
        (models.Institution, "id", "encrypted_password", institution_password.storage),
    )


def rewrite(db, *, batch_size=100):
    """Commit batches; reruns skip current DEKs. On error the current batch is rolled back.

    This function requires on, all DEKs initialized, and no concurrent credential
    writers/rotation. The caller must close/rollback its session after failure.
    """
    if not dek_enabled() or batch_size < 1:
        raise CredentialStorageError("notConfigured")
    counts = {"scanned": 0, "rewritten": 0}
    for model, pk, column, store in targets():
        active_id, _ = store._with_ring(lambda ring: ring.active(store.purpose, create=False))
        last_id = None
        while True:
            query = db.query(model).filter(getattr(model, column).isnot(None))
            if last_id is not None:
                query = query.filter(getattr(model, pk) > last_id)
            rows = query.order_by(getattr(model, pk)).limit(batch_size).all()
            if not rows:
                break
            for row in rows:
                token = getattr(row, column)
                if token:
                    try:
                        clear = store.cipher().decrypt(token.encode("ascii"))
                    except CredentialStorageError:
                        raise
                    except (InvalidToken, UnicodeError, ValueError):
                        raise CredentialStorageError("notConfigured") from None
                    counts["scanned"] += 1
                    if not token.startswith("v1.") or crypto.key_id_of(token) != active_id:
                        setattr(row, column, store.cipher().encrypt(clear).decode("ascii"))
                        counts["rewritten"] += 1
                last_id = getattr(row, pk)
            db.commit()
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", required=True)
    parser.add_argument("--batch-size", type=int, default=100)
    args = parser.parse_args()
    try:
        if not dek_enabled() or args.batch_size < 1:
            raise CredentialStorageError("notConfigured")
        ensure_keys()
        from ..database import SessionLocal
        with SessionLocal() as db:
            print(json.dumps(rewrite(db, batch_size=args.batch_size)))
    except CredentialStorageError as exc:
        parser.exit(1, "credential_migration: " + exc.code + "\n")
    except SQLAlchemyError:
        parser.exit(1, "credential_migration: notConfigured\n")


if __name__ == "__main__":
    main()
