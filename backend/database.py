import os

from fastapi import Depends, Request
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker
from starlette.requests import HTTPConnection

from . import auth

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost/counselorbot")
DATA_DIR = os.getenv("DATA_DIR", "/app/uploads")

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def write_session():
    """Sessione per cicli in background e job; chi la apre la chiude."""
    return SessionLocal()


def independent_read_session(db):
    """Short committed-state lookup outside the caller's transaction.

    Callers own/close this session before provider I/O. A Connection bind keeps
    test savepoints; production Engine binds use a separate connection.
    """
    return Session(bind=db.get_bind(), join_transaction_mode="create_savepoint")


def get_db(connection: HTTPConnection):
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_personal_ai_db(request: Request, db=Depends(get_db), identity=Depends(auth.get_identity_view_as)):
    """Request-scoped AI owner; never derive it from a session/result ID."""
    from .chatgpt_connections import bind_identity
    bind_identity(db, identity, request.headers.get("X-CounselorBot-Language", "it"))
    return db
