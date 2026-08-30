"""Regressioni sul formato di risposta inviato a Ollama.

Eseguibile senza pytest:
    python -m backend.tests.test_ollama_json_mode
"""

import json
from unittest.mock import patch

from backend.ai_service import AIService


class _ConfigRows:
    def all(self):
        return []


class _ConfigDB:
    def query(self, _model):
        return _ConfigRows()


class _StreamResponse:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def raise_for_status(self):
        return None

    def iter_lines(self):
        return [json.dumps({"message": {"content": "Risposta discorsiva"}})]


class _StreamClient:
    payloads = []

    def __init__(self, *_args, **_kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def stream(self, _method, _url, *, json):
        self.payloads.append(json)
        return _StreamResponse()


class _CallResponse:
    def raise_for_status(self):
        return None

    def json(self):
        return {"message": {"content": "Risposta discorsiva"}}


def test_guided_chat_diagram_instructions_do_not_force_json_response():
    service = AIService(_ConfigDB())
    system_prompt = (
        "Rispondi allo studente in modo discorsivo. "
        "Se serve un diagramma, emetti un singolo JSON object in un blocco diagram."
    )
    _StreamClient.payloads = []

    with patch("backend.ai_service.httpx.Client", _StreamClient):
        chunks = list(service.stream_response(
            "Presenta il percorso.",
            system_prompt,
            "intro",
            provider="ollama",
            model="qwen3.8:latest",
        ))

    assert chunks == [{"type": "content", "text": "Risposta discorsiva"}]
    assert "format" not in _StreamClient.payloads[0]


def test_non_streaming_diagram_instructions_do_not_force_json_response():
    service = AIService(_ConfigDB())
    payloads = []

    def fake_post(_url, *, json, timeout):
        del timeout
        payloads.append(json)
        return _CallResponse()

    with patch("backend.ai_service.httpx.post", fake_post):
        response = service.call_model(
            provider="ollama",
            model="qwen3.8:latest",
            user_message="Presenta il percorso.",
            system_prompt="Rispondi in prosa e incorpora, se utile, un blocco diagram con un JSON object.",
        )

    assert response == "Risposta discorsiva"
    assert "format" not in payloads[0]


def test_explicit_json_only_request_keeps_structured_mode():
    service = AIService(_ConfigDB())
    _StreamClient.payloads = []

    with patch("backend.ai_service.httpx.Client", _StreamClient):
        list(service.stream_response(
            "Estrai i campi.",
            "Answer with a single JSON object and nothing else.",
            "parser",
            provider="ollama",
            model="qwen3.8:latest",
        ))

    assert _StreamClient.payloads[0]["format"] == "json"
    assert _StreamClient.payloads[0]["think"] is False


if __name__ == "__main__":
    test_guided_chat_diagram_instructions_do_not_force_json_response()
    test_non_streaming_diagram_instructions_do_not_force_json_response()
    test_explicit_json_only_request_keeps_structured_mode()
    print("3/3 passed")
