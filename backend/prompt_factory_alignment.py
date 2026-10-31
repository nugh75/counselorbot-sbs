"""Review and explicitly align stored factory prompts across every chat.

Only registered model instructions and guided steps are eligible. UI copy,
language variants, counselor personas, custom steps and operational settings
are excluded. Recognised legacy hashes and seed/migration revisions establish
factory ownership; administrator-owned or unrecognised texts are preserved.
"""
import json
from functools import lru_cache
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


def _read_legacy():
    return json.loads((Path(__file__).parent / "prompt_factory_legacy.json").read_text(encoding="utf-8"))


_cached_legacy = lru_cache(maxsize=1)(_read_legacy)


def factory_owned(db, scope, key, value, *, legacy=None, cached=False):
    """True se `value` e' un testo di fabbrica che l'allineamento puo' sostituire.

    Di fabbrica: hash registrato o revisione seed/migration uguale al testo, e
    nessuna revisione dell'amministratore come ultima parola.
    """
    legacy = legacy or (_cached_legacy() if cached else _read_legacy())
    group = "configs" if scope == "config" else "steps"
    revision = prompt_revisions.latest(db, scope, key)
    if revision is not None and revision.origin == prompt_revisions.ORIGIN_ADMIN:
        return False
    versioned_factory = revision is not None and revision.value == value and revision.origin in {
        prompt_revisions.ORIGIN_SEED, prompt_revisions.ORIGIN_MIGRATION,
    }
    return versioned_factory or digest(value) in legacy[group].get(key, [])


# Testi di fabbrica che il proprietario ha deciso di riscrivere anche dove
# l'admin li aveva personalizzati (audit di coerenza dei prompt, decisione 5.1).
# L'allineamento li sovrascrive una volta: quando una revisione registra gia' il
# nuovo testo, le modifiche successive dell'admin tornano a essere conservate.
FORCED_FACTORY_KEYS = {
    "config": {
        "prompt_qsar_second_level",  # #748: B01, D04
        # #749: i passi sui fattori e le sintesi non danno strategie (A07, A08, A13).
        "prompt_second_level", "prompt_qpcs_summary", "prompt_qpcc_summary",
        "prompt_qap_summary", "prompt_meta_QSA_sl-social", "prompt_qpcs_analysis",
        # #751: QPCC senza i fattori fissi del passo (A06), contesto dell'Assistente
        # senza i fatti che ora genera il codice (C07).
        "prompt_qpcc_interview", "site_chat_platform_context",
    },
    # #749: sintesi senza strategie nuove, passo ZTPI descrittivo.
    "guided_step": {"sl-synthesis", "qsar-synthesis", "ztpi-btp", "qpcs-sintesi", "qpcc-sintesi", "qap-sintesi"},
}


def _forced(db, scope, key, after):
    if key not in FORCED_FACTORY_KEYS[scope]:
        return False
    return db.query(models.PromptRevision.id).filter(
        models.PromptRevision.scope == scope,
        models.PromptRevision.target_key == key,
        models.PromptRevision.value == after,
    ).first() is None


def make_plan(db, *, lock_rows=False):
    legacy = _read_legacy()
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
            if not factory_owned(db, scope, key, before, legacy=legacy) and not _forced(db, scope, key, after):
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
