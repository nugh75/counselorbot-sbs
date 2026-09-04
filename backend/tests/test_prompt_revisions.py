"""Test dello storico dei prompt: tracciamento, rollback e protezione.

La regola che questi test difendono: un prompt modificato dall'admin non deve
mai essere riscritto dalle migrazioni d'avvio, qualunque sia la sorgente da cui
il prompt e' nato.

DB Postgres DEDICATO ai test (`counselorbot_test`), come gli altri.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_prompt_revisions
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

import uuid
from urllib.parse import urlsplit, urlunsplit

import psycopg2
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.testclient import TestClient

from backend import auth, database, models, prompt_revisions
from backend.prompt_config import ALL_CONFIG_TEXT_DEFINITIONS

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

# Una chiave di prompt vera, cosi' `is_versioned_config_key` la riconosce.
VERSIONED_KEY = ALL_CONFIG_TEXT_DEFINITIONS[0]["key"]
VERSIONED_DEFAULT = ALL_CONFIG_TEXT_DEFINITIONS[0]["default"]


def _session():
    return _TestSession()


def _clean(db, *, scope=None):
    query = db.query(models.PromptRevision)
    if scope:
        query = query.filter(models.PromptRevision.scope == scope)
    query.delete(synchronize_session=False)
    db.commit()


def _unique_key(prefix="test_prompt"):
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


# --- Servizio ---------------------------------------------------------------

def test_record_appends_and_skips_identical_text():
    db = _session()
    try:
        key = _unique_key()
        assert prompt_revisions.record(db, prompt_revisions.SCOPE_CONFIG, key, "primo", prompt_revisions.ORIGIN_SEED)
        db.commit()
        # stesso testo: nessuna riga nuova, altrimenti ogni riavvio gonfia la storia
        assert not prompt_revisions.record(db, prompt_revisions.SCOPE_CONFIG, key, "primo", prompt_revisions.ORIGIN_SEED)
        assert prompt_revisions.record(db, prompt_revisions.SCOPE_CONFIG, key, "secondo", prompt_revisions.ORIGIN_ADMIN)
        db.commit()

        history = prompt_revisions.history(db, scope=prompt_revisions.SCOPE_CONFIG, target_key=key)
        assert [r.value for r in history] == ["secondo", "primo"]
    finally:
        db.close()


def test_is_admin_owned_follows_the_latest_revision():
    db = _session()
    try:
        key = _unique_key()
        prompt_revisions.record(db, prompt_revisions.SCOPE_CONFIG, key, "fabbrica", prompt_revisions.ORIGIN_SEED)
        db.commit()
        assert not prompt_revisions.is_admin_owned(db, prompt_revisions.SCOPE_CONFIG, key)

        prompt_revisions.record(db, prompt_revisions.SCOPE_CONFIG, key, "mio", prompt_revisions.ORIGIN_ADMIN)
        db.commit()
        assert prompt_revisions.is_admin_owned(db, prompt_revisions.SCOPE_CONFIG, key)
    finally:
        db.close()


def test_only_prompt_keys_are_versioned():
    assert prompt_revisions.is_versioned_config_key(VERSIONED_KEY)
    # variante per lingua della stessa chiave
    assert prompt_revisions.is_versioned_config_key(f"{VERSIONED_KEY}__sv")
    # impostazione operativa: fuori dallo storico, altrimenti solo rumore
    assert not prompt_revisions.is_versioned_config_key("active_provider")
    assert not prompt_revisions.is_versioned_config_key("pii_ner_model")


def test_migration_cannot_overwrite_an_admin_prompt():
    """Il cuore della feature: l'admin scrive, la migrazione riscrive, l'admin vince."""
    db = _session()
    try:
        key = _unique_key()
        db.add(models.Config(key=key, value="testo dell'admin"))
        prompt_revisions.record(db, prompt_revisions.SCOPE_CONFIG, key, "testo dell'admin", prompt_revisions.ORIGIN_ADMIN)
        db.commit()

        protected = prompt_revisions.snapshot_admin_owned(db)

        # una migrazione d'avvio riscrive la riga senza sapere che e' personalizzata
        row = db.query(models.Config).filter(models.Config.key == key).first()
        row.value = "default riscritto dalla migrazione"
        db.commit()

        reverted = prompt_revisions.restore_admin_owned(db, protected)
        db.commit()

        assert f"config:{key}" in reverted
        db.expire_all()
        row = db.query(models.Config).filter(models.Config.key == key).first()
        assert row.value == "testo dell'admin"
    finally:
        db.close()


def test_migration_may_still_update_a_factory_prompt():
    db = _session()
    try:
        key = _unique_key()
        db.add(models.Config(key=key, value="default di fabbrica"))
        prompt_revisions.record(db, prompt_revisions.SCOPE_CONFIG, key, "default di fabbrica", prompt_revisions.ORIGIN_SEED)
        db.commit()

        protected = prompt_revisions.snapshot_admin_owned(db)
        row = db.query(models.Config).filter(models.Config.key == key).first()
        row.value = "default nuovo"
        db.commit()

        prompt_revisions.restore_admin_owned(db, protected)
        db.commit()

        db.expire_all()
        row = db.query(models.Config).filter(models.Config.key == key).first()
        assert row.value == "default nuovo"
    finally:
        db.close()


def test_baseline_marks_pre_existing_customisations_as_admin():
    """Primo avvio con lo storico attivo: chi era gia' personalizzato va protetto."""
    db = _session()
    try:
        _clean(db)
        pristine = db.query(models.Config).filter(models.Config.key == VERSIONED_KEY).first()
        if pristine is None:
            pristine = models.Config(key=VERSIONED_KEY, value=VERSIONED_DEFAULT)
            db.add(pristine)
        pristine.value = VERSIONED_DEFAULT

        customised_key = ALL_CONFIG_TEXT_DEFINITIONS[1]["key"]
        customised = db.query(models.Config).filter(models.Config.key == customised_key).first()
        if customised is None:
            customised = models.Config(key=customised_key, value="")
            db.add(customised)
        customised.value = "testo riscritto a mano dall'admin tempo fa"
        db.commit()

        prompt_revisions.reconcile(db)
        db.commit()

        assert not prompt_revisions.is_admin_owned(db, prompt_revisions.SCOPE_CONFIG, VERSIONED_KEY)
        assert prompt_revisions.is_admin_owned(db, prompt_revisions.SCOPE_CONFIG, customised_key)
    finally:
        db.close()


