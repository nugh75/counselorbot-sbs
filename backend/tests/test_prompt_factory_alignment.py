"""Operator approval of factory updates across every chat, using isolated data."""
from contextlib import contextmanager
import uuid

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from backend import auth, models, prompt_config, prompt_revisions
from backend.prompt_factory_alignment import STEP_LIST_NAMES, factory_catalog, make_plan, review_hash
from backend.routes import admin
from backend.tests.artifact_database import artifact_session


@contextmanager
def client_for(db, *, is_admin=True):
    app = FastAPI()
    app.include_router(admin.router, prefix="/api")
    app.dependency_overrides[admin.get_db] = lambda: db
    app.dependency_overrides[auth.get_current_user] = lambda: {
        "username": "alignment-operator", "is_admin": is_admin, "is_researcher": False,
        "authenticated": True, "groups": ["admins"] if is_admin else ["teacher"],
    }
    with TestClient(app) as client:
        yield client


def old_factory_step(db, definition):
    row = models.GuidedStep(**{**definition, "prompt": "Previous English factory instruction."})
    db.add(row)
    prompt_revisions.record(db, "guided_step", row.id, row.prompt, prompt_revisions.ORIGIN_SEED)
    return row


def test_catalog_covers_all_paths_and_shared_chat_prompts_but_not_ui_or_settings():
    configs, steps = factory_catalog()
    assert len(STEP_LIST_NAMES) == 12
    for key in ("prompt_generic", "prompt_cross_synthesis", "prompt_site_chat_docente",
                "prompt_site_chat_studente", "prompt_counselorbot_chat_docente",
                "counselorbot_chat_context", "pqbl_question_generation_prompt", "directive_language"):
        assert key in configs
    for key in ("text_guided_conclusion", "placeholder_language_mappings", "embedding_model", "pqbl_model"):
        assert key not in configs
    revision_defaults = prompt_revisions._factory_defaults()
    for name in STEP_LIST_NAMES:
        for step in getattr(prompt_config, name):
            assert steps[step["id"]] == step
            assert revision_defaults[("guided_step", step["id"])] == step["prompt"]


def test_preview_and_confirmation_update_every_path_and_keep_personalised_and_localised_texts():
    with artifact_session() as db:
        rows = [old_factory_step(db, getattr(prompt_config, name)[0]) for name in STEP_LIST_NAMES]
        rows[0].label_i18n = {"sv": "Personlig etikett"}
        configs, _ = factory_catalog()
        for key in ("prompt_site_chat_docente", "pqbl_question_generation_prompt"):
            db.add(models.Config(key=key, value="Previous English factory system instruction."))
            prompt_revisions.record(db, "config", key, "Previous English factory system instruction.", prompt_revisions.ORIGIN_MIGRATION)
        db.add(models.Config(key="prompt_generic", value="My English custom instructions."))
        db.add(models.Config(key="model_name", value="untouched-model"))
        db.add(models.Config(key="prompt_generic__sv", value="Language override"))
        db.add(models.Config(key="text_guided_conclusion", value="My interface copy"))
        db.commit()
        before_revisions = db.query(models.PromptRevision).count()
        with client_for(db) as client:
            preview = client.get("/api/admin/prompt-factory-alignment/preview")
            assert preview.status_code == 200
            plan = preview.json()
            assert len(plan["changes"]) == 14
            assert plan["preserved"] == [{"scope": "config", "key": "prompt_generic", "reason": "personalised"}]
            assert all(row.prompt == "Previous English factory instruction." for row in rows)
            assert db.query(models.PromptRevision).count() == before_revisions
            response = client.post("/api/admin/prompt-factory-alignment/apply", json={"review_hash": plan["review_hash"]})
            assert response.status_code == 200
            result = response.json()
            assert result["updated"] == 14
            assert result["config_values"] == {key: configs[key] for key in ("prompt_site_chat_docente", "pqbl_question_generation_prompt")}
            assert set(result["step_prompts"]) == {row.id for row in rows}
            assert rows[0].label_i18n == {"sv": "Personlig etikett"}
            for row in rows:
                assert row.prompt == result["step_prompts"][row.id]
                assert prompt_revisions.latest(db, "guided_step", row.id).author == "alignment-operator"
                assert prompt_revisions.latest(db, "guided_step", row.id).origin == "migration"
            assert db.query(models.Config).filter_by(key="prompt_generic").one().value == "My English custom instructions."
            assert db.query(models.Config).filter_by(key="prompt_generic__sv").one().value == "Language override"
            assert db.query(models.Config).filter_by(key="text_guided_conclusion").one().value == "My interface copy"
            assert db.query(models.Config).filter_by(key="model_name").one().value == "untouched-model"
            assert client.get("/api/admin/prompt-factory-alignment/preview").json()["changes"] == []
            assert client.post("/api/admin/prompt-factory-alignment/apply", json={"review_hash": plan["review_hash"]}).status_code == 409


