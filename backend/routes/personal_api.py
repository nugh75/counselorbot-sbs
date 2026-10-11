"""Authenticated self-service settings and administrator-only feature policy."""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict, Field, SecretStr
from sqlalchemy.orm import Session
from uuid import uuid4

from .. import personal_ai_audience as audience
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


class PersonalCounselorUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=1000)
    persona: str = Field(min_length=1, max_length=6000)


class ConnectionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=100)
    provider: str = Field(min_length=1, max_length=40)
    model: str = Field(min_length=1, max_length=200)
    api_key: SecretStr | None = None


class CounselorBinding(BaseModel):
    model_config = ConfigDict(extra="forbid")
    counselor_id: int = Field(gt=0, strict=True)
    # Exactly one of the two (#200).
    connection_id: str | None = Field(default=None, pattern=r"^[a-f0-9]{32}$")
    chatgpt_model: str | None = Field(default=None, min_length=1, max_length=200)
    reasoning: str | None = Field(default=None, max_length=16)  # #202


class RoutingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = Field(strict=True)
    default_connection_id: str | None = Field(default=None, pattern=r"^[a-f0-9]{32}$")
    default_chatgpt_model: str | None = Field(default=None, min_length=1, max_length=200)
    default_reasoning: str | None = Field(default=None, max_length=16)
    bindings: list[CounselorBinding] = Field(default_factory=list, max_length=100)


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


class AudienceSwitches(BaseModel):
    model_config = ConfigDict(extra="forbid")
    teachers: bool = Field(strict=True)
    students: bool = Field(strict=True)


class AudienceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    api: AudienceSwitches | None = None
    chatgpt: AudienceSwitches | None = None


@router.get("/admin/personal-ai-audiences")
def read_audiences(identity: dict = Depends(require_admin), db: Session = Depends(get_db)):
    return audience.audiences(db)


@router.put("/admin/personal-ai-audiences", dependencies=[Depends(browser_mutation)])
def write_audiences(request: AudienceUpdate, identity: dict = Depends(require_admin), db: Session = Depends(get_db)):
    # Teachers use their own sources for their chats; students in the chats of their classes.
    return audience.set_audiences(db, {feature: switches.model_dump() for feature, switches in
                                       (("api", request.api), ("chatgpt", request.chatgpt)) if switches is not None})


@router.get("/admin/personal-api-policy")
def read_policy(identity: dict = Depends(require_admin), db: Session = Depends(get_db)):
    return policy(db)


@router.put("/admin/personal-api-policy", dependencies=[Depends(browser_mutation)])
def write_policy(request: PolicyUpdate, identity: dict = Depends(require_admin), db: Session = Depends(get_db)):
    try:
        return personal_api.set_installation_enabled(db, request.enabled)
    except personal_api.PersonalAPIError as exc:
        raise HTTPException(409, "personalAPI.errors." + exc.code) from None


@router.get("/admin/class-api-sharing")
def read_class_sharing(identity: dict = Depends(require_admin), db: Session = Depends(get_db)):
    from .. import class_api_sharing
    return {"enabled": class_api_sharing.switch_on(db), "personal_api_enabled": personal_api.feature_enabled(db)}


@router.put("/admin/class-api-sharing", dependencies=[Depends(browser_mutation)])
def write_class_sharing(request: PolicyUpdate, identity: dict = Depends(require_admin), db: Session = Depends(get_db)):
    # #201: a separate switch; sharing also needs personal APIs to be enabled.
    from .. import class_api_sharing
    class_api_sharing.set_switch(db, request.enabled)
    return read_class_sharing(identity, db)


@router.get("/user/api-settings")
def read_settings(identity: dict = Depends(current_owner), db: Session = Depends(get_db)):
    from ..chatgpt_connections import enabled
    routing = db.get(models.PersonalAIRouting, identity["username"])
    row = (db.query(models.PersonalAPIConnection).filter_by(id=routing.default_connection_id, username=identity["username"]).first()
           if routing else db.query(models.PersonalAPISettings).filter_by(username=identity["username"]).first())
    blocked = not personal_api.class_allows(db, identity["username"])
    allowed = _sources_for(db, identity)[0] and not blocked
    return {
        "available": allowed,
        "class_blocked": blocked,  # #217: a class of this student does not allow own APIs
        "chatgpt_enabled": enabled(db),
        "providers": list(personal_api.PROVIDERS),
        "configured": bool(row),
        "provider": row.provider if row else "openai",
        "model": row.model_name if row else "",
        "enabled": bool(routing.enabled if routing else row and row.enabled),
        "active": bool(allowed and (routing.enabled if routing else row and row.enabled)),
        "counselors": [{"id": c.id, "name": c.name, "is_personal": bool(c.owner_username)}
                       for c in personal_api.visible_counselors(db, identity["username"]).filter_by(is_active=True)
                       .order_by(models.Counselor.sort_order, models.Counselor.id)],
    }


