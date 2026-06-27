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
logger.setLevel(logging.INFO)
import sys
if not logger.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    logger.addHandler(_handler)


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
    logger.info(f"Validatore: avvio con dati={data}")
    if not isinstance(data, dict):
        logger.error(f"Validatore fallito: dati non sono un dizionario/JSON. Ricevuto: {type(data)}")
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
                original_value = value
                value = int(value.strip().replace('"', '').replace("'", ""))
                logger.info(f"Validatore: convertito {factor_upper} da stringa '{original_value}' a intero {value}")
            except (ValueError, TypeError):
                pass

        if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 9:
            logger.error(f"Validatore fallito: punteggio non valido per fattore '{factor}'. Valore estratto: {value} (tipo: {type(value)})")
            raise ValueError(f"Punteggio non valido o mancante per {factor}")
        scores[factor] = value
    logger.info(f"Validatore completato con successo: {scores}")
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
    logger.info(
        f"[OCR] Avvio OCR locale. Modello: '{ocr_model}', URL Ollama: '{ollama_url}', "
        f"Tipo questionario: '{questionnaire_type}', Pagine totali da elaborare: {len(images)}."
    )
    factor_list = ", ".join(expected_factors)
    pages: list[str] = []
    for page_number, image in enumerate(images, start=1):
        image_len = len(image)
        logger.info(
            f"[OCR] Invio pagina {page_number}/{len(images)} a Ollama OCR. "
            f"Dimensione immagine base64: {image_len} caratteri."
        )
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
                snippet = text.strip()[:200].replace('\n', ' ')
                logger.info(
                    f"[OCR] Pagina {page_number} elaborata correttamente. "
                    f"Lunghezza testo estratto: {len(text)} caratteri. "
                    f"Estratto iniziale: '{snippet}...'"
                )
                pages.append(f"--- PAGINA {page_number} ---\n{text.strip()}")
            else:
                logger.warning(
                    f"[OCR] La risposta per la pagina {page_number} è vuota o di tipo non valido: {type(text)}"
                )
        except Exception as ocr_exc:
            logger.error(
                f"[OCR] Errore durante l'OCR della pagina {page_number} con modello '{ocr_model}': {ocr_exc}"
            )
            raise

    if not pages:
        logger.error("[OCR] Fallimento OCR: nessuna pagina ha restituito testo leggibile.")
        raise ValueError("L'OCR non ha trovato testo nel documento")
    
    combined_text = "\n\n".join(pages)
    logger.info(
        f"[OCR] OCR locale completato con successo. Pagine totali caricate: {len(pages)}. "
        f"Dimensione totale del testo combinato: {len(combined_text)} caratteri."
    )
    return combined_text


def _parse_scores(
    ocr_text: str,
    ollama_url: str,
    parser_model: str,
    questionnaire_type: str,
    expected_factors: tuple[str, ...],
) -> dict[str, int]:
    logger.info(
        f"[Parser] Avvio parsing dei punteggi con Ollama. Modello: '{parser_model}', URL: '{ollama_url}', "
        f"Tipo questionario: '{questionnaire_type}', Lunghezza testo OCR: {len(ocr_text)} caratteri."
    )
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
                "format": _scores_schema(expected_factors),
                "options": {"temperature": 0},
            },
            timeout=180,
        )
        content = data.get("message", {}).get("content")
        logger.info(f"[Parser] Risposta grezza ricevuta da Ollama ({parser_model}): '{content}'")
        if not isinstance(content, str):
            logger.error(
                f"[Parser] Errore: la risposta dal modello di parsing non è una stringa. Ricevuto: {type(content)}"
            )
            raise ValueError("Gemma non ha restituito i punteggi")
        
        try:
            parsed_json = json.loads(content)
            logger.info(f"[Parser] JSON decodificato con successo: {parsed_json}")
        except json.JSONDecodeError as json_exc:
            logger.error(
                f"[Parser] Errore critico: Impossibile decodificare il JSON restituito da Ollama. "
                f"Contenuto grezzo errato: '{content}'. Errore: {json_exc}"
            )
            raise ValueError(f"La risposta del parser non è un JSON valido: {json_exc}") from json_exc

        return _validate_scores(parsed_json, expected_factors)
    except Exception as exc:
        logger.error(
            f"[Parser] Errore durante il parsing dei punteggi con modello '{parser_model}': {exc}"
        )
        raise


