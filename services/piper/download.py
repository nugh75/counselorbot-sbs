"""Build-time voice download with provider checksums and model cards."""
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

manifest = json.loads(Path("voices.json").read_text())
folder = Path("models")
folder.mkdir(exist_ok=True)
for voice in manifest["voices"]:
    for path, metadata in voice["files"].items():
        name = path.rsplit("/", 1)[-1]
        if name == "MODEL_CARD":
            name = voice["key"] + ".MODEL_CARD"
        data = urlopen(f'https://huggingface.co/rhasspy/piper-voices/resolve/{manifest["revision"]}/{path}', timeout=120).read()
        if hashlib.md5(data).hexdigest() != metadata["md5_digest"]:
            raise ValueError(f"Checksum mismatch: {name}")
        (folder / name).write_bytes(data)
        print(f"Downloaded {name}", flush=True)
