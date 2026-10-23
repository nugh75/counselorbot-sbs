"""Local LLM servers (F1-12): optional OpenAI-compatible key and detection.

Fake HTTP transport only: a real network call fails the test.
"""
import asyncio

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, database, local_llm
from backend.ai_service import AIService
from backend.routes import local_llm as local_llm_routes

SECRET = "sk-local-server-0123456789"
MODELS = {"object": "list", "data": [{"id": "qwen3:4b"}, {"id": "nomic-embed-text"}, {"id": "gemma3:4b"}]}


@pytest.fixture(autouse=True)
def no_key(monkeypatch):
    for name in local_llm.LLAMACPP_KEY_ENV:
        monkeypatch.delenv(name, raising=False)


def _transport(routes, seen=None):
    """routes: {url prefix: status code or JSON body}; anything else refuses the connection."""
    def handler(request):
        if seen is not None:
            seen.append((str(request.url), request.headers.get("authorization")))
        for prefix, reply in routes.items():
            if str(request.url).startswith(prefix):
                return httpx.Response(reply) if isinstance(reply, int) else httpx.Response(200, json=reply)
        raise httpx.ConnectError("refused", request=request)
    return httpx.MockTransport(handler)


def _detect(config, routes, seen=None, **kwargs):
    kwargs.setdefault("in_docker", False)
    return asyncio.run(local_llm.detect(config, transport=_transport(routes, seen), **kwargs))


def _by_id(result):
    return {server["id"]: server for server in result["servers"]}


def test_openai_base_accepts_bare_host_or_v1():
    assert local_llm.openai_base("http://h:8080/") == "http://h:8080/v1"
    assert local_llm.openai_base("http://h:1234/v1") == "http://h:1234/v1"
    assert local_llm.openai_base(None) == "http://localhost:8080/v1"


def test_docker_tries_host_gateway_first_for_loopback_only():
    assert local_llm.candidate_urls("http://127.0.0.1:11434", True) == [
        "http://host.docker.internal:11434", "http://127.0.0.1:11434"]
    assert local_llm.candidate_urls("http://localhost:1234/v1", True)[0] == "http://host.docker.internal:1234/v1"
    assert local_llm.candidate_urls("http://gpu.school.lan:8000", True) == ["http://gpu.school.lan:8000"]
    assert local_llm.candidate_urls("http://127.0.0.1:11434", False) == ["http://127.0.0.1:11434"]


def test_detects_ollama_and_lmstudio_with_chat_models():
    servers = _by_id(_detect({}, {"http://127.0.0.1:11434/v1/models": MODELS,
                                  "http://127.0.0.1:1234/v1/models": {"data": [{"id": "local-model"}]}}))
    assert servers["ollama"]["status"] == "ok"
    assert servers["ollama"]["models"] == ["gemma3:4b", "qwen3:4b"]  # embedding model left out
    assert servers["ollama"]["config_key"] == "ollama_ip"
    assert servers["ollama"]["config_value"] == "http://127.0.0.1:11434"
    assert servers["lmstudio"] == {**servers["lmstudio"], "status": "ok", "provider": "llamacpp",
                                   "config_key": "llamacpp_url", "config_value": "http://127.0.0.1:1234/v1"}
    assert "custom" not in servers  # nothing configured, nothing typed


def test_missing_servers_are_unreachable_not_errors():
    servers = _by_id(_detect({}, {}))
    assert servers["ollama"]["status"] == servers["lmstudio"]["status"] == "unreachable"
    assert servers["ollama"]["models"] == []


def test_in_docker_reports_the_host_gateway_url_that_answered():
    servers = _by_id(_detect({}, {"http://host.docker.internal:11434/v1/models": MODELS}, in_docker=True))
    assert servers["ollama"]["config_value"] == "http://host.docker.internal:11434"
    assert servers["ollama"]["tried"] == ["http://host.docker.internal:11434", "http://127.0.0.1:11434"]
    assert servers["lmstudio"]["status"] == "unreachable"


