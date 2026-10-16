"""Ripiego OCR tramite un provider di visione configurabile (solo chiavi di sistema).

L'estrazione da PDF/immagine del profilo prova prima l'OCR locale Ollama; se non
c'e' Ollama (installazione portabile) usa il provider scelto dall'amministratore
con `vision_provider`/`vision_model`. Nessun modello e' cablato: senza provider,
senza modello o con provider non supportato il servizio solleva un `VisionError`
classificato che il chiamante traduce per l'utente.

La policy privacy esterna NON e' qui: `AIService.call_vision` fa passare il
prompt da `_anonymize_external` (con `block` compreso) prima di chiamare `call`.
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

logger = logging.getLogger(__name__)

#: Provider di visione riconosciuti: gli stessi SDK gia' presenti per la chat.
#: `none` disattiva il ripiego esterno (resta solo l'OCR locale Ollama).
PROVIDERS = {"openai", "openrouter", "mistral", "gemini", "ollama", "none"}
#: Provider locali: nessuna chiave di sistema e nessun confine di privacy.
LOCAL_PROVIDERS = {"ollama"}

CONFIG_DEFINITIONS = [
    (
        "vision_provider",
        "none",
        "Provider di visione per l'OCR di ripiego di profili questionario: none, openai, openrouter, mistral, gemini, ollama. "
        "Nessun modello e' predefinito: il provider locale Ollama resta il primo tentativo.",
    ),
    (
        "vision_model",
        "",
        "Modello di visione del provider scelto (es. openai/gpt-4.1-mini, google/gemini-2.5-flash, pixtral-12b-2409). Vuoto = nessun ripiego esterno.",
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
) -> str:
    """Riconosce una pagina immagine e restituisce il testo del modello.

    Il testo (`prompt`) arriva gia' filtrato da `AIService.call_vision`. Errori di
    trasporto e risposte vuote diventano `VisionError` senza esporre chiavi, URL o
    corpi di risposta."""
    if provider not in PROVIDERS or provider == "none":
        raise VisionError("vision_unsupported_provider")
    if not isinstance(image_base64, str) or not image_base64:
        raise VisionError("vision_invalid_response")
    timeout = timeout or max(30, min(600, int(config.get("ai_timeout_seconds") or 120)))
    key = None
    if provider not in LOCAL_PROVIDERS:
        # Solo chiave di sistema: una connessione personale non riscrive config qui.
        key = resolve_api_secret(db, provider).value
        if not key:
            raise VisionError("vision_missing_key")

    client: Any
    try:
        if provider == "ollama":
            base = (config.get("ollama_ip") or "http://localhost:11434").rstrip("/")
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
