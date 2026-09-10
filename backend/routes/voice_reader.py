"""Progressive reader adapted from TD_daniele be44ce5 (no editorial storage).

Audio travels inside the requesting stream; no files, public audio URLs or
student text are retained. Access follows the existing /tts edge-auth policy.
"""
import asyncio
import base64
import json
import re
import time
from typing import Literal

import edge_tts
import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from .. import database, models
from ..api_models import TTSRequest
from ..chat_logic import strip_markdown
from ..diagram_blocks import strip_for_speech
from .chat import _split_text_for_tts

router = APIRouter(prefix="/tts")
LANGUAGES = {"it", "en", "es", "fr", "de", "sv"}
_voice_cache: tuple[float, list[dict]] = (0, [])


class PronunciationRule(BaseModel):
    term: str = Field(min_length=1, max_length=100)
    spoken: str = Field(min_length=1, max_length=200)

    @field_validator('term', 'spoken')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('Blank pronunciation')
        return value.strip()


class ReaderRequest(TTSRequest):
    engine: Literal["edge", "piper"] = "edge"
    plain_text: bool = False
    text: str = Field(min_length=1, max_length=120000)
    language: str = Field(default="it", pattern="^(it|en|es|fr|de|sv)$")
    voice: str = Field(default="it-IT-IsabellaNeural", max_length=100,
                       pattern=r"^(?:[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural|[a-z]{2}_[A-Z]{2}-[a-z0-9_]+-[a-z_]+)$")
    pronunciations: list[PronunciationRule] = Field(default_factory=list, max_length=200)


def correct_pronunciation(text: str, rules: list[PronunciationRule]) -> str:
    # Longest term first; a single replacement pass prevents cascading changes.
    # Short uppercase acronyms remain case-sensitive (AI must not replace 'ai').
    ordered = sorted(rules, key=lambda rule: len(rule.term), reverse=True)
    if not ordered:
        return text
    patterns = []
    for rule in ordered:
        escaped = re.escape(rule.term)
        sensitive = rule.term.isupper() and len(rule.term) <= 4
        patterns.append(r'(?<!\w)' + (escaped if sensitive else f'(?i:{escaped})') + r'(?!\w)')
    regex = re.compile('|'.join(f'(?P<r{i}>{pattern})' for i, pattern in enumerate(patterns)))
    return regex.sub(lambda match: ordered[int(match.lastgroup[1:])].spoken, text)


def spoken_segments(text: str, language: str, rules: list[PronunciationRule] | None = None, plain_text: bool = False) -> list[dict]:
    clean = text
    if not plain_text:
        clean = strip_for_speech(clean, lang=language)
        clean = re.sub(r'```.*?```', ' ', clean, flags=re.DOTALL)
        clean = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', clean)
        clean = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', clean)
        clean = re.sub(r'\[(?:\^|@)[^\]]*\]', '', clean)
        clean = re.sub(r'`([^`]*)`', r'\1', clean)
        clean = strip_markdown(clean)
    clean = correct_pronunciation(clean, rules or [])
    if len(clean) > 120000:
        raise HTTPException(422, "Corrected text exceeds the reader limit")
    segments = []
    for paragraph_id, paragraph in enumerate(re.split(r"\n\s*\n", clean)):
        paragraph = paragraph.strip()
        if paragraph and not segments:
            # Deliver a short opening before synthesizing the longer body.
            # Prefer a complete sentence; otherwise split at a word boundary.
            cut = len(paragraph)
            if cut > 180:
                endings = list(re.finditer(r'[.!?](?=\s)', paragraph[:181]))
                spaces = list(re.finditer(r'\s+', paragraph[:181]))
                cut = endings[-1].end() if endings else spaces[-1].start() if spaces else 180
            segments.append({"index": 0, "paragraph_id": paragraph_id, "text": paragraph[:cut].strip()})
            paragraph = paragraph[cut:].strip()
        for part in _split_text_for_tts(paragraph, max_len=700):
            segments.append({"index": len(segments), "paragraph_id": paragraph_id, "text": part})
    return segments


def reader_voice(request: ReaderRequest, db: Session) -> str:
    if request.engine == "edge" and request.counselor_id and not request.voice_override:
        counselor = db.get(models.Counselor, request.counselor_id)
        if counselor and counselor.voice_mapping:
            return counselor.voice_mapping.get(request.language) or request.voice
    return request.voice


@router.get("/voices")
async def voices(engine: Literal["edge", "piper"] = "edge"):
    if engine == "piper":
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get("http://piper:8000/voices")
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as exc:
            raise HTTPException(503, "Local voice catalog unavailable") from exc
    global _voice_cache
    cached_at, cached = _voice_cache
    if cached and time.monotonic() - cached_at < 3600:
        return {"voices": cached}
    try:
        catalog = await asyncio.wait_for(edge_tts.list_voices(), timeout=15)
    except Exception as exc:
        raise HTTPException(503, "Voice catalog unavailable") from exc
    available = sorted([
        {"id": v["ShortName"], "locale": v["Locale"],
         "name": v["ShortName"].split("-")[-1].removesuffix("Neural")}
        for v in catalog if v["Locale"].split("-")[0] in LANGUAGES
    ], key=lambda v: (v["locale"], v["name"]))
    _voice_cache = (time.monotonic(), available)
    return {"voices": available}


async def synthesize(segment: dict, voice: str, engine: str = "edge") -> dict:
    if engine == "piper":
        async with httpx.AsyncClient(timeout=40) as client:
            response = await client.post("http://piper:8000/synthesize",
                                         json={"text": segment["text"], "voice": voice})
            response.raise_for_status()
            return {"type": "chunk", **segment, "words": [], "mime": "audio/wav",
                    "audio": base64.b64encode(response.content).decode("ascii")}
    audio = bytearray()
    words = []
    # WordBoundary is opt-in in edge-tts 7.2; units are 100 ns, relative to
    # this segment, as in TD_daniele's sintetizza_chunk_con_tempi.
    communicate = edge_tts.Communicate(segment["text"], voice, boundary="WordBoundary")
    async for event in communicate.stream():
        if event["type"] == "audio":
            audio.extend(event["data"])
        elif event["type"] == "WordBoundary":
            start = event["offset"] / 1e7
            words.append([event["text"], start, start + event["duration"] / 1e7])
    if not audio:
        raise ValueError("No audio received")
    return {"type": "chunk", **segment, "words": words,
            "audio": base64.b64encode(audio).decode("ascii")}


async def reader_events(segments: list[dict], voice: str, engine: str = "edge"):
    def sse(event):
        return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    yield sse({"type": "init", "segments": segments, "voice": voice})
    for segment in segments:
        try:
            event = await asyncio.wait_for(synthesize(segment, voice, engine), timeout=45)
        except Exception:
            # Never echo provider exceptions: they can contain submitted text.
            event = {"type": "chunk_error", "index": segment["index"]}
        yield sse(event)
    yield sse({"type": "done"})


@router.post("/stream")
async def stream(request: ReaderRequest, db: Session = Depends(database.get_db)):
    segments = spoken_segments(request.text, request.language, request.pronunciations, request.plain_text)
    if not segments:
        raise HTTPException(422, "No readable text")
    voice = reader_voice(request, db)
    return StreamingResponse(reader_events(segments, voice, request.engine), media_type="text/event-stream",
                             headers={"Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no"})
