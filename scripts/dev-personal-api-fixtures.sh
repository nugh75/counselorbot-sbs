#!/usr/bin/env bash
# Frontend-only browser fixtures; no production database/provider is used.
set -euo pipefail
cd "$(dirname "$0")/../frontend"
if ss -ltn | rg -q '127\.0\.0\.1:3135\b|0\.0\.0\.0:3135\b'; then
    echo 'Port 3135 is already in use.' >&2
    exit 1
fi
exec npm run dev -- --hostname 127.0.0.1 --port 3135
