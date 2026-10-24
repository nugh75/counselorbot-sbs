"""AI gateway (P6): fail-closed pipeline and end-to-end egress on a simulated HTTP transport.

No real provider, socket or personal data: synthetic corpus P2, a fake OpenAI
endpoint behind ``httpx.HTTPTransport`` that refuses every other host, and the
P4 engine whose ML layer returns the corpus annotations (detector quality is
measured by P3/P4; here every value it finds must stay inside the backend).
"""
from __future__ import annotations

import json
import logging
import re
import socket
from types import SimpleNamespace

import httpx
import pytest

from backend import pii, pii_ner, vision_service
from backend.ai_service import AIError, AIService
from backend.privacy import gateway as gw
from backend.privacy import policy
from backend.privacy import types as t
from backend.privacy.corpus.benchmark import load_corpus
from backend.privacy.detect import LocalPIIDetector
from backend.privacy.errors import (
    AccessDenied, AuditUnavailable, EgressBlockedError, PIIDetectorUnavailable, PurposeDisabledError,
    ResidualPII,
)
from backend.privacy.pseudonymization import PseudonymizationEngine
from backend.routes import voice_reader

SECRET = "mario.rossi@example.com"
EXTERNAL = t.Target("openai", "synthetic", "https://api.openai.com/v1")
LOCAL = t.Target("ollama", "synthetic", "http://127.0.0.1:11434")
CTX = gw.context_for("stud1")
ACTIVE = t.PurposePolicy("guided_chat", True, t.LegalBasis.PUBLIC_TASK, False)
CORPUS = [row for row in load_corpus() if row["entities"]]


class CorpusML:
    """ML layer of the real LocalPIIDetector that knows the corpus annotations."""

    name = "ml"

    def __init__(self, rows):
        self.values = {(e["text"], t.PIICategory(e["category"])) for row in rows for e in row["entities"]}

    def detect_pii(self, text, ctx):
        spans = []
        for value, category in self.values:
            start = text.find(value)
            while start >= 0:
                spans.append(t.PIISpan(start, start + len(value), category, score=0.9, detector="ml"))
                start = text.find(value, start + 1)
        return spans


@pytest.fixture
def strict(monkeypatch):
    """Every step configured and allowed; events captured."""
    events = []
    monkeypatch.setenv("PRIVACY_GATEWAY_MODE", "strict")
    monkeypatch.setattr(gw, "_no_purposes", lambda ctx: (ACTIVE, False))
    monkeypatch.setattr(gw, "_no_pid", lambda subject: "pid-" + str(len(subject)))
    monkeypatch.setattr(policy, "authorize_data_access", lambda *a: t.Decision(True, "ok"))
    monkeypatch.setattr(policy, "record_privacy_event", events.append)
    policy.configure_engine(PseudonymizationEngine(LocalPIIDetector(CorpusML(CORPUS))))
    yield events
    policy.configure_engine(None)


@pytest.fixture
def transitional(monkeypatch):
    monkeypatch.setenv("PRIVACY_GATEWAY_MODE", "transitional")
    policy.configure_engine(None)
    return {"pii_ner_enabled": "false"}


def echo(request):
    return " | ".join(request.texts + list(request.attachments_context))


# ---------------------------------------------------------------- pipeline


def test_without_transport_nothing_is_sent():
    with pytest.raises(EgressBlockedError):
        gw.AIGateway().send(t.AIRequest("chat", EXTERNAL, [SECRET]), CTX)


@pytest.mark.parametrize("override,error", [
    ({"purposes": lambda ctx: (None, False)}, PurposeDisabledError),
    ({"purposes": lambda ctx: (t.PurposePolicy("guided_chat", True), False)}, PurposeDisabledError),
    ({"authorize": lambda *a: t.Decision()}, AccessDenied),
    ({"audit": lambda event: (_ for _ in ()).throw(AuditUnavailable())}, AuditUnavailable),
])
def test_strict_steps_block_before_the_transport(strict, override, error):
    sent = []
    gateway = gw.AIGateway(transport=lambda r: sent.append(r) or "ok", **override)
    with pytest.raises(error) as caught:
        gateway.send(t.AIRequest("chat", EXTERNAL, [SECRET]), CTX)
    assert sent == [] and SECRET not in repr(caught.value)


