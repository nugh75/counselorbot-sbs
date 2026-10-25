"""P12: allow independent credential DEKs; SQLite CHECKs follow the model at startup."""
from sqlalchemy import CheckConstraint, inspect, text

from .. import models
from ..db_compat import xact_lock


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    wanted = next(str(c.sqltext) for c in models.PrivacyKey.__table__.constraints
                  if isinstance(c, CheckConstraint) and c.name == "ck_privacy_key_purpose")
    with engine.begin() as connection:
        xact_lock(connection, "privacy-p12-schema")
        checks = inspect(connection).get_check_constraints("privacy_keys")
        if any(c["name"] == "ck_privacy_key_purpose" and "cred_institute" in c["sqltext"] for c in checks):
            return
        connection.execute(text("ALTER TABLE privacy_keys DROP CONSTRAINT IF EXISTS ck_privacy_key_purpose"))
        connection.execute(text("ALTER TABLE privacy_keys ADD CONSTRAINT ck_privacy_key_purpose CHECK (" + wanted + ")"))
