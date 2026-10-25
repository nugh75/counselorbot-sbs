"""Portable migration for teacher_student_grants, privacy_break_glass, privacy_events (P7).

Creates the authorization, break-glass, and audit event tables, and backfills
teacher_student_grants from existing group_memberships with institutional_assignment basis.
"""
from datetime import datetime, timezone
import json
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import models


def migrate(engine):
    """Run DDL updates on PostgreSQL; SQLite relies on create_all."""
    if engine.dialect.name == "postgresql":
        with engine.begin() as conn:
            conn.execute(text("SELECT pg_advisory_xact_lock(2026102501)"))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS teacher_student_grants (
                    id SERIAL PRIMARY KEY,
                    teacher_username VARCHAR(255) NOT NULL,
                    student_username VARCHAR(255) NOT NULL,
                    group_id INTEGER NOT NULL REFERENCES student_groups(id) ON DELETE CASCADE,
                    basis VARCHAR(64) NOT NULL,
                    categories JSON NOT NULL,
                    purposes JSON NOT NULL,
                    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
                    valid_until TIMESTAMP WITH TIME ZONE,
                    revoked_at TIMESTAMP WITH TIME ZONE,
                    revoked_by VARCHAR(255),
                    consent_event_id VARCHAR(64),
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                    CONSTRAINT ck_teacher_student_grant_basis CHECK (
                        basis IN ('institutional_assignment', 'organizational_authorization', 'consent', 'student_share')
                    )
                )
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_teacher_student_grants_lookup
                ON teacher_student_grants (teacher_username, student_username, group_id)
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_teacher_student_grants_group_id
                ON teacher_student_grants (group_id)
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS privacy_break_glass (
                    id SERIAL PRIMARY KEY,
                    admin_username VARCHAR(255) NOT NULL,
                    resource_kind VARCHAR(32) NOT NULL,
                    resource_id VARCHAR(128) NOT NULL,
                    subject_username VARCHAR(255) NOT NULL,
                    reason TEXT NOT NULL,
                    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
                    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
                    revoked_at TIMESTAMP WITH TIME ZONE,
                    revoked_by VARCHAR(255),
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
                )
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_privacy_break_glass_active
                ON privacy_break_glass (admin_username, subject_username, resource_kind)
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS privacy_events (
                    id VARCHAR(36) PRIMARY KEY,
                    subject_pid VARCHAR(32) NOT NULL,
                    actor_pid VARCHAR(32) NOT NULL,
                    actor_role VARCHAR(32) NOT NULL,
                    event_type VARCHAR(32) NOT NULL,
                    document_kind VARCHAR(64),
                    document_version VARCHAR(32),
                    purpose VARCHAR(64) NOT NULL,
                    choice VARCHAR(32),
                    target VARCHAR(128),
                    categories_count JSON,
                    valid_until TIMESTAMP WITH TIME ZONE,
                    device_ref VARCHAR(64),
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                    CONSTRAINT ck_privacy_event_type CHECK (
                        event_type IN ('notice_viewed', 'consent_given', 'consent_refused', 'consent_withdrawn',
                                       'grant_created', 'grant_revoked', 'data_accessed', 'ai_transmission',
                                       'break_glass', 'export', 'erasure')
                    )
                )
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_privacy_events_subject
                ON privacy_events (subject_pid, event_type)
            """))

    backfill_grants(engine)


def backfill_grants(engine_or_session) -> int:
    """Populate teacher_student_grants from group_memberships."""
    if isinstance(engine_or_session, Session):
        db = engine_or_session
        return _do_backfill(db)
    with Session(engine_or_session) as db:
        return _do_backfill(db)


def _do_backfill(db: Session) -> int:
        memberships = db.query(models.GroupMembership).all()
        created_count = 0
        default_categories = ["result", "conversation"]
        default_purposes = ["teaching", "orientation"]

        for m in memberships:
            group = db.get(models.StudentGroup, m.group_id)
            if not group or not group.owner_username:
                continue

            teachers = {group.owner_username}
            shares = db.query(models.GroupShare.shared_with_username).filter(
                models.GroupShare.group_id == group.id
            ).all()
            for (share_user,) in shares:
                if share_user:
                    teachers.add(share_user)

            grant_from = m.created_at or datetime.now(timezone.utc)

            for teacher in teachers:
                exists = db.query(models.TeacherStudentGrant.id).filter(
                    models.TeacherStudentGrant.teacher_username == teacher,
                    models.TeacherStudentGrant.student_username == m.username,
                    models.TeacherStudentGrant.group_id == group.id,
                ).first()
                if exists:
                    continue

                grant = models.TeacherStudentGrant(
                    teacher_username=teacher,
                    student_username=m.username,
                    group_id=group.id,
                    basis="institutional_assignment",
                    categories=default_categories,
                    purposes=default_purposes,
                    valid_from=grant_from,
                    valid_until=None,
                    revoked_at=None,
                    revoked_by=None,
                )
                db.add(grant)
                created_count += 1

        if created_count > 0:
            db.commit()
        return created_count
