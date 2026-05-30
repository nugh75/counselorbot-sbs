"""Export CSV per dataset di validazione psicometrica.

Usato sia dagli endpoint admin sia da CLI:

    python -m backend.validation_export --instrument QSA --locale es
"""
from __future__ import annotations

import argparse
import csv
import sys
from io import StringIO
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from . import database, models


def validation_query(
    db: Session,
    instrument_code: Optional[str] = None,
    locale: Optional[str] = None,
    version_label: Optional[str] = None,
):
    query = db.query(models.ValidationResponse)
    if instrument_code:
        query = query.filter(models.ValidationResponse.instrument_code == instrument_code)
    if locale:
        query = query.filter(models.ValidationResponse.locale == locale)
    if version_label:
        query = query.filter(models.ValidationResponse.version_label == version_label)
    return query


def validation_summary(
    db: Session,
    instrument_code: Optional[str] = None,
    locale: Optional[str] = None,
    version_label: Optional[str] = None,
) -> dict:
    rows = validation_query(db, instrument_code, locale, version_label).all()
    by_locale: dict[str, int] = {}
    by_version: dict[str, int] = {}
    latest = None
    for row in rows:
        by_locale[row.locale] = by_locale.get(row.locale, 0) + 1
        by_version[row.version_label] = by_version.get(row.version_label, 0) + 1
        if row.submitted_at and (latest is None or row.submitted_at > latest):
            latest = row.submitted_at
    return {
        "total": len(rows),
        "by_locale": by_locale,
        "by_version": by_version,
        "latest_submitted_at": latest,
    }


def _instrument_item_numbers(db: Session, instrument_code: str) -> list[int]:
    return [
        item.item_number
        for item in (
            db.query(models.QuestionnaireItem)
            .filter(models.QuestionnaireItem.instrument_code == instrument_code)
            .order_by(models.QuestionnaireItem.item_number)
            .all()
        )
    ]


def _json_dict(value) -> dict:
    return value if isinstance(value, dict) else {}


def build_validation_csv(rows: Iterable[models.ValidationResponse], db: Session) -> str:
    rows = list(rows)
    item_numbers = sorted({
        number
        for instrument in {row.instrument_code for row in rows}
        for number in _instrument_item_numbers(db, instrument)
    })
    metadata_keys = sorted({
        key
        for row in rows
        for key in _json_dict(row.response_metadata).keys()
    })
    factor_keys = sorted({
        key
        for row in rows
        for key in _json_dict(row.factor_scores).keys()
    })

    headers = [
        "id",
        "submitted_at",
        "session_id",
        "username",
        "instrument_code",
        "locale",
        "version_label",
        "duration_seconds",
        *[f"metadata_{key}" for key in metadata_keys],
        *[f"item_{number:03d}" for number in item_numbers],
        *[f"factor_{key}" for key in factor_keys],
    ]

    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        answers = {str(k): v for k, v in _json_dict(row.answers).items()}
        metadata = _json_dict(row.response_metadata)
        factors = _json_dict(row.factor_scores)
        record = {
            "id": row.id,
            "submitted_at": row.submitted_at.isoformat() if row.submitted_at else "",
            "session_id": row.session_id,
            "username": row.username or "",
            "instrument_code": row.instrument_code,
            "locale": row.locale,
            "version_label": row.version_label,
            "duration_seconds": row.duration_seconds if row.duration_seconds is not None else "",
        }
        for key in metadata_keys:
            record[f"metadata_{key}"] = metadata.get(key, "")
        for number in item_numbers:
            record[f"item_{number:03d}"] = answers.get(str(number), "")
        for key in factor_keys:
            record[f"factor_{key}"] = factors.get(key, "")
        writer.writerow(record)
    return output.getvalue()


def _main() -> int:
    parser = argparse.ArgumentParser(description="Export validation responses as CSV")
    parser.add_argument("--instrument", dest="instrument_code")
    parser.add_argument("--locale")
    parser.add_argument("--version", dest="version_label")
    args = parser.parse_args()

    db = database.SessionLocal()
    try:
        rows = (
            validation_query(db, args.instrument_code, args.locale, args.version_label)
            .order_by(models.ValidationResponse.submitted_at.asc())
            .all()
        )
        sys.stdout.write(build_validation_csv(rows, db))
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
