"""P6a-c: synthetic data only; deny real transports, inspect local requests."""
import asyncio
import json
import socket
from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import pytest
import requests

from backend import pii, pii_ner, pqbl_generator as pqbl, qsa_extractor as qsa, vision_service
from backend.ai_service import AIError, AIService
from backend.privacy.policy import is_trusted_local
from backend.routes import voice_reader as reader


@pytest.fixture(autouse=True)
def isolated_egress(monkeypatch):
    monkeypatch.delenv("PRIVACY_LOCAL_HOSTS", raising=False)
    monkeypatch.delenv("TRUSTED_LOCAL_HOSTS", raising=False)

    def forbidden(*args, **kwargs):
        pytest.fail("Real network transport forbidden")

    monkeypatch.setattr(socket.socket, "connect", forbidden)
    monkeypatch.setattr(httpx.Client, "send", forbidden)
    monkeypatch.setattr(httpx.AsyncClient, "send", forbidden)
    monkeypatch.setattr(requests.Session, "send", forbidden)


@pytest.mark.parametrize("url", [
    "http://localhost:11434", "https://LOCALHOST./v1", "http://127.0.0.1",
    "http://127.1.2.3:8000", "http://[::1]:11434/api", "https://[0:0:0:0:0:0:0:1]",
])
def test_loopback_is_trusted(url):
    assert is_trusted_local(url)


@pytest.mark.parametrize("url", [
    "http://192.168.1.10:11434", "http://10.0.0.2", "http://172.16.0.2",
    "https://203.0.113.10", "http://[fd00::1]", "http://[::ffff:192.168.1.2]",
    "http://ollama:11434", "http://piper:8000", "http://host.docker.internal",
    "http://localhost.example.org", "http://localhost@evil.example",
    "http://evil.example@localhost", "file://localhost/a", "//localhost/a",
    "localhost:11434", "http://[::1", "http://localhost:bad", "http://localhost:0",
    "http://localhost:99999", "http://localhost\\@evil.example",
    "http://local%68ost", "http://localhost\n.evil.example", "http://localhost/#evil",
    "", None,
])
def test_remote_ambiguous_or_malformed_is_external(url):
    assert not is_trusted_local(url)


@pytest.mark.parametrize("variable", ["PRIVACY_LOCAL_HOSTS", "TRUSTED_LOCAL_HOSTS"])
def test_allowlist_is_explicit_exact_and_normalized(monkeypatch, variable):
    monkeypatch.setenv(variable, "OLLAMA, piper 192.168.1.10, [fd00::1], *.example, https://evil.example")
    for url in ("http://ollama:11434", "http://piper:8000", "https://192.168.1.10",
                "http://[fd00::1]:11434"):
        assert is_trusted_local(url)
    for url in ("http://ollama.evil.example", "http://192.168.1.11", "https://evil.example"):
        assert not is_trusted_local(url)


def service(**config):
    ai = AIService.__new__(AIService)
    ai.config = config
    ai.db = None
    ai.personal_error = None
    ai.external_pii_redact = True
    ai.external_pii_fallback = "block"
    return ai


@pytest.mark.parametrize("provider", ["openai", "openrouter", "mistral", "gemini", "ollama"])
@pytest.mark.parametrize("redact", [True, False])
def test_external_images_blocked_before_sdk_detector_or_network(monkeypatch, provider, redact):
    config = dict(vision_provider=provider, vision_model="synthetic-vision",
                  ollama_ip="http://203.0.113.5:11434")
    sdk = Mock(side_effect=AssertionError("External SDK must never be created"))
    monkeypatch.setattr(vision_service, "OpenAI", sdk)
    monkeypatch.setattr(vision_service, "Mistral", sdk)
    monkeypatch.setattr(pii_ner, "anonymize_texts", sdk)
    ai = service(**config)
    ai.external_pii_redact = redact
    with pytest.raises(vision_service.VisionError, match="personalAPI.errors.privacy"):
        ai.call_vision("Synthetic prompt", "c3ludGhldGljLWltYWdl")
    with pytest.raises(vision_service.VisionError, match="personalAPI.errors.privacy"):
        vision_service.call(config, None, provider, "synthetic-vision", "prompt", "image")
    sdk.assert_not_called()


def test_local_vision_transport_receives_image_without_proxy_or_redirect(monkeypatch):
    seen = []

    def transport(request):
        assert is_trusted_local(str(request.url))
        seen.append(json.loads(request.content))
        return httpx.Response(200, json={"response": "synthetic OCR"})

    real_client = httpx.Client
    # Restore Client.send ONLY inside a mocked transport: no sockets.
    real_send = _HTTPX_SEND

    def post(url, **kwargs):
        assert kwargs.pop("trust_env") is False
        assert kwargs.pop("follow_redirects") is False
        with real_client(transport=httpx.MockTransport(transport), trust_env=False) as client:
            return real_send(client, client.build_request("POST", url, **kwargs))

    monkeypatch.setattr(httpx, "post", post)
    assert vision_service.call({}, None, "ollama", "local", "prompt", "synthetic") == "synthetic OCR"
    assert seen[0]["images"] == ["synthetic"]


