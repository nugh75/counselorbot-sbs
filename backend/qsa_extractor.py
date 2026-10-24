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

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
import sys
if not logger.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    logger.addHandler(_handler)


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
                # I modelli locali disponibili ragionano di default: qui l'output
                # e' vincolato a uno schema JSON, il pensiero non serve e ritarda.
                "think": False,
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
    logger.info(
        f"[Fallback] Avvio ripiego via provider di visione per tipo questionario: "
        f"'{questionnaire_type}' con {len(images)} pagine disponibili."
    )
    if vision_call is None:
        logger.error("[Fallback] Nessun provider di visione configurato per il ripiego.")
        raise VisionUnavailableError(
            "Nessun provider di visione configurato per l'estrazione del documento"
        )

    if not images:
        logger.error("[Fallback] Nessuna immagine di pagina disponibile per il ripiego.")
        raise ValueError("No pages available to process")

    # La tabella dei punteggi sta nella prima pagina: basta quella.
    encoded_image = images[0]
    prompt = (
        f"Extract the scores for the factors {', '.join(expected_factors)} "
        f"from this {questionnaire_type} profile page. "
        "Return ONLY a raw JSON object whose keys are the factor names and whose values are integers from 1 to 9. "
        "Do not include any explanation or markdown formatting."
    )
    logger.info(
        f"[Fallback] Invio della prima pagina al provider di visione configurato. "
        f"Dimensione base64 dell'immagine: {len(encoded_image)} caratteri."
    )

    content = vision_call(prompt, encoded_image)
    logger.info("[Fallback] Risposta del provider di visione ricevuta.")

    content_clean = _strip_json_fences(content or "")
    try:
        parsed_json = json.loads(content_clean)
        logger.info(f"[Fallback] JSON del ripiego decodificato correttamente: {parsed_json}")
    except json.JSONDecodeError as json_exc:
        logger.error(
            f"[Fallback] Impossibile decodificare il JSON del ripiego vision. "
            f"Contenuto pulito: '{content_clean}'. Errore: {json_exc}"
        )
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
                f"Procedo con il TENTATIVO DI FALLBACK via provider di visione..."
            )
            try:
                scores = _run_vision_fallback(
                    images, questionnaire_type, expected_factors, vision_call)
                logger.info(f"[Pipeline] Estrazione via provider di visione completata con successo! Punteggi estratti: {scores}")
                return scores
            except VisionUnavailableError as vision_exc:
                logger.error(f"[Pipeline] Ripiego vision non disponibile: {vision_exc}.")
                return {"error": str(vision_exc), "error_code": vision_exc.code}
            except Exception as fallback_exc:
                # Un errore classificato a monte (privacy, chiave, trasporto) conserva
                # il codice: il chiamante lo traduce in un messaggio localizzato.
                code = getattr(fallback_exc, "code", None)
                if isinstance(code, str) and code:
                    logger.error(
                        f"[Pipeline] Ripiego vision fallito con codice {code}: {fallback_exc}."
                    )
                    return {"error": str(fallback_exc), "error_code": code}
                logger.error(
                    f"[Pipeline] Anche il ripiego via provider di visione è fallito. "
                    f"Errore fallback: {fallback_exc}."
                )
                raise RuntimeError(
                    f"Estrazione fallita sia localmente ({local_exc}) sia con ripiego vision ({fallback_exc})"
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
