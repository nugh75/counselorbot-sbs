"""Authenticated self-service settings and administrator-only feature policy."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, SecretStr
from sqlalchemy.orm import Session

from .. import auth, models, personal_api
from ..ai_service import AIService
from ..database import get_db

router = APIRouter()


class PolicyUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool


class SettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: str = Field(min_length=1, max_length=40)
    model: str = Field(min_length=1, max_length=200)
    api_key: SecretStr | None = None
    enabled: bool = False


async def require_admin(identity: dict = Depends(auth.get_identity)):
    if not identity.get("authenticated"):
        raise HTTPException(401, "Non autenticato")
    if not identity.get("is_admin"):
        raise HTTPException(403, "Accesso riservato agli amministratori")
    return identity


def policy(db):
    return {"enabled": personal_api.feature_enabled(db), "encryption_ready": personal_api.encryption_ready()}


@router.get("/admin/personal-api-policy")
def read_policy(identity: dict = Depends(require_admin), db: Session = Depends(get_db)):
    return policy(db)


@router.put("/admin/personal-api-policy")
def write_policy(request: PolicyUpdate, identity: dict = Depends(require_admin), db: Session = Depends(get_db)):
    if request.enabled and not personal_api.encryption_ready():
        raise HTTPException(409, "Configurare PERSONAL_API_ENCRYPTION_KEY sul server")
    row = db.query(models.Config).filter_by(key=personal_api.POLICY_KEY).first()
    if not row:
        row = models.Config(key=personal_api.POLICY_KEY)
        db.add(row)
    row.value = "true" if request.enabled else "false"
    db.commit()
    return policy(db)


@router.get("/user/api-settings")
def read_settings(identity: dict = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    row = db.query(models.PersonalAPISettings).filter_by(username=identity["username"]).first()
    allowed = personal_api.feature_enabled(db)
    return {
        "available": allowed,
        "providers": list(personal_api.PROVIDERS),
        "configured": bool(row),
        "provider": row.provider if row else "openai",
        "model": row.model_name if row else "",
        "enabled": bool(row and row.enabled),
        "active": bool(allowed and row and row.enabled),
    }


@router.put("/user/api-settings")
def write_settings(request: SettingsUpdate, identity: dict = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    if not personal_api.feature_enabled(db):
        raise HTTPException(403, "Le API personali sono disabilitate dall'amministratore")
    provider, model = request.provider.strip(), request.model.strip()
    if provider not in personal_api.PROVIDERS or not model:
        raise HTTPException(422, "Provider o modello non valido")
    row = db.query(models.PersonalAPISettings).filter_by(username=identity["username"]).first()
    key = request.api_key.get_secret_value().strip() if request.api_key else ""
    if len(key) > 4096 or any(char.isspace() for char in key):
        raise HTTPException(422, "Chiave API non valida")
    if not key and (not row or row.provider != provider):
        raise HTTPException(422, "Inserire una chiave per il provider selezionato")
    try:
        encrypted = personal_api.encrypt_key(identity["username"], provider, key) if key else row.encrypted_key
        if not key:
            personal_api.decrypt_key(row)
    except personal_api.PersonalAPIError as exc:
        raise HTTPException(409, str(exc)) from exc
    if not row:
        row = models.PersonalAPISettings(username=identity["username"])
        db.add(row)
    row.provider, row.model_name, row.encrypted_key, row.enabled = provider, model, encrypted, request.enabled
    db.commit()
    return read_settings(identity, db)


@router.delete("/user/api-settings")
def remove_settings(identity: dict = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    # Removal remains available while the feature is disabled.
    db.query(models.PersonalAPISettings).filter_by(username=identity["username"]).delete()
    db.commit()
    return read_settings(identity, db)


@router.post("/user/api-settings/verify")
def verify_settings(identity: dict = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    if not personal_api.feature_enabled(db):
        raise HTTPException(403, "Le API personali sono disabilitate dall'amministratore")
    row = db.query(models.PersonalAPISettings).filter_by(username=identity["username"]).first()
    if not row:
        raise HTTPException(409, "Salvare prima la configurazione personale")
    try:
        key = personal_api.decrypt_key(row)
    except personal_api.PersonalAPIError as exc:
        raise HTTPException(409, str(exc)) from exc
    ai = AIService(db)
    ai.config[f"api_key_{row.provider}"] = key
    return {"working": ai.verify_api_key(row.provider)}
