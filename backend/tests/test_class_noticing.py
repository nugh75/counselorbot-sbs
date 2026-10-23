"""Class noticing (#464): themes only from verified per-compilation items, counts computed server side."""
import json

import pytest

from backend import class_noticing, models, teacher_noticing
from backend.tests.test_teacher_class_compilations import class_results_api  # noqa: F401


@pytest.fixture
def model(monkeypatch):
    calls = []

    def answer(self, prompt, system, *args, **kwargs):
        calls.append(system)
        if system == class_noticing._SYSTEM_PROMPT:
            ids = [line[1:line.index(']')] for line in prompt.splitlines() if line.startswith('[')]
            return json.dumps({'themes': [
                {'title': 'Attenzione', 'item_ids': ids + ['999-0'], 'suggestion': 'Lavorare sulle distrazioni'},
                {'title': 'Inventato', 'item_ids': ['999-0'], 'suggestion': 'x'},
            ], 'suggestions': ['Proporre una routine', ' ', 'Parlare con chi si distrae']})
        session = 'owned-qualitative' if 'owned-qualitative' in prompt else 'owned-qsa'
        return json.dumps({'items': [{'kind': 'difficulty', 'text': f'Nota {session}',
                                      'evidence': [{'message': 0, 'quote': f'Synthetic {session}'}]}]})
    monkeypatch.setattr(teacher_noticing.AIService, '__init__', lambda self, *a, **kw: None)
    monkeypatch.setattr(teacher_noticing.AIService, 'get_response', answer)
    return calls


def test_class_overview_groups_verified_items_with_students(class_results_api, model):
    client, db, _, (owned, *_) = class_results_api
    url = f'/admin/groups/{owned}/noticing?lang=it'
    empty = client.get(url).json()
    assert empty['status'] == 'empty' and {c['status'] for c in empty['compilations']} == {'missing'}
    assert empty['charts']['students'] == 1 and model == []
    for compilation in empty['compilations']:
        client.post(f"/admin/groups/{owned}/students/{compilation['username']}/results/{compilation['id']}/noticing?lang=it")
    assert client.get(url).json()['status'] == 'missing'
    ready = client.post(url).json()
    assert ready['status'] == 'ready' and ready['generated_at']
    assert ready['charts']['kinds'] == {'revisit': 0, 'resource': 0, 'difficulty': 1, 'attention': 0}
    assert ready['suggestions'] == ['Proporre una routine', 'Parlare con chi si distrae']
    [theme] = ready['themes']
    assert theme['title'] == 'Attenzione' and theme['kind'] == 'difficulty' and theme['student_count'] == 1
    assert {s['quote'] for s in theme['students']} == {'Synthetic owned-qsa', 'Synthetic owned-qualitative'}
    assert client.get(url).json() == ready


def test_filters_and_staleness(class_results_api, model):
    client, db, _, (owned, *_) = class_results_api
    for row in db.query(models.QuestionnaireResult).filter_by(username='student.owned'):
        client.post(f'/admin/groups/{owned}/students/student.owned/results/{row.id}/noticing')
    client.post(f'/admin/groups/{owned}/noticing')
    only_qsa = client.get(f'/admin/groups/{owned}/noticing?instrument=QSA').json()
    assert [c['questionnaire_type'] for c in only_qsa['compilations']] == ['QSA'] and only_qsa['status'] == 'missing'
    assert only_qsa['instruments'] == ['QSA', 'SAVICKAS']
    assert client.get(f'/admin/groups/{owned}/noticing?days=1').json()['compilations'] == []
    log = db.query(models.Log).filter_by(session_id='owned-qsa', action='chat_message').one()
    log.details = {'user_input': 'Cambiato', 'bot_response': 'x'}; db.commit()
    stale = client.get(f'/admin/groups/{owned}/noticing').json()
    assert stale['status'] == 'stale'
    assert {s['quote'] for s in stale['themes'][0]['students']} == {'Synthetic owned-qualitative'}


@pytest.mark.parametrize('role', ['owner', 'colleague', 'unrelated', 'student'])
def test_class_noticing_keeps_class_permissions(class_results_api, model, role):
    client, db, identity, (owned, shared, private, _) = class_results_api
    identity.update(username=role, groups=['studenti' if role == 'student' else 'docenti'])
    visible = {'owner': {owned, shared}, 'colleague': {shared}, 'unrelated': {private}}
    for group_id in (owned, shared):
        expected = 403 if role == 'student' else 200 if group_id in visible.get(role, set()) else 404
        assert client.get(f'/admin/groups/{group_id}/noticing').status_code == expected
        assert client.post(f'/admin/groups/{group_id}/noticing').status_code == expected
