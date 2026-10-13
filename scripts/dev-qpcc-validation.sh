#!/usr/bin/env bash
# Frontend-only QPCC validation. Browser tests intercept every /api request.
set -euo pipefail
cd "$(dirname "$0")/../frontend"
port="${QPCC_DEV_PORT:-3147}"
if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $port is already in use" >&2
  exit 1
fi
# A dedicated unused backend address prevents fallback to production.
export BACKEND_ORIGIN=http://127.0.0.1:8047
exec npm run dev -- --hostname 127.0.0.1 --port "$port"
