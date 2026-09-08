"""Account defaults survive new clients and remain separate from session state."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend import auth, models
from backend.database import get_db
from backend.routes import learner_profile
from backend.tests.artifact_database import artifact_session


@pytest.fixture
def account():
    with artifact_session() as db:
        db.add_all([
            models.Counselor(id=1, name='First', slug='first', language=['it'], is_active=True),
            models.Counselor(id=2, name='Second', slug='second', language=['it'], is_active=True),
            models.Counselor(id=3, name='Inactive', slug='inactive', language=['it'], is_active=False),
        ])
        db.commit()
        identity = {'username': 'alice'}
        app = FastAPI()
        app.include_router(learner_profile.router)
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        app.dependency_overrides[get_db] = lambda: db
        with TestClient(app) as client:
            yield client, db, identity


def test_setup_requires_notebook_and_survives_new_client_and_notebook_deletion(account):
    client, db, _ = account
    assert client.get('/user/account-preferences').json()['counselor_ready'] is False
    assert client.put('/user/account-preferences', json={'counselor_id': 1, 'complete_setup': True}).status_code == 422
    assert client.put('/user/account-preferences', json={'counselor_id': 1}).status_code == 200
    assert client.post('/user/learner-profile', json={'goal': 'Organizzare lo studio', 'source': 'intake'}).status_code == 200
    state = client.put('/user/account-preferences', json={'complete_setup': True}).json()
    assert state == {'counselor_id': 1, 'counselor_ready': True, 'notebook_ready': True, 'setup_completed': True}
    with TestClient(client.app) as other_browser:
        assert other_browser.get('/user/account-preferences').json() == state
    db.query(models.LearnerProfileRevision).delete()
    db.commit()
    assert client.get('/user/account-preferences').json()['notebook_ready'] is True


def test_defaults_do_not_change_resumed_sessions_and_accounts_are_isolated(account):
    client, db, identity = account
    db.add(models.OrientationSession(session_id='old', username='alice', counselor_id=1, language='it'))
    db.add(models.LearnerProfileRevision(username='alice', data={'goal': 'Study'}, source='intake'))
    db.commit()
    assert client.get('/user/account-preferences').json() == {'counselor_id': 1, 'counselor_ready': True, 'notebook_ready': True, 'setup_completed': False}
    assert client.put('/user/account-preferences', json={'counselor_id': 2}).status_code == 200
    assert db.get(models.OrientationSession, 'old').counselor_id == 1
    identity['username'] = 'bob'
    assert client.get('/user/account-preferences').json() == {'counselor_id': None, 'counselor_ready': False, 'notebook_ready': False, 'setup_completed': False}


def test_unavailable_counselor_and_blank_notebook(account):
    client, db, _ = account
    for value in (3, 999):
        assert client.put('/user/account-preferences', json={'counselor_id': value}).status_code == 422
    db.add(models.LearnerProfileRevision(username='alice', data={'goal': '   '}, source='intake'))
    db.commit()
    assert client.get('/user/account-preferences').json()['notebook_ready'] is False
    client.put('/user/account-preferences', json={'counselor_id': 1})
    db.get(models.Counselor, 1).is_active = False
    db.commit()
    assert client.get('/user/account-preferences').json()['counselor_ready'] is False


def test_existing_frozen_counselor_can_be_migrated_without_touching_session(account):
    client, db, _ = account
    db.add(models.FrozenSession(username='alice', session_id='frozen', questionnaire_type='QSA', data={'counselor_id': 2}))
    db.add(models.LearnerProfileRevision(username='alice', data={'goal': 'Study'}, source='intake'))
    db.commit()
    state = client.get('/user/account-preferences').json()
    assert state['counselor_id'] == 2
    assert state['notebook_ready'] is True
    assert state['setup_completed'] is False
    assert client.put('/user/account-preferences', json={'complete_setup': True}).json()['setup_completed'] is True
