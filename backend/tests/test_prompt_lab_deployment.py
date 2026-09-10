"""Opt-in checks from inside the restricted worker, without writing any real data.

PROMPT_LAB_DEPLOYMENT_TEST=1 python -m pytest backend/tests/test_prompt_lab_deployment.py -q
"""
import os
import socket

import pytest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from backend.prompt_lab import storage

pytestmark = pytest.mark.skipif(os.getenv('PROMPT_LAB_DEPLOYMENT_TEST') != '1', reason='requires the isolated worker container')


def test_worker_has_only_lab_permissions():
    with storage.session_factory()() as db:
        assert db.execute(text('SELECT current_user')).scalar() == 'prompt_lab_worker'
        assert db.execute(text('SELECT current_database()')).scalar() == 'prompt_lab'
        for statement in [
            'UPDATE lab_runs SET manifest = manifest WHERE false',
            'UPDATE lab_runs SET cancel_requested = true WHERE false',
            'UPDATE lab_experiments SET snapshot = snapshot WHERE false',
            'UPDATE lab_results SET response = response WHERE false',
            'DELETE FROM lab_results WHERE false',
            'CREATE TABLE lab_forbidden_test (id integer)',
        ]:
            with pytest.raises(SQLAlchemyError):
                db.execute(text(statement))
            db.rollback()
        assert db.execute(text("SELECT to_regclass('configs')")).scalar() is None
        assert db.execute(text("SELECT to_regclass('system_logs')")).scalar() is None
        assert db.execute(text("SELECT to_regclass('prompt_revisions')")).scalar() is None


def test_worker_cannot_reach_production_or_internet():
    assert not os.getenv('DATABASE_URL')
    assert not os.getenv('OPENAI_API_KEY')
    assert not os.getenv('DEEPSEEK_API_KEY')
    for host, port in [('backend', 8000), ('postgres', 5432), ('1.1.1.1', 443)]:
        with pytest.raises(OSError):
            connection = socket.create_connection((host, port), timeout=1)
            connection.close()
    with socket.create_connection(('prompt-lab-model-gateway', 8080), timeout=2):
        pass
