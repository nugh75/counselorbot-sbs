#!/usr/bin/env python3
"""Offline SQLite/WAL load: 30 students, synthetic LLM streams and background I/O.

Always creates a temporary database; never uses DATABASE_URL for the workload.
Uses production models, engine configuration, write sessions and AI dispatch.
No HTTP server, credentials or external provider are needed.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import math
from pathlib import Path
import platform
import sqlite3
import sys
import tempfile
import threading
import time

from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend import database, models  # noqa: E402
from backend.ai_service import AIService  # noqa: E402


def percentiles(samples):
    """Nearest-rank percentiles, milliseconds (including lock/pool wait)."""
    values = sorted(value * 1000 for value in samples)
    return {
        "count": len(values),
        **{f"p{p}_ms": round(values[max(0, math.ceil(len(values) * p / 100) - 1)], 3)
           if values else None for p in (50, 95, 99)},
        "max_ms": round(values[-1], 3) if values else None,
    }


def run_benchmark(*, workers=30, rounds=3, chunks=4, chunk_delay=.01):
    if min(workers, rounds, chunks) < 1 or chunk_delay < 0:
        raise ValueError("workers, rounds and chunks must be positive; delay must be nonnegative")
    with tempfile.TemporaryDirectory(prefix="cb-sqlite-load-") as folder:
        engine = create_engine(f"sqlite:///{Path(folder) / 'load.sqlite3'}",
                               connect_args={"check_same_thread": False})
        database.configure_sqlite_engine(engine)
        try:
            return _run(engine, workers, rounds, chunks, chunk_delay)
        finally:
            engine.dispose()


def _run(engine, workers, rounds, chunks, chunk_delay):
    models.Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False)
    write_session = lambda: database.as_write_session(sessions())
    with write_session() as db:
        db.add_all(models.Config(key=key, value=value) for key, value in {
            "active_provider": "openai", "model_name": "synthetic-load-model",
            "pii_ner_enabled": "false", "monthly_budget_usd": "1000000",
            "ai_fallback_targets": "[]", "load-housekeeping": "0",
        }.items())
        db.add_all(models.FrozenSession(username=f"load-student-{i}", session_id=f"load-{i}",
                                        questionnaire_type="QSA", data={"tokens": 0})
                   for i in range(workers))
        db.commit()
    with engine.connect() as conn:
        pragmas = {name: conn.exec_driver_sql(f"PRAGMA {name}").scalar()
                   for name in ("journal_mode", "busy_timeout", "foreign_keys", "synchronous")}

    mutex, stop = threading.Lock(), threading.Event()
    rendezvous = threading.Barrier(workers)
    active = peak = completed = 0
    background_during_stream = reads_during_stream = 0
    errors, lock_errors = [], []
    samples = {name: [] for name in ("first_token", "turn", "prepare", "save", "read", "background")}

    @event.listens_for(engine, "handle_error")
    def record_db_error(context):
        original = context.original_exception
        if isinstance(original, sqlite3.OperationalError) and (
            "locked" in str(original).lower() or "busy" in str(original).lower()
        ):
            with mutex:
                lock_errors.append(type(original).__name__)

    def sample(name, start):
        with mutex:
            samples[name].append(time.perf_counter() - start)

    def guarded(fn, *args):
        try:
            fn(*args)
        except Exception as exc:
            # Only classifications: no provider payloads, credentials or DB values.
            with mutex:
                errors.append(type(exc).__name__)
            rendezvous.abort()

    def student(number):
        nonlocal active, peak, completed
        for turn in range(rounds):
            start = prep_start = time.perf_counter()
            with write_session() as request_db:
                ai = AIService(request_db, username=f"load-student-{number}")
                request_db.add(models.Log(session_id=f"load-{number}", action="load_user_turn"))
                request_db.commit()
                request_db.close()  # Same boundary as the streaming routes.
                sample("prepare", prep_start)

                def provider(*args, **kwargs):
                    nonlocal active, peak
                    assert not request_db.in_transaction(), "request transaction crossed provider boundary"
                    # Budget dispatch already ran; it must not have re-opened the request DB.
                    with mutex:
                        active += 1
                        peak = max(peak, active)
                    try:
                        if turn == 0:
                            rendezvous.wait(timeout=30)  # Proves all 30 streams overlap.
                        for _ in range(chunks):
                            time.sleep(chunk_delay)
                            yield "token "
                        yield {"type": "usage", "usage": {"completion_tokens": chunks}}
                    finally:
                        with mutex:
                            active -= 1

                ai._providers["openai"]["stream"] = provider
                first, usage = True, None
                for item in ai.stream_response("Synthetic question", "Synthetic prompt", "chat"):
                    if item.get("type") == "usage":
                        usage = item["usage"]
                        continue
                    if first:
                        sample("first_token", start)
                        first = False
                    save_start = time.perf_counter()
                    with write_session() as save_db:
                        row = save_db.query(models.FrozenSession).filter_by(session_id=f"load-{number}").one()
                        row.data = {"tokens": row.data["tokens"] + 1}
                        save_db.commit()
                    sample("save", save_start)
                assert not first and usage == {"completion_tokens": chunks}
                with write_session() as log_db:
                    log_db.add(models.Log(session_id=f"load-{number}", action="load_assistant_turn",
                                          details={"usage": usage}, cost_usd=.000001))
                    log_db.commit()
            sample("turn", start)
            with mutex:
                completed += 1

    def background():
        nonlocal background_during_stream
        while not stop.is_set():
            start = time.perf_counter()
            with write_session() as db:
                row = db.get(models.Config, "load-housekeeping")
                row.value = str(int(row.value) + 1)
                # Same short read/delete/commit pattern as retention/session-save jobs.
                db.query(models.Log).filter(models.Log.action == "load_expired").delete()
                db.commit()
            with mutex:
                background_during_stream += int(active > 0)
            sample("background", start)
            stop.wait(.005)

    def reader():
        nonlocal reads_during_stream
        while not stop.is_set():
            start = time.perf_counter()
            with sessions() as db:
                db.scalar(select(func.count()).select_from(models.Log))
            with mutex:
                reads_during_stream += int(active > 0)
            sample("read", start)
            stop.wait(.005)

    start = time.perf_counter()
    try:
        with ThreadPoolExecutor(max_workers=workers + 2) as pool:
            jobs = [pool.submit(guarded, background), pool.submit(guarded, reader)]
            students = [pool.submit(guarded, student, i) for i in range(workers)]
            try:
                for future in students:
                    future.result(timeout=120)
            finally:
                stop.set()
            for future in jobs:
                future.result(timeout=30)
    finally:
        stop.set()
        event.remove(engine, "handle_error", record_db_error)
    elapsed = time.perf_counter() - start
    with sessions() as db:
        token_counts = [row.data["tokens"] for row in db.query(models.FrozenSession).all()]
        logged_turns = db.query(models.Log).filter_by(action="load_assistant_turn").count()
        logged_tokens = sum(row.details["usage"]["completion_tokens"] for row in
                           db.query(models.Log).filter_by(action="load_assistant_turn"))
    with engine.connect() as conn:
        integrity = conn.exec_driver_sql("PRAGMA integrity_check").scalar()
    success = (not errors and not lock_errors and completed == workers * rounds
               and peak == workers and background_during_stream > 0 and reads_during_stream > 0
               and token_counts == [rounds * chunks] * workers and logged_turns == workers * rounds
               and logged_tokens == workers * rounds * chunks and integrity == "ok"
               and pragmas == {"journal_mode": "wal", "busy_timeout": 5000, "foreign_keys": 1, "synchronous": 1})
    return {
        "ok": success, "workers": workers, "rounds": rounds, "chunks_per_turn": chunks,
        "chunk_delay_ms": chunk_delay * 1000, "python": platform.python_version(),
        "sqlite": sqlite3.sqlite_version, "platform": platform.system(), "pragmas": pragmas,
        "elapsed_seconds": round(elapsed, 3), "completed_turns": completed,
        "peak_streams": peak, "background_commits_during_stream": background_during_stream,
        "reads_during_stream": reads_during_stream, "errors": errors, "lock_errors": lock_errors,
        "logged_turns": logged_turns, "logged_tokens": logged_tokens, "integrity": integrity,
        "latency": {name: percentiles(values) for name, values in samples.items()},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    # --workers is reserved for the uvicorn single-process safety check.
    parser.add_argument("--students", dest="workers", type=int, default=30)
    parser.add_argument("--rounds", type=int, default=3)
    parser.add_argument("--chunks", type=int, default=4)
    parser.add_argument("--chunk-delay", type=float, default=.01, help="Seconds between synthetic tokens")
    parser.add_argument("--json", type=Path, help="Optional report destination")
    args = parser.parse_args()
    result = run_benchmark(workers=args.workers, rounds=args.rounds,
                           chunks=args.chunks, chunk_delay=args.chunk_delay)
    output = json.dumps(result, indent=2) + "\n"
    if args.json:
        args.json.write_text(output, encoding="utf-8")
    print(output, end="")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
