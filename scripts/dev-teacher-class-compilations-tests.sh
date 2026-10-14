#!/usr/bin/env bash
# Frontend-only synthetic fixtures; upstream deliberately unreachable.
set -euo pipefail
cd "$(dirname "$0")/../frontend"
if command -v lsof >/dev/null 2>&1; then
    if lsof -nP -iTCP:3143 -sTCP:LISTEN >/dev/null; then
        echo 'Port 3143 is already in use.' >&2
        exit 1
    fi
elif command -v ss >/dev/null 2>&1; then
    if ss -ltn 'sport = :3143' | tail -n +2 | rg -q .; then
        echo 'Port 3143 is already in use.' >&2
        exit 1
    fi
fi
export BACKEND_ORIGIN=http://127.0.0.1:9 NEXT_TELEMETRY_DISABLED=1
exec npm run dev -- --webpack --hostname 127.0.0.1 --port 3143
