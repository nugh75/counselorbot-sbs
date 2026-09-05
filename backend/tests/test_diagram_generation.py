"""Generation retries malformed model output without changing the diagram schema."""
import asyncio
import json
import threading
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.routes import diagram


SPEC = {"type": "flow", "title": "Un piano aiuta a iniziare",
        "nodes": [{"id": "a", "label": "Piano"}, {"id": "b", "label": "Iniziare"}],
        "edges": [{"from": "a", "to": "b", "label": "riduce l'incertezza"}]}


@pytest.fixture
def generate(monkeypatch):
    monkeypatch.setattr(diagram, '_require_feature', lambda db: None)
    monkeypatch.setattr(diagram, '_resolve_counselor', lambda db, cid: ('ollama', 'selected', None, None, True, None))
    monkeypatch.setattr(diagram, '_diagram_fallback', lambda db: ('ollama', 'fallback', True, None))

    def run(replies):
        calls = []

        class AI:
            def __init__(self, db):
                self.config = {}

            def call_model(self, **kwargs):
                calls.append(kwargs)
                reply = replies.pop(0)
                if callable(reply):
                    reply = reply()
                if isinstance(reply, Exception):
                    raise reply
                return reply

        monkeypatch.setattr(diagram, 'AIService', AI)
        request = diagram.FromMessageRequest(text='Un piano riduce l’incertezza e aiuta a iniziare.', counselor_id=1, spec_only=True)
        try:
            response = asyncio.run(diagram.diagram_from_message(request, None, {}))
        except HTTPException as error:
            response = error
        return response, calls
    return run


def test_overlong_edge_is_regenerated_with_specific_feedback(generate):
    invalid = {**SPEC, 'edges': [{'from': 'a', 'to': 'b', 'label': 'Una spiegazione della relazione molto più lunga dei quaranta caratteri consentiti'}]}
    response, calls = generate([json.dumps(invalid), json.dumps(SPEC)])
    assert response.status_code == 200
    assert json.loads(response.body)['edges'][0]['label'] == SPEC['edges'][0]['label']
    assert [call['model'] for call in calls] == ['selected', 'selected']
    assert 'edges.0.label' in calls[1]['system_prompt']
    assert '40 characters' in calls[1]['system_prompt']
    assert calls[1]['user_message'] == calls[0]['user_message']


def test_truncated_json_is_retried_then_uses_fallback(generate):
    response, calls = generate(['{"type":"flow","nodes":[{}', '{"type":"flow","nodes":[{}', json.dumps(SPEC)])
    assert response.status_code == 200
    assert [call['model'] for call in calls] == ['selected', 'selected', 'fallback']


def test_empty_reply_goes_straight_to_fallback(generate):
    response, calls = generate(['', json.dumps(SPEC)])
    assert response.status_code == 200
    assert [call['model'] for call in calls] == ['selected', 'fallback']


def test_repeated_invalid_output_stops_and_is_a_service_error(generate):
    response, calls = generate([json.dumps({'type': 'flow'})] * 4)
    assert response.status_code == 502
    assert len(calls) == 4
    assert 'invalid specification' in response.detail


def test_unavailable_models_are_not_retried(generate):
    response, calls = generate([diagram.AIError('unavailable')] * 2)
    assert response.status_code == 503
    assert [call['model'] for call in calls] == ['selected', 'fallback']


def test_slow_primary_uses_fallback_before_primary_finishes(generate, monkeypatch):
    monkeypatch.setattr(diagram, 'DIAGRAM_MODEL_TIMEOUT_SECONDS', 0.05, raising=False)
    release = threading.Event()

    def slow_primary():
        assert release.wait(2), 'fallback did not start while primary was blocked'
        return json.dumps({**SPEC, 'title': 'Late primary result'})

    def fallback():
        release.set()
        return json.dumps(SPEC)

    try:
        response, calls = generate([slow_primary, fallback])
    finally:
        release.set()
    assert response.status_code == 200
    assert json.loads(response.body)['title'] == SPEC['title']
    assert [call['model'] for call in calls] == ['selected', 'fallback']


def test_slow_fallback_returns_service_error(generate, monkeypatch):
    monkeypatch.setattr(diagram, 'DIAGRAM_MODEL_TIMEOUT_SECONDS', 0.01, raising=False)

    def slow_fallback():
        threading.Event().wait(0.1)
        return json.dumps(SPEC)

    response, calls = generate([diagram.AIError('unavailable'), slow_fallback])
    assert response.status_code == 503
    assert [call['model'] for call in calls] == ['selected', 'fallback']


@pytest.mark.parametrize('provider,prompt,structured', [
    ('deepseek', diagram.SPEC_ONLY_SYSTEM_PROMPT, True),
    ('deepseek', 'Explain the topic; include a diagram JSON block if useful.', False),
    ('groq', diagram.SPEC_ONLY_SYSTEM_PROMPT, False),
])
def test_deepseek_json_extraction_requests_content_without_thinking(monkeypatch, provider, prompt, structured):
    monkeypatch.setattr(diagram.AIService, '_load_config', lambda self: {})
    ai = diagram.AIService(None)
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(SPEC)))])

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    monkeypatch.setattr(ai, '_openai_compatible_client', lambda provider: client)
    reply = ai._call_openai_compatible(provider, 'Un piano aiuta a iniziare.', prompt, 'deepseek-v4-flash', max_tokens=2400)
    assert json.loads(reply) == SPEC
    if structured:
        assert calls[0]['response_format'] == {'type': 'json_object'}
        assert calls[0]['extra_body'] == {'thinking': {'type': 'disabled'}}
    else:
        assert 'response_format' not in calls[0]
        assert 'extra_body' not in calls[0]
