"""Authenticated audio uploads forwarded only to the local transcription service."""
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..auth import get_current_user

router = APIRouter(prefix='/audio', dependencies=[Depends(get_current_user)])
Language = Literal['auto', 'it', 'en', 'es', 'fr', 'de', 'sv']
MAX_BYTES = 10 * 1024 * 1024
SERVICE = 'http://transcription:8000'
MODEL_CONFIG_KEY = 'transcription_model'
ENGINE_CONFIG_KEY = 'transcription_engine'
# whisper.cpp runs quantized models for weak CPUs; each engine has its own list.
ENGINES = {'faster-whisper': ('small', 'large-v3-turbo', 'large-v3'),
           'whisper.cpp': ('base', 'small', 'large-v3-turbo')}
DEFAULT_ENGINE = 'faster-whisper'
DEFAULT_MODELS = {'faster-whisper': 'large-v3-turbo', 'whisper.cpp': 'small'}
ERRORS = {'too_large': 413, 'too_long': 413, 'invalid_audio': 400,
          'empty': 400, 'busy': 503, 'unavailable': 503}


def selected(db: Session) -> tuple[str, str]:
    """An unknown name in the config must not take transcription down with it: an
    unknown engine falls back to faster-whisper, a model the engine lacks to its default."""
    rows = db.query(models.Config).filter(models.Config.key.in_((ENGINE_CONFIG_KEY, MODEL_CONFIG_KEY))).all()
    values = {row.key: (row.value or '').strip() for row in rows}
    engine = values.get(ENGINE_CONFIG_KEY, '')
    engine = engine if engine in ENGINES else DEFAULT_ENGINE
    model = values.get(MODEL_CONFIG_KEY, '')
    return engine, model if model in ENGINES[engine] else DEFAULT_MODELS[engine]


@router.post('/transcribe')
async def transcribe(audio: UploadFile = File(...),
                     language: Language = Form('auto'),
                     fallback_language: Language = Form('auto'),
                     db: Session = Depends(database.get_db)):
    try:
        data = await audio.read(MAX_BYTES + 1)
    finally:
        await audio.close()
    if not data:
        raise HTTPException(400, 'empty')
    if len(data) > MAX_BYTES:
        raise HTTPException(413, 'too_large')
    engine, model = selected(db)
    try:
        async with httpx.AsyncClient(timeout=300) as client:
            response = await client.post(f'{SERVICE}/transcribe',
                                         files={'audio': ('recording', data, 'application/octet-stream')},
                                         data={'language': language, 'fallback_language': fallback_language,
                                               'model': model, 'engine': engine})
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
    engine, model = selected(db)
    return {'active': model, 'default': DEFAULT_MODELS[DEFAULT_ENGINE], 'key': MODEL_CONFIG_KEY,
            'engine': engine, 'default_engine': DEFAULT_ENGINE, 'engine_key': ENGINE_CONFIG_KEY,
            'default_models': DEFAULT_MODELS, 'available': bundled, 'reachable': bool(bundled)}
