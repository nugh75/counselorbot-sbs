"""Goal workflow on isolated Postgres: scope, ownership, versioning and coordination."""
import json
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend import auth, database, models
from backend.goals import goals_context, seed_goals
from backend.routes.goals import router
from backend.routes.visual_tools import router as visual_router
from backend.tests.artifact_database import artifact_session


@pytest.fixture
def setup():
    with artifact_session() as db:
        identity = dict(username='alice', authenticated=True, is_admin=False, groups=['studenti'])
        app = FastAPI(); app.include_router(router); app.include_router(visual_router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        group = models.StudentGroup(name='Class A', code='GR-TESTGOALS', owner_username='teacher', is_active=True)
        db.add(group); db.flush()
        db.add(models.GroupMembership(group_id=group.id, username='alice')); db.commit()
        with TestClient(app) as client:
            yield db, client, identity, group.id


def teacher(identity, admin=False):
    identity.update(username='teacher', is_admin=admin, groups=['docenti'])


def student(identity, username='alice'):
    identity.update(username=username, is_admin=False, groups=['studenti'])


def proposal(**kwargs):
    return dict(data=dict(title='Organizzare lo studio', criteria='Una settimana di prova'), **kwargs)


def goal(client, title='Il mio obiettivo', **kwargs):
    response = client.post('/user/goals', json=dict(title=title, **kwargs))
    assert response.status_code == 201, response.text
    return response.json()


def edit_payload(row, **kwargs):
    return {**{k: row[k] for k in ('title', 'motivation', 'criteria', 'reflection', 'status', 'priority', 'review_date', 'shared_group_id', 'revision')}, **kwargs}


def test_catalog_scope_roles_and_common_review(setup):
    db, c, who, group_id = setup
    assert c.post('/teacher/goal-catalog', json=proposal()).status_code == 403
    teacher(who)
    assert c.post('/teacher/goal-catalog', json=proposal(status='published')).status_code == 403
    pending = c.post('/teacher/goal-catalog', json=proposal(status='pending')).json()
    scoped = c.post('/teacher/goal-catalog', json=proposal(group_id=group_id, status='published')).json()
    assert c.post('/teacher/goal-catalog', json=proposal(group_id=987654, status='published')).status_code == 404
    student(who)
    assert [r['id'] for r in c.get('/user/goal-catalog').json()] == [scoped['id']]
    student(who, 'bob')
    assert c.get('/user/goal-catalog').json() == []
    assert c.post('/user/goals', json=dict(title='x', catalog_id=scoped['id'], catalog_version=1)).status_code == 404
    teacher(who, admin=True)
    published = c.put(f"/teacher/goal-catalog/{pending['id']}", json=proposal(status='published', version=1))
    assert published.status_code == 200
    student(who, 'bob')
    assert len(c.get('/user/goal-catalog').json()) == 1


def test_catalog_version_snapshot_and_stale_adoption(setup):
    db, c, who, group_id = setup
    teacher(who)
    entry = c.post('/teacher/goal-catalog', json=proposal(group_id=group_id, status='published')).json()
    student(who)
    chosen = goal(c, catalog_id=entry['id'], catalog_version=1)
    teacher(who)
    change = proposal(group_id=group_id, status='published', version=1)
    change['data']['title'] = 'Nuova formulazione'
    assert c.put(f"/teacher/goal-catalog/{entry['id']}", json=change).status_code == 200
    assert c.put(f"/teacher/goal-catalog/{entry['id']}", json=change).status_code == 409
    student(who)
    assert c.get('/user/goals').json()[0]['catalog_snapshot']['data']['title'] == 'Organizzare lo studio'
    assert c.post('/user/goals', json=dict(title='old', catalog_id=entry['id'], catalog_version=1)).status_code == 409
    assert chosen['catalog_snapshot']['version'] == 1


def test_personal_ownership_and_revision(setup):
    db, c, who, group_id = setup
    row = goal(c)
    student(who, 'bob')
    assert c.get('/user/goals').json() == []
    assert c.put(f"/user/goals/{row['id']}", json=edit_payload(row)).status_code == 404
    assert c.delete(f"/user/goals/{row['id']}?revision=1").status_code == 404
    student(who)
    assert c.put(f"/user/goals/{row['id']}", json=edit_payload(row, review_date='2026-02-30')).status_code == 422
    updated = c.put(f"/user/goals/{row['id']}", json=edit_payload(row, status='paused')).json()
    assert updated['revision'] == 2
    assert c.put(f"/user/goals/{row['id']}", json=edit_payload(row)).status_code == 409
    assert c.delete(f"/user/goals/{row['id']}?revision=1").status_code == 409


def test_link_ownership_live_resolution_unavailable_and_cascade(setup):
    db, c, who, group_id = setup
    own = models.PortfolioItem(username='alice', title='Originale')
    other = models.PortfolioItem(username='bob', title='Privato')
    db.add_all([own, other]); db.commit()
    row = goal(c)
    url = f"/user/goals/{row['id']}/links"
    assert c.post(url, json=dict(kind='portfolio', target_id=str(other.id), revision=1)).status_code == 404
    linked = c.post(url, json=dict(kind='portfolio', target_id=str(own.id), revision=1)).json()
    assert linked['links'][0]['title'] == 'Originale'
    own.title = 'Aggiornato'; db.commit()
    assert c.get('/user/goals').json()[0]['links'][0]['title'] == 'Aggiornato'
    db.delete(own); db.commit()
    missing = c.get('/user/goals').json()[0]['links'][0]
    assert missing['available'] is False and missing['href'] is None and missing['title'] == ''
    assert c.delete(f"/user/goals/{row['id']}?revision=2").status_code == 200
    assert db.query(models.GoalResourceLink).count() == 0


def test_activity_is_shared_with_calendar_and_does_not_complete_goal(setup):
    db, c, who, group_id = setup
    row = goal(c)
    payload = dict(title='Provare una strategia', date='2026-10-02', request_id='test-action-123', revision=1)
    response = c.post(f"/user/goals/{row['id']}/actions", json=payload)
    assert response.status_code == 200, response.text
    assert c.post(f"/user/goals/{row['id']}/actions", json=payload).status_code == 200
    state = c.get('/user/timeline').json()
    assert len(state['workspace']['actions']) == 1
    action = state['workspace']['actions'][0]
    assert action['date_mode'] == 'point' and action['start_date'] == '2026-10-02'
    assert state['workspace']['timeline']['events'] == []
    state['workspace']['actions'][0]['stage'] = 'done'
    assert c.put('/user/timeline', json={k: state[k] for k in ('revision', 'workspace')}).status_code == 200
    row = c.get('/user/goals').json()[0]
    assert row['status'] == 'active'
    assert len(row['links']) == 1
    assert row['links'][0]['kind'] == 'action'
    assert row['links'][0]['stage'] == 'done'
    assert c.post(f"/user/goals/{row['id']}/actions", json={**payload, 'request_id':'another-action'}).status_code == 409
    assert len(c.get('/user/timeline').json()['workspace']['actions']) == 1


def test_sharing_is_voluntary_revocable_and_scoped(setup):
    db, c, who, group_id = setup
    private = goal(c, motivation='Private motivation')
    shared = goal(c, shared_group_id=group_id, reflection='Summary shared by choice')
    teacher(who)
    result = c.get(f'/teacher/groups/{group_id}/goals').json()
    assert len(result) == 1 and result[0]['id'] == shared['id']
    assert 'motivation' not in result[0] and 'links' not in result[0]
    who['username'] = 'another-teacher'
    assert c.get(f'/teacher/groups/{group_id}/goals').status_code == 404
    student(who)
    assert c.put(f"/user/goals/{shared['id']}", json=edit_payload(shared, shared_group_id=None)).status_code == 200
    teacher(who)
    assert c.get(f'/teacher/groups/{group_id}/goals').json() == []
    student(who, 'bob')
    assert c.post('/user/goals', json=dict(title='x', shared_group_id=group_id)).status_code == 404


def test_context_seed_and_withdrawn_membership(setup):
    db, c, who, group_id = setup
    seed_goals(db); seed_goals(db)
    assert db.query(models.GoalCatalogEntry).count() == 6
    assert goals_context(db, 'alice') == ''
    row = goal(c, shared_group_id=group_id, criteria='Una prova concreta')
    assert 'Una prova concreta' in goals_context(db, 'alice')
    assert goals_context(db, 'bob') == ''
    db.query(models.GroupMembership).filter_by(group_id=group_id, username='alice').delete(); db.commit()
    teacher(who)
    assert c.get(f'/teacher/groups/{group_id}/goals').json() == []
    student(who)
    # Revoking an old share remains possible even after leaving the group.
    assert c.put(f"/user/goals/{row['id']}", json=edit_payload(row, shared_group_id=None)).status_code == 200


def test_retry_adoption_is_idempotent_and_personal_goals_stay_multiple(setup):
    db, c, who, group_id = setup
    first = goal(c, request_id='adoption-request-1')
    retry = goal(c, request_id='adoption-request-1')
    second = goal(c, request_id='adoption-request-2')
    assert first['id'] == retry['id'] != second['id']
    assert len(c.get('/user/goals').json()) == 2
    assert c.get('/user/goal-groups').json() == [{'id': group_id, 'name': 'Class A'}]


def test_tavolo_context_uses_only_explicitly_linked_owned_goals(setup):
    from datetime import datetime, timezone
    db, c, who, _ = setup
    row = goal(c, motivation='Coordinate this table')
    goal(c, motivation='Different private project')
    table = models.Tavolo(id='goal-table', username='alice', title='Progetto', saved_at=datetime.now(timezone.utc))
    db.add(table); db.commit()
    assert goals_context(db, 'alice', tavolo_id=table.id) == ''
    assert c.post(f"/user/goals/{row['id']}/links", json=dict(kind='tavolo', target_id=table.id, revision=1)).status_code == 200
    context = goals_context(db, 'alice', tavolo_id=table.id)
    assert 'Coordinate this table' in context and 'Different private project' not in context
    assert goals_context(db, 'bob', tavolo_id=table.id) == ''


def test_create_subgoal_under_owned_parent(setup):
    db, c, who, group_id = setup
    parent = goal(c, title='Erasmus')
    assert parent['parent_ids'] == []
    child = goal(c, title='Inglese', parent_id=parent['id'])
    assert child['parent_ids'] == [parent['id']]
    student(who, 'bob')
    assert c.post('/user/goals', json=dict(title='x', parent_id=parent['id'])).status_code == 404
    student(who)
    assert c.post('/user/goals', json=dict(title='x', parent_id=987654)).status_code == 404


def test_parents_add_remove_revision_and_idempotence(setup):
    db, c, who, group_id = setup
    a, b, child = goal(c, title='A'), goal(c, title='B'), goal(c, title='C')
    url = f"/user/goals/{child['id']}/parents"
    added = c.post(url, json=dict(parent_id=a['id'], revision=1)).json()
    assert added['parent_ids'] == [a['id']] and added['revision'] == 2
    assert c.post(url, json=dict(parent_id=b['id'], revision=1)).status_code == 409
    both = c.post(url, json=dict(parent_id=b['id'], revision=2)).json()
    assert both['parent_ids'] == sorted([a['id'], b['id']])
    same = c.post(url, json=dict(parent_id=b['id'], revision=3)).json()
    assert same['revision'] == 3
    removed = c.delete(f"{url}/{a['id']}?revision=3").json()
    assert removed['parent_ids'] == [b['id']] and removed['revision'] == 4
    assert c.delete(f"{url}/{a['id']}?revision=4").status_code == 404
    student(who, 'bob')
    assert c.post(url, json=dict(parent_id=a['id'], revision=4)).status_code == 404


def test_parents_reject_cycles_and_foreign_parent(setup):
    db, c, who, group_id = setup
    a = goal(c, title='A'); b = goal(c, title='B', parent_id=a['id']); d = goal(c, title='D', parent_id=b['id'])
    assert c.post(f"/user/goals/{a['id']}/parents", json=dict(parent_id=a['id'], revision=1)).status_code == 422
    assert c.post(f"/user/goals/{a['id']}/parents", json=dict(parent_id=d['id'], revision=1)).status_code == 422
    student(who, 'bob')
    foreign = goal(c, title='Bob')
    student(who)
    assert c.post(f"/user/goals/{a['id']}/parents", json=dict(parent_id=foreign['id'], revision=1)).status_code == 404


def test_deleting_parent_breaks_branch_and_keeps_children(setup):
    db, c, who, group_id = setup
    a = goal(c, title='A'); other = goal(c, title='Other')
    child = goal(c, title='Child', parent_id=a['id'])
    both = c.post(f"/user/goals/{child['id']}/parents", json=dict(parent_id=other['id'], revision=1)).json()
    orphan = goal(c, title='Orphan', parent_id=a['id'])
    assert c.delete(f"/user/goals/{a['id']}?revision=1").status_code == 200
    rows = {r['title']: r for r in c.get('/user/goals').json()}
    assert rows['Child']['parent_ids'] == [other['id']] and rows['Child']['revision'] == both['revision'] + 1
    assert rows['Orphan']['parent_ids'] == [] and rows['Orphan']['revision'] == orphan['revision'] + 1
    assert db.query(models.GoalEdge).filter_by(parent_id=a['id']).count() == 0


def test_sharing_follows_the_branch_without_private_ancestors(setup):
    db, c, who, group_id = setup
    top = goal(c, title='Privato in alto')
    branch = goal(c, title='Ramo condiviso', parent_id=top['id'], shared_group_id=group_id)
    leaf = goal(c, title='Foglia', parent_id=branch['id'])
    deep = goal(c, title='Profonda', parent_id=leaf['id'])
    goal(c, title='Altro privato', parent_id=top['id'])
    teacher(who)
    rows = {r['title']: r for r in c.get(f'/teacher/groups/{group_id}/goals').json()}
    assert set(rows) == {'Ramo condiviso', 'Foglia', 'Profonda'}
    assert rows['Ramo condiviso']['parent_ids'] == []
    assert rows['Foglia']['parent_ids'] == [branch['id']] and rows['Profonda']['parent_ids'] == [leaf['id']]
    assert 'motivation' not in rows['Foglia']
    student(who)
    assert c.delete(f"/user/goals/{leaf['id']}/parents/{branch['id']}?revision=1").status_code == 200
    teacher(who)
    assert {r['title'] for r in c.get(f'/teacher/groups/{group_id}/goals').json()} == {'Ramo condiviso'}


def test_context_names_parent_goals(setup):
    db, c, who, group_id = setup
    parent = goal(c, title='Erasmus in Spagna')
    goal(c, title='Migliorare inglese', parent_id=parent['id'])
    context = goals_context(db, 'alice')
    assert '"part_of": ["Erasmus in Spagna"]' in context


def test_diamond_visibility_hides_private_parent(setup):
    """Child with one shared and one private parent: the teacher sees only the shared branch."""
    db, c, who, group_id = setup
    shared_parent = goal(c, title='Genitore condiviso', shared_group_id=group_id)
    private_parent = goal(c, title='Genitore privato')
    child = goal(c, title='Figlio diamante', parent_id=shared_parent['id'])
    child = c.post(f"/user/goals/{child['id']}/parents", json=dict(parent_id=private_parent['id'], revision=child['revision'])).json()
    assert sorted(child['parent_ids']) == sorted([shared_parent['id'], private_parent['id']])
    teacher(who)
    rows = {r['title']: r for r in c.get(f'/teacher/groups/{group_id}/goals').json()}
    assert set(rows) == {'Genitore condiviso', 'Figlio diamante'}
    assert rows['Figlio diamante']['parent_ids'] == [shared_parent['id']]


def test_multi_path_visible_to_multiple_groups(setup):
    """A goal reachable through two distinct shared ancestors is visible to both groups' teachers."""
    db, c, who, group_id = setup
    group2 = models.StudentGroup(name='Class B', code='GR-TESTGOALS2', owner_username='teacher', is_active=True)
    db.add(group2); db.flush()
    db.add(models.GroupMembership(group_id=group2.id, username='alice')); db.commit()
    parent1 = goal(c, title='Genitore gruppo 1', shared_group_id=group_id)
    parent2 = goal(c, title='Genitore gruppo 2', shared_group_id=group2.id)
    child = goal(c, title='Figlio multi-percorso', parent_id=parent1['id'])
    child = c.post(f"/user/goals/{child['id']}/parents", json=dict(parent_id=parent2['id'], revision=child['revision'])).json()
    teacher(who)
    titles_group1 = {r['title'] for r in c.get(f'/teacher/groups/{group_id}/goals').json()}
    titles_group2 = {r['title'] for r in c.get(f'/teacher/groups/{group2.id}/goals').json()}
    assert 'Figlio multi-percorso' in titles_group1
    assert 'Figlio multi-percorso' in titles_group2


def reading(db, session_id='s1', username='alice'):
    db.add(models.ResultReading(username=username, session_id=session_id, questionnaire_type='QSA',
                                growth_areas=['C3'], note='Mi agito agli esami'))
    db.commit()


def test_goal_created_from_reading_keeps_single_origin(setup):
    db, c, who, _ = setup
    reading(db)
    row = goal(c, origin=dict(kind='reading', target_id='s1'))
    assert row['origin']['kind'] == 'reading' and row['origin']['role'] == 'origin'
    assert row['origin']['available'] is True
    again = c.post(f"/user/goals/{row['id']}/links", json=dict(kind='reading', target_id='s1', role='origin', revision=row['revision']))
    assert again.status_code == 422


def test_origin_must_be_owned(setup):
    db, c, who, _ = setup
    reading(db, username='bob')
    assert c.post('/user/goals', json=dict(title='x', origin=dict(kind='reading', target_id='s1'))).status_code == 404


def test_link_role_rules(setup):
    db, c, who, _ = setup
    row = goal(c)
    bad = c.post(f"/user/goals/{row['id']}/links", json=dict(kind='notebook', target_id='current', role='evidence', revision=row['revision']))
    assert bad.status_code == 422


def test_booklet_kind_is_gone(setup):
    db, c, who, _ = setup
    row = goal(c)
    r = c.post(f"/user/goals/{row['id']}/links", json=dict(kind='booklet', target_id='1', revision=row['revision']))
    assert r.status_code == 422


def test_goals_context_respects_budget_with_many_long_parents(setup):
    """§8: several active goals, each with 3 long parents, stay within the 6500-char budget
    and every part_of title is truncated to 120 chars."""
    db, c, who, group_id = setup
    parents = [goal(c, title=('P' * 150) + str(j)) for j in range(3)]
    for i in range(5):
        child = goal(c, title=f'Obiettivo attivo {i}', criteria='Criterio di prova per il budget del contesto ' * 3)
        for parent in parents:
            child = c.post(f"/user/goals/{child['id']}/parents", json=dict(parent_id=parent['id'], revision=child['revision'])).json()
    context = goals_context(db, 'alice')
    json_part = context.rsplit('\n', 1)[-1]
    assert len(json_part) <= 6500
    content = json.loads(json_part)
    assert content
    for item in content:
        for title in item.get('part_of', []):
            assert len(title) <= 120


def test_session_origin_must_be_owned(setup):
    """The 'session' kind goes through session_resource, which must scope by username too."""
    db, c, who, _ = setup
    db.add(models.Log(session_id='s-bob', username='bob', action='chat_message', questionnaire_type='QSA'))
    db.commit()
    assert c.post('/user/goals', json=dict(title='x', origin=dict(kind='session', target_id='s-bob'))).status_code == 404
    db.add(models.Log(session_id='s-alice', username='alice', action='chat_message', questionnaire_type='QSA'))
    db.commit()
    row = goal(c, origin=dict(kind='session', target_id='s-alice'))
    assert row['origin']['kind'] == 'session'


def test_goal_method_update_round_trips(setup):
    db, c, who, _ = setup
    db.add(models.CertifiedStrategy(slug='self-test', name_it='Autoverifica', status='certified', is_active=True)); db.commit()
    from backend.routes.personal_strategies import router as strategies_router
    c.app.include_router(strategies_router)
    own = c.post('/user/strategies', json=dict(text='Ripeto a voce')).json()
    row = goal(c, method=[dict(kind='certified', slug='self-test')])
    assert row['method'] == [dict(kind='certified', slug='self-test', title='Autoverifica', available=True)]
    updated = c.put(f"/user/goals/{row['id']}", json=edit_payload(row, method=[dict(kind='own', id=own['id'])])).json()
    assert updated['method'] == [dict(kind='own', id=own['id'], title='Ripeto a voce', available=True)]
    assert updated['revision'] == row['revision'] + 1


def test_goal_method_update_rejects_unknown_or_foreign_items(setup):
    db, c, who, _ = setup
    db.add(models.CertifiedStrategy(slug='self-test', name_it='Autoverifica', status='certified', is_active=True)); db.commit()
    from backend.routes.personal_strategies import router as strategies_router
    c.app.include_router(strategies_router)
    row = goal(c, method=[dict(kind='certified', slug='self-test')])
    assert c.put(f"/user/goals/{row['id']}", json=edit_payload(row, method=[dict(kind='certified', slug='nope')])).status_code == 404
    foreign = c.post('/user/strategies', json=dict(text='Mia')).json()
    student(who, 'bob')
    other = goal(c)
    assert c.put(f"/user/goals/{other['id']}", json=edit_payload(other, method=[dict(kind='own', id=foreign['id'])])).status_code == 404

