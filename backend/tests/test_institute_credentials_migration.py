"""Legacy administration credential migration on disposable synthetic PostgreSQL schemas.

Fixture passwords are invented. Each case runs the migration twice to prove replay safety.
"""
import logging
import os
import uuid
from importlib import import_module

import pytest
from sqlalchemy import create_engine, event, text

from backend import models

DB_URL = 'postgresql://c4_test@127.0.0.1:18649/counselorbot_test'
migration = import_module('backend.migrations.20261009_institute_credentials')
tf1 = import_module('backend.migrations.20261009_teacher_institutes')
NEW_PLAN_COLUMNS = ('institution_id', 'revision', 'institution_link_state', 'reconciliation_reason')


@pytest.fixture
def legacy():
    url = os.environ['DATABASE_URL']
    assert url == DB_URL
    schema = 'tf2m_' + uuid.uuid4().hex
    engine = create_engine(url)

    @event.listens_for(engine, 'connect')
    def search_path(connection, _):
        with connection.cursor() as cursor:
            cursor.execute(f'SET search_path TO "{schema}"')

    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    with engine.begin() as connection:
        models.Base.metadata.create_all(connection)
        # Recreate the pre-#149 shape: no canonical reference or grant table.
        for column in NEW_PLAN_COLUMNS:
            connection.execute(text(f'ALTER TABLE administration_plans DROP COLUMN {column}'))
        connection.execute(text('ALTER TABLE institutions DROP COLUMN credentials_revision'))
    tf1.migrate(engine)

    def sql(statement, **params):
        with engine.begin() as connection:
            result = connection.execute(text(statement), params)
            return result.all() if result.returns_rows else result

    yield engine, sql
    with engine.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    engine.dispose()


def institute(sql, code, password=None, name=None):
    hashed = models.get_password_hash(password) if password else None
    return sql("INSERT INTO institutions (slug, name, kind, is_active, revision, institution_code, hashed_password) "
               "VALUES (:slug, :name, 'school', true, 1, :code, :hashed) RETURNING id",
               slug=f'{code}-{uuid.uuid4().hex}', name=name or code, code=code, hashed=hashed)[0][0]


def legacy_plan(sql, code=None, password=None, group_id=None):
    return sql("INSERT INTO administration_plans (code, title, instrument_code, locale, status, group_id, "
               "institution_code, institution_password) VALUES (:plan, 'Legacy', 'QSA', 'it', 'active', :group, "
               ":code, :password) RETURNING id", plan=f'AP-{uuid.uuid4().hex[:8].upper()}', group=group_id,
               code=code, password=password)[0][0]


def state(sql, plan_id):
    return sql('SELECT institution_id, institution_link_state, reconciliation_reason, institution_password, revision '
               'FROM administration_plans WHERE id = :id', id=plan_id)[0]


def run_twice(engine, sql):
    migration.migrate(engine)
    first = sql('SELECT * FROM administration_plans ORDER BY id'), sql('SELECT * FROM institutions ORDER BY id')
    migration.migrate(engine)
    assert (sql('SELECT * FROM administration_plans ORDER BY id'), sql('SELECT * FROM institutions ORDER BY id')) == first


def test_canonical_verifier_is_kept_and_verified_duplicates_are_scrubbed(legacy):
    engine, sql = legacy
    school = institute(sql, 'SYN-CANON', 'Canon-pass')
    verified = legacy_plan(sql, ' syn-canon ', 'Canon-pass')
    code_only = legacy_plan(sql, 'SYN-CANON')
    conflicting = legacy_plan(sql, 'SYN-CANON', 'Other-pass')
    run_twice(engine, sql)
    assert state(sql, verified) == (school, 'linked', None, None, 1)
    assert state(sql, code_only) == (school, 'linked', None, None, 1)
    # A conflicting duplicate never replaces the canonical verifier.
    assert state(sql, conflicting)[:3] == (school, 'needs_reconciliation', 'credential_conflict')
    hashed = sql('SELECT hashed_password FROM institutions WHERE id = :id', id=school)[0][0]
    assert models.verify_password('Canon-pass', hashed)


