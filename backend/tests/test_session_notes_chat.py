"""Exercise declaration, completed-turn persistence and resume through both routes."""
import json
import pytest
from backend.tests.test_smoke import client, main, auth, _FakeAIService, _fake_user_identity, _TestSession
from backend import models


@pytest.mark.parametrize('stream', [False, True])
def test_completed_chat_notes_are_private_owned_and_reloadable(monkeypatch, stream):
    question = 'Quale episodio ti viene in mente?'
    raw = question + '\n```recommendations\n' + json.dumps({'notes': [{'kind': 'question', 'text': question}]}) + '\n```'
    sid = 'w4-question-stream' if stream else 'w4-question-sync'
    def output(*args, **kwargs):
        for char in raw:
            yield {'type': 'content', 'text': char}
    import backend.routes.chat as chat_routes
    monkeypatch.setattr(chat_routes, "AIService", _FakeAIService)
    monkeypatch.setattr(_FakeAIService, 'stream_response', output)
    monkeypatch.setattr(_FakeAIService, 'get_response', lambda *args, **kwargs: raw)
    main.app.dependency_overrides[auth.get_identity_view_as] = _fake_user_identity
    try:
        response = client.post('/chat/stream' if stream else '/chat', json={
            'session_id': sid, 'message': 'Vorrei riflettere su un episodio.',
            'mode': 'factor-qa', 'questionnaire_type': 'QSA', 'language': 'it',
        })
        assert response.status_code == 200
        if stream:
            events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
            body = next(event for event in events if event.get('done'))
            assert all('```recommend' not in event.get('display', '') for event in events)
        else:
            body = response.json()
        assert body['response'] == question
        assert len(body['recommendations']['advice']) == 1
        item = body['recommendations']['advice'][0]
        assert item['kind'] == 'question' and item['status'] == 'proposed'
        closed = client.patch(f'/session/{sid}/recommendations/advice/{item["slug"]}', json={'status': 'closed'})
        assert closed.status_code == 200
        assert client.get(f'/session/{sid}/recommendations').json()['advice'][0]['status'] == 'closed'
    finally:
        main.app.dependency_overrides.pop(auth.get_identity_view_as, None)
        with _TestSession() as db:
            db.query(models.RecommendationHistory).filter_by(session_id=sid).delete()
            db.query(models.Log).filter_by(session_id=sid).delete()
            db.commit()


def _capture_ai(monkeypatch, raw, prompts):
    import backend.routes.chat as chat_routes
    def output(self, *args, **kwargs):
        prompts.append(" ".join(str(arg) for arg in args) + " " + " ".join(str(v) for v in kwargs.values()))
        for char in raw:
            yield {'type': 'content', 'text': char}
    def response(self, *args, **kwargs):
        prompts.append(" ".join(str(arg) for arg in args) + " " + " ".join(str(v) for v in kwargs.values()))
        return raw
    monkeypatch.setattr(chat_routes, "AIService", _FakeAIService)
    monkeypatch.setattr(_FakeAIService, 'stream_response', output)
    monkeypatch.setattr(_FakeAIService, 'get_response', response)


def _cleanup(sid):
    main.app.dependency_overrides.pop(auth.get_identity_view_as, None)
    with _TestSession() as db:
        db.query(models.RecommendationHistory).filter_by(session_id=sid).delete()
        db.query(models.Log).filter_by(session_id=sid).delete()
        db.commit()


