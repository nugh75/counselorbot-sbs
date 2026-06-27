"""Apply the English translations to the LIVE DB.

Safety:
- Overwrites a row ONLY if its current value still matches (whitespace-normalised)
  either the Italian backup (expected) or the English target (idempotent re-run).
  If a row changed since the backup was taken, it is SKIPPED and logged (so a
  concurrent admin edit is never clobbered).
- Reads IT backup + EN target from JSON files next to this script.
- Scope: Config rows (prompt_*) + guided_steps.prompt. Never touches text_*/label_*.

Usage (inside backend container):
  PYTHONPATH=/app python /app/prompt_translation/apply_en_prompts.py [--dry-run]
"""
import json
import os
import re
import sys

from backend import models, database

HERE = os.path.dirname(os.path.abspath(__file__))
IT = json.load(open(os.path.join(HERE, "live_prompts_IT_backup.json"), encoding="utf-8"))
EN = json.load(open(os.path.join(HERE, "live_prompts_EN.json"), encoding="utf-8"))
DRY = "--dry-run" in sys.argv


def norm(s):
    return re.sub(r"\s+", " ", (s or "")).strip()


db = database.SessionLocal()
flipped, skipped, missing = [], [], []
try:
    for key, en_val in EN["configs"].items():
        it_val = IT["configs"].get(key)
        cfg = db.query(models.Config).filter(models.Config.key == key).first()
        if cfg is None:
            missing.append(f"cfg:{key}")
            continue
        cur = norm(cfg.value)
        if cur == norm(en_val):
            continue  # already English
        if cur == norm(it_val):
            if not DRY:
                cfg.value = en_val
            flipped.append(f"cfg:{key}")
        else:
            skipped.append(f"cfg:{key}")

    for sid, en_val in EN["steps"].items():
        it_val = (IT["steps"].get(sid) or {}).get("prompt")
        step = db.query(models.GuidedStep).filter(models.GuidedStep.id == sid).first()
        if step is None:
            missing.append(f"step:{sid}")
            continue
        cur = norm(step.prompt)
        if cur == norm(en_val):
            continue
        if cur == norm(it_val):
            if not DRY:
                step.prompt = en_val
            flipped.append(f"step:{sid}")
        else:
            skipped.append(f"step:{sid}")

    if not DRY:
        db.commit()
finally:
    db.close()

tag = "[DRY-RUN] would flip" if DRY else "FLIPPED"
print(f"{tag} ({len(flipped)}): {flipped}")
print(f"SKIPPED (changed since backup, left untouched) ({len(skipped)}): {skipped}")
print(f"NOT FOUND ({len(missing)}): {missing}")