def test_strict_external_text_requires_the_p4_engine(strict):
    policy.configure_engine(None)
    with pytest.raises(PIIDetectorUnavailable):
        gw.AIGateway(transport=echo).send(t.AIRequest("chat", EXTERNAL, [SECRET]), CTX)


def test_strict_pseudonymizes_records_counts_and_restores(strict):
    sent = []
    row = CORPUS[0]
    value = row["entities"][0]["text"]

    def transport(request):
        sent.append(request)
        return "Ciao " + request.texts[0]

    reply = gw.AIGateway(transport=transport).send(
        t.AIRequest("chat", EXTERNAL, [row["text"], "system"], attachments_context=[row["text"]]), CTX)
    assert value not in echo(sent[0]) and "[PERSONA_1]" in sent[0].texts[0]
    assert sent[0].attachments_context[0] == sent[0].texts[0]  # one map for message and history
    assert reply.text == "Ciao " + row["text"]
    [event] = strict
    assert event.event_type == "ai_transmission" and event.target == "openai"
    assert dict(event.categories_count) == {"person": 2}
    assert value not in repr(event) and "stud1" not in str(vars(event))


def test_reply_keeps_placeholders_when_restore_is_not_authorized(strict, monkeypatch):
    monkeypatch.setattr(policy._ENGINE, "authorize", lambda ctx: t.Decision())
    row = CORPUS[0]
    reply = gw.AIGateway(transport=lambda r: r.texts[0]).send(t.AIRequest("chat", EXTERNAL, [row["text"]]), CTX)
    assert "[PERSONA_1]" in reply.text and row["entities"][0]["text"] not in reply.text


def test_streamed_reply_is_restored_across_chunk_boundaries(strict):
    row = CORPUS[0]

    def transport(request):
        text = request.texts[0]
        return (text[i:i + 3] for i in range(0, len(text), 3))

    chunks = list(gw.AIGateway(transport=transport).send(t.AIRequest("chat_stream", EXTERNAL, [row["text"]]), CTX))
    assert all(isinstance(chunk, t.AIChunk) for chunk in chunks)
    assert "".join(chunk.text for chunk in chunks) == row["text"]


def test_transitional_mode_counts_unenforced_steps_and_still_filters(transitional, caplog):
    sent = []
    caplog.set_level(logging.DEBUG)
    gateway = gw.AIGateway(transitional, transport=lambda r: sent.append(r) or r.texts[0])
    reply = gateway.send(t.AIRequest("chat", EXTERNAL, [f"Scrivi a {SECRET}"]), CTX)
    assert SECRET not in echo(sent[0]) and reply.text == f"Scrivi a {SECRET}"
    report = gw.shadow_report()
    assert {"purpose:privacy.errors.purpose_disabled", "authorization:privacy.errors.access_denied",
            "audit:privacy.errors.key_unavailable"} <= set(report)
    assert SECRET not in caplog.text


def test_unknown_mode_is_strict(monkeypatch):
    monkeypatch.setenv("PRIVACY_GATEWAY_MODE", "off")
    assert gw.mode() == "strict" and gw.AIGateway().mode == "strict"


@pytest.mark.parametrize("host,local", [
    ("http://127.0.0.1:11434", True), ("http://localhost:11434", True), ("::1", True),
    ("http://192.168.1.20:11434", False), ("http://ollama:11434", False), ("", False),
])
def test_target_is_classified_by_host_never_by_provider_name(host, local):
    assert gw.is_local(t.Target("ollama", "m", host)) is local


def test_declared_local_host_skips_the_external_filter(transitional, monkeypatch):
    target = t.Target("ollama", "m", "http://gpu.school.lan:11434")
    sent = []
    gateway = gw.AIGateway(transitional, transport=lambda r: sent.append(r) or "ok")
    gateway.send(t.AIRequest("chat", target, [SECRET]), CTX)
    monkeypatch.setenv("PRIVACY_LOCAL_HOSTS", "gpu.school.lan")
    gateway.send(t.AIRequest("chat", target, [SECRET]), CTX)
    assert SECRET not in sent[0].texts[0] and sent[1].texts[0] == SECRET


