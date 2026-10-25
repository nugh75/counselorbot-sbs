"""P12 dual-format reads, independent DEKs, rotations and lost keys on both databases.

All keys and credential contents are ephemeral; no usable secrets in fixtures.
"""
from importlib import import_module
from types import SimpleNamespace
import secrets

from cryptography.fernet import Fernet
import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend import credential_storage, institution_password, models, personal_api
from backend import chatgpt_connections as chatgpt
from backend.credential_storage import CredentialStorageError
from backend.privacy import crypto, keys
from backend.privacy.credential_migration import rewrite
from backend.tests.artifact_database import artifact_session

STORES = (personal_api.storage, chatgpt.storage, institution_password.storage)


@pytest.fixture
def db(monkeypatch, tmp_path):
    monkeypatch.setenv("PRIVACY_CREDENTIAL_ENCRYPTION", "on")
    monkeypatch.setenv("PRIVACY_KEK", keys.generate_kek())
    monkeypatch.delenv("PRIVACY_KEK_FILE", raising=False)
    with artifact_session() as session:
        for store in STORES:
            monkeypatch.setenv(store.key_variable, Fernet.generate_key().decode())
            monkeypatch.delenv(store.key_variable + "_FILE", raising=False)
            monkeypatch.setenv(store.prefix + "_CREDENTIALS_DIR", str(tmp_path / store.prefix))
            monkeypatch.setattr(store, "session_factory", lambda: Session(
                bind=session.get_bind(), join_transaction_mode="create_savepoint"))
        credential_storage.ensure_keys()
        yield session


@pytest.mark.parametrize("store", STORES, ids=lambda s: s.prefix)
def test_old_read_new_write_and_rollback_switch(db, store, monkeypatch):
    secret = secrets.token_bytes(32)
    old = store.legacy_cipher().encrypt(secret)
    assert store.cipher().decrypt(old) == secret
    new = store.cipher().encrypt(secret)
    assert new.startswith(b"v1." + store.purpose.encode() + b"-")
    assert secret not in new
    assert store.cipher().decrypt(new) == secret
    monkeypatch.setenv("PRIVACY_CREDENTIAL_ENCRYPTION", "off")
    assert store.cipher().decrypt(new) == secret
    assert store.cipher().decrypt(old) == secret
    assert not store.cipher().encrypt(secret).startswith(b"v1.")


@pytest.mark.parametrize("store", STORES, ids=lambda s: s.prefix)
def test_rotation_uses_new_dek_and_keeps_retired_values_readable(db, store):
    old = store.cipher().encrypt(secrets.token_bytes(32))
    other_ids = {s.purpose: s._with_ring(lambda ring: ring.active(s.purpose))[0] for s in STORES if s is not store}
    rotated = store._with_ring(lambda ring: ring.rotate(store.purpose))
    new = store.cipher().encrypt(secrets.token_bytes(32))
    assert crypto.key_id_of(new.decode()) == rotated != crypto.key_id_of(old.decode())
    assert store.cipher().decrypt(old)
    assert store.cipher().decrypt(new)
    for other in STORES:
        if other is not store:
            assert other._with_ring(lambda ring: ring.active(other.purpose))[0] == other_ids[other.purpose]


@pytest.mark.parametrize("store", STORES, ids=lambda s: s.prefix)
@pytest.mark.parametrize("loss", ["missing_kek", "wrong_kek", "missing_dek"])
def test_key_loss_is_explicit_and_never_falls_back(db, store, loss, monkeypatch, caplog):
    secret = secrets.token_bytes(32)
    sealed = store.cipher().encrypt(secret)
    if loss == "missing_kek":
        monkeypatch.delenv("PRIVACY_KEK")
    elif loss == "wrong_kek":
        monkeypatch.setenv("PRIVACY_KEK", keys.generate_kek())
    else:
        db.query(models.PrivacyKey).filter_by(key_id=crypto.key_id_of(sealed.decode())).delete()
        db.commit()
    with pytest.raises(CredentialStorageError, match="^keyMissing$") as caught:
        store.cipher().decrypt(sealed)
    assert secret.hex() not in caplog.text + str(caught.value)
    with pytest.raises(CredentialStorageError, match="^keyMissing$"):
        store.cipher().encrypt(secret)
    assert store.status(lambda: True)["reason"] == "keyMissing"


