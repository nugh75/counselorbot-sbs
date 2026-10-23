"""Admin «Connessioni ai modelli locali»: detect Ollama, LM Studio and OpenAI-compatible servers.

Admin only, private responses, browser-only (the probe makes outbound requests).
The server key is reported as presence only and is sent only to the configured URL.
"""
import os
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from .. import local_llm, models
from ..ai_service import ENV_KEY_MAP
from ..database import get_db
from .chatgpt import browser_mutation
from .personal_api import PrivateRoute, require_admin

router = APIRouter(route_class=PrivateRoute)
URL_KEYS = ("ollama_ip", "llamacpp_url")


class DetectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    custom_url: str | None = Field(default=None, max_length=2048)

    @field_validator("custom_url")
    @classmethod
    def http_url(cls, value):
        value = (value or "").strip() or None
        if value and (urlsplit(value).scheme not in ("http", "https") or not urlsplit(value).hostname):
            raise ValueError("http(s) URL expected")
        return value


def configured_urls(db: Session) -> dict:
    """Saved URLs with the same environment override the AI service applies."""
    config = {row.key: row.value for row in db.query(models.Config).filter(models.Config.key.in_(URL_KEYS))}
    for key in URL_KEYS:
        value = next((os.environ[v] for v in ENV_KEY_MAP[key] if os.environ.get(v)), None)
        if value:
            config[key] = value
    return config


@router.post("/admin/local-llm/detect", dependencies=[Depends(browser_mutation)])
async def detect_local_llm(body: DetectRequest, _admin: dict = Depends(require_admin),
                           db: Session = Depends(get_db)):
    return await local_llm.detect(configured_urls(db), body.custom_url)
