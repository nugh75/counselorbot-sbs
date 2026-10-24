"""F1-05a checks: the SQL portability script, the SQLite ratchet and the fixture."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import text

from backend.tests import conftest
from backend.tests.artifact_database import artifact_session, is_sqlite_test_db

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("check_sql_portability", ROOT / "scripts" / "check-sql-portability.py")
portability = importlib.util.module_from_spec(spec)
spec.loader.exec_module(portability)


def test_portability_rules_flag_postgres_only_sql_and_spare_python():
    flagged = {
        "pg-advisory": "SELECT pg_advisory_xact_lock(:key)",
        "pg-cast": "DEFAULT '[]'::json",
        "add-column-if-not-exists": "ALTER TABLE t ADD COLUMN IF NOT EXISTS c TEXT",
        "date-trunc": "func.date_trunc('week', col)",
        "hashtext": "hashtext(:name)",
        "postgresql-dialect": "from sqlalchemy.dialects.postgresql import insert",
        "datetime-timezone": "Column(DateTime(timezone=True))",
    }
    for rule, line in flagged.items():
        assert portability.RULES[rule].search(line), rule
    for line in ("values[::2]", "items[::step]", "ALTER TABLE t ADD COLUMN c TEXT", "DateTime()"):
        assert not any(pattern.search(line) for pattern in portability.RULES.values()), line


def test_portability_compare_fails_on_new_and_on_shrunk_counts():
    allowed = {("backend/a.py", "pg-cast"): 2}
    assert portability.compare({("backend/a.py", "pg-cast"): 2}, allowed) == []
    assert portability.compare({("backend/a.py", "pg-cast"): 3}, allowed)[0].startswith("NEW")
    assert portability.compare({}, allowed)[0].startswith("SHRUNK")
    assert [e.split()[0] for e in portability.compare({("backend/b.py", "hashtext"): 1}, allowed)] == ["SHRUNK", "NEW"]


def test_the_backend_matches_the_portability_exceptions():
    assert portability.compare(portability.scan(), portability.load_exceptions()) == []


def test_ratchet_reports_new_failures_and_listed_tests_that_pass(tmp_path):
    known = tmp_path / "known.txt"
    known.write_text("# comment\nt.py::a\nt.py::b  # still broken\nbroken.py\n", encoding="utf-8")
    ratchet = conftest.KnownFailuresRatchet(SimpleNamespace())
    ratchet.known = conftest.load_known_failures(known)
    assert ratchet.known == {"t.py::a", "t.py::b", "broken.py"}
    ratchet.failed = {"t.py::a", "t.py::c"}
    ratchet.passed = {"t.py::b"}
    ratchet.collected_modules = {"broken.py"}
    assert ratchet._outcome() == (["t.py::c"], ["broken.py", "t.py::b"])


def test_artifact_session_uses_the_selected_database_with_the_desktop_pragmas():
    with artifact_session() as db:
        dialect = db.get_bind().dialect.name
        assert dialect == ("sqlite" if is_sqlite_test_db() else "postgresql")
        if dialect == "sqlite":
            assert db.execute(text("PRAGMA journal_mode")).scalar() == "wal"
            assert db.execute(text("PRAGMA foreign_keys")).scalar() == 1
            assert db.execute(text("PRAGMA busy_timeout")).scalar() == 5000
