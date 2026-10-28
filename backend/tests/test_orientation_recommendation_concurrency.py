"""Concurrent saves use independent requests and a disposable database."""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker

from backend import auth, database, models
from backend.routes import orientation_recommendation
from backend.tests.artifact_database import TEST_DB, sqlite_engine


@pytest.fixture
def app(tmp_path):
    schema = None
    if TEST_DB == 'sqlite':
        engine = sqlite_engine(tmp_path / 'orientation.sqlite')
        models.Base.metadata.create_all(engine)
    else:
        url = os.environ['DATABASE_URL']
        assert url == 'postgresql://c5_test@127.0.0.1:18650/counselorbot_test'
        schema = 'orientation_' + uuid.uuid4().hex
        engine = create_engine(url)
        with engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        @event.listens_for(engine, 'connect')
        def set_schema(connection, _):
            connection.autocommit = True
            with connection.cursor() as cursor:
                cursor.execute(f'SET search_path TO "{schema}"')
            connection.autocommit = False
        engine.dispose()
        models.Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        group = models.StudentGroup(name='Synthetic', code='SYN-C', owner_username='teacher')
        db.add(group)
        db.flush()
        db.add(models.GroupMembership(group_id=group.id, username='alice'))
        db.commit()
        group_id = group.id
    app = FastAPI()
    app.include_router(orientation_recommendation.router)
    def get_db():
        with factory() as db:
            yield db
    app.dependency_overrides[database.get_db] = get_db
    app.dependency_overrides[auth.get_current_plan_manager] = lambda: dict(username='teacher', groups=['docenti'], authenticated=True, is_admin=False)
    yield app, group_id
    if schema:
        with engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    engine.dispose()


@pytest.mark.parametrize('initial_revision', [0, 1])
def test_two_simultaneous_saves_only_one_succeeds(app, initial_revision):
    application, group_id = app
    url = f'/teacher/groups/{group_id}/orientation-recommendations/alice'
    if initial_revision:
        with TestClient(application) as client:
            assert client.put(url, json={'content': 'initial', 'revision': 0}).status_code == 200
    barrier = Barrier(2)
    def save(value):
        with TestClient(application) as client:
            barrier.wait(timeout=10)
            return client.put(url, json={'content': value, 'revision': initial_revision})
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(save, ['first', 'second']))
    assert sorted(response.status_code for response in responses) == [200, 409]
    winner = next(response.json() for response in responses if response.status_code == 200)
    with TestClient(application) as client:
        saved = client.get(url).json()
    assert saved['content'] == winner['content']
    assert saved['revision'] == initial_revision + 1
