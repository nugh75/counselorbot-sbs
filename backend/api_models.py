"""Modelli Pydantic delle richieste API (estratti da main.py per evitare
import circolari tra i router e la logica di chat)."""
from typing import Optional

from . import schemas


class ChatRequest(schemas.BaseModel):
    message: str = ""
    mode: str = "generic"
    session_id: Optional[str] = None
    conversation_id: Optional[str] = None
    scores_context: str = ""  # Formatted QSA scores from frontend
    questionnaire_type: Optional[str] = None
    phase: Optional[str] = None
    use_phase_prompt: bool = False
    language: Optional[str] = None  # 'it' (default), 'en', 'es', 'fr', 'de', 'sv'
    max_tokens: Optional[int] = None
    memory_message: Optional[str] = None  # Solo testo reale dell'utente, senza istruzioni interne
    internal_message: bool = False  # Istruzione tecnica: non mostrarla come input studente nei log/PDF
    counselor_id: Optional[int] = None  # se valorizzato: persona + provider/model dal counselor


class SiteChatRequest(schemas.BaseModel):
    """Domanda al chatbot informativo del sito (RAG su docs/)."""
    message: str = ""
    audience: str = "studente"  # 'docente' | 'studente'
    session_id: Optional[str] = None
    conversation_id: Optional[str] = None
    max_tokens: Optional[int] = None
    language: Optional[str] = "it"  # lingua della risposta (it|en|es|fr|de|sv)
    collection: str = "competenzestrategiche"  # base di conoscenza: builtin o collezione dinamica (slug)
    counselor_id: Optional[int] = None  # counselor AI opzionale per la persona nel system prompt
    student_context: Optional[str] = None  # contesto privato passato da /profilo, non usato come fonte RAG


class QsaAuditRequest(schemas.BaseModel):
    scores: dict
    session_id: str
    questionnaire_type: str = "QSA"


class MemoryEventRequest(schemas.BaseModel):
    session_id: str
    questionnaire_type: str
    language: Optional[str] = None
    phase: str
    step_label: Optional[str] = None
    completed_step: bool = False
    user_message: str = ""


class TTSRequest(schemas.BaseModel):
    text: str
    voice: str = "it-IT-IsabellaNeural"  # Italian female voice
    counselor_id: Optional[int] = None


# --- pQBL da PDF ---

class PqblSessionCreate(schemas.BaseModel):
    document_id: str
    mode: str = "learning"  # learning | final_test


class PqblAnswerRequest(schemas.BaseModel):
    question_id: int
    option_key: str


class PqblFinalTestRequest(schemas.BaseModel):
    answers: dict  # {question_id (str|int): option_key}


class PqblQuestionUpdate(schemas.BaseModel):
    """Modifica admin di una MCQ pQBL. Campi assenti = invariati."""
    question_text: Optional[str] = None
    skill: Optional[str] = None
    options: Optional[list] = None  # [{key, text, correct, feedback}]


class OpencodeWorkspaceRequest(schemas.BaseModel):
    workspace_id: str
    questionnaire_type: str
    scores: dict
    pdf_token: Optional[str] = None
    locale: Optional[str] = "it"


class OpencodeChatRequest(schemas.BaseModel):
    session_id: str
    message: str = ""
    seed: bool = False
