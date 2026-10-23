#!/usr/bin/env bash
# Synthetic browser fixtures; the backend origin is deliberately closed.
set -euo pipefail
cd "$(dirname "$0")/../frontend"
exec env -u BACKEND_INTERNAL_URL BACKEND_ORIGIN=http://127.0.0.1:9 NEXT_TELEMETRY_DISABLED=1 \
  npm run dev -- --webpack --hostname 127.0.0.1 --port 3161
