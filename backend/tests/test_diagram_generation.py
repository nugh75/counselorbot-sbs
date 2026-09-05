"""Generation retries malformed model output without changing the diagram schema."""
import asyncio
import json

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
