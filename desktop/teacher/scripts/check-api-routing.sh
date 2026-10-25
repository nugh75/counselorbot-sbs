#!/bin/bash
# Real Next standalone API/SSE/WebSocket routing against a synthetic loopback backend.
# No database, tunnel, provider or user keychain. CI runs this on Linux.
set -euo pipefail
repo_root=$(cd "$(dirname "$0")/../../.." && pwd)
frontend_dir="${1:?Usage: check-api-routing.sh <standalone frontend directory>}"
frontend_dir=$(cd "$frontend_dir" && pwd)
tmp=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/cb-api-routing.XXXXXX")
frontend_pid=""
cleanup() {
    if [ -n "$frontend_pid" ]; then
        kill "$frontend_pid" 2>/dev/null || true
        wait "$frontend_pid" 2>/dev/null || true
        frontend_pid=""
    fi
}
trap cleanup EXIT
free_port() {
    node -e 'const s=require("node:net").createServer(); s.listen(0,"127.0.0.1",()=>{console.log(s.address().port); s.close()});'
}
for frontend_secret in "" "synthetic-ci-frontend-secret"; do
    frontend_port=$(free_port)
    # Reserve a different backend port; the frontend port is not yet occupied.
    upstream_port=$(free_port)
    while [ "$upstream_port" = "$frontend_port" ]; do upstream_port=$(free_port); done
    NODE_ENV=production HOSTNAME=127.0.0.1 PORT="$frontend_port" \
        BACKEND_ORIGIN="http://127.0.0.1:$upstream_port" \
        COUNSELORBOT_FRONTEND_SECRET="$frontend_secret" NEXT_TELEMETRY_DISABLED=1 \
        node "$frontend_dir/server-wrapper.js" > "$tmp/frontend.log" 2>&1 &
    frontend_pid=$!
    ready=false
    for _ in $(seq 1 60); do
        kill -0 "$frontend_pid" 2>/dev/null || break
        code=$(curl -s --max-time 2 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$frontend_port/api/internal/ping" || true)
        if [ "$code" = 404 ]; then ready=true; break; fi
        sleep 1
    done
    $ready || { cat "$tmp/frontend.log"; exit 1; }
    if ! STREAM_PROXY_BASE_URL="http://127.0.0.1:$frontend_port" STREAM_PROXY_UPSTREAM_PORT="$upstream_port" \
        REQUEST_ORIGIN_SECRET="$frontend_secret" node --test "$repo_root/frontend/tests/request-origin.test.mjs"; then
        cat "$tmp/frontend.log"
        exit 1
    fi
    cleanup
done
