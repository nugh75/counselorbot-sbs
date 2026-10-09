"""Institute-owned credentials, canonical plan references and local verification grants.

Runs on disposable synthetic PostgreSQL schemas only. Fixture secrets are invented.
"""
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from backend import auth, database, models, scoring_service
from backend.routes import administration_plans, groups, institutions, survey

DB_URL = 'postgresql://c4_test@127.0.0.1:18649/counselorbot_test'
SECRET = ' Synthetic-Pass 149 '  # Leading/trailing spaces must survive unchanged.
ROLES = {'teacher': ['docenti'], 'admin': ['admins'], 'researcher': ['researchers'],
         'student': ['studenti'], 'anonymous': []}


@pytest.fixture
def api(monkeypatch):
    # Never silently fall back to an operational database.
    url = os.environ['DATABASE_URL']
    assert url == DB_URL
    engine = create_engine(url)
    schema = 'tf2_' + uuid.uuid4().hex
    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
        models.Base.metadata.create_all(connection)
    app = FastAPI()
    for router in (institutions.router, administration_plans.router, groups.router, survey.router):
        app.include_router(router)

    def session():
        with Session(engine) as db:
            db.execute(text(f'SET search_path TO "{schema}"'))
            yield db

    def identity(request: Request):
        role = request.headers.get('x-test-role', 'teacher')
        return dict(username=request.headers.get('x-test-user', 'first'), authenticated=role != 'anonymous',
                    groups=ROLES[role], is_admin=role == 'admin', is_researcher=role == 'researcher')

    app.dependency_overrides[database.get_db] = session
    app.dependency_overrides[auth.get_identity] = identity
    # The scorer is not under test: a fixed synthetic profile keeps writers isolated.
    monkeypatch.setattr(scoring_service, 'compute_profile',
                        lambda db, code, locale, answers: {'instrument': code, 'locale': locale, 'results': []})
    monkeypatch.setattr(scoring_service, 'mapped_stanine_scores', lambda profile: {'C1': 5})

    def sql(statement, **params):
        with engine.begin() as connection:
            connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            return connection.execute(text(statement), params).all() if statement.lstrip().upper().startswith('SELECT') \
                else connection.execute(text(statement), params)

    with TestClient(app) as client:
        yield client, sql
    with engine.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    engine.dispose()


def school(client, name='Synthetic school', user='first'):
    response = client.post('/teacher/institutions', json={'name': name}, headers={'x-test-user': user})
    assert response.status_code == 201, response.text
    return response.json()


def configure(client, row, code='SYN-149', password=SECRET, user='first'):
    response = client.put(f"/teacher/institutions/{row['id']}/credentials", headers={'x-test-user': user},
                          json={'institution_code': code, 'password': password, 'revision': row['revision']})
    assert response.status_code == 200, response.text
    return response.json()


def plan(client, headers=None, **values):
    response = client.post('/admin/administration-plans', headers=headers or {},
                           json={'title': 'Synthetic plan', 'instrument_code': 'QSA', **values})
    assert response.status_code == 200, response.text
    return response.json()


def verify(client, plan_id, code='SYN-149', password=SECRET, user='student-a'):
    return client.post(f'/user/administrations/{plan_id}/verify-institution',
                       headers={'x-test-role': 'student', 'x-test-user': user},
                       json={'institution_code': code, 'password': password})


def score(client, plan_code, grant=None, user='student-a', role='student'):
    body = {'session_id': str(uuid.uuid4()), 'locale': 'en', 'answers': {'1': 3}, 'save': True,
            'save_validation': True, 'response_metadata': {'study_code': plan_code, 'consent': True}}
    if grant is not None:
        body['institution_grant'] = grant
    return client.post('/instruments/QSA/score', json=body, headers={'x-test-role': role, 'x-test-user': user})


def counts(sql):
    return (sql('SELECT count(*) FROM questionnaire_results')[0][0],
            sql('SELECT count(*) FROM validation_responses')[0][0])


