"""Local, transient speech transcription. Audio is never retained."""
from contextlib import asynccontextmanager
from io import BytesIO
from pathlib import Path
from threading import BoundedSemaphore, Lock
from typing import Literal

import av
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from faster_whisper import WhisperModel

MAX_BYTES = 10 * 1024 * 1024
MAX_SECONDS = 180
SAMPLE_RATE = 16000
SLOTS = 2
QUEUE_WAIT = 90
THREADS = 8
DETECTOR = 'small'
DETECTION_CONFIDENCE = 0.7
MODELS = {'small': '/models/small', 'large-v3-turbo': '/models/turbo', 'large-v3': '/models/large-v3'}
DEFAULT_MODEL = 'large-v3-turbo'
Model = Literal['small', 'large-v3-turbo', 'large-v3']
Language = Literal['auto', 'it', 'en', 'es', 'fr', 'de', 'sv']
# Whisper writes what it expects to hear: without a domain prompt the questionnaire
# acronyms come back as ordinary words ("QSA" as "questa", "ZTPI" as "se ti pi").
ACRONYMS = 'QSA, QSAr, ZTPI, QPCS, QPCC, QAP, Savickas'
GLOSSARY = {
    'auto': ACRONYMS + '.',
    'it': f'Colloquio di orientamento allo studio. Termini: {ACRONYMS}, ansietà, attribuzione, metacognizione, autoregolazione, procrastinazione, counselor.',
    'en': f'Study counselling interview. Terms: {ACRONYMS}, anxiety, attribution, metacognition, self-regulation, procrastination, counsellor.',
    'es': f'Entrevista de orientación al estudio. Términos: {ACRONYMS}, ansiedad, atribución, metacognición, autorregulación, procrastinación, consejero.',
    'fr': f"Entretien d'orientation aux études. Termes : {ACRONYMS}, anxiété, attribution, métacognition, autorégulation, procrastination, conseiller.",
    'de': f'Beratungsgespräch zum Lernen. Begriffe: {ACRONYMS}, Angst, Attribution, Metakognition, Selbstregulation, Prokrastination, Berater.',
    'sv': f'Samtal om studievägledning. Termer: {ACRONYMS}, ångest, attribution, metakognition, självreglering, prokrastinering, vägledare.',
}
loaded: dict[str, WhisperModel] = {}
loading = Lock()
slot = BoundedSemaphore(SLOTS)


def load(name: str) -> WhisperModel:
    """Models stay resident: swapping one out on every change would pay the load
    cost again on the next request, and all three together fit the container.
    Threads and workers stay modest for the same reason: every resident model
    holds its own busy-waiting pools, which take CPU from the one transcribing."""
    with loading:
        if name not in loaded:
            loaded[name] = WhisperModel(MODELS[name], device='cpu', compute_type='int8',
                                        cpu_threads=THREADS, num_workers=SLOTS, local_files_only=True)
        return loaded[name]


@asynccontextmanager
async def lifespan(app):
    load(DEFAULT_MODEL)
    load(DETECTOR)
    yield


def detect(samples: np.ndarray) -> str | None:
    """Detection on the small model: on a large one it costs as much again as the
    transcription itself, and an unsure guess is better left to the real model."""
    language, probability, _ = load(DETECTOR).detect_language(audio=samples)
    return language if probability >= DETECTION_CONFIDENCE else None


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
    if not loaded:
        raise HTTPException(503, 'unavailable')
    return {'status': 'ready', 'loaded': sorted(loaded)}


@app.get('/models')
def models():
    return {'default': DEFAULT_MODEL, 'models': [
        {'id': name, 'loaded': name in loaded,
         'bytes': Path(path, 'model.bin').stat().st_size if Path(path, 'model.bin').exists() else None}
        for name, path in MODELS.items()]}


@app.post('/transcribe')
def transcribe(audio: UploadFile = File(...), language: Language = Form('auto'),
               model: Model = Form(DEFAULT_MODEL)):
    try:
        data = audio.file.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise HTTPException(413, 'too_large')
        if not data:
            raise HTTPException(400, 'empty')
        samples = decode_audio(data)
    finally:
        audio.file.close()
    # Decoding happens outside the slot: only the transcription itself is contended.
    if not slot.acquire(timeout=QUEUE_WAIT):
        raise HTTPException(503, 'busy')
    try:
        if language != 'auto':
            spoken = language
        elif model == DETECTOR:
            spoken = None
        else:
            spoken = detect(samples)
        segments, info = load(model).transcribe(
            samples, language=spoken, task='transcribe',
            beam_size=5, vad_filter=True, condition_on_previous_text=False,
            initial_prompt=GLOSSARY.get(spoken or 'auto', GLOSSARY['auto']))
        text = ' '.join(segment.text.strip() for segment in segments).strip()
        return {'text': text, 'language': info.language, 'model': model,
                'duration': round(len(samples) / SAMPLE_RATE, 2)}
    finally:
        slot.release()
