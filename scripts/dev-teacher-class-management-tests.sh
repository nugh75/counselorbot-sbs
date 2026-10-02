#!/usr/bin/env bash
# Frontend-only anonymous fixtures: all API calls must be intercepted by tests.
set -euo pipefail
cd "$(dirname "$0")/../frontend"
export BACKEND_ORIGIN=http://127.0.0.1:9 NEXT_TELEMETRY_DISABLED=1
exec npm run dev -- --hostname 127.0.0.1 --port 3133
