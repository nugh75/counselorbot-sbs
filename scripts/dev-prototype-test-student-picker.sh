#!/usr/bin/env bash
# Throwaway prototype #833: frontend only, mock data, no backend (127.0.0.1:3191).
set -euo pipefail
cd "$(dirname "$0")/../frontend"
lsof -nP -iTCP:3191 -sTCP:LISTEN >/dev/null && { echo "port 3191 busy"; exit 1; }
export BACKEND_ORIGIN=http://127.0.0.1:9 NEXT_TELEMETRY_DISABLED=1
exec npm run dev -- --hostname 127.0.0.1 --port 3191 --webpack
