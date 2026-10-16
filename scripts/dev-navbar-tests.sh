#!/usr/bin/env bash
# Navbar visibility contracts (P0): browser fixtures only, no backend, database
# or production services. The tests intercept every /api request.
set -euo pipefail
PORT=3149
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 || ss -ltn 2>/dev/null | grep -q ":$PORT "; then
    echo "Port $PORT is already in use" >&2
    exit 1
fi
cd "$(dirname "$0")/../frontend"
export BACKEND_ORIGIN=http://127.0.0.1:9 NEXT_TELEMETRY_DISABLED=1
exec npm run dev -- --webpack --hostname 127.0.0.1 --port "$PORT"
