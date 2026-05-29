"""Estrazione dei punteggi QSA da immagini o PDF tramite OpenRouter Vision."""

from __future__ import annotations

import base64
import io
import json
import os
from pathlib import Path
from typing import Any

import requests
from pdf2image import convert_from_path


API_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "google/gemini-2.5-flash-lite-preview-09-2025"
EXPECTED_FACTORS = tuple(f"C{index}" for index in range(1, 8)) + tuple(
    f"A{index}" for index in range(1, 8)
)


def _encode_image(path: Path) -> str:
    if path.suffix.lower() == ".pdf":
        images = convert_from_path(str(path), first_page=1, last_page=1)
        if not images:
            raise ValueError("No images extracted from PDF")
        image_bytes = io.BytesIO()
        images[0].save(image_bytes, format="JPEG")
        return base64.b64encode(image_bytes.getvalue()).decode("ascii")

    return base64.b64encode(path.read_bytes()).decode("ascii")


def _validate_scores(data: Any) -> dict[str, int]:
    if not isinstance(data, dict):
        raise ValueError("The extracted response is not a JSON object")

    scores: dict[str, int] = {}
    for factor in EXPECTED_FACTORS:
        value = data.get(factor)
        if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 9:
            raise ValueError(f"Invalid or missing score for {factor}")
        scores[factor] = value
    return scores


def extract_qsa_data(file_path: str) -> dict[str, int] | dict[str, str]:
    """Extract and validate the 14 expected QSA factor scores."""
    path = Path(file_path)
    if not path.exists():
        return {"error": f"File not found: {file_path}"}

    api_key = os.getenv("API_KEY_OPENROUTER") or os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        return {"error": "Missing OpenRouter API key"}

    try:
        encoded_image = _encode_image(path)
        response = requests.post(
            API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://counselorbot.ai",
                "X-Title": "CounselorBot",
            },
            json={
                "model": MODEL,
                "messages": [{
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Extract scores C1-C7 and A1-A7 from this QSA profile. "
                                "Return only a JSON object whose 14 integer values are between 1 and 9."
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{encoded_image}"},
                        },
                    ],
                }],
            },
            timeout=90,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"].strip()
        if content.startswith("```json"):
            content = content[7:]
        elif content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        return _validate_scores(json.loads(content.strip()))
    except (OSError, ValueError, KeyError, IndexError, json.JSONDecodeError) as exc:
        return {"error": f"Invalid extraction response: {exc}"}
    except requests.RequestException as exc:
        return {"error": f"Extraction request failed: {exc}"}