def test_configured_server_gets_the_key(monkeypatch):
    monkeypatch.setenv("LLAMACPP_API_KEY", SECRET)
    seen = []
    result = _detect({"llamacpp_url": "http://gpu.school.lan:8000"},
                     {"http://gpu.school.lan:8000/v1/models": MODELS}, seen)
    assert _by_id(result)["custom"]["status"] == "ok"
    assert ("http://gpu.school.lan:8000/v1/models", f"Bearer {SECRET}") in seen
    assert result["api_key"] == {"configured": True, "environment_variable": "LLAMACPP_API_KEY",
                                 "preferred_environment_variable": "LLAMACPP_API_KEY"}
    assert SECRET not in str(result)
    # Ollama and LM Studio never receive the key.
    assert all(auth is None for url, auth in seen if "gpu.school.lan" not in url)


def test_typed_url_never_gets_the_key(monkeypatch):
    monkeypatch.setenv("LLAMACPP_API_KEY", SECRET)
    seen = []
    servers = _by_id(_detect({"llamacpp_url": "http://gpu.school.lan:8000"},
                             {"http://other.example:9000/v1/models": 401}, seen, custom_url="http://other.example:9000"))
    assert servers["custom"]["status"] == "auth_required"
    assert all(auth is None for _, auth in seen)


def test_server_error_is_reported_with_status():
    servers = _by_id(_detect({}, {"http://127.0.0.1:1234/v1/models": 500}))
    assert servers["lmstudio"]["status"] == "error" and servers["lmstudio"]["http_status"] == 500


def _service(config):
    ai = AIService.__new__(AIService)
    ai.config = config
    return ai


def test_llamacpp_client_uses_configured_key_or_placeholder():
    keyed = _service({"llamacpp_url": "http://gpu.school.lan:8000", "api_key_llamacpp": SECRET})._llamacpp_client(5)
    assert keyed.api_key == SECRET and str(keyed.base_url) == "http://gpu.school.lan:8000/v1/"
    # Existing installations without a key keep working as before.
    plain = _service({})._llamacpp_client(5)
    assert plain.api_key == "llamacpp" and str(plain.base_url) == "http://localhost:8080/v1/"


def test_load_config_reads_the_key_from_environment_only(monkeypatch):
    class Query:
        def all(self):
            return [type("Row", (), {"key": "api_key_llamacpp", "value": "from-db"})()]

    class DB:
        def query(self, _model):
            return Query()

    ai = AIService.__new__(AIService)
    ai.db = DB()
    monkeypatch.setattr("backend.ai_service.resolve_api_secrets", lambda _db: {})
    assert "api_key_llamacpp" not in ai._load_config()  # a DB row is never a secret source
    monkeypatch.setenv("API_KEY_LLAMACPP", SECRET)
    assert ai._load_config()["api_key_llamacpp"] == SECRET


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(local_llm_routes, "configured_urls", lambda _db: {"llamacpp_url": "http://gpu.school.lan:8000"})
    calls = []

    async def fake_detect(config, custom_url=None):
        calls.append((config, custom_url))
        return {"servers": []}

    monkeypatch.setattr(local_llm_routes.local_llm, "detect", fake_detect)
    app = FastAPI()
    app.include_router(local_llm_routes.router)
    actor = {"identity": dict(auth._anonymous_identity(), authenticated=True, username="admin", is_admin=True)}
    app.dependency_overrides[database.get_db] = lambda: None
    app.dependency_overrides[auth.get_identity] = lambda: actor["identity"]
    with TestClient(app, headers={"X-Requested-With": "CounselorBot"}) as c:
        c.actor, c.calls = actor, calls
        yield c


def test_route_passes_configured_and_typed_urls(client):
    assert client.post("/admin/local-llm/detect", json={"custom_url": " http://lab:8000 "}).status_code == 200
    assert client.calls == [({"llamacpp_url": "http://gpu.school.lan:8000"}, "http://lab:8000")]
    assert client.post("/admin/local-llm/detect", json={}).status_code == 200
    assert client.calls[-1][1] is None


def test_route_rejects_non_http_urls(client):
    assert client.post("/admin/local-llm/detect", json={"custom_url": "file:///etc/passwd"}).status_code == 422
    assert client.calls == []


def test_route_is_admin_only_and_browser_only(client):
    assert client.post("/admin/local-llm/detect", json={}, headers={"X-Requested-With": ""}).status_code == 403
    client.actor["identity"] = dict(client.actor["identity"], is_admin=False)
    assert client.post("/admin/local-llm/detect", json={}).status_code == 403
    assert client.calls == []
