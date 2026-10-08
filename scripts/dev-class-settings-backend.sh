#!/usr/bin/env bash
# Secret-free S1 verification with a synthetic Postgres database and local venv.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?Set DATABASE_URL to the dedicated synthetic counselorbot_test database}"
backend/.venv/bin/python - <<'PY'
import os
from urllib.parse import urlsplit
url = urlsplit(os.environ['DATABASE_URL'])
if url.scheme != 'postgresql' or url.path != '/counselorbot_test' or url.hostname not in {'127.0.0.1', 'localhost'}:
    raise SystemExit('Only a local dedicated counselorbot_test database is allowed')
PY
port="${BACKEND_PORT:-8002}"
if ss -H -ltn "sport = :$port" | read -r _; then
    echo "Port $port is occupied; leave the existing process untouched" >&2
    exit 1
fi
exec env -i PATH="$PATH" HOME="$HOME" DATABASE_URL="$DATABASE_URL" \
    PYTHON_DOTENV_DISABLED=1 ADMIN_SYNC_DISABLED=1 COUNSELOR_TRANSLATE_DISABLED=1 \
    FORWARD_AUTH_SHARED_SECRET=dev-local-only \
    SESSION_MEMORY_DIR="$PWD/backend/.venv/class-settings-memory" \
    RAG_INDEX_DIR="$PWD/backend/.venv/class-settings-rag" \
    COUNSELORBOT_DOCS_DIR="$PWD/docs-counselorbot" \
    backend/.venv/bin/uvicorn backend.main:app --reload --host 127.0.0.1 --port "$port"
