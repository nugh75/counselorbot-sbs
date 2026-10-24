"""P8: subject_pid, blind indexes and encrypted pseudonym maps (docs/privacy/02-progettazione.md §3.3, §4.1).

Database tests use ``artifact_session`` (TEST_DB=postgres|sqlite).
"""
from __future__ import annotations

import base64

import pytest
from sqlalchemy import text

from backend import models
from backend import privacy as p
from backend.privacy import IntegrityError, PIICategory as C, PolicyBlocked, crypto, keys
from backend.privacy.detect import LocalPIIDetector
from backend.privacy.map_store import SqlAlchemyMapStore
from backend.privacy.pseudonymization import PseudonymizationEngine, ScopeMap
from backend.privacy.subject import PID_LENGTH, blind_index, is_subject_pid, subject_pid
from backend.tests.artifact_database import artifact_session
from backend.tests.test_privacy_p4_pseudonymization import ALLOW, REPLACE_ALL, FakeML, _ctx

PII = ("Mario Rossi", "Anna Bianchi", "mario@example.com", "Bologna")


def _engine(db, kek, entities=None):
    store = SqlAlchemyMapStore(db, kek)
    return PseudonymizationEngine(LocalPIIDetector(FakeML(entities)), store=store, authorize=ALLOW,
                                  subject_pid_of=store.ring.subject_pid)


def _raw_rows(db):
    return db.execute(text(
        "SELECT id, scope_id, subject_pid, placeholder, original_value_encrypted, category "
        "FROM privacy_pseudonym_maps ORDER BY id")).all()


# --- subject_pid and blind index ---------------------------------------------

def test_subject_pid_is_deterministic_128_bit_lowercase_base32():
    kek = crypto.generate_key()
    with artifact_session() as db:
        ring = keys.KeyRing(db, kek)
        pid = subject_pid(ring, "giulia.rossi")
        assert pid == subject_pid(ring, "giulia.rossi") != subject_pid(ring, "giulia.rossi2")
        assert len(pid) == PID_LENGTH == 26 and is_subject_pid(pid)
        assert set(pid) <= set("abcdefghijklmnopqrstuvwxyz234567") and not set(pid) & set("01890=")
        # 26 base32 characters carry 130 bits: the last 2 are padding of the 128-bit digest.
        assert len(base64.b32decode(pid.upper() + "======")) == 16
        assert "giulia" not in pid
        assert subject_pid(keys.KeyRing(db, kek), "giulia.rossi") == pid  # K_pid is read back, not regenerated


def test_subject_pid_depends_only_on_k_pid():
    k_pid = crypto.generate_key()
    assert crypto.subject_pid(k_pid, "giulia.rossi") != crypto.subject_pid(crypto.generate_key(), "giulia.rossi")
    assert crypto.subject_pid(k_pid, "Giulia.Rossi") != crypto.subject_pid(k_pid, "giulia.rossi")


@pytest.mark.parametrize("username", ["", "   ", None, 42])
def test_subject_pid_rejects_empty_usernames(username):
    with artifact_session() as db:
        with pytest.raises(PolicyBlocked):
            subject_pid(keys.KeyRing(db, crypto.generate_key()), username)


