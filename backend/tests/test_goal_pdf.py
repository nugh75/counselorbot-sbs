"""PDF «Percorso dell'obiettivo»: origine, metodo, azioni, controlli, prove e bilancio in un unico documento."""
from io import BytesIO

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pypdf import PdfReader

from backend import auth, database, models
from backend.routes.goals import router
from backend.routes.personal_strategies import router as strategies_router
from backend.routes.visual_tools import router as visual_router
from backend.tests.artifact_database import artifact_session


@pytest.fixture
def setup():
    with artifact_session() as db:
        identity = dict(username='alice', name='Alice Rossi', authenticated=True, is_admin=False, groups=['studenti'])
        app = FastAPI()
        for r in (router, strategies_router, visual_router):
            app.include_router(r)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        with TestClient(app) as client:
            yield db, client, identity


def pdf_text(response):
    assert response.status_code == 200, response.text
    assert response.headers['content-type'] == 'application/pdf'
    return '\n'.join(page.extract_text() for page in PdfReader(BytesIO(response.content)).pages)


def full_goal(db, c):
    db.add(models.CertifiedStrategy(slug='self-test', name_it='Autoverifica', status='certified', is_active=True))
    db.add(models.QuestionnaireResult(session_id='s1', username='alice', questionnaire_type='QSA', scores={}))
    db.add(models.ResultReading(username='alice', session_id='s1', questionnaire_type='QSA', note='Mi agito'))
    evidence = models.PortfolioItem(username='alice', title='Relazione di laboratorio')
    db.add(evidence); db.commit()
    own = c.post('/user/strategies', json=dict(text='Ripeto a voce alta')).json()
    row = c.post('/user/goals', json=dict(title='Parlare senza ansia agli orali', motivation='Voglio stare calma',
                 criteria='Tre interrogazioni senza bloccarmi', origin=dict(kind='reading', target_id='s1'),
                 method=[dict(kind='certified', slug='self-test'), dict(kind='own', id=own['id'])])).json()
    row = c.post(f"/user/goals/{row['id']}/actions", json=dict(title='Simulare un orale', revision=row['revision'],
                 request_id='act-000001')).json()
    row = c.post(f"/user/goals/{row['id']}/actions", json=dict(title='Come va?', kind='check', date='2026-10-10',
                 revision=row['revision'], request_id='chk-000001')).json()
    state = c.get('/user/timeline').json()
    check = next(a for a in state['workspace']['actions'] if a.get('kind') == 'check')
    check.update(stage='done', progress='on_track', reflection='Due orali su tre senza blocchi', adjustment='Provo anche in classe')
    assert c.put('/user/timeline', json={k: state[k] for k in ('revision', 'workspace')}).status_code == 200
    row = c.post(f"/user/goals/{row['id']}/links", json=dict(kind='portfolio', target_id=str(evidence.id), role='evidence',
                 revision=row['revision'])).json()
    return row


def test_closed_goal_path_has_every_section(setup):
    db, c, who = setup
    row = full_goal(db, c)
    c.post(f"/user/goals/{row['id']}/reviews", json=dict(outcome='reached', commitment='enough', satisfaction='much',
           learned='Parlare a voce alta mi aiuta', revision=row['revision']))
    response = c.get(f"/user/goals/{row['id']}/pdf", params={'lang': 'it'})
    assert response.headers['content-disposition'] == f'attachment; filename="percorso-obiettivo-{row["id"]}.pdf"'
    text = pdf_text(response)
    for expected in ('Parlare senza ansia agli orali', 'Alice Rossi', 'Metodo', 'Autoverifica', 'Ripeto a voce alta',
                     'Simulare un orale', 'Due orali su tre senza blocchi', 'Provo anche in classe', 'in linea', 'Relazione di laboratorio', 'Bilancio',
                     'Parlare a voce alta mi aiuta', 'Voglio stare calma'):
        assert expected in text, expected
    assert 'in corso' not in text


def test_open_goal_is_stamped_in_progress_without_review(setup):
    db, c, who = setup
    row = full_goal(db, c)
    db.get(models.PersonalGoal, row['id']).reflection = 'Nota di prima del bilancio'; db.commit()
    text = pdf_text(c.get(f"/user/goals/{row['id']}/pdf", params={'lang': 'it'}))
    assert 'in corso' in text and 'Bilancio' not in text
    assert 'Nota di prima del bilancio' in text


def test_pdf_speaks_the_requested_language(setup):
    db, c, who = setup
    row = full_goal(db, c)
    text = pdf_text(c.get(f"/user/goals/{row['id']}/pdf", params={'lang': 'en'}))
    assert 'Method' in text and 'in progress' in text


def test_other_students_goal_is_404(setup):
    db, c, who = setup
    row = c.post('/user/goals', json=dict(title='Privato')).json()
    who['username'] = 'bob'
    assert c.get(f"/user/goals/{row['id']}/pdf").status_code == 404
