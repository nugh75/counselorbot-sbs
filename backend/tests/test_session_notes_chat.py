"""Exercise declaration, completed-turn persistence and resume through both routes."""
import json
import pytest
from backend.tests.test_smoke import client, main, auth, _FakeAIService, _fake_user_identity, _TestSession
from backend import models, recommendation_service


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
def test_every_question_of_the_student_is_logged_by_the_server(monkeypatch, stream):
    # The list no longer depends on a private block the model may not write.
    message = 'Posso avere un consiglio sul metodo? E quanto dura il percorso? Vorrei capire.'
    reply = 'Il percorso ha pochi passi; il metodo lo vediamo più avanti.'
    sid = 'requests-stream' if stream else 'requests-sync'
    prompts = []
    _capture_ai(monkeypatch, reply, prompts)
    main.app.dependency_overrides[auth.get_identity_view_as] = _fake_user_identity
    try:
        response = client.post('/chat/stream' if stream else '/chat', json={
            'session_id': sid, 'message': message, 'mode': 'factor-qa', 'questionnaire_type': 'QSA', 'language': 'it',
        })
        assert response.status_code == 200
        if stream:
            events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
            body = next(event for event in events if event.get('done'))
        else:
            body = response.json()
        assert body['response'] == reply
        assert not any('[STUDENT REQUESTS]' in prompt or '[REQUESTS TO REVISIT]' in prompt for prompt in prompts)
        with _TestSession() as db:
            items = {item['name']: item for item in recommendation_service.list_for_session(
                db, session_id=sid, username='student')['request']}
        assert set(items) == {'Posso avere un consiglio sul metodo?', 'E quanto dura il percorso?'}
        assert all(item['status'] == 'proposed' for item in items.values())
    finally:
        _cleanup(sid)


def test_student_manages_own_list():
    sid = 'requests-own'
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
    finally:
        _cleanup(sid)


_REVISIT_STEPS = [
    {'id': 'zz-synthesis', 'mode': 'qpcs-summary', 'order': 1},
    {'id': 'zz-strategies', 'mode': 'strategies', 'order': 2},
]


def _seed_revisit_path():
    with _TestSession() as db:
        for step in _REVISIT_STEPS:
            db.merge(models.GuidedStep(id=step['id'], sort_order=step['order'], label=step['id'], prompt='Step.',
                                       system_prompt_mode=step['mode'], questionnaire_type='QPCS'))
        db.commit()


def _drop_revisit_path():
    with _TestSession() as db:
        db.query(models.GuidedStep).filter(models.GuidedStep.id.in_(['zz-synthesis', 'zz-strategies'])).delete()
        db.commit()


def test_open_requests_are_taken_up_in_dedicated_turns_of_the_right_step(monkeypatch):
    sid = 'requests-revisit'
    _seed_revisit_path()
    main.app.dependency_overrides[auth.get_identity_view_as] = _fake_user_identity
    try:
        with _TestSession() as db:
            for text, kind in (('Quanto dura il percorso?', 'question'), ('Mi dai una strategia?', 'advice'),
                               ('Non classificata?', None)):
                row = recommendation_service.add_request(db, session_id=sid, username='student', text=text)
                if kind:
                    recommendation_service.set_request_kind(db, session_id=sid, username='student',
                                                            slug=row.slug, kind=kind)
        synthesis = client.get(f'/session/{sid}/requests/revisit', params={'phase': 'zz-synthesis'}).json()['request']
        assert [item['name'] for item in synthesis] == ['Quanto dura il percorso?']
        strategies = client.get(f'/session/{sid}/requests/revisit', params={'phase': 'zz-strategies'}).json()['request']
        assert [item['name'] for item in strategies] == [
            'Quanto dura il percorso?', 'Mi dai una strategia?', 'Non classificata?']
        assert client.get(f'/session/{sid}/requests/revisit', params={'phase': 'cognitive'}).json()['request'] == []

        advice = strategies[1]
        refused = client.post('/chat', json={'session_id': sid, 'message': '', 'mode': 'qpcs-summary',
                                             'phase': 'zz-synthesis', 'questionnaire_type': 'QPCS',
                                             'language': 'it', 'revisit_request': advice['slug']})
        assert refused.status_code == 409

        prompts = []
        _capture_ai(monkeypatch, 'Ecco una strategia per concentrarti.', prompts)
        response = client.post('/chat', json={'session_id': sid, 'message': 'ignored', 'mode': 'strategies',
                                              'phase': 'zz-strategies', 'questionnaire_type': 'QPCS',
                                              'language': 'it', 'revisit_request': advice['slug']})
        assert response.status_code == 200, response.text
        assert any('[REVISIT REQUEST]' in prompt and '"Mi dai una strategia?"' in prompt for prompt in prompts)
        assert not any('ignored' in prompt for prompt in prompts)
        items = {item['name']: item for item in response.json()['recommendations']['request']}
        assert items['Mi dai una strategia?']['status'] == 'closed'
        assert items['Mi dai una strategia?']['closed_by'] == 'conversation'
        assert items['Quanto dura il percorso?']['status'] == 'proposed'
    finally:
        _cleanup(sid)
        _drop_revisit_path()


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
