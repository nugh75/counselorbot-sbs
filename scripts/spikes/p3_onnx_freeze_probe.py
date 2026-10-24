"""P3 freeze probe: onnxruntime + tokenizers + a GLiNER model inside PyInstaller.

Build (onedir, like desktop/teacher/scripts/build-backend.sh) and run:
    python -m PyInstaller --noconfirm --onedir --name p3-onnx-probe \
        --paths scripts/spikes scripts/spikes/p3_onnx_freeze_probe.py
    dist/p3-onnx-probe/p3-onnx-probe <model_dir> <onnx_file>
Prints one JSON line; exit 1 if the model finds no person in the test sentence.
Used by .github/workflows/spike-pii-engine.yml (macOS arm64, Windows x64, Linux x64).
"""
from __future__ import annotations

import json
import platform
import sys
import time

SENTENCE = "Riccardo Ricci frequenta il Liceo Scientifico di Bologna."


def main(argv: list[str]) -> int:
    t0 = time.perf_counter()
    import onnxruntime
    import tokenizers

    from p3_gliner_onnx import GlinerOnnx

    model = GlinerOnnx(argv[1], argv[2], ["person", "school", "city"])
    loaded = time.perf_counter()
    spans = model.predict(SENTENCE)
    done = time.perf_counter()
    print(json.dumps({
        "frozen": bool(getattr(sys, "frozen", False)),
        "platform": f"{platform.system()}-{platform.machine()}",
        "python": platform.python_version(),
        "onnxruntime": onnxruntime.__version__,
        "providers": onnxruntime.get_available_providers(),
        "tokenizers": tokenizers.__version__,
        "load_s": round(loaded - t0, 2),
        "infer_ms": round((done - loaded) * 1000, 1),
        "labels": sorted({label for _, _, label, _ in spans}),
    }))
    return 0 if any(label == "person" for _, _, label, _ in spans) else 1


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: p3-onnx-probe <model_dir> <onnx_file>")
    raise SystemExit(main(sys.argv))