# --- Institute credential writer ---------------------------------------------------

def test_teacher_saves_write_only_credentials_on_the_institute(api):
    client, sql = api
    row = school(client)
    saved = configure(client, row)
    assert saved['credentials_configured'] is True
    assert saved['institution_code'] == 'SYN-149'
    assert saved['revision'] == row['revision'] + 1
    assert not {'password', 'hashed_password'} & saved.keys()
    assert SECRET not in client.get(f"/teacher/institutions/{row['id']}").text
    stored = sql('SELECT hashed_password FROM institutions WHERE id = :id', id=row['id'])[0][0]
    assert stored != SECRET and models.verify_password(SECRET, stored)
    # The password is never trimmed: the stripped variant is a different secret.
    assert not models.verify_password(SECRET.strip(), stored)


def test_credential_replacement_needs_revision_membership_and_teacher_role(api):
    client, _ = api
    row = school(client)
    path = f"/teacher/institutions/{row['id']}/credentials"
    body = {'institution_code': 'SYN-149', 'password': SECRET, 'revision': row['revision']}
    assert client.put(path, json=body, headers={'x-test-user': 'outsider'}).status_code == 403
    for role, status in (('researcher', 403), ('student', 403), ('admin', 403), ('anonymous', 401)):
        assert client.put(path, json=body, headers={'x-test-role': role}).status_code == status
    assert client.get(f"/teacher/institutions/{row['id']}").json()['credentials_configured'] is False
    configure(client, row)
    stale = client.put(path, json={**body, 'password': 'Other-149'})
    assert stale.status_code == 409 and stale.json()['detail'] == 'institution_revision_conflict'


def test_invalid_credentials_fail_without_echoing_the_secret(api, caplog):
    client, _ = api
    row = school(client)
    path = f"/teacher/institutions/{row['id']}/credentials"
    caplog.set_level(logging.DEBUG)
    for body in ({'institution_code': 'SYN-149', 'password': '', 'revision': 1},
                 {'institution_code': 'SYN-149', 'password': 'x' * 73, 'revision': 1},
                 {'institution_code': 'bad code!', 'password': SECRET, 'revision': 1},
                 {'institution_code': 'SYN-149', 'password': 149, 'revision': 1},
                 {'institution_code': 'SYN-149', 'password': SECRET, 'revision': 1, 'hashed_password': SECRET}):
        response = client.put(path, json=body)
        assert response.status_code == 422, response.text
        assert SECRET not in response.text and 'x' * 73 not in response.text
    assert SECRET not in caplog.text
    assert client.get(f"/teacher/institutions/{row['id']}").json()['credentials_configured'] is False


def test_institution_code_is_unique_regardless_of_case_or_whitespace(api):
    client, _ = api
    configure(client, school(client))
    other = school(client, 'Second school', user='second')
    response = client.put(f"/teacher/institutions/{other['id']}/credentials", headers={'x-test-user': 'second'},
                          json={'institution_code': ' syn-149 ', 'password': 'Other-149', 'revision': other['revision']})
    assert response.status_code == 409 and response.json()['detail'] == 'institution_code_conflict'


def test_admin_institute_responses_never_include_a_hash(api):
    client, _ = api
    row = configure(client, school(client))
    admin = {'x-test-role': 'admin'}
    listing = client.get('/admin/institutions', headers=admin)
    assert listing.status_code == 200
    assert all('hashed_password' not in item for item in listing.json())
    assert listing.json()[0]['credentials_configured'] is True
    reset = client.put(f"/admin/institutions/{row['id']}/password", headers=admin, json={'plain_password': 'Reset-149'})
    assert reset.status_code == 200 and 'hashed_password' not in reset.json() and 'Reset-149' not in reset.text
    raw = client.put(f"/admin/institutions/{row['id']}/password", headers=admin,
                     json={'hashed_password': models.get_password_hash('Injected-149')})
    assert raw.status_code == 422