@pytest.mark.parametrize("edit", ["text", "ownership"])
def test_change_after_review_rejects_the_entire_batch(edit):
    with artifact_session() as db:
        row = old_factory_step(db, prompt_config.DEFAULT_GUIDED_STEPS[0])
        other = old_factory_step(db, prompt_config.DEFAULT_ZTPI_GUIDED_STEPS[0])
        db.commit()
        with client_for(db) as client:
            plan = client.get("/api/admin/prompt-factory-alignment/preview").json()
            if edit == "text":
                row.prompt = "An English edit after review."
            prompt_revisions.record(db, "guided_step", row.id, row.prompt, prompt_revisions.ORIGIN_ADMIN)
            db.commit()
            count = db.query(models.PromptRevision).count()
            prompt_revisions.record(db, "guided_step", row.id, row.prompt, prompt_revisions.ORIGIN_ADMIN)
            db.commit()
            assert db.query(models.PromptRevision).count() == count
            response = client.post("/api/admin/prompt-factory-alignment/apply", json={"review_hash": plan["review_hash"]})
            assert response.status_code == 409
            assert response.json()["detail"] == "prompt_alignment_changed"
            assert other.prompt == "Previous English factory instruction."
            assert prompt_revisions.latest(db, "guided_step", other.id).origin == "seed"
            assert row.prompt == ("An English edit after review." if edit == "text" else "Previous English factory instruction.")


def test_a_registered_step_assigned_to_another_instrument_is_preserved():
    with artifact_session() as db:
        row = old_factory_step(db, prompt_config.DEFAULT_ZTPI_GUIDED_STEPS[0])
        row.questionnaire_type = "QSA"
        db.commit()
        plan = make_plan(db)
        assert plan["changes"] == []
        assert plan["preserved"] == [{"scope": "guided_step", "key": row.id, "reason": "different_instrument"}]


@pytest.mark.parametrize("operation", ["config", "step", "restore_config", "restore_step"])
def test_even_an_identical_admin_save_or_restore_waits_for_an_alignment_lock(operation):
    # Committed, disposable tables allow separate PostgreSQL connections to
    # exercise real locks; the usual rolled-back fixture is not cross-visible.
    with artifact_session() as isolated:
        engine = create_engine(isolated.get_bind().engine.url)
        schema = "alignment_lock_" + uuid.uuid4().hex
        scoped = engine.execution_options(schema_translate_map={None: schema})
        try:
            with engine.begin() as connection:
                connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            models.Base.metadata.create_all(scoped, tables=[models.Config.__table__, models.GuidedStep.__table__, models.PromptRevision.__table__])
            with Session(scoped) as setup:
                setup.add(models.Config(key="prompt_generic", value="Previous English factory instruction.", description=""))
                step = old_factory_step(setup, prompt_config.DEFAULT_GUIDED_STEPS[0])
                prompt_revisions.record(setup, "config", "prompt_generic", "Previous English factory instruction.", prompt_revisions.ORIGIN_SEED)
                setup.commit()
                step_id = step.id
                scope, key = ("config", "prompt_generic") if "config" in operation else ("guided_step", step_id)
                revision_id = prompt_revisions.latest(setup, scope, key).id
            with Session(scoped) as locker, Session(scoped) as writer:
                assert len(make_plan(locker, lock_rows=True)["changes"]) == 2
                writer.execute(text("SET LOCAL lock_timeout = '150ms'"))
                with client_for(writer) as client:
                    with pytest.raises(OperationalError, match="lock timeout"):
                        if operation == "config":
                            client.post("/api/admin/config", json={"key": key, "value": "Previous English factory instruction.", "description": ""})
                        elif operation == "step":
                            client.put(f"/api/admin/guided-steps/{key}", json={"prompt": "Previous English factory instruction."})
                        else:
                            client.post(f"/api/admin/prompt-revisions/{revision_id}/restore")
                writer.rollback()
        finally:
            with engine.begin() as connection:
                connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
            engine.dispose()


