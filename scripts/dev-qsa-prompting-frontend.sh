#!/usr/bin/env bash
# Synthetic browser fixtures; never loads environment files or contacts a backend.
set -euo pipefail
qsa_root="$(cd "$(dirname "$0")/.." && pwd)"
qsa_port="${QSA_PROMPTING_DEV_PORT:-3158}"
if lsof -nP -iTCP:"$qsa_port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $qsa_port is occupied; leave the existing process untouched" >&2
    exit 1
fi
cd "$qsa_root"
mkdir -p .tmp
qsa_stage=$(python3 - <<'PY'
import json
import shutil
import tempfile
from pathlib import Path
source = Path('frontend').resolve()
stage = Path(tempfile.mkdtemp(prefix='qsa-prompting-dev-', dir='.tmp')).resolve()
for name in ('public', 'node_modules'):
    (stage / name).symlink_to(source / name, target_is_directory=True)
shutil.copytree(source / 'src', stage / 'src')
for name in ('package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts'):
    shutil.copyfile(source / name, stage / name)
(stage / 'postcss.config.mjs').write_text(
    'export default { plugins: { "@tailwindcss/postcss": { base: '
    + json.dumps(str(source)) + ' } } };\n')
print(stage)
PY
)
# Mirror source edits for hot reload. Restart after removing files or changing config.
while sleep 2; do rsync -a "$qsa_root/frontend/src/" "$qsa_stage/src/"; done &
qsa_sync_pid=$!
trap 'kill "$qsa_sync_pid" 2>/dev/null || true' EXIT
cd "$qsa_stage"
env -i PATH="$PATH" HOME="$HOME" BACKEND_ORIGIN=http://127.0.0.1:9 \
    NEXT_TELEMETRY_DISABLED=1 npm run dev -- --webpack --hostname 127.0.0.1 --port "$qsa_port"
