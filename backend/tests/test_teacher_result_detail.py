"""Exact compilation, reflection and same student PDF across class/plan access."""
from io import BytesIO

import pytest
from pypdf import PdfReader

from backend import models
from backend.routes import survey
from backend.tests.test_teacher_class_compilations import class_results_api


@pytest.fixture
def details(class_results_api, monkeypatch):
    client, db, identity, group_ids = class_results_api
    monkeypatch.setattr(survey, '_generate_summary', lambda db, **kw: f"SINTESI {kw['result'].session_id}")
    plan = models.AdministrationPlan(code='AP-DETAIL', title='Detail', instrument_code='QSA', created_by_username='owner')
    other = models.AdministrationPlan(code='AP-OTHER', title='Other', instrument_code='QSA', created_by_username='colleague')
    db.add_all([plan, other]); db.flush()
    first = db.query(models.QuestionnaireResult).filter_by(session_id='owned-qsa').one()
    first.administration_plan_id = plan.id
    second = models.QuestionnaireResult(username='student.owned', session_id='owned-qsa-second', questionnaire_type='QSA',
                                         scores={'C1': 3}, administration_plan_id=other.id)
    db.add_all([second,
        models.ResultReading(username='student.owned', session_id='owned-qsa', questionnaire_type='QSA',
                             strengths=['C1 - Elaborazione'], growth_areas=['Organizzazione'], note='PAROLE DELLO STUDENTE'),
        models.ResultReading(username='student.owned', session_id='owned-qsa-second', questionnaire_type='QSA',
                             strengths=[], growth_areas=[], note='RIFLESSIONE SECONDA COMPILAZIONE'),
        models.ResultReading(username='outsider', session_id='owned-qsa', questionnaire_type='QSA',
                             strengths=[], growth_areas=[], note='ALTRA PERSONA'),
        models.Log(username='student.owned', session_id='owned-qsa-second', action='chat_message',
                   details={'user_input': 'SECONDA CONVERSAZIONE', 'bot_response': 'SECONDA RISPOSTA'}),
    ])
    db.commit()
    return client, db, identity, group_ids, first, second, plan, other


def test_exact_result_and_student_authored_reading(details):
    client, db, _, (owned, *_), first, second, *_ = details
    base = f'/admin/groups/{owned}/students/student.owned/results'
    one, two = [client.get(f'{base}/{row.id}?lang=it').json() for row in (first, second)]
    assert one['id'] == first.id and one['scores'] == {'C1': 7}
    assert one['summary'] == 'SINTESI owned-qsa' and one['summary_status'] == 'ready'
    assert one['reading']['strengths'] == ['C1 - Elaborazione']
    assert one['reading']['growth_areas'] == ['Organizzazione']
    assert one['reading']['note'] == 'PAROLE DELLO STUDENTE'
    assert one['reading']['updated_at'] and one['submitted_at']
    assert 'goal_ids' not in one['reading']  # no access to unrelated personal goals
    assert two['reading']['note'] == 'RIFLESSIONE SECONDA COMPILAZIONE'
    assert two['scores'] == {'C1': 3}
    assert 'SECONDA CONVERSAZIONE' not in str(one)
    assert 'ALTRA PERSONA' not in str(one) and 'PAROLE DELLO STUDENTE' not in str(two)
    assert db.query(models.ResultReading).filter_by(username='student.owned').count() == 2


def test_qualitative_missing_and_blank_reading_and_summary_failure(details, monkeypatch):
    client, db, _, (owned, *_), first, *_ = details
    row = db.query(models.QuestionnaireResult).filter_by(session_id='owned-qualitative').one()
    base = f'/admin/groups/{owned}/students/student.owned/results'
    missing = client.get(f'{base}/{row.id}').json()
    assert missing['scores'] is None and missing['reading'] is None
    db.add(models.ResultReading(username=row.username, session_id=row.session_id, questionnaire_type=row.questionnaire_type,
                                strengths=[], growth_areas=[], note=''))
    db.commit()
    assert client.get(f'{base}/{row.id}').json()['reading']['note'] == ''
    monkeypatch.setattr(survey, 'canonical_summary', lambda *args, **kw: (None, 'unavailable'))
    response = client.get(f'{base}/{first.id}')
    assert response.status_code == 200
    assert response.json()['summary'] is None and response.json()['reading']['note'] == 'PAROLE DELLO STUDENTE'


