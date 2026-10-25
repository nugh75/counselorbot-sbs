#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../frontend"
export BACKEND_ORIGIN=http://127.0.0.1:9
export NEXT_TELEMETRY_DISABLED=1
exec npm run dev -- --webpack --hostname 127.0.0.1 --port 3162
