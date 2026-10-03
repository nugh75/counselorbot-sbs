"""Authenticated self-service settings and administrator-only feature policy."""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict, Field, SecretStr
from sqlalchemy.orm import Session

from .. import auth, models, personal_api
from ..ai_service import AIService
from ..database import get_db
from .chatgpt import browser_mutation


class PrivateRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def private(request):
            try:
                response = await handler(request)
            except RequestValidationError:
                response = JSONResponse({"detail": "Invalid personal API settings"}, status_code=422)
            except HTTPException as exc:
                response = JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
            response.headers["Cache-Control"] = "no-store"
            return response

        return private


router = APIRouter(route_class=PrivateRoute)


class PolicyUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = Field(strict=True)


class SettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: str = Field(min_length=1, max_length=40)
    model: str = Field(min_length=1, max_length=200)
    api_key: SecretStr | None = None
    enabled: bool = Field(default=False, strict=True)


async def current_owner(request: Request, identity: dict = Depends(auth.get_identity)):
    if not identity.get("authenticated") or not identity.get("username"):
        raise HTTPException(401, "Non autenticato")
    if request.headers.get("X-View-As") or request.query_params.get("view_as") or identity["username"] in auth.VIEW_AS_DEMO_ACCOUNTS:
        raise HTTPException(403, "Accesso alle sole impostazioni personali")
    return identity


async def require_admin(identity: dict = Depends(current_owner)):
    if not identity.get("is_admin"):
        raise HTTPException(403, "Accesso riservato agli amministratori")
    return identity


def policy(db):
    return personal_api.installation_status(db)


@router.get("/admin/personal-api-policy")
def read_policy(identity: dict = Depends(require_admin), db: Session = Depends(get_db)):
    return policy(db)


@router.put("/admin/personal-api-policy", dependencies=[Depends(browser_mutation)])
def write_policy(request: PolicyUpdate, identity: dict = Depends(require_admin), db: Session = Depends(get_db)):
    try:
        return personal_api.set_installation_enabled(db, request.enabled)
    except personal_api.PersonalAPIError as exc:
        raise HTTPException(409, "personalAPI.errors." + exc.code) from None


@router.get("/user/api-settings")
def read_settings(identity: dict = Depends(current_owner), db: Session = Depends(get_db)):
    from ..chatgpt_connections import enabled
    row = db.query(models.PersonalAPISettings).filter_by(username=identity["username"]).first()
    allowed = personal_api.feature_enabled(db)
    return {
        "available": allowed,
        "chatgpt_enabled": enabled(db),
        "providers": list(personal_api.PROVIDERS),
        "configured": bool(row),
        "provider": row.provider if row else "openai",
        "model": row.model_name if row else "",
        "enabled": bool(row and row.enabled),
        "active": bool(allowed and row and row.enabled),
    }


@router.put("/user/api-settings", dependencies=[Depends(browser_mutation)])
def write_settings(request: SettingsUpdate, identity: dict = Depends(current_owner), db: Session = Depends(get_db)):
    if not personal_api.feature_enabled(db):
        raise HTTPException(403, "Le API personali sono disabilitate dall'amministratore")
    provider, model = request.provider.strip(), request.model.strip()
    if provider not in personal_api.PROVIDERS or not model:
        raise HTTPException(422, "Provider o modello non valido")
    personal_api.lock_choice(db, identity["username"])
    row = db.query(models.PersonalAPISettings).filter_by(username=identity["username"]).with_for_update().first()
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
    if request.enabled:
        db.query(models.ChatGPTConnection).filter_by(username=identity["username"]).update({"use_subscription": False})
    db.commit()
    return read_settings(identity, db)


@router.delete("/user/api-settings", dependencies=[Depends(browser_mutation)])
def remove_settings(identity: dict = Depends(current_owner), db: Session = Depends(get_db)):
    # Removal remains available while the feature is disabled.
    db.query(models.PersonalAPISettings).filter_by(username=identity["username"]).delete()
    db.commit()
    return read_settings(identity, db)


@router.post("/user/api-settings/verify", dependencies=[Depends(browser_mutation)])
def verify_settings(identity: dict = Depends(current_owner), db: Session = Depends(get_db)):
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
