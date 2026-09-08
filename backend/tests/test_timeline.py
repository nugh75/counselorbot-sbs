from io import BytesIO

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from pypdf import PdfReader

from backend import auth, database, models
from backend.routes.visual_tools import router
from backend.tests.artifact_database import artifact_session
from backend.timeline import SnapshotRequest, SaveSnapshot, snapshot_preview, save_snapshot, portfolio_timeline_links
from backend.visual_tools import Workspace, SaveWorkspace, load_workspace, save_workspace


@pytest.fixture
def db():
    with artifact_session() as session:
        session.add(models.QuestionnaireResult(session_id='timeline-a', username='alice', questionnaire_type='QSA'))
        session.add_all([models.PortfolioItem(username='alice', title='Le mie slide', images=[]),
                         models.PortfolioItem(username='bob', title='PRIVATE', images=[])])
        session.commit()
        yield session


def workspace():
    return Workspace.model_validate({'actions': [{'id': 'a', 'title': 'Preparare slide', 'stage': 'doing'}],
        'timeline': {'title': 'Il mio progetto', 'events': [
            {'id': 'e', 'title': 'Presentazione', 'period': 'Giugno, data da definire', 'tense': 'future',
             'reflection': 'Mi aiuta provare con un compagno', 'action_ids': ['a'], 'portfolio': [{'id': 1, 'title': 'FORGED'}]},
            {'id': 'past', 'title': 'Prima esperienza', 'period': 'Durante la scuola', 'tense': 'past'}]}})


def save(db, w=None, revision=0):
    return save_workspace(db, 'timeline-a', 'alice', SaveWorkspace(revision=revision, workspace=w or workspace()))


def test_links_live_titles_deletion_and_no_cascade(db):
    state = save(db)
    assert state['workspace']['timeline']['events'][0]['portfolio'][0]['title'] == 'Le mie slide'
    assert portfolio_timeline_links(db, 'alice', 1)['links'][0]['event_id'] == 'e'
    db.query(models.PortfolioItem).filter_by(id=1).update({'title': 'Slide aggiornate'})
    db.commit()
    assert load_workspace(db, 'timeline-a', 'alice')['workspace']['timeline']['events'][0]['portfolio'][0]['title'] == 'Slide aggiornate'
    db.query(models.PortfolioItem).filter_by(id=1).delete()
    db.commit()
    loaded = load_workspace(db, 'timeline-a', 'alice')
    assert loaded['workspace']['timeline']['events'][0]['portfolio'][0]['title'] == ''
    # A removed action is an unavailable reference; existing links can be unlinked.
    w = Workspace.model_validate(loaded['workspace']); w.actions = []
    state = save(db, w, state['revision'])
    w.timeline.events = []
    save(db, w, state['revision'])
    assert db.query(models.PortfolioItem).filter_by(id=2).count() == 1


@pytest.mark.parametrize('kind', ['portfolio', 'action'])
def test_reject_foreign_or_unknown_links(db, kind):
    w = workspace()
    if kind == 'portfolio':
        w.timeline.events[0].portfolio[0].id = 2
    else:
        w.timeline.events[0].action_ids = ['other-session-action']
    with pytest.raises(HTTPException) as error:
        save(db, w)
    assert error.value.status_code == 422
    assert db.query(models.Log).count() == 0


@pytest.mark.parametrize('change', ['duplicates', 'blank-period', 'blank-title', 'too-many', 'duplicate-link'])
def test_timeline_validation(change):
    w = workspace().model_dump()
    if change == 'duplicates': w['timeline']['events'] *= 2
    if change == 'blank-period': w['timeline']['events'][0]['period'] = '  '
    if change == 'blank-title': w['timeline']['title'] = ''
    if change == 'too-many': w['timeline']['events'] *= 16
    if change == 'duplicate-link': w['timeline']['events'][0]['action_ids'] *= 2
    with pytest.raises(ValidationError): Workspace.model_validate(w)


def test_snapshot_preview_retry_independence_and_stale_reference(db):
    state = save(db)
    request = SnapshotRequest(revision=state['revision'], event_ids=['e'], title='Il progetto a giugno', reflection='Una prova utile')
    preview = snapshot_preview(db, 'timeline-a', 'alice', request)
    assert 'Durante la scuola' not in preview['description']
    assert 'In corso' in preview['description'] and 'Le mie slide' in preview['description']
    update = SaveSnapshot(**request.model_dump(), preview_hash=preview['preview_hash'], request_id='retry-1')
    copied = save_snapshot(db, 'timeline-a', 'alice', update)
    assert save_snapshot(db, 'timeline-a', 'alice', update) == copied
    assert db.query(models.PortfolioItem).count() == 3
    assert portfolio_timeline_links(db, 'alice', copied['item_id'])['snapshot'] is True
    original = db.get(models.PortfolioItem, copied['item_id']).description
    w = workspace(); w.timeline.events[0].title = 'MODIFICATA'
    save(db, w, state['revision'])
    assert db.get(models.PortfolioItem, copied['item_id']).description == original
    assert save_snapshot(db, 'timeline-a', 'alice', update) == copied
    with pytest.raises(HTTPException) as error:
        snapshot_preview(db, 'timeline-a', 'alice', request)
    assert error.value.status_code == 409


