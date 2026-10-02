#!/usr/bin/env bash
# Frontend-only fixtures; every API request is intercepted in Playwright.
set -euo pipefail
cd "$(dirname "$0")/../frontend"
export BACKEND_ORIGIN=http://127.0.0.1:9 NEXT_TELEMETRY_DISABLED=1
exec npm run dev -- --hostname 127.0.0.1 --port 3124
