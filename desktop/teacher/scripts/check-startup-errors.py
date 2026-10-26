#!/usr/bin/env python3
"""Check startup failures against a built shell, using only temporary profiles.

Usage: python3 check-startup-errors.py <shell executable> [launcher args...]
On Linux, pass xvfb-run -a after the executable.
"""

import json
import os
from contextlib import closing
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile


def check(executable, launcher):
    layouts = {
        "legacy": ('{"layout":1,"app":"teacher","created_with":"0.1.1"}', "SQLite"),
        "newer": ('{"layout":999,"app":"teacher","created_with":"999.0.0"}', "aggiorna"),
        "invalid": ('{"layout":', "non valido"),
    }
    for mode in ("--headless", "--smoke"):
        for name, (layout, expected) in layouts.items():
            with tempfile.TemporaryDirectory(prefix="cb-startup-error-") as temporary:
                root = Path(temporary) / "profile"
                root.mkdir()
                (root / "layout.json").write_text(layout, encoding="utf-8")
                (root / "db").mkdir()
                with closing(sqlite3.connect(root / "db/counselorbot.sqlite3")) as database:
                    database.execute("CREATE TABLE fixture (id INTEGER PRIMARY KEY, value TEXT)")
                    database.execute("INSERT INTO fixture VALUES (1, 'synthetic legacy data')")
                    database.commit()
                original = {
                    file.relative_to(root): file.read_bytes() for file in root.rglob("*") if file.is_file()
                }
                report = Path(temporary) / "report.json"
                environ = os.environ.copy()
                environ.pop("COUNSELORBOT_POSTGRES_DISABLED", None)
                environ["COUNSELORBOT_TEST_DATA_DIR"] = str(root)
                environ["COUNSELORBOT_REPORT_FILE"] = str(report)
                result = subprocess.run(
                    [*launcher, str(executable), mode], env=environ,
                    capture_output=True, text=True, timeout=30,
                )
                assert result.returncode == 1, (
                    f"{mode} {name}: expected clean exit 1, got {result.returncode}\n{result.stderr}"
                )
                status = json.loads(report.read_text(encoding="utf-8"))
                assert status["phase"] == "error", status
                assert expected in status["message"], status
                assert status["sidecars"] == [], status
                assert "panicked" not in result.stderr, result.stderr
                after = {file.relative_to(root): file.read_bytes() for file in root.rglob("*") if file.is_file()}
                assert original == after, f"{mode} {name}: existing profile was modified"
                assert not (root / "db/postgresql").exists(), "A cluster must not be prepared on a rejected profile"
                print(f"ok: {mode} {name}: exit 1, error report, legacy files preserved", flush=True)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    check(Path(sys.argv[1]).resolve(), sys.argv[2:])
