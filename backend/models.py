from sqlalchemy import BigInteger, Boolean, Column, Float, Integer, String, Text, DateTime, JSON, UniqueConstraint
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
    conversation_id = Column(String, index=True, nullable=True)
    user_id = Column(Integer, nullable=True)
    # Identita' testuale (ai4auth fornisce username/email, non un User.id integer).
    username = Column(String, index=True, nullable=True)
    email = Column(String, nullable=True)
    anonymous_research_code = Column(String, index=True, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    action = Column(String) # e.g., "login", "chat_message", "qsa_analysis"
    # Campi chiave denormalizzati e indicizzati per filtri rapidi.
    provider = Column(String, index=True, nullable=True)
    model_name = Column(String, nullable=True)
    questionnaire_type = Column(String, index=True, nullable=True)
    phase = Column(String, nullable=True)
    mode = Column(String, nullable=True)
    # FK logica -> shared_chat_responses.id (per join feedback inline).
    response_id = Column(String, index=True, nullable=True)
    cost_usd = Column(Float, nullable=True)
    details = Column(JSON) # e.g., prompt used, score data, message content

class UserDisplayName(Base):
    """Nome visualizzato per utenti (docenti, ricercatori, admin).

    Popolato automaticamente quando l'utente crea piani, classi o note.
    """

    __tablename__ = "user_display_names"

    username = Column(String, primary_key=True, index=True)
    display_name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class GuidedStep(Base):
    __tablename__ = "guided_steps"

    id = Column(String, primary_key=True)
    sort_order = Column(Integer, nullable=False)
    label = Column(String, nullable=False)
    label_i18n = Column(JSON, nullable=True)  # traduzioni {lang: label}, 'it' = colonna label
    prompt = Column(Text, nullable=False)
    system_prompt_mode = Column(String, nullable=False, default="generic")
    color_theme = Column(String, nullable=False, default="blue")
    questionnaire_type = Column(String, nullable=False, default="QSA")


class GuidedStepQuestion(Base):
    """Domanda suggerita nella chat guidata, legata a questionario e step."""

    __tablename__ = "guided_step_questions"

    id = Column(Integer, primary_key=True, index=True)
    questionnaire_type = Column(String, nullable=False, index=True)
    step_id = Column(String, nullable=False, index=True)
    language = Column(String, nullable=False, default="it", index=True)
    text = Column(Text, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

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
    paese = Column(String, nullable=True)
    
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

    # Feedback qualitativo opzionale
    strumenti_utilizzati = Column(JSON, nullable=True)
    counselor_utilizzato = Column(String, nullable=True)
    feedback_aperto = Column(Text, nullable=True)


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
    administration_plan_id = Column(Integer, index=True, nullable=True)
    research_contact_id = Column(Integer, index=True, nullable=True)
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
    administration_plan_id = Column(Integer, index=True, nullable=True)
    research_contact_id = Column(Integer, index=True, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())


class AnonymousResearchCode(Base):
    """Codice anonimo stabile usato per incrociare risultati senza esporre username."""

    __tablename__ = "anonymous_research_codes"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False, unique=True, index=True)
    code = Column(String, nullable=False, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ResearchContact(Base):
    """Referente di ricerca autorizzato a somministrare questionari sperimentali."""

    __tablename__ = "research_contacts"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, nullable=False, unique=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    institution = Column(String, nullable=True)
    role = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    # 'manual' (creato da admin) o 'admin-sync' (sincronizzato dalla access matrix ai4auth)
    source = Column(String, nullable=False, default="manual")
    # username ai4auth per i contatti sincronizzati (chiave di idempotenza)
    ext_username = Column(String, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AdministrationPlan(Base):
    """Piano operativo per una somministrazione con codice, luogo e ricercatori."""

    __tablename__ = "administration_plans"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, nullable=False, unique=True, index=True)
    title = Column(String, nullable=False)
    instrument_code = Column(String, index=True, nullable=False)
    # Classe/gruppo a cui e' rivolta la somministrazione (student_groups.id)
    group_id = Column(Integer, index=True, nullable=True)
    locale = Column(String, index=True, nullable=False, default="en")
    # Fascia dei partecipanti al piano: secondaria | universita | adulti.
    school_level = Column(String, nullable=True)
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    location = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="planned", index=True)
    created_by_username = Column(String, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AdministrationPlanResearcher(Base):
    """Ricercatore collegato a un piano: contatto registrato o nome libero."""

    __tablename__ = "administration_plan_researchers"

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, index=True, nullable=False)
    research_contact_id = Column(Integer, index=True, nullable=True)
    external_name = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AssistantQuestion(Base):
    """Domanda suggerita dell'assistente docenti, per topic e lingua.

    Alimenta il pulsante "Prepara domanda": ogni topic ha piu' varianti, ruotate
    nella UI. Modificabile da admin; le lingue prive di righe ricadono sulle
    varianti i18n del frontend.
    """

    __tablename__ = "assistant_questions"

    id = Column(Integer, primary_key=True, index=True)
    topic = Column(String, nullable=False, index=True)
    language = Column(String, nullable=False, default="it", index=True)
    text = Column(Text, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


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
    name_i18n = Column(JSON, nullable=True)   # {lingua: nome}; le colonne name_* restano in ripiego
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
    label_i18n = Column(JSON, nullable=True)
    description_i18n = Column(JSON, nullable=True)


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
    text_i18n = Column(JSON, nullable=True)
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
    source = Column(String, nullable=False, default="manual")  # intake|session_start|session_end|orientation|manual
    session_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class LearnerProfileReflection(Base):
    """Nota dello studente sui cambiamenti osservati nel proprio profilo."""

    __tablename__ = "learner_profile_reflections"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False, index=True)
    note = Column(Text, nullable=False)
    current_revision_id = Column(Integer, nullable=True, index=True)
    previous_revision_id = Column(Integer, nullable=True, index=True)
    session_id = Column(String, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class OrientationSession(Base):
    """Conversazione della Bussola, separata da profili e questionari.

    La prima sessione conclusa sblocca gli altri strumenti per i nuovi studenti;
    le sessioni successive restano riapribili senza alterare le compilazioni.
    """

    __tablename__ = "orientation_sessions"

    session_id = Column(String, primary_key=True)
    username = Column(String, nullable=False, index=True)
    language = Column(String, nullable=False, default="it")
    counselor_id = Column(Integer, nullable=True, index=True)
    status = Column(String, nullable=False, default="in_progress", index=True)
    messages = Column(JSON, nullable=False, default=list)
    recommendations = Column(JSON, nullable=False, default=list)
    notebook_draft = Column(JSON, nullable=False, default=dict)
    notebook_reviewed = Column(Boolean, nullable=False, default=False)
    notebook_revision_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)


class StudentBooklet(Base):
    """Libretto dello studente compilabile, legato a uno strumento.

    Piu' schede per (username, questionnaire_type): nessun vincolo di unicita'.
    Il titolo della scheda vive in `data["title"]`.
    """

    __tablename__ = "student_booklets"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False, index=True)
    session_id = Column(String, nullable=True, index=True)
    questionnaire_type = Column(String, nullable=False, index=True)
    data = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PortfolioItem(Base):
    """Lavoro/elaborato dello studente nel suo portfolio personale.

    Ogni voce ha metadati (titolo, descrizione, categoria, data) ed eventuali
    immagini allegate. Le immagini sono salvate su disco (PORTFOLIO_STORAGE_DIR);
    `images` tiene solo i metadati: lista di {id, filename, content_type, path}.
    """

    __tablename__ = "portfolio_items"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String, nullable=True, index=True)
    item_date = Column(String, nullable=True)   # data del lavoro (YYYY-MM-DD), testo libero
    link = Column(String, nullable=True)         # URL opzionale al lavoro
    images = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class FrozenSession(Base):
    """Sessione guidata congelata dallo studente.

    Una riga per (username, session_id): ricongelare aggiorna lo snapshot.
    `data` contiene lo stato visibile della chat (messaggi, step, punteggi,
    counselor, lingua) per riprendere il percorso da qualsiasi dispositivo.
    """

    __tablename__ = "frozen_sessions"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False, index=True)
    session_id = Column(String, nullable=False, index=True)
    questionnaire_type = Column(String, nullable=False, index=True)
    data = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class OrientationToolBrief(Base):
    """Testo lungo con cui la Bussola spiega uno strumento.

    Il catalogo dava al modello una subordinata di sessanta caratteri per
    strumento, e il testo canonico piu' ricco si sbloccava solo su una domanda
    esplicita: le raccomandazioni uscivano sbrigative. Qui sta la spiegazione
    profonda, una per id del catalogo (i sei questionari, SAVICKAS, IDEA, pQBL).

    E' materiale di istruzione per il modello, quindi in **inglese**: gli LLM
    reggono il cambio di lingua e una sola stesura evita sei traduzioni da tenere
    allineate. Il seed crea solo le righe mancanti e non sovrascrive mai un testo
    modificato dall'admin.
    """

    __tablename__ = "orientation_tool_briefs"

    tool_id = Column(String, primary_key=True, index=True)
    brief = Column(Text, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ModelPreset(Base):
    """Preset riusabile = bundle provider + modello + parametri.

    Usato dal benchmark (cosa confrontare) e dai counselor (quale modello
    risponde). Il provider deve essere uno del registry di AIService; il
    preset e' selezionabile solo se quel provider ha una chiave configurata.
    """

    __tablename__ = "model_presets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    provider = Column(String, nullable=False)  # openai|anthropic|...|deepseek|groq...
    model = Column(String, nullable=False)
    temperature = Column(Float, nullable=True)
    max_tokens = Column(Integer, nullable=True)
    disable_thinking = Column(Boolean, nullable=False, default=False)
    # Override del budget di ragionamento (token) per i modelli reasoning.
    # None = usa il default della famiglia del modello (reasoning_profiles).
    reasoning_budget = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class BenchmarkRun(Base):
    """Esecuzione di un benchmark QSA in-app su uno o piu' preset.

    Il riepilogo aggregato (per-preset: qualita', tok/s, costo, score...) sta in
    `summary`; il dettaglio per-step e' nei `logs` (action benchmark_inapp).
    """

    __tablename__ = "benchmark_runs"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(String, unique=True, index=True, nullable=False)
    status = Column(String, nullable=False, default="queued")  # queued|running|done|error
    language = Column(String, nullable=False, default="it")
    created_by = Column(String, nullable=True)
    presets = Column(JSON, nullable=True)   # [{provider, model, name}]
    summary = Column(JSON, nullable=True)   # [{provider, model, quality, tok_s, ...}]
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    finished_at = Column(DateTime(timezone=True), nullable=True)


class Counselor(Base):
    """Persona di counseling configurabile dall'admin e scelta dall'utente.

    Ha un nome, una descrizione e una `persona` (la "storia"/carattere che viene
    anteposta al system prompt), un modello (via preset_id) e l'elenco dei
    questionari che gestisce. I campi user-facing (name, description, avatar)
    sono pubblici; preset/persona restano interni.
    """

    __tablename__ = "counselors"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)        # breve, mostrata all'utente (sorgente: italiano)
    description_i18n = Column(JSON, nullable=True)   # traduzioni {lang: testo}, generate via Ollama
    voice_mapping = Column(JSON, nullable=True)      # mapping {lang: voice_name}
    persona = Column(Text, nullable=True)            # prefisso al system prompt
    avatar = Column(String, nullable=True)           # nome icona o url
    preset_id = Column(Integer, nullable=True)       # -> model_presets.id (modello)
    questionnaire_types = Column(JSON, nullable=True)  # ["QSA","ZTPI",...]
    language = Column(JSON, nullable=False, default=lambda: ["*"])
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    show_in_assistant = Column(Boolean, nullable=False, default=False)
    assistant_audience = Column(String, nullable=True)  # null=entrambi, "studente", "docente"
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CertifiedStrategy(Base):
    """Catalogo di strategie di apprendimento certificate, curato dall'admin.

    Distinto dalla knowledge base file-based (`strategy_memory`): qui ogni voce e'
    strutturata (nome, fattori collegati, quando raccomandarla) ed editabile via UI.
    Solo le voci con `status == "certified"` e `is_active` entrano nel contesto della
    chat, quando i `factor_codes` collegati risultano salienti nel profilo dello
    studente (gating `match_mode`). I testi sono multilingua (sorgente IT) con le
    altre lingue generabili via Ollama e poi revisionabili dall'admin.
    """

    __tablename__ = "certified_strategies"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, index=True, nullable=False)  # id stabile per il contesto chat
    name_it = Column(String, nullable=True)
    name_en = Column(String, nullable=True)
    name_es = Column(String, nullable=True)
    name_sv = Column(String, nullable=True)
    # In quali casi e' raccomandata
    recommended_when_it = Column(Text, nullable=True)
    recommended_when_en = Column(Text, nullable=True)
    recommended_when_es = Column(Text, nullable=True)
    recommended_when_sv = Column(Text, nullable=True)
    # La strategia: cosa fare
    description_it = Column(Text, nullable=True)
    description_en = Column(Text, nullable=True)
    description_es = Column(Text, nullable=True)
    description_sv = Column(Text, nullable=True)
    name_i18n = Column(JSON, nullable=True)
    recommended_when_i18n = Column(JSON, nullable=True)
    description_i18n = Column(JSON, nullable=True)
    factor_codes = Column(JSON, nullable=True)        # ["C6","A2",...]
    # any = saliente almeno un fattore; all = combinazione (tutti salienti insieme)
    match_mode = Column(String, nullable=False, default="any")
    questionnaire_types = Column(JSON, nullable=True)  # ["QSA",...] scope chat, derivato dai fattori
    keywords = Column(String, nullable=True)           # ranking semantico/keyword
    status = Column(String, nullable=False, default="draft")  # draft | certified
    certified_by = Column(String, nullable=True)       # provenienza certificazione
    source_reference = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())



