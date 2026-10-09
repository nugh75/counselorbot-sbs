"""Teacher institute API contracts on disposable synthetic PostgreSQL schemas."""
import os
import uuid

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from backend import auth, database, models
from backend.routes import groups, institutions


@pytest.fixture
def api():
    # Never silently fall back to an operational database.
    url = os.environ['DATABASE_URL']
    assert url == 'postgresql://c3_test@127.0.0.1:18648/counselorbot_test'
    engine = create_engine(url)
    schema = 'tf1_' + uuid.uuid4().hex
    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
        models.Base.metadata.create_all(connection)
    app = FastAPI()
    app.include_router(institutions.router)
    app.include_router(groups.router)

    def session():
        with Session(engine) as db:
            db.execute(text(f'SET search_path TO "{schema}"'))
            yield db

    def identity(request: Request):
        role = request.headers.get('x-test-role', 'teacher')
        return dict(username=request.headers.get('x-test-user', 'first'), authenticated=role != 'anonymous',
                    groups={'teacher': ['docenti'], 'admin': ['admins'], 'researcher': ['researchers'],
                            'student': ['studenti'], 'anonymous': []}[role],
                    is_admin=role == 'admin', is_researcher=role == 'researcher')

    app.dependency_overrides[database.get_db] = session
    app.dependency_overrides[auth.get_identity] = identity
    with TestClient(app) as client:
        yield client, engine, schema
    with engine.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    engine.dispose()


def test_creation_is_active_atomic_and_owned_by_authenticated_teacher(api):
    client, _, _ = api
    response = client.post('/teacher/institutions', json={'name': 'Synthetic school', 'kind': 'school'})
    assert response.status_code == 201, response.text
    school = response.json()
    assert school['is_active'] is True
    assert school['created_by'] == 'first'
    assert school['revision'] == 1
    assert school['member_count'] == 1
    assert school['credentials_configured'] is False
    assert [row['id'] for row in client.get('/teacher/institutions').json()] == [school['id']]
    assert client.get('/teacher/institutions', headers={'x-test-user': 'second'}).json() == []
    assert client.get(f"/teacher/institutions/{school['id']}", headers={'x-test-user': 'second'}).status_code == 403
    # Members read the external code once entered (#149); the verifier never leaves the server.
    assert 'hashed_password' not in school and school['institution_code'] is None


def create(client, **values):
    response = client.post('/teacher/institutions', json={'name': 'Synthetic school', **values})
    assert response.status_code == 201, response.text
    return response.json()


def test_explicit_directory_selection_and_idempotent_second_teacher_join(api):
    client, _, _ = api
    school = create(client)
    headers = {'x-test-user': 'second'}
    directory = client.get('/teacher/institutions/directory?q=Synthetic', headers=headers)
    assert directory.status_code == 200, directory.text
    assert len(directory.json()) == 1
    choice = directory.json()[0]
    assert choice['id'] == school['id'] and choice['can_join'] and not choice['joined']
    assert not {'created_by', 'username', 'institution_code', 'hashed_password', 'credentials_configured'} & choice.keys()
    assert client.get('/teacher/institutions', headers=headers).json() == []
    path = f"/teacher/institutions/{school['id']}/join"
    first = client.post(path, headers=headers)
    assert first.status_code == 200, first.text
    assert first.json()['member_count'] == 2
    assert client.post(path, headers=headers).json() == first.json()
    assert client.post(path, headers={'x-test-user': 'third'}).status_code == 409
    assert client.get('/teacher/institutions', headers={'x-test-user': 'third'}).json() == []
    assert [row['id'] for row in client.get('/teacher/institutions', headers=headers).json()] == [school['id']]
    assert client.get('/teacher/institutions/directory?q=absent', headers=headers).json() == []


