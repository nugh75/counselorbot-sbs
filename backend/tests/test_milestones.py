"""Tappa passata salvata dalla chat: finisce nella linea del tempo personale, una sola per richiesta."""
from datetime import date, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, database
from backend.routes.milestones import router
from backend.tests.artifact_database import artifact_session
from backend.visual_tools import load_workspace


@pytest.fixture
def setup():
    with artifact_session() as db:
        identity = {'username': 'alice'}
        app = FastAPI(); app.include_router(router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        with TestClient(app) as client:
            yield db, client, identity


def body(**kw):
    return {'request_id': 'req_abc123', 'title': "L'esame di chimica", 'date': '2026-05-04', 'period': '',
            'review': {'worked': ['Schema'], 'try_next': 'Ripassare prima'}, 'session_id': 's1', **kw}


def test_milestone_lands_in_the_personal_timeline(setup):
    db, client, identity = setup
    res = client.post('/user/timeline/milestones', json=body())
    assert res.status_code == 201, res.text
    events = load_workspace(db, None, 'alice')['workspace']['timeline']['events']
    event = next(e for e in events if e['id'] == res.json()['event_id'])
    assert event['tense'] == 'past' and event['review']['worked'] == ['Schema']
    assert event['start_date'] == '2026-05-04' and event['source'] == 'session:s1'


def test_same_request_saves_one_milestone(setup):
    db, client, identity = setup
    first = client.post('/user/timeline/milestones', json=body()).json()
    second = client.post('/user/timeline/milestones', json=body()).json()
    assert first == second
    events = load_workspace(db, None, 'alice')['workspace']['timeline']['events']
    assert sum(e['id'] == first['event_id'] for e in events) == 1


def test_future_date_is_rejected(setup):
    db, client, identity = setup
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    assert client.post('/user/timeline/milestones', json=body(date=tomorrow)).status_code == 422
