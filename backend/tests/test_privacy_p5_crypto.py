"""P5: AES-256-GCM field encryption and key hierarchy (docs/privacy/02-progettazione.md §4, TEST_DB=postgres|sqlite)."""
import json

import pytest

from backend import models
from backend.privacy import FieldRef, IntegrityError, KeyUnavailable, PrivacyError, SealedValue
from backend.privacy import crypto, keys
from backend.tests.artifact_database import artifact_session

FIELD = FieldRef(table="notebook_entries", column="body", row_id="42", subject_pid="ABCDEFGHIJKLMNOPQRSTUVWXYZ")


def _flip(token, index=-3):
    head, body = token.rsplit(".", 1)
    raw = bytearray(crypto.b64decode(body))
    raw[index] ^= 1
    return f"{head}.{crypto.b64encode(bytes(raw))}"


# --- crypto primitives ------------------------------------------------------

def test_round_trip_and_stored_format():
    key = crypto.generate_key()
    aad = crypto.field_aad(FIELD)
    token = crypto.seal(key, "content-1", "Giulia, 3ªB".encode(), aad)
    version, key_id, body = token.split(".")
    assert (version, key_id) == ("v1", "content-1")
    assert len(crypto.b64decode(body)) == 12 + len("Giulia, 3ªB".encode()) + 16
    assert crypto.open_sealed(key, token, aad) == "Giulia, 3ªB".encode()
    assert aad == b"notebook_entries.body:42:ABCDEFGHIJKLMNOPQRSTUVWXYZ"


@pytest.mark.parametrize("other", [
    FieldRef("notebook_entries", "body", "43", FIELD.subject_pid),
    FieldRef("notebook_entries", "title", "42", FIELD.subject_pid),
    FieldRef("logs", "body", "42", FIELD.subject_pid),
    FieldRef("notebook_entries", "body", "42", "ZZZZZZZZZZZZZZZZZZZZZZZZZZ"),
])
def test_value_copied_to_another_field_does_not_decrypt(other):
    key = crypto.generate_key()
    token = crypto.seal(key, "k", b"secret", crypto.field_aad(FIELD))
    with pytest.raises(IntegrityError):
        crypto.open_sealed(key, token, crypto.field_aad(other))


@pytest.mark.parametrize("index", [0, 11, 12, -17, -1])
def test_tampered_nonce_ciphertext_or_tag_raises_integrity_error(index):
    key = crypto.generate_key()
    aad = crypto.field_aad(FIELD)
    token = crypto.seal(key, "k", b"secret value", aad)
    with pytest.raises(IntegrityError):
        crypto.open_sealed(key, _flip(token, index), aad)


@pytest.mark.parametrize("token", ["", "v1.k", "v2.k.AAAA", "v1.k.!!!", "v1.k." + crypto.b64encode(b"short"),
                                   "v1.bad.id.AAAA", None])
def test_malformed_tokens_fail_closed(token):
    with pytest.raises(PrivacyError):
        crypto.open_sealed(crypto.generate_key(), token, b"aad")


def test_wrong_key_raises_integrity_error_and_errors_carry_no_content():
    token = crypto.seal(crypto.generate_key(), "k", b"Giulia Rossi", b"aad")
    with pytest.raises(IntegrityError) as caught:
        crypto.open_sealed(crypto.generate_key(), token, b"aad")
    assert str(caught.value) == "privacy.errors.integrity_error" and "Giulia" not in repr(caught.value)


def test_ambiguous_aad_parts_are_rejected():
    for bad in (FieldRef("notebook.entries", "body", "1", "P"), FieldRef("t", "c:x", "1", "P"),
                FieldRef("t", "c", "", "P"), FieldRef("t", "c", "1", "A:B")):
        with pytest.raises(IntegrityError):
            crypto.field_aad(bad)


def test_missing_or_short_key_raises_key_unavailable():
    for key in (b"", b"x" * 16, None):
        with pytest.raises(KeyUnavailable):
            crypto.seal(key, "k", b"v", b"aad")


def test_nonces_never_repeat_over_100k_encryptions():
    key = crypto.generate_key()
    nonces = {crypto.b64decode(crypto.seal(key, "k", b"", b"a").rsplit(".", 1)[1])[:12] for _ in range(100_000)}
    assert len(nonces) == 100_000


