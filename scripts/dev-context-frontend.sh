#!/usr/bin/env bash
set -euo pipefail
task_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if ss -ltn | rg -q ':3165\b'; then
    echo 'La porta 3165 è già occupata.' >&2
    exit 1
fi
cd "$task_dir/frontend"
exec env BACKEND_ORIGIN=http://127.0.0.1:9 npm run dev -- --hostname 127.0.0.1 --port 3165
