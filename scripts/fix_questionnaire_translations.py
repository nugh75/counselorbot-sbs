"""Apply the reviewed questionnaire corrections; dry-run is the default.

Run as a module from the repository root with DATABASE_URL configured.
The explicit before/after manifest makes the update reviewable and repeatable.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

MANIFEST = Path(__file__).parent / "data/questionnaire_translation_fixes_20260909.json"


def apply_fixes(db, manifest):
    """Stage one transaction, locking rows and rejecting unexpected current text.

    Caller must commit or roll back. Scores, item identities, factor mappings,
    response values and validation status are never modified.
    """
    from backend import models
    from backend.i18n_fields import localized

    changed = 0
    affected = set()
    seen = set()
    for entry in manifest["items"]:
        code, number, locale = entry["code"], entry["item_number"], entry["locale"]
        key = (code, number, locale)
        if key in seen:
            raise ValueError(f"Duplicate correction: {key}")
        seen.add(key)
        row = db.query(models.QuestionnaireItem).filter_by(
            instrument_code=code, item_number=number, active=True
        ).with_for_update().one()
        current = localized(row, "text", locale)
        if current == entry["after"]:
            continue
        if current != entry["before"]:
            raise ValueError(f"Current text differs from reviewed text: {key}")
        row.text_i18n = {**(row.text_i18n or {}), locale: entry["after"]}
        affected.add((code, locale))
        changed += 1

    for entry in manifest["response_labels"]:
        code, locale = entry["code"], entry["locale"]
        row = db.query(models.Instrument).filter_by(code=code).with_for_update().one()
        current = (row.response_labels or {}).get(locale)
        if current == entry["after"]:
            continue
        if current != entry["before"]:
            raise ValueError(f"Current labels differ from reviewed labels: {code}/{locale}")
        labels = entry["after"]
        if len(labels) != row.response_scale_max - row.response_scale_min + 1 or len(set(labels)) != len(labels):
            raise ValueError(f"Invalid response categories: {code}/{locale}")
        row.response_labels = {**(row.response_labels or {}), locale: labels}
        affected.add((code, locale))
        changed += 1

    for code, locale in sorted(affected):
        version = db.query(models.ContentLanguageVersion).filter_by(
            content_type="instrument", content_key=code, locale=locale
        ).with_for_update().one()
        revision = manifest["revision"]
        if revision not in (version.version_label or "").split("+"):
            version.version_label = "+".join(filter(None, [version.version_label, revision]))
        note = f"{revision}: user-approved editorial correction; see {MANIFEST.name}."
        if note not in (version.notes or ""):
            version.notes = "\n".join(filter(None, [version.notes, note]))
    db.flush()
    return changed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    from backend.database import SessionLocal

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    with SessionLocal() as db:
        try:
            changed = apply_fixes(db, manifest)
            if args.apply:
                db.commit()
            else:
                db.rollback()
        except Exception:
            db.rollback()
            raise
    print(f"{'Applied' if args.apply else 'Dry-run'}: {changed} changed fields")


if __name__ == "__main__":
    main()