def test_simultaneous_joins_do_not_overfill_or_leave_partial_membership(api):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    client, _, _ = api
    school = create(client)
    barrier = Barrier(2)

    def join(username):
        # Separate worker event loops and sessions exercise real overlapping transactions.
        with TestClient(client.app) as worker:
            barrier.wait(timeout=10)
            return username, worker.post(f"/teacher/institutions/{school['id']}/join", headers={'x-test-user': username})

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(join, ['second', 'third']))
    assert sorted(response.status_code for _, response in results) == [200, 409]
    assert client.get(f"/teacher/institutions/{school['id']}").json()['member_count'] == 2
    loser = next(name for name, response in results if response.status_code == 409)
    assert client.get('/teacher/institutions', headers={'x-test-user': loser}).json() == []


@pytest.mark.parametrize('role,status', [('teacher', 200), ('researcher', 403), ('student', 403), ('admin', 403), ('anonymous', 401)])
def test_teacher_role_is_required_for_every_teacher_endpoint(api, role, status):
    client, _, _ = api
    school = create(client)
    headers = {'x-test-role': role}
    assert client.get('/teacher/institutions', headers=headers).status_code == status
    assert client.get('/teacher/institutions/directory', headers=headers).status_code == status
    assert client.get(f"/teacher/institutions/{school['id']}", headers=headers).status_code == status
    assert client.post(f"/teacher/institutions/{school['id']}/join", headers=headers).status_code == status
    assert client.post('/teacher/institutions', headers=headers, json={'name': 'Role test'}).status_code == (201 if role == 'teacher' else status)
    assert client.put(f"/teacher/institutions/{school['id']}", headers=headers,
                      json={'name': 'Edited school', 'revision': 1}).status_code == status


def test_revision_conflict_retains_saved_metadata_and_rejects_credential_writes(api):
    client, _, _ = api
    school = create(client)
    path = f"/teacher/institutions/{school['id']}"
    payload = {'name': 'Renamed school', 'kind': 'university', 'revision': 1,
               'website_url': 'https://school.example.test', 'orientation_page_url': None}
    assert client.put(path, json=payload, headers={'x-test-user': 'outsider'}).status_code == 403
    saved = client.put(path, json=payload)
    assert saved.status_code == 200 and saved.json()['revision'] == 2
    assert client.put(path, json={**payload, 'name': 'Stale overwrite'}).status_code == 409
    assert client.get(path).json()['name'] == 'Renamed school'
    assert client.put(path, json={**payload, 'revision': 2, 'institution_code': 'secret'}).status_code == 422
    for invalid in ({'name': '   '}, {'name': 'x', 'website_url': 'javascript:alert(1)'}, {'name': 'x', 'kind': 'unknown'}, {'name': 'x', 'created_by': 'spoof'}):
        assert client.post('/teacher/institutions', json=invalid).status_code == 422


def test_creation_rolls_back_institute_when_membership_insert_fails(api):
    from sqlalchemy import event
    from sqlalchemy.exc import IntegrityError
    client, _, _ = api
    def fail(*_):
        raise IntegrityError('synthetic failure', {}, Exception('fixture'))
    event.listen(models.InstitutionTeacher, 'before_insert', fail)
    try:
        assert client.post('/teacher/institutions', json={'name': 'Rolled back school'}).status_code == 409
    finally:
        event.remove(models.InstitutionTeacher, 'before_insert', fail)
    assert client.get('/teacher/institutions').json() == []
    assert client.get('/teacher/institutions/directory').json() == []


def test_simultaneous_duplicate_names_create_distinct_slugs_and_memberships(api):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    client, _, _ = api
    barrier = Barrier(2)
    def create_same(username):
        with TestClient(client.app) as worker:
            barrier.wait(timeout=10)
            return worker.post('/teacher/institutions', json={'name': 'Duplicate school'}, headers={'x-test-user': username})
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(create_same, ['one', 'two']))
    assert [r.status_code for r in responses] == [201, 201]
    assert len({r.json()['slug'] for r in responses}) == 2
    for username in ['one', 'two']:
        own = client.get('/teacher/institutions', headers={'x-test-user': username}).json()
        assert len(own) == 1 and own[0]['member_count'] == 1