@pytest.mark.parametrize('stream', [False, True])
def test_student_requests_are_logged_verbatim_and_answered_ones_are_already_discussed(monkeypatch, stream):
    message = 'Posso avere un consiglio sul metodo? E quanto dura il percorso?'
    reply = 'Il percorso ha pochi passi; il metodo lo vediamo più avanti.'
    block = {'requests': [
        {'text': 'Posso avere un consiglio sul metodo?', 'answered': False},
        {'text': 'E quanto dura il percorso?', 'answered': True},
        {'text': 'Una domanda che lo studente non ha mai scritto?', 'answered': False},
    ]}
    raw = reply + '\n```recommendations\n' + json.dumps(block) + '\n```'
    sid = 'requests-stream' if stream else 'requests-sync'
    prompts = []
    _capture_ai(monkeypatch, raw, prompts)
    main.app.dependency_overrides[auth.get_identity_view_as] = _fake_user_identity
    try:
        response = client.post('/chat/stream' if stream else '/chat', json={
            'session_id': sid, 'message': message, 'mode': 'factor-qa', 'questionnaire_type': 'QSA', 'language': 'it',
        })
        assert response.status_code == 200
        if stream:
            events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
            body = next(event for event in events if event.get('done'))
            assert all('requests' not in event.get('display', '') for event in events)
        else:
            body = response.json()
        assert body['response'] == reply
        assert any('[STUDENT REQUESTS]' in prompt for prompt in prompts)
        assert not any('[REQUESTS TO REVISIT]' in prompt for prompt in prompts)
        items = {item['name']: item for item in body['recommendations']['request']}
        assert set(items) == {'Posso avere un consiglio sul metodo?', 'E quanto dura il percorso?'}
        assert items['Posso avere un consiglio sul metodo?']['status'] == 'proposed'
        assert items['E quanto dura il percorso?']['status'] == 'closed'
        assert items['E quanto dura il percorso?']['closed_by'] == 'conversation'
    finally:
        _cleanup(sid)


def test_student_manages_own_list_and_final_step_takes_up_open_requests(monkeypatch):
    sid = 'requests-final'
    main.app.dependency_overrides[auth.get_identity_view_as] = _fake_user_identity
    try:
        added = client.post(f'/session/{sid}/requests', json={'text': 'Come gestisco l’ansia prima degli esami?'})
        assert added.status_code == 200
        first = added.json()['request'][0]
        assert first['source'] == 'student' and first['status'] == 'proposed'
        second = client.post(f'/session/{sid}/requests', json={'text': 'Da rimuovere'}).json()['request'][1]
        assert client.delete(f'/session/{sid}/requests/{second["slug"]}').json()['request'] == [first]
        assert client.delete(f'/session/{sid}/requests/{second["slug"]}').status_code == 404
        assert client.post(f'/session/{sid}/requests', json={'text': 'x' * 301}).status_code == 422
        closed = client.patch(f'/session/{sid}/recommendations/request/{first["slug"]}', json={'status': 'closed'}).json()
        assert closed['request'][0]['status'] == 'closed' and closed['request'][0]['closed_by'] == 'student'
        reopened = client.patch(f'/session/{sid}/recommendations/request/{first["slug"]}', json={'status': 'proposed'}).json()
        assert reopened['request'][0]['status'] == 'proposed'

        # Final step: the open request reaches the model as R1 and is closed when declared discussed.
        reply = 'Riprendiamo la tua domanda sull’ansia prima degli esami.'
        raw = reply + '\n```recommendations\n' + json.dumps({'requests': [], 'discussed': ['R1', 'R9']}) + '\n```'
        prompts = []
        _capture_ai(monkeypatch, raw, prompts)
        response = client.post('/chat', json={
            'session_id': sid, 'message': 'Ok, chiudiamo.', 'mode': 'factor-qa', 'phase': 'sl-synthesis',
            'questionnaire_type': 'QSA', 'language': 'it',
        })
        assert response.status_code == 200, response.text
        assert any('[REQUESTS TO REVISIT]' in prompt and 'R1: "Come gestisco l’ansia prima degli esami?"' in prompt
                   for prompt in prompts)
        item = response.json()['recommendations']['request'][0]
        assert item['status'] == 'closed' and item['closed_by'] == 'conversation'
    finally:
        _cleanup(sid)


def test_requests_of_another_student_are_never_listed_or_changed():
    sid = 'requests-owner'
    from backend import recommendation_service
    with _TestSession() as db:
        recommendation_service.add_request(db, session_id=sid, username='someone-else', text='Domanda di un altro studente?')
    main.app.dependency_overrides[auth.get_identity_view_as] = _fake_user_identity
    try:
        assert client.get(f'/session/{sid}/recommendations').json()['request'] == []
        with _TestSession() as db:
            slug = db.query(models.RecommendationHistory).filter_by(session_id=sid).one().slug
        assert client.delete(f'/session/{sid}/requests/{slug}').status_code == 404
        assert client.patch(f'/session/{sid}/recommendations/request/{slug}', json={'status': 'closed'}).status_code == 404
    finally:
        _cleanup(sid)