def test_baseline_protects_pre_existing_counselor_personas_without_a_factory_map():
    """A counselor already in the DB predates the revision feature and must be preserved."""
    db = _session()
    counselor = None
    try:
        _clean(db)
        suffix = uuid.uuid4().hex[:8]
        counselor = models.Counselor(
            slug=f"test-{suffix}",
            name=f"Test {suffix}",
            persona="persona personalizzata prima dello storico",
            description="test",
        )
        db.add(counselor)
        db.commit()

        prompt_revisions.reconcile(db)
        db.commit()

        assert prompt_revisions.is_admin_owned(
            db,
            prompt_revisions.SCOPE_COUNSELOR_PERSONA,
            str(counselor.id),
        )
    finally:
        db.rollback()
        if counselor is not None and counselor.id is not None:
            db.query(models.PromptRevision).filter(
                models.PromptRevision.scope == prompt_revisions.SCOPE_COUNSELOR_PERSONA,
                models.PromptRevision.target_key == str(counselor.id),
            ).delete(synchronize_session=False)
            db.query(models.Counselor).filter(models.Counselor.id == counselor.id).delete(
                synchronize_session=False
            )
            db.commit()
        db.close()


def test_reconcile_records_automatic_rewrites_after_the_baseline():
    db = _session()
    try:
        # dev'essere una chiave di prompt vera: `reconcile` ignora le altre righe
        key = ALL_CONFIG_TEXT_DEFINITIONS[2]["key"]
        row = db.query(models.Config).filter(models.Config.key == key).first()
        if row is None:
            row = models.Config(key=key, value="a")
            db.add(row)
        row.value = "a"
        # storico gia' inizializzato da un avvio precedente: non e' il primo giro
        prompt_revisions.record(db, prompt_revisions.SCOPE_CONFIG, key, "a", prompt_revisions.ORIGIN_SEED)
        db.commit()

        row.value = "b"
        db.commit()

        prompt_revisions.reconcile(db)
        db.commit()

        newest = prompt_revisions.latest(db, prompt_revisions.SCOPE_CONFIG, key)
        assert newest.value == "b"
        assert newest.origin == prompt_revisions.ORIGIN_MIGRATION
    finally:
        db.close()


def test_restore_is_append_only():
    db = _session()
    try:
        key = _unique_key()
        db.add(models.Config(key=key, value="versione due"))
        prompt_revisions.record(db, prompt_revisions.SCOPE_CONFIG, key, "versione uno", prompt_revisions.ORIGIN_ADMIN)
        db.commit()
        first = prompt_revisions.latest(db, prompt_revisions.SCOPE_CONFIG, key)

        prompt_revisions.record(db, prompt_revisions.SCOPE_CONFIG, key, "versione due", prompt_revisions.ORIGIN_ADMIN)
        db.commit()

        assert prompt_revisions.restore(db, first, author="admin")
        db.commit()

        db.expire_all()
        row = db.query(models.Config).filter(models.Config.key == key).first()
        assert row.value == "versione uno"

        history = prompt_revisions.history(db, scope=prompt_revisions.SCOPE_CONFIG, target_key=key)
        # la revisione ripristinata resta in coda: la storia non viene riaperta
        assert [r.value for r in history] == ["versione uno", "versione due", "versione uno"]
        assert history[0].note == f"ripristino della revisione #{first.id}"
    finally:
        db.close()