_HTTPX_SEND = httpx.Client.send
_ASYNC_HTTPX_SEND = httpx.AsyncClient.send


@pytest.mark.parametrize("provider,key", [("ollama", "ollama_ip"), ("llamacpp", "llamacpp_url")])
def test_remote_named_local_provider_filters_entire_envelope_even_with_optout(provider, key):
    ai = service(**{key: "http://203.0.113.7:11434", "pii_ner_enabled": "false"})
    ai.external_pii_redact = False
    message, system, history, prepared = ai._anonymize_external(
        provider, "student@example.org", "teacher@example.org",
        [{"role": "user", "content": "previous@example.org"}])
    assert "student@example.org" not in message
    assert "teacher@example.org" not in system
    assert "previous@example.org" not in str(history)
    assert [prepared.restore(text) for text in (message, system, history[0]["content"])] == [
        "student@example.org", "teacher@example.org", "previous@example.org"]


def test_remote_ner_is_blocked_before_it_can_receive_original_text():
    ai = service(ollama_ip="http://192.168.1.30:11434", pii_ner_enabled="true")
    with pytest.raises(AIError) as error:
        ai._anonymize_external("ollama", "student@example.org", "", [])
    assert error.value.code == "personalAPI.errors.privacy"
    with pytest.raises(ValueError, match="pii_local_host_untrusted"):
        pii_ner._ner_entities("student@example.org", ai._ollama_base(), "local-detector")


def test_explicit_trusted_host_bypasses_external_filter(monkeypatch):
    monkeypatch.setenv("PRIVACY_LOCAL_HOSTS", "ollama")
    ai = service(ollama_ip="http://ollama:11434")
    assert ai._anonymize_external("ollama", "student@example.org", "", [])[0] == "student@example.org"


def test_qsa_and_pqbl_direct_ocr_block_untrusted_hosts():
    with pytest.raises(vision_service.VisionError, match="personalAPI.errors.privacy"):
        qsa._ollama_post("http://192.168.1.10:11434", "/api/generate", {"images": ["synthetic"]}, 10)
    with pytest.raises(vision_service.VisionError, match="personalAPI.errors.privacy"):
        pqbl._local_ollama_ocr([object()], "http://ollama:11434", "local")


def test_qsa_fallback_does_not_export_image_and_returns_localized_error(monkeypatch, tmp_path):
    path = tmp_path / "synthetic.png"
    path.write_bytes(b"synthetic")
    monkeypatch.setattr(qsa, "_encode_document_pages", lambda path: ["synthetic"])
    ai = service(vision_provider="openai", vision_model="synthetic", ollama_ip="http://192.168.1.10")
    result = qsa.extract_questionnaire_data(str(path), ollama_url=ai._ollama_base(), vision_call=ai.call_vision)
    assert result["error_code"] == "personalAPI.errors.privacy"
    from backend.routes.chat import _qsa_extraction_error
    for language in reader.LANGUAGES:
        detail = _qsa_extraction_error(result, language).detail
        assert detail != result["error"]
        assert "192.168" not in detail


def test_pqbl_fallback_blocks_external_image(monkeypatch):
    monkeypatch.setattr(pqbl, "render_pages_to_images", lambda *args: [object()])
    monkeypatch.setattr(pqbl, "_page_image_base64", lambda image: "synthetic")
    ai = service(vision_provider="openrouter", vision_model="synthetic")
    with pytest.raises(pqbl.OcrUnavailableError) as error:
        pqbl.ocr_pdf_pages("synthetic.pdf", 0, 1, ollama_url="http://192.168.1.10", vision_call=ai.call_vision)
    assert error.value.code == "personalAPI.errors.privacy"


def test_edge_receives_redacted_text_even_if_logging_redaction_disabled(monkeypatch):
    monkeypatch.setattr(pii, "_pii_redact_enabled", False)
    seen = []

    class Communicate:
        def __init__(self, text, voice, **kwargs):
            seen.append(text)

        async def stream(self):
            yield {"type": "audio", "data": b"synthetic-audio"}

    monkeypatch.setattr(reader.edge_tts, "Communicate", Communicate)
    segment = {"index": 0, "text": "student@example.org 3331234567 RSSMRA80A01H501U"}
    result = asyncio.run(reader.synthesize(segment, "it-IT-IsabellaNeural", "edge"))
    for value in ("student@example.org", "3331234567", "RSSMRA80A01H501U"):
        assert value not in seen[0]
    assert result["text"] == seen[0]


def test_edge_filters_full_text_after_pronunciation_before_chunking():
    email = "synthetic@" + "school." * 25 + "example.org"
    # A long single token crosses the 180-character opening boundary.
    text = "contatto"
    rules = [reader.PronunciationRule(term="contatto", spoken=email)]
    raw = reader.spoken_segments(text, "it", rules)
    assert len(raw) > 1 and email.startswith(raw[0]["text"])
    segments = reader.spoken_segments(text, "it", rules, external=True)
    assert email not in " ".join(segment["text"] for segment in segments)
    assert all("synthetic@" not in segment["text"] for segment in segments)


