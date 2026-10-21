"""Personal-result choices racing for one step must share one binding (#249)."""
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Barrier

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker

from backend import auth, database, models, results_deep_dive
from backend.routes import class_paths


@pytest.mark.parametrize('different_results', [False, True])
def test_concurrent_personal_choices_never_replace_the_first_result(monkeypatch, different_results):
    assert os.environ['DATABASE_URL'] == 'postgresql://c5_test@127.0.0.1:18650/counselorbot_test'
    engine = create_engine(os.environ['DATABASE_URL'])
    schema = 'personal249_' + uuid.uuid4().hex

    @event.listens_for(engine, 'connect')
    def scope(connection, _):
        connection.autocommit = True
        with connection.cursor() as cursor:
            cursor.execute(f'SET search_path TO "{schema}"')
        connection.autocommit = False

    factory = sessionmaker(bind=engine, autoflush=False)
    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        models.Base.metadata.create_all(connection)
    try:
        with factory() as db:
            group = models.StudentGroup(code='SYN-249', name='Synthetic', owner_username='teacher')
            db.add(group)
            db.flush()
            path = models.ClassPath(group_id=group.id, title='Personal', mode='recommended', status='published',
                                    created_by='teacher', published_at=datetime.now(timezone.utc), revision=1)
            db.add(path)
            db.flush()
            step = models.ClassPathStep(path_id=path.id, position=1, step_type='guided_results_chat', tool_key='QSA',
                                        active_from=datetime.now(timezone.utc))
            rows = [models.QuestionnaireResult(session_id=f'original-{index}', questionnaire_type='QSA',
                                               scores={'C1': 5}, username='student') for index in range(2)]
            db.add_all([step, *rows, models.GroupMembership(group_id=group.id, username='student'),
                        models.Instrument(code='QSA', is_active=True, tool_category='assessment'),
                        models.Factor(instrument_code='QSA', code='C1')])
            db.commit()
            path_id, step_id, ids = path.id, step.id, [row.id for row in rows]
        app = FastAPI()
        app.include_router(class_paths.router)
        def request_db():
            with factory() as db:
                yield db
        app.dependency_overrides[database.get_db] = request_db
        app.dependency_overrides[auth.get_current_user] = lambda: {
            'username': 'student', 'authenticated': True, 'groups': [], 'is_admin': False}
        original = results_deep_dive.existing_binding
        def slow_binding(*args):
            binding = original(*args)
            time.sleep(.25)
            return binding
        monkeypatch.setattr(results_deep_dive, 'existing_binding', slow_binding)
        ready = Barrier(2)
        def start(index):
            with TestClient(app) as client:
                ready.wait(timeout=10)
                return client.post(f'/user/paths/{path_id}/steps/{step_id}/deep-dive',
                                   json={'result_id': ids[index if different_results else 0]})
        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(start, range(2)))
        assert sorted(row.status_code for row in responses) == ([200, 409] if different_results else [200, 200])
        if not different_results:
            assert responses[0].json() == responses[1].json()
        with factory() as db:
            assert db.query(models.ClassPathDeepDiveSession).count() == 1
            chosen = db.query(models.ClassPathDeepDiveSession).one().result_id
            assert chosen == next(row.json()['result']['id'] for row in responses if row.status_code == 200)
    finally:
        with engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        engine.dispose()
