from sqlalchemy import Boolean, Column, Integer, String, Text, DateTime, JSON
from sqlalchemy.sql import func
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_admin = Column(Boolean, default=False)

class Config(Base):
    __tablename__ = "configs"

    key = Column(String, primary_key=True, index=True)
    value = Column(Text) # JSON or String value
    description = Column(String, nullable=True)

class Log(Base):
    __tablename__ = "logs"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, index=True)
    user_id = Column(Integer, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    action = Column(String) # e.g., "login", "chat_message", "qsa_analysis"
    details = Column(JSON) # e.g., prompt used, score data, message content

class GuidedStep(Base):
    __tablename__ = "guided_steps"

    id = Column(String, primary_key=True)
    sort_order = Column(Integer, nullable=False)
    label = Column(String, nullable=False)
    prompt = Column(Text, nullable=False)
    system_prompt_mode = Column(String, nullable=False, default="generic")
    color_theme = Column(String, nullable=False, default="blue")
    questionnaire_type = Column(String, nullable=False, default="QSA")

class SurveyResponse(Base):
    __tablename__ = "survey_responses"
    
    id = Column(Integer, primary_key=True, index=True)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Dati di base
    eta = Column(String, nullable=True)
    sesso = Column(String, nullable=True)
    istruzione = Column(String, nullable=True)
    tipo_istituto = Column(String, nullable=True)
    provenienza = Column(String, nullable=True)
    area_studio = Column(String, nullable=True)
    
    # Valutazioni quantitative (nullable = può essere NR)
    q_utile = Column(Integer, nullable=True)
    q_pertinente = Column(Integer, nullable=True)
    q_chiaro = Column(Integer, nullable=True)
    q_dettaglio = Column(Integer, nullable=True)
    q_facile = Column(Integer, nullable=True)
    q_veloce = Column(Integer, nullable=True)
    q_fiducia = Column(Integer, nullable=True)
    q_riflettere = Column(Integer, nullable=True)
    q_coinvolgente = Column(Integer, nullable=True)
    q_consiglierei = Column(Integer, nullable=True)


class StrategyFeedback(Base):
    """Valutazione anonima di una strategia condivisa gia approvata."""

    __tablename__ = "strategy_feedback"

    id = Column(Integer, primary_key=True, index=True)
    strategy_id = Column(String, nullable=False, index=True)
    questionnaire_type = Column(String, nullable=True)
    phase = Column(String, nullable=True)
    language = Column(String, nullable=True)
    helpful = Column(Boolean, nullable=False)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())


class SharedChatResponse(Base):
    """Risposta AI anonima recuperabile solo dopo una valutazione positiva."""

    __tablename__ = "shared_chat_responses"

    id = Column(String, primary_key=True)
    questionnaire_type = Column(String, nullable=False, index=True)
    phase = Column(String, nullable=True, index=True)
    language = Column(String, nullable=False, default="it")
    response_text = Column(Text, nullable=False)
    helpful = Column(Boolean, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    rated_at = Column(DateTime(timezone=True), nullable=True)


class QuestionnaireResult(Base):
    """Risultati di un questionario compilato (QSA, QSAr, ZTPI, Savickas)."""

    __tablename__ = "questionnaire_results"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, index=True, nullable=False)
    questionnaire_type = Column(String, nullable=False, index=True)
    scores = Column(JSON, nullable=True)
    username = Column(String, nullable=True, index=True)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())


class ValidationResponse(Base):
    """Dataset grezzo per validazione psicometrica.

    Conserva risposte item-per-item e metadati di raccolta. I profili sintetici
    restano in `questionnaire_results` per la UI ordinaria dello studente.
    """

    __tablename__ = "validation_responses"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, index=True, nullable=False)
    instrument_code = Column(String, index=True, nullable=False)
    locale = Column(String, index=True, nullable=False)
    version_label = Column(String, index=True, nullable=False, default="draft")
    answers = Column(JSON, nullable=False)
    factor_scores = Column(JSON, nullable=True)
    response_metadata = Column(JSON, nullable=True)
    username = Column(String, nullable=True, index=True)
    duration_seconds = Column(Integer, nullable=True)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())


