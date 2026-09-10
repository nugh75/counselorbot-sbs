"""The laboratory's own database. Never the application's.

There is no default URL on purpose. A missing configuration must stop the
laboratory, not send it to `sqlite:///./counselorbot.db` or to whatever
`DATABASE_URL` happens to point at; the one thing this module must never do is
open a connection to production because nobody set a variable.

`Base` is independent of the application's `Base` for the same reason:
`create_all` on one must never create or touch the tables of the other, and
`init_schema()` is explicit so importing the module creates nothing.
"""
from __future__ import annotations

import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import declarative_base, sessionmaker, validates

URL_ENV = "PROMPT_LAB_DATABASE_URL"
URL_FILE_ENV = "PROMPT_LAB_DATABASE_URL_FILE"

RUN_KINDS = ("prepare", "evaluate")
RUN_STATES = ("queued", "running", "completed", "failed", "cancelled",
              "budget_exceeded", "interrupted")
TERMINAL_RUN_STATES = ("completed", "failed", "cancelled", "budget_exceeded", "interrupted")
EXPERIMENT_STATES = ("draft", "ready", "running", "completed", "failed")

Base = declarative_base()


class LabUnavailable(RuntimeError):
    """The laboratory is not configured, or its database cannot be reached."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid4())


# --- tables -----------------------------------------------------------------
class LabExperiment(Base):
    __tablename__ = "lab_experiments"

    id = Column(String, primary_key=True, default=_uuid)
    title = Column(String, nullable=False)
    purpose = Column(String, nullable=False)
    target_key = Column(String, nullable=False, index=True)
    created_by = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    state = Column(String, nullable=False, default="draft")
    payload = Column(JSON, nullable=False, default=dict)
    snapshot = Column(JSON, nullable=False, default=dict)
    cases = Column(JSON, nullable=False, default=list)
    candidates = Column(JSON, nullable=False, default=list)
    summary = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)


class LabRun(Base):
    """One execution. Its manifest is what it is about, and it never changes.

    The worker reads the manifest, not the experiment row: an administrator
    editing cases while a run is in flight must not change what that run is
    measuring.
    """

    __tablename__ = "lab_runs"

    id = Column(String, primary_key=True, default=_uuid)
    experiment_id = Column(String, ForeignKey("lab_experiments.id"), nullable=False, index=True)
    kind = Column(String, nullable=False)
    state = Column(String, nullable=False, default="queued", index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    heartbeat_at = Column(DateTime(timezone=True), nullable=True)
    cancel_requested = Column(Boolean, nullable=False, default=False)
    calls = Column(Integer, nullable=False, default=0)
    error = Column(Text, nullable=True)
    manifest = Column(JSON, nullable=False)
    summary = Column(JSON, nullable=True)

    @validates("manifest")
    def _freeze_manifest(self, _key: str, value: Any) -> Any:
        # The database role is the real guard; this one catches the mistake in
        # process, where it is still readable as a stack trace.
        current = getattr(self, "manifest", None)
        if current is not None and current != value:
            raise ValueError("a run manifest is frozen at queue time")
        return value


class LabResult(Base):
    """One response and its judgment.

    Errors are rows too. A call that failed, a reply that came back empty and
    a judgment that could not be read all have to stay visible: dropping them
    would shrink the denominator until the test passes.
    """

    __tablename__ = "lab_results"

    id = Column(String, primary_key=True, default=_uuid)
    run_id = Column(String, ForeignKey("lab_runs.id"), nullable=False, index=True)
    case_id = Column(String, nullable=False)
    preset_id = Column(Integer, nullable=False)
    variant_id = Column(String, nullable=False)
    repetition = Column(Integer, nullable=False, default=1)
    response = Column(Text, nullable=True)
    raw_response = Column(Text, nullable=True)
    judgment = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)
    envelope = Column(JSON, nullable=True)
    duration_s = Column(Float, nullable=True)


Index("ix_lab_results_run_case", LabResult.run_id, LabResult.case_id)


# --- connection -------------------------------------------------------------
_FACTORIES: dict[str, sessionmaker] = {}
_LOCK = threading.Lock()


def database_url() -> str:
    """Where the laboratory keeps its work. Configured, or nothing.

    The file form exists because the URL carries a password: a secret handed
    over as a mounted file does not end up in `docker inspect` or in a process
    listing the way an environment value does.
    """
    path = (os.getenv(URL_FILE_ENV) or "").strip()
    if path:
        try:
            url = Path(path).read_text(encoding="utf-8").strip()
        except OSError as exc:
            raise LabUnavailable(f"{URL_FILE_ENV} cannot be read") from exc
        if not url:
            raise LabUnavailable(f"{URL_FILE_ENV} is empty")
        return url
    url = (os.getenv(URL_ENV) or "").strip()
    if not url:
        raise LabUnavailable(f"neither {URL_FILE_ENV} nor {URL_ENV} is set")
    return url


def availability() -> tuple[bool, str | None]:
    """`(enabled, reason)` for GET /options. The reason never carries a URL."""
    try:
        database_url()
    except LabUnavailable as exc:
        return False, str(exc)
    return True, None


def session_factory(url: str | None = None) -> sessionmaker:
    """One engine per URL, kept for the life of the process."""
    url = url or database_url()
    with _LOCK:
        factory = _FACTORIES.get(url)
        if factory is not None:
            return factory
        connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
        engine = create_engine(url, connect_args=connect_args, future=True,
                               pool_pre_ping=not url.startswith("sqlite"))
        factory = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
        _FACTORIES[url] = factory
        return factory


def get_lab_session() -> Iterator[Any]:
    """FastAPI dependency. Raises `LabUnavailable` when unconfigured."""
    db = session_factory()()
    try:
        yield db
    finally:
        db.close()


def init_schema(url: str | None = None) -> None:
    """Create the tables. Called on purpose, never on import."""
    Base.metadata.create_all(bind=session_factory(url).kw["bind"])


def reset_factories() -> None:
    """Forget the cached engines. For tests that swap databases."""
    with _LOCK:
        for factory in _FACTORIES.values():
            factory.kw["bind"].dispose()
        _FACTORIES.clear()


# --- serialisation ----------------------------------------------------------
def serializer(row: Any) -> dict:
    """A row as JSON-ready data: declared columns only, dates in ISO 8601.

    Only what the table declares. A row rendered by reading `__dict__` would
    hand the caller whatever a relationship or a cached attribute happens to
    be holding.
    """
    out: dict[str, Any] = {}
    for column in row.__table__.columns:
        value = getattr(row, column.name, None)
        if isinstance(value, datetime):
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            value = value.isoformat()
        out[column.name] = value
    return out
