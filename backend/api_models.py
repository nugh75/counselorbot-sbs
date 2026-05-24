"""Modelli Pydantic delle richieste API (estratti da main.py per evitare
import circolari tra i router e la logica di chat)."""
from typing import Optional

from . import schemas


class ChatRequest(schemas.BaseModel):
    message: str = ""
    mode: str = "generic"
    session_id: Optional[str] = None
    scores_context: str = ""  # Formatted QSA scores from frontend
    questionnaire_type: Optional[str] = None
    phase: Optional[str] = None
    use_phase_prompt: bool = False
    language: Optional[str] = None  # 'it' (default), 'en', 'es', 'fr', 'de', 'sv'
    max_tokens: Optional[int] = None
    memory_message: Optional[str] = None  # Solo testo reale dell'utente, senza istruzioni interne


class QsaAuditRequest(schemas.BaseModel):
    scores: dict
    session_id: str


class TTSRequest(schemas.BaseModel):
    text: str
    voice: str = "it-IT-IsabellaNeural"  # Italian female voice
