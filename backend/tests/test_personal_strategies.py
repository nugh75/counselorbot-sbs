"""Strategie scritte dallo studente: proprie, riusabili, non eliminabili se in uso."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend import auth, database, models
from backend.routes.goals import router as goals_router
from backend.routes.personal_strategies import router
from backend.tests.artifact_database import artifact_session


@pytest.fixture
def client():
    with artifact_session() as db:
        identity = dict(username='alice', authenticated=True, is_admin=False, groups=['studenti'])
        app = FastAPI(); app.include_router(router); app.include_router(goals_router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        db.add(models.CertifiedStrategy(slug='self-test', name_it='Autoverifica', status='certified', is_active=True))
        db.add(models.ContentLanguageVersion(content_type='certified_strategy', content_key='self-test', locale='it', status='certified'))
        db.commit()
        with TestClient(app) as c:
            yield db, c, identity


def test_create_use_and_protect_strategy(client):
    db, c, who = client
    own = c.post('/user/strategies', json=dict(text='Ripeto a voce registrandomi')).json()
    goal = c.post('/user/goals', json=dict(title='Esame orale', method=[
        dict(kind='certified', slug='self-test'), dict(kind='own', id=own['id'])])).json()
    assert [m['title'] for m in goal['method']] == ['Autoverifica', 'Ripeto a voce registrandomi']
    assert [m['kind'] for m in goal['method']] == ['certified', 'own']
    assert c.get('/user/strategies').json()[0]['used_by'] == [goal['id']]
    assert c.delete(f"/user/strategies/{own['id']}").status_code == 409


def test_method_rejects_unknown_or_foreign_items(client):
    db, c, who = client
    assert c.post('/user/goals', json=dict(title='x', method=[dict(kind='certified', slug='nope')])).status_code == 404
    own = c.post('/user/strategies', json=dict(text='Mia')).json()
    who['username'] = 'bob'
    assert c.post('/user/goals', json=dict(title='x', method=[dict(kind='own', id=own['id'])])).status_code == 404
    assert c.patch(f"/user/strategies/{own['id']}", json=dict(text='rubata')).status_code == 404


def test_unused_strategy_can_be_renamed_and_deleted(client):
    db, c, who = client
    own = c.post('/user/strategies', json=dict(text='Prima')).json()
    assert c.patch(f"/user/strategies/{own['id']}", json=dict(text='Dopo')).json()['text'] == 'Dopo'
    assert c.delete(f"/user/strategies/{own['id']}").status_code == 200
    assert c.get('/user/strategies').json() == []


def test_certified_catalog_without_instrument(client):
    db, c, who = client
    from backend.routes.survey import router as survey_router
    c.app.include_router(survey_router)
    assert [s['slug'] for s in c.get('/user/certified-strategies', params={'lang': 'it'}).json()] == ['self-test']