"""Local, transient speech transcription. Audio is never retained."""
from contextlib import asynccontextmanager
from io import BytesIO
from threading import BoundedSemaphore
from typing import Literal

import av
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from faster_whisper import WhisperModel

MAX_BYTES = 10 * 1024 * 1024
MAX_SECONDS = 180
SAMPLE_RATE = 16000
model = None
slot = BoundedSemaphore(1)


@asynccontextmanager
async def lifespan(app):
    global model
    model = WhisperModel('/models/small', device='cpu', compute_type='int8',
                         cpu_threads=4, num_workers=1, local_files_only=True)
    yield


app = FastAPI(lifespan=lifespan)


def decode_audio(data: bytes) -> np.ndarray:
    """Bound decoded samples too: a small compressed file may hold hours."""
    chunks, samples = [], 0
    try:
        with av.open(BytesIO(data)) as container:
            resampler = av.AudioResampler(format='s16', layout='mono', rate=SAMPLE_RATE)
            for frame in container.decode(audio=0):
                for output in resampler.resample(frame):
                    chunk = output.to_ndarray().flatten()
                    samples += chunk.size
                    if samples > MAX_SECONDS * SAMPLE_RATE:
                        raise HTTPException(413, 'too_long')
                    chunks.append(chunk)
            for output in resampler.resample(None):
                chunk = output.to_ndarray().flatten()
                samples += chunk.size
                if samples > MAX_SECONDS * SAMPLE_RATE:
                    raise HTTPException(413, 'too_long')
                chunks.append(chunk)
    except (av.FFmpegError, ValueError, IndexError):
        raise HTTPException(400, 'invalid_audio') from None
    if not samples:
        raise HTTPException(400, 'empty')
    return np.concatenate(chunks).astype(np.float32) / 32768.0


@app.get('/health')
def health():
    if model is None:
        raise HTTPException(503, 'unavailable')
    return {'status': 'ready'}


@app.post('/transcribe')
def transcribe(audio: UploadFile = File(...), language: Literal['it', 'en', 'es', 'fr', 'de', 'sv'] = Form(...)):
    if model is None:
        raise HTTPException(503, 'unavailable')
    if not slot.acquire(blocking=False):
        raise HTTPException(503, 'busy')
    try:
        data = audio.file.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise HTTPException(413, 'too_large')
        if not data:
            raise HTTPException(400, 'empty')
        samples = decode_audio(data)
        segments, _ = model.transcribe(samples, language=language, task='transcribe',
                                      beam_size=3, vad_filter=True,
                                      condition_on_previous_text=False)
        text = ' '.join(segment.text.strip() for segment in segments).strip()
        return {'text': text, 'language': language, 'duration': round(len(samples) / SAMPLE_RATE, 2)}
    finally:
        audio.file.close()
        slot.release()
