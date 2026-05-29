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