@router.put("/user/api-settings", dependencies=[Depends(browser_mutation)])
def write_settings(request: SettingsUpdate, identity: dict = Depends(current_owner), db: Session = Depends(get_db)):
    if not personal_api.feature_enabled(db):
        raise HTTPException(403, "Le API personali sono disabilitate dall'amministratore")
    if db.get(models.PersonalAIRouting, identity["username"]) is not None:
        raise HTTPException(409, "personalAPI.errors.configuration")
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
    if db.get(models.PersonalAIRouting, identity["username"]) is not None:
        raise HTTPException(409, "personalAPI.errors.configuration")
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


def _counselor_data(row):
    return {"id": row.id, "name": row.name, "description": row.description or "", "persona": row.persona or ""}


def _own_counselor(db, username, counselor_id):
    row = db.query(models.Counselor).filter_by(id=counselor_id, owner_username=username).first()
    if not row:
        raise HTTPException(404, "Counselor not found")
    return row


def _require_personal_counselors(db):
    if not personal_api.feature_enabled(db):
        raise HTTPException(403, "personalAPI.errors.disabled")


@router.get("/user/counselors")
def read_own_counselors(identity: dict = Depends(current_owner), db: Session = Depends(get_db)):
    _require_personal_counselors(db)
    return [_counselor_data(c) for c in db.query(models.Counselor).filter_by(owner_username=identity["username"]).order_by(models.Counselor.id)]


def _update_counselor(row, request):
    if not request.name.strip() or not request.persona.strip():
        raise HTTPException(422, "personalAPI.errors.counselor")
    row.name, row.description, row.persona = request.name.strip(), request.description.strip(), request.persona.strip()


@router.post("/user/counselors", dependencies=[Depends(browser_mutation)])
def create_own_counselor(request: PersonalCounselorUpdate, identity: dict = Depends(current_owner), db: Session = Depends(get_db)):
    _require_personal_counselors(db)
    row = models.Counselor(owner_username=identity["username"], slug="personal-" + uuid4().hex,
                           language=["*"], questionnaire_types=["*"], is_active=True, show_in_assistant=True)
    _update_counselor(row, request)
    db.add(row)
    db.commit()
    return _counselor_data(row)


@router.put("/user/counselors/{counselor_id}", dependencies=[Depends(browser_mutation)])
def update_own_counselor(counselor_id: int, request: PersonalCounselorUpdate, identity: dict = Depends(current_owner), db: Session = Depends(get_db)):
    _require_personal_counselors(db)
    row = _own_counselor(db, identity["username"], counselor_id)
    _update_counselor(row, request)
    db.commit()
    return _counselor_data(row)


@router.delete("/user/counselors/{counselor_id}", dependencies=[Depends(browser_mutation)])
def delete_own_counselor(counselor_id: int, identity: dict = Depends(current_owner), db: Session = Depends(get_db)):
    _require_personal_counselors(db)
    personal_api.lock_choice(db, identity["username"])
    row = _own_counselor(db, identity["username"], counselor_id)
    db.query(models.PersonalCounselorConnection).filter_by(username=identity["username"], counselor_id=counselor_id).delete()
    prefs = db.get(models.AccountPreferences, identity["username"])
    if prefs and prefs.counselor_id == counselor_id:
        prefs.counselor_id = None
    db.delete(row)
    db.commit()
    return {"deleted": True}


def _own_connection(db, username, connection_id):
    row = db.query(models.PersonalAPIConnection).filter_by(id=connection_id, username=username).first()
    if row is None:
        raise HTTPException(404, "Connection not found")
    return row


def _routing_available(db):
    """The choice page serves personal APIs, ChatGPT, or both, as the administrator allows."""
    from ..chatgpt_connections import enabled
    return personal_api.feature_enabled(db) or enabled(db)


def _require_routing(db):
    if not _routing_available(db):
        raise HTTPException(403, "personalAPI.errors.disabled")


def _chatgpt_models(db, username):
    from ..chatgpt_connections import enabled
    row = db.query(models.ChatGPTConnection).filter_by(username=username).first()
    if not enabled(db) or not row or not row.encrypted_credentials:
        return []
    return [{"slug": item["slug"], "display_name": item.get("display_name") or item["slug"],
             "reasoning_levels": item.get("reasoning_levels") or []} for item in row.catalog or []]


