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


def test_replacement_is_atomic_clean_and_preserves_source_results(api, monkeypatch):
    client, db, _ = api
    old = create(client, status='active', researchers=[{'external_name': 'Synthetic colleague'}])
    row = result(db, old['id'])
    url = f"/admin/administration-plans/{old['id']}/replace"
    body = {'revision': old['revision'], 'replacement': {'title': 'New questionnaire', 'instrument_code': 'ZTPI', 'status': 'active'}}
    # A failure after the new row was flushed must roll back creation and archive together.
    original = administration_plans._replace_researchers
    def fail_after_flush(*args):
        raise HTTPException(422, 'synthetic_validation_failure')
    monkeypatch.setattr(administration_plans, '_replace_researchers', fail_after_flush)
    failed = client.post(url, json=body)
    assert failed.status_code == 422
    assert db.query(models.AdministrationPlan).count() == 1
    assert db.get(models.AdministrationPlan, old['id']).status == 'active'
    monkeypatch.setattr(administration_plans, '_replace_researchers', original)
    replacement = client.post(url, json=body)
    assert replacement.status_code == 200, replacement.text
    new = replacement.json()
    assert new['id'] != old['id'] and new['code'] != old['code']
    assert new['instrument_code'] == 'ZTPI' and new['status'] == 'active'
    assert new['responses_count'] == 0 and new['revision'] == 1
    source = db.get(models.AdministrationPlan, old['id'])
    assert source.status == 'archived' and source.revision == old['revision'] + 1
    assert db.get(models.QuestionnaireResult, row.id).administration_plan_id == old['id']
    assert client.get(f"/admin/administration-plans/{old['id']}/responses").json()['plan']['responses_count'] == 1
    # A duplicate/stale request cannot create a second new administration.
    assert client.post(url, json=body).status_code == 409
    assert db.query(models.AdministrationPlan).count() == 2


def test_replacement_permissions_validation_and_archived_state(api):
    client, db, identity = api
    old = create(client, status='active')
    url = f"/admin/administration-plans/{old['id']}/replace"
    body = {'revision': old['revision'], 'replacement': {'title': 'Replacement'}}
    identity['username'] = 'outsider'
    assert client.post(url, json=body).status_code == 404
    identity.update(username='teacher', groups=['studenti'])
    assert client.post(url, json=body).status_code == 403
    identity.update(username='admin', groups=['admins'], is_admin=True)
    for replacement in ({'title': ''}, {'title': 'New', 'status': 'archived'}, {'title': 'New', 'code': old['code']}):
        assert client.post(url, json={**body, 'replacement': replacement}).status_code in (400, 409, 422)
        assert db.get(models.AdministrationPlan, old['id']).status == 'active'
        assert db.query(models.AdministrationPlan).count() == 1
    archived = client.put(f"/admin/administration-plans/{old['id']}", json={'revision': old['revision'], 'status': 'archived'}).json()
    response = client.post(url, json={**body, 'revision': archived['revision']})
    assert response.status_code == 409 and response.json()['detail'] == 'administration_already_archived'


def test_used_plan_cannot_retarget_existing_results(api):
    client, db, _ = api
    old = create(client)
    result(db, old['id'])
    response = client.put(f"/admin/administration-plans/{old['id']}", json={'revision': old['revision'], 'instrument_code': 'ZTPI'})
    assert response.status_code == 409 and response.json()['detail'] == 'administration_has_results_replace_required'
    assert db.get(models.AdministrationPlan, old['id']).instrument_code == 'QSA'
    # Metadata is still editable without replacing the collection.
    response = client.put(f"/admin/administration-plans/{old['id']}", json={'revision': old['revision'], 'title': 'Edited title'})
    assert response.status_code == 200