# --- Canonical administration references ------------------------------------------

def test_plan_round_trips_canonical_institute_identity(api):
    client, _ = api
    row = configure(client, school(client))
    created = plan(client, institution_id=row['id'])
    assert created['institution_id'] == row['id']
    assert created['institution_name'] == 'Synthetic school'
    assert created['institution_code'] == 'SYN-149'
    assert created['institution_credentials_configured'] is True
    assert created['institution_link_state'] == 'linked'
    assert created['revision'] == 1
    assert not {'institution_password', 'hashed_password'} & created.keys()
    listed = next(item for item in client.get('/admin/administration-plans').json() if item['id'] == created['id'])
    assert listed['institution_id'] == row['id']
    edited = client.put(f"/admin/administration-plans/{created['id']}",
                        json={'title': 'Renamed plan', 'revision': created['revision']})
    assert edited.status_code == 200, edited.text
    assert edited.json()['institution_id'] == row['id'] and edited.json()['revision'] == 2
    options = client.get('/admin/administration-plans/institution-options')
    assert options.status_code == 200
    assert options.json() == [{'id': row['id'], 'name': 'Synthetic school', 'institution_code': 'SYN-149',
                               'credentials_configured': True}]


def test_legacy_plan_credential_writes_are_rejected_without_echo(api):
    client, sql = api
    for extra in ({'institution_code': 'SYN-149'}, {'institution_password': SECRET}):
        response = client.post('/admin/administration-plans', json={'title': 'Legacy', **extra})
        assert response.status_code == 422 and SECRET not in response.text
        assert response.json()['detail'] == 'administration_credentials_moved_to_institution'
    created = plan(client)
    response = client.put(f"/admin/administration-plans/{created['id']}",
                          json={'revision': created['revision'], 'institution_password': SECRET})
    assert response.status_code == 422 and SECRET not in response.text
    assert sql('SELECT count(*) FROM administration_plans WHERE institution_password IS NOT NULL')[0][0] == 0


def test_plan_edits_require_the_current_revision(api):
    client, _ = api
    created = plan(client)
    path = f"/admin/administration-plans/{created['id']}"
    assert client.put(path, json={'title': 'No revision'}).status_code == 422
    assert client.put(path, json={'title': 'First', 'revision': 1}).status_code == 200
    stale = client.put(path, json={'title': 'Stale', 'revision': 1})
    assert stale.status_code == 409 and stale.json()['detail'] == 'administration_revision_conflict'
    assert client.get('/admin/administration-plans').json()[0]['title'] == 'First'


def test_institute_link_requires_membership_activity_and_class_agreement(api):
    client, sql = api
    own = configure(client, school(client))
    foreign = configure(client, school(client, 'Foreign school', user='second'), code='SYN-OTHER', user='second')
    denied = client.post('/admin/administration-plans', json={'title': 'Foreign', 'institution_id': foreign['id']})
    assert denied.status_code == 403 and denied.json()['detail'] == 'institution_link_forbidden'
    assert client.post('/admin/administration-plans', json={'title': 'Missing', 'institution_id': 999999}).status_code == 422
    # Administrators may link any active institute; researchers without membership may not.
    assert plan(client, headers={'x-test-role': 'admin'}, institution_id=foreign['id'])['institution_id'] == foreign['id']
    assert client.post('/admin/administration-plans', headers={'x-test-role': 'researcher', 'x-test-user': 'researcher-1'},
                       json={'title': 'Research', 'institution_id': own['id']}).status_code == 403
    sql("INSERT INTO student_groups (code, name, owner_username, institution_id, is_active, context_visible_to_students) "
        "VALUES ('GR-149A', 'Class 3B', 'first', :inst, true, false)", inst=own['id'])
    group_id = sql("SELECT id FROM student_groups WHERE code = 'GR-149A'")[0][0]
    mismatch = client.post('/admin/administration-plans', headers={'x-test-role': 'admin'},
                           json={'title': 'Mismatch', 'group_id': group_id, 'institution_id': foreign['id']})
    assert mismatch.status_code == 422 and mismatch.json()['detail'] == 'administration_institution_mismatch'
    unlinked = client.post('/admin/administration-plans', json={'title': 'Implicit', 'group_id': group_id})
    assert unlinked.status_code == 422 and unlinked.json()['detail'] == 'administration_institution_mismatch'
    assert plan(client, group_id=group_id, institution_id=own['id'])['institution_id'] == own['id']
    sql('UPDATE institutions SET is_active = false WHERE id = :id', id=foreign['id'])
    inactive = client.post('/admin/administration-plans', headers={'x-test-role': 'admin'},
                           json={'title': 'Inactive', 'institution_id': foreign['id']})
    assert inactive.status_code == 409 and inactive.json()['detail'] == 'institution_inactive'


