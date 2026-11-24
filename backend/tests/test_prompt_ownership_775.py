"""SQLite-portable unit tests for Issue #775: prompt DB ownership, status, history and bulk alignment.

Runs without PostgreSQL or an LLM:
    backend/.venv/bin/pytest backend/tests/test_prompt_ownership_775.py
"""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import (
    chat_logic,
    chat_preparation,
    models,
    orientation,
    prompt_config,
    prompt_factory_alignment,
    prompt_health,
    prompt_revisions,
)
from backend.routes import site_chat


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    models.Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _seed_key(db, key: str, value: str | None = None, *, record_seed: bool = False):
    default = next(d["default"] for d in prompt_config.ALL_CONFIG_TEXT_DEFINITIONS if d["key"] == key)
    val = default if value is None else value
    db.add(models.Config(key=key, value=val, description=""))
    if record_seed:
        prompt_revisions.record(db, prompt_revisions.SCOPE_CONFIG, key, val, prompt_revisions.ORIGIN_SEED)
    db.commit()
    return default


def test_db_is_single_runtime_source_across_guided_free_site_and_bussola(db, monkeypatch):
    """Runtime reads the DB copy; changing factory constants does not override existing DB rows."""
    db_generic = "DB-OWNED GENERIC SYSTEM PROMPT"
    db_contract = "DB-OWNED FREE CHAT CONTRACT"
    db_site = "DB-OWNED SITE PROMPT"
    db_ctx = "DB-OWNED COUNSELORBOT CONTEXT"
    db_dir = "[REGISTER] DB-OWNED REGISTER DIRECTIVE"

    _seed_key(db, "prompt_generic", db_generic)
    _seed_key(db, "prompt_free_chat_contract", db_contract)
    _seed_key(db, "prompt_counselorbot_chat_studente", db_site)
    _seed_key(db, "counselorbot_chat_context", db_ctx)
    _seed_key(db, "directive_register", db_dir)

    # Mutate factory defaults in memory to prove runtime ignores them when DB rows exist.
    monkeypatch.setitem(prompt_config.SYSTEM_PROMPT_DEFAULTS, "prompt_generic", "CHANGED FACTORY GENERIC")
    monkeypatch.setattr(chat_preparation, "DEFAULT_FREE_CHAT_CONTRACT", "CHANGED FACTORY FREE CONTRACT")
    monkeypatch.setattr(orientation, "DEFAULT_COUNSELORBOT_CHAT_CONTEXT", "CHANGED FACTORY BUSSOLA CONTEXT")

    configs = {row.key: row.value for row in db.query(models.Config).all()}
    ai = SimpleNamespace(config=configs)

    _, resolved = chat_logic._resolve_system_prompt(ai, "generic", None, db)
    assert resolved == db_generic

    with_directives = chat_logic._apply_global_directives(resolved, "it", db=db)
    assert db_dir in with_directives

    assert chat_preparation.free_chat_contract(configs, "it").startswith(db_contract)

    site_prompt = site_chat._resolve_site_prompt(ai, "studente", site_chat.COLLECTION_COUNSELORBOT, platform_reference="")
    assert db_site in site_prompt and db_ctx in site_prompt

    captured = {}

    class _FakeAI:
        def __init__(self, *_args, **_kwargs):
            self.config = {}
            self.last_provider = "test"
            self.last_model = "test"

        def get_response(self, _message, system_prompt, *_args, **_kwargs):
            captured["system_prompt"] = system_prompt
            return '{"reply": "ok", "state_action": "hold", "recommendations": []}'

    monkeypatch.setattr(orientation, "AIService", _FakeAI)
    orientation.analyze_turn(db, username="student", message="Ciao", history=[], language="it")
    assert db_ctx in captured["system_prompt"]
    assert "CHANGED FACTORY BUSSOLA CONTEXT" not in captured["system_prompt"]


def test_prompt_status_transitions_factory_customised_and_factory_update(db):
    """Every editable prompt exposes the exact 3-state status (#775); code prompts report 'code'."""
    _seed_key(db, "prompt_generic", record_seed=True)
    _seed_key(db, "prompt_meta_QSA", "Old factory meta text.", record_seed=True)
    _seed_key(db, "prompt_factor", "Instance custom factor prompt.")
    prompt_revisions.record(
        db, prompt_revisions.SCOPE_CONFIG, "prompt_factor",
        "Instance custom factor prompt.", prompt_revisions.ORIGIN_ADMIN, author="school-admin",
    )
    db.commit()

    statuses = prompt_health.all_prompt_statuses(db)
    assert statuses["config:prompt_generic"] == prompt_health.STATUS_FACTORY
    assert statuses["config:prompt_meta_QSA"] == prompt_health.STATUS_FACTORY_UPDATE
    assert statuses["config:prompt_factor"] == prompt_health.STATUS_CUSTOMISED
    assert prompt_health.prompt_status(db, "code:turn_contract") == prompt_health.STATUS_CODE

    assert prompt_health.prompt_card(db, "config:prompt_generic")["status"] == prompt_health.STATUS_FACTORY
    assert prompt_health.prompt_card(db, "config:prompt_meta_QSA")["status"] == prompt_health.STATUS_FACTORY_UPDATE
    assert prompt_health.prompt_card(db, "config:prompt_factor")["status"] == prompt_health.STATUS_CUSTOMISED


