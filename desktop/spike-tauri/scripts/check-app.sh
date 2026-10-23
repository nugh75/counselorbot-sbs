#!/bin/bash
# Spike F0-01 CI check: start the installed app, wait for its report, stop it.
# Usage: check-app.sh <app executable> <smoke|gui> <timeout seconds> [launcher...]
# smoke: no window, the app exits by itself. gui: the window's page calls the
# backend and the report proves it rendered; then the test kills the app.
set -uo pipefail
exe="$1" mode="$2" timeout="$3"
shift 3
report="${RUNNER_TEMP:-/tmp}/spike-report-$mode.json"
rm -f "$report"
args=()
[ "$mode" = smoke ] && args=(--smoke)
SPIKE_REPORT_FILE="$report" "$@" "$exe" "${args[@]}" &
pid=$!
start=$(date +%s)
while [ ! -s "$report" ] && [ $(( $(date +%s) - start )) -lt "$timeout" ]; do
    [ "$mode" = smoke ] && ! kill -0 "$pid" 2>/dev/null && break
    sleep 1
done
elapsed=$(( $(date +%s) - start ))
kill "$pid" 2>/dev/null
# A killed shell leaves its backend behind (no parent watchdog yet: see the report).
case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) taskkill //F //IM counselorbot-backend.exe >/dev/null 2>&1 ;;
    *) pkill -f counselorbot-backend ;;
esac
wait "$pid" 2>/dev/null
echo "mode=$mode seconds_to_report=$elapsed"
[ -s "$report" ] || { echo "no report after ${timeout}s"; exit 1; }
cat "$report"
grep -q '"ok": true' "$report"