@pytest.mark.parametrize('role', ['owner', 'colleague', 'unrelated', 'no-classes', 'admin', 'student', 'researcher'])
def test_detail_and_pdf_keep_existing_class_permissions(details, role):
    client, db, identity, (owned, shared, private, _), first, *_ = details
    identity.update(username=role, is_admin=role == 'admin', is_researcher=role == 'researcher',
                    groups=['studenti' if role == 'student' else 'ricercatori' if role == 'researcher' else 'docenti'])
    visible = {'owner': {owned, shared}, 'colleague': {shared}, 'unrelated': {private}, 'admin': {owned, shared, private}}
    for group_id, username, session in [(owned, 'student.owned', 'owned-qsa'), (shared, 'student.shared', 'shared-result'), (private, 'student.private', 'private-result')]:
        row = db.query(models.QuestionnaireResult).filter_by(session_id=session).one()
        expected = 403 if role == 'student' else 200 if group_id in visible.get(role, set()) else 404
        for suffix in ['', '/pdf']:
            assert client.get(f'/admin/groups/{group_id}/students/{username}/results/{row.id}{suffix}').status_code == expected


def test_revocation_member_removal_and_wrong_result_deny_detail_and_pdf(details):
    client, db, _, (owned, shared, *_), first, *_ = details
    shared_result = db.query(models.QuestionnaireResult).filter_by(session_id='shared-result').one()
    for username, result_id in [('student.owned', shared_result.id), ('student.shared', first.id), ('student.no-results', first.id)]:
        for suffix in ['', '/pdf']:
            assert client.get(f'/admin/groups/{owned}/students/{username}/results/{result_id}{suffix}').status_code == 404
    db.query(models.GroupShare).filter_by(group_id=shared).delete(); db.commit()
    for suffix in ['', '/pdf']:
        assert client.get(f'/admin/groups/{shared}/students/student.shared/results/{shared_result.id}{suffix}').status_code == 404
    db.query(models.GroupMembership).filter_by(group_id=owned, username='student.owned').delete(); db.commit()
    for suffix in ['', '/pdf']:
        assert client.get(f'/admin/groups/{owned}/students/student.owned/results/{first.id}{suffix}').status_code == 404


def test_plan_scope_cannot_reach_other_compilation_of_same_student(details):
    client, _, identity, _, first, second, plan, other = details
    base = f'/admin/administration-plans/{plan.id}/students/student.owned/results'
    assert client.get(f'{base}/{first.id}').json()['reading']['note'] == 'PAROLE DELLO STUDENTE'
    for suffix in ['', '/pdf']:
        assert client.get(f'{base}/{first.id}{suffix}').status_code == 200
        assert client.get(f'{base}/{second.id}{suffix}').status_code == 404
        assert client.get(f'/admin/administration-plans/{other.id}/students/student.owned/results/{second.id}{suffix}').status_code == 404
    identity.update(username='colleague')
    assert client.get(f'{base}/{first.id}').status_code == 404
    identity.update(is_admin=True)
    assert client.get(f'{base}/{first.id}').status_code == 200
    identity.update(is_admin=False, groups=['studenti'])
    assert client.get(f'{base}/{first.id}/pdf').status_code == 403


@pytest.mark.parametrize('lang', ['it', 'en', 'es', 'fr', 'de', 'sv'])
def test_teacher_pdf_uses_same_document_as_student(details, lang):
    client, _, identity, (owned, *_), first, *_ = details
    teacher = client.get(f'/admin/groups/{owned}/students/student.owned/results/{first.id}/pdf?lang={lang}')
    assert teacher.status_code == 200 and teacher.headers['content-type'] == 'application/pdf'
    assert f'_{first.id}.pdf' in teacher.headers['content-disposition']
    teacher_text = '\n'.join(page.extract_text() for page in PdfReader(BytesIO(teacher.content)).pages)
    assert 'SINTESI owned-qsa' in teacher_text and 'Synthetic owned-qsa' in teacher_text
    assert 'SECONDA CONVERSAZIONE' not in teacher_text and 'ALTRA PERSONA' not in teacher_text
    # The unscoped student URL is still private to the owner.
    assert client.get(f'/questionnaire-result/{first.session_id}/pdf?lang={lang}').status_code == 403
    identity.update(username='student.owned', groups=['studenti'])
    student = client.get(f'/questionnaire-result/{first.session_id}/pdf?lang={lang}')
    student_text = '\n'.join(page.extract_text() for page in PdfReader(BytesIO(student.content)).pages)
    assert teacher_text == student_text
