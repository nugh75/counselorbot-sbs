from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
import json

# Token
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

# User
class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    is_admin: bool

    class Config:
        from_attributes = True

# Config
class ConfigBase(BaseModel):
    key: str
    value: str
    description: Optional[str] = None

class ConfigCreate(ConfigBase):
    pass

class ConfigResponse(ConfigBase):
    class Config:
        from_attributes = True

# Log
class LogBase(BaseModel):
    session_id: str
    action: str
    details: Dict[str, Any]

class LogCreate(LogBase):
    pass

class LogResponse(LogBase):
    id: int
    timestamp: datetime
    user_id: Optional[int]
    username: Optional[str] = None
    email: Optional[str] = None
    anonymous_research_code: Optional[str] = None
    provider: Optional[str] = None
    model_name: Optional[str] = None
    questionnaire_type: Optional[str] = None
    phase: Optional[str] = None
    mode: Optional[str] = None
    response_id: Optional[str] = None
    cost_usd: Optional[float] = None
    helpful: Optional[bool] = None
    details: Optional[Union[Dict[str, Any], str]] = None

    @validator('details', pre=True)
    def parse_details(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (ValueError, TypeError):
                return {"raw_content": v}
        return v

    class Config:
        from_attributes = True


class PromptAuditRequest(BaseModel):
    questionnaire_type: Optional[str] = None
    language: Optional[str] = "it"
    phase: Optional[str] = None
    mode: str = "generic"
    use_phase_prompt: bool = False
    message: str = ""
    scores_context: str = ""
    session_id: Optional[str] = None
    counselor_id: Optional[int] = None
    max_tokens: Optional[int] = None
    include_knowledge: bool = True
    include_history: bool = False


class PromptAuditMatrixRequest(BaseModel):
    questionnaire_type: str = "QSA"
    language: Optional[str] = "it"
    counselor_ids: Optional[List[int]] = None
    scores_context: str = ""
    include_knowledge: bool = False
    max_tokens: Optional[int] = 700

# Survey
# GuidedStep
class GuidedStepBase(BaseModel):
    id: str
    sort_order: int
    label: str
    prompt: str
    system_prompt_mode: str = "generic"
    color_theme: str = "blue"
    questionnaire_type: str = "QSA"

class GuidedStepCreate(GuidedStepBase):
    pass

class GuidedStepUpdate(BaseModel):
    label: Optional[str] = None
    prompt: Optional[str] = None
    system_prompt_mode: Optional[str] = None
    color_theme: Optional[str] = None

class GuidedStepResponse(GuidedStepBase):
    class Config:
        from_attributes = True

class ReorderItem(BaseModel):
    id: str
    sort_order: int

# Survey
class SurveyCreate(BaseModel):
    eta: Optional[str] = None
    sesso: Optional[str] = None
    istruzione: Optional[str] = None
    tipo_istituto: Optional[str] = None
    provenienza: Optional[str] = None
    area_studio: Optional[str] = None
    paese: Optional[str] = None
    
    q_utile: Optional[int] = None
    q_pertinente: Optional[int] = None
    q_chiaro: Optional[int] = None
    q_dettaglio: Optional[int] = None
    q_facile: Optional[int] = None
    q_veloce: Optional[int] = None
    q_fiducia: Optional[int] = None
    q_riflettere: Optional[int] = None
    q_coinvolgente: Optional[int] = None
    q_consiglierei: Optional[int] = None

    strumenti_utilizzati: Optional[List[str]] = None
    counselor_utilizzato: Optional[str] = None
    feedback_aperto: Optional[str] = None

class SurveyResponseSchema(SurveyCreate):
    id: int
    submitted_at: datetime
    
    class Config:
        from_attributes = True


class StrategyFeedbackCreate(BaseModel):
    strategy_ids: List[str] = Field(default_factory=list)
    response_id: Optional[str] = None
    questionnaire_type: Optional[str] = None
    phase: Optional[str] = None
    language: Optional[str] = None
    helpful: bool


# QuestionnaireResult
class QuestionnaireResultCreate(BaseModel):
    session_id: str
    questionnaire_type: str
    scores: Optional[Dict[str, Any]] = None
    username: Optional[str] = None
    administration_plan_id: Optional[int] = None
    research_contact_id: Optional[int] = None


class QuestionnaireResultResponse(BaseModel):
    id: int
    session_id: str
    questionnaire_type: str
    scores: Optional[Union[Dict[str, Any], str]] = None
    username: Optional[str] = None
    administration_plan_id: Optional[int] = None
    research_contact_id: Optional[int] = None
    submitted_at: datetime

    @validator('scores', pre=True)
    def parse_scores(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (ValueError, TypeError):
                return {"raw": v}
        return v

    class Config:
        from_attributes = True


class ValidationResponseResponse(BaseModel):
    id: int
    session_id: str
    instrument_code: str
    locale: str
    version_label: str
    answers: Optional[Union[Dict[str, Any], str]] = None
    factor_scores: Optional[Union[Dict[str, Any], str]] = None
    response_metadata: Optional[Union[Dict[str, Any], str]] = None
    username: Optional[str] = None
    administration_plan_id: Optional[int] = None
    research_contact_id: Optional[int] = None
    duration_seconds: Optional[int] = None
    submitted_at: datetime

    @validator('answers', 'factor_scores', 'response_metadata', pre=True)
    def parse_json_fields(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (ValueError, TypeError):
                return {"raw": v}
        return v

    class Config:
        from_attributes = True


class ValidationSummaryResponse(BaseModel):
    total: int
    by_locale: Dict[str, int]
    by_version: Dict[str, int]
    latest_submitted_at: Optional[datetime] = None


class TrainingExampleBase(BaseModel):
    instrument_code: str = "QSA"
    locale: str = "it"
    phase: str
    step_label: Optional[str] = None
    scores: Optional[Dict[str, Any]] = None
    scores_context: str
    student_message: str
    assistant_answer: str
    status: str = "pending"
    review_notes: Optional[str] = None
    auto_score: Optional[Dict[str, Any]] = None
    source: str = "manual"


class TrainingExampleCreate(TrainingExampleBase):
    pass


class TrainingExampleUpdate(BaseModel):
    assistant_answer: Optional[str] = None
    status: Optional[str] = None
    review_notes: Optional[str] = None


class TrainingGenerateRequest(BaseModel):
    instrument_code: str = "QSA"
    locale: str = "it"
    phase: str
    count: int = Field(default=5, ge=1, le=50)


class TrainingSummaryResponse(BaseModel):
    total: int
    by_status: Dict[str, int]
    by_locale: Dict[str, int]
    by_phase: Dict[str, int]


class TrainingExampleResponse(TrainingExampleBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    @validator('scores', 'auto_score', pre=True)
    def parse_training_json_fields(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (ValueError, TypeError):
                return {"raw": v}
        return v

    class Config:
        from_attributes = True


class ResearchContactBase(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    institution: Optional[str] = None
    role: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True


class ResearchContactCreate(ResearchContactBase):
    code: Optional[str] = None


class ResearchContactUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    institution: Optional[str] = None
    role: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class ResearchContactResponse(ResearchContactBase):
    id: int
    code: str
    source: str = "manual"
    ext_username: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AdministrationPlanResearcherInput(BaseModel):
    research_contact_id: Optional[int] = None
    external_name: Optional[str] = None


class AdministrationPlanResearcherResponse(BaseModel):
    id: int
    research_contact_id: Optional[int] = None
    external_name: Optional[str] = None
    name: str
    email: Optional[str] = None
    institution: Optional[str] = None


class AdministrationPlanBase(BaseModel):
    title: str
    instrument_code: str = "QSA"
    locale: str = "en"
    scheduled_at: Optional[datetime] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    status: str = "planned"
    researchers: List[AdministrationPlanResearcherInput] = Field(default_factory=list)


class AdministrationPlanCreate(AdministrationPlanBase):
    code: Optional[str] = None


class AdministrationPlanUpdate(BaseModel):
    title: Optional[str] = None
    instrument_code: Optional[str] = None
    locale: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    researchers: Optional[List[AdministrationPlanResearcherInput]] = None


class AdministrationPlanResponse(BaseModel):
    id: int
    code: str
    title: str
    instrument_code: str
    locale: str
    scheduled_at: Optional[datetime] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    status: str
    created_by_username: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    researchers: List[AdministrationPlanResearcherResponse] = Field(default_factory=list)
    responses_count: int = 0


class AdministrationPlanResponsesResponse(BaseModel):
    plan: AdministrationPlanResponse
    questionnaire_results: List[QuestionnaireResultResponse]
    validation_responses: List[ValidationResponseResponse]


# --- Domande suggerite dell'assistente docenti ---

class AssistantQuestionBase(BaseModel):
    topic: str
    language: str = "it"
    text: str
    sort_order: int = 0
    is_active: bool = True


class AssistantQuestionCreate(AssistantQuestionBase):
    pass


class AssistantQuestionUpdate(BaseModel):
    topic: Optional[str] = None
    language: Optional[str] = None
    text: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class AssistantQuestionResponse(AssistantQuestionBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# --- Catalogo strumenti (item + regole di scala) ---

class InstrumentBase(BaseModel):
    code: str
    name_it: Optional[str] = None
    name_en: Optional[str] = None
    name_es: Optional[str] = None
    name_sv: Optional[str] = None
    response_scale_min: int = 1
    response_scale_max: int = 4
    response_labels: Optional[Dict[str, Any]] = None
    report_scale_type: str = "stanine"
    status: str = "experimental"


class InstrumentCreate(InstrumentBase):
    pass


class InstrumentUpdate(BaseModel):
    name_it: Optional[str] = None
    name_en: Optional[str] = None
    name_es: Optional[str] = None
    name_sv: Optional[str] = None
    response_scale_min: Optional[int] = None
    response_scale_max: Optional[int] = None
    response_labels: Optional[Dict[str, Any]] = None
    report_scale_type: Optional[str] = None
    status: Optional[str] = None


class InstrumentResponse(InstrumentBase):
    class Config:
        from_attributes = True


class FactorBase(BaseModel):
    instrument_code: str
    code: str
    sort_order: int = 0
    dimension: Optional[str] = None
    orientation: str = "resource"
    is_interpretation_inverted: bool = False
    label_it: Optional[str] = None
    label_en: Optional[str] = None
    label_es: Optional[str] = None
    label_sv: Optional[str] = None
    description_it: Optional[str] = None
    description_en: Optional[str] = None
    description_es: Optional[str] = None
    description_sv: Optional[str] = None


class FactorCreate(FactorBase):
    pass


class FactorUpdate(BaseModel):
    code: Optional[str] = None
    sort_order: Optional[int] = None
    dimension: Optional[str] = None
    orientation: Optional[str] = None
    is_interpretation_inverted: Optional[bool] = None
    label_it: Optional[str] = None
    label_en: Optional[str] = None
    label_es: Optional[str] = None
    label_sv: Optional[str] = None
    description_it: Optional[str] = None
    description_en: Optional[str] = None
    description_es: Optional[str] = None
    description_sv: Optional[str] = None


class FactorResponse(FactorBase):
    id: int

    class Config:
        from_attributes = True


class ItemBase(BaseModel):
    instrument_code: str
    item_number: int
    sort_order: int = 0
    factor_code: Optional[str] = None
    reverse_scoring: bool = False
    text_it: Optional[str] = None
    text_en: Optional[str] = None
    text_es: Optional[str] = None
    text_sv: Optional[str] = None
    active: bool = True


class ItemCreate(ItemBase):
    pass


class ItemUpdate(BaseModel):
    item_number: Optional[int] = None
    sort_order: Optional[int] = None
    factor_code: Optional[str] = None
    reverse_scoring: Optional[bool] = None
    text_it: Optional[str] = None
    text_en: Optional[str] = None
    text_es: Optional[str] = None
    text_sv: Optional[str] = None
    active: Optional[bool] = None


class ItemResponse(ItemBase):
    id: int

    class Config:
        from_attributes = True


class NormThresholdBase(BaseModel):
    instrument_code: str
    locale: str = "en"
    factor_code: str
    raw_min: int
    raw_max: int
    stanine: int
    norm_set_label: Optional[str] = None
    status: str = "provisional"


class NormThresholdCreate(NormThresholdBase):
    pass


class NormThresholdResponse(NormThresholdBase):
    id: int

    class Config:
        from_attributes = True


class ScoreRequest(BaseModel):
    session_id: str
    locale: str
    answers: Dict[int, int]
    save: bool = True
    save_validation: bool = False
    version_label: Optional[str] = "draft"
    response_metadata: Optional[Dict[str, Any]] = None
    duration_seconds: Optional[int] = None


# --- Learner profile (modello del discente auto-dichiarato) ---

LEARNER_PROFILE_FIELDS = ("context", "goal", "main_difficulty", "tried", "notes", "gender", "age")
LEARNER_PROFILE_MAX_FIELD_CHARS = 600


class LearnerProfileSave(BaseModel):
    """Salvataggio = nuova revisione. Solo i campi noti, ognuno con cap caratteri."""
    context: Optional[str] = None
    goal: Optional[str] = None
    main_difficulty: Optional[str] = None
    tried: Optional[str] = None
    notes: Optional[str] = None
    gender: Optional[str] = None
    age: Optional[str] = None
    source: str = "manual"  # intake|session_start|session_end|manual
    session_id: Optional[str] = None

    @validator("context", "goal", "main_difficulty", "tried", "notes", "gender", "age", pre=True)
    def _trim_and_cap(cls, v):
        if v is None:
            return None
        return str(v).strip()[:LEARNER_PROFILE_MAX_FIELD_CHARS]

    @validator("source")
    def _valid_source(cls, v):
        allowed = {"intake", "session_start", "session_end", "manual"}
        return v if v in allowed else "manual"


class LearnerProfileResponse(BaseModel):
    id: int
    data: Dict[str, Any]
    source: str
    session_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


LEARNER_REFLECTION_MAX_CHARS = 2000
BOOKLET_MAX_FIELD_CHARS = 2000


def _cap_json_strings(value: Any, limit: int = BOOKLET_MAX_FIELD_CHARS) -> Any:
    if isinstance(value, str):
        return value.strip()[:limit]
    if isinstance(value, list):
        return [_cap_json_strings(item, limit) for item in value]
    if isinstance(value, dict):
        return {str(key)[:120]: _cap_json_strings(item, limit) for key, item in value.items()}
    return value


class LearnerProfileReflectionCreate(BaseModel):
    note: str
    current_revision_id: Optional[int] = None
    previous_revision_id: Optional[int] = None
    session_id: Optional[str] = None

    @validator("note", pre=True)
    def _trim_note(cls, v):
        text = str(v or "").strip()[:LEARNER_REFLECTION_MAX_CHARS]
        if not text:
            raise ValueError("note is required")
        return text

    @validator("session_id", pre=True)
    def _trim_session_id(cls, v):
        if v is None:
            return None
        return str(v).strip()[:160] or None


class LearnerProfileReflectionResponse(BaseModel):
    id: int
    note: str
    current_revision_id: Optional[int] = None
    previous_revision_id: Optional[int] = None
    session_id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class StudentBookletSave(BaseModel):
    data: Dict[str, Any] = Field(default_factory=dict)

    @validator("data", pre=True)
    def _trim_booklet_data(cls, v):
        if not isinstance(v, dict):
            return {}
        return _cap_json_strings(v)


class StudentBookletResponse(BaseModel):
    id: int
    username: str
    session_id: Optional[str] = None
    questionnaire_type: str
    data: Dict[str, Any]
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# --- Model presets (provider + modello + parametri riusabili) ---
class ModelPresetBase(BaseModel):
    name: str
    provider: str
    model: str
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    disable_thinking: bool = False
    reasoning_budget: Optional[int] = None
    notes: Optional[str] = None
    is_active: bool = True


class ModelPresetCreate(ModelPresetBase):
    pass


class ModelPresetUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    disable_thinking: Optional[bool] = None
    reasoning_budget: Optional[int] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class ModelPresetResponse(ModelPresetBase):
    id: int
    created_at: datetime
    provider_configured: bool = False  # True se il provider ha una chiave attiva

    class Config:
        from_attributes = True


# --- Benchmark in-app ---
class BenchmarkStartRequest(BaseModel):
    preset_ids: List[int] = Field(default_factory=list)
    language: str = "it"


class BenchmarkRunResponse(BaseModel):
    id: int
    run_id: str
    status: str
    language: str
    created_by: Optional[str] = None
    presets: Optional[List[Dict[str, Any]]] = None
    summary: Optional[List[Dict[str, Any]]] = None
    error: Optional[str] = None
    created_at: datetime
    finished_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# --- Counselor (persona configurabile) ---
class CounselorBase(BaseModel):
    slug: str
    name: str
    description: Optional[str] = None
    description_i18n: Optional[dict] = None
    persona: Optional[str] = None
    avatar: Optional[str] = None
    preset_id: Optional[int] = None
    questionnaire_types: Optional[List[str]] = None
    language: str = "it"
    sort_order: int = 0
    is_active: bool = True


class CounselorCreate(CounselorBase):
    pass


class CounselorUpdate(BaseModel):
    slug: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    description_i18n: Optional[dict] = None
    persona: Optional[str] = None
    avatar: Optional[str] = None
    preset_id: Optional[int] = None
    questionnaire_types: Optional[List[str]] = None
    language: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class CounselorResponse(CounselorBase):
    id: int
    created_at: datetime
    # info derivata dal preset (comodita' per la UI admin)
    provider: Optional[str] = None
    model: Optional[str] = None

    class Config:
        from_attributes = True


class CounselorPublic(BaseModel):
    """Vista pubblica lato utente: nessun dettaglio interno (preset/persona)."""
    id: int
    slug: str
    name: str
    description: Optional[str] = None
    avatar: Optional[str] = None
    questionnaire_types: Optional[List[str]] = None
    language: str = "it"
    is_active: bool = True
    # "local" (Ollama/llama.cpp) | "external" (API a pagamento). Derivato dal preset.
    model_origin: Optional[str] = None

    class Config:
        from_attributes = True


# --- Catalogo strategie certificate (admin) ---
class CertifiedStrategyBase(BaseModel):
    slug: str
    name_it: Optional[str] = None
    name_en: Optional[str] = None
    name_es: Optional[str] = None
    name_sv: Optional[str] = None
    recommended_when_it: Optional[str] = None
    recommended_when_en: Optional[str] = None
    recommended_when_es: Optional[str] = None
    recommended_when_sv: Optional[str] = None
    description_it: Optional[str] = None
    description_en: Optional[str] = None
    description_es: Optional[str] = None
    description_sv: Optional[str] = None
    factor_codes: Optional[List[str]] = None
    match_mode: str = "any"  # any | all
    questionnaire_types: Optional[List[str]] = None
    keywords: Optional[str] = None
    status: str = "draft"  # draft | certified
    certified_by: Optional[str] = None
    source_reference: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True


class CertifiedStrategyCreate(CertifiedStrategyBase):
    pass


class CertifiedStrategyUpdate(BaseModel):
    slug: Optional[str] = None
    name_it: Optional[str] = None
    name_en: Optional[str] = None
    name_es: Optional[str] = None
    name_sv: Optional[str] = None
    recommended_when_it: Optional[str] = None
    recommended_when_en: Optional[str] = None
    recommended_when_es: Optional[str] = None
    recommended_when_sv: Optional[str] = None
    description_it: Optional[str] = None
    description_en: Optional[str] = None
    description_es: Optional[str] = None
    description_sv: Optional[str] = None
    factor_codes: Optional[List[str]] = None
    match_mode: Optional[str] = None
    questionnaire_types: Optional[List[str]] = None
    keywords: Optional[str] = None
    status: Optional[str] = None
    certified_by: Optional[str] = None
    source_reference: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class CertifiedStrategyResponse(CertifiedStrategyBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
