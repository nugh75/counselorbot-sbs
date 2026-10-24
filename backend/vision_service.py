"""Ripiego OCR tramite un modello di visione locale configurabile.

L'estrazione da PDF/immagine del profilo prova prima l'OCR locale Ollama, poi
il modello locale scelto con `vision_provider`/`vision_model`.
Nessun modello e' cablato: senza provider,
senza modello o con provider non supportato il servizio solleva un `VisionError`
classificato che il chiamante traduce per l'utente.

P6a-c: le immagini possono raggiungere solo Ollama su un host locale fidato.
La redazione del prompt non protegge i dati contenuti nell'immagine. Finché
non esiste il consenso persistente P9, nessun override abilita provider esterni.
"""

from __future__ import annotations

import base64
import logging
from collections.abc import Mapping
from typing import Any

import httpx
from mistralai.client import Mistral
from openai import OpenAI
from sqlalchemy.orm import Session

from .api_secrets import resolve_api_secret
from .privacy.errors import PrivacyError
from .privacy.gateway import AIGateway, context_for
from .privacy.policy import is_trusted_local
from .privacy.types import AIRequest, AIResponse, Target

logger = logging.getLogger(__name__)

#: Provider di visione riconosciuti: gli stessi SDK gia' presenti per la chat.
#: `none` disattiva il ripiego esterno (resta solo l'OCR locale Ollama).
PROVIDERS = {"openai", "openrouter", "mistral", "gemini", "ollama", "none"}
#: Provider senza chiave; la fiducia dipende sempre dall'URL.
LOCAL_PROVIDERS = {"ollama"}

CONFIG_DEFINITIONS = [
    (
        "vision_provider",
        "none",
        "Provider di visione per l'OCR di ripiego di profili questionario: none, openai, openrouter, mistral, gemini, ollama. "
        "P6a-c: utilizzabile solo Ollama su host locale fidato; provider esterni bloccati in attesa del consenso P9.",
    ),
    (
        "vision_model",
        "",
        "Modello di visione Ollama installato sull'host fidato. Vuoto = nessun ripiego OCR.",
    ),
]


