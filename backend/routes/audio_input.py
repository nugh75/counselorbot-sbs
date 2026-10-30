"""Authenticated audio uploads: local by default, optional external transcription."""
import base64
from pathlib import PurePath
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..auth import get_current_user
from ..api_secrets import resolve_api_secret
from ..privacy.errors import PrivacyError
from ..privacy.gateway import AIGateway, context_for
from ..privacy.types import AIRequest, Target

router = APIRouter(prefix='/audio', dependencies=[Depends(get_current_user)])
Language = Literal['auto', 'it', 'en', 'es', 'fr', 'de', 'sv']
MAX_BYTES = 10 * 1024 * 1024
SERVICE = 'http://transcription:8000'
MODEL_CONFIG_KEY = 'transcription_model'
ENGINE_CONFIG_KEY = 'transcription_engine'
# whisper.cpp runs quantized models for weak CPUs; each engine has its own list.
ENGINES = {'faster-whisper': ('small', 'large-v3-turbo', 'large-v3'),
           'whisper.cpp': ('base', 'small', 'large-v3-turbo'),
           'openrouter': (), 'mistral': ()}
ONLINE = {'openrouter': 'https://openrouter.ai/api/v1/audio/transcriptions',
          'mistral': 'https://api.mistral.ai/v1/audio/transcriptions'}
DEFAULT_ENGINE = 'faster-whisper'
DEFAULT_MODELS = {'faster-whisper': 'large-v3-turbo', 'whisper.cpp': 'small',
                  'openrouter': 'mistralai/voxtral-mini-transcribe', 'mistral': 'voxtral-mini-latest'}
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
    valid = (bool(model) and len(model) <= 200 and not any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in model)) \
        if engine in ONLINE else model in ENGINES[engine]
    return engine, model if valid else DEFAULT_MODELS[engine]


def audio_format(filename: str | None, content_type: str | None) -> str:
    """Only a format identifier leaves the backend, never the uploaded filename."""
    formats = {'wav', 'mp3', 'mp4', 'm4a', 'ogg', 'webm', 'flac', 'aac', 'opus'}
    mime = (content_type or '').split(';', 1)[0].lower()
    known = {'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
             'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'mp4',
             'audio/x-m4a': 'm4a', 'audio/ogg': 'ogg', 'video/ogg': 'ogg',
             'audio/webm': 'webm', 'video/webm': 'webm', 'audio/flac': 'flac',
             'audio/x-flac': 'flac', 'audio/aac': 'aac', 'audio/opus': 'opus'}
    extension = PurePath(filename or '').suffix.lower().lstrip('.')
    result = known.get(mime, extension)
    if result not in formats:
        raise HTTPException(400, 'invalid_audio')
    return result


async def transcribe_online(db: Session, engine: str, model: str, data: bytes,
                            fmt: str, language: str, username: str):
    secret = resolve_api_secret(db, engine).value
    if not secret:
        raise HTTPException(503, 'unavailable')
    try:
        prepared = AIGateway(allow_external_transcription=True).prepare(
            AIRequest('transcription', Target(engine, model, ONLINE[engine]), texts=[], audio=data),
            context_for(username))
        fields = {'model': model}
        if language != 'auto':
            fields['language'] = language
        headers = {'Authorization': f'Bearer {secret}'}
        async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=10),
                                     follow_redirects=False, trust_env=False) as client:
            if engine == 'openrouter':
                response = await client.post(ONLINE[engine], headers=headers, json={
                    **fields, 'input_audio': {
                        'data': base64.b64encode(prepared.request.audio).decode('ascii'), 'format': fmt}})
            else:
                response = await client.post(ONLINE[engine], headers=headers, data=fields,
                    files={'file': (f'recording.{fmt}', prepared.request.audio, 'application/octet-stream')})
        if response.status_code != 200:
            raise HTTPException(503, 'busy' if response.status_code == 429 else 'unavailable')
        result = response.json()
        if not isinstance(result, dict) or not isinstance(result.get('text'), str):
            raise ValueError('Invalid transcription')
        detected = result.get('language')
        return {'text': result['text'], 'language': detected if isinstance(detected, str) else language,
                'model': model}
    except httpx.TimeoutException:
        raise HTTPException(504, 'timeout') from None
    except (httpx.HTTPError, ValueError, TypeError, PrivacyError):
        raise HTTPException(503, 'unavailable') from None


@router.post('/transcribe')
async def transcribe(audio: UploadFile = File(...),
                     language: Language = Form('auto'),
                     fallback_language: Language = Form('auto'),
                     db: Session = Depends(database.get_db),
                     current_user: dict = Depends(get_current_user)):
    try:
        data = await audio.read(MAX_BYTES + 1)
    finally:
        await audio.close()
    if not data:
        raise HTTPException(400, 'empty')
    if len(data) > MAX_BYTES:
        raise HTTPException(413, 'too_large')
    engine, model = selected(db)
    if engine in ONLINE:
        return await transcribe_online(db, engine, model, data,
            audio_format(audio.filename, audio.content_type),
            language if language != 'auto' else fallback_language, current_user['username'])
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
    """Admin view: bundled models and key presence only; never provider credentials."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f'{SERVICE}/models')
        bundled = response.json().get('models', []) if response.status_code == 200 else []
    except (httpx.HTTPError, ValueError):
        bundled = []
    engine, model = selected(db)
    return {'active': model, 'default': DEFAULT_MODELS[DEFAULT_ENGINE], 'key': MODEL_CONFIG_KEY,
            'engine': engine, 'default_engine': DEFAULT_ENGINE, 'engine_key': ENGINE_CONFIG_KEY,
            'default_models': DEFAULT_MODELS, 'available': bundled, 'reachable': bool(bundled),
            'providers': {provider: {'configured': bool(resolve_api_secret(db, provider).value)}
                          for provider in ONLINE}}