def test_three_deks_and_cross_store_copy_are_rejected(db):
    ids = {store._with_ring(lambda ring: ring.active(store.purpose))[0] for store in STORES}
    assert len(ids) == 3
    sealed = STORES[0].cipher().encrypt(secrets.token_bytes(32))
    for store in STORES[1:]:
        with pytest.raises(CredentialStorageError, match="notConfigured"):
            store.cipher().decrypt(sealed)
    with pytest.raises(CredentialStorageError, match="notConfigured"):
        STORES[0].cipher().decrypt(b"v1.malformed")
    head, body = sealed.decode().rsplit(".", 1)
    raw = bytearray(crypto.b64decode(body))
    raw[-1] ^= 1
    with pytest.raises(CredentialStorageError, match="notConfigured"):
        STORES[0].cipher().decrypt((head + "." + crypto.b64encode(raw)).encode())


def test_kek_rewrap_preserves_all_stores(db, monkeypatch):
    sealed = [store.cipher().encrypt(secrets.token_bytes(32)) for store in STORES]
    fresh = keys.generate_kek()
    keys.KeyRing(db).rewrap(keys.parse_kek(fresh))
    db.commit()
    monkeypatch.setenv("PRIVACY_KEK", fresh)
    for store, token in zip(STORES, sealed):
        assert store.cipher().decrypt(token)


@pytest.mark.parametrize("source", ["env", "file", "managed"])
def test_no_new_variables_preserves_legacy_configuration(db, monkeypatch, source):
    monkeypatch.delenv("PRIVACY_CREDENTIAL_ENCRYPTION")
    monkeypatch.delenv("PRIVACY_KEK")
    for store in STORES:
        key = Fernet.generate_key()
        if source == "env":
            monkeypatch.setenv(store.key_variable, key.decode())
        else:
            monkeypatch.delenv(store.key_variable)
            store.path().parent.mkdir(parents=True)
            store.path().write_bytes(key)
            if source == "file":
                monkeypatch.setenv(store.key_variable + "_FILE", str(store.path()))
        secret = secrets.token_bytes(32)
        store.prepare(lambda: True)
        assert store.cipher().decrypt(Fernet(key).encrypt(secret)) == secret
        assert Fernet(key).decrypt(store.cipher().encrypt(secret)) == secret


def test_services_write_deks_and_report_missing_keys(db, monkeypatch, caplog):
    secret = secrets.token_urlsafe(24)
    api = SimpleNamespace(id="connection", username="fixture", provider="openai")
    api.encrypted_key = personal_api.encrypt_key(api.username, api.provider, secret, api.id)
    chat = SimpleNamespace(encrypted_credentials=chatgpt._seal({"refresh_token": secret}))
    institute = institution_password.remember(secret, has_stored=False)
    assert personal_api.decrypt_key(api) == secret
    assert chatgpt._credentials(chat)["refresh_token"] == secret
    assert institution_password.reveal(institute) == secret
    monkeypatch.delenv("PRIVACY_KEK")
    for operation, error in [(lambda: personal_api.decrypt_key(api), personal_api.PersonalAPIError),
                             (lambda: chatgpt._credentials(chat), chatgpt.ChatGPTError),
                             (lambda: institution_password.reveal(institute), CredentialStorageError),
                             (lambda: institution_password.remember(secret, has_stored=True), CredentialStorageError)]:
        with pytest.raises(error) as caught:
            operation()
        assert caught.value.code == "keyMissing"
        assert secret not in str(caught.value) + caplog.text


