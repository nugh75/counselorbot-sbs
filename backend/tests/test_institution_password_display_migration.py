"""Encrypted display-copy migration on disposable synthetic PostgreSQL schemas.

The migration is additive: verification keeps using ``hashed_password`` and
pre-existing credentials simply have no readable copy until re-entered.
"""
import os
import uuid
from importlib import import_module

import pytest
from sqlalchemy import create_engine, event, text

from backend import models

migration = import_module('backend.migrations.20261022_institution_password_display')


@pytest.fixture
def legacy():
    url = os.environ['DATABASE_URL']
    assert url.rsplit('/', 1)[-1] == 'counselorbot_test'
    schema = 'tf2p_' + uuid.uuid4().hex
    engine = create_engine(url)

    @event.listens_for(engine, 'connect')
    def search_path(connection, _):
        with connection.cursor() as cursor:
            cursor.execute(f'SET search_path TO "{schema}"')

    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    with engine.begin() as connection:
        models.Base.metadata.create_all(connection)
        # Recreate the pre-migration shape: hashed verifier only.
        connection.execute(text('ALTER TABLE institutions DROP COLUMN encrypted_password'))

    def sql(statement, **params):
        with engine.begin() as connection:
            result = connection.execute(text(statement), params)
            return result.all() if result.returns_rows else result

    yield engine, sql
    with engine.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    engine.dispose()


def columns(sql):
    return {row[0]: (row[1], row[2]) for row in sql(
        "SELECT column_name, is_nullable, data_type FROM information_schema.columns "
        "WHERE table_schema = current_schema() AND table_name = 'institutions'")}


def school(sql, password):
    return sql("INSERT INTO institutions (slug, name, kind, is_active, revision, institution_code, hashed_password) "
               "VALUES (:slug, 'Synthetic school', 'school', true, 1, 'SYN-149', :hashed) RETURNING id",
               slug=f'syn-149-{uuid.uuid4().hex}', hashed=models.get_password_hash(password))[0][0]


def test_migration_adds_a_nullable_encrypted_copy_without_touching_verifiers(legacy):
    engine, sql = legacy
    school_id = school(sql, 'Synthetic-Pass-149')
    assert 'encrypted_password' not in columns(sql)
    migration.migrate(engine)
    assert columns(sql)['encrypted_password'] == ('YES', 'text')
    hashed, sealed = sql('SELECT hashed_password, encrypted_password FROM institutions WHERE id = :id',
                         id=school_id)[0]
    # Legacy credentials stay verifiable and get no readable copy.
    assert models.verify_password('Synthetic-Pass-149', hashed)
    assert sealed is None


def test_migration_is_replay_safe(legacy):
    engine, sql = legacy
    school(sql, 'Synthetic-Pass-149')
    migration.migrate(engine)
    first = sql('SELECT * FROM institutions ORDER BY id')
    migration.migrate(engine)
    assert sql('SELECT * FROM institutions ORDER BY id') == first