@pytest.mark.parametrize("kind", ["vision", "ocr", "transcription", "chat"])
@pytest.mark.parametrize("media", [{"images": [b"img"]}, {"audio": b"wav"}, {"audio": b""}])
def test_images_and_audio_never_reach_an_external_target(transitional, kind, media):
    sent = []
    gateway = gw.AIGateway(transitional, transport=lambda r: sent.append(r) or "ok")
    with pytest.raises(EgressBlockedError):
        gateway.send(t.AIRequest(kind, EXTERNAL, ["prompt"], **media), CTX)
    assert gateway.send(t.AIRequest(kind, LOCAL, ["prompt"], **media), CTX).text == "ok"
    assert len(sent) == 1


def test_residual_pii_after_a_caller_filter_blocks(transitional):
    gateway = gw.AIGateway(transitional, transport=echo, text_filter=lambda texts: texts)
    with pytest.raises(ResidualPII):
        gateway.send(t.AIRequest("embedding", EXTERNAL, [SECRET]), CTX)


def test_public_content_is_only_for_embeddings(transitional):
    request = t.AIRequest("embedding", EXTERNAL, [SECRET])
    prepared = gw.AIGateway(transitional, public_content=True).prepare(request, CTX)
    assert prepared.request.texts == [SECRET]
    with pytest.raises(EgressBlockedError):
        gw.AIGateway(transitional, public_content=True).prepare(t.AIRequest("chat", EXTERNAL, [SECRET]), CTX)


def test_tts_is_redacted_and_notify_is_delivered_to_the_subject(transitional):
    spoken = gw.AIGateway(transitional).prepare(t.AIRequest("tts", EXTERNAL, [SECRET]), CTX)
    assert SECRET not in spoken.request.texts[0] and spoken.counts == {"email": 1}
    notify = gw.AIGateway(transitional).prepare(
        t.AIRequest("notify", t.Target("telegram", "", "https://api.telegram.org"), [SECRET], images=[b"png"]), CTX)
    assert notify.request.texts == [SECRET] and notify.counts == {"email": 1}


def test_non_text_payloads_are_refused(transitional):
    with pytest.raises(EgressBlockedError):
        gw.AIGateway(transitional).prepare(t.AIRequest("chat", EXTERNAL, [{"text": SECRET}]), CTX)


def test_remote_ner_detector_blocks_instead_of_receiving_the_text(monkeypatch):
    monkeypatch.setenv("PRIVACY_GATEWAY_MODE", "transitional")
    config = {"ollama_ip": "http://203.0.113.4:11434", "pii_ner_enabled": "true"}
    with pytest.raises(PIIDetectorUnavailable):
        gw.AIGateway(config, transport=echo).send(t.AIRequest("chat", EXTERNAL, [SECRET]), CTX)


# ------------------------------------------------- end to end, simulated HTTP