def test_subject_pid_and_blind_index():
    k_pid, k_idx = crypto.generate_key(), crypto.generate_key()
    pid = crypto.subject_pid(k_pid, "giulia.rossi")
    assert len(pid) == 26 and pid.isalnum() and pid == pid.lower()
    assert pid == crypto.subject_pid(k_pid, "giulia.rossi") != crypto.subject_pid(k_pid, "giulia.rossi2")
    assert pid != crypto.subject_pid(crypto.generate_key(), "giulia.rossi")
    assert crypto.blind_index(k_idx, " Giulia@Example.IT ") == crypto.blind_index(k_idx, "giulia@example.it")
    assert crypto.blind_index(k_idx, "a@b.it") != crypto.blind_index(crypto.derive_key(k_idx, "x"), "a@b.it")


# --- KEK provider -----------------------------------------------------------

def test_kek_from_environment_or_file(monkeypatch, tmp_path):
    kek = keys.generate_kek()
    monkeypatch.delenv("PRIVACY_KEK_FILE", raising=False)
    monkeypatch.setenv("PRIVACY_KEK", kek)
    assert keys.load_kek() == crypto.b64decode(kek)
    path = tmp_path / "kek"
    path.write_text(kek + "\n")
    monkeypatch.delenv("PRIVACY_KEK")
    monkeypatch.setenv("PRIVACY_KEK_FILE", str(path))
    assert keys.load_kek() == crypto.b64decode(kek)


@pytest.mark.parametrize("value,filename", [(None, None), ("short", None), ("@@@", None),
                                            (None, "/nonexistent/kek"), ("both", "set")])
def test_missing_or_corrupt_kek_raises_key_unavailable(monkeypatch, value, filename):
    if value == "both":
        value, filename = keys.generate_kek(), "/tmp/unused"
    for name, current in (("PRIVACY_KEK", value), ("PRIVACY_KEK_FILE", filename)):
        if current is None:
            monkeypatch.delenv(name, raising=False)
        else:
            monkeypatch.setenv(name, current)
    with pytest.raises(KeyUnavailable):
        keys.load_kek()
    with pytest.raises(KeyUnavailable):
        keys.KeyRing(db=None)


# --- key ring on the selected database (SQLite or PostgreSQL) ---------------

def test_key_ring_round_trip_survives_a_new_session_object():
    kek = crypto.generate_key()
    with artifact_session() as db:
        sealed = keys.KeyRing(db, kek).encrypt(b"nota del docente", FIELD)
        db.flush()
        rows = db.query(models.PrivacyKey).all()
        assert [(row.purpose, row.retired_at) for row in rows] == [("content", None)]
        assert b"nota" not in rows[0].wrapped_key.encode() and sealed.value.startswith(f"v1.{rows[0].key_id}.")
        db.expunge_all()
        assert keys.KeyRing(db, kek).decrypt(sealed, FIELD) == b"nota del docente"


def test_purposes_use_separate_keys_and_cannot_be_swapped():
    with artifact_session() as db:
        ring = keys.KeyRing(db, crypto.generate_key())
        ids = {purpose: ring.active(purpose)[0] for purpose in keys.DATA_PURPOSES + keys.ROOT_PURPOSES}
        assert len(set(ids.values())) == len(keys.DATA_PURPOSES + keys.ROOT_PURPOSES) and ids["pid"] == "pid" and ids["index"] == "index"
        assert len({ring.active(purpose)[1] for purpose in ids}) == len(ids)
        sealed = ring.encrypt(b"x", FIELD, purpose="mapping")
        with pytest.raises(IntegrityError):
            ring.decrypt(sealed, FIELD, purpose="content")
        for purpose in ("pid", "index", "kek"):
            with pytest.raises(KeyUnavailable):
                ring.encrypt(b"x", FIELD, purpose=purpose)


def test_wrong_kek_unknown_key_and_corrupted_wrapped_key_raise_key_unavailable():
    with artifact_session() as db:
        ring = keys.KeyRing(db, crypto.generate_key())
        sealed = ring.encrypt(b"x", FIELD)
        db.flush()
        with pytest.raises(KeyUnavailable):
            keys.KeyRing(db, crypto.generate_key()).decrypt(sealed, FIELD)
        with pytest.raises(KeyUnavailable):
            ring.decrypt(SealedValue("v1.content-missing." + sealed.value.split(".")[2]), FIELD)
        row = db.query(models.PrivacyKey).one()
        row.wrapped_key = _flip(row.wrapped_key)
        db.flush()
        with pytest.raises(KeyUnavailable):
            keys.KeyRing(db, ring._kek).decrypt(sealed, FIELD)


