"""«Reindicizza tutto»: one sequential job over every collection, with progress.

The state is a small JSON file next to the indexes, so every worker and a page
reload see the same progress. An exclusive flock held for the whole job makes
the start idempotent across workers. A state still marked "running" without a
lock holder means the worker stopped mid-job: it is reported as interrupted.
Errors are classified codes only (never provider messages, texts or keys).
"""
from __future__ import annotations

import copy
import fcntl
import json
import logging
import os
import tempfile
import threading
import time

from sqlalchemy.orm import Session

from . import rag_index

logger = logging.getLogger(__name__)
_start_lock = threading.Lock()
_thread: threading.Thread | None = None
IDLE = {"status": "idle", "collections": []}


def _paths() -> tuple[str, str]:
    return (os.path.join(rag_index.INDEX_DIR, "reindex-all.json"),
            os.path.join(rag_index.INDEX_DIR, ".reindex-all.lock"))


def _lock_held(lock_path: str) -> bool:
    try:
        with open(lock_path, "a") as lockf:
            try:
                fcntl.flock(lockf, fcntl.LOCK_SH | fcntl.LOCK_NB)
            except BlockingIOError:
                return True
    except OSError:
        pass
    return False


def _write(state: dict):
    state_path, _ = _paths()
    fd, temporary = tempfile.mkstemp(prefix=".reindex-all-", dir=os.path.dirname(state_path))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(state, f)
        os.replace(temporary, state_path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def read_state() -> dict:
    state_path, lock_path = _paths()
    try:
        with open(state_path, encoding="utf-8") as f:
            state = json.load(f)
    except (OSError, ValueError):
        return copy.deepcopy(IDLE)
    if state.get("status") == "running" and not _lock_held(lock_path):
        state["status"] = "interrupted"
        for entry in state.get("collections", []):
            if entry.get("status") in ("pending", "running"):
                entry["status"] = "interrupted"
    return state


def start(ai_service, collections: list[dict]) -> tuple[bool, dict, str | None]:
    """Start the job unless one is running (in any worker): (started, state, reason).

    The job holds the shared build reservation for its whole life, so it never
    overlaps a single-collection build and none can start while it runs.
    """
    global _thread
    state_path, lock_path = _paths()
    os.makedirs(os.path.dirname(state_path), exist_ok=True)
    with _start_lock:
        lockf = open(lock_path, "a")
        try:
            fcntl.flock(lockf, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            lockf.close()
            return False, read_state(), "reindex_running"
        if not rag_index._build_reservation.acquire():
            lockf.close()
            return False, read_state(), "build_in_progress"
        state: dict = {
            "status": "running", "started_at": time.time(), "finished_at": None,
            "current": None, "provider": getattr(ai_service, "embedding_provider", "ollama"),
            "model": getattr(ai_service, "embedding_model", ""),
            "collections": [{"id": c["id"], "label": c["label"], "status": "pending",
                             "phase": None, "done": 0, "total": 0, "error": None}
                            for c in collections],
        }
        try:
            _write(state)
        except Exception:
            _release(lockf)
            raise
        _thread = threading.Thread(target=_run, args=(lockf, state, ai_service),
                                   name="rag-reindex-all", daemon=True)
        _thread.start()
        return True, copy.deepcopy(state), None


def _release(lockf):
    try:
        rag_index._build_reservation.release()
    finally:
        lockf.close()  # Releases the job lock for every worker.


def wait(timeout: float | None = None) -> bool:
    thread = _thread
    if thread is not None:
        thread.join(timeout)
    return thread is None or not thread.is_alive()


def _run(lockf, state: dict, ai_service):
    from .ai_service import AIService

    service, bind = ai_service, None
    if isinstance(ai_service, AIService):
        # The request session closes with the request: the job owns its own.
        bind = ai_service.db.get_bind()
        service = copy.copy(ai_service)
        service.config = dict(ai_service.config)
    try:
        if bind is None:
            _index_all(state, service)
        else:
            with Session(bind=bind) as db:
                service.db = db
                _index_all(state, service)
        state["status"] = "done"
    except Exception:
        logger.exception("Reindicizzazione completa interrotta")
        state["status"] = "error"
    finally:
        state["current"] = None
        state["finished_at"] = time.time()
        try:
            _write(state)
        finally:
            _release(lockf)


def _index_all(state: dict, service):
    for entry in state["collections"]:
        state["current"] = entry["id"]
        entry.update(status="running", phase="collecting")
        _write(state)

        def progress(phase, done, total, entry=entry):
            entry["phase"] = phase
            if phase == "embedding":  # Counts stay visible while saving.
                entry.update(done=done, total=total)
            _write(state)

        index = rag_index.get_index(entry["id"])
        # The reservation excludes start_build(), so the flag is free: the job owns it.
        with index._schedule_lock:
            busy = index._building
            if not busy:
                index._building = True
        if busy:
            entry.update(status="error", phase=None, error="rag_build_busy")
            _write(state)
            continue
        try:
            # Per-collection lock and atomic publish: the previous index serves
            # until this one is complete, and a failure stays here.
            index.build(service, progress=progress)
            entry.update(status="done", phase=None)
        except Exception as exc:
            entry.update(status="error", phase=None, error=rag_index.build_error_code(exc))
        finally:
            index._building = False
        _write(state)
