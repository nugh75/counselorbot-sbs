"""Backend CounselorBot come sidecar dell'app docente (ADR-0002 §2).

Entrypoint impacchettato con PyInstaller (onedir). Importa `backend.main` senza
modificarlo e avvia uvicorn con 1 worker su HOST/PORT scelti dal guscio.

- La porta viene occupata **prima** dell'import (lento: 5-25 s) e passata a
  uvicorn come socket gia' aperto: niente corse con altri programmi. uvicorn
  ascolta solo dopo il lifespan, quindi `GET /health` 200 = migrazioni finite.
- `--lifeline`: un thread legge stdin; a EOF (il guscio e' morto o chiede
  l'arresto) ferma uvicorn e dopo 10 s esce comunque (ADR-0002 §2.4).
- Codici di uscita (ADR-0002 §2.5): 0 arresto richiesto; 3 cartella dati o
  database inutilizzabile (anche lifespan fallito: e' il codice di uvicorn);
  4 porta occupata; altro = crash.
- `--minimal`: niente lifespan. Solo finche' il backend non e' compatibile con
  SQLite (F1-05*): serve allo smoke test di `/health` e `/version` in CI.
"""
import argparse
import errno
import os
import socket
import sys
import threading
from contextlib import asynccontextmanager
from pathlib import Path

EXIT_DATA_UNUSABLE = 3
EXIT_PORT_IN_USE = 4
STOP_GRACE_SECONDS = 10
ADDRESS_IN_USE = {errno.EADDRINUSE, 10048}  # 10048 = WSAEADDRINUSE
# Directories of ADR-0002 §1.2 the backend writes to.
DIR_VARIABLES = (
    "DATA_DIR", "PORTFOLIO_STORAGE_DIR", "TAVOLO_STORAGE_DIR", "TAVOLO_IMAGES_STORAGE_DIR",
    "IDEA_SOURCES_STORAGE_DIR", "QSA_PDF_STORAGE_DIR", "PQBL_STORAGE_DIR", "RAG_INDEX_DIR",
    "RAG_DYNAMIC_COLLECTIONS_DIR", "SESSION_MEMORY_DIR", "PERSONAL_API_CREDENTIALS_DIR",
)


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--host", default=os.getenv("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "8000")))
    parser.add_argument("--lifeline", action="store_true", help="fermati quando stdin si chiude")
    parser.add_argument("--minimal", action="store_true", help="senza lifespan (solo smoke test)")
    return parser.parse_args(argv)


def bind(host, port):
    """Listening is left to uvicorn: until then connections are refused."""
    family = socket.AF_INET6 if ":" in host else socket.AF_INET
    sock = socket.socket(family, socket.SOCK_STREAM)
    if sys.platform == "win32":
        # Without it another program could bind the same port on Windows.
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
    else:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind((host, port))
    except OSError as error:
        sock.close()
        if error.errno in ADDRESS_IN_USE or getattr(error, "winerror", None) == 10048:
            print(f"sidecar: porta {host}:{port} occupata", file=sys.stderr, flush=True)
            sys.exit(EXIT_PORT_IN_USE)
        raise
    return sock


def check_data_dirs(environ=os.environ):
    """Every writable folder must exist and accept a file, else exit 3."""
    paths = [Path(environ[name]) for name in DIR_VARIABLES if environ.get(name)]
    url = environ.get("DATABASE_URL", "")
    if url.startswith("sqlite:///"):
        paths.append(Path(url[len("sqlite:///"):]).parent)
    for path in paths:
        try:
            path.mkdir(parents=True, exist_ok=True)
            probe = path / ".write-test"
            probe.write_bytes(b"")
            probe.unlink()
        except OSError as error:
            print(f"sidecar: cartella dati inutilizzabile {path}: {error}", file=sys.stderr, flush=True)
            sys.exit(EXIT_DATA_UNUSABLE)


def watch_stdin(server, stdin=None, grace=STOP_GRACE_SECONDS, exit_now=os._exit):
    """Lifeline pipe: the shell never writes, so read() returns only at EOF.
    Returns an Event set once the stop has been requested."""
    stream = stdin or sys.stdin.buffer
    closed = threading.Event()

    def run():
        try:
            while stream.read(65536):
                pass
        except (OSError, ValueError):
            pass
        print("sidecar: stdin chiuso, arresto", file=sys.stderr, flush=True)
        closed.set()
        server.should_exit = True
        timer = threading.Timer(grace, exit_now, args=(0,))
        timer.daemon = True
        timer.start()

    threading.Thread(target=run, name="lifeline", daemon=True).start()
    return closed


def main(argv=None):
    args = parse_args(argv)
    sock = bind(args.host, args.port)
    check_data_dirs()

    import uvicorn
    from backend import main as backend_main

    app = backend_main.app
    if args.minimal:
        @asynccontextmanager
        async def no_lifespan(_app):
            yield

        app.router.lifespan_context = no_lifespan

    config = uvicorn.Config(app, host=args.host, port=args.port, workers=1, log_level="info")
    server = uvicorn.Server(config)
    stop_requested = watch_stdin(server) if args.lifeline else threading.Event()
    print(f"sidecar: avvio su {args.host}:{args.port}", file=sys.stderr, flush=True)
    server.run(sockets=[sock])
    # uvicorn.run() exits 3 when the lifespan fails; Server.run() leaves it to us.
    if not server.started and not stop_requested.is_set():
        sys.exit(EXIT_DATA_UNUSABLE)
    sys.exit(0)


if __name__ == "__main__":
    main()
