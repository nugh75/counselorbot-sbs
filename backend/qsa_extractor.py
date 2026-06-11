"""Estrazione locale dei profili di competenze strategiche con Ollama."""

from __future__ import annotations

import base64
import io
import json
import logging
import os
from pathlib import Path
from typing import Any

import requests
from pdf2image import convert_from_path
from PIL import Image, UnidentifiedImageError

logger = logging.getLogger(__name__)


DEFAULT_OLLAMA_URL = "http://localhost:11434"
DEFAULT_OCR_MODEL = "glm-ocr:latest"
DEFAULT_PARSER_MODEL = "gemma4:e2b"
MAX_PDF_PAGES = 6
QSA_FACTORS = tuple(f"C{index}" for index in range(1, 8)) + tuple(
    f"A{index}" for index in range(1, 8)
)
QUESTIONNAIRE_FACTORS = {
    "QSA": QSA_FACTORS,
    "QSAr": ("C1r", "C2r", "C3r", "C4r", "A1r", "A2r", "A3r", "A4r"),
    "QPCS": ("S1", "S2", "S3", "S4", "S5"),
    "QPCC": ("K1", "K2", "K3", "K4", "K5"),
    "QAP": ("AD1", "AD2", "AD3", "AD4"),
}
SUPPORTED_QUESTIONNAIRES = tuple(QUESTIONNAIRE_FACTORS)
# Backwards-compatible name used by existing imports and tests.
EXPECTED_FACTORS = QSA_FACTORS


def _scores_schema(expected_factors: tuple[str, ...]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            factor: {"type": "integer", "minimum": 1, "maximum": 9}
            for factor in expected_factors
        },
        "required": list(expected_factors),
        "additionalProperties": False,
    }


SCORES_SCHEMA = _scores_schema(QSA_FACTORS)


def _jpeg_base64(image: Image.Image) -> str:
    image_bytes = io.BytesIO()
    image.convert("RGB").save(image_bytes, format="JPEG", quality=92)
    return base64.b64encode(image_bytes.getvalue()).decode("ascii")


def _encode_document_pages(path: Path) -> list[str]:
    if path.suffix.lower() == ".pdf":
        images = convert_from_path(
            str(path),
            dpi=200,
            first_page=1,
            last_page=MAX_PDF_PAGES,
        )
        if not images:
            raise ValueError("Il PDF non contiene pagine leggibili")
        return [_jpeg_base64(image) for image in images]

    try:
        with Image.open(path) as image:
            image.load()
            return [_jpeg_base64(image)]
    except UnidentifiedImageError as exc:
        raise ValueError("Il file non è un'immagine valida") from exc


def _questionnaire_factors(questionnaire_type: str) -> tuple[str, ...]:
    try:
        return QUESTIONNAIRE_FACTORS[questionnaire_type]
    except KeyError as exc:
        supported = ", ".join(SUPPORTED_QUESTIONNAIRES)
        raise ValueError(
            f"Questionario non supportato: {questionnaire_type}. Valori ammessi: {supported}"
        ) from exc


def _validate_scores(
    data: Any,
    expected_factors: tuple[str, ...] = EXPECTED_FACTORS,
) -> dict[str, int]:
    if not isinstance(data, dict):
        raise ValueError("La risposta estratta non è un oggetto JSON")

    scores: dict[str, int] = {}
    for factor in expected_factors:
        value = data.get(factor)
        if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 9:
            raise ValueError(f"Punteggio non valido o mancante per {factor}")
        scores[factor] = value
    return scores