class CertifiedReading(Base):
    """Catalogo di letture, film e altri materiali certificati dall'admin.

    Parallelo a `CertifiedStrategy` ma con una chiave d'aggancio diversa: una
    strategia si lega a un codice fattore, una lettura si lega a un TEMA
    (`reading_themes.READING_THEMES`). I codici fattore restano possibili ma
    facoltativi, perche' un romanzo o un film non mappano su un costrutto.

    I testi sono in un unico campo JSON per lingua (sei lingue), non una colonna
    per lingua: il catalogo delle strategie ha colonne solo per it/en/es/sv e su
    francese e tedesco ricade sull'italiano.
    """

    __tablename__ = "certified_readings"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, index=True, nullable=False)
    # essay | fiction | film | documentary | series | article | podcast | video
    kind = Column(String, nullable=False, default="essay")
    title = Column(String, nullable=False)            # titolo con cui e' conosciuta in italiano
    original_title = Column(String, nullable=True)    # titolo originale, se diverso
    creators = Column(JSON, nullable=True)            # ["Autrice", "Regista", ...]
    year = Column(Integer, nullable=True)
    publisher = Column(String, nullable=True)         # editore, produzione, rivista
    identifiers = Column(JSON, nullable=True)         # {"isbn": ..., "doi": ..., "openalex": ...}

    themes = Column(JSON, nullable=True)              # ["ansia-e-prestazione", ...] chiave d'aggancio
    factor_codes = Column(JSON, nullable=True)        # opzionale: ["A1", "S1"]
    questionnaire_types = Column(JSON, nullable=True) # opzionale: limita a certi strumenti
    audience = Column(JSON, nullable=True)            # ["secondaria", "universita", "adulti"]
    available_languages = Column(JSON, nullable=True) # lingue in cui l'opera esiste

    # {lang: testo} per it/en/es/fr/de/sv
    summary_i18n = Column(JSON, nullable=True)        # cosa aiuta a capire, una frase
    why_i18n = Column(JSON, nullable=True)            # perche' e' pertinente a quel tema
    synopsis_i18n = Column(JSON, nullable=True)       # di cosa parla l'opera, non a cosa serve
    # provenienza della sinossi: {"source", "url", "retrieved_at", "license", "approved_by"}
    synopsis_source = Column(JSON, nullable=True)

    is_sensitive = Column(Boolean, nullable=False, default=False)
    content_warning = Column(Text, nullable=True)     # obbligatorio quando is_sensitive
    where_to_find = Column(Text, nullable=True)       # biblioteca, editore; mai copie pirata

    source_reference = Column(Text, nullable=True)    # da dove viene la raccomandazione
    certified_by = Column(String, nullable=True)
    # esito della verifica bibliografica: {"source": "openalex", "checked_at": ..., "match": true}
    verification = Column(JSON, nullable=True)
    status = Column(String, nullable=False, default="draft")   # draft | certified
    is_active = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class WebLookupCache(Base):
    """Memoria delle consultazioni esterne.

    La stessa domanda non ricompra la stessa pagina: senza cache una sinossi
    richiesta due volte sono due chiamate di rete dentro un turno di chat.
    """

    __tablename__ = "web_lookup_cache"

    id = Column(Integer, primary_key=True, index=True)
    cache_key = Column(String, unique=True, index=True, nullable=False)
    query = Column(Text, nullable=False)
    language = Column(String, nullable=False, default="it")
    sources = Column(JSON, nullable=True)     # fonti interrogate, in ordine
    payload = Column(JSON, nullable=True)     # lista di LookupResult serializzati
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())


