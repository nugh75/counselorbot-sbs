"""Vocabolario dei bisogni e risoluzione dell'istituto dello studente.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_referral_needs_scope
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

import uuid
from urllib.parse import urlsplit, urlunsplit

import psycopg2
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import database, models
from backend.referral_needs import REFERRAL_NEEDS, known_needs, needs_from_text
from backend.referral_scope import NOT_LISTED, institution_for, institution_ids_for

TEST_DB_NAME = "counselorbot_test"
_prod = urlsplit(os.environ["DATABASE_URL"])
_test_url = urlunsplit((_prod.scheme, _prod.netloc, f"/{TEST_DB_NAME}", _prod.query, _prod.fragment))
_admin_url = urlunsplit((_prod.scheme, _prod.netloc, "/postgres", _prod.query, _prod.fragment))


def _ensure_test_database():
    conn = psycopg2.connect(_admin_url)
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (TEST_DB_NAME,))
            if not cur.fetchone():
                cur.execute(f'CREATE DATABASE "{TEST_DB_NAME}"')
    finally:
        conn.close()


_ensure_test_database()
_engine = create_engine(_test_url)
_TestSession = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
database.Base.metadata.create_all(bind=_engine)

PREFIX = f"t{uuid.uuid4().hex[:6]}"


def _institution(db, slug, **kwargs):
    row = models.Institution(slug=f"{PREFIX}-{slug}", name=f"Istituto {slug}",
                             kind="school", is_active=kwargs.pop("is_active", True), **kwargs)
    db.add(row); db.commit(); db.refresh(row)
    return row


def _notebook(db, username, institution_slug):
    data = {"context": "prova"}
    if institution_slug is not None:
        data["institution_slug"] = institution_slug
    row = models.LearnerProfileRevision(username=username, data=data, source="manual")
    db.add(row); db.commit()
    return row


def _class_with_institution(db, username, institution_id):
    group = models.StudentGroup(
        code=f"{PREFIX[:6].upper()}{uuid.uuid4().hex[:4].upper()}",
        name="Classe di prova", owner_username="docente", is_active=True,
        institution_id=institution_id,
    )
    db.add(group); db.commit(); db.refresh(group)
    db.add(models.GroupMembership(group_id=group.id, username=username, joined_via="teacher"))
    db.commit()
    return group


def _scope_clear(db, username):
    db.query(models.GroupMembership).filter(models.GroupMembership.username == username).delete()
    db.query(models.LearnerProfileRevision).filter(
        models.LearnerProfileRevision.username == username).delete()
    db.query(models.StudentGroup).filter(
        models.StudentGroup.owner_username == "docente",
        models.StudentGroup.code.like(f"{PREFIX[:6].upper()}%"),
    ).delete()
    db.query(models.Institution).filter(models.Institution.slug.like(f"{PREFIX}-%")).delete()
    db.commit()


# --- vocabolario dei bisogni -------------------------------------------------

def test_every_need_declares_label_and_keywords():
    assert len(REFERRAL_NEEDS) == 8
    for code, need in REFERRAL_NEEDS.items():
        assert need["label"].strip(), code
        assert need["keywords"], code


def test_needs_come_from_the_student_words():
    assert "disagio-emotivo" in needs_from_text("vorrei parlare con uno psicologo")
    assert "dsa-bes" in needs_from_text("ho una certificazione dsa, chi segue queste cose")
    assert "iscrizioni-scadenze" in needs_from_text("quando scadono le iscrizioni")
    assert "mobilita-estero" in needs_from_text("vorrei fare un erasmus")


def test_a_greeting_names_no_need():
    assert needs_from_text("ciao, grazie mille") == set()
    assert needs_from_text("") == set()


def test_known_needs_drops_what_is_not_in_the_vocabulary():
    assert known_needs(["scelta-percorso", "inventato"]) == ["scelta-percorso"]
    assert known_needs(None) == []


# --- scoping -----------------------------------------------------------------

def test_the_notebook_wins_over_the_class():
    db = _TestSession(); user = f"{PREFIX}-a"
    try:
        mine = _institution(db, "mio")
        other = _institution(db, "altro")
        _class_with_institution(db, user, other.id)
        _notebook(db, user, mine.slug)
        assert institution_ids_for(db, user) == [mine.id]
        assert institution_for(db, user).id == mine.id
    finally:
        _scope_clear(db, user); db.close()


def test_without_a_notebook_the_class_supplies_the_institution():
    db = _TestSession(); user = f"{PREFIX}-b"
    try:
        school = _institution(db, "classe")
        _class_with_institution(db, user, school.id)
        assert institution_ids_for(db, user) == [school.id]
    finally:
        _scope_clear(db, user); db.close()


def test_the_not_listed_sentinel_does_not_block_the_class_fallback():
    db = _TestSession(); user = f"{PREFIX}-c"
    try:
        school = _institution(db, "sentinella")
        _class_with_institution(db, user, school.id)
        _notebook(db, user, NOT_LISTED)
        assert institution_ids_for(db, user) == [school.id]
    finally:
        _scope_clear(db, user); db.close()


def test_no_notebook_and_no_class_means_national_rows_only():
    db = _TestSession(); user = f"{PREFIX}-d"
    try:
        assert institution_ids_for(db, user) == []
        assert institution_for(db, user) is None
    finally:
        _scope_clear(db, user); db.close()


def test_a_deactivated_institution_counts_as_not_declared():
    db = _TestSession(); user = f"{PREFIX}-e"
    try:
        closed = _institution(db, "chiuso", is_active=False)
        _notebook(db, user, closed.slug)
        assert institution_ids_for(db, user) == []
    finally:
        _scope_clear(db, user); db.close()


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"ok   {test.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {test.__name__}: {exc}")
        except Exception as exc:
            failed += 1
            print(f"ERROR {test.__name__}: {type(exc).__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
