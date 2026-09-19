"""Real PostgreSQL: private learning work, explicit snapshots and scoped feedback."""
from datetime import datetime, timezone, timedelta
import hashlib
import json

import pytest

from backend import models
from backend.routes.assignments import AssignmentWrite
from backend.tests.test_assignments import setup, body, as_student
from backend.visual_tools import load_workspace, save_workspace, SavePersonalWorkspace


def assign_and_plan(c, who, group, sources, **options):
    result = c.post('/teacher/assignments', json=body(group, sources['reading'], 'reading', **options))
    assert result.status_code == 201, result.text
    assignment = result.json()
    as_student(who)
    path = f"/user/assignments/{assignment['id']}"
    response = c.post(path + '/plan', json={'date': '2026-10-10'})
    assert response.status_code == 200, response.text
    return assignment, path, response.json()


def test_plan_uses_existing_workspace_idempotently_without_creating_goals(setup):
    db, c, who, group, _, sources = setup
    assignment, path, work = assign_and_plan(c, who, group, sources, intent='requested',
        due_date='2026-10-12', response_prompt='Condividi una riflessione')
    assert assignment['intent'] == 'requested' and assignment['due_date'] == '2026-10-12'
    assert work['event']['start_date'] == '2026-10-10'
    assert work['event']['action_ids'] == [work['action']['id']]
    assert work['action']['source'] == f"/profilo/assegnazioni#assignment-{assignment['id']}"
    assert c.post(path + '/plan', json={'date': '2026-11-11'}).json() == work
    assert db.query(models.AssignmentWork).count() == 1
    assert db.query(models.PersonalGoal).count() == 0
    state = load_workspace(db, None, 'alice')
    assert len(state['workspace']['actions']) == 1
    state['workspace']['actions'][0]['stage'] = 'done'
    state['workspace']['timeline']['events'][0]['reflection'] = 'Scritta dal diario'
    save_workspace(db, None, 'alice', SavePersonalWorkspace(**state))
    current = c.get(path + '/work').json()
    assert current['action']['stage'] == 'done' and current['event']['reflection'] == 'Scritta dal diario'
    assert c.put(path + '/reflection', json={'revision': work['revision'], 'workspace_revision': work['workspace_revision'], 'reflection': 'Obsoleta'}).status_code == 409
    response = c.put(path + '/reflection', json={'revision': current['revision'], 'workspace_revision': current['workspace_revision'], 'reflection': 'Riflessione personale'})
    assert response.status_code == 200, response.text
    assert load_workspace(db, None, 'alice')['workspace']['timeline']['events'][0]['reflection'] == 'Riflessione personale'
    who.update(username='teacher', groups=['docenti'])
    assert c.get(f"/teacher/assignments/{assignment['id']}/submissions").json() == []


def test_optional_goal_link_ownership_and_revisions(setup):
    db, c, who, group, _, sources = setup
    _, path, work = assign_and_plan(c, who, group, sources)
    goal = models.PersonalGoal(username='alice', title='Capire le mie scelte')
    other = models.PersonalGoal(username='bob', title='Privato di Bob')
    db.add_all([goal, other]); db.commit()
    payload = dict(revision=work['revision'], goal_id=other.id, goal_revision=other.revision)
    assert c.post(path + '/goal', json=payload).status_code == 404
    payload.update(goal_id=goal.id, goal_revision=goal.revision)
    response = c.post(path + '/goal', json=payload)
    assert response.status_code == 200, response.text
    assert {link.kind for link in db.query(models.GoalResourceLink).filter_by(goal_id=goal.id)} == {'event', 'action'}
    assert response.json()['linked_goals'] == [dict(id=goal.id, title=goal.title)]
    assert goal.shared_group_id is None and goal.status == 'active'
    assert c.post(path + '/goal', json=payload).status_code == 409


def test_explicit_snapshot_feedback_resubmission_and_withdrawal(setup):
    db, c, who, group, _, sources = setup
    assignment, path, work = assign_and_plan(c, who, group, sources)
    work = c.put(path + '/reflection', json=dict(revision=work['revision'], workspace_revision=work['workspace_revision'], reflection='Pensiero privato')).json()
    assert c.post(path + '/submission', json=dict(revision=work['revision'], text='   ')).status_code == 422
    work = c.post(path + '/submission', json=dict(revision=work['revision'], text='Solo questa frase al docente')).json()
    shared_revision = work['revision']
    # A private edit must never change what the teacher received.
    work = c.put(path + '/reflection', json=dict(revision=work['revision'], workspace_revision=work['workspace_revision'], reflection='Altro pensiero privato')).json()
    teacher_path = f"/teacher/assignments/{assignment['id']}/submissions"
    who.update(username='teacher', groups=['docenti'])
    shared = c.get(teacher_path).json()[0]
    assert shared['submission'] == dict(text='Solo questa frase al docente')
    assert 'privato' not in json.dumps(shared) and 'workspace_revision' not in shared
    assert c.put(teacher_path + '/alice/feedback', json=dict(revision=shared_revision, text='Obsoleto')).status_code == 409
    response = c.put(teacher_path + '/alice/feedback', json=dict(revision=shared['revision'], text='Prova a confrontare due scelte'))
    assert response.status_code == 200, response.text
    as_student(who)
    work = c.get(path + '/work').json()
    assert work['feedback'] == 'Prova a confrontare due scelte'
    assert c.get('/user/assignments').json()[0]['progress']['feedback_available'] is True
    response = c.post(path + '/submission', json=dict(revision=work['revision'], text='Restituzione aggiornata'))
    work = response.json()
    assert not work['feedback']
    assert c.delete(path + f"/submission?revision={work['revision']}").status_code == 200
    work = c.get(path + '/work').json()
    assert work['submission'] is None and work['event']['reflection'] == 'Altro pensiero privato'
    who.update(username='teacher', groups=['docenti'])
    assert c.get(teacher_path).json() == []
    assert c.put(teacher_path + '/alice/feedback', json=dict(revision=work['revision'], text='Non deve passare')).status_code == 404


