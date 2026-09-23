"""Personal flashcards: student-owned decks of front/back cards.

A dedicated study tool, independent from the reflection cards of the visual
workspace. Storage follows the revisioned personal-workspace pattern: one
Log(action="personal_flashcards") row per save, scoped to the authenticated
username, with a revision check against concurrent edits.
"""
import hashlib

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import Annotated, Literal

from . import models, pii

ACTION = 'personal_flashcards'
DECK_LIMIT = 20
CARD_LIMIT = 200
Identifier = Annotated[str, Field(min_length=1, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class Flashcard(StrictModel):
    id: Identifier
    front: str = Field(min_length=1, max_length=300)
    back: str = Field(min_length=1, max_length=600)
    # Optional illustration on the front: a builtin catalog id (card:name) or a
    # served tavolo image path.
    image: Annotated[str | None, Field(default=None, max_length=200)] = None
    # Study memory: None = never studied, 'known' = la so, 'review' = da ripassare.
    status: Literal['known', 'review'] | None = None


class FlashcardDeck(StrictModel):
    id: Identifier
    title: str = Field(min_length=1, max_length=100)
    cards: list[Flashcard] = Field(default_factory=list, max_length=CARD_LIMIT)


class FlashcardWorkspace(StrictModel):
    decks: list[FlashcardDeck] = Field(default_factory=list, max_length=DECK_LIMIT)

    @model_validator(mode='after')
    def valid_decks(self):
        if len({deck.id for deck in self.decks}) != len(self.decks):
            raise ValueError('Duplicate decks')
        return self


class SaveFlashcards(StrictModel):
    revision: int
    workspace: FlashcardWorkspace


def redact_flashcards(value):
    if isinstance(value, list):
        for item in value:
            redact_flashcards(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            if key in {'title', 'front', 'back'} and isinstance(item, str):
                value[key] = pii.redact(item)
            elif isinstance(item, (dict, list)):
                redact_flashcards(item)


def load_flashcards(db: Session, username: str) -> dict:
    row = db.query(models.Log).filter(
        models.Log.action == ACTION, models.Log.session_id.is_(None), models.Log.username == username,
    ).order_by(models.Log.id.desc()).first()
    workspace = FlashcardWorkspace.model_validate(row.details['workspace'] if row else {}).model_dump()
    return {'revision': row.id if row else 0, 'workspace': workspace}


def save_flashcards(db: Session, username: str, update: SaveFlashcards, *, commit: bool = True) -> dict:
    # One write at a time per user; the version check keeps two browser tabs
    # (or a stale auto-save) from silently overwriting each other.
    if db.get_bind().dialect.name == 'postgresql':
        key = int.from_bytes(hashlib.sha256(f'flashcards:{username}'.encode()).digest()[:8], 'big', signed=True)
        db.execute(text('SELECT pg_advisory_xact_lock(:key)'), {'key': key})
    current = load_flashcards(db, username)
    if update.revision != current['revision']:
        raise HTTPException(409, 'The flashcards were updated elsewhere')
    clean = update.workspace.model_dump()
    redact_flashcards(clean)
    clean = FlashcardWorkspace.model_validate(clean).model_dump()
    row = models.Log(action=ACTION, session_id=None, username=username, details={'workspace': clean})
    db.add(row)
    db.commit() if commit else db.flush()
    return {'revision': row.id, 'workspace': clean}
