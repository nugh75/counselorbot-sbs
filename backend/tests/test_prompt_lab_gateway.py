"""The model bridge never exposes arbitrary Ollama or production endpoints."""
import pytest
from fastapi.testclient import TestClient
from backend.prompt_lab import gateway


def test_gateway_rejects_management_endpoints_and_query_forwarding():
    with TestClient(gateway.app) as client:
        for method, path in [('POST','/api/pull'), ('POST','/api/create'), ('DELETE','/api/delete'),
                             ('POST','/admin/config'), ('GET','/api/tags?url=http://example.com')]:
            assert client.request(method,path,json={}).status_code in (404,405)
        assert client.post('/api/chat',json={'model':'qwen','url':'http://example.com'}).status_code == 400


def test_gateway_refuses_public_non_ollama_and_credential_urls(monkeypatch):
    for value in ['https://example.com:11434', 'http://127.0.0.1:8088',
                  'http://user:password@127.0.0.1:11434', 'http://127.0.0.1:11434/admin']:
        monkeypatch.setenv('PROMPT_LAB_OLLAMA_UPSTREAM',value)
        with pytest.raises(ValueError):gateway.upstream()
    monkeypatch.setenv('PROMPT_LAB_OLLAMA_UPSTREAM','http://public.example:11434')
    monkeypatch.setattr(gateway.socket,'getaddrinfo',lambda *a,**k:[(2,1,6,'',('8.8.8.8',11434))])
    with pytest.raises(ValueError):gateway.upstream()


def test_gateway_refuses_cloud_alias_before_sending_messages(monkeypatch):
    import httpx
    from backend.prompt_lab import gateway
    calls = []
    real_client = httpx.AsyncClient
    def handler(request):
        calls.append(request.url.path)
        return httpx.Response(200, json={'remote_model': 'remote', 'remote_host': 'https://remote.invalid', 'details': {'format': 'gguf'}, 'model_info': {'parameter_count': 1}})
    monkeypatch.setattr(gateway, 'upstream', lambda: 'http://127.0.0.1:11434')
    monkeypatch.setattr(gateway.httpx, 'AsyncClient', lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))
    with TestClient(gateway.app) as client:
        reply = client.post('/api/chat', json={'model': 'innocent-alias', 'messages': [{'role': 'user', 'content': 'Synthetic case'}]})
    assert reply.status_code == 400
    assert calls == ['/api/show']
