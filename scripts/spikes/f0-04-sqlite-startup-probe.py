"""F0-04 probe: run the real backend startup on a fresh SQLite file.

Logs every database error, including the ones the startup code swallows, and
neutralises the two Postgres-only statements that would stop the run
(ADD COLUMN IF NOT EXISTS, pg_advisory*), so the whole path can be measured.
Results are summarised in docs/architecture/adr/0003-dual-database-postgres-sqlite.md.

Usage (from the repository root, with backend/requirements.txt installed):
    PYTHONPATH=. python3 scripts/spikes/f0-04-sqlite-startup-probe.py --data /tmp/cb-sqlite
"""
import argparse
import collections
import os
import re
import sys
import time
import traceback

parser = argparse.ArgumentParser()
parser.add_argument("--data", required=True, help="empty directory for the SQLite file and data folders")
parser.add_argument("--strict", action="store_true", help="do not neutralise Postgres-only statements")
args = parser.parse_args()

data = os.path.abspath(args.data)
os.makedirs(data, exist_ok=True)
if os.path.exists(os.path.join(data, "cb.sqlite3")):
    sys.exit("refusing to reuse an existing database: pass an empty --data directory")
os.environ.update({
    "DATABASE_URL": f"sqlite:///{data}/cb.sqlite3",
    "DATA_DIR": f"{data}/uploads",
    "RAG_INDEX_DIR": f"{data}/rag",
    "PERSONAL_API_CREDENTIALS_DIR": f"{data}/credentials",
    "STRATEGY_MEMORY_FILE": f"{data}/strategy_memory.json",
    "SESSION_MEMORY_DIR": f"{data}/sessions",
    "PORTFOLIO_STORAGE_DIR": f"{data}/uploads/portfolio",
    "IDEA_SOURCES_STORAGE_DIR": f"{data}/uploads/idea-sources",
    "TAVOLO_STORAGE_DIR": f"{data}/uploads/tavolo",
    "TAVOLO_IMAGES_STORAGE_DIR": f"{data}/uploads/tavolo-images",
    "OLLAMA_PRELOAD": "false",
})

from sqlalchemy import Engine, event, inspect

RECORDS = collections.OrderedDict()
ADD_IF_MISSING = re.compile(r"ALTER TABLE\s+(\w+)\s+ADD COLUMN IF NOT EXISTS\s+(\w+)", re.IGNORECASE)


def caller():
    for frame in reversed(traceback.extract_stack()[:-2]):
        if "/backend/" in frame.filename and "site-packages" not in frame.filename:
            return f"backend/{frame.filename.split('/backend/', 1)[1]}:{frame.lineno}"
    return "?"


def record(kind, statement):
    key = (kind, caller())
    entry = RECORDS.setdefault(key, [0, " ".join((statement or "").split())[:140]])
    entry[0] += 1


@event.listens_for(Engine, "before_cursor_execute", retval=True)
def neutralise(conn, cursor, statement, parameters, context, executemany):
    if args.strict:
        return statement, parameters
    if re.search(r"pg_(try_)?advisory", statement):
        record("NEUTRALISED advisory lock", statement)
        return "SELECT 1", ()
    match = ADD_IF_MISSING.search(statement)
    if match:
        record("NEUTRALISED ADD COLUMN IF NOT EXISTS", statement)
        raw = conn.connection.dbapi_connection.cursor()
        columns = {row[1] for row in raw.execute(f"PRAGMA table_info({match.group(1)})").fetchall()}
        if match.group(2) in columns:
            return "SELECT 1", ()
        return re.sub(r"IF NOT EXISTS\s+", "", statement, count=1, flags=re.IGNORECASE), parameters
    return statement, parameters


@event.listens_for(Engine, "handle_error")
def log_error(context):
    message = str(context.original_exception).split("\n")[0][:90]
    record(f"ERROR {type(context.original_exception).__name__}: {message}", context.statement)


started = time.time()
try:
    from backend import main  # create_all + backend/migrations at import time
except Exception:  # noqa: BLE001 - the probe reports any startup failure
    print("IMPORT_FAIL")
    traceback.print_exc()
    main = None
else:
    print(f"IMPORT_OK {time.time() - started:.1f}s")

if main is not None:
    started = time.time()
    try:
        main._seed_and_migrate()
        print(f"SEED_OK {time.time() - started:.1f}s")
    except Exception:  # noqa: BLE001 - the probe reports any seed failure
        print(f"SEED_FAIL {time.time() - started:.1f}s")
        traceback.print_exc(limit=-3)
    print("TABLES", len(inspect(main.database.engine).get_table_names()))
    print("DB_BYTES", os.path.getsize(os.path.join(data, "cb.sqlite3")))

print("\nkind | where | count | statement")
for (kind, where), (count, statement) in RECORDS.items():
    print(f"{kind} | {where} | {count} | {statement}")