def _sources_for(db, identity):
    """Which own sources this person may use: installation switch and role switch (teachers/students)."""
    from ..chatgpt_connections import enabled
    audience.remember(db, identity)
    username = identity["username"]
    return (personal_api.feature_enabled(db) and audience.allowed(db, "api", username),
            enabled(db) and audience.allowed(db, "chatgpt", username))


def _catalog(db, identity):
    username = identity["username"]
    routing = db.get(models.PersonalAIRouting, username)
    api, chatgpt = _sources_for(db, identity)
    blocked = not personal_api.class_allows(db, username)
    return {
        "available": (api or chatgpt) and not blocked, "class_blocked": blocked,
        "api_enabled": api, "chatgpt_enabled": chatgpt,
        "chatgpt_models": _chatgpt_models(db, username),
        "enabled": bool(routing and routing.enabled),
        "default_connection_id": routing.default_connection_id if routing else None,
        "default_chatgpt_model": routing.default_chatgpt_model if routing else None,
        "default_reasoning": routing.default_reasoning if routing else None,
        "reasoning_levels": list(personal_api.REASONING_LEVELS),
        "providers": list(personal_api.PROVIDERS),
        "connections": [{"id": c.id, "name": c.name, "provider": c.provider, "model": c.model_name}
                        for c in db.query(models.PersonalAPIConnection).filter_by(username=username).order_by(models.PersonalAPIConnection.updated_at, models.PersonalAPIConnection.id)],
        "bindings": [{"counselor_id": b.counselor_id, "connection_id": b.connection_id, "chatgpt_model": b.chatgpt_model,
                      "reasoning": b.reasoning}
                     for b in db.query(models.PersonalCounselorConnection).filter_by(username=username).order_by(models.PersonalCounselorConnection.counselor_id)],
        "counselors": [{"id": c.id, "name": c.name, "is_personal": bool(c.owner_username)}
                       for c in personal_api.visible_counselors(db, username).filter_by(is_active=True).order_by(models.Counselor.sort_order, models.Counselor.id)],
    }


@router.get("/user/api-connections")
def read_connections(identity: dict = Depends(current_owner), db: Session = Depends(get_db)):
    return _catalog(db, identity)


def _prepare_routing(db, username):
    personal_api.lock_choice(db, username)
    personal_api.migrate_legacy_connections(db, username)
    row = db.get(models.PersonalAIRouting, username)
    if row is None:
        row = models.PersonalAIRouting(username=username, enabled=False)
        db.add(row)
        db.flush()
    return row


def _write_connection(db, username, request, row):
    provider, model, name = request.provider.strip(), request.model.strip(), request.name.strip()
    if provider not in personal_api.PROVIDERS or not model or not name:
        raise HTTPException(422, "personalAPI.errors.configuration")
    key = request.api_key.get_secret_value().strip() if request.api_key else ""
    if len(key) > 4096 or any(char.isspace() for char in key):
        raise HTTPException(422, "personalAPI.errors.authentication")
    if not key and (not row.encrypted_key or row.provider != provider):
        raise HTTPException(422, "personalAPI.errors.authentication")
    try:
        row.encrypted_key = personal_api.encrypt_key(username, provider, key, row.id) if key else row.encrypted_key
        if not key:
            personal_api.decrypt_key(row)
    except personal_api.PersonalAPIError:
        raise HTTPException(409, "personalAPI.errors.configuration") from None
    row.name, row.provider, row.model_name = name, provider, model


@router.post("/user/api-connections", dependencies=[Depends(browser_mutation)])
def create_connection(request: ConnectionUpdate, identity: dict = Depends(current_owner), db: Session = Depends(get_db)):
    _require_personal_counselors(db)
    routing = _prepare_routing(db, identity["username"])
    first = not db.query(models.PersonalAPIConnection).filter_by(username=identity["username"]).first()
    row = models.PersonalAPIConnection(id=uuid4().hex, username=identity["username"])
    _write_connection(db, identity["username"], request, row)
    db.add(row)
    db.flush()
    if first:
        routing.default_connection_id = row.id
    db.commit()
    return _catalog(db, identity)


@router.put("/user/api-connections/{connection_id}", dependencies=[Depends(browser_mutation)])
def update_connection(connection_id: str, request: ConnectionUpdate, identity: dict = Depends(current_owner), db: Session = Depends(get_db)):
    _require_personal_counselors(db)
    personal_api.lock_choice(db, identity["username"])
    row = _own_connection(db, identity["username"], connection_id)
    _write_connection(db, identity["username"], request, row)
    db.commit()
    return _catalog(db, identity)