class TrainingExample(Base):
    """Esempio candidato per dataset SFT, revisionato da admin prima dell'export."""

    __tablename__ = "training_examples"

    id = Column(Integer, primary_key=True, index=True)
    instrument_code = Column(String, index=True, nullable=False, default="QSA")
    locale = Column(String, index=True, nullable=False, default="it")
    phase = Column(String, index=True, nullable=False)
    step_label = Column(String, nullable=True)
    scores = Column(JSON, nullable=True)
    scores_context = Column(Text, nullable=False)
    student_message = Column(Text, nullable=False)
    assistant_answer = Column(Text, nullable=False)
    status = Column(String, index=True, nullable=False, default="pending")
    review_notes = Column(Text, nullable=True)
    auto_score = Column(JSON, nullable=True)
    source = Column(String, nullable=False, default="synthetic-template-v1")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# --- Catalogo strumenti editabile da admin (item + regole di scala, DB-driven) ---
# Vedi docs/validazione/progetto-validazione-qsa-qsar-sv-en.md §9.

class Instrument(Base):
    """Metadati e scala di risposta di uno strumento (QSA, QSAr, ZTPI, QPCS, QPCC, QAP)."""

    __tablename__ = "instruments"

    code = Column(String, primary_key=True, index=True)
    name_it = Column(String, nullable=True)
    name_en = Column(String, nullable=True)
    name_es = Column(String, nullable=True)
    name_sv = Column(String, nullable=True)
    # Scala di RISPOSTA agli item (es. 1-4 frequenza, 1-5 Likert)
    response_scale_min = Column(Integer, nullable=False, default=1)
    response_scale_max = Column(Integer, nullable=False, default=4)
    # Etichette della scala per locale: {"en": [...], "sv": [...]}
    response_labels = Column(JSON, nullable=True)
    # Scala del PROFILO restituito: "stanine" | "raw"
    report_scale_type = Column(String, nullable=False, default="stanine")
    # "experimental" finché non esistono norm_thresholds validate
    status = Column(String, nullable=False, default="experimental")


class Factor(Base):
    """Fattore/scala di uno strumento. Direzione interpretativa != reverse-scoring."""

    __tablename__ = "factors"

    id = Column(Integer, primary_key=True, index=True)
    instrument_code = Column(String, index=True, nullable=False)
    code = Column(String, nullable=False)  # es. C1, A1, T1, AD1...
    sort_order = Column(Integer, nullable=False, default=0)
    dimension = Column(String, nullable=True)  # raggruppamento (cognitive/affective/pn...)
    # Come si LEGGE il punteggio: resource | difficulty | neutral
    orientation = Column(String, nullable=False, default="resource")
    is_interpretation_inverted = Column(Boolean, nullable=False, default=False)
    label_it = Column(String, nullable=True)
    label_en = Column(String, nullable=True)
    label_es = Column(String, nullable=True)
    label_sv = Column(String, nullable=True)
    description_it = Column(Text, nullable=True)
    description_en = Column(Text, nullable=True)
    description_es = Column(Text, nullable=True)
    description_sv = Column(Text, nullable=True)


class QuestionnaireItem(Base):
    """Singolo item di uno strumento, multilingue, con regola di reverse-scoring."""

    __tablename__ = "questionnaire_items"

    id = Column(Integer, primary_key=True, index=True)
    instrument_code = Column(String, index=True, nullable=False)
    item_number = Column(Integer, nullable=False)  # numero d'ordine 1-based (chiave scala)
    sort_order = Column(Integer, nullable=False, default=0)
    factor_code = Column(String, nullable=True, index=True)
    reverse_scoring = Column(Boolean, nullable=False, default=False)
    text_it = Column(Text, nullable=True)
    text_en = Column(Text, nullable=True)
    text_es = Column(Text, nullable=True)
    text_sv = Column(Text, nullable=True)
    active = Column(Boolean, nullable=False, default=True)


