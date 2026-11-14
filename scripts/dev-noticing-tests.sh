#!/usr/bin/env bash
# Isolated frontend for synthetic browser fixtures. Never reaches production.
set -euo pipefail
cd "$(dirname "$0")/../frontend"
if command -v lsof >/dev/null 2>&1; then
    if lsof -nP -iTCP:3170 -sTCP:LISTEN >/dev/null; then
        echo 'Port 3170 is already in use.' >&2
        exit 1
    fi
elif command -v ss >/dev/null 2>&1; then
    if ss -ltn 'sport = :3170' | tail -n +2 | rg -q .; then
        echo 'Port 3170 is already in use.' >&2
        exit 1
    fi
fi
export BACKEND_ORIGIN=http://127.0.0.1:9 NEXT_TELEMETRY_DISABLED=1
exec npm run dev -- --webpack --hostname 127.0.0.1 --port 3170
