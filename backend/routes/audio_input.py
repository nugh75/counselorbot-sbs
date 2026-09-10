"""Authenticated audio uploads forwarded only to the local transcription service."""
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from ..auth import get_current_user

router = APIRouter(prefix='/audio', dependencies=[Depends(get_current_user)])
MAX_BYTES = 10 * 1024 * 1024


@router.post('/transcribe')
async def transcribe(audio: UploadFile = File(...), language: Literal['it', 'en', 'es', 'fr', 'de', 'sv'] = Form(...)):
    try:
        data = await audio.read(MAX_BYTES + 1)
    finally:
        await audio.close()
    if not data:
        raise HTTPException(400, 'empty')
    if len(data) > MAX_BYTES:
        raise HTTPException(413, 'too_large')
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post('http://transcription:8000/transcribe',
                                         files={'audio': ('recording', data, 'application/octet-stream')},
                                         data={'language': language})
        if response.status_code != 200:
            code = response.json().get('detail')
            known = {'too_large': 413, 'too_long': 413, 'invalid_audio': 400,
                     'empty': 400, 'busy': 503, 'unavailable': 503}
            raise HTTPException(known.get(code, 502), code if code in known else 'unavailable')
        result = response.json()
        if not isinstance(result.get('text'), str):
            raise ValueError('Invalid transcription')
        return {'text': result['text'], 'language': language}
    except httpx.TimeoutException:
        raise HTTPException(504, 'timeout') from None
    except (httpx.HTTPError, ValueError, TypeError):
        raise HTTPException(502, 'unavailable') from None
