"""Review and explicitly align stored factory prompts across every chat.

Only registered model instructions and guided steps are eligible. UI copy,
language variants, counselor personas, custom steps and operational settings
are excluded. Recognised legacy hashes and seed/migration revisions establish
factory ownership; administrator-owned or unrecognised texts are preserved.
"""
import json
from pathlib import Path

from . import models, prompt_config, prompt_revisions
from .prompt_updates import apply_plan, digest


STEP_LIST_NAMES = (
    "DEFAULT_GUIDED_STEPS", "DEFAULT_QSAR_GUIDED_STEPS", "DEFAULT_ZTPI_GUIDED_STEPS",
    "DEFAULT_SAVICKAS_GUIDED_STEPS", "DEFAULT_IDEA_GUIDED_STEPS",
    "DEFAULT_EVENTO_STUDIO_GUIDED_STEPS", "DEFAULT_EVENTO_PROFESSIONALE_GUIDED_STEPS",
    "DEFAULT_OBIETTIVO_STUDIO_GUIDED_STEPS", "DEFAULT_OBIETTIVO_DOCENZA_GUIDED_STEPS",
    "DEFAULT_QPCS_GUIDED_STEPS", "DEFAULT_QPCC_GUIDED_STEPS", "DEFAULT_QAP_GUIDED_STEPS",
)
CONTEXT_KEYS = {
    "site_chat_knowledge_card", "site_chat_platform_context", "counselorbot_chat_context",
    "framework_chat_context", "questionari_chat_context",
}


def factory_catalog():
    configs = {
        item["key"]: item["default"] for item in prompt_config.ALL_CONFIG_TEXT_DEFINITIONS
        if item["key"].startswith(("prompt_", "directive_"))
        or item["key"].endswith("_prompt") or item["key"] in CONTEXT_KEYS
    }
    steps = {step["id"]: step for name in STEP_LIST_NAMES for step in getattr(prompt_config, name)}
    return configs, steps


def make_plan(db, *, lock_rows=False):
    legacy = json.loads((Path(__file__).parent / "prompt_factory_legacy.json").read_text(encoding="utf-8"))
    configs, steps = factory_catalog()
    changes, preserved = [], []
    targets = (
        ("configs", "config", models.Config, "key", "value", configs),
        ("steps", "guided_step", models.GuidedStep, "id", "prompt", {key: step["prompt"] for key, step in steps.items()}),
    )
    for group, scope, cls, key_field, value_field, defaults in targets:
        for key, after in sorted(defaults.items()):
            query = db.query(cls).filter(getattr(cls, key_field) == key)
            row = (query.with_for_update() if lock_rows else query).first()
            if row is None:
                continue
            before = getattr(row, value_field) or ""
            if before == after:
                continue
            if scope == "guided_step" and (row.questionnaire_type or "").upper() != steps[key]["questionnaire_type"].upper():
                preserved.append({"scope": scope, "key": key, "reason": "different_instrument"})
                continue
            revision = prompt_revisions.latest(db, scope, key)
            versioned_factory = revision is not None and revision.value == before and revision.origin in {
                prompt_revisions.ORIGIN_SEED, prompt_revisions.ORIGIN_MIGRATION,
            }
            known_factory = digest(before) in legacy[group].get(key, [])
            if (revision is not None and revision.origin == prompt_revisions.ORIGIN_ADMIN) or not (known_factory or versioned_factory):
                preserved.append({"scope": scope, "key": key, "reason": "personalised"})
                continue
            changes.append({"scope": scope, "key": key, "before": before, "after": after,
                            "expected_hash": digest(before)})
    return {"version": 1, "changes": changes, "preserved": preserved}


def review_hash(plan):
    return digest(json.dumps(plan, sort_keys=True, ensure_ascii=False, separators=(",", ":")))


def apply_review(db, expected_review_hash, *, author):
    """Recompute under row locks and accept only the exact reviewed batch."""
    try:
        plan = make_plan(db, lock_rows=True)
        if review_hash(plan) != expected_review_hash:
            raise ValueError("Factory prompts changed since review")
        updated = apply_plan(db, plan, author=author, origin=prompt_revisions.ORIGIN_MIGRATION)
    except Exception:
        db.rollback()
        raise
    return {
        "updated": updated,
        "config_values": {c["key"]: c["after"] for c in plan["changes"] if c["scope"] == "config"},
        "step_prompts": {c["key"]: c["after"] for c in plan["changes"] if c["scope"] == "guided_step"},
    }
