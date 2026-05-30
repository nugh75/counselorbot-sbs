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