def test_inactive_missing_revoked_and_grandfathered_memberships(api):
    client, engine, schema = api
    school = create(client)
    path = f"/teacher/institutions/{school['id']}"
    admin = {'x-test-role': 'admin'}
    grant = f"/admin/institutions/{school['id']}/teachers"
    # Existing larger memberships are fixture data, not a new capacity bypass.
    with Session(engine) as db:
        db.execute(text(f'SET search_path TO "{schema}"'))
        db.add_all([models.InstitutionTeacher(institution_id=school['id'], username=username,
                    created_by='legacy-admin', updated_by='legacy-admin', is_active=True) for username in ['second', 'third']])
        db.commit()
    assert client.get('/admin/institutions', headers=admin).json()[0]['needs_admin_review'] is True
    assert client.post(grant, json={'username': 'fourth'}, headers=admin).status_code == 409
    own = client.get(path).json()
    assert own['member_count'] == 3 and own['needs_admin_review']
    assert client.post(path + '/join', headers={'x-test-user': 'second'}).status_code == 200
    assert client.post(path + '/join', headers={'x-test-user': 'fourth'}).status_code == 409
    second_id = next(row['id'] for row in client.get(grant, headers=admin).json() if row['username'] == 'second')
    assert client.delete(f'{grant}/{second_id}', headers=admin).status_code == 200
    assert client.post(path + '/join', headers={'x-test-user': 'second'}).status_code == 409
    third_id = next(row['id'] for row in client.get(grant, headers=admin).json() if row['username'] == 'third')
    client.delete(f'{grant}/{third_id}', headers=admin)
    assert client.post(path + '/join', headers={'x-test-user': 'second'}).status_code == 200
    assert client.delete(f"/admin/institutions/{school['id']}", headers=admin).status_code == 200
    assert client.post(path + '/join').status_code == 409
    assert client.get('/teacher/institutions/directory').json() == []
    assert client.get(path).status_code == 403
    assert client.put(path, json={'name': 'No', 'revision': own['revision']}).status_code == 403
    assert client.post('/teacher/institutions/2147483647/join').status_code == 404


def test_class_attachment_requires_explicit_membership_and_independent_class_access(api):
    client, _, _ = api
    school = create(client)
    unlinked = client.post('/admin/groups', json={'name': 'Legacy class'}).json()
    second = {'x-test-user': 'second'}
    assert client.post('/admin/groups', headers=second, json={'name': 'Unauthorized', 'institution_id': school['id']}).status_code == 403
    assert client.put(f"/admin/groups/{unlinked['id']}", json={'institution_id': 2147483647}).status_code in (403, 404)
    assert client.get('/admin/groups').json()[0]['institution_id'] is None
    assert client.post(f"/teacher/institutions/{school['id']}/join", headers=second).status_code == 200
    linked = client.post('/admin/groups', json={'name': 'Owned class', 'institution_id': school['id']})
    assert linked.status_code == 200, linked.text
    assert client.get('/admin/groups', headers=second).json() == []
    assert client.put(f"/admin/groups/{linked.json()['id']}", headers=second, json={'name': 'No class access'}).status_code == 404
    assert client.put(f"/admin/groups/{unlinked['id']}", json={'institution_id': school['id']}).status_code == 200
    assert client.put(f"/admin/groups/{unlinked['id']}", json={'institution_id': None}).status_code == 200
    assert client.get('/admin/groups').json()[1]['institution_id'] is None


