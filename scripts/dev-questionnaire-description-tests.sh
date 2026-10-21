#!/usr/bin/env bash
# UI fixtures only: no application backend, user database or model provider.
set -euo pipefail
cd "$(dirname "$0")/../frontend"
exec env -u BACKEND_INTERNAL_URL BACKEND_ORIGIN=http://127.0.0.1:9 NEXT_TELEMETRY_DISABLED=1 \
  npm run dev -- --webpack --hostname 127.0.0.1 --port 3161
