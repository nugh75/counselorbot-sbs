#!/usr/bin/env bash
# Worktree-only teacher preview on 3107; all API calls go to test backend 8002.
set -euo pipefail
cd "$(dirname "$0")/.."
port="${PORT:-3107}"
backend_port="${BACKEND_PORT:-8002}"
backend_origin="${BACKEND_ORIGIN:-http://127.0.0.1:$backend_port}"
if ss -H -ltn "sport = :$port" | read -r _; then
    echo "Port $port is occupied; leave the existing process untouched" >&2
    exit 1
fi
# Next loads .env files automatically. Take a fresh explicit source snapshot
# under our ignored venv, without copying or opening environment files.
class_settings_stage=$(python3 - <<'PY_STAGE'
import json
import shutil
import tempfile
from pathlib import Path

source = Path('frontend').resolve()
stage = Path(tempfile.mkdtemp(prefix='class-settings-frontend-', dir='backend/.venv')).resolve()
for name in ('public', 'node_modules'):
    (stage / name).symlink_to(source / name, target_is_directory=True)
# Real source/config paths keep Next routing and React contexts in one project.
shutil.copytree(source / 'src', stage / 'src')
for name in ('package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts'):
    shutil.copyfile(source / name, stage / name)
# Bound Tailwind discovery to frontend sources, excluding the Python venv.
(stage / 'postcss.config.mjs').write_text(
    'export default { plugins: { "@tailwindcss/postcss": { base: '
    + json.dumps(str(source)) + ' } } };\n'
)
print(stage)
PY_STAGE
)
cd "$class_settings_stage"
exec env -i PATH="$PATH" HOME="$HOME" \
    BACKEND_ORIGIN="$backend_origin" DEV_AUTH_USER=class-settings.fixture \
    DEV_AUTH_GROUPS=docenti DEV_AUTH_SECRET=dev-local-only \
    NEXT_TELEMETRY_DISABLED=1 \
    npm run dev -- --webpack --hostname 127.0.0.1 --port "$port"

