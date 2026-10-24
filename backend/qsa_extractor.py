"""Estrazione locale dei profili di competenze strategiche con Ollama."""

from __future__ import annotations

import base64
import io
import json
import logging
import os
from pathlib import Path
from typing import Any, Callable

import requests
from PIL import Image, UnidentifiedImageError

from .pdf_images import render_pdf_pages
from .privacy.policy import is_trusted_local
from .vision_service import VisionError

logger = logging.getLogger(__name__)

DEFAULT_OLLAMA_URL = "http://localhost:11434"
DEFAULT_OCR_MODEL = "glm-ocr:latest"
DEFAULT_PARSER_MODEL = "qwen3.8:latest"
MAX_PDF_PAGES = 6
# Codice restituito quando il ripiego esterno non e' configurato/raggiungibile:
# `routes/chat.py` lo traduce in un messaggio localizzato per l'utente.
VISION_UNAVAILABLE_CODE = "qsa.errors.visionUnavailable"
PRIVACY_BLOCKED_CODE = "personalAPI.errors.privacy"

#: Firma del ripiego: `(prompt, immagine_base64) -> testo del modello`.
#: In produzione e' `AIService.call_vision`; nei test un finto, senza rete.
VisionCall = Callable[[str, str], str]


class VisionUnavailableError(RuntimeError):
    """Nessun provider di visione configurato per il ripiego OCR esterno."""

    code = VISION_UNAVAILABLE_CODE


