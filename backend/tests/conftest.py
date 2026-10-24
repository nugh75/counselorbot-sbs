"""Synthetic test environment shared by the backend suites.

The institute display copy uses the same Fernet store as personal API
credentials. Tests must never create a key file in the checkout, so they run
with an ephemeral installation key for the whole session.

With TEST_DB=sqlite (ADR-0003 §5.1) the suite runs on SQLite files: tests
marked postgres_only are skipped, and the ratchet compares the failures with
sqlite_known_failures.txt. A failure not in the list fails the run, and so does
a listed test that passes (remove it: the list can only get shorter).
"""
import os
import tempfile
from pathlib import Path

import pytest
from cryptography.fernet import Fernet

os.environ.setdefault("INSTITUTION_CREDENTIAL_KEY", Fernet.generate_key().decode())

SQLITE = os.environ.get("TEST_DB", "postgres").strip().lower() == "sqlite"
KNOWN_FAILURES_FILE = Path(__file__).with_name("sqlite_known_failures.txt")

if SQLITE and not os.environ.get("DATABASE_URL", "").startswith("sqlite"):
    # The module-level engine must never reach a Postgres server in a SQLite run.
    os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(prefix="cb-sqlite-"), "backend.sqlite3")


def load_known_failures(path=KNOWN_FAILURES_FILE):
    if not path.exists():
        return set()
    lines = (line.split("#", 1)[0].strip() for line in path.read_text(encoding="utf-8").splitlines())
    return {line for line in lines if line}


def pytest_addoption(parser):
    parser.addoption("--sqlite-failures-out", default=None,
                     help="with TEST_DB=sqlite, write the sorted failing node ids to this file")


def pytest_configure(config):
    config.addinivalue_line("markers", "postgres_only: Postgres-only test (legacy migrations), skipped with TEST_DB=sqlite")
    if SQLITE:
        # Modules that cannot even be imported on SQLite are listed as known failures.
        config.option.continue_on_collection_errors = True
        config.pluginmanager.register(SqliteRatchet(config), "sqlite-ratchet")


def pytest_collection_modifyitems(config, items):
    if not SQLITE:
        return
    skip = pytest.mark.skip(reason="postgres_only (TEST_DB=sqlite)")
    for item in items:
        if "postgres_only" in item.keywords:
            item.add_marker(skip)


class SqliteRatchet:
    def __init__(self, config):
        self.config = config
        self.known = load_known_failures()
        self.failed = set()
        self.passed = set()
        self.collected_modules = set()

    def pytest_collectreport(self, report):
        if not report.nodeid.endswith(".py"):
            return
        if report.failed:
            self.failed.add(report.nodeid)
        else:
            self.collected_modules.add(report.nodeid)

    def pytest_runtest_logreport(self, report):
        if report.failed:
            self.failed.add(report.nodeid)
        elif report.when == "call" and report.passed:
            self.passed.add(report.nodeid)

    def _outcome(self):
        unexpected = sorted(self.failed - self.known)
        now_passing = sorted(
            entry for entry in self.known
            if entry not in self.failed and (entry in self.passed or entry in self.collected_modules)
        )
        return unexpected, now_passing

    @pytest.hookimpl(trylast=True)
    def pytest_sessionfinish(self, session, exitstatus):
        out = self.config.getoption("--sqlite-failures-out")
        if out:
            Path(out).write_text("".join(f"{nodeid}\n" for nodeid in sorted(self.failed)), encoding="utf-8")
        if exitstatus not in (pytest.ExitCode.OK, pytest.ExitCode.TESTS_FAILED):
            return
        unexpected, now_passing = self._outcome()
        failed = bool(unexpected or now_passing)
        session.exitstatus = pytest.ExitCode.TESTS_FAILED if failed else pytest.ExitCode.OK

    def pytest_terminal_summary(self, terminalreporter):
        unexpected, now_passing = self._outcome()
        write = terminalreporter.write_line
        terminalreporter.section("SQLite ratchet (backend/tests/sqlite_known_failures.txt)")
        write(f"known failures still failing: {len(self.failed & self.known)}")
        write(f"unexpected failures: {len(unexpected)}")
        for nodeid in unexpected:
            write(f"  NEW FAILURE  {nodeid}")
        write(f"listed but now passing (remove them from the list): {len(now_passing)}")
        for nodeid in now_passing:
            write(f"  NOW PASSING  {nodeid}")