def _run_openrouter_fallback(
    images: list[str],
    questionnaire_type: str,
    expected_factors: tuple[str, ...],
) -> dict[str, int]:
    logger.info(
        f"[Fallback] Avvio fallback su OpenRouter per tipo questionario: '{questionnaire_type}' "
        f"con {len(images)} pagine disponibili."
    )
    api_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("API_KEY_OPENROUTER")
    if not api_key:
        logger.error("[Fallback] Chiave API OpenRouter (OPENROUTER_API_KEY/API_KEY_OPENROUTER) non trovata nell'ambiente.")
        raise ValueError("Missing OpenRouter API key for fallback")

    if not images:
        logger.error("[Fallback] Nessuna immagine di pagina disponibile per il fallback.")
        raise ValueError("No pages available to process")

    # Use the first page for the score table extraction
    encoded_image = images[0]
    logger.info(
        f"[Fallback] Invio della prima pagina a OpenRouter (modello: 'google/gemini-2.5-flash-lite-preview-09-2025'). "
        f"Dimensione base64 dell'immagine: {len(encoded_image)} caratteri."
    )

    try:
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
        
        logger.info(f"[Fallback] Risposta HTTP ricevuta da OpenRouter. Status code: {response.status_code}")
        response.raise_for_status()
        
        res_json = response.json()
        logger.info(f"[Fallback] Response JSON completo da OpenRouter: {res_json}")
        
        content = res_json["choices"][0]["message"]["content"].strip()
        logger.info(f"[Fallback] Contenuto estratto da OpenRouter: '{content}'")
        
        if content.startswith("```json"):
            content = content[7:]
        elif content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        
        content_clean = content.strip()
        try:
            parsed_json = json.loads(content_clean)
            logger.info(f"[Fallback] JSON fallback decodificato correttamente: {parsed_json}")
        except json.JSONDecodeError as json_exc:
            logger.error(
                f"[Fallback] Impossibile decodificare il JSON del fallback OpenRouter. "
                f"Contenuto pulito: '{content_clean}'. Errore: {json_exc}"
            )
            raise ValueError(f"La risposta del fallback OpenRouter non è un JSON valido: {json_exc}") from json_exc
            
        return _validate_scores(parsed_json, expected_factors)
        
    except requests.RequestException as req_exc:
        error_msg = f"[Fallback] Richiesta HTTP a OpenRouter fallita: {req_exc}"
        if req_exc.response is not None:
            error_msg += f" - Risposta del server: {req_exc.response.text}"
        logger.error(error_msg)
        raise RuntimeError(error_msg) from req_exc
    except Exception as exc:
        logger.error(f"[Fallback] Errore imprevisto nel fallback OpenRouter: {exc}")
        raise


def extract_questionnaire_data(
    file_path: str,
    *,
    questionnaire_type: str = "QSA",
    ollama_url: str | None = None,
    ocr_model: str | None = None,
    parser_model: str | None = None,
) -> dict[str, int] | dict[str, str]:
    """Estrae e valida un profilo provando prima localmente con Ollama, poi con fallback OpenRouter."""
    logger.info(
        f"[Pipeline] Inizio pipeline di estrazione per il file: '{file_path}'. "
        f"Tipo questionario richiesto: '{questionnaire_type}'."
    )
    path = Path(file_path)
    if not path.exists():
        err_msg = f"File non trovato nel file system: '{file_path}'"
        logger.error(f"[Pipeline] {err_msg}")
        return {"error": err_msg}

    resolved_url = ollama_url or os.getenv("OLLAMA_BASE_URL") or DEFAULT_OLLAMA_URL
    resolved_ocr_model = ocr_model or os.getenv("QSA_OCR_MODEL") or DEFAULT_OCR_MODEL
    resolved_parser_model = parser_model or os.getenv("QSA_PARSER_MODEL") or DEFAULT_PARSER_MODEL

    logger.info(
        f"[Pipeline] Configurazione risolta -> URL Ollama: '{resolved_url}', "
        f"Modello OCR: '{resolved_ocr_model}', Modello Parser: '{resolved_parser_model}'."
    )

    try:
        expected_factors = _questionnaire_factors(questionnaire_type)
        logger.info(f"[Pipeline] Fattori attesi per il questionario '{questionnaire_type}': {expected_factors}")
        
        logger.info(f"[Pipeline] Conversione in corso del file '{file_path}' in immagini...")
        images = _encode_document_pages(path)
        logger.info(f"[Pipeline] Documento convertito con successo. Pagine generate: {len(images)}")
        
        try:
            logger.info("[Pipeline] --- Tentativo di ESTRAZIONE LOCALE tramite Ollama ---")
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
            logger.info(f"[Pipeline] Estrazione locale completata con successo! Punteggi estratti: {scores}")
            return scores
        except Exception as local_exc:
            logger.warning(
                f"[Pipeline] Estrazione locale fallita con errore: {local_exc}. "
                f"Procedo con il TENTATIVO DI FALLBACK via OpenRouter..."
            )
            try:
                scores = _run_openrouter_fallback(images, questionnaire_type, expected_factors)
                logger.info(f"[Pipeline] Estrazione via fallback OpenRouter completata con successo! Punteggi estratti: {scores}")
                return scores
            except Exception as fallback_exc:
                logger.error(
                    f"[Pipeline] Anche il fallback su OpenRouter è fallito. Errore fallback: {fallback_exc}."
                )
                raise RuntimeError(
                    f"Estrazione fallita sia localmente ({local_exc}) sia con fallback OpenRouter ({fallback_exc})"
                ) from fallback_exc
            
    except Exception as exc:
        logger.error(f"[Pipeline] Errore fatale finale durante l'estrazione: {exc}")
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