def test_co_teacher_edits_other_fields_without_institute_management(api):
    client, _, _ = api
    school = create(client)
    group = client.post('/admin/groups', json={'name': 'Shared class', 'institution_id': school['id']}).json()
    assert client.post(f"/admin/groups/{group['id']}/shares", json={'shared_with_username': 'co-teacher'}).status_code == 200
    headers = {'x-test-user': 'co-teacher'}
    assert client.get(f"/teacher/institutions/{school['id']}", headers=headers).status_code == 403
    path = f"/admin/groups/{group['id']}"
    assert client.put(path, headers=headers, json={'description': 'Class-only rights', 'institution_id': school['id']}).status_code == 200
    assert client.put(path, headers=headers, json={'description': 'Must roll back', 'institution_id': None}).status_code == 403
    persisted = client.get('/admin/groups', headers=headers).json()[0]
    assert persisted['description'] == 'Class-only rights' and persisted['institution_id'] == school['id']


def test_legacy_migration_preserves_classes_and_memberships_and_is_idempotent(api):
    from importlib import import_module
    from sqlalchemy.exc import IntegrityError
    client, engine, schema = api
    school = create(client)
    group = client.post('/admin/groups', json={'name': 'Legacy synthetic class'}).json()
    with engine.begin() as connection:
        connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
        for name in connection.execute(text("SELECT conname FROM pg_constraint WHERE conrelid = 'student_groups'::regclass AND contype = 'f' AND confrelid = 'institutions'::regclass")).scalars():
            connection.execute(text(f'ALTER TABLE student_groups DROP CONSTRAINT "{name}"'))
        connection.execute(text('ALTER TABLE institutions DROP COLUMN created_by'))
        connection.execute(text('ALTER TABLE institutions DROP COLUMN revision'))
        connection.execute(text('UPDATE student_groups SET institution_id = 2147483647'))
    legacy_engine = create_engine(str(engine.url), connect_args={'options': f'-csearch_path={schema}'})
    try:
        migrate = import_module('backend.migrations.20261009_teacher_institutes').migrate
        migrate(legacy_engine)
        migrate(legacy_engine)
        migrated = client.get(f"/teacher/institutions/{school['id']}").json()
        assert migrated['created_by'] is None and migrated['revision'] == 1 and migrated['member_count'] == 1
        restored = client.get('/admin/groups').json()[0]
        assert restored['id'] == group['id'] and restored['name'] == 'Legacy synthetic class'
        assert restored['institution_id'] is None
        with pytest.raises(IntegrityError), legacy_engine.begin() as connection:
            connection.execute(text('UPDATE student_groups SET institution_id = 2147483647'))
    finally:
        legacy_engine.dispose()


def test_inactive_institute_cannot_be_attached_and_old_classes_still_work(api):
    client, _, _ = api
    school = create(client)
    group = client.post('/admin/groups', json={'name': 'Existing class', 'institution_id': school['id']}).json()
    client.delete(f"/admin/institutions/{school['id']}", headers={'x-test-role': 'admin'})
    assert client.post('/admin/groups', json={'name': 'No', 'institution_id': school['id']}).status_code == 403
    assert client.put(f"/admin/groups/{group['id']}", json={'description': 'Still working', 'institution_id': school['id']}).status_code == 200
    assert client.get('/admin/groups').json()[0]['description'] == 'Still working'



def test_simultaneous_member_edits_accept_only_one_revision(api):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    client, _, _ = api
    school = create(client)
    path = f"/teacher/institutions/{school['id']}"
    client.post(path + '/join', headers={'x-test-user': 'second'})
    barrier = Barrier(2)
    def edit(username):
        with TestClient(client.app) as worker:
            barrier.wait(timeout=10)
            return username, worker.put(path, headers={'x-test-user': username},
                                        json={'name': 'Edited by ' + username, 'revision': 1})
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(edit, ['first', 'second']))
    assert sorted(response.status_code for _, response in results) == [200, 409]
    winner = next(name for name, response in results if response.status_code == 200)
    saved = client.get(path).json()
    assert saved['revision'] == 2 and saved['name'] == 'Edited by ' + winner
