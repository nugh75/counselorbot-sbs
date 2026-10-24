#!/bin/bash
# Test del ciclo di vita del guscio installato (F1-02, ADR-0002 §2.4), per la CI.
#
# Uso: check-lifecycle.sh <eseguibile del guscio> [lanciatore...]   (es. xvfb-run -a)
#
# 1. --smoke: avvio completo (backend, frontend, cloudflared quick), arresto pulito,
#    nessun processo rimasto.
# 2. --headless: /health, /internal protetto (anche via /api del frontend).
# 3. backend ucciso → il guscio lo riavvia (nuovo PID, di nuovo pronto).
# 4. guscio ucciso con SIGKILL / «Termina processo» → entro 10 s nessun sidecar
#    vivo, cloudflared compreso.
# 5. macOS/Linux: guscio e lifeline uccisi insieme → il lancio successivo ferma
#    il cloudflared rimasto (pulizia PID).
# Serve node nel PATH (per leggere il report JSON). Funziona in Git Bash su Windows.
set -uo pipefail
exe="$1"
shift
launcher=("$@")
tmp=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/cb-lifecycle.XXXXXX")
report="$tmp/teacher-report.json"
export COUNSELORBOT_REPORT_FILE="$report"
# Until the SQLite work (F1-05*) lands the backend runs without its lifespan.
export COUNSELORBOT_BACKEND_MINIMAL=1

windows=false
case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) windows=true ;;
esac
data="$tmp/data"
export COUNSELORBOT_TEST_DATA_DIR="$data"
if $windows; then
    export COUNSELORBOT_TEST_DATA_DIR="$(cygpath -m "$data")"
    export COUNSELORBOT_REPORT_FILE="$(cygpath -m "$report")"
fi
mkdir -p "$data/config"
echo '{"tunnel": {"mode": "quick"}}' > "$data/config/shell.json"

failures=0
fail() { echo "FAIL: $*"; failures=$((failures + 1)); }
ok() { echo "ok: $*"; }

field() {  # field <js expression on r>
    node -e "const r = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')); const v = $1; console.log(v === undefined || v === null ? '' : v)" "$report" 2>/dev/null
}

alive() {
    [ -n "$1" ] || return 1
    if $windows; then
        powershell -NoProfile -Command "if (Get-Process -Id $1 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
    else
        kill -0 "$1" 2>/dev/null
    fi
}

kill_hard() {
    if $windows; then taskkill //F //PID "$1" >/dev/null; else kill -9 "$1"; fi
}

wait_for() {  # wait_for <seconds> <condition command...>
    local deadline=$(( $(date +%s) + $1 ))
    shift
    until "$@"; do
        [ "$(date +%s)" -ge "$deadline" ] && return 1
        sleep 1
    done
}

phase_is() { [ "$(field r.phase)" = "$1" ]; }
ready_with_tunnel() { phase_is ready && [ -n "$(field r.cloudflared_pid)" ] && [ -n "$(field r.tunnel_url)" ]; }
pid_of() { field "r.sidecars.find(s => s.name === '$1').pid"; }
port_of() { field "r.sidecars.find(s => s.name === '$1').port"; }

show_logs() {
    for log in shell backend frontend cloudflared; do
        echo "----- $log.log (fine)"
        tail -25 "$data/logs/$log.log" 2>/dev/null
    done
}

start_headless() {
    rm -f "$report"
    ${launcher[@]+"${launcher[@]}"} "$exe" --headless > "$tmp/teacher-headless.log" 2>&1 &
    wait_for 240 ready_with_tunnel || { fail "headless non pronto"; cat "$report" 2>/dev/null; show_logs; return 1; }
}