# --- API --------------------------------------------------------------------

def _client():
    import backend.main as main_module

    def _override_get_db():
        db = _TestSession()
        try:
            yield db
        finally:
            db.close()

    def _fake_admin():
        return {
            "email": "admin@example.test",
            "username": "admin",
            "name": "Admin",
            "groups": ["admins"],
            "is_admin": True,
            "is_researcher": True,
            "authenticated": True,
        }

    main_module.app.dependency_overrides[database.get_db] = _override_get_db
    main_module.app.dependency_overrides[auth.get_current_active_admin] = _fake_admin
    return TestClient(main_module.app)


def test_admin_edit_of_a_prompt_is_recorded_with_its_author():
    client = _client()
    db = _session()
    try:
        response = client.post(
            "/admin/config",
            json={"key": VERSIONED_KEY, "value": "testo scritto dal pannello", "description": None},
        )
        assert response.status_code == 200, response.text

        newest = prompt_revisions.latest(db, prompt_revisions.SCOPE_CONFIG, VERSIONED_KEY)
        assert newest.value == "testo scritto dal pannello"
        assert newest.origin == prompt_revisions.ORIGIN_ADMIN
        assert newest.author == "admin"
    finally:
        db.close()


def test_operational_settings_leave_no_revision():
    client = _client()
    db = _session()
    try:
        before = len(prompt_revisions.history(db, scope=prompt_revisions.SCOPE_CONFIG, limit=500))
        response = client.post(
            "/admin/config",
            json={"key": "pii_ner_model", "value": "un-modello", "description": None},
        )
        assert response.status_code == 200, response.text
        after = len(prompt_revisions.history(db, scope=prompt_revisions.SCOPE_CONFIG, limit=500))
        assert before == after
    finally:
        db.close()


def test_guided_step_prompt_edit_is_recorded():
    client = _client()
    db = _session()
    try:
        step_id = _unique_key("step")
        created = client.post(
            "/admin/guided-steps",
            json={
                "id": step_id,
                "sort_order": 99,
                "label": "Step di prova",
                "prompt": "prompt iniziale",
                "system_prompt_mode": "generic",
                "color_theme": "blue",
                "questionnaire_type": "QSA",
            },
        )
        assert created.status_code == 200, created.text

        updated = client.put(f"/admin/guided-steps/{step_id}", json={"prompt": "prompt corretto"})
        assert updated.status_code == 200, updated.text

        history = prompt_revisions.history(db, scope=prompt_revisions.SCOPE_GUIDED_STEP, target_key=step_id)
        assert [r.value for r in history] == ["prompt corretto", "prompt iniziale"]
        assert all(r.origin == prompt_revisions.ORIGIN_ADMIN for r in history)

        client.delete(f"/admin/guided-steps/{step_id}")
    finally:
        db.close()


def test_history_endpoint_and_restore_endpoint():
    client = _client()
    db = _session()
    try:
        key = _unique_key()
        assert client.post("/admin/config", json={"key": key, "value": "v1", "description": None}).status_code == 200
        # chiave inventata: non e' un prompt, quindi lo storico la ignora
        assert prompt_revisions.latest(db, prompt_revisions.SCOPE_CONFIG, key) is None

        client.post("/admin/config", json={"key": VERSIONED_KEY, "value": "prima", "description": None})
        client.post("/admin/config", json={"key": VERSIONED_KEY, "value": "dopo", "description": None})

        listed = client.get(
            "/admin/prompt-revisions",
            params={"scope": "config", "target_key": VERSIONED_KEY, "limit": 10},
        )
        assert listed.status_code == 200, listed.text
        values = [item["value"] for item in listed.json()]
        assert values[:2] == ["dopo", "prima"]

        target = [item for item in listed.json() if item["value"] == "prima"][0]
        restored = client.post(f"/admin/prompt-revisions/{target['id']}/restore")
        assert restored.status_code == 200, restored.text
        assert restored.json()["value"] == "prima"

        db.expire_all()
        row = db.query(models.Config).filter(models.Config.key == VERSIONED_KEY).first()
        assert row.value == "prima"
    finally:
        db.close()


def test_restore_endpoint_rejects_an_unknown_revision():
    client = _client()
    assert client.post("/admin/prompt-revisions/99999999/restore").status_code == 404


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
