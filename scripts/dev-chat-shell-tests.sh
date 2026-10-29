#!/usr/bin/env bash
# ChatShell (#653): API sintetiche nei test browser, nessun backend o database reale.
set -euo pipefail
cd "$(dirname "$0")/../frontend"
if command -v lsof >/dev/null && lsof -nP -iTCP:3173 -sTCP:LISTEN >/dev/null; then
  echo "Port 3173 is occupied" >&2
  exit 1
fi
exec env BACKEND_INTERNAL_URL=http://127.0.0.1:9 BACKEND_ORIGIN=http://127.0.0.1:9 NEXT_TELEMETRY_DISABLED=1 \
  npm run dev -- --webpack --hostname 127.0.0.1 --port 3173