def test_preview_detects_portfolio_change_and_limit(db):
    state = save(db)
    request = SnapshotRequest(revision=state['revision'], event_ids=['e'], title='Copia')
    preview = snapshot_preview(db, 'timeline-a', 'alice', request)
    db.query(models.PortfolioItem).filter_by(id=1).update({'title': 'Changed'})
    db.commit()
    with pytest.raises(HTTPException) as error:
        save_snapshot(db, 'timeline-a', 'alice', SaveSnapshot(**request.model_dump(), request_id='changed', preview_hash=preview['preview_hash']))
    assert error.value.status_code == 409
    w = workspace().model_dump()
    w['timeline']['events'] = [dict(w['timeline']['events'][0], id=str(i), reflection='x' * 1000) for i in range(5)]
    state = save(db, Workspace.model_validate(w), state['revision'])
    with pytest.raises(HTTPException) as error:
        snapshot_preview(db, 'timeline-a', 'alice', SnapshotRequest(revision=state['revision'], event_ids=[str(i) for i in range(5)], title='Too long'))
    assert error.value.status_code == 413


def test_routes_ownership_pdf_and_legacy(db):
    app = FastAPI(); app.include_router(router)
    identity = {'username': 'bob'}
    app.dependency_overrides[database.get_db] = lambda: db
    app.dependency_overrides[auth.get_identity_view_as] = lambda: identity
    app.dependency_overrides[auth.get_current_user] = lambda: identity
    with TestClient(app) as client:
        path = '/session/timeline-a/visual-tools'
        request = {'revision': 0, 'event_ids': ['e'], 'title': 'Copia'}
        assert client.post(path + '/timeline/preview', json=request).status_code == 403
        assert client.get('/user/portfolio/1/timeline-links').status_code == 404
        identity['username'] = 'alice'
        # Pre-timeline revisions acquire an empty timeline when read.
        db.add(models.Log(action='visual_workspace', username='alice', session_id='timeline-a', details={'workspace': {'actions': [], 'cards': [], 'comparison': {}}}))
        db.commit()
        legacy = client.get(path).json()
        assert legacy['workspace']['timeline'] == {'title': '', 'events': []}
        state = client.put(path, json={'revision': legacy['revision'], 'workspace': workspace().model_dump()}).json()
        assert client.put(path, json={'revision': legacy['revision'], 'workspace': {}}).status_code == 409
        for lang in ['it', 'en', 'es', 'fr', 'de', 'sv']:
            pdf = client.get(path + '/pdf?lang=' + lang)
            assert pdf.status_code == 200
            content = '\n'.join(p.extract_text() for p in PdfReader(BytesIO(pdf.content)).pages)
            assert 'Presentazione' in content and 'Le mie slide' in content and 'PRIVATE' not in content
        request['revision'] = state['revision']
        preview = client.post(path + '/timeline/preview', json=request).json()
        response = client.post(path + '/timeline/portfolio', json={**request, 'request_id': 'route', 'preview_hash': preview['preview_hash']})
        assert response.status_code == 200
        assert client.get(f"/user/portfolio/{response.json()['item_id']}/timeline-links").json()['snapshot']


@pytest.mark.parametrize('kind, label', [('book', 'Libro da leggere'), ('article', 'Articolo da studiare'), ('film', 'Film da vedere')])
def test_reading_and_viewing_goals_in_final_pdf(db, kind, label):
    from backend.pdf_generator import generate_questionnaire_pdf
    w = workspace(); w.actions[0].kind = kind
    state = save(db, w)
    assert state['workspace']['actions'][0]['kind'] == kind
    for mode in ['brief', 'full']:
        pdf = generate_questionnaire_pdf('QSA', {}, 'timeline-a', language='it', mode=mode,
            visual_workspace=state['workspace'], summary_text='La conversazione')
        content = '\n'.join(p.extract_text() for p in PdfReader(pdf).pages)
        assert label in content and 'Giugno, data da definire' in content


def test_unlink_and_remove_event_preserve_sources_and_remove_backlinks(db):
    state = save(db)
    w = Workspace.model_validate(state['workspace']); w.timeline.events = []
    saved = save(db, w, state['revision'])
    assert saved['workspace']['actions'][0]['title'] == 'Preparare slide'
    assert db.get(models.PortfolioItem, 1).title == 'Le mie slide'
    assert portfolio_timeline_links(db, 'alice', 1)['links'] == []