def test_institute_membership_never_grants_research_plan_visibility(api):
    client, _ = api
    row = configure(client, school(client))
    client.post(f"/teacher/institutions/{row['id']}/join", headers={'x-test-user': 'second'})
    created = plan(client, institution_id=row['id'])
    assert client.get('/admin/administration-plans', headers={'x-test-user': 'second'}).json() == []
    assert client.get(f"/admin/administration-plans/{created['id']}/responses",
                      headers={'x-test-user': 'second'}).status_code == 404
    assert client.get('/admin/administration-plans', headers={'x-test-role': 'admin'}).json()[0]['id'] == created['id']


def test_reconciliation_state_is_visible_and_resolved_through_the_editor(api):
    client, sql = api
    row = configure(client, school(client))
    created = plan(client)
    sql("UPDATE administration_plans SET institution_link_state = 'needs_reconciliation', "
        "reconciliation_reason = 'institution_not_found', institution_code = 'LEGACY-149', "
        "institution_password = 'Legacy-pass' WHERE id = :id", id=created['id'])
    listed = client.get('/admin/administration-plans').json()[0]
    assert listed['institution_link_state'] == 'needs_reconciliation'
    assert listed['reconciliation_reason'] == 'institution_not_found'
    assert listed['legacy_institution_code'] == 'LEGACY-149'
    assert 'Legacy-pass' not in client.get('/admin/administration-plans').text
    # An unrelated edit keeps the reconciliation state visible.
    kept = client.put(f"/admin/administration-plans/{created['id']}", json={'notes': 'n', 'revision': 1}).json()
    assert kept['institution_link_state'] == 'needs_reconciliation'
    resolved = client.put(f"/admin/administration-plans/{created['id']}",
                          json={'institution_id': row['id'], 'revision': kept['revision']})
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()['institution_link_state'] == 'linked' and resolved.json()['reconciliation_reason'] is None
    assert sql('SELECT institution_code, institution_password FROM administration_plans WHERE id = :id',
               id=created['id'])[0] == (None, None)
    other = plan(client)
    sql("UPDATE administration_plans SET institution_link_state = 'needs_reconciliation', "
        "reconciliation_reason = 'credential_conflict' WHERE id = :id", id=other['id'])
    explicit = client.put(f"/admin/administration-plans/{other['id']}", json={'institution_id': None, 'revision': 1})
    assert explicit.json()['institution_link_state'] == 'unlinked'


# --- Local verification grant and result writers -----------------------------------

def test_verification_issues_a_scoped_grant_and_rejects_wrong_credentials(api):
    client, sql = api
    row = configure(client, school(client))
    created = plan(client, institution_id=row['id'])
    for code, password in (('SYN-149', 'wrong'), ('SYN-OTHER', SECRET), ('SYN-149', SECRET.strip()), ('', '')):
        failed = verify(client, created['id'], code, password)
        assert failed.status_code == 403 and failed.json()['detail'] == 'institution_verification_failed'
    assert client.post(f"/user/administrations/{created['id']}/verify-institution", headers={'x-test-role': 'anonymous'},
                       json={'institution_code': 'SYN-149', 'password': SECRET}).status_code == 401
    assert verify(client, 999999).status_code == 404
    ok = verify(client, created['id'], ' syn-149 ')
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert len(body['grant']) >= 32 and body['institution']['institution_code'] == 'SYN-149'
    assert SECRET not in ok.text
    # Only a digest of the grant is stored server-side.
    assert body['grant'] not in str(sql('SELECT * FROM institution_verification_grants'))