QSA_FACTORS = tuple(f"C{index}" for index in range(1, 8)) + tuple(
    f"A{index}" for index in range(1, 8)
)
QUESTIONNAIRE_FACTORS = {
    "QSA": QSA_FACTORS,
    "QSAr": ("C1r", "C2r", "C3r", "C4r", "A1r", "A2r", "A3r", "A4r"),
    "QPCS": ("S1", "S2", "S3", "S4", "S5"),
    "QPCC": ("A1", "A2", "A3", "V1", "V2", "C1", "C2", "M1", "M2", "M3"),
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
        images = render_pdf_pages(
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
    logger.info("[Validatore] avvio validazione.")
    if not isinstance(data, dict):
        logger.error("[Validatore] formato della risposta non valido.")
        raise ValueError("La risposta estratta non è un oggetto JSON")

    # Normalizza le chiavi (maiuscolo e senza spazi) per tollerare variazioni dell'LLM
    normalized_data = {}
    for k, v in data.items():
        if isinstance(k, str):
            normalized_data[k.strip().upper()] = v
        else:
            normalized_data[k] = v

    scores: dict[str, int] = {}
    for factor in expected_factors:
        factor_upper = factor.strip().upper()
        value = normalized_data.get(factor_upper)
        
        # Tolleriamo i numeri restituiti come stringhe (es. "5")
        if isinstance(value, str):
            try:
                value = int(value.strip().replace('"', '').replace("'", ""))
            except (ValueError, TypeError):
                pass

        if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 9:
            logger.error("[Validatore] valore non valido.")
            raise ValueError(f"Punteggio non valido o mancante per {factor}")
        scores[factor] = value
    logger.info("[Validatore] validazione completata.")
    return scores


def _ollama_post(ollama_url: str, endpoint: str, payload: dict[str, Any], timeout: int) -> dict[str, Any]:
    if not is_trusted_local(ollama_url):
        raise VisionError(PRIVACY_BLOCKED_CODE)
    try:
        with requests.Session() as client:
            client.trust_env = False
            response = client.post(
                f"{ollama_url.rstrip('/')}{endpoint}", json=payload,
                timeout=timeout, allow_redirects=False,
            )
        if 300 <= response.status_code < 400:
            raise VisionError(PRIVACY_BLOCKED_CODE)
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
    logger.info("[OCR] avvio OCR locale.")
    factor_list = ", ".join(expected_factors)
    pages: list[str] = []
    for page_number, image in enumerate(images, start=1):
        logger.info("[OCR] invio pagina al motore locale.")
        try:
            data = _ollama_post(
                ollama_url,
                "/api/generate",
                {
                    "model": ocr_model,
                    "prompt": (
                        "Text Recognition. Trascrivi fedelmente tutto il testo e tutte le tabelle "
                        f"visibili del profilo {questionnaire_type}. Mantieni chiaramente associate "
                        f"le sigle {factor_list} ai rispettivi punteggi. Non interpretare e non omettere valori. / "
                        f"Faithfully transcribe all text and tables visible on the {questionnaire_type} profile page. "
                        f"Keep the codes {factor_list} clearly associated with their respective scores. "
                        "Do not interpret and do not omit values."
                    ),
                    "images": [image],
                    "stream": False,
                    "options": {"temperature": 0},
                },
                timeout=240,
            )
            text = data.get("response")
            if isinstance(text, str) and text.strip():
                logger.info("[OCR] pagina elaborata.")
                pages.append(f"--- PAGINA {page_number} ---\n{text.strip()}")
            else:
                logger.warning("[OCR] risposta vuota o non valida.")
        except Exception:
            logger.error("[OCR] errore OCR locale.")
            raise

    if not pages:
        logger.error("[OCR] nessun testo leggibile.")
        raise ValueError("L'OCR non ha trovato testo nel documento")
    
    combined_text = "\n\n".join(pages)
    logger.info("[OCR] OCR locale completato.")
    return combined_text


def _parse_scores(
    ocr_text: str,
    ollama_url: str,
    parser_model: str,
    questionnaire_type: str,
    expected_factors: tuple[str, ...],
) -> dict[str, int]:
    logger.info("[Parser] avvio parsing locale.")
    factor_list = ", ".join(expected_factors)
    try:
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
                            "non correggere e non inventare valori mancanti. / "
                            f"Extract exclusively the scores of the {questionnaire_type} profile: "
                            f"{factor_list}. "
                            "Each value must be an integer from 1 to 9. Do not calculate, "
                            "correct, or invent missing values."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Estrai {factor_list} dal seguente testo OCR e restituisci "
                            f"solo il JSON conforme allo schema:\n\n{ocr_text} / "
                            f"Extract {factor_list} from the following OCR text and return "
                            f"only the JSON compliant with the schema:\n\n{ocr_text}"
                        ),
                    },
                ],
                "stream": False,
                # I modelli locali disponibili ragionano di default: qui l'output
                # e' vincolato a uno schema JSON, il pensiero non serve e ritarda.
                "think": False,
                "format": _scores_schema(expected_factors),
                "options": {"temperature": 0},
            },
            timeout=180,
        )
        content = data.get("message", {}).get("content")
        logger.info("[Parser] risposta ricevuta.")
        if not isinstance(content, str):
            logger.error("[Parser] formato della risposta non valido.")
            raise ValueError("Gemma non ha restituito i punteggi")
        
        try:
            parsed_json = json.loads(content)
            logger.info("[Parser] JSON decodificato.")
        except json.JSONDecodeError as json_exc:
            logger.error("[Parser] JSON non valido.")
            raise ValueError(f"La risposta del parser non è un JSON valido: {json_exc}") from json_exc

        return _validate_scores(parsed_json, expected_factors)
    except Exception:
        logger.error("[Parser] parsing locale fallito.")
        raise


def _strip_json_fences(content: str) -> str:
    text = content.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


def _run_vision_fallback(
    images: list[str],
    questionnaire_type: str,
    expected_factors: tuple[str, ...],
    vision_call: VisionCall | None,
) -> dict[str, int]:
    """Ripiego OCR/punteggi tramite il provider di visione configurato.

    Nessun modello e' cablato: `vision_call` e' `AIService.call_vision`, che
    risolve il provider, applica la policy privacy esterna della chat e chiama il
    client corrispondente. Senza provider `vision_call` solleva un errore
    classificato, propagato al chiamante per un messaggio localizzato."""
    logger.info("[Fallback] avvio ripiego vision.")
    if vision_call is None:
        logger.error("[Fallback] provider vision assente.")
        raise VisionUnavailableError(
            "Nessun provider di visione configurato per l'estrazione del documento"
        )

    if not images:
        logger.error("[Fallback] nessuna pagina disponibile.")
        raise ValueError("No pages available to process")

    # La tabella dei punteggi sta nella prima pagina: basta quella.
    encoded_image = images[0]
    prompt = (
        f"Extract the scores for the factors {', '.join(expected_factors)} "
        f"from this {questionnaire_type} profile page. "
        "Return ONLY a raw JSON object whose keys are the factor names and whose values are integers from 1 to 9. "
        "Do not include any explanation or markdown formatting."
    )
    logger.info("[Fallback] invio pagina al provider.")

    content = vision_call(prompt, encoded_image)
    logger.info("[Fallback] risposta ricevuta.")

    content_clean = _strip_json_fences(content or "")
    try:
        parsed_json = json.loads(content_clean)
        logger.info("[Fallback] JSON decodificato.")
    except json.JSONDecodeError as json_exc:
        logger.error("[Fallback] JSON non valido.")
        raise ValueError(f"La risposta del ripiego vision non è un JSON valido: {json_exc}") from json_exc

    return _validate_scores(parsed_json, expected_factors)


