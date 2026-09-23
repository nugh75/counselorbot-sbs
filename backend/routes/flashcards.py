"""Read, save and reset a student's personal flashcards."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import auth, database
from ..flashcards import SaveFlashcards, load_flashcards, save_flashcards

router = APIRouter()


@router.get('/user/flashcards')
def read_flashcards(db: Session = Depends(database.get_db), identity: dict = Depends(auth.get_current_user)):
    return load_flashcards(db, identity['username'])


@router.put('/user/flashcards')
def write_flashcards(update: SaveFlashcards, db: Session = Depends(database.get_db),
                     identity: dict = Depends(auth.get_current_user)):
    return save_flashcards(db, identity['username'], update)
