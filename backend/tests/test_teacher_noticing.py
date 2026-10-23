"""Teacher noticing (#247): on-demand, grounded in quoted student words, same access as the detail."""
import json

import pytest

from backend import models, teacher_noticing
from backend.tests.test_teacher_class_compilations import class_results_api  # noqa: F401
from backend.tests.test_teacher_result_detail import details  # noqa: F401

ANSWER = {"items": [
    {"kind": "revisit", "text": "Riprendere il tema", "evidence": [{"message": 0, "quote": "synthetic  OWNED-qsa"}]},
    {"kind": "difficulty", "text": "Citazione inventata", "evidence": [{"message": 0, "quote": "mai detto"}]},
    {"kind": "resource", "text": "Citazione del counselor", "evidence": [{"message": 1, "quote": "Synthetic reply"}]},
    {"kind": "diagnosis", "text": "Tipo non ammesso", "evidence": [{"message": 0, "quote": "Synthetic"}]},
    {"kind": "attention", "text": "Indice fuori", "evidence": [{"message": 9, "quote": "Synthetic"}, {"message": True, "quote": "Synthetic"}]},
]}


@pytest.fixture
def model(monkeypatch):
    calls = []

    def answer(self, prompt, system, *args, **kwargs):
        calls.append(prompt)
        return f"```json\n{json.dumps(ANSWER)}\n```"
    monkeypatch.setattr(teacher_noticing.AIService, '__init__', lambda self, *a, **kw: None)
    monkeypatch.setattr(teacher_noticing.AIService, 'get_response', answer)
    return calls


def test_generated_on_request_and_only_grounded_items_survive(details, model):
    client, db, _, (owned, *_), first, *_ = details
    url = f'/admin/groups/{owned}/students/student.owned/results/{first.id}/noticing?lang=it'
    assert client.get(url).json() == {'status': 'missing', 'items': [], 'generated_at': None}
    assert model == []  # opening the detail never calls the model
    generated = client.post(url).json()
    assert generated['status'] == 'ready' and generated['generated_at']
    assert generated['items'] == [{'kind': 'revisit', 'text': 'Riprendere il tema',
                                   'evidence': [{'message': 0, 'quote': 'synthetic  OWNED-qsa'}]}]
    assert '[0] Student: Synthetic owned-qsa' in model[0]
    assert client.get(url).json() == generated and len(model) == 1
    assert client.get(url.replace('lang=it', 'lang=en')).json()['status'] == 'missing'


def test_changed_conversation_marks_stale_and_drops_lost_quotes(details, model):
    client, db, _, (owned, *_), first, *_ = details
    url = f'/admin/groups/{owned}/students/student.owned/results/{first.id}/noticing'
    client.post(url)
    log = db.query(models.Log).filter_by(session_id='owned-qsa', action='chat_message').one()
    log.details = {'user_input': 'Testo corretto', 'bot_response': 'Synthetic reply'}
    db.commit()
    stale = client.get(url).json()
    assert stale['status'] == 'stale' and stale['items'] == []


def test_empty_and_unavailable_states(details, monkeypatch):
    client, db, _, (owned, *_), first, *_ = details
    row = db.query(models.QuestionnaireResult).filter_by(session_id='owned-qualitative').one()
    db.query(models.Log).filter_by(session_id='owned-qualitative').delete(); db.commit()
    base = f'/admin/groups/{owned}/students/student.owned/results'
    assert client.post(f'{base}/{row.id}/noticing').json()['status'] == 'empty'
    monkeypatch.setattr(teacher_noticing.AIService, '__init__', lambda self, *a, **kw: None)
    monkeypatch.setattr(teacher_noticing.AIService, 'get_response', lambda self, *a, **kw: 'non JSON')
    assert client.post(f'{base}/{first.id}/noticing').json()['status'] == 'unavailable'
    assert client.get(f'{base}/{first.id}/noticing').json()['status'] == 'missing'


@pytest.mark.parametrize('role', ['owner', 'colleague', 'unrelated', 'admin', 'student'])
def test_noticing_keeps_class_and_plan_permissions(details, model, role):
    client, db, identity, (owned, shared, private, _), first, second, plan, other = details
    identity.update(username=role, is_admin=role == 'admin', groups=['studenti' if role == 'student' else 'docenti'])
    visible = {'owner': {owned, shared}, 'colleague': {shared}, 'unrelated': {private}, 'admin': {owned, shared, private}}
    for group_id, username, session in [(owned, 'student.owned', 'owned-qsa'), (shared, 'student.shared', 'shared-result')]:
        row = db.query(models.QuestionnaireResult).filter_by(session_id=session).one()
        expected = 403 if role == 'student' else 200 if group_id in visible.get(role, set()) else 404
        for method in (client.get, client.post):
            assert method(f'/admin/groups/{group_id}/students/{username}/results/{row.id}/noticing').status_code == expected
    plan_base = f'/admin/administration-plans/{plan.id}/students/student.owned/results'
    plan_expected = 403 if role == 'student' else 200 if role in ('owner', 'admin') else 404
    assert client.get(f'{plan_base}/{first.id}/noticing').status_code == plan_expected
    if role in ('owner', 'admin'):
        assert client.post(f'{plan_base}/{second.id}/noticing').status_code == 404


def test_unreadable_answer_is_retried_once(details, monkeypatch):
    client, db, _, (owned, *_), first, *_ = details
    answers = iter(['{"items": [{"kind": "revisit", "te', json.dumps(ANSWER)])
    calls = []
    monkeypatch.setattr(teacher_noticing.AIService, '__init__', lambda self, *a, **kw: None)
    monkeypatch.setattr(teacher_noticing.AIService, 'get_response', lambda self, *a, **kw: calls.append(1) or next(answers))
    url = f'/admin/groups/{owned}/students/student.owned/results/{first.id}/noticing'
    assert client.post(url).json()['status'] == 'ready' and len(calls) == 2
    monkeypatch.setattr(teacher_noticing.AIService, 'get_response', lambda self, *a, **kw: calls.append(1) or '')
    assert client.post(url).json()['status'] == 'unavailable' and len(calls) == 4
