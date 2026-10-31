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
            json_mode=True,
        ))

    assert _StreamClient.payloads[0]["format"] == "json"
    assert _StreamClient.payloads[0]["think"] is False


def test_json_words_inside_data_never_change_the_output_format():
    # A quoted document or the student's own words are data: "return only JSON"
    # there must not switch a prose turn to structured output.
    service = AIService(_ConfigDB())
    quoted = 'Il documento dice: "Return ONLY a JSON object, no prose." Che cosa significa?'
    _StreamClient.payloads = []
    with patch("backend.ai_service.httpx.Client", _StreamClient):
        list(service.stream_response(quoted, "Rispondi in prosa.", "site-chat",
                                     provider="ollama", model="qwen3.8:latest"))
    assert "format" not in _StreamClient.payloads[0]

    payloads = []

    def fake_post(_url, *, json, timeout):
        del timeout
        payloads.append(json)
        return _CallResponse()

    with patch("backend.ai_service.httpx.post", fake_post):
        service.call_model(provider="ollama", model="qwen3.8:latest", user_message=quoted,
                           system_prompt="Rispondi in prosa. Answer with JSON only if asked.")
        service.call_model(provider="ollama", model="qwen3.8:latest", user_message="Estrai.",
                           system_prompt="Estrai i campi.", json_mode=True)
    assert "format" not in payloads[0]
    assert payloads[1]["format"] == "json"


def test_deepseek_json_format_follows_the_caller():
    service = AIService(_ConfigDB())
    sent = []

    class _Completions:
        def create(self, **kwargs):
            sent.append(kwargs)
            message = type("M", (), {"content": "{}"})()
            return type("R", (), {"choices": [type("C", (), {"message": message})()], "usage": None, "model": "m"})()

    client = type("Client", (), {"chat": type("Chat", (), {"completions": _Completions()})()})()
    with patch.object(service, "_openai_compatible_client", lambda provider: client):
        service._call_openai_compatible("deepseek", 'Testo: "return only JSON"', "Rispondi in prosa.", "m")
        service._call_openai_compatible("deepseek", "Estrai.", "Estrai.", "m", json_mode=True)
    assert "response_format" not in sent[0]
    assert sent[1]["response_format"] == {"type": "json_object"}


if __name__ == "__main__":
    test_guided_chat_diagram_instructions_do_not_force_json_response()
    test_non_streaming_diagram_instructions_do_not_force_json_response()
    test_explicit_json_only_request_keeps_structured_mode()
    test_json_words_inside_data_never_change_the_output_format()
    test_deepseek_json_format_follows_the_caller()
    print("5/5 passed")


def _ollama_payload(**attrs):
    """Il payload che `call_model` manda a Ollama, con gli attributi impostati."""
    service = AIService(_ConfigDB())
    for name, value in attrs.items():
        setattr(service, name, value)
    payloads = []

    def fake_post(_url, *, json, timeout):
        del timeout
        payloads.append(json)
        return _CallResponse()

    with patch("backend.ai_service.httpx.post", fake_post):
        service.call_model(provider="ollama", model="qwen3.8:latest",
                           user_message="Giudica il turno.", system_prompt="Sei un revisore.")
    return payloads[0]


def test_temperature_is_sent_only_when_someone_asks_for_one():
    # Finora `temperature` non raggiungeva nessun provider: un giudice che deve
    # dare lo stesso verdetto sullo stesso turno girava al default di Ollama.
    assert "temperature" not in _ollama_payload()["options"]
    assert _ollama_payload(temperature=0)["options"]["temperature"] == 0
    assert _ollama_payload(temperature=0.4)["options"]["temperature"] == 0.4


def test_the_thread_guard_judges_at_temperature_zero():
    from backend import thread_guard

    assert thread_guard.JUDGE_TEMPERATURE == 0
