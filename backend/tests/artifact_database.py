"""Postgres fixtures isolated in a rolled-back schema of counselorbot_test."""
import os
import uuid
from contextlib import contextmanager
from urllib.parse import urlsplit, urlunsplit

import psycopg2
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from backend import models


@contextmanager
def artifact_session():
    parsed = urlsplit(os.environ['DATABASE_URL'])
    test_url = urlunsplit((parsed.scheme, parsed.netloc, '/counselorbot_test', parsed.query, parsed.fragment))
    admin_url = urlunsplit((parsed.scheme, parsed.netloc, '/postgres', parsed.query, parsed.fragment))
    admin = psycopg2.connect(admin_url)
    try:
        admin.autocommit = True
        with admin.cursor() as cursor:
            cursor.execute('SELECT 1 FROM pg_database WHERE datname = %s', ('counselorbot_test',))
            if not cursor.fetchone():
                cursor.execute('CREATE DATABASE counselorbot_test')
    finally:
        admin.close()
    engine = create_engine(test_url)
    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                schema = 'artifacts_' + uuid.uuid4().hex
                connection.execute(text(f'CREATE SCHEMA "{schema}"'))
                connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
                models.Base.metadata.create_all(connection)
                with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
                    yield session
            finally:
                transaction.rollback()
    finally:
        engine.dispose()