def test_migration_rewrites_all_columns_idempotently_and_after_rotation(db):
    secret = secrets.token_urlsafe(24).encode()
    legacy_api = personal_api.storage.legacy_cipher().encrypt(secret).decode()
    db.add(models.PersonalAPISettings(username="fixture", provider="openai", model_name="fixture", encrypted_key=legacy_api))
    db.add(models.PersonalAPIConnection(id="conn", username="fixture", name="fixture", provider="openai", model_name="fixture", encrypted_key=legacy_api))
    db.add(models.ChatGPTConnection(username="fixture", encrypted_credentials=chatgpt.storage.legacy_cipher().encrypt(secret).decode()))
    db.add(models.Institution(slug="fixture", name="fixture", encrypted_password=institution_password.storage.legacy_cipher().encrypt(secret).decode()))
    db.commit()
    assert rewrite(db, batch_size=1) == {"scanned": 4, "rewritten": 4}
    before = db.execute(text("SELECT encrypted_key FROM personal_api_settings")).scalar_one()
    assert before.startswith("v1.cred_api-")
    assert rewrite(db, batch_size=2) == {"scanned": 4, "rewritten": 0}
    assert db.execute(text("SELECT encrypted_key FROM personal_api_settings")).scalar_one() == before
    personal_api.storage._with_ring(lambda ring: ring.rotate("cred_api"))
    assert rewrite(db) == {"scanned": 4, "rewritten": 2}
    assert personal_api.storage.cipher().decrypt(db.query(models.PersonalAPISettings).one().encrypted_key.encode()) == secret


def test_migration_refuses_missing_key_and_does_not_modify_failed_batch(db, monkeypatch):
    old = personal_api.storage.legacy_cipher().encrypt(secrets.token_bytes(32)).decode()
    db.add(models.PersonalAPISettings(username="fixture", provider="openai", model_name="fixture", encrypted_key=old))
    db.commit()
    monkeypatch.delenv(personal_api.storage.key_variable)
    with pytest.raises(CredentialStorageError):
        rewrite(db)
    db.rollback()
    assert db.query(models.PersonalAPISettings).one().encrypted_key == old


def test_migration_constraint_is_idempotent(db):
    migration = import_module("backend.migrations.20261025_credential_deks")
    from contextlib import nullcontext
    bind = db.get_bind()
    target = SimpleNamespace(dialect=bind.dialect, begin=lambda: nullcontext(bind)) if bind.dialect.name == "postgresql" else bind
    migration.migrate(target)
    migration.migrate(target)
    assert db.query(models.PrivacyKey).filter(models.PrivacyKey.purpose.in_(credential_storage.PURPOSES.values())).count() == 3


def test_invalid_switch_fails_closed(db, monkeypatch):
    monkeypatch.setenv("PRIVACY_CREDENTIAL_ENCRYPTION", "typo")
    with pytest.raises(CredentialStorageError):
        personal_api.storage.cipher().encrypt(secrets.token_bytes(32))
    assert personal_api.storage.status(lambda: False)["ready"] is False


@pytest.mark.parametrize("store", STORES, ids=lambda s: s.prefix)
def test_dek_read_does_not_require_legacy_key_after_migration(db, store, monkeypatch):
    secret = secrets.token_bytes(32)
    token = store.cipher().encrypt(secret)
    monkeypatch.delenv(store.key_variable)
    monkeypatch.setenv("PRIVACY_CREDENTIAL_ENCRYPTION", "off")
    assert store.cipher().decrypt(token) == secret