def test_edge_redaction_failure_stops_before_transport(monkeypatch):
    def failed(text):
        raise RuntimeError("synthetic private text must not appear in errors")

    monkeypatch.setattr(pii, "_redact_spans", failed)
    edge = Mock()
    monkeypatch.setattr(reader.edge_tts, "Communicate", edge)
    with pytest.raises(ValueError, match="^pii_redaction_unavailable$"):
        asyncio.run(reader.synthesize({"text": "student@example.org"}, "voice", "edge"))
    edge.assert_not_called()
    with pytest.raises(reader.HTTPException) as error:
        asyncio.run(reader.stream(reader.ReaderRequest(text="student@example.org", engine="edge"), None))
    assert error.value.status_code == 503
    assert "student@example.org" not in error.value.detail


@pytest.mark.parametrize("available,engine", [(True, "piper"), (False, "edge")])
def test_default_engine_prefers_available_local_piper(monkeypatch, available, engine):
    async def probe():
        return available

    monkeypatch.setattr(reader, "piper_available", probe)
    seen = []

    async def events(segments, voice, resolved):
        seen.append((segments, voice, resolved))
        yield "data: synthetic\n\n"

    monkeypatch.setattr(reader, "reader_events", events)

    async def run():
        response = await reader.stream(reader.ReaderRequest(text="student@example.org"), SimpleNamespace())
        return [event async for event in response.body_iterator]

    asyncio.run(run())
    segments, voice, resolved = seen[0]
    assert resolved == engine
    if available:
        assert "student@example.org" in segments[0]["text"]
        assert voice == reader.VOICE_PROFILES["piper_defaults"]["it"]["female"]
    else:
        assert "student@example.org" not in segments[0]["text"]


def test_untrusted_piper_and_teacher_profile_never_probe_or_send(monkeypatch):
    monkeypatch.setattr(reader, "PIPER_URL", "http://192.168.1.10:8000")
    assert asyncio.run(reader.piper_available()) is False
    with pytest.raises(reader.HTTPException):
        asyncio.run(reader.synthesize({"text": "private"}, "voice", "piper"))
    monkeypatch.setattr(reader.install_profile, "teacher_pc", lambda: True)
    monkeypatch.setattr(reader, "PIPER_URL", "http://127.0.0.1:8000")
    assert asyncio.run(reader.piper_available()) is False


@pytest.mark.parametrize("status", [200, 307, 503])
def test_piper_probe_and_local_synthesis_use_only_trusted_transport(monkeypatch, status):
    monkeypatch.setattr(reader, "PIPER_URL", "http://127.0.0.1:8000")
    monkeypatch.setattr(reader.install_profile, "teacher_pc", lambda: False)
    seen = []

    def handler(request):
        seen.append(request)
        assert is_trusted_local(str(request.url))
        if request.url.path == "/voices":
            return httpx.Response(status, json={"voices": [{"id": "synthetic"}]},
                                  headers={"location": "https://external.example/voices"})
        assert json.loads(request.content)["text"] == "student@example.org"
        return httpx.Response(200, content=b"synthetic-wav")

    client_type = httpx.AsyncClient

    def client(**kwargs):
        assert kwargs["trust_env"] is False
        assert kwargs["follow_redirects"] is False
        return client_type(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "send", _ASYNC_HTTPX_SEND)
    monkeypatch.setattr(reader.httpx, "AsyncClient", client)
    assert asyncio.run(reader.piper_available()) is (status == 200)
    assert len(seen) == 1
    if status == 200:
        result = asyncio.run(reader.synthesize({"text": "student@example.org"}, "voice", "piper"))
        assert result["mime"] == "audio/wav"
        assert result["text"] == "student@example.org"


def test_qsa_redirect_never_forwards_image_or_environment_proxy(monkeypatch):
    seen = []

    def send(client, request, **kwargs):
        seen.append(request)
        assert client.trust_env is False
        assert kwargs["allow_redirects"] is False
        assert request.url == "http://127.0.0.1:11434/api/generate"
        response = requests.Response()
        response.status_code = 307
        response.headers["Location"] = "https://external.example/ocr"
        return response

    monkeypatch.setattr(requests.Session, "send", send)
    with pytest.raises(vision_service.VisionError, match="personalAPI.errors.privacy"):
        qsa._ollama_post("http://127.0.0.1:11434", "/api/generate", {"images": ["synthetic"]}, 10)
    assert len(seen) == 1


def test_pqbl_localized_unavailability_is_clear_in_all_six_languages():
    messages = {pqbl.ocr_unavailable_message(language) for language in reader.LANGUAGES}
    assert len(messages) == 6
    assert all("OCR" in message and "PDF" in message for message in messages)
    assert pqbl.ocr_unavailable_message("unknown") == pqbl.ocr_unavailable_message("it")
