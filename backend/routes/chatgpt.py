"""Personal SIWC accounts. No token or client-supplied user enters a reply."""
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict, Field, SecretStr
from sqlalchemy.orm import Session

from .. import auth, database, models
from .. import chatgpt_connections as accounts


class PrivateRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def private(request):
            try:
                response = await handler(request)
            except RequestValidationError:
                # FastAPI's default validation reply can echo secret input.
                response = JSONResponse({"detail": "chatgpt.errors.invalidCredentials"}, status_code=422)
            except HTTPException as exc:
                response = JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
            response.headers["Cache-Control"] = "no-store"
            return response

        return private


router = APIRouter(route_class=PrivateRoute)


async def current_owner(request: Request, identity: dict = Depends(auth.get_identity)):
    if not identity.get("authenticated") or not identity.get("username"):
        raise HTTPException(401, "chatgpt.errors.signIn")
    if request.headers.get("X-View-As") or request.query_params.get("view_as"):
        raise HTTPException(403, "chatgpt.errors.signIn")
    return identity["username"]


async def current_administrator(request: Request, identity: dict = Depends(auth.get_identity)):
    username = await current_owner(request, identity)
    if not identity.get("is_admin"):
        raise HTTPException(403, "chatgpt.errors.adminOnly")
    return username


def browser_mutation(request: Request, x_requested_with: str | None = Header(default=None)):
    # A cross-site form cannot supply this header; credentialed cross-origin
    # fetches are restricted by the application's existing CORS allowlist.
    if x_requested_with != "CounselorBot":
        raise HTTPException(403, "chatgpt.errors.signIn")


def pairing(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "chatgpt.errors.linkExpired")
    return authorization[7:]


def invoke(function, *args):
    try:
        return function(*args)
    except accounts.ChatGPTError as exc:
        code = 503 if exc.code in {"disabled", "notConfigured", "unavailable"} else 429 if exc.code == "quota" else 409
        raise HTTPException(code, str(exc)) from None


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    client_id: str = Field(min_length=1, max_length=256)
    access_token: SecretStr = Field(min_length=1, max_length=32768)
    refresh_token: SecretStr = Field(min_length=1, max_length=16000)
    id_token: SecretStr = Field(min_length=1, max_length=32768)
    token_type: str = Field(default="Bearer", max_length=16)
    scope: str | None = Field(default=None, max_length=2000)
    earliest_refresh_at: float | str | None = Field(default=None)


class Preference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    use_subscription: bool
    model: str | None = Field(default=None, max_length=200)


class Registration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    client_id: str = Field(min_length=1, max_length=256)


class InstallationSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = Field(strict=True)


@router.get("/admin/chatgpt/settings")
def installation_status(username: str = Depends(current_administrator), db: Session = Depends(database.get_db)):
    return accounts.installation_status(db)


@router.put("/admin/chatgpt/settings", dependencies=[Depends(browser_mutation)])
def installation_settings(data: InstallationSettings, username: str = Depends(current_administrator), db: Session = Depends(database.get_db)):
    return invoke(accounts.set_installation_enabled, db, data.enabled)


@router.get("/user/chatgpt")
def status(username: str = Depends(current_owner), db: Session = Depends(database.get_db)):
    return accounts.status(db, username)


@router.post("/user/chatgpt/link", dependencies=[Depends(browser_mutation)])
def start(username: str = Depends(current_owner), db: Session = Depends(database.get_db)):
    return invoke(accounts.start_link, db, username)


@router.delete("/user/chatgpt/link", dependencies=[Depends(browser_mutation)])
def cancel(username: str = Depends(current_owner), db: Session = Depends(database.get_db)):
    db.query(models.ChatGPTLink).filter_by(username=username).delete()
    db.commit()
    return {"cancelled": True}


@router.get("/chatgpt/link/parameters")
def parameters(token: str = Depends(pairing), db: Session = Depends(database.get_db)):
    return invoke(accounts.link_parameters, db, token)


@router.post("/chatgpt/link/complete")
def complete(data: Credentials, token: str = Depends(pairing), db: Session = Depends(database.get_db)):
    values = {name: getattr(data, name).get_secret_value() for name in ("access_token", "refresh_token", "id_token")}
    values["token_type"] = data.token_type
    if data.scope is not None:
        values["scope"] = data.scope
    if data.earliest_refresh_at is not None:
        values["earliest_refresh_at"] = data.earliest_refresh_at
    return invoke(accounts.complete_link, db, token, data.client_id, values)


@router.post("/chatgpt/link/registration")
def registration(data: Registration, token: str = Depends(pairing), db: Session = Depends(database.get_db)):
    return invoke(accounts.remember_registration, db, token, data.client_id)


@router.post("/user/chatgpt/models", dependencies=[Depends(browser_mutation)])
def models_for_user(username: str = Depends(current_owner), db: Session = Depends(database.get_db)):
    accounts.bind_identity(db, {"authenticated": True, "username": username})
    return {"models": invoke(accounts.list_models, db)}


@router.put("/user/chatgpt/preference", dependencies=[Depends(browser_mutation)])
def preference(data: Preference, username: str = Depends(current_owner), db: Session = Depends(database.get_db)):
    invoke(accounts.set_preference, db, username, data.use_subscription, data.model)
    return accounts.status(db, username)


@router.delete("/user/chatgpt", dependencies=[Depends(browser_mutation)])
def disconnect(forget_registration: bool = False, username: str = Depends(current_owner), db: Session = Depends(database.get_db)):
    return invoke(accounts.disconnect, db, username, forget_registration)


@router.get("/chatgpt/helper")
def helper():
    return FileResponse(Path(__file__).resolve().parents[2] / "scripts" / "chatgpt-connect.py",
                        media_type="text/x-python", filename="chatgpt-connect.py")
