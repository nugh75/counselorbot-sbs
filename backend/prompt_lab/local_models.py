"""The only way out of the laboratory, and it goes to one address.

One gateway, one provider, no fallback. If the chosen model does not answer,
the call fails and the result records the failure: silently answering with a
different model would attribute a prompt's behaviour to a model that never
saw it.

Thinking never comes back. The reasoning channel is dropped and any `<think>`
block inlined in the content is cut before the text leaves this module, so a
leak cannot reach a stored result or the admin page. What the model says
outside its reasoning is the response; nothing else is.
"""
from __future__ import annotations

import os
import re
from typing import Any, Mapping, Sequence

import httpx

GATEWAY_ENV = "PROMPT_LAB_MODEL_URL"
DEFAULT_GATEWAY = "http://prompt-lab-model-gateway:8080"
# The pilot runs Ollama presets. Another provider is not a configuration
# detail: it is a different request path with different isolation.
SUPPORTED_PROVIDERS = ("ollama",)

DEFAULT_TIMEOUT = 120.0
CONNECT_TIMEOUT = 10.0
MAX_RESPONSE_CHARS = 20000

_THINK_BLOCK = re.compile(r"<think\b[^>]*>.*?</think\s*>", re.DOTALL | re.IGNORECASE)
_THINK_OPEN = re.compile(r"<think\b[^>]*>.*\Z", re.DOTALL | re.IGNORECASE)
_THINK_ORPHAN = re.compile(r"\A.*?</think\s*>", re.DOTALL | re.IGNORECASE)


class ModelError(RuntimeError):
    """A call that did not produce a usable answer.

    `transient` decides whether the one allowed retry is spent on it. A
    timeout may be worth another attempt; a refused request is not.
    """

    def __init__(self, message: str, *, transient: bool = False):
        super().__init__(message)
        self.transient = transient


class UnsupportedPreset(ModelError):
    def __init__(self, message: str):
        super().__init__(message, transient=False)


def gateway_url() -> str:
    return (os.getenv(GATEWAY_ENV) or DEFAULT_GATEWAY).rstrip("/")


def strip_thinking(text: str) -> str:
    """Remove reasoning, including a block the model left open when truncated."""
    if not text:
        return ""
    visible = _THINK_BLOCK.sub("", text)
    visible = _THINK_OPEN.sub("", visible)
    if "</think" in visible.lower():
        visible = _THINK_ORPHAN.sub("", visible)
    return re.sub(r"\n{3,}", "\n\n", visible).strip()


class LocalModels:
    """Chat and tag listing against the laboratory's model gateway."""

    def __init__(self, *, base_url: str | None = None, timeout: float = DEFAULT_TIMEOUT,
                 client: httpx.Client | None = None):
        self.base_url = (base_url or gateway_url()).rstrip("/")
        self.timeout = timeout
        self._client = client

    # --- calls --------------------------------------------------------------
    def chat(self, preset: Mapping[str, Any], system: str, user: str,
             history: Sequence[Mapping[str, Any]] = (), *,
             timeout: float | None = None) -> str:
        """One turn on one preset. Returns the visible text, or raises."""
        provider = str(preset.get("provider") or "").strip().lower()
        model = str(preset.get("model") or "").strip()
        if provider not in SUPPORTED_PROVIDERS:
            raise UnsupportedPreset(f"provider {provider or 'unset'!r} is not run in the lab")
        if not model:
            raise UnsupportedPreset("preset carries no model")

        messages: list[dict] = [{"role": "system", "content": system or ""}]
        messages.extend(_history(history))
        if user or not history:
            messages.append({"role": "user", "content": user or ""})

        options: dict[str, Any] = {}
        if preset.get("temperature") is not None:
            options["temperature"] = preset["temperature"]
        if preset.get("max_tokens"):
            options["num_predict"] = int(preset["max_tokens"])

        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": False,
            "think": not bool(preset.get("disable_thinking")),
        }
        if options:
            payload["options"] = options

        body = self._post("/api/chat", payload, timeout)
        message = body.get("message")
        if not isinstance(message, dict):
            raise ModelError("gateway returned no message")
        visible = strip_thinking(str(message.get("content") or ""))
        if body.get("done_reason") == "length" or len(visible) > MAX_RESPONSE_CHARS:
            raise ModelError("the model response exceeded its output limit")
        return visible

    def models(self) -> list[dict]:
        """The tags the gateway serves, name and digest only.

        `latest` does not identify a version. The digest does, which is why it
        goes into the manifest next to the preset.
        """
        body = self._get("/api/tags")
        tags = body.get("models")
        if not isinstance(tags, list):
            return []
        out = []
        for item in tags:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or item.get("model") or "").strip()
            if not name:
                continue
            out.append({"name": name, "digest": str(item.get("digest") or "")})
        return sorted(out, key=lambda row: row["name"])

    def digests(self) -> dict[str, str]:
        """`{tag: digest}`, or an empty map when the gateway will not say."""
        try:
            return {row["name"]: row["digest"] for row in self.models()}
        except ModelError:
            return {}

    # --- transport ----------------------------------------------------------
    def _post(self, path: str, payload: dict, timeout: float | None) -> dict:
        return self._request("POST", path, json=payload, timeout=timeout)

    def _get(self, path: str) -> dict:
        return self._request("GET", path, json=None, timeout=None)

    def _request(self, method: str, path: str, *, json: dict | None,
                 timeout: float | None) -> dict:
        seconds = max(0.001, float(timeout if timeout is not None else self.timeout))
        limit = httpx.Timeout(seconds, connect=min(CONNECT_TIMEOUT, seconds))
        url = f"{self.base_url}{path}"
        try:
            if self._client is not None:
                response = self._client.request(method, url, json=json, timeout=limit, headers={"x-lab-timeout": str(seconds)})
            else:
                response = httpx.request(method, url, json=json, timeout=limit, headers={"x-lab-timeout": str(seconds)}, trust_env=False, follow_redirects=False)
        except httpx.TimeoutException as exc:
            raise ModelError(f"gateway timed out after {seconds:.0f}s", transient=True) from exc
        except httpx.HTTPError as exc:
            raise ModelError(f"gateway unreachable: {type(exc).__name__}", transient=True) from exc
        if response.status_code >= 500:
            raise ModelError(f"gateway returned {response.status_code}", transient=True)
        if response.status_code >= 300:
            raise ModelError(f"gateway refused the request ({response.status_code})")
        try:
            body = response.json()
        except ValueError as exc:
            raise ModelError("gateway returned a body that is not JSON") from exc
        if not isinstance(body, dict):
            raise ModelError("gateway returned an unexpected body")
        return body


def _history(history: Sequence[Mapping[str, Any]]) -> list[dict]:
    turns = []
    for turn in history or ():
        role = str(turn.get("role") or "").strip()
        content = str(turn.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            turns.append({"role": role, "content": content})
    return turns
