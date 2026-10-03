#!/usr/bin/env bash
# Isolated frontend for actual HTTP/SSE proxy regression tests. The test runner
# owns the fake upstream on 3136; no real backend, database or provider is used.
set -euo pipefail
cd "$(dirname "$0")/../frontend"
exec env -u BACKEND_INTERNAL_URL BACKEND_ORIGIN=http://127.0.0.1:3136 NEXT_TELEMETRY_DISABLED=1 \
  npm run dev -- --hostname 127.0.0.1 --port 3135
