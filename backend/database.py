import os
from fastapi import Depends, Request
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from . import auth

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./counselorbot.db")

if "sqlite" in SQLALCHEMY_DATABASE_URL:
    connect_args = {"check_same_thread": False}
else:
    connect_args = {}

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args=connect_args
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
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
