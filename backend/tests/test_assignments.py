"""Catalog delivery and role isolation against a rolled-back PostgreSQL schema."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend import auth, database, models
from backend.routes.assignments import router
from backend.routes.assignment_work import router as work_router
from backend.routes.goals import router as goals_router
from backend.tests.artifact_database import artifact_session


@pytest.fixture
def setup():
    with artifact_session() as db:
        identity = dict(username='teacher', name='Docente Uno', authenticated=True, is_admin=False, groups=['docenti'])
        app = FastAPI(); app.include_router(router); app.include_router(goals_router); app.include_router(work_router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_identity] = lambda: dict(identity)
        group = models.StudentGroup(name='Universitari', code='GR-ASSIGN', owner_username='teacher')
        other = models.StudentGroup(name='Adulti', code='GR-OTHER', owner_username='another-teacher')
        db.add_all([group, other]); db.flush()
        db.add_all([models.GroupMembership(group_id=group.id, username='alice'),
                    models.GroupMembership(group_id=group.id, username='bob'),
                    models.GroupMembership(group_id=other.id, username='eve'),
                    models.GroupMembership(group_id=other.id, username='teacher')])
        goal = models.GoalCatalogEntry(author_username='teacher', group_id=group.id, status='published',
                                      data=dict(title='Organizzare lo studio', description='Pianifica', criteria='Una settimana', suggestions='Prova', language='it'))
        strategy = models.CertifiedStrategy(slug='distributed', name_it='Ripasso distribuito',
                                           description_it='Ripassa in più giornate', status='certified')
        reading = models.CertifiedReading(slug='film', title='Film del catalogo', kind='film', status='certified',
                                         why_i18n={'it': 'Per riflettere'}, where_to_find='Biblioteca', content_warning='Temi sensibili')
        db.add_all([goal, strategy, reading]); db.commit()
        with TestClient(app) as client:
            yield db, client, identity, group, other, dict(goal=goal, strategy=strategy, reading=reading)


def body(group, source, kind='goal', **overrides):
    return {**dict(source_kind=kind, source_id=source.id, group_id=group.id, request_id='assignment-request-1'), **overrides}


def as_student(who, username='alice'):
    who.update(username=username, name=username, groups=['studenti'], is_admin=False)


@pytest.mark.parametrize('kind', ['goal', 'strategy', 'reading'])
@pytest.mark.parametrize('individual', [False, True])
def test_delivery_to_current_group_or_individual_and_separate_personal_goals(setup, kind, individual):
    db, c, who, group, other, sources = setup
    payload = body(group, sources[kind], kind, recipient_username='alice' if individual else None, instructions='Leggi e annota una domanda')
    response = c.post('/teacher/assignments', json=payload)
    assert response.status_code == 201, response.text
    sent = response.json()
    assert sent['recipient_count'] == (1 if individual else 2)
    assert sent['author_name'] == 'Docente Uno'
    assert c.get('/teacher/assignments').json()[0]['id'] == sent['id']
    as_student(who)
    received = c.get('/user/assignments').json()
    assert len(received) == 1
    assert received[0]['instructions'] == payload['instructions']
    assert 'recipient_username' not in received[0] and 'recipient_count' not in received[0]
    assert received[0]['snapshot']['title']
    if kind == 'reading':
        assert received[0]['snapshot']['where_to_find'] == 'Biblioteca'
        assert received[0]['snapshot']['content_warning'] == 'Temi sensibili'
    assert db.query(models.PersonalGoal).count() == 0
    as_student(who, 'bob')
    assert len(c.get('/user/assignments').json()) == (0 if individual else 1)
    as_student(who, 'eve')
    assert c.get('/user/assignments').json() == []


def test_role_group_membership_and_target_isolation(setup):
    db, c, who, group, other, sources = setup
    assert [g['id'] for g in c.get('/teacher/assignment-targets').json()] == [group.id]
    assert c.post('/teacher/assignments', json=body(other, sources['strategy'], 'strategy')).status_code == 404
    assert c.post('/teacher/assignments', json=body(group, sources['goal'], recipient_username='eve')).status_code == 422
    as_student(who)
    assert c.post('/teacher/assignments', json=body(group, sources['goal'])).status_code == 403
    assert c.get('/teacher/assignments').status_code == 403
    assert c.get('/teacher/assignment-targets').status_code == 403
    who['authenticated'] = False
    assert c.get('/user/assignments').status_code == 401


def test_snapshots_retries_and_revocation(setup):
    db, c, who, group, other, sources = setup
    payload = body(group, sources['goal'])
    first = c.post('/teacher/assignments', json=payload).json()
    assert c.post('/teacher/assignments', json=payload).json()['id'] == first['id']
    assert db.query(models.AssignmentRecipient).count() == 2
    assert c.post('/teacher/assignments', json={**payload, 'instructions': 'changed'}).status_code == 409
    sources['goal'].data = dict(title='Changed'); sources['goal'].version = 2; db.commit()
    as_student(who)
    snapshot = c.get('/user/assignments').json()[0]['snapshot']
    assert snapshot['title'] == 'Organizzare lo studio' and snapshot['version'] == 1
    db.delete(sources['goal']); db.commit()
    assert c.get('/user/assignments').json()[0]['snapshot'] == snapshot
    who.update(username='another-teacher', groups=['docenti'])
    assert c.delete(f"/teacher/assignments/{first['id']}").status_code == 404
    who.update(username='teacher')
    assert c.delete(f"/teacher/assignments/{first['id']}").status_code == 200
    assert c.delete(f"/teacher/assignments/{first['id']}").status_code == 200
    assert c.get('/teacher/assignments').json()[0]['revoked_at']
    as_student(who)
    assert c.get('/user/assignments').json() == []


def test_publication_and_group_scope(setup):
    db, c, who, group, other, sources = setup
    for kind, source in sources.items():
        source.status = 'draft'; db.commit()
        assert c.post('/teacher/assignments', json=body(group, source, kind)).status_code == 404
    sources['goal'].status = 'published'; sources['goal'].group_id = other.id; db.commit()
    assert c.post('/teacher/assignments', json=body(group, sources['goal'])).status_code == 404
    sources['strategy'].status = 'certified'; sources['strategy'].is_active = False; db.commit()
    assert c.post('/teacher/assignments', json=body(group, sources['strategy'], 'strategy')).status_code == 404
    assert db.query(models.TeacherAssignment).count() == 0


@pytest.mark.parametrize('individual', [False, True])
def test_membership_changes_and_group_deactivation(setup, individual):
    db, c, who, group, other, sources = setup
    assert c.post('/teacher/assignments', json=body(group, sources['goal'], recipient_username='bob' if individual else None)).status_code == 201
    db.add(models.GroupMembership(group_id=group.id, username='late'))
    db.query(models.GroupMembership).filter_by(group_id=group.id, username='alice').delete(); db.commit()
    as_student(who, 'late')
    assert len(c.get('/user/assignments').json()) == (0 if individual else 1)
    as_student(who)
    assert c.get('/user/assignments').json() == []
    as_student(who, 'bob')
    assert len(c.get('/user/assignments').json()) == 1
    group.is_active = False; db.commit()
    assert c.get('/user/assignments').json() == []
    who.update(username='teacher', groups=['docenti'])
    assert c.post('/teacher/assignments', json=body(group, sources['goal'], request_id='another-request')).status_code == 404


@pytest.mark.parametrize('kind', ['goal', 'strategy', 'reading'])
def test_empty_class_assignment_reaches_later_members_until_revoked(setup, kind):
    db, c, who, group, other, sources = setup
    db.query(models.GroupMembership).filter_by(group_id=group.id).delete(); db.commit()
    assert c.get('/teacher/assignment-targets').json() == [dict(id=group.id, name=group.name, participants=[])]
    payload = body(group, sources[kind], kind, instructions='Preparato prima delle iscrizioni')
    response = c.post('/teacher/assignments', json=payload)
    assert response.status_code == 201, response.text
    first = response.json()
    assert first['recipient_count'] == 0
    assert c.get('/teacher/assignments').json()[0]['id'] == first['id']
    assert c.post('/teacher/assignments', json=payload).json()['id'] == first['id']
    assert c.post('/teacher/assignments', json=body(group, sources[kind], kind,
        recipient_username='alice', request_id='individual-empty')).status_code == 422
    assert db.query(models.AssignmentRecipient).count() == 0
    as_student(who, 'late')
    assert c.get('/user/assignments').json() == []
    db.add(models.GroupMembership(group_id=group.id, username='late')); db.commit()
    delivered = c.get('/user/assignments').json()
    assert len(delivered) == 1
    assert delivered[0]['snapshot'] == first['snapshot']
    assert delivered[0]['instructions'] == payload['instructions']
    assert 'recipient_count' not in delivered[0] and 'recipient_username' not in delivered[0]
    assert db.query(models.PersonalGoal).count() == 0
    db.query(models.GroupMembership).filter_by(group_id=group.id, username='late').delete(); db.commit()
    assert c.get('/user/assignments').json() == []
    db.add(models.GroupMembership(group_id=group.id, username='late')); db.commit()
    assert len(c.get('/user/assignments').json()) == 1
    who.update(username='teacher', groups=['docenti'])
    assert c.get('/teacher/assignments').json()[0]['recipient_count'] == 1
    retry = c.post('/teacher/assignments', json=payload).json()
    assert retry['id'] == first['id'] and retry['recipient_count'] == 1
    assert db.query(models.TeacherAssignment).count() == 1
    assert c.delete(f"/teacher/assignments/{first['id']}").status_code == 200
    db.add(models.GroupMembership(group_id=group.id, username='after-revocation')); db.commit()
    for username in ['late', 'after-revocation', 'eve']:
        as_student(who, username)
        assert c.get('/user/assignments').json() == []


def test_shared_management_and_revoked_access(setup):
    db, c, who, group, other, sources = setup
    share = models.GroupShare(group_id=group.id, shared_with_username='colleague', granted_by_username='teacher')
    db.add(share); db.commit()
    who.update(username='colleague')
    response = c.post('/teacher/assignments', json=body(group, sources['goal']))
    assert response.status_code == 201, response.text
    db.delete(share); db.commit()
    assert c.get('/teacher/assignment-targets').json() == []
    assert c.get('/teacher/assignments').json() == []
    assert c.delete(f"/teacher/assignments/{response.json()['id']}").status_code == 404


def test_common_goals_can_be_assigned_but_not_edited_by_other_teachers(setup):
    db, c, who, group, other, sources = setup
    common = models.GoalCatalogEntry(author_username='admin', status='published', data=dict(title='Common'))
    hidden = models.GoalCatalogEntry(author_username='admin', status='draft', data=dict(title='Draft'))
    db.add_all([common, hidden]); db.commit()
    ids = [r['id'] for r in c.get('/teacher/goal-catalog').json()]
    assert common.id in ids and hidden.id not in ids
    assert c.post('/teacher/assignments', json=body(group, common)).status_code == 201
    assert c.put(f'/teacher/goal-catalog/{common.id}', json=dict(data=dict(title='Changed'), version=1)).status_code == 404
