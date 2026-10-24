#!/bin/bash
# Frontend dell'app docente: `next build` standalone + server-wrapper.js + node (F1-02).
#
# Uscite (risorse del bundle):
#   src-tauri/frontend/  server.js, server-wrapper.js, .next/, public/, node_modules/
#   src-tauri/node/      l'eseguibile node in uso (quello ufficiale di setup-node in CI)
# Il frontend e' quello di Docker: niente modifiche al codice (URL a runtime: F1-03).
set -euo pipefail
app_dir="$(cd "$(dirname "$0")/.." && pwd)"
repo_root="$(cd "$app_dir/../.." && pwd)"
out_dir="$app_dir/src-tauri/frontend"
node_dir="$app_dir/src-tauri/node"

cd "$repo_root/frontend"
if [ "${SKIP_FRONTEND_BUILD:-0}" != 1 ]; then
    npm ci --no-audit --no-fund
    start=$(date +%s)
    NEXT_TELEMETRY_DISABLED=1 npm run build
    echo "next_build_seconds=$(( $(date +%s) - start ))"
fi
standalone=".next/standalone"
[ -f "$standalone/server.js" ] || { echo "manca $standalone/server.js (output: 'standalone' in next.config.ts)" >&2; exit 1; }

rm -rf "$out_dir" "$node_dir"
mkdir -p "$out_dir" "$node_dir"
# Same copy as frontend/Dockerfile (runner stage); "/." keeps dot folders (.next).
cp -R "$standalone/." "$out_dir/"
mkdir -p "$out_dir/.next"
cp -R .next/static "$out_dir/.next/static"
[ -d public ] && cp -R public "$out_dir/public"
cp "$app_dir/sidecar/server-wrapper.js" "$out_dir/server-wrapper.js"

node_bin="$(node -p 'process.execPath')"
case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) cp "$node_bin" "$node_dir/node.exe" ;;
    *) cp "$node_bin" "$node_dir/node" && chmod +x "$node_dir/node" ;;
esac
du -sk "$out_dir" | awk '{printf "frontend_standalone_mb=%.1f\n", $1/1024}'
du -sk "$node_dir" | awk '{printf "node_mb=%.1f\n", $1/1024}'
