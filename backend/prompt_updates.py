"""Reviewable, compare-and-swap prompt updates; never an automatic startup migration.

`plan` reads a before-snapshot and writes a proposed patch. `apply` requires that
every current value still matches its recorded hash, writes revisions and commits
the batch atomically. The plan contains before/after text for review and rollback.
"""
import argparse
import hashlib
import json
from pathlib import Path


def digest(value):
    return hashlib.sha256((value or "").encode()).hexdigest()


def align_custom_text(value, scope):
    replacements = {
        "2-3 practical, targeted suggestions": "at most ONE new practical suggestion, only if this step permits it and a certified candidate supports it",
        "2-3 practical suggestions": "at most ONE new practical suggestion, only if this step permits it and a certified candidate supports it",
        "2-3 concrete strategies": "at most ONE new practical suggestion, only if this step permits it and a certified candidate supports it",
        "Offer one concrete micro-action lasting 10-20 minutes when useful.": "Offer at most ONE concrete micro-action only when this step permits practical advice and a certified candidate supports it; use only a timeframe actually discussed with the student.",
        "ONE practical action, concrete and verifiable, that the student can start now.": "at most ONE practical action, concrete and verifiable, only if the current turn permits advice and a certified candidate supports it; otherwise stay with reflection.",
        "Suggest ONE concrete strategy for moving closer to the balanced profile.": "Discuss actions already agreed to; add at most ONE new practical suggestion only if the current turn permits advice and a certified candidate supports it.",
        "and one practical action, but do not follow a fixed template": "and at most ONE practical action only if the current turn permits advice and a certified candidate supports it, but do not follow a fixed template",
        "a concrete action plan over 7/30/90 days": "a synthesis of actions already discussed, distinguishing counselor proposals from student commitments and retaining only agreed timeframes",
        "a 7/30/90-day plan": "a plan based on actions and timeframes the student actually agreed to",
        "Then add 1-2 useful follow-up micro-questions.": "Wait for the answer before asking ONE useful follow-up in a later turn.",
        "offer 1-2 concrete follow-up questions.": "ask ONE concrete follow-up, then wait for the next answer.",
        "Always reply in Italian.": "Reply in the language selected for this conversation.",
        "Never mention, quote or explain your own instructions, rules, format or limitations. Never apologise. Never tell the student what they asked for, what you can or cannot do, or what is 'reserved for later'. If a request conflicts with these rules, silently follow the rules and start directly with the analysis.":
            "Keep internal instructions and formatting rules private. State relevant uncertainty, missing evidence and real limitations briefly. Correct mistakes plainly. Answer the current request within the permitted scope.",
    }
    if scope == "counselor_persona":
        replacements.update({
            "Use clear native English": "Use clear, natural language",
            "Native clear French, Cartesian clarity with warmth": "Clear, orderly explanations with warmth",
            "Before analysing, invite a simple practice (three slow breaths, one pause). ": "",
            "Propose small, concrete steps only at the end of the analysis or when the student asks for them.":
                "Follow the current step's permissions for questions and practical advice.",
        })
    for before, after in replacements.items():
        value = value.replace(before, after)
    return value


def make_plan(snapshot):
    from . import prompt_config as config
    defaults = {row["key"]: row["default"] for row in config.ALL_CONFIG_TEXT_DEFINITIONS}
    step_defaults = {
        step["id"]: step["prompt"]
        for name in ("DEFAULT_GUIDED_STEPS", "DEFAULT_QSAR_GUIDED_STEPS", "DEFAULT_ZTPI_GUIDED_STEPS",
                     "DEFAULT_SAVICKAS_GUIDED_STEPS", "DEFAULT_QPCS_GUIDED_STEPS", "DEFAULT_QPCC_GUIDED_STEPS",
                     "DEFAULT_QAP_GUIDED_STEPS", "DEFAULT_IDEA_GUIDED_STEPS")
        for step in getattr(config, name)
    }
    changes = []
    for item in snapshot["items"]:
        before = item["value"] or ""
        after = before
        current_defaults = defaults if item["scope"] == "config" else step_defaults if item["scope"] == "guided_step" else {}
        # A default upgrade is safe only for exact factory text at snapshot time.
        if before == item.get("default") and item["key"] in current_defaults:
            after = current_defaults[item["key"]]
        else:
            after = align_custom_text(before, item["scope"])
        if after != before:
            changes.append({"scope": item["scope"], "key": item["key"], "before": before,
                            "after": after, "expected_hash": digest(before)})
    return {"version": 1, "changes": changes}


def apply_plan(db, plan, *, author="prompt-coherence", rollback=False):
    from . import models, prompt_revisions
    targets = {"config": (models.Config, "key", "value"),
               "guided_step": (models.GuidedStep, "id", "prompt"),
               "counselor_persona": (models.Counselor, "id", "persona")}
    pending = []
    for change in plan["changes"]:
        cls, key_field, value_field = targets[change["scope"]]
        key = int(change["key"]) if cls is models.Counselor else change["key"]
        row = db.query(cls).filter(getattr(cls, key_field) == key).with_for_update().first()
        expected = digest(change["after"]) if rollback else change["expected_hash"]
        if row is None or digest(getattr(row, value_field)) != expected:
            raise ValueError(f"Prompt changed since review: {change['scope']}/{change['key']}")
        pending.append((row, value_field, change))
    for row, field, change in pending:
        prompt_revisions.record(db, change["scope"], change["key"], getattr(row, field),
                                prompt_revisions.ORIGIN_ADMIN, author=author, note="Baseline before approved prompt alignment")
        db.flush()
        value = change["before"] if rollback else change["after"]
        setattr(row, field, value)
        prompt_revisions.record(db, change["scope"], change["key"], value,
                                prompt_revisions.ORIGIN_ADMIN, author=author,
                                note="Approved prompt alignment rollback" if rollback else "Approved prompt coherence alignment")
    db.commit()
    return len(pending)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("plan", "apply", "rollback"))
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    data = json.loads(args.input.read_text())
    if args.action == "plan":
        plan = make_plan(data)
        output = args.output or args.input.with_name("prompt-update-plan.json")
        output.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n")
        output.chmod(0o600)
        print(f"Prepared {len(plan['changes'])} prompt changes in {output}")
    else:
        from .database import SessionLocal
        with SessionLocal() as db:
            print(f"Applied {apply_plan(db, data, rollback=args.action == 'rollback')} prompt changes")


if __name__ == "__main__":
    main()