def test_save_restore_factory_and_revision_restore_keep_every_version_without_loss(db):
    """Saving or restoring preserves unversioned baseline text and supports rolling back any version."""
    factory = _seed_key(db, "prompt_meta_QSA", record_seed=False)
    assert prompt_revisions.history(db, scope="config", target_key="prompt_meta_QSA") == []

    # First save records the previous live text before appending the admin edit.
    prompt_health.save_prompt(db, "config:prompt_meta_QSA", "Custom v1", author="owner")
    revs = prompt_revisions.history(db, scope="config", target_key="prompt_meta_QSA")
    assert [r.value for r in revs] == ["Custom v1", factory]
    assert revs[0].author == "owner" and revs[0].origin == prompt_revisions.ORIGIN_ADMIN
    assert revs[0].created_at is not None

    # Restore factory keeps Custom v1 in history and resets status to factory.
    prompt_health.restore_factory(db, "config:prompt_meta_QSA", author="owner")
    revs = prompt_revisions.history(db, scope="config", target_key="prompt_meta_QSA")
    assert [r.value for r in revs] == [factory, "Custom v1", factory]
    assert prompt_health.prompt_status(db, "config:prompt_meta_QSA") == prompt_health.STATUS_FACTORY

    # Restoring Custom v1 from history is append-only and makes the prompt customised again.
    custom_rev = revs[1]
    assert prompt_revisions.restore(db, custom_rev, author="admin-2")
    db.commit()
    assert db.get(models.Config, "prompt_meta_QSA").value == "Custom v1"
    assert prompt_health.prompt_status(db, "config:prompt_meta_QSA") == prompt_health.STATUS_CUSTOMISED
    revs = prompt_revisions.history(db, scope="config", target_key="prompt_meta_QSA")
    assert revs[0].value == "Custom v1" and revs[0].author == "admin-2"
    assert len(revs) == 4


def test_forced_factory_keys_removed_and_bulk_alignment_separates_customised(db):
    """No FORCED_FACTORY_KEYS; bulk alignment lists customised separately and applies only selected."""
    assert not hasattr(prompt_factory_alignment, "FORCED_FACTORY_KEYS")

    factory_qsar = _seed_key(db, "prompt_qsar_second_level", "Custom QSAr second level")
    prompt_revisions.record(
        db, "config", "prompt_qsar_second_level", "Custom QSAr second level",
        prompt_revisions.ORIGIN_ADMIN, author="school-admin",
    )
    factory_meta = _seed_key(db, "prompt_meta_QSA", "Older factory meta", record_seed=True)
    db.commit()

    plan = prompt_factory_alignment.make_plan(db)
    assert [(c["scope"], c["key"], c["status"]) for c in plan["changes"]] == [
        ("config", "prompt_meta_QSA", "factory_update"),
    ]
    assert len(plan["preserved"]) == 1
    assert plan["preserved"][0]["key"] == "prompt_qsar_second_level"
    assert plan["preserved"][0]["status"] == "customised"
    assert plan["preserved"][0]["before"] == "Custom QSAr second level"
    assert plan["preserved"][0]["after"] == factory_qsar

    # Apply only the explicitly selected customised prompt; factory_update stays untouched.
    result = prompt_factory_alignment.apply_review(
        db,
        prompt_factory_alignment.review_hash(plan),
        author="maintainer",
        selected=[{"scope": "config", "key": "prompt_qsar_second_level"}],
    )
    assert result["updated"] == 1
    assert db.get(models.Config, "prompt_qsar_second_level").value == factory_qsar
    assert db.get(models.Config, "prompt_meta_QSA").value == "Older factory meta"
    assert prompt_health.prompt_status(db, "config:prompt_qsar_second_level") == prompt_health.STATUS_FACTORY
    assert prompt_health.prompt_status(db, "config:prompt_meta_QSA") == prompt_health.STATUS_FACTORY_UPDATE

    # The overwritten custom text is preserved in history and restorable.
    revs = prompt_revisions.history(db, scope="config", target_key="prompt_qsar_second_level")
    assert [r.value for r in revs[:2]] == [factory_qsar, "Custom QSAr second level"]
    assert revs[0].author == "maintainer"

    # Now apply the remaining factory update with default (selected=None).
    next_plan = prompt_factory_alignment.make_plan(db)
    next_res = prompt_factory_alignment.apply_review(
        db, prompt_factory_alignment.review_hash(next_plan), author="maintainer",
    )
    assert next_res["updated"] == 1
    assert db.get(models.Config, "prompt_meta_QSA").value == factory_meta


def test_dynamic_config_keys_are_versioned_and_seeded_steps_record_seed_revision(db):
    assert prompt_revisions.is_versioned_config_key("prompt_meta_NEWTOOL")
    assert prompt_revisions.is_versioned_config_key("rag_chat_context_custom")
    assert not prompt_revisions.is_versioned_config_key("active_provider")

    chat_logic._ensure_questionnaire_guided_steps(db, "SAVICKAS")
    first_step = prompt_config.DEFAULT_SAVICKAS_GUIDED_STEPS[0]
    rev = prompt_revisions.latest(db, prompt_revisions.SCOPE_GUIDED_STEP, first_step["id"])
    assert rev is not None and rev.origin == prompt_revisions.ORIGIN_SEED and rev.value == first_step["prompt"]
