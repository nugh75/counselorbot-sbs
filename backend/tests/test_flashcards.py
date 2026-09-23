import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from backend.flashcards import SaveFlashcards, FlashcardWorkspace, load_flashcards, save_flashcards
from backend.tests.artifact_database import artifact_session


@pytest.fixture
def db():
    with artifact_session() as session:
        yield session


def workspace(**decks):
    return FlashcardWorkspace.model_validate(decks or {
        'decks': [
            {'id': 'deck1', 'title': 'Vocabolario francese', 'cards': [
                {'id': 'c1', 'front': 'maison', 'back': 'casa', 'status': 'known'},
                {'id': 'c2', 'front': 'clavicola', 'back': 'Osso del tegumento della spalla', 'image': 'card:mind_mapping'},
            ]},
        ]})


def test_roundtrip_scopes_by_user(db):
    saved = save_flashcards(db, 'alice', SaveFlashcards(revision=0, workspace=workspace()))
    db.expire_all()
    assert load_flashcards(db, 'alice') == saved
    assert saved['revision'] > 0
    # Another user starts empty and does not see alice's decks.
    assert load_flashcards(db, 'bob') == {'revision': 0, 'workspace': FlashcardWorkspace().model_dump()}


def test_stale_revision_conflicts(db):
    save_flashcards(db, 'alice', SaveFlashcards(revision=0, workspace=workspace()))
    with pytest.raises(HTTPException) as error:
        save_flashcards(db, 'alice', SaveFlashcards(revision=0, workspace=workspace()))
    assert error.value.status_code == 409


def test_rejects_invalid_work(db):
    for change in (
        {'decks': [{'id': 'd', 'title': 'x', 'cards': [{'id': 'c', 'front': '', 'back': 'b'}]}]},
        {'decks': [{'id': 'd', 'title': 'd', 'cards': [{'id': 'c', 'front': 'f', 'back': ''}]}]},
        {'decks': [{'id': 'd', 'title': '', 'cards': []}]},
        {'decks': [{'id': 'd', 'title': 'd'}, {'id': 'd', 'title': 'duplicate'}]},
        {'decks': [{'id': 'd', 'title': 'd', 'cards': [{'id': 'c', 'front': 'f', 'back': 'b', 'status': 'mastered'}]}]},
        {'decks': [{'id': 'd', 'title': 'd', 'cards': [{'id': 'c', 'front': 'f', 'back': 'b', 'image': 'x' * 201}]}]},
    ):
        with pytest.raises(ValidationError):
            FlashcardWorkspace.model_validate(change)


def test_limits(db):
    # At most 20 decks and 200 cards per deck.
    with pytest.raises(ValidationError):
        FlashcardWorkspace.model_validate({'decks': [{'id': f'd{i}', 'title': f'Deck {i}'} for i in range(21)]})
    with pytest.raises(ValidationError):
        FlashcardWorkspace.model_validate({'decks': [{'id': 'd', 'title': 'D', 'cards': [
            {'id': f'c{i}', 'front': 'f', 'back': 'b'} for i in range(201)]}]})
    assert len(FlashcardWorkspace.model_validate({'decks': [{'id': f'd{i}', 'title': f'D{i}'} for i in range(20)]}).decks) == 20
