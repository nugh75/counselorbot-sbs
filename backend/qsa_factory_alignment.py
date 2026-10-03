"""Prepare a reviewed QSA factory update for an already seeded database.

Only exact preceding factory texts qualify. Personalised prompts are reported
and preserved. Apply/rollback use backend.prompt_updates and its atomic hash
checks; no prompt text is updated automatically at startup.
"""
import argparse
import json
from pathlib import Path

from . import models, prompt_config, prompt_revisions
from .prompt_updates import digest


def make_plan(db):
    legacy = json.loads((Path(__file__).parent / "qsa_factory_legacy.json").read_text())
    defaults = {
        "configs": {item["key"]: item["default"] for item in prompt_config.ALL_CONFIG_TEXT_DEFINITIONS},
        "steps": {step["id"]: step["prompt"] for step in prompt_config.DEFAULT_GUIDED_STEPS},
    }
    changes, preserved = [], []
    targets = (
        ("configs", "config", models.Config, "key", "value"),
        ("steps", "guided_step", models.GuidedStep, "id", "prompt"),
    )
    for group, scope, cls, key_field, value_field in targets:
        for key, old_hash in legacy[group].items():
            row = db.query(cls).filter(getattr(cls, key_field) == key).first()
            if row is None:
                continue
            before = getattr(row, value_field) or ""
            after = defaults[group][key]
            if before == after:
                continue
            if (scope == "guided_step" and row.questionnaire_type != "QSA"):
                preserved.append({"scope": scope, "key": key, "reason": "different_instrument"})
                continue
            if prompt_revisions.is_admin_owned(db, scope, key) or digest(before) != old_hash:
                preserved.append({"scope": scope, "key": key, "reason": "personalised"})
                continue
            changes.append({"scope": scope, "key": key, "before": before, "after": after,
                            "expected_hash": old_hash})
    return {"version": 1, "changes": changes, "preserved": preserved}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    from .database import SessionLocal
    with SessionLocal() as db:
        plan = make_plan(db)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n")
    args.output.chmod(0o600)
    print(f"Prepared {len(plan['changes'])} QSA changes; preserved {len(plan['preserved'])} personalised prompts.")
    print(f"Review {args.output}; apply with: python -m backend.prompt_updates apply {args.output}")


if __name__ == "__main__":
    main()
