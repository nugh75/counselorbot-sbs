#!/usr/bin/env bash
# Browser fixtures intercept every API; no production database or provider.
set -euo pipefail
cd "$(dirname "$0")/../frontend"
if lsof -nP -iTCP:3172 -sTCP:LISTEN >/dev/null; then
  echo "Port 3172 is occupied" >&2
  exit 1
fi
exec env BACKEND_INTERNAL_URL=http://127.0.0.1:9 BACKEND_ORIGIN=http://127.0.0.1:9 \
  NEXT_TELEMETRY_DISABLED=1 npm run dev -- --webpack --hostname 127.0.0.1 --port 3172