def test_portfolio_text_preview_is_owned_versioned_and_immutable(setup):
    db, c, who, group, _, sources = setup
    assignment, path, work = assign_and_plan(c, who, group, sources)
    own = models.PortfolioItem(username='alice', title='Il mio lavoro', description='Testo selezionato', images=[dict(id='secret-image', path='/private')])
    other = models.PortfolioItem(username='bob', title='Lavoro altrui')
    db.add_all([own, other]); db.commit()
    payload = dict(revision=work['revision'], portfolio_id=other.id, portfolio_updated_at=other.updated_at.isoformat())
    assert c.post(path + '/submission', json=payload).status_code == 404
    payload.update(portfolio_id=own.id, portfolio_updated_at=(own.updated_at - timedelta(seconds=1)).isoformat())
    assert c.post(path + '/submission', json=payload).status_code == 409
    payload['portfolio_updated_at'] = own.updated_at.isoformat()
    response = c.post(path + '/submission', json=payload)
    assert response.status_code == 200, response.text
    snapshot = response.json()['submission']
    assert snapshot == dict(text='', portfolio=dict(title='Il mio lavoro', description='Testo selezionato'))
    db.delete(own); db.commit()
    who.update(username='teacher', groups=['docenti'])
    assert c.get(f"/teacher/assignments/{assignment['id']}/submissions").json()[0]['submission'] == snapshot


@pytest.mark.parametrize('change', ['leave', 'deactivate', 'revoke', 'remove-management'])
def test_visibility_stops_after_membership_or_management_changes(setup, change):
    db, c, who, group, _, sources = setup
    assignment, path, work = assign_and_plan(c, who, group, sources)
    work = c.post(path + '/submission', json=dict(revision=work['revision'], text='Condiviso')).json()
    if change == 'leave':
        db.query(models.GroupMembership).filter_by(group_id=group.id, username='alice').delete()
    elif change == 'deactivate':
        group.is_active = False
    elif change == 'revoke':
        db.get(models.TeacherAssignment, assignment['id']).revoked_at = datetime.now(timezone.utc)
    else:
        group.owner_username = 'other'
    db.commit()
    if change != 'remove-management':
        assert c.get(path + '/work').status_code == 404
        assert c.post(path + '/submission', json=dict(revision=work['revision'], text='Nuovo')).status_code == 404
    # Personal work survives all assignment/class access changes.
    assert load_workspace(db, None, 'alice')['workspace']['actions']
    who.update(username='teacher', groups=['docenti'])
    response = c.get(f"/teacher/assignments/{assignment['id']}/submissions")
    assert (response.json() == []) if change == 'leave' else response.status_code == 404


def test_students_and_other_teachers_cannot_read_or_write_others_work(setup):
    db, c, who, group, _, sources = setup
    assignment, path, work = assign_and_plan(c, who, group, sources, recipient_username='alice')
    teacher_path = f"/teacher/assignments/{assignment['id']}/submissions"
    as_student(who, 'bob')
    assert c.get(path + '/work').status_code == 404
    assert c.post(path + '/plan', json={}).status_code == 404
    assert c.get(teacher_path).status_code == 403
    db.add(models.GroupShare(group_id=group.id, shared_with_username='colleague', granted_by_username='teacher')); db.commit()
    who.update(username='colleague', groups=['docenti'])
    assert c.get(teacher_path).status_code == 404


def test_legacy_settings_and_request_retries(setup):
    db, c, who, group, _, sources = setup
    payload = body(group, sources['strategy'], 'strategy')
    first = c.post('/teacher/assignments', json=payload).json()
    settings = db.get(models.AssignmentLearningSettings, first['id'])
    db.delete(settings)
    old_payload = AssignmentWrite(**payload).model_dump(exclude={'intent', 'due_date', 'response_prompt'})
    db.get(models.TeacherAssignment, first['id']).request_hash = hashlib.sha256(json.dumps(old_payload, sort_keys=True).encode()).hexdigest()
    db.commit()
    response = c.post('/teacher/assignments', json=payload)
    assert response.status_code == 201 and response.json()['id'] == first['id']
    assert response.json()['intent'] == 'proposal'
    assert c.post('/teacher/assignments', json={**payload, 'intent': 'requested'}).status_code == 409


def test_deleted_workspace_content_is_not_recreated_by_retries(setup):
    db, c, who, group, _, sources = setup
    _, path, work = assign_and_plan(c, who, group, sources)
    state = load_workspace(db, None, 'alice')
    state['workspace']['timeline']['events'] = []; state['workspace']['actions'] = []
    save_workspace(db, None, 'alice', SavePersonalWorkspace(**state))
    replay = c.post(path + '/plan', json={}).json()
    assert replay['planned'] and replay['action'] is None and replay['event'] is None
    assert c.put(path + '/reflection', json=dict(revision=work['revision'], workspace_revision=replay['workspace_revision'], reflection='No')).status_code == 404
