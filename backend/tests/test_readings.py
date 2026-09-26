"""«La mia lettura»: una per compilazione, solo dello studente, protetta se origine di un obiettivo."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend import auth, database, models
from backend.routes.goals import router as goals_router
from backend.routes.readings import router
from backend.tests.artifact_database import artifact_session


@pytest.fixture
def client():
    with artifact_session() as db:
        identity = dict(username='alice', authenticated=True, is_admin=False, groups=['studenti'])
        app = FastAPI(); app.include_router(router); app.include_router(goals_router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        db.add(models.QuestionnaireResult(session_id='s1', username='alice', questionnaire_type='QSA', scores={'C3': 8}))
        db.commit()
        with TestClient(app) as c:
            yield db, c, identity


def body(**kw):
    return {'strengths': ['C1'], 'growth_areas': ['C3'], 'note': 'Mi agito agli esami', **kw}


def test_upsert_and_read(client):
    db, c, who = client
    assert c.get('/user/readings', params={'session_id': 's1'}).json() is None
    c.put('/user/readings/s1', json=body())
    saved = c.put('/user/readings/s1', json=body(note='Aggiornata')).json()
    assert saved['note'] == 'Aggiornata' and saved['questionnaire_type'] == 'QSA'
    assert db.query(models.ResultReading).count() == 1


def test_foreign_session_is_404(client):
    db, c, who = client
    who['username'] = 'bob'
    assert c.put('/user/readings/s1', json=body()).status_code == 404


def test_origin_reading_cannot_be_deleted(client):
    db, c, who = client
    c.put('/user/readings/s1', json=body())
    goal = c.post('/user/goals', json=dict(title='Gestire l’ansia', origin=dict(kind='reading', target_id='s1'))).json()
    assert c.get('/user/readings', params={'session_id': 's1'}).json()['goal_ids'] == [goal['id']]
    assert c.delete('/user/readings/s1').status_code == 409


def test_reading_context_for_the_counselor(client):
    from backend.chat_logic import _reading_context
    db, c, who = client
    assert _reading_context(db, 'alice', 'QSA', 's1') == ''
    c.put('/user/readings/s1', json=body())
    goal = c.post('/user/goals', json=dict(title='Gestire l’ansia', origin=dict(kind='reading', target_id='s1'))).json()
    context = _reading_context(db, 'alice', 'QSA', 's1')
    assert context.startswith('## La mia lettura dello strumento')
    for expected in ('Punti di forza: C1', 'Da far crescere: C3', 'Cosa mi dice di me: Mi agito agli esami',
                     f"Obiettivi nati da questa lettura: {goal['title']} (active)"):
        assert expected in context, expected
    # Una nuova compilazione senza lettura ripropone l'ultima lettura dello stesso strumento.
    assert 'Mi agito agli esami' in _reading_context(db, 'alice', 'QSA', 's2')
    assert _reading_context(db, 'alice', 'ZTPI', 's2') == ''
    assert _reading_context(db, 'bob', 'QSA', 's1') == ''