def test_unique_consistent_legacy_password_fills_an_empty_institute_slot(legacy):
    engine, sql = legacy
    school = institute(sql, 'SYN-EMPTY')
    first = legacy_plan(sql, 'SYN-EMPTY', 'Shared-pass')
    second = legacy_plan(sql, 'syn-empty', 'Shared-pass')
    run_twice(engine, sql)
    hashed, revision, credentials_revision = sql(
        'SELECT hashed_password, revision, credentials_revision FROM institutions WHERE id = :id', id=school)[0]
    assert hashed != 'Shared-pass' and models.verify_password('Shared-pass', hashed)
    assert (revision, credentials_revision) == (2, 2)
    assert state(sql, first) == (school, 'linked', None, None, 1)
    assert state(sql, second) == (school, 'linked', None, None, 1)


def test_competing_or_hash_like_legacy_passwords_require_teacher_reentry(legacy):
    engine, sql = legacy
    competing = institute(sql, 'SYN-AMBIG')
    left = legacy_plan(sql, 'SYN-AMBIG', 'Left-pass')
    right = legacy_plan(sql, 'SYN-AMBIG', 'Right-pass')
    hashed_school = institute(sql, 'SYN-HASH')
    hash_like = legacy_plan(sql, 'SYN-HASH', models.get_password_hash('Unknown-pass'))
    run_twice(engine, sql)
    for plan_id, school in ((left, competing), (right, competing), (hash_like, hashed_school)):
        assert state(sql, plan_id)[:3] == (school, 'needs_reconciliation', 'credential_reentry_required')
        # The unresolved legacy value stays for the reviewed reconciliation, never selected silently.
        assert state(sql, plan_id)[3] is not None
    assert sql('SELECT count(*) FROM institutions WHERE hashed_password IS NOT NULL')[0][0] == 0


def test_missing_institutes_and_class_mismatches_need_reconciliation(legacy):
    engine, sql = legacy
    school = institute(sql, 'SYN-CLASS', 'Class-pass')
    other = institute(sql, 'SYN-ELSEWHERE', 'Else-pass')
    group = sql("INSERT INTO student_groups (code, name, owner_username, institution_id, is_active, "
                "context_visible_to_students) VALUES ('GR-149M', 'Class', 'first', :inst, true, false) RETURNING id",
                inst=other)[0][0]
    unknown = legacy_plan(sql, 'SYN-UNKNOWN', 'Lost-pass')
    mismatch = legacy_plan(sql, 'SYN-CLASS', 'Class-pass', group_id=group)
    compatible = legacy_plan(sql, 'SYN-ELSEWHERE', 'Else-pass', group_id=group)
    plain = legacy_plan(sql)
    run_twice(engine, sql)
    assert state(sql, unknown)[:3] == (None, 'needs_reconciliation', 'institution_not_found')
    assert state(sql, mismatch)[:3] == (None, 'needs_reconciliation', 'class_institution_mismatch')
    assert state(sql, compatible) == (other, 'linked', None, None, 1)
    # No institute is inferred for a plan that never claimed one, even from its class.
    assert state(sql, plain) == (None, 'unlinked', None, None, 1)
    assert school != other


def test_migration_logs_counts_only_and_new_rows_default_to_unlinked(legacy, caplog):
    engine, sql = legacy
    institute(sql, 'SYN-LOG')
    legacy_plan(sql, 'SYN-LOG', 'Log-secret-pass')
    caplog.set_level(logging.DEBUG)
    migration.migrate(engine)
    assert 'Log-secret-pass' not in caplog.text and 'SYN-LOG' not in caplog.text
    new = sql("INSERT INTO administration_plans (code, title, instrument_code, locale, status) "
              "VALUES ('AP-NEW149', 'New', 'QSA', 'en', 'planned') RETURNING id")[0][0]
    assert state(sql, new) == (None, 'unlinked', None, None, 1)
    constraints = {row[0] for row in sql("SELECT conname FROM pg_constraint WHERE conrelid = 'administration_plans'::regclass")}
    assert 'fk_administration_plan_institution' in constraints
