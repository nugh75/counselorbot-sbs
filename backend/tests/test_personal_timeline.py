from datetime import datetime, timedelta, timezone
from io import BytesIO

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pypdf import PdfReader

from backend import auth, database, models, personal_timeline
from backend.routes.visual_tools import router
from backend.tests.artifact_database import artifact_session
from backend.visual_tools import Workspace, SaveWorkspace, save_workspace, load_workspace


@pytest.fixture
def setup():
    with artifact_session() as db:
        identity = {'username': 'alice'}
        app = FastAPI(); app.include_router(router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        with TestClient(app) as client:
            yield db, client, identity


def test_new_user_needs_no_session_and_has_private_versioned_work(setup):
    db, client, identity = setup
    state = client.get('/user/timeline').json()
    assert state['workspace']['timeline']['events'] == []
    state['workspace']['timeline'] = {'title': 'Il mio percorso', 'events': [
        {'id': 'e', 'title': 'Leggere un libro', 'period': 'Ottobre', 'personal_links': ['notebook', 'booklet']}]}
    payload = {key: state[key] for key in ('revision', 'workspace')}
    saved = client.put('/user/timeline', json=payload)
    assert saved.status_code == 200, saved.text
    assert client.put('/user/timeline', json=payload).status_code == 409
    assert db.query(models.QuestionnaireResult).count() == 0
    assert db.query(models.Log).filter(models.Log.session_id.isnot(None)).count() == 0
    identity['username'] = 'bob'
    assert client.get('/user/timeline').json()['workspace']['timeline']['events'] == []
    identity['username'] = 'alice'
    assert client.get('/user/timeline').json()['workspace']['timeline']['events'][0]['title'] == 'Leggere un libro'
    pdf = client.get('/user/timeline/pdf')
    assert pdf.status_code == 200
    assert 'Leggere un libro' in '\n'.join(p.extract_text() for p in PdfReader(BytesIO(pdf.content)).pages)


def test_calendar_dates_diary_chronology_and_legacy_roundtrip(setup):
    _, client, _ = setup
    state = client.get('/user/timeline').json()
    state['workspace']['timeline'] = {'title': 'Percorso', 'events': [
        {'id': 'legacy', 'title': 'Scuola', 'period': 'Durante la scuola', 'reflection': 'Ricordo originale'},
        {'id': 'open', 'title': 'Tirocinio', 'period': 'placeholder', 'date_mode': 'period', 'start_date': '2026-10-01',
         'planned': 'Conoscere il lavoro', 'reflection': 'Ho imparato ad ascoltare'},
        {'id': 'deadline', 'title': 'Iscrizione', 'period': 'placeholder', 'date_mode': 'period', 'end_date': '2026-09-20'},
        {'id': 'point', 'title': 'Visita', 'period': 'placeholder', 'date_mode': 'point', 'start_date': '2026-09-10'},
        {'id': 'range', 'title': 'Corso', 'period': 'placeholder', 'date_mode': 'period', 'start_date': '2026-09-01', 'end_date': '2026-09-30'},
    ]}
    saved = client.put('/user/timeline', json={key: state[key] for key in ('revision', 'workspace')})
    assert saved.status_code == 200, saved.text
    state = client.get('/user/timeline').json()
    events = state['workspace']['timeline']['events']
    assert [e['id'] for e in events] == ['range', 'point', 'deadline', 'open', 'legacy']
    assert events[-1]['period'] == 'Durante la scuola'
    assert events[-1]['reflection'] == 'Ricordo originale'
    assert events[3]['period'] == '2026-10-01 → …'
    events[3]['end_date'] = '2026-11-30'
    saved = client.put('/user/timeline', json={key: state[key] for key in ('revision', 'workspace')})
    assert saved.status_code == 200, saved.text
    closed = saved.json()['workspace']['timeline']['events'][3]
    assert closed['period'] == '2026-10-01 → 2026-11-30'
    assert closed['planned'] == 'Conoscere il lavoro'
    assert closed['reflection'] == 'Ho imparato ad ascoltare'
    pdf = client.get('/user/timeline/pdf')
    content = '\n'.join(p.extract_text() for p in PdfReader(BytesIO(pdf.content)).pages)
    assert 'Conoscere il lavoro' in content and 'Ho imparato ad ascoltare' in content


@pytest.mark.parametrize('dates', [
    {'date_mode': 'point'}, {'date_mode': 'period'},
    {'date_mode': 'point', 'start_date': '2026-02-29'},
    {'date_mode': 'point', 'start_date': '2026-09-01', 'end_date': '2026-09-02'},
    {'date_mode': 'period', 'start_date': '2026-09-30', 'end_date': '2026-09-01'},
    {'start_date': '2026-09-01'},
])
def test_calendar_rejects_invalid_dates_without_saving(setup, dates):
    _, client, _ = setup
    state = client.get('/user/timeline').json()
    state['workspace']['timeline'] = {'title': 'Percorso', 'events': [
        {'id': 'bad', 'title': 'Tappa', 'period': 'placeholder', **dates}]}
    assert client.put('/user/timeline', json={key: state[key] for key in ('revision', 'workspace')}).status_code == 422
    assert client.get('/user/timeline').json()['workspace']['timeline']['events'] == []


def test_extract_all_sessions_once_with_colliding_ids_and_live_portfolio(setup):
    db, client, identity = setup
    db.add(models.PortfolioItem(username='alice', title='Portfolio originale', images=[])); db.commit()
    for session in ('one', 'two'):
        w = Workspace.model_validate({'actions': [{'id': 'a', 'title': 'Leggere', 'kind': 'book'}],
            'timeline': {'title': 'Percorso', 'events': [{'id': str(n), 'title': f'{session} {n}', 'period': '2026',
                'action_ids': ['a'], 'portfolio': [{'id': 1}]} for n in range(30)]}})
        save_workspace(db, session, 'alice', SaveWorkspace(revision=0, workspace=w))
    state = client.get('/user/timeline?legacy_session=one&event=0').json()
    events = state['workspace']['timeline']['events']
    assert len(events) == len({e['id'] for e in events}) == 60
    assert state['focus_event'] == personal_timeline.imported_id('one', '0')
    assert len(state['workspace']['actions']) == 2
    assert events[0]['action_ids'] != events[30]['action_ids']
    assert events[0]['portfolio'][0]['title'] == 'Portfolio originale'
    assert client.get('/user/timeline').json()['revision'] == state['revision']
    assert len(load_workspace(db, 'one', 'alice')['workspace']['timeline']['events']) == 30
    preview_payload = {'revision': state['revision'], 'event_ids': [events[0]['id']], 'title': 'Una copia'}
    preview = client.post('/user/timeline/preview', json=preview_payload)
    assert preview.status_code == 200, preview.text
    copied = client.post('/user/timeline/portfolio', json={**preview_payload,
        'preview_hash': preview.json()['preview_hash'], 'request_id': 'copy'})
    assert copied.status_code == 200, copied.text
    links = client.get(f"/user/portfolio/{copied.json()['item_id']}/timeline-links").json()['links']
    assert links[0]['session_id'] is None and links[0]['event_id'] == events[0]['id']
    # Deleting an extracted event must not resurrect it from the legacy source.
    state['workspace']['timeline']['events'] = events[1:]
    saved = client.put('/user/timeline', json={key: state[key] for key in ('revision', 'workspace')})
    assert saved.status_code == 200, saved.text
    assert len(client.get('/user/timeline').json()['workspace']['timeline']['events']) == 59
    identity['username'] = 'bob'
    assert client.get('/user/timeline').json()['workspace']['timeline']['events'] == []


def test_institution_dates_are_scoped_authoritative_and_revocable(setup, monkeypatch):
    db, client, identity = setup
    monkeypatch.setattr(personal_timeline, 'institution_ids_for', lambda db, username: [1])
    monkeypatch.setattr(personal_timeline, 'resolve_audience_band', lambda db, username: None)
    now = datetime.now(timezone.utc)
    for slug, institution, status in [('own', 1, 'certified'), ('foreign', 2, 'certified'), ('draft', 1, 'draft')]:
        db.add(models.OrientationEvent(slug=slug, institution_id=institution, title_i18n={'it': 'Open day'},
            starts_at=now, ends_at=now + timedelta(days=1), registration_deadline=now-timedelta(days=1),
            needs=['scelta'], audience=[], status=status, is_active=True))
    db.commit()
    state = client.get('/user/timeline').json()
    for slug in ('foreign', 'draft'):
        state['workspace']['timeline'] = {'title': 'Il mio percorso', 'events': [{'id': 'e', 'title': 'FALSO',
            'period': 'FALSO', 'institution_event': slug}]}
        assert client.put('/user/timeline', json={key: state[key] for key in ('revision', 'workspace')}).status_code == 422
    state['workspace']['timeline']['events'][0]['institution_event'] = 'own'
    response = client.put('/user/timeline', json={key: state[key] for key in ('revision', 'workspace')})
    assert response.status_code == 200, response.text
    event = response.json()['workspace']['timeline']['events'][0]
    assert event['title'] == 'Open day' and event['period'] != 'FALSO'
    saved = response.json()
    saved['workspace']['timeline']['events'].append({**event, 'id': 'deadline', 'institution_date': 'deadline'})
    response = client.put('/user/timeline', json=saved)
    assert response.status_code == 200, response.text
    assert next(e for e in response.json()['workspace']['timeline']['events'] if e['id'] == 'deadline')['period'] != event['period']
    preview = client.post('/user/timeline/preview', json={'revision': response.json()['revision'],
        'event_ids': ['deadline'], 'title': 'Iscrizione'})
    assert preview.status_code == 200, preview.text
    assert 'Scadenza di iscrizione' in preview.json()['description']
    row = db.query(models.OrientationEvent).filter_by(slug='own').one()
    row.title_i18n = {'it': 'Open day aggiornato'}; db.commit()
    assert client.get('/user/timeline').json()['workspace']['timeline']['events'][0]['title'] == 'Open day aggiornato'
    row.is_active = False; db.commit()
    event = client.get('/user/timeline').json()['workspace']['timeline']['events'][0]
    assert event['institution_available'] is False and event['title'] == 'Non disponibile'
