import pytest

from backend import models
from backend.prompt_updates import apply_plan, digest
from backend.tests.artifact_database import artifact_session


def change(key, before, after):
    return {"scope": "config", "key": key, "before": before, "after": after, "expected_hash": digest(before)}


def test_a_concurrent_edit_rejects_the_entire_batch_without_overwriting():
    with artifact_session() as db:
        db.add_all([models.Config(key="first", value="before"), models.Config(key="second", value="edited elsewhere")])
        db.commit()
        plan = {"changes": [change("first", "before", "after"), change("second", "old snapshot", "after")]}
        with pytest.raises(ValueError, match="changed since review"):
            apply_plan(db, plan)
        assert db.query(models.Config).filter_by(key="first").one().value == "before"
        assert db.query(models.Config).filter_by(key="second").one().value == "edited elsewhere"
        assert db.query(models.PromptRevision).count() == 0


def test_apply_and_rollback_keep_an_append_only_revision_history():
    with artifact_session() as db:
        db.add(models.Config(key="prompt_generic", value="personalised original"))
        db.commit()
        plan = {"changes": [change("prompt_generic", "personalised original", "aligned text")]}
        assert apply_plan(db, plan) == 1
        assert db.query(models.Config).one().value == "aligned text"
        assert apply_plan(db, plan, rollback=True) == 1
        assert db.query(models.Config).one().value == "personalised original"
        revisions = db.query(models.PromptRevision).order_by(models.PromptRevision.id).all()
        assert [row.value for row in revisions] == ["personalised original", "aligned text", "personalised original"]
        assert all(row.origin == "admin" for row in revisions)