class GroupShare(Base):
    """Condivisione di una classe con altri docenti/admin.

    Permette a un docente di condividere la visibilita' della classe con
    altri docenti, che potranno vedere la classe, i suoi studenti e
    agganciarla ai propri piani di somministrazione.
    """

    __tablename__ = "group_shares"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, index=True, nullable=False)
    shared_with_username = Column(String, index=True, nullable=False)
    granted_by_username = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TelegramAccountLink(Base):
    """Mapping verificato telegram_user_id -> username CounselorBot."""

    __tablename__ = "telegram_account_links"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False, index=True)
    telegram_user_id = Column(BigInteger, nullable=False, unique=True, index=True)
    telegram_chat_id = Column(BigInteger, nullable=False)
    telegram_username = Column(String, nullable=True)
    # Gruppo di somministrazione (deep link g_<codice piano|codice contatto>)
    administration_plan_id = Column(Integer, index=True, nullable=True)
    research_contact_id = Column(Integer, index=True, nullable=True)
    linked_at = Column(DateTime(timezone=True), server_default=func.now())
    revoked_at = Column(DateTime(timezone=True), nullable=True)


class TelegramLinkCode(Base):
    """Codice temporaneo monouso generato dalla web app per /link (salvato hashato)."""

    __tablename__ = "telegram_link_codes"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False, index=True)
    code_hash = Column(String, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TelegramConversationState(Base):
    """Stato corrente della conversazione Telegram di un utente (una riga per utente)."""

    __tablename__ = "telegram_conversation_states"

    id = Column(Integer, primary_key=True, index=True)
    telegram_user_id = Column(BigInteger, nullable=False, unique=True, index=True)
    telegram_chat_id = Column(BigInteger, nullable=False)
    username = Column(String, nullable=False, index=True)
    state = Column(String, nullable=False, default="idle")  # idle|choose_instrument|enter_scores|confirm_scores|in_step|pqbl
    questionnaire_type = Column(String, nullable=True)
    session_id = Column(String, nullable=True)
    conversation_id = Column(String, nullable=True)
    scores = Column(JSON, nullable=True)
    step_id = Column(String, nullable=True)
    language = Column(String, nullable=False, default="it")
    counselor_id = Column(Integer, nullable=True)
    # Sessione pQBL in corso: {session_id, document_id, queue[], index, questions{}}.
    pqbl_state = Column(JSON, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TeacherNote(Base):
    """Nota o messaggio del docente sul profilo di uno studente del suo piano.

    kind='note': annotazione (visibile allo studente solo se visible_to_student).
    kind='message': messaggio allo studente (sempre visibile nel profilo web,
    recapitato anche via bot Telegram se collegato); la riga e' anche il log
    dell'invio.
    """

    __tablename__ = "teacher_notes"

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, index=True, nullable=True)   # legacy: note create sui piani
    group_id = Column(Integer, index=True, nullable=True)  # classe di riferimento
    username = Column(String, index=True, nullable=False)  # studente
    author_username = Column(String, index=True, nullable=False)
    kind = Column(String, nullable=False, default="note")  # note | message
    text = Column(Text, nullable=False)
    visible_to_student = Column(Boolean, nullable=False, default=False)
    telegram_delivered = Column(Boolean, nullable=True)  # solo kind=message
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class StudentGroup(Base):
    """Classe/gruppo di studenti, entita' autonoma del docente.

    Indipendente dalle somministrazioni: la classe esiste prima e a prescindere
    dai questionari; un piano di somministrazione puo' agganciarla (group_id).
    """

    __tablename__ = "student_groups"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, nullable=False, unique=True, index=True)  # GR-XXXXXX, per inviti
    name = Column(String, nullable=False)
    school = Column(String, nullable=True)  # nome scuola/istituto (testo libero)
    # Fascia della classe: secondaria | universita | adulti. Serve a filtrare le
    # letture certificate quando lo studente non ha compilato il taccuino.
    school_level = Column(String, nullable=True)
    owner_username = Column(String, index=True, nullable=False)  # docente/ricercatore
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class GroupMembership(Base):
    """Appartenenza di uno studente a una classe (link invito o codice classe)."""

    __tablename__ = "group_memberships"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, index=True, nullable=False)
    username = Column(String, index=True, nullable=False)
    joined_via = Column(String, nullable=False, default="web")  # web | telegram | teacher
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Skill(Base):
    """Unita' dichiarativa iniettabile nel prompt della chat.

    La definizione e' editabile dall'admin: condizioni di attivazione,
    istruzioni in inglese, handler Python opzionale per il materiale
    recuperato. Entra in chat solo se `status == "published"` e `is_active`,
    ed e' agganciata allo strumento/step da `GuidedStepSkill`.
    """

    __tablename__ = "skills"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    # Letta dal router LLM: descrive quando la skill e' utile.
    description = Column(Text, nullable=True)
    instructions_i18n = Column(JSON, nullable=True)   # English-only contract: {"en": "..."}
    conditions = Column(JSON, nullable=True)          # gating dichiarativo
    handler = Column(String, nullable=True)           # nome whitelisted
    handler_params = Column(JSON, nullable=True)
    routing = Column(String, nullable=False, default="optional")  # always | optional
    slot = Column(String, nullable=False, default="knowledge")    # section | knowledge | directive_tail
    max_chars = Column(Integer, nullable=False, default=1400)
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    status = Column(String, nullable=False, default="draft")      # draft | published
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class GuidedStepSkill(Base):
    """Aggancio di una skill a uno step del percorso guidato.

    `step_id == "*"` vale per tutti gli step dello strumento; un aggancio
    esplicito sullo stesso step vince sul wildcard.
    """

    __tablename__ = "guided_step_skills"

    id = Column(Integer, primary_key=True, index=True)
    questionnaire_type = Column(String, nullable=False, index=True)
    step_id = Column(String, nullable=False, index=True)
    skill_id = Column(Integer, nullable=False, index=True)
    sort_order = Column(Integer, nullable=False, default=0)
    enabled = Column(Boolean, nullable=False, default=True)
    override_params = Column(JSON, nullable=True)


