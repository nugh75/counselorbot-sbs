"""La bozza del libretto viaggia fuori dal testo visibile, sulle due rotte della chat."""
import json

import pytest

from backend import models
from backend.tests.test_smoke import _FakeAIService, _fake_user_identity, _TestSession, auth, client, main


@pytest.mark.parametrize('stream', [False, True])
def test_the_event_summary_hands_the_booklet_draft_to_the_client_and_hides_it(monkeypatch, stream):
    summary = 'Hai scelto di lasciare cinque minuti per le domande.'
    block = '```booklet\n' + json.dumps({'title': 'La lezione sulle frazioni', 'role': 'observer'}) + '\n```'
    raw = summary + '\n\n' + block
    sid = 'evento-booklet-stream' if stream else 'evento-booklet-sync'

    def output(*args, **kwargs):
        for char in raw:
            yield {'type': 'content', 'text': char}

    import backend.routes.chat as chat_routes
    monkeypatch.setattr(chat_routes, 'AIService', _FakeAIService)
    monkeypatch.setattr(_FakeAIService, 'stream_response', output)
    monkeypatch.setattr(_FakeAIService, 'get_response', lambda *args, **kwargs: raw)
    main.app.dependency_overrides[auth.get_identity_view_as] = _fake_user_identity
    try:
        response = client.post('/chat/stream' if stream else '/chat', json={
            'session_id': sid, 'message': 'Sintesi', 'mode': 'evento-summary',
            'questionnaire_type': 'EVENTO_STUDIO', 'language': 'it',
        })
        assert response.status_code == 200
        if stream:
            events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
            body = next(event for event in events if event.get('done'))
            assert all('```book' not in event.get('display', '') for event in events)
        else:
            body = response.json()
        assert body['response'] == summary
        assert body['event_booklet']['title'] == 'La lezione sulle frazioni'
        assert body['event_booklet']['event_role'] == 'observer'
    finally:
        main.app.dependency_overrides.pop(auth.get_identity_view_as, None)
        with _TestSession() as db:
            db.query(models.Log).filter_by(session_id=sid).delete()
            db.commit()