# ---- 1. smoke: start everything, stop cleanly ----
rm -f "$report"
start=$(date +%s)
${launcher[@]+"${launcher[@]}"} "$exe" --smoke > "$tmp/teacher-smoke.log" 2>&1
code=$?
echo "smoke: exit $code in $(( $(date +%s) - start )) s"
cat "$report" 2>/dev/null
[ "$code" = 0 ] && ok "smoke pronto e chiuso" || { fail "smoke exit $code"; show_logs; }
sleep 2
# The final report has stopped PIDs cleared. Inspect the ready snapshot instead.
stopped_report="$report"
report="$tmp/teacher-report.ready.json"
[ "$(field r.phase)" = ready ] || fail "snapshot ready assente"
for name in backend frontend cloudflared; do
    pid=$(pid_of "$name")
    if alive "$pid"; then fail "$name ($pid) vivo dopo l'arresto normale"; fi
done
pid=$(field r.cloudflared_pid)
if alive "$pid"; then fail "cloudflared reale ($pid) vivo dopo l'arresto normale"; fi
report="$stopped_report"
[ -f "$data/layout.json" ] && ok "layout.json: $(cat "$data/layout.json")" || fail "layout.json assente"

# ---- 2. headless: health and protected internal routes ----
start_headless || { show_logs; exit 1; }
backend_port=$(port_of backend)
frontend_port=$(port_of frontend)
health=$(curl -sf -m 5 "http://127.0.0.1:$backend_port/health")
echo "health: $health"
echo "$health" | grep -q '"desktop_contract":1' && echo "$health" | grep -q '"db":"sqlite"' \
    && ok "/health" || fail "/health inatteso"
code=$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://127.0.0.1:$backend_port/internal/ping")
[ "$code" = 404 ] && ok "/internal senza segreto: 404" || fail "/internal senza segreto: $code"
code=$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://127.0.0.1:$frontend_port/api/internal/ping")
[ "$code" = 404 ] && ok "/api/internal dal frontend: 404" || fail "/api/internal dal frontend: $code"
echo "tunnel: $(field r.tunnel_url)"
# The shell and each sidecar bind only loopback (also checked by wrapper tests).
if command -v lsof >/dev/null; then
    lsof -nP -a -p "$(pid_of backend),$(pid_of frontend)" -iTCP -sTCP:LISTEN
fi

# ---- 3. a crashed backend is restarted ----
old_backend=$(pid_of backend)
kill_hard "$old_backend"
restarted() { local pid; pid=$(pid_of backend); phase_is ready && [ -n "$pid" ] && [ "$pid" != "$old_backend" ]; }
if wait_for 180 restarted; then
    ok "backend riavviato: $old_backend -> $(pid_of backend), riavvii $(field "r.sidecars[0].restarts")"
else
    fail "backend non riavviato"; cat "$report"
fi

# ---- 4. killing the shell leaves nothing behind ----
shell=$(field r.shell_pid)
pids=("$(pid_of backend)" "$(pid_of frontend)" "$(pid_of cloudflared)" "$(field r.cloudflared_pid)")
echo "guscio $shell, sidecar ${pids[*]}"
kill_hard "$shell"
sleep 10
for pid in "${pids[@]}"; do
    if alive "$pid"; then fail "processo $pid vivo 10 s dopo l'uccisione del guscio"; ps -p "$pid" 2>/dev/null; fi
done
[ "$failures" = 0 ] && ok "guscio ucciso: nessun sidecar vivo dopo 10 s"
wait 2>/dev/null

# ---- 5. leftover cleanup at the next launch (macOS/Linux) ----
if ! $windows; then
    start_headless || { show_logs; exit 1; }
    leftover=$(field r.cloudflared_pid)
    kill -9 "$(field r.shell_pid)" "$(pid_of cloudflared)"
    sleep 1
    alive "$leftover" && echo "cloudflared $leftover sopravvissuto a guscio e lifeline (limite dichiarato)"
    rm -f "$report"
    ${launcher[@]+"${launcher[@]}"} "$exe" --smoke > "$tmp/teacher-smoke2.log" 2>&1
    sleep 2
    if alive "$leftover"; then fail "cloudflared $leftover non fermato dal lancio successivo"; else ok "pulizia PID al riavvio"; fi
    grep -h "pulizia" "$data/logs/shell.log" | tail -2
    wait 2>/dev/null
fi

show_logs
echo "failures=$failures"
[ "$failures" = 0 ]
