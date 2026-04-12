from pydantic import BaseModel, validator
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

class SurveyResponseSchema(SurveyCreate):
    id: int
    submitted_at: datetime
    
    class Config:
        from_attributes = True