def test_failed_verifications_are_throttled(api):
    client, _ = api
    row = configure(client, school(client))
    created = plan(client, institution_id=row['id'])
    statuses = [verify(client, created['id'], password='wrong').status_code for _ in range(11)]
    assert statuses[:10] == [403] * 10 and statuses[10] == 429
    assert verify(client, created['id']).status_code == 429
    assert verify(client, created['id'], user='student-b').status_code == 200


def test_institute_backed_score_needs_a_valid_grant_before_any_write(api):
    client, sql = api
    row = configure(client, school(client))
    created = plan(client, institution_id=row['id'])
    missing = score(client, created['code'])
    assert missing.status_code == 403
    assert missing.json()['detail']['code'] == 'institution_verification_required'
    assert missing.json()['detail']['administration_plan_id'] == created['id']
    assert score(client, created['code'], grant='forged-grant').status_code == 403
    assert score(client, created['code'], role='anonymous').status_code == 401
    assert counts(sql) == (0, 0)
    grant = verify(client, created['id']).json()['grant']
    saved = score(client, created['code'], grant=grant)
    assert saved.status_code == 200, saved.text
    assert counts(sql) == (1, 1)
    metadata = sql('SELECT response_metadata FROM validation_responses')[0][0]
    assert grant not in str(metadata) and SECRET not in str(metadata)
    assert metadata['administration_plan_institution_code'] == 'SYN-149'
    assert sql('SELECT administration_plan_id FROM questionnaire_results')[0][0] == created['id']


def test_grant_is_bound_to_user_plan_and_credential_revision(api):
    client, sql = api
    row = configure(client, school(client))
    first = plan(client, institution_id=row['id'])
    second = plan(client, institution_id=row['id'])
    grant = verify(client, first['id']).json()['grant']
    assert score(client, second['code'], grant=grant).json()['detail']['code'] == 'institution_grant_mismatch'
    assert score(client, first['code'], grant=grant, user='student-b').json()['detail']['code'] == 'institution_grant_mismatch'
    sql('UPDATE institution_verification_grants SET expires_at = :past', past=datetime.now(timezone.utc) - timedelta(seconds=1))
    assert score(client, first['code'], grant=grant).json()['detail']['code'] == 'institution_grant_expired'
    fresh = verify(client, first['id']).json()['grant']
    current = client.get(f"/teacher/institutions/{row['id']}").json()
    configure(client, current, password='Rotated-149')
    assert score(client, first['code'], grant=fresh).json()['detail']['code'] == 'institution_grant_mismatch'
    assert counts(sql) == (0, 0)


def test_manual_scores_share_the_institution_context_contract(api):
    client, sql = api
    row = configure(client, school(client))
    created = plan(client, institution_id=row['id'])
    headers = {'x-test-role': 'student', 'x-test-user': 'student-a'}
    body = {'session_id': 'manual-149', 'questionnaire_type': 'QSA', 'scores': {'C1': 5},
            'administration_plan_id': created['id']}
    assert client.post('/questionnaire-result', json=body, headers=headers).status_code == 403
    assert client.post('/questionnaire-result', json={**body, 'administration_plan_id': 999999},
                       headers=headers).status_code == 404
    assert counts(sql) == (0, 0)
    grant = verify(client, created['id']).json()['grant']
    saved = client.post('/questionnaire-result', json={**body, 'institution_grant': grant}, headers=headers)
    assert saved.status_code == 200, saved.text
    assert 'institution_grant' not in saved.json() and saved.json()['administration_plan_id'] == created['id']
    # Standalone manual entry keeps its existing access policy.
    assert client.post('/questionnaire-result', json={'session_id': 'solo', 'questionnaire_type': 'QSA', 'scores': {}},
                       headers=headers).status_code == 200


