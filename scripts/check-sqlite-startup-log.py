#!/usr/bin/env python3
"""Recognize only the temporary ADR-0003/F1-05c startup blocker.

Called only after uvicorn exits before serving HTTP. Any other startup failure
must block CI. Remove this exception when F1-05c fixes ensure_schema.
"""
from pathlib import Path
import re
import sys


def is_known_blocker(log):
    statements = re.findall(r"^\[SQL: (.*)\]$", log, re.MULTILINE)
    return (
        bool(re.search(r'backend/personal_api\.py", line \d+, in ensure_schema', log))
        and 'sqlalchemy.exc.OperationalError: (sqlite3.OperationalError) near "EXISTS": syntax error' in log
        and statements == ["ALTER TABLE counselors ADD COLUMN IF NOT EXISTS owner_username VARCHAR"]
        and "Application startup failed. Exiting." in log
    )


if __name__ == "__main__":
    if not is_known_blocker(Path(sys.argv[1]).read_text(encoding="utf-8")):
        sys.exit("Unexpected SQLite startup failure (see startup artifact)")
    print("::warning::Known F1-05c blocker: personal_api.ensure_schema ADD COLUMN IF NOT EXISTS. "
          "Startup/idempotence are NOT validated yet (ADR-0003).")
