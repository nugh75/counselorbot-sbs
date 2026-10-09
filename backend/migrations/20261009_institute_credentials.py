"""Idempotent canonical institute references for administration plans (#149).

Runs during normal startup after the teacher-institutes migration. Only rows not yet
classified (``institution_link_state IS NULL``) are processed, so a replay changes
nothing. Mapping uses the exact normalized institute code, never a school name:

- no legacy code -> ``unlinked`` (explicit no-institute mode, unchanged behavior);
- unknown, duplicated or inactive code, or a class linked to another institute ->
  ``needs_reconciliation`` with a reason code;
- an existing institute verifier is canonical: matching legacy duplicates are
  scrubbed, a different legacy value becomes ``credential_conflict``;
- an empty institute slot is filled only from one consistent plaintext legacy
  value; competing or hash-like values require teacher re-entry.

Logs report counts only, never codes or passwords.
"""
import logging
import re

from sqlalchemy import text

logger = logging.getLogger(__name__)

BCRYPT_RE = re.compile(r"^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$")


def _add_columns(connection):
    for statement in (
        "ALTER TABLE institutions ADD COLUMN IF NOT EXISTS institution_code VARCHAR(50)",
        "ALTER TABLE institutions ADD COLUMN IF NOT EXISTS hashed_password VARCHAR(255)",
        "ALTER TABLE institutions ADD COLUMN IF NOT EXISTS credentials_revision INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE administration_plans ADD COLUMN IF NOT EXISTS institution_code VARCHAR(50)",
        "ALTER TABLE administration_plans ADD COLUMN IF NOT EXISTS institution_password VARCHAR(100)",
        "ALTER TABLE administration_plans ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE administration_plans ADD COLUMN IF NOT EXISTS institution_id INTEGER",
        "ALTER TABLE administration_plans ADD COLUMN IF NOT EXISTS reconciliation_reason VARCHAR(64)",
        # No default yet: existing rows stay NULL until classified below.
        "ALTER TABLE administration_plans ADD COLUMN IF NOT EXISTS institution_link_state VARCHAR(32)",
    ):
        connection.execute(text(statement))
    has_fk = connection.execute(text("""
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'administration_plans'::regclass AND conname = 'fk_administration_plan_institution'
    """)).first()
    if not has_fk:
        connection.execute(text("""
            ALTER TABLE administration_plans ADD CONSTRAINT fk_administration_plan_institution
            FOREIGN KEY (institution_id) REFERENCES institutions(id) NOT VALID
        """))
        connection.execute(text("ALTER TABLE administration_plans VALIDATE CONSTRAINT fk_administration_plan_institution"))
    connection.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_administration_plans_institution_id ON administration_plans (institution_id)"
    ))


def _classify(connection):
    from backend import models

    plans = connection.execute(text("""
        SELECT p.id, p.institution_code, p.institution_password, g.institution_id AS class_institution_id
        FROM administration_plans p LEFT JOIN student_groups g ON g.id = p.group_id
        WHERE p.institution_link_state IS NULL ORDER BY p.id FOR UPDATE OF p
    """)).all()
    if not plans:
        return {}
    institutes = {}
    for row in connection.execute(text("""
        SELECT id, lower(btrim(institution_code)) AS code_key, hashed_password, is_active
        FROM institutions WHERE btrim(coalesce(institution_code, '')) <> '' ORDER BY id FOR UPDATE
    """)).all():
        institutes.setdefault(row.code_key, []).append(row)

    decisions = {}  # plan id -> (institution_id, state, reason, scrub)
    candidates = {}  # institute id -> (institute row, [plans])
    for plan in plans:
        code = (plan.institution_code or "").strip().lower()
        if not code:
            decisions[plan.id] = (None, "unlinked", None, False)
            continue
        matches = institutes.get(code, [])
        if not matches:
            decisions[plan.id] = (None, "needs_reconciliation", "institution_not_found", False)
        elif len(matches) > 1:
            decisions[plan.id] = (None, "needs_reconciliation", "ambiguous_institution", False)
        elif not matches[0].is_active:
            decisions[plan.id] = (matches[0].id, "needs_reconciliation", "institution_inactive", False)
        elif plan.class_institution_id and plan.class_institution_id != matches[0].id:
            decisions[plan.id] = (None, "needs_reconciliation", "class_institution_mismatch", False)
        else:
            candidates.setdefault(matches[0].id, (matches[0], []))[1].append(plan)

    migrated = 0
    for institute_id, (institute, rows) in candidates.items():
        with_password = [row for row in rows if row.institution_password]
        if institute.hashed_password:
            for row in rows:
                if not row.institution_password or models.verify_password(row.institution_password, institute.hashed_password):
                    decisions[row.id] = (institute_id, "linked", None, True)
                else:
                    decisions[row.id] = (institute_id, "needs_reconciliation", "credential_conflict", False)
            continue
        values = {row.institution_password for row in with_password}
        if len(values) == 1 and not BCRYPT_RE.match(next(iter(values))):
            connection.execute(text("""
                UPDATE institutions SET hashed_password = :hashed, revision = revision + 1,
                       credentials_revision = credentials_revision + 1
                WHERE id = :id AND hashed_password IS NULL
            """), {"hashed": models.get_password_hash(next(iter(values))), "id": institute_id})
            migrated += 1
            values = set()
        for row in rows:
            if row.institution_password and values:
                decisions[row.id] = (institute_id, "needs_reconciliation", "credential_reentry_required", False)
            else:
                decisions[row.id] = (institute_id, "linked", None, True)

    for plan_id, (institution_id, state, reason, scrub) in decisions.items():
        connection.execute(text(f"""
            UPDATE administration_plans SET institution_id = :institution_id, institution_link_state = :state,
                   reconciliation_reason = :reason{", institution_password = NULL" if scrub else ""}
            WHERE id = :id
        """), {"institution_id": institution_id, "state": state, "reason": reason, "id": plan_id})
    summary = {"credentials_migrated": migrated}
    for _, state, _, _ in decisions.values():
        summary[state] = summary.get(state, 0) + 1
    return summary


def migrate(engine):
    with engine.begin() as connection:
        if connection.dialect.name != "postgresql":
            return
        connection.execute(text("SELECT pg_advisory_xact_lock(14920261009)"))
        _add_columns(connection)
        summary = _classify(connection)
        connection.execute(text("ALTER TABLE administration_plans ALTER COLUMN institution_link_state SET DEFAULT 'unlinked'"))
        connection.execute(text("ALTER TABLE administration_plans ALTER COLUMN institution_link_state SET NOT NULL"))
        if summary:
            logger.info("Institute credentials migration: %s", ", ".join(f"{key}={value}" for key, value in sorted(summary.items())))