def test_unlinked_and_unreconciled_plans_keep_explicit_modes(api):
    client, sql = api
    legacy = plan(client)
    assert legacy['institution_link_state'] == 'unlinked'
    assert score(client, legacy['code']).status_code == 200
    assert verify(client, legacy['id']).json()['detail'] == 'administration_not_institution_backed'
    sql("UPDATE administration_plans SET institution_link_state = 'needs_reconciliation', "
        "reconciliation_reason = 'institution_not_found' WHERE id = :id", id=legacy['id'])
    blocked = score(client, legacy['code'])
    assert blocked.status_code == 409 and blocked.json()['detail']['code'] == 'administration_needs_reconciliation'
    assert counts(sql) == (1, 1)


def test_missing_institute_credentials_block_writes_explicitly(api):
    client, sql = api
    row = school(client)
    created = plan(client, institution_id=row['id'])
    assert created['institution_credentials_configured'] is False
    response = score(client, created['code'])
    assert response.status_code == 409 and response.json()['detail']['code'] == 'institution_credentials_missing'
    assert verify(client, created['id']).json()['detail'] == 'institution_credentials_missing'
    assert counts(sql) == (0, 0)


def test_mismatched_instrument_is_rejected_for_institute_backed_plans(api):
    client, sql = api
    row = configure(client, school(client))
    created = plan(client, institution_id=row['id'], instrument_code='ZTPI')
    grant = verify(client, created['id']).json()['grant']
    response = score(client, created['code'], grant=grant)
    assert response.status_code == 422 and response.json()['detail']['code'] == 'administration_instrument_mismatch'
    assert counts(sql) == (0, 0)


def test_plaintext_institution_password_in_metadata_is_never_persisted(api):
    client, sql = api
    created = plan(client)
    body = {'session_id': 'meta-149', 'locale': 'en', 'answers': {'1': 3}, 'save': True, 'save_validation': True,
            'response_metadata': {'study_code': created['code'], 'institution_password': SECRET,
                                  'institution_grant': 'leaked-grant'}}
    assert client.post('/instruments/QSA/score', json=body,
                       headers={'x-test-role': 'student', 'x-test-user': 'student-a'}).status_code == 200
    stored = str(sql('SELECT response_metadata FROM validation_responses')[0][0])
    assert SECRET not in stored and 'leaked-grant' not in stored


def test_simultaneous_plan_edits_with_one_revision_have_a_single_winner(api):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    client, _ = api
    created = plan(client)
    barrier = Barrier(2)

    def edit(title):
        # Separate worker event loops and sessions exercise real overlapping transactions.
        with TestClient(client.app) as worker:
            barrier.wait(timeout=10)
            return worker.put(f"/admin/administration-plans/{created['id']}", json={'title': title, 'revision': 1})

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(edit, ['Left', 'Right']))
    assert sorted(response.status_code for response in results) == [200, 409]
    winner = next(response.json() for response in results if response.status_code == 200)
    assert client.get('/admin/administration-plans').json()[0]['title'] == winner['title']
    assert winner['revision'] == 2


def test_institute_verifier_hashes_and_verifies_with_the_installed_bcrypt():
    hashed = models.get_password_hash(SECRET)
    assert hashed.startswith('$2') and SECRET not in hashed
    assert models.verify_password(SECRET, hashed)
    assert not models.verify_password(SECRET.strip(), hashed)
    assert not models.verify_password(SECRET, 'not-a-hash') and not models.verify_password(SECRET, None)
    with pytest.raises(ValueError):
        models.get_password_hash('é' * 37)  # 74 UTF-8 bytes: bcrypt would silently truncate.