class FakeOpenAI:
    """Only api.openai.com answers; bodies captured as decoded JSON strings."""

    def __init__(self):
        self.bodies, self.hosts = [], []

    def __call__(self, http, request):
        """``http``: httpx or the httpx2 fork that recent OpenAI SDKs use."""
        self.hosts.append(request.url.host)
        if request.url.host != "api.openai.com":
            raise http.ConnectError("network denied in tests")
        body = json.loads(request.content)
        self.bodies.append(body)
        echo_text = body["messages"][-1]["content"]
        if body.get("stream"):
            events = "".join(
                "data: " + json.dumps({"id": "c", "object": "chat.completion.chunk", "created": 0, "model": "m",
                                       "choices": [{"index": 0, "delta": {"content": echo_text[i:i + 4]},
                                                    "finish_reason": None}]}) + "\n\n"
                for i in range(0, len(echo_text), 4))
            events += "data: " + json.dumps({"id": "c", "object": "chat.completion.chunk", "created": 0, "model": "m",
                                             "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]})
            events += "\n\ndata: [DONE]\n\n"
            return http.Response(200, text=events, headers={"content-type": "text/event-stream"})
        return http.Response(200, json={
            "id": "c", "object": "chat.completion", "created": 0, "model": "m",
            "choices": [{"index": 0, "finish_reason": "stop",
                         "message": {"role": "assistant", "content": echo_text}}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}})

    def strings(self):
        out = []

        def walk(value):
            if isinstance(value, str):
                out.append(value)
            elif isinstance(value, dict):
                for item in value.values():
                    walk(item)
            elif isinstance(value, list):
                for item in value:
                    walk(item)
        for body in self.bodies:
            walk(body)
        return "\n".join(out)


@pytest.fixture
def wire(monkeypatch):
    fake = FakeOpenAI()
    modules = [httpx]
    try:
        import httpx2
        modules.append(httpx2)
    except ImportError:
        pass
    for http in modules:
        monkeypatch.setattr(http.HTTPTransport, "handle_request",
                            lambda self, request, http=http: fake(http, request))

        async def denied(self, request, http=http):
            raise http.ConnectError("network denied in tests")
        monkeypatch.setattr(http.AsyncHTTPTransport, "handle_async_request", denied)

    # Last line of defence: no socket may leave the machine in this test.
    real_connect = socket.socket.connect

    def connect(sock, address):
        if not (isinstance(address, tuple) and address[0] in ("127.0.0.1", "::1", "localhost")):
            raise OSError("network denied in tests")
        return real_connect(sock, address)
    monkeypatch.setattr(socket.socket, "connect", connect)
    return fake


def service(monkeypatch, **extra):
    monkeypatch.setattr(AIService, "_load_config", lambda self: {
        "active_provider": "openai", "model_name": "gpt-4o", "api_key_openai": "sk-synthetic",
        "ai_fallback_targets": "[]", "pii_ner_enabled": "false", **extra})
    ai = AIService(None)  # no personal connection lookup without a database
    ai.privacy_username = "stud1"
    monkeypatch.setattr(ai, "_record_completion", lambda *a, **k: None)
    monkeypatch.setattr(ai, "_attempt_report", lambda *a, **k: None)
    return ai


def leaked(rows, wire_text):
    return sorted({e["text"] for row in rows for e in row["entities"]
                   if len(e["text"]) >= 4 and e["text"] in wire_text})


SPECIAL = {"health", "art9_other"}  # blocked towards external targets by default (02 §3.5)
ALLOWED_ROWS = [row for row in CORPUS if not {e["category"] for e in row["entities"]} & SPECIAL]
SPECIAL_ROWS = [row for row in CORPUS if {e["category"] for e in row["entities"]} & SPECIAL]
NUMBERED = re.compile(r"\[[A-ZÀ-Þ]+(?:_[A-ZÀ-Þ]+)*_\d+\]")


def envelope(rows):
    message = "\n".join(row["text"] for row in rows[::2])
    system = "Contesto della classe:\n" + "\n".join(row["text"] for row in rows[1::2])
    history = [{"role": "user", "content": row["text"]} for row in rows[:5]]
    return message, system, history


@pytest.mark.parametrize("rows", [ALLOWED_ROWS[i:i + 40] for i in range(0, len(ALLOWED_ROWS), 40)],
                         ids=lambda rows: rows[0]["id"])
def test_no_corpus_value_reaches_the_provider_in_clear(strict, wire, monkeypatch, rows):
    ai = service(monkeypatch)
    message, system, history = envelope(rows)
    reply = ai.get_response(message, system, "generic", history=history)
    streamed = "".join(item["text"] for item in ai.stream_response(message, system, "generic", history=history)
                       if item.get("type") == "content")
    ai.generate_summary(message, "Risposta sintetica", "step")
    assert len(wire.bodies) == 3 and set(wire.hosts) == {"api.openai.com"}
    assert leaked(rows, wire.strings()) == []
    # Restored for the authorized student: only generalized values stay as categories.
    assert not NUMBERED.search(reply) and not NUMBERED.search(streamed)
    assert NUMBERED.search(wire.strings())


@pytest.mark.parametrize("row", SPECIAL_ROWS[:20], ids=lambda row: row["id"])
def test_special_categories_never_leave_towards_an_external_provider(strict, wire, monkeypatch, row):
    ai = service(monkeypatch)
    with pytest.raises(AIError) as caught:
        ai.get_response(row["text"], "system", "generic")
    # The fallback loop wraps the last attempt error.
    assert caught.value.__cause__.code == "personalAPI.errors.privacy" and wire.hosts == []


def test_transitional_rules_values_never_reach_the_provider(transitional, wire, monkeypatch):
    ai = service(monkeypatch)
    rows = [row for row in CORPUS if any(e["category"] in ("email", "iban", "ip", "url") for e in row["entities"])]
    message = "\n".join(row["text"] for row in rows)
    found = {value for row in rows for _kind, value in pii.find_pii(row["text"])}
    assert found
    assert ai.get_response(message, "system", "generic") == message
    wire_text = wire.strings()
    assert [value for value in found if value in wire_text] == []


def test_images_to_external_vision_never_open_a_connection(transitional, wire, monkeypatch):
    config = {"vision_provider": "openai", "vision_model": "gpt-4o", "ollama_ip": "http://127.0.0.1:11434"}
    with pytest.raises(vision_service.VisionError):
        vision_service.call(config, None, "openai", "gpt-4o", SECRET, "aW1hZ2U=")
    assert wire.hosts == []


def test_edge_tts_receives_filtered_text_only(transitional, monkeypatch):
    spoken = []

    class Communicate:
        def __init__(self, text, voice, **kwargs):
            spoken.append(text)

        async def stream(self):
            yield {"type": "audio", "data": b"mp3"}

    monkeypatch.setattr(voice_reader.edge_tts, "Communicate", Communicate)
    import asyncio

    asyncio.run(voice_reader.synthesize({"index": 0, "text": f"Scrivi a {SECRET}"}, "it-IT-IsabellaNeural"))
    assert spoken and SECRET not in spoken[0]


def test_aiservice_maps_gateway_blocks_to_a_localized_error(strict, monkeypatch):
    policy.configure_engine(None)
    with pytest.raises(AIError) as caught:
        service(monkeypatch)._anonymize_external("openai", SECRET, "", [])
    assert caught.value.code == "personalAPI.errors.privacy" and SECRET not in str(caught.value)


def test_external_pii_redact_false_no_longer_disables_the_filter(transitional, wire, monkeypatch):
    ai = service(monkeypatch, external_pii_redact="false")
    assert ai.get_response(f"Scrivi a {SECRET}", "system", "generic") == f"Scrivi a {SECRET}"
    assert SECRET not in wire.strings()


def test_embedding_queries_reach_external_providers_filtered(transitional, monkeypatch):
    seen = []
    monkeypatch.setattr(pii_ner, "anonymize_texts", lambda texts, **k: (
        [text.replace(SECRET, "[[PII:EMAIL:1]]") for text in texts], {"[[PII:EMAIL:1]]": SECRET}, True))
    from backend import embedding_service

    class Client:
        def __init__(self, **kwargs):
            self.embeddings = SimpleNamespace(create=self.create)

        def create(self, **kwargs):
            seen.append(kwargs["input"])
            return SimpleNamespace(data=[SimpleNamespace(embedding=[0.1] * 768) for _ in kwargs["input"]],
                                   usage=SimpleNamespace(prompt_tokens=1))

        def close(self):
            pass

    monkeypatch.setattr(embedding_service, "OpenAI", Client)
    monkeypatch.setattr(embedding_service, "resolve_api_secret", lambda db, provider: SimpleNamespace(value="k"))
    monkeypatch.setattr(embedding_service, "_record_usage", lambda *a, **k: None, raising=False)
    config = {"embedding_provider": "openrouter", "embedding_model": "google/gemini-embedding-2"}
    try:
        embedding_service.embed_texts(config, None, lambda: False, [f"scrivimi a {SECRET}"],
                                      purpose="query", public_corpus=True)
    except embedding_service.EmbeddingError:
        pass  # accounting needs a database; only the transmitted input matters here
    assert seen and SECRET not in str(seen)
