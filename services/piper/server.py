"""CPU-only Piper service. Models are bundled; synthesis requires no network."""
import io
import json
import threading
import wave
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from piper import PiperVoice, SynthesisConfig
from piper.config import PiperConfig
import onnxruntime
from pydantic import BaseModel, Field

app = FastAPI()
manifest = json.loads(Path("voices.json").read_text())
catalog = {v["key"]: v for v in manifest["voices"]}
lock = threading.Lock()


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    voice: str


@lru_cache(maxsize=2)
def load_voice(voice: str):
    # ONNX defaults to the host's CPU count, which oversubscribes this two-CPU
    # container and makes even a short sentence take tens of seconds.
    options = onnxruntime.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    return PiperVoice(
        session=onnxruntime.InferenceSession(f"models/{voice}.onnx", sess_options=options,
                                             providers=["CPUExecutionProvider"]),
        config=PiperConfig.from_dict(json.loads(Path(f"models/{voice}.onnx.json").read_text())),
    )


@app.get("/voices")
def voices():
    return {"voices": [{"id": key, "name": v["name"].capitalize(),
                        "locale": v["language"]["code"].replace("_", "-"), "gender": v["gender"]}
                       for key, v in catalog.items()]}


@app.post("/synthesize")
def synthesize(request: SpeechRequest):
    if request.voice not in catalog:
        raise HTTPException(422, "Unknown voice")
    with lock:
        output = io.BytesIO()
        with wave.open(output, "wb") as wav:
            load_voice(request.voice).synthesize_wav(request.text, wav,
                syn_config=SynthesisConfig(speaker_id=catalog[request.voice].get("default_speaker_id")))
        return Response(output.getvalue(), media_type="audio/wav",
                        headers={"Cache-Control": "no-store"})