class IdeaMapRevision(Base):
    """Mappa della sessione Idea, append-only.

    La revisione piu' recente per `session_id` e' la mappa corrente; le
    precedenti sono lo storico del pensiero e restano leggibili. Non si
    modifica una revisione: se ne aggiunge un'altra.
    """

    __tablename__ = "idea_map_revisions"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False, index=True)
    session_id = Column(String, nullable=False, index=True)
    spec = Column(JSON, nullable=False)
    source = Column(String, nullable=False, default="turn")  # turn|manual|synthesis|focus
    step_id = Column(String, nullable=True)
    # Ramo scelto dalla persona. Vuoto = vale quello derivato (il task aperto
    # piu' profondo). Viaggia con la revisione perche' anche spostarsi fra i
    # rami e' un momento del ragionamento, e lo storico deve poterlo mostrare.
    focus_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class IdeaReference(Base):
    """Un solo documento di riferimento attivo per sessione Idea e utente."""

    __tablename__ = "idea_references"
    __table_args__ = (
        UniqueConstraint("username", "session_id", name="uq_idea_reference_owner_session"),
    )

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False, index=True)
    session_id = Column(String, nullable=False, index=True)
    filename = Column(String, nullable=False)
    kind = Column(String, nullable=False)
    text = Column(Text, nullable=False)
    truncated = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ContentLanguageVersion(Base):
    """Stato di certificazione di un contenuto in una lingua.

    Autorita' sullo STATO, non sul contenuto: il testo resta nella sua tabella.
    Tenere separate le due cose evita che una promozione riscriva un testo o che
    una correzione di testo cambi in silenzio uno stato di certificazione.
    """

    __tablename__ = "content_language_versions"
    __table_args__ = (
        UniqueConstraint("content_type", "content_key", "locale", name="uq_content_language_version"),
    )

    id = Column(Integer, primary_key=True, index=True)
    content_type = Column(String, nullable=False, index=True)   # instrument | certified_strategy | ...
    content_key = Column(String, nullable=False, index=True)    # codice strumento, slug, ...
    locale = Column(String, nullable=False, index=True)
    status = Column(String, nullable=False, default="draft")
    source = Column(String, nullable=True)                      # human | published:<rif> | llm:<modello>
    version_label = Column(String, nullable=True)               # aggancia le validation_responses
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