class NormThreshold(Base):
    """Tabella normativa raw->stanine per strumento/lingua/fattore (post-validazione).
    Finché vuota per uno strumento, lo scoring usa il fallback lineare sperimentale."""

    __tablename__ = "norm_thresholds"

    id = Column(Integer, primary_key=True, index=True)
    instrument_code = Column(String, index=True, nullable=False)
    locale = Column(String, nullable=False, default="en")
    factor_code = Column(String, nullable=False, index=True)
    raw_min = Column(Integer, nullable=False)
    raw_max = Column(Integer, nullable=False)
    stanine = Column(Integer, nullable=False)
    norm_set_label = Column(String, nullable=True)
    status = Column(String, nullable=False, default="provisional")


# --- pQBL da PDF (pure Question-Based Learning, Jemstedt & Bälter 2025) ---

class PqblDocument(Base):
    """PDF caricato dallo studente da cui è generato un question bank pQBL."""

    __tablename__ = "pqbl_documents"

    id = Column(String, primary_key=True)
    username = Column(String, nullable=True, index=True)
    filename = Column(String, nullable=True)
    text_hash = Column(String, index=True, nullable=False)
    language = Column(String, nullable=False, default="it")
    size = Column(Integer, nullable=False, default=10)  # 10 | 20 | 30 domande richieste
    status = Column(String, nullable=False, default="processing")  # processing | ready | error
    error_detail = Column(Text, nullable=True)
    provider = Column(String, nullable=True)  # provider AI richiesto (None = active_provider)
    file_path = Column(String, nullable=True)  # path al PDF salvato (pulito dopo la generazione)
    chunks_total = Column(Integer, nullable=False, default=0)
    chunks_done = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PqblQuestion(Base):
    """MCQ generata: 4 opzioni con feedback per opzione (mai esposte al client
    con il flag `correct`: la verifica è solo server-side)."""

    __tablename__ = "pqbl_questions"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(String, index=True, nullable=False)
    skill = Column(String, nullable=False)
    position = Column(Integer, nullable=False, default=0)
    question_text = Column(Text, nullable=False)
    options = Column(JSON, nullable=False)  # [{key, text, correct, feedback}]


class PqblSession(Base):
    """Sessione di apprendimento (learning) o test finale (final_test) su un documento."""

    __tablename__ = "pqbl_sessions"

    id = Column(String, primary_key=True)
    document_id = Column(String, index=True, nullable=False)
    username = Column(String, nullable=True, index=True)
    mode = Column(String, nullable=False, default="learning")  # learning | final_test
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    finished_at = Column(DateTime(timezone=True), nullable=True)


class PqblAttempt(Base):
    """Singolo tentativo di risposta (R5: tentativi multipli ammessi in learning;
    first_try alimenta la metrica '% corrette al primo tentativo' R8)."""

    __tablename__ = "pqbl_attempts"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, index=True, nullable=False)
    question_id = Column(Integer, index=True, nullable=False)
    selected_key = Column(String, nullable=False)
    correct = Column(Boolean, nullable=False)
    first_try = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class LearnerProfileRevision(Base):
    """Modello del discente auto-dichiarato, append-only.

    Ogni salvataggio crea una nuova revisione: il profilo corrente è la riga
    più recente per username, lo storico del cambiamento sono le righe
    precedenti. Cancellare il profilo = cancellare tutte le revisioni.
    """

    __tablename__ = "learner_profile_revisions"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False, index=True)
    data = Column(JSON, nullable=False)
    source = Column(String, nullable=False, default="manual")  # intake|session_start|session_end|manual
    session_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
