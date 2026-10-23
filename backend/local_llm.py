"""Local LLM servers: optional key for the OpenAI-compatible provider and detection.

The `llamacpp` provider speaks `/v1/chat/completions`, so it also serves LM Studio,
vLLM, LiteLLM, llama-server and any school server. Its key is a secret: it comes
from the environment only (ai4educ Console «Segreti», or the desktop app keychain),
never from the Config table.

Inside Docker `127.0.0.1` is the container itself: loopback URLs are probed on
`host.docker.internal` first (both compose files map it to the host gateway).
"""
from __future__ import annotations

import asyncio
import os
from urllib.parse import urlsplit, urlunsplit

import httpx

OLLAMA_DEFAULT_URL = "http://127.0.0.1:11434"
LMSTUDIO_DEFAULT_URL = "http://127.0.0.1:1234/v1"
LLAMACPP_DEFAULT_URL = "http://localhost:8080"
LLAMACPP_KEY_ENV = ("LLAMACPP_API_KEY", "API_KEY_LLAMACPP")
LLAMACPP_KEY_CONFIG = "api_key_llamacpp"
DOCKER_HOST = "host.docker.internal"
# Short on purpose: a missing local server must not keep the admin waiting.
PROBE_TIMEOUT = httpx.Timeout(3.0, connect=1.5)
_LOOPBACK = {"localhost", "127.0.0.1", "::1"}


def llamacpp_api_key() -> tuple[str | None, str | None]:
    """(environment variable, value) of the OpenAI-compatible server key, if set."""
    for variable in LLAMACPP_KEY_ENV:
        value = (os.environ.get(variable) or "").strip()
        if value:
            return variable, value
    return None, None


def openai_base(url: str | None) -> str:
    """Accept a bare host or a URL already ending in /v1."""
    base = (url or LLAMACPP_DEFAULT_URL).strip().rstrip("/")
    return base if base.endswith("/v1") else f"{base}/v1"


def running_in_docker() -> bool:
    return os.path.exists("/.dockerenv")


def candidate_urls(url: str, in_docker: bool) -> list[str]:
    """URLs to try for one server: in Docker a loopback host means the host machine."""
    parts = urlsplit(url)
    if not in_docker or parts.hostname not in _LOOPBACK:
        return [url]
    netloc = DOCKER_HOST + (f":{parts.port}" if parts.port else "")
    return [urlunsplit(parts._replace(netloc=netloc)), url]


async def probe(client: httpx.AsyncClient, base_v1: str, api_key: str | None = None) -> dict:
    """GET <base>/models: reachability and model list of an OpenAI-compatible server."""
    from .ai_service import _chat_model

    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    try:
        response = await client.get(f"{base_v1}/models", headers=headers)
    except (httpx.TimeoutException, httpx.TransportError):
        return {"status": "unreachable", "models": []}
    if response.status_code in (401, 403):
        return {"status": "auth_required", "models": []}
    if response.status_code != 200:
        return {"status": "error", "http_status": response.status_code, "models": []}
    try:
        data = response.json().get("data") or []
        models = sorted({m["id"] for m in data if isinstance(m, dict) and _chat_model(m.get("id"))})
    except (ValueError, AttributeError, KeyError, TypeError):
        return {"status": "error", "http_status": 200, "models": []}
    return {"status": "ok", "models": models}


async def _probe_server(client, url: str, in_docker: bool, api_key: str | None) -> dict:
    tried = candidate_urls(url, in_docker)
    result = {}
    for candidate in tried:
        result = await probe(client, openai_base(candidate), api_key)
        if result["status"] != "unreachable":
            return {**result, "url": candidate, "tried": tried}
    return {**result, "url": url, "tried": tried}


def _same_url(left: str | None, right: str | None) -> bool:
    return bool(left and right) and openai_base(left) == openai_base(right)


async def detect(config: dict, custom_url: str | None = None, in_docker: bool | None = None,
                 transport: httpx.AsyncBaseTransport | None = None) -> dict:
    """Probe Ollama, LM Studio and the configured (or given) OpenAI-compatible server."""
    in_docker = running_in_docker() if in_docker is None else in_docker
    configured = (config.get("llamacpp_url") or "").strip() or None
    custom = (custom_url or "").strip() or configured
    variable, key = llamacpp_api_key()
    # The key goes only to the server the installation configured, never to a typed URL.
    custom_key = key if _same_url(custom, configured) else None

    servers = [
        ("ollama", "ollama", "ollama_ip", (config.get("ollama_ip") or OLLAMA_DEFAULT_URL).strip(), None),
        ("lmstudio", "llamacpp", "llamacpp_url", LMSTUDIO_DEFAULT_URL, None),
    ]
    if custom:
        servers.append(("custom", "llamacpp", "llamacpp_url", custom, custom_key))

    async with httpx.AsyncClient(timeout=PROBE_TIMEOUT, transport=transport) as client:
        results = await asyncio.gather(*(
            _probe_server(client, url, in_docker, api_key) for _, _, _, url, api_key in servers
        ))
    detected = []
    for (server_id, provider, config_key, _, _), result in zip(servers, results):
        value = result["url"]
        if server_id == "ollama":
            value = value.rstrip("/").removesuffix("/v1")
        detected.append({"id": server_id, "provider": provider, "config_key": config_key,
                         "config_value": value, **result})
    return {
        "in_docker": in_docker,
        "api_key": {"configured": bool(key), "environment_variable": variable,
                    "preferred_environment_variable": LLAMACPP_KEY_ENV[0]},
        "servers": detected,
    }