@router.delete("/user/api-connections/{connection_id}", dependencies=[Depends(browser_mutation)])
def delete_connection(connection_id: str, identity: dict = Depends(current_owner), db: Session = Depends(get_db)):
    # Owners retain removal access even after an administrator disables the feature.
    personal_api.lock_choice(db, identity["username"])
    row = _own_connection(db, identity["username"], connection_id)
    db.query(models.PersonalCounselorConnection).filter_by(username=identity["username"], connection_id=connection_id).delete()
    routing = db.get(models.PersonalAIRouting, identity["username"])
    if routing and routing.default_connection_id == connection_id:
        routing.default_connection_id = None
    db.delete(row)
    db.flush()
    # Nothing left to route to (ChatGPT choices count too): back to the institution.
    if routing and not routing.default_connection_id and not routing.default_chatgpt_model and \
            not db.query(models.PersonalCounselorConnection).filter_by(username=identity["username"]).first():
        routing.enabled = False
    # A migrated legacy row must not resurrect a removed credential on restart.
    db.query(models.PersonalAPISettings).filter_by(username=identity["username"]).delete()
    db.commit()
    return _catalog(db, identity)


@router.put("/user/api-routing", dependencies=[Depends(browser_mutation)])
def update_routing(request: RoutingUpdate, identity: dict = Depends(current_owner), db: Session = Depends(get_db)):
    _require_routing(db)
    username = identity["username"]
    if not personal_api.class_allows(db, username):
        raise HTTPException(403, "personalAPI.errors.disabled")
    api_allowed, chatgpt_allowed = _sources_for(db, identity)
    routing = _prepare_routing(db, username)
    catalog = {item["slug"]: item for item in _chatgpt_models(db, username)}
    models_seen = set()

    def check(connection_id, chatgpt_model, allow_empty, reasoning=None):
        if connection_id and chatgpt_model or not (connection_id or chatgpt_model or allow_empty):
            raise HTTPException(422, "personalAPI.errors.configuration")
        # A source the administrator turned off for this person's role cannot be chosen.
        if connection_id and not api_allowed or chatgpt_model and not chatgpt_allowed:
            raise HTTPException(403, "personalAPI.errors.disabled")
        # #202: a level needs a source, and a ChatGPT model that lists its levels must offer it.
        if reasoning is not None and (reasoning not in personal_api.REASONING_LEVELS or not (connection_id or chatgpt_model)
                                      or chatgpt_model and catalog.get(chatgpt_model, {}).get("reasoning_levels")
                                      and reasoning not in catalog[chatgpt_model]["reasoning_levels"]):
            raise HTTPException(422, "personalAPI.errors.configuration")
        if connection_id:
            _require_personal_counselors(db)
            _own_connection(db, username, connection_id)
        if chatgpt_model and chatgpt_model not in models_seen:
            from ..chatgpt_connections import ChatGPTError, require_model
            try:
                require_model(db, username, chatgpt_model)
            except ChatGPTError as exc:
                raise HTTPException(422, f"chatgpt.errors.{exc.code}") from None
            models_seen.add(chatgpt_model)

    check(request.default_connection_id, request.default_chatgpt_model, True, request.default_reasoning)
    seen = set()
    for binding in request.bindings:
        check(binding.connection_id, binding.chatgpt_model, False, binding.reasoning)
        if binding.counselor_id in seen or not personal_api.visible_counselor(db, binding.counselor_id, username):
            raise HTTPException(422, "personalAPI.errors.counselor")
        seen.add(binding.counselor_id)
    if request.enabled and not request.default_connection_id and not request.default_chatgpt_model and not request.bindings:
        raise HTTPException(422, "personalAPI.errors.configuration")
    db.query(models.PersonalCounselorConnection).filter_by(username=username).delete()
    for binding in request.bindings:
        db.add(models.PersonalCounselorConnection(username=username, **binding.model_dump()))
    routing.enabled = request.enabled
    routing.default_connection_id, routing.default_chatgpt_model = request.default_connection_id, request.default_chatgpt_model
    routing.default_reasoning = request.default_reasoning
    db.commit()
    return _catalog(db, identity)


@router.post("/user/api-connections/{connection_id}/test", dependencies=[Depends(browser_mutation)])
def test_saved_connection(connection_id: str, identity: dict = Depends(current_owner), db: Session = Depends(get_db)):
    _require_personal_counselors(db)
    row = _own_connection(db, identity["username"], connection_id)
    try:
        ai = AIService(db)
        ai.use_personal_connection(row)
        ai.get_response("Reply with OK.", "You are checking a connection. Reply briefly in English.", "generic", max_tokens=64)
        return {"working": True}
    except Exception as exc:
        return {"working": False, "error_code": personal_api.connection_error_code(exc)}