def test_upgrade_old_key_constraint_preserves_existing_keys(monkeypatch):
    from contextlib import nullcontext
    from sqlalchemy import CheckConstraint, MetaData
    from backend.sqlite_schema import sqlite_rebuild_table, sync_sqlite_check_constraints

    monkeypatch.setenv("PRIVACY_KEK", keys.generate_kek())
    old_check = "purpose IN ('content', 'mapping', 'credentials', 'research', 'pid', 'index')"
    migration = import_module("backend.migrations.20261025_credential_deks")
    with artifact_session() as session:
        original_id, original_key = keys.KeyRing(session).active("content")
        session.commit()
        bind = session.get_bind()
        if bind.dialect.name == "sqlite":
            old_table = models.PrivacyKey.__table__.to_metadata(MetaData())
            for constraint in list(old_table.constraints):
                if isinstance(constraint, CheckConstraint):
                    old_table.constraints.remove(constraint)
            old_table.append_constraint(CheckConstraint(old_check, name="ck_privacy_key_purpose"))
            with sqlite_rebuild_table(bind, "privacy_keys", copy_from=old_table):
                pass
            metadata = MetaData()
            models.PrivacyKey.__table__.to_metadata(metadata)
            assert sync_sqlite_check_constraints(bind, metadata) == ["privacy_keys"]
            assert sync_sqlite_check_constraints(bind, metadata) == []
        else:
            bind.execute(text("ALTER TABLE privacy_keys DROP CONSTRAINT ck_privacy_key_purpose"))
            bind.execute(text("ALTER TABLE privacy_keys ADD CONSTRAINT ck_privacy_key_purpose CHECK (" + old_check + ")"))
            target = SimpleNamespace(dialect=bind.dialect, begin=lambda: nullcontext(bind))
            migration.migrate(target)
            migration.migrate(target)
        ring = keys.KeyRing(session)
        assert ring.key(original_id, "content") == original_key
        assert len({ring.active(p)[0] for p in credential_storage.PURPOSES.values()}) == 3
        session.commit()


def test_sqlite_request_writer_can_use_prepared_deks(tmp_path, monkeypatch):
    """Use the real BEGIN IMMEDIATE engine, not only the artifact fixture PRAGMAs."""
    from sqlalchemy import create_engine
    from backend.database import configure_sqlite_engine

    monkeypatch.setenv("PRIVACY_KEK", keys.generate_kek())
    monkeypatch.setenv("PRIVACY_CREDENTIAL_ENCRYPTION", "on")
    engine = create_engine("sqlite:///" + str(tmp_path / "writer.sqlite3"))
    configure_sqlite_engine(engine)
    try:
        models.PrivacyKey.__table__.create(engine)
        store = credential_storage.CredentialStore("PERSONAL_API", str(tmp_path), session_factory=lambda: Session(engine))
        store._with_ring(lambda ring: ring.active(store.purpose))
        with Session(engine.execution_options(sqlite_begin="IMMEDIATE")) as writer:
            writer.execute(text("UPDATE privacy_keys SET wrapped_key = wrapped_key"))
            token = store.cipher().encrypt(secrets.token_bytes(32))
            assert store.cipher().decrypt(token)
            writer.rollback()
    finally:
        engine.dispose()


def test_startup_does_not_regenerate_lost_active_dek(db):
    token = personal_api.storage.cipher().encrypt(secrets.token_bytes(32)).decode()
    db.add(models.PersonalAPISettings(username="fixture", provider="openai", model_name="fixture", encrypted_key=token))
    db.commit()
    db.query(models.PrivacyKey).filter_by(purpose="cred_api").delete()
    db.commit()
    with pytest.raises(CredentialStorageError, match="keyMissing"):
        credential_storage.ensure_keys()
    assert db.query(models.PrivacyKey).filter_by(purpose="cred_api").count() == 0


@pytest.mark.parametrize("store", STORES, ids=lambda s: s.prefix)
def test_missing_legacy_key_fails_without_creating_a_replacement(db, store, monkeypatch):
    token = store.legacy_cipher().encrypt(secrets.token_bytes(32))
    monkeypatch.delenv(store.key_variable)
    with pytest.raises(CredentialStorageError, match="notConfigured"):
        store.cipher().decrypt(token)
    if store is institution_password.storage:
        with pytest.raises(CredentialStorageError, match="notConfigured"):
            institution_password.reveal(token.decode())
    assert not store.path().exists()