def test_known_unversioned_qsa_factory_is_recognised_but_admin_owned_factory_is_preserved():
    old = "Analyse ONLY the COGNITIVE factors (C1-C7) of my QSA profile. For each, give the score, interpretation and a short comment."
    with artifact_session() as db:
        row = models.GuidedStep(**{**prompt_config.DEFAULT_GUIDED_STEPS[1], "prompt": old})
        db.add(row)
        db.commit()
        assert make_plan(db)["changes"][0]["key"] == "cognitive"
        prompt_revisions.record(db, "guided_step", row.id, old, prompt_revisions.ORIGIN_ADMIN)
        db.commit()
        assert make_plan(db)["changes"] == []
        assert make_plan(db)["preserved"][0]["key"] == "cognitive"


def test_confirmation_does_not_accept_client_prompt_text_or_invalid_review_hashes():
    with artifact_session() as db:
        row = old_factory_step(db, prompt_config.DEFAULT_SAVICKAS_GUIDED_STEPS[0])
        db.commit()
        with client_for(db) as client:
            digest = review_hash(make_plan(db))
            for payload in ({"review_hash": "invalid"}, {"review_hash": digest, "changes": [{"after": "Unreviewed text"}]}):
                assert client.post("/api/admin/prompt-factory-alignment/apply", json=payload).status_code == 422
            assert client.post("/api/admin/prompt-factory-alignment/apply", json={"review_hash": "0" * 64}).status_code == 409
            assert row.prompt == "Previous English factory instruction."


def test_non_operator_cannot_preview_or_apply():
    with artifact_session() as db:
        with client_for(db, is_admin=False) as client:
            assert client.get("/api/admin/prompt-factory-alignment/preview").status_code == 403
            assert client.post("/api/admin/prompt-factory-alignment/apply", json={"review_hash": "0" * 64}).status_code == 403


def test_an_already_aligned_database_is_an_explicit_no_op():
    with artifact_session() as db:
        db.add(models.GuidedStep(**prompt_config.DEFAULT_GUIDED_STEPS[0]))
        db.commit()
        with client_for(db) as client:
            plan = client.get("/api/admin/prompt-factory-alignment/preview").json()
            response = client.post("/api/admin/prompt-factory-alignment/apply", json={"review_hash": plan["review_hash"]})
            assert response.json() == {"updated": 0, "config_values": {}, "step_prompts": {}}
            assert db.query(models.PromptRevision).count() == 0


def test_an_approved_factory_update_remains_eligible_for_later_factory_versions(monkeypatch):
    with artifact_session() as db:
        row = old_factory_step(db, prompt_config.DEFAULT_GUIDED_STEPS[0])
        db.commit()
        with client_for(db) as client:
            plan = client.get("/api/admin/prompt-factory-alignment/preview").json()
            assert client.post("/api/admin/prompt-factory-alignment/apply", json={"review_hash": plan["review_hash"]}).status_code == 200
            monkeypatch.setitem(prompt_config.DEFAULT_GUIDED_STEPS[0], "prompt", "A later English factory introduction.")
            next_plan = client.get("/api/admin/prompt-factory-alignment/preview").json()
            assert len(next_plan["changes"]) == 1
            assert client.post("/api/admin/prompt-factory-alignment/apply", json={"review_hash": next_plan["review_hash"]}).status_code == 200
            assert row.prompt == "A later English factory introduction."
