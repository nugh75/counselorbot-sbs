"""Idempotent institute metadata and legacy class foreign-key remediation.

Run on the configured database during normal startup. No credentials are read or
copied; orphaned IDs become unlinked classes, preserving every class record.
"""
import logging
from sqlalchemy import text

logger = logging.getLogger(__name__)


def migrate(engine):
    with engine.begin() as connection:
        if connection.dialect.name != 'postgresql':
            return
        connection.execute(text("SELECT pg_advisory_xact_lock(14820261009)"))
        connection.execute(text("ALTER TABLE institutions ADD COLUMN IF NOT EXISTS created_by VARCHAR"))
        connection.execute(text("ALTER TABLE institutions ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1"))
        repaired = connection.execute(text("""
            UPDATE student_groups SET institution_id = NULL
            WHERE institution_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM institutions WHERE institutions.id = student_groups.institution_id)
        """))
        if repaired.rowcount:
            logger.info("Teacher institutes migration unlinked %d orphaned class references", repaired.rowcount)
        has_fk = connection.execute(text("""
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'student_groups'::regclass AND confrelid = 'institutions'::regclass AND contype = 'f'
        """)).first()
        if not has_fk:
            connection.execute(text("""
                ALTER TABLE student_groups ADD CONSTRAINT fk_student_group_institution
                FOREIGN KEY (institution_id) REFERENCES institutions(id) NOT VALID
            """))
            connection.execute(text("ALTER TABLE student_groups VALIDATE CONSTRAINT fk_student_group_institution"))