def test_wrapped_key_moved_to_another_row_does_not_unwrap():
    kek = crypto.generate_key()
    with artifact_session() as db:
        ring = keys.KeyRing(db, kek)
        content_id, _ = ring.active("content")
        research_id, _ = ring.active("research")
        rows = {row.key_id: row for row in db.query(models.PrivacyKey).all()}
        rows[content_id].wrapped_key = rows[research_id].wrapped_key
        db.flush()
        with pytest.raises(KeyUnavailable):
            keys.KeyRing(db, kek).key(content_id, "content")


def test_rotation_keeps_old_values_readable_and_rewrap_changes_only_the_kek():
    old_kek, new_kek = crypto.generate_key(), crypto.generate_key()
    with artifact_session() as db:
        ring = keys.KeyRing(db, old_kek)
        before = ring.encrypt(b"prima", FIELD)
        pid = ring.subject_pid("giulia.rossi")
        new_id = ring.rotate("content")
        after = ring.encrypt(b"dopo", FIELD)
        assert crypto.key_id_of(after.value) == new_id != crypto.key_id_of(before.value)
        assert ring.rewrap(new_kek) == 3
        db.flush()
        fresh = keys.KeyRing(db, new_kek)
        assert fresh.decrypt(before, FIELD) == b"prima" and fresh.decrypt(after, FIELD) == b"dopo"
        assert fresh.subject_pid("giulia.rossi") == pid
        with pytest.raises(KeyUnavailable):
            keys.KeyRing(db, old_kek).decrypt(before, FIELD)
        with pytest.raises(ValueError):
            fresh.rotate("pid")


def test_blind_indexes_differ_per_field_and_are_stable():
    with artifact_session() as db:
        ring = keys.KeyRing(db, crypto.generate_key())
        email = ring.blind_index("logs.email", "Giulia@Example.it")
        assert email == ring.blind_index("logs.email", "giulia@example.it")
        assert email != ring.blind_index("users.email", "giulia@example.it")


def test_concurrent_creation_of_a_root_key_keeps_the_first_one():
    kek = crypto.generate_key()
    with artifact_session() as db:
        first = keys.KeyRing(db, kek)
        pid = first.subject_pid("giulia.rossi")
        late = keys.KeyRing(db, kek)
        late._create("pid", "pid")  # the other worker's insert loses on the primary key
        assert late.subject_pid("giulia.rossi") == pid
        assert db.query(models.PrivacyKey).filter_by(purpose="pid").count() == 1

# --- recovery kit -----------------------------------------------------------

def test_recovery_kit_restores_the_kek_only_with_the_passphrase():
    kek = crypto.generate_key()
    kit = keys.export_recovery_kit(kek, "una frase lunga e segreta")
    assert crypto.b64encode(kek) not in kit and json.loads(kit)["kdf"] == "argon2id"
    assert keys.open_recovery_kit(kit, "una frase lunga e segreta") == kek
    for passphrase, broken in (("frase sbagliata", kit), ("una frase lunga e segreta", kit.replace("argon2id", "x")),
                               ("una frase lunga e segreta", "{}"), ("una frase lunga e segreta", "nope")):
        with pytest.raises(IntegrityError):
            keys.open_recovery_kit(broken, passphrase)


# --- passwords --------------------------------------------------------------

def test_password_hashes_use_explicit_owasp_argon2id_parameters():
    from backend import auth

    hashed = auth.get_password_hash("password di prova")
    assert hashed.startswith("$argon2id$v=19$m=65536,t=3,p=4$")
    assert auth.verify_password("password di prova", hashed) and not auth.verify_password("altra", hashed)
    weaker = auth.CryptContext(schemes=["argon2"], argon2__memory_cost=19456, argon2__rounds=2,
                               argon2__parallelism=1).hash("x")
    assert auth.pwd_context.needs_update(weaker) and not auth.pwd_context.needs_update(hashed)