def extract_questionnaire_data(
    file_path: str,
    *,
    questionnaire_type: str = "QSA",
    ollama_url: str | None = None,
    ocr_model: str | None = None,
    parser_model: str | None = None,
    vision_call: VisionCall | None = None,
) -> dict[str, int] | dict[str, str]:
    """Estrae e valida un profilo provando prima con Ollama, poi con il provider di visione.

    `vision_call` e' il ripiego esterno (in produzione `AIService.call_vision`):
    risolve il provider/modello configurati, applica la policy privacy esterna
    della chat e non usa alcun modello cablato. Se manca o non e' configurato il
    risultato porta `error_code` per un messaggio localizzato a valle."""
    logger.info("[Pipeline] avvio estrazione.")
    path = Path(file_path)
    if not path.exists():
        err_msg = f"File non trovato nel file system: '{file_path}'"
        logger.error("[Pipeline] file non trovato.")
        return {"error": err_msg}

    resolved_url = ollama_url or os.getenv("OLLAMA_BASE_URL") or DEFAULT_OLLAMA_URL
    resolved_ocr_model = ocr_model or os.getenv("QSA_OCR_MODEL") or DEFAULT_OCR_MODEL
    resolved_parser_model = parser_model or os.getenv("QSA_PARSER_MODEL") or DEFAULT_PARSER_MODEL

    try:
        expected_factors = _questionnaire_factors(questionnaire_type)
        
        logger.info("[Pipeline] conversione documento.")
        images = _encode_document_pages(path)
        logger.info("[Pipeline] documento convertito.")
        
        try:
            logger.info("[Pipeline] tentativo estrazione locale.")
            ocr_text = _run_ocr(
                images,
                resolved_url,
                resolved_ocr_model,
                questionnaire_type,
                expected_factors,
            )
            scores = _parse_scores(
                ocr_text,
                resolved_url,
                resolved_parser_model,
                questionnaire_type,
                expected_factors,
            )
            logger.info("[Pipeline] estrazione locale completata.")
            return scores
        except Exception as local_exc:
            logger.warning("[Pipeline] estrazione locale fallita, tentativo di ripiego.")
            try:
                scores = _run_vision_fallback(
                    images, questionnaire_type, expected_factors, vision_call)
                logger.info("[Pipeline] estrazione vision completata.")
                return scores
            except VisionUnavailableError as vision_exc:
                logger.error("[Pipeline] ripiego vision non disponibile.")
                return {"error": str(vision_exc), "error_code": vision_exc.code}
            except Exception as fallback_exc:
                # Un errore classificato a monte (privacy, chiave, trasporto) conserva
                # il codice: il chiamante lo traduce in un messaggio localizzato.
                code = getattr(fallback_exc, "code", None)
                if isinstance(code, str) and code:
                    logger.error("[Pipeline] ripiego vision rifiutato.")
                    return {"error": str(fallback_exc), "error_code": code}
                logger.error("[Pipeline] ripiego vision fallito.")
                raise RuntimeError(
                    f"Estrazione fallita sia localmente ({local_exc}) sia con ripiego vision ({fallback_exc})"
                ) from fallback_exc
            
    except Exception as exc:
        logger.error("[Pipeline] estrazione fallita.")
        return {"error": str(exc)}


def extract_qsa_data(
    file_path: str,
    *,
    ollama_url: str | None = None,
    ocr_model: str | None = None,
    parser_model: str | None = None,
    vision_call: VisionCall | None = None,
) -> dict[str, int] | dict[str, str]:
    """Wrapper compatibile per l'estrazione del profilo QSA."""
    return extract_questionnaire_data(
        file_path,
        questionnaire_type="QSA",
        ollama_url=ollama_url,
        ocr_model=ocr_model,
        parser_model=parser_model,
        vision_call=vision_call,
    )
