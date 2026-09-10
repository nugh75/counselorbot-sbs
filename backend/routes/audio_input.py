"""Authenticated audio uploads forwarded only to the local transcription service."""
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..auth import get_current_user

router = APIRouter(prefix='/audio', dependencies=[Depends(get_current_user)])
MAX_BYTES = 10 * 1024 * 1024
SERVICE = 'http://transcription:8000'
MODEL_CONFIG_KEY = 'transcription_model'
MODELS = ('small', 'large-v3-turbo', 'large-v3')
DEFAULT_MODEL = 'large-v3-turbo'
ERRORS = {'too_large': 413, 'too_long': 413, 'invalid_audio': 400,
          'empty': 400, 'busy': 503, 'unavailable': 503}


def selected_model(db: Session) -> str:
    """An unknown name in the config must not take transcription down with it."""
    row = db.query(models.Config).filter(models.Config.key == MODEL_CONFIG_KEY).first()
    value = (row.value or '').strip() if row else ''
    return value if value in MODELS else DEFAULT_MODEL


@router.post('/transcribe')
async def transcribe(audio: UploadFile = File(...),
                     language: Literal['auto', 'it', 'en', 'es', 'fr', 'de', 'sv'] = Form('auto'),
                     db: Session = Depends(database.get_db)):
    try:
        data = await audio.read(MAX_BYTES + 1)
    finally:
        await audio.close()
    if not data:
        raise HTTPException(400, 'empty')
    if len(data) > MAX_BYTES:
        raise HTTPException(413, 'too_large')
    model = selected_model(db)
    try:
        async with httpx.AsyncClient(timeout=300) as client:
            response = await client.post(f'{SERVICE}/transcribe',
                                         files={'audio': ('recording', data, 'application/octet-stream')},
                                         data={'language': language, 'model': model})
        if response.status_code != 200:
            code = response.json().get('detail')
            raise HTTPException(ERRORS.get(code, 502), code if code in ERRORS else 'unavailable')
        result = response.json()
        if not isinstance(result.get('text'), str):
            raise ValueError('Invalid transcription')
        return {'text': result['text'], 'language': result.get('language', language), 'model': model}
    except httpx.TimeoutException:
        raise HTTPException(504, 'timeout') from None
    except (httpx.HTTPError, ValueError, TypeError):
        raise HTTPException(502, 'unavailable') from None


@router.get('/models')
async def available_models(current_user: dict = Depends(auth.get_current_active_admin),
                           db: Session = Depends(database.get_db)):
    """Admin view: what the image bundles, what is resident, what is in use."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f'{SERVICE}/models')
        bundled = response.json().get('models', []) if response.status_code == 200 else []
    except (httpx.HTTPError, ValueError):
        bundled = []
    return {'active': selected_model(db), 'default': DEFAULT_MODEL, 'key': MODEL_CONFIG_KEY,
            'available': bundled, 'reachable': bool(bundled)}
