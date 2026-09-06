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
