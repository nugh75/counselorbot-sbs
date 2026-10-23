"""Spike F0-01: the real CounselorBot backend as a PyInstaller sidecar.

It imports `backend.main` unchanged, so PyInstaller collects the whole import
graph (pymupdf, numpy, cryptography, argon2, psycopg2...). Two modes:

- minimal (default): SQLite in the data folder and no lifespan. The mother's
  startup migrations are Postgres-only (`ADD COLUMN IF NOT EXISTS`), so on
  SQLite the real lifespan stops the app.
- full: the real lifespan against DATABASE_URL (Postgres), used in CI on Linux.

Spike only: nothing here is product code.
"""
import argparse
import importlib
import os
import shutil
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

_STARTED = time.monotonic()


def _parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=18765)
    parser.add_argument("--mode", choices=["minimal", "full"], default=os.getenv("SPIKE_MODE", "minimal"))
    parser.add_argument("--data-dir", default=os.getenv("COUNSELORBOT_DATA_DIR", ""))
    return parser.parse_args()


def _prepare_env(args):
    data_dir = Path(args.data_dir or Path.home() / ".counselorbot-spike").resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("DATA_DIR", str(data_dir / "uploads"))
    if args.mode == "minimal":
        os.environ.setdefault("DATABASE_URL", f"sqlite:///{(data_dir / 'spike.db').as_posix()}")
    # strategy_memory reads "knowledge/..." relative to the working directory.
    os.chdir(data_dir)
    return data_dir


def _natives():
    """What the packaged interpreter can load, and which CLI tools it finds."""
    modules = {}
    for name in ("fitz", "pymupdf4llm", "numpy", "cryptography.fernet", "argon2", "bcrypt",
                 "psycopg2", "PIL.Image", "pdf2image", "jose", "fpdf", "pypdf", "edge_tts"):
        try:
            importlib.import_module(name)
            modules[name] = "ok"
        except Exception as exc:  # report, do not crash: this is the point of the spike
            modules[name] = f"{type(exc).__name__}: {exc}"[:200]
    checks = {}
    try:
        from argon2 import PasswordHasher
        hasher = PasswordHasher()
        checks["argon2_roundtrip"] = hasher.verify(hasher.hash("spike"), "spike")
    except Exception as exc:
        checks["argon2_roundtrip"] = repr(exc)[:200]
    try:
        import fitz
        doc = fitz.open()
        doc.new_page().insert_text((72, 72), "spike")
        checks["pymupdf_render_png_bytes"] = len(doc[0].get_pixmap().tobytes("png"))
    except Exception as exc:
        checks["pymupdf_render_png_bytes"] = repr(exc)[:200]
    tools = {tool: shutil.which(tool) for tool in ("dot", "pdftoppm", "tesseract")}
    return {"modules": modules, "checks": checks, "tools": tools}


def main():
    args = _parse_args()
    data_dir = _prepare_env(args)
    import uvicorn
    from backend import main as backend_main

    app = backend_main.app
    import_seconds = round(time.monotonic() - _STARTED, 2)

    if args.mode == "minimal":
        @asynccontextmanager
        async def _no_lifespan(_app):
            yield

        app.router.lifespan_context = _no_lifespan

    @app.get("/spike/info")
    def spike_info():
        return {
            "mode": args.mode,
            "frozen": bool(getattr(sys, "frozen", False)),
            "platform": sys.platform,
            "python": sys.version.split()[0],
            "import_seconds": import_seconds,
            "data_dir": str(data_dir),
            "database": os.environ.get("DATABASE_URL", "").split("@")[-1],
            "natives": _natives(),
        }

    print(f"spike-sidecar: import {import_seconds}s, listening on {args.host}:{args.port}", flush=True)
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning", workers=1)


if __name__ == "__main__":
    main()
