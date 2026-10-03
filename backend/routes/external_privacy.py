"""Explicit administrator choice of local NER or deterministic-only redaction."""
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from .chatgpt import browser_mutation
from .personal_api import PrivateRoute, require_admin

router = APIRouter(route_class=PrivateRoute)
KEYS = ('external_pii_redact', 'external_pii_fallback', 'pii_ner_enabled')


class PrivacyUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    mode: Literal['local', 'basic']


def _enabled(value):
    return str(value).strip().lower() not in ('0', 'false', 'no', 'off')


def settings(db):
    values = {r.key: r.value for r in db.query(models.Config).filter(models.Config.key.in_((*KEYS, 'pii_ner_model')))}
    redact = _enabled(values.get('external_pii_redact', 'true'))
    local = _enabled(values.get('pii_ner_enabled', 'true'))
    fallback = (values.get('external_pii_fallback') or 'block').strip().lower()
    mode = ('local' if local else 'basic') if redact and fallback == 'block' else 'custom'
    return {'mode': mode, 'local_model': values.get('pii_ner_model') or 'qwen3:0.6b'}


@router.get('/admin/external-privacy')
def read_settings(identity=Depends(require_admin), db: Session = Depends(get_db)):
    return settings(db)


@router.put('/admin/external-privacy', dependencies=[Depends(browser_mutation)])
def update_settings(request: PrivacyUpdate, identity=Depends(require_admin), db: Session = Depends(get_db)):
    # Serialize the three-key update, including a first save before seed rows.
    db.execute(text('SELECT pg_advisory_xact_lock(414215)'))
    values = dict(external_pii_redact='true', external_pii_fallback='block',
                  pii_ner_enabled='true' if request.mode == 'local' else 'false')
    for key, value in values.items():
        row = db.query(models.Config).filter_by(key=key).first()
        if row is None:
            db.add(models.Config(key=key, value=value))
        else:
            row.value = value
    db.commit()
    return settings(db)
