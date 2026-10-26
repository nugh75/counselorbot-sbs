#!/usr/bin/env bash
# Browser fixtures only: no backend, database or production services.
# #602: provider locale attivo perché la panoramica classe mostri la sezione pairing.
set -euo pipefail
cd "$(dirname "$0")/../frontend"
export BACKEND_ORIGIN=http://127.0.0.1:9 NEXT_TELEMETRY_DISABLED=1
export COUNSELORBOT_AUTH_PROVIDER=local COUNSELORBOT_PUBLIC_ORIGIN=https://classe.example.test
exec npm run dev -- --webpack --hostname 127.0.0.1 --port 3170