@pytest.mark.parametrize("value", ["", "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "a" * 25, "a" * 27, "abcdefghijklmnopqrstuvwxy1", None])
def test_is_subject_pid_rejects_other_shapes(value):
    assert not is_subject_pid(value)


def test_blind_index_normalizes_and_depends_on_the_key():
    k_idx = crypto.generate_key()
    assert blind_index(k_idx, " Giulia@Example.IT ") == blind_index(k_idx, "giulia@example.it")
    assert blind_index(k_idx, "giulia@example.it") != blind_index(crypto.generate_key(), "giulia@example.it")
    assert "giulia" not in blind_index(k_idx, "giulia@example.it")


# --- SqlAlchemyMapStore -------------------------------------------------------

def test_placeholders_stay_consistent_across_turns_and_engine_restarts():
    kek = crypto.generate_key()
    entities = {"Mario Rossi": C.PERSON, "Anna Bianchi": C.PERSON, "Bologna": C.CITY}
    with artifact_session() as db:
        ctx = _ctx("conv-1")
        first = _engine(db, kek, entities).pseudonymize(["Sono Mario Rossi di Bologna"], ctx, REPLACE_ALL)
        db.flush()
        # A new engine and key ring, as after a restart: only the database carries the map.
        again = _engine(db, kek, entities)
        second = again.pseudonymize(["MARIO ROSSI e Anna Bianchi, mail mario@example.com"], ctx, REPLACE_ALL)
        assert first.texts == ["Sono [PERSONA_1] di [CITTÀ_1]"]
        assert second.texts == ["[PERSONA_1] e [PERSONA_2], mail [EMAIL_1]"]
        assert first.mapping_ref == second.mapping_ref
        restored = _engine(db, kek).restore_authorized("[PERSONA_1], [PERSONA_2], [CITTÀ_1], [EMAIL_1]", ctx)
        assert restored == "Mario Rossi, Anna Bianchi, Bologna, mario@example.com"
        smap = SqlAlchemyMapStore(db, kek).get("conv-1")
        assert smap.counters == {"PERSONA": 2, "CITTÀ": 1, "EMAIL": 1} and smap.locale == "it"
        assert smap.subject_pid == keys.KeyRing(db, kek).subject_pid("stud1")


def test_database_holds_only_ciphertext_and_pseudonyms():
    kek = crypto.generate_key()
    with artifact_session() as db:
        _engine(db, kek, {"Mario Rossi": C.PERSON, "Anna Bianchi": C.PERSON, "Bologna": C.CITY}).pseudonymize(
            ["Mario Rossi, Anna Bianchi, Bologna, mario@example.com"], _ctx("conv-1"), REPLACE_ALL)
        db.flush()
        rows = _raw_rows(db)
        mapping_id, _ = keys.KeyRing(db, kek).active("mapping")
        assert len(rows) == 4
        for row in rows:
            assert row.original_value_encrypted.startswith(f"v1.{mapping_id}.")
            assert is_subject_pid(row.subject_pid) and row.subject_pid != "stud1"
        dump = repr([tuple(r) for r in rows]) + repr(db.execute(text("SELECT * FROM privacy_pseudonym_maps")).all())
        for value in PII + ("mario", "stud1"):
            assert value.lower() not in dump.lower()


def test_ciphertext_is_bound_to_its_row_and_subject():
    kek = crypto.generate_key()
    with artifact_session() as db:
        _engine(db, kek, {"Mario Rossi": C.PERSON, "Anna Bianchi": C.PERSON}).pseudonymize(
            ["Mario Rossi e Anna Bianchi"], _ctx("conv-1"), REPLACE_ALL)
        db.flush()
        first, second = db.query(models.PrivacyPseudonymMap).order_by(models.PrivacyPseudonymMap.id).all()
        first.original_value_encrypted = second.original_value_encrypted  # swap a value to another row
        db.flush()
        with pytest.raises(IntegrityError):
            SqlAlchemyMapStore(db, kek).get("conv-1")


def test_ciphertext_moved_to_another_subject_does_not_decrypt():
    kek = crypto.generate_key()
    with artifact_session() as db:
        _engine(db, kek, {"Mario Rossi": C.PERSON}).pseudonymize(["Mario Rossi"], _ctx("conv-1"), REPLACE_ALL)
        db.flush()
        row = db.query(models.PrivacyPseudonymMap).one()
        row.subject_pid = keys.KeyRing(db, kek).subject_pid("stud2")
        db.flush()
        with pytest.raises(IntegrityError):
            SqlAlchemyMapStore(db, kek).get("conv-1")


def test_wrong_kek_cannot_read_the_maps():
    kek = crypto.generate_key()
    with artifact_session() as db:
        _engine(db, kek, {"Mario Rossi": C.PERSON}).pseudonymize(["Mario Rossi"], _ctx("conv-1"), REPLACE_ALL)
        db.flush()
        with pytest.raises(p.KeyUnavailable):
            SqlAlchemyMapStore(db, crypto.generate_key()).get("conv-1")


def test_scopes_are_isolated_and_forget_deletes_only_one():
    kek = crypto.generate_key()
    with artifact_session() as db:
        eng = _engine(db, kek, {"Mario Rossi": C.PERSON, "Anna Bianchi": C.PERSON})
        a = eng.pseudonymize(["Anna Bianchi e Mario Rossi"], _ctx("conv-a"), REPLACE_ALL)
        b = eng.pseudonymize(["Mario Rossi"], _ctx("conv-b", subject="stud2"), REPLACE_ALL)
        assert a.texts == ["[PERSONA_1] e [PERSONA_2]"] and b.texts == ["[PERSONA_1]"]
        assert a.mapping_ref != b.mapping_ref
        pids = {r.scope_id: r.subject_pid for r in _raw_rows(db)}
        assert pids["conv-a"] != pids["conv-b"]
        eng.forget(_ctx("conv-a"))
        assert {r.scope_id for r in _raw_rows(db)} == {"conv-b"}
        assert eng.restore_authorized("[PERSONA_1]", _ctx("conv-b", subject="stud2")) == "Mario Rossi"
        assert eng.restore_authorized("[PERSONA_1]", _ctx("conv-a")) == "[PERSONA_1]"


def test_a_scope_never_mixes_two_subjects():
    kek = crypto.generate_key()
    with artifact_session() as db:
        eng = _engine(db, kek, {"Mario Rossi": C.PERSON})
        eng.pseudonymize(["Mario Rossi"], _ctx("conv-1", subject="stud1"), REPLACE_ALL)
        with pytest.raises(PolicyBlocked):
            eng.pseudonymize(["Mario Rossi"], _ctx("conv-1", subject="stud2"), REPLACE_ALL)
        with pytest.raises(PolicyBlocked):
            eng.pseudonymize(["Mario Rossi"], _ctx("conv-2", subject=None), REPLACE_ALL)
        store = SqlAlchemyMapStore(db, kek)
        foreign = store.get("conv-1")
        foreign.subject_pid = keys.KeyRing(db, kek).subject_pid("stud2")
        foreign.placeholder(C.PERSON, "Anna Bianchi")
        with pytest.raises(PolicyBlocked):
            store.put(foreign)
        with pytest.raises(PolicyBlocked):
            store.put(ScopeMap("conv-3", "it", reverse={"[PERSONA_1]": "Mario"}, categories={"[PERSONA_1]": "person"}))
        assert len(_raw_rows(db)) == 1


def test_failed_batch_and_empty_maps_store_nothing():
    kek = crypto.generate_key()
    with artifact_session() as db:
        eng = _engine(db, kek, {"Mario Rossi": C.PERSON})
        with pytest.raises(PolicyBlocked):
            eng.pseudonymize(["Mario Rossi", 42], _ctx("conv-1"), REPLACE_ALL)
        eng.pseudonymize(["nessun dato personale"], _ctx("conv-2"), REPLACE_ALL)
        assert _raw_rows(db) == []
        assert SqlAlchemyMapStore(db, kek).get("conv-1") is None


def test_concurrent_writer_of_the_same_placeholder_fails_closed():
    kek = crypto.generate_key()
    with artifact_session() as db:
        store = SqlAlchemyMapStore(db, kek)
        pid = store.ring.subject_pid("stud1")
        ours, theirs = ScopeMap("conv-1", "it", subject_pid=pid), ScopeMap("conv-1", "it", subject_pid=pid)
        theirs.placeholder(C.PERSON, "Anna Bianchi")
        store.put(theirs)
        ours.placeholder(C.PERSON, "Mario Rossi")
        stale = SqlAlchemyMapStore(db, kek)
        stale._rows = lambda scope_id: []  # it loaded the scope before the other writer committed
        with pytest.raises(p.PrivacyError):
            stale.put(ours)
        assert SqlAlchemyMapStore(db, kek).get("conv-1").reverse == {"[PERSONA_1]": "Anna Bianchi"}


def test_maps_survive_a_commit_on_sqlite_and_postgres():
    kek = crypto.generate_key()
    with artifact_session() as db:
        _engine(db, kek, {"Mario Rossi": C.PERSON}).pseudonymize(["Ciao Mario Rossi"], _ctx("conv-1"), REPLACE_ALL)
        db.commit()
        db.expire_all()
        assert SqlAlchemyMapStore(db, kek).get("conv-1").reverse == {"[PERSONA_1]": "Mario Rossi"}
        row = db.query(models.PrivacyPseudonymMap).one()
        assert row.created_at.tzinfo is not None and row.category == "person"