class VisionError(Exception):
    """Errore classificato del ripiego vision (nessun dettaglio di trasporto)."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def validate_config(key: str, value: str):
    if key == "vision_provider" and (value or "").strip().lower() not in PROVIDERS:
        raise ValueError("Unknown vision provider")
    if key == "vision_model" and len(value or "") > 200:
        raise ValueError("Vision model name too long")


def resolve(config: Mapping, provider: str | None = None, model: str | None = None) -> tuple[str, str]:
    """Risolve (provider, model) dalla configurazione, con override esplicito.

    Solleva `VisionError` con un codice stabile quando il ripiego esterno non e'
    utilizzabile; non legge mai chiavi personali (solo `resolve_api_secret`)."""
    resolved_provider = (provider or config.get("vision_provider") or "none").strip().lower()
    resolved_model = (model if model is not None else config.get("vision_model") or "").strip()
    if resolved_provider == "none":
        raise VisionError("vision_not_configured")
    if resolved_provider not in PROVIDERS:
        raise VisionError("vision_unsupported_provider")
    if not resolved_model:
        raise VisionError("vision_model_missing")
    return resolved_provider, resolved_model


def _data_url(image_base64: str) -> str:
    return f"data:image/jpeg;base64,{image_base64}"


def require_local_target(config: Mapping, provider: str) -> None:
    """Enforce the image boundary before SDK creation or any network call."""
    base = config.get("ollama_ip") or "http://localhost:11434"
    if provider != "ollama" or not is_trusted_local(base):
        raise VisionError("personalAPI.errors.privacy")


def _content_blocks(prompt: str, image_base64: str) -> list[dict[str, Any]]:
    return [
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": {"url": _data_url(image_base64)}},
    ]


def call(
    config: Mapping,
    db: Session,
    provider: str,
    model: str,
    prompt: str,
    image_base64: str,
    *,
    timeout: int | None = None,
    ctx=None,
) -> str:
    """Riconosce una pagina immagine e restituisce il testo del modello.

    Prompt e immagine passano dal gateway AI (`kind="vision"`, P6): immagini
    verso host non fidati bloccate, prompt filtrato. Errori di trasporto e
    risposte vuote diventano `VisionError` senza esporre chiavi, URL o corpi
    di risposta."""
    if provider not in PROVIDERS or provider == "none":
        raise VisionError("vision_unsupported_provider")
    require_local_target(config, provider)
    if not isinstance(image_base64, str) or not image_base64:
        raise VisionError("vision_invalid_response")
    timeout = timeout or max(30, min(600, int(config.get("ai_timeout_seconds") or 120)))
    key = None
    if provider not in LOCAL_PROVIDERS:
        # Solo chiave di sistema: una connessione personale non riscrive config qui.
        key = resolve_api_secret(db, provider).value
        if not key:
            raise VisionError("vision_missing_key")

    def transport(request: AIRequest) -> str:
        prompt = request.texts[0]
        client: Any
        if provider == "ollama":
            response = httpx.post(
                f"{base}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "images": [image_base64],
                    "stream": False,
                    "options": {"temperature": 0},
                },
                timeout=timeout,
                follow_redirects=False,
                trust_env=False,
            )
            response.raise_for_status()
            text = response.json().get("response")
        elif provider == "gemini":
            from google import genai
            from google.genai import types

            client = genai.Client(
                api_key=key, http_options=types.HttpOptions(timeout=timeout * 1000)
            )
            # `Any`: la lista tipizzata di `types.Content` non rientra nel
            # `Sequence` invariante atteso da `generate_content` (come in ai_service).
            contents: Any = [
                types.Content(role="user", parts=[
                    types.Part.from_text(text=prompt),
                    types.Part.from_bytes(
                        data=base64.b64decode(image_base64), mime_type="image/jpeg"
                    ),
                ])
            ]
            result = client.models.generate_content(
                model=model,
                contents=contents,
                config=types.GenerateContentConfig(temperature=0),
            )
            text = result.text
        elif provider == "mistral":
            client = Mistral(api_key=key, timeout_ms=timeout * 1000)
            try:
                result = client.chat.complete(
                    model=model,
                    messages=[{"role": "user", "content": _content_blocks(prompt, image_base64)}],
                    temperature=0,
                )
                text = result.choices[0].message.content
            finally:
                client.__exit__(None, None, None)
        else:  # openai / openrouter: stesso client, base_url diverso
            base_url = "https://openrouter.ai/api/v1" if provider == "openrouter" else None
            client = OpenAI(
                api_key=key, base_url=base_url, timeout=float(timeout), max_retries=0
            )
            try:
                response = client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": _content_blocks(prompt, image_base64)}],
                    temperature=0,
                )
                text = response.choices[0].message.content
            finally:
                client.close()
        # Not text (None, a list): an invalid response, not a privacy block.
        return text if isinstance(text, str) else ""

    base = (config.get("ollama_ip") or "http://localhost:11434").rstrip("/") if provider == "ollama" else ""
    # The gateway checks presence and destination of the image, not its bytes.
    request = AIRequest("vision", Target(provider, model, base), [prompt],
                        images=[image_base64.encode("ascii")])
    try:
        reply = AIGateway(config, transport=transport).send(request, ctx or context_for(None))
        text = reply.text if isinstance(reply, AIResponse) else ""
    except PrivacyError:
        raise VisionError("personalAPI.errors.privacy") from None
    except VisionError:
        raise
    except Exception as exc:
        code = (
            "vision_timeout"
            if isinstance(exc, (TimeoutError, httpx.TimeoutException))
            or "timeout" in type(exc).__name__.lower()
            else "vision_unavailable"
        )
        logger.warning("Vision provider %s failed (%s)", provider, type(exc).__name__)
        raise VisionError(code) from None
    if not isinstance(text, str) or not text.strip():
        raise VisionError("vision_invalid_response")
    return text