def _ollama_post(ollama_url: str, endpoint: str, payload: dict[str, Any], timeout: int) -> dict[str, Any]:
    try:
        response = requests.post(
            f"{ollama_url.rstrip('/')}{endpoint}",
            json=payload,
            timeout=timeout,
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        raise RuntimeError(f"Ollama non raggiungibile o richiesta fallita: {exc}") from exc
    except requests.JSONDecodeError as exc:
        raise RuntimeError("Ollama ha restituito una risposta non valida") from exc

    if data.get("error"):
        raise RuntimeError(f"Errore Ollama: {data['error']}")
    return data


def _run_ocr(
    images: list[str],
    ollama_url: str,
    ocr_model: str,
    questionnaire_type: str,
    expected_factors: tuple[str, ...],
) -> str:
    factor_list = ", ".join(expected_factors)
    pages: list[str] = []
    for page_number, image in enumerate(images, start=1):
        data = _ollama_post(
            ollama_url,
            "/api/generate",
            {
                "model": ocr_model,
                "prompt": (
                    "Text Recognition. Trascrivi fedelmente tutto il testo e tutte le tabelle "
                    f"visibili del profilo {questionnaire_type}. Mantieni chiaramente associate "
                    f"le sigle {factor_list} ai rispettivi punteggi. "
                    "Non interpretare e non omettere valori."
                ),
                "images": [image],
                "stream": False,
                "options": {"temperature": 0},
            },
            timeout=240,
        )
        text = data.get("response")
        if isinstance(text, str) and text.strip():
            pages.append(f"--- PAGINA {page_number} ---\n{text.strip()}")

    if not pages:
        raise ValueError("L'OCR non ha trovato testo nel documento")
    return "\n\n".join(pages)


def _parse_scores(
    ocr_text: str,
    ollama_url: str,
    parser_model: str,
    questionnaire_type: str,
    expected_factors: tuple[str, ...],
) -> dict[str, int]:
    factor_list = ", ".join(expected_factors)
    data = _ollama_post(
        ollama_url,
        "/api/chat",
        {
            "model": parser_model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        f"Estrai esclusivamente i punteggi del profilo {questionnaire_type}: "
                        f"{factor_list}. "
                        "Ogni valore deve essere un intero da 1 a 9. Non calcolare, "
                        "non correggere e non inventare valori mancanti."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Estrai {factor_list} dal seguente testo OCR e restituisci "
                        f"solo il JSON conforme allo schema:\n\n{ocr_text}"
                    ),
                },
            ],
            "stream": False,
            "format": _scores_schema(expected_factors),
            "options": {"temperature": 0},
        },
        timeout=180,
    )
    content = data.get("message", {}).get("content")
    if not isinstance(content, str):
        raise ValueError("Gemma non ha restituito i punteggi")
    return _validate_scores(json.loads(content), expected_factors)


def _run_openrouter_fallback(
    images: list[str],
    questionnaire_type: str,
    expected_factors: tuple[str, ...],
) -> dict[str, int]:
    api_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("API_KEY_OPENROUTER")
    if not api_key:
        raise ValueError("Missing OpenRouter API key for fallback")

    if not images:
        raise ValueError("No pages available to process")

    # Use the first page for the score table extraction
    encoded_image = images[0]

    response = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://counselorbot.ai",
            "X-Title": "CounselorBot",
        },
        json={
            "model": "google/gemini-2.5-flash-lite-preview-09-2025",
            "messages": [{
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            f"Extract the scores for the factors {', '.join(expected_factors)} "
                            f"from this {questionnaire_type} profile page. "
                            "Return ONLY a raw JSON object whose keys are the factor names and whose values are integers from 1 to 9. "
                            "Do not include any explanation or markdown formatting."
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{encoded_image}"},
                    },
                ],
            }],
        },
        timeout=60,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"].strip()
    if content.startswith("```json"):
        content = content[7:]
    elif content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    return _validate_scores(json.loads(content.strip()), expected_factors)


def extract_questionnaire_data(
    file_path: str,
    *,
    questionnaire_type: str = "QSA",
    ollama_url: str | None = None,
    ocr_model: str | None = None,
    parser_model: str | None = None,
) -> dict[str, int] | dict[str, str]:
    """Estrae e valida un profilo provando prima localmente con Ollama, poi con fallback OpenRouter."""
    path = Path(file_path)
    if not path.exists():
        return {"error": f"File non trovato: {file_path}"}

    resolved_url = ollama_url or os.getenv("OLLAMA_BASE_URL") or DEFAULT_OLLAMA_URL
    resolved_ocr_model = ocr_model or os.getenv("QSA_OCR_MODEL") or DEFAULT_OCR_MODEL
    resolved_parser_model = parser_model or os.getenv("QSA_PARSER_MODEL") or DEFAULT_PARSER_MODEL

    try:
        expected_factors = _questionnaire_factors(questionnaire_type)
        images = _encode_document_pages(path)
        
        try:
            logger.info("Tento l'estrazione locale del questionario con Ollama...")
            ocr_text = _run_ocr(
                images,
                resolved_url,
                resolved_ocr_model,
                questionnaire_type,
                expected_factors,
            )
            return _parse_scores(
                ocr_text,
                resolved_url,
                resolved_parser_model,
                questionnaire_type,
                expected_factors,
            )
        except Exception as local_exc:
            logger.warning(f"Estrazione locale QSA fallita ({local_exc}). Tento fallback su OpenRouter...")
            return _run_openrouter_fallback(images, questionnaire_type, expected_factors)
            
    except Exception as exc:
        logger.error(f"Errore durante l'estrazione del profilo: {exc}")
        return {"error": str(exc)}


def extract_qsa_data(
    file_path: str,
    *,
    ollama_url: str | None = None,
    ocr_model: str | None = None,
    parser_model: str | None = None,
) -> dict[str, int] | dict[str, str]:
    """Wrapper compatibile per l'estrazione del profilo QSA."""
    return extract_questionnaire_data(
        file_path,
        questionnaire_type="QSA",
        ollama_url=ollama_url,
        ocr_model=ocr_model,
        parser_model=parser_model,
    )
