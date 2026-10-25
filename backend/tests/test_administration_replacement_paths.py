"""A path replacement keeps evidence on its historical step and starts clean."""
from backend import models
from backend.tests.test_path_publication import api  # noqa: F401


def plan(client, group, title='Synthetic questionnaire'):
    response = client.post(f'/teacher/groups/{group.id}/administrations', json={
        'title': title, 'instrument_code': 'QSA', 'locale': 'it', 'status': 'active'})
    assert response.status_code == 200, response.text
    return response.json()


def path_with_source(client, group, source):
    path = client.post(f'/teacher/groups/{group.id}/paths', json={'title': 'Synthetic path'}).json()
    response = client.put(f"/teacher/paths/{path['id']}", json={
        'revision': path['revision'], 'title': path['title'],
        'steps': [{'step_type': 'questionnaire_administration', 'administration_plan_id': source['id']}]})
    assert response.status_code == 200, response.text
    published = client.post(f"/teacher/paths/{path['id']}/publish")
    assert published.status_code == 200, published.text
    return published.json()


def replace(client, path, target_id, **changes):
    step = dict(step_type='questionnaire_administration', administration_plan_id=target_id,
                replaces_step_id=path['steps'][0]['id'], **changes)
    return client.put(f"/teacher/paths/{path['id']}", json={
        'revision': path['revision'], 'title': path['title'], 'steps': [step]})


def evidence(db, source, step):
    row = models.QuestionnaireResult(administration_plan_id=source['id'], username='alice', session_id='old-session',
                                     questionnaire_type='QSA', scores={'C1': 5, 'C2': 6}, locale='it')
    db.add(row)
    db.flush()
    entry = models.QuestionnaireGuidedEntry(result_id=row.id, username='alice', session_id='old-session',
                                            request_id='synthetic-request', step_id=step['id'])
    db.add(entry)
    db.flush()
    record = models.ClassPathStepEvidence(step_id=step['id'], username='alice', kind='guided_entry',
                                         guided_entry_id=entry.id, result_id=row.id)
    db.add(record)
    db.commit()
    return row, record


def test_path_substitution_archives_source_without_reusing_evidence(api):
    client, db, identity, group, _, _ = api
    source, target = plan(client, group), plan(client, group, 'New clean questionnaire')
    path = path_with_source(client, group, source)
    old_step = path['steps'][0]
    row, record = evidence(db, source, old_step)
    response = replace(client, path, target['id'])
    assert response.status_code == 200, response.text
    new_step = response.json()['steps'][0]
    assert new_step['id'] != old_step['id'] and new_step['administration_plan_id'] == target['id']
    assert new_step['active_from']
    assert db.get(models.AdministrationPlan, source['id']).status == 'archived'
    assert db.get(models.AdministrationPlan, target['id']).status == 'active'
    assert db.get(models.ClassPathStep, old_step['id']).removed_at is not None
    assert db.get(models.ClassPathStepEvidence, record.id).step_id == old_step['id']
    assert db.get(models.QuestionnaireResult, row.id).administration_plan_id == source['id']
    assert db.query(models.ClassPathStepEvidence).filter_by(step_id=new_step['id']).count() == 0
    assert replace(client, path, target['id']).status_code == 409  # stale retry
    identity.update(username='alice', groups=[])
    shown = client.get('/user/paths').json()[0]['steps'][0]
    assert shown['state'] == 'not_done'


def test_invalid_or_used_target_rolls_back_archive_and_step_changes(api):
    client, db, _, group, other, _ = api
    source, target = plan(client, group), plan(client, group)
    path = path_with_source(client, group, source)
    # An existing result makes the new target unsuitable even if no path used it yet.
    db.add(models.QuestionnaireResult(administration_plan_id=target['id'], username='alice', session_id='target-used',
                                      questionnaire_type='QSA', scores={'C1': 5}, locale='it'))
    db.commit()
    response = replace(client, path, target['id'])
    assert response.status_code == 409 and response.json()['detail'] == 'administration_replacement_not_clean'
    assert db.get(models.AdministrationPlan, source['id']).status == 'active'
    assert db.get(models.ClassPathStep, path['steps'][0]['id']).removed_at is None
    foreign = plan(client, other)
    assert replace(client, path, foreign['id']).status_code == 422
    assert replace(client, path, source['id']).status_code == 422
    assert replace(client, path, target['id'], id=path['steps'][0]['id']).status_code == 409
    assert db.get(models.ClassPath, path['id']).revision == path['revision']


def test_invalid_source_and_foreign_actor_cannot_archive_an_administration(api):
    client, db, identity, group, _, _ = api
    source, target = plan(client, group), plan(client, group)
    path = path_with_source(client, group, source)
    bad = {**path, 'steps': [{**path['steps'][0], 'id': 999999}]}
    assert replace(client, bad, target['id']).status_code == 422
    identity.update(username='outsider')
    assert replace(client, path, target['id']).status_code == 403
    assert db.get(models.AdministrationPlan, source['id']).status == 'active'


def test_standalone_replacement_of_class_plan_keeps_context_and_validates_locale(api):
    client, db, _, group, other, _ = api
    source = plan(client, group)
    url = f"/admin/administration-plans/{source['id']}/replace"
    body = {'revision': source['revision'], 'replacement': {
        'title': 'Replacement', 'instrument_code': 'QSA', 'locale': 'it', 'status': 'active',
        'group_id': group.id, 'institution_id': group.institution_id}}
    for changed in ({'group_id': other.id}, {'institution_id': None}, {'locale': 'fr'}):
        response = client.post(url, json={**body, 'replacement': {**body['replacement'], **changed}})
        assert response.status_code == 422, response.text
        assert db.get(models.AdministrationPlan, source['id']).status == 'active'
        assert db.query(models.AdministrationPlan).count() == 1
    response = client.post(url, json=body)
    assert response.status_code == 200, response.text
    assert response.json()['group_id'] == group.id
    assert response.json()['institution_id'] == group.institution_id
    assert response.json()['responses_count'] == 0
    assert db.get(models.AdministrationPlan, source['id']).status == 'archived'
