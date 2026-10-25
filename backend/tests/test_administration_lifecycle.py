"""Administration archive/restore: disposable DB, real auth and revision checks."""
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from backend import administration_context, auth, database, models
from backend.routes import administration_plans
from backend.tests.artifact_database import artifact_session


@pytest.fixture
def api():
    with artifact_session() as db:
        identity = dict(username='teacher', authenticated=True, groups=['docenti'], is_admin=False)
        app = FastAPI()
        app.include_router(administration_plans.router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_identity] = lambda: identity
        with TestClient(app) as client:
            yield client, db, identity


def create(client, **values):
    response = client.post('/admin/administration-plans', json=dict(title='Synthetic administration', **values))
    assert response.status_code == 200, response.text
    return response.json()


def result(db, plan_id):
    row = models.QuestionnaireResult(session_id='synthetic-session', username='student', questionnaire_type='QSA',
                                     administration_plan_id=plan_id, scores={'C1': 5}, locale='en')
    db.add(row)
    db.commit()
    return row


@pytest.mark.parametrize('status', ['planned', 'active', 'completed'])
def test_archive_every_status_preserves_results_and_can_restore(api, status):
    client, db, _ = api
    plan = create(client, status=status)
    row = result(db, plan['id'])
    path = f"/admin/administration-plans/{plan['id']}"
    archived = client.put(path, json=dict(revision=plan['revision'], status='archived'))
    assert archived.status_code == 200, archived.text
    assert archived.json()['status'] == 'archived'
    assert archived.json()['responses_count'] == 1
    assert client.get(path + '/responses').json()['questionnaire_results'][0]['id'] == row.id
    with pytest.raises(HTTPException) as error:
        administration_context.require_result_context(db, plan['id'], 'student', None)
    assert error.value.detail == {'code': 'administration_inactive'}
    restored = client.put(path, json=dict(revision=archived.json()['revision'], status='planned'))
    assert restored.status_code == 200
    assert restored.json()['status'] == 'planned'
    assert restored.json()['responses_count'] == 1
    assert administration_context.require_result_context(db, plan['id'], 'student', None).id == plan['id']


def test_archive_permissions_and_revision_conflicts(api):
    client, _, identity = api
    plan = create(client)
    path = f"/admin/administration-plans/{plan['id']}"
    body = dict(revision=plan['revision'], status='archived')
    identity['username'] = 'outsider'
    assert client.put(path, json=body).status_code == 404
    identity.update(username='teacher', groups=['studenti'])
    assert client.put(path, json=body).status_code == 403
    identity.update(username='admin', groups=['admins'], is_admin=True)
    assert client.put(path, json=body).status_code == 200
    stale = client.put(path, json=body)
    assert stale.status_code == 409
    assert stale.json()['detail'] == 'administration_revision_conflict'
