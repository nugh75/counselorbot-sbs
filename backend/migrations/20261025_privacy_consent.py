"""P9: portable, idempotent creation and conservative purpose defaults."""
from sqlalchemy.orm import Session

from .. import models
from ..db_compat import add_column_if_missing, dialect_insert

PURPOSES = {
    "guided_chat": "notice_ai",
    "teacher_noticing": "notice_ai",
    "teaching": "notice_student",
    "orientation": "notice_student",
    "research": "consent_research",
    "teacher_sharing": "consent_sharing",
    "survey_feedback": "notice_student",
    "administration_validation": "consent_research",
}


def migrate(engine):
    for table in (models.PrivacyDocument.__table__, models.PrivacyPurpose.__table__):
        table.create(engine, checkfirst=True)
    models.PrivacyEventRecord.__table__.create(engine, checkfirst=True)
    with Session(engine) as db:
        add_column_if_missing(db.connection(), "privacy_events", "document_locale", "VARCHAR(16)")
        for key, kind in PURPOSES.items():
            db.execute(dialect_insert(db, models.PrivacyPurpose.__table__).values(
                key=key, description_i18n={"it": "[DA VALIDARE]"},
                legal_basis="undefined", requires_consent=True, active=False,
                document_kind=kind,
            ).on_conflict_do_nothing(index_elements=["key"]))
        db.commit()
