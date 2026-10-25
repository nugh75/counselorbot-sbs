#!/bin/zsh
# Bollettino periodico Counselorbot — SOLA LETTURA, nessun LLM.
# Uso: ./scripts/bollettino-counselorbot.sh   (oppure ~/.local/bin/bollettino-counselorbot.sh)
# Scrive $BOL_STATE/latest.md (per una pane con `tail -F`) e appende a $BOL_STATE/YYYY-MM-DD.log
#
# Non scrive nel repository, nel database o nei container: legge solo stato
# docker, /health, disco, PR, release, agenti e handoff. Non stampa segreti.
set -u

REPO="${BOL_REPO:-/Volumes/sviluppo/progetti/Counselorbot}"
STATE="${BOL_STATE:-$HOME/.local/state/bollettino}"
GH_REPO="${BOL_GH_REPO:-nugh75/counselorbot-sbs}"
HEALTH="${BOL_HEALTH_URL:-http://127.0.0.1:8087/health}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin"

mkdir -p "$STATE" || exit 1
OUT="$STATE/latest.md"
TMP="$STATE/.latest.md.$$"
TS=$(date "+%H:%M")
SEEN="$STATE/seen-prs.txt"
touch "$SEEN" 2>/dev/null

{
echo "## 📋 Bollettino Periodico CounselorBot — Ore $TS"
echo
echo "### 1. Docker"
if command -v docker >/dev/null 2>&1; then
  docker ps --format '{{.Names}} · {{.Status}}' 2>&1
  DOWN=$(docker ps -a --filter status=exited --filter status=restarting --format '{{.Names}} · {{.Status}}' 2>&1)
  [ -n "$DOWN" ] && echo "⚠️ CONTAINER DOWN:" && echo "$DOWN"
else
  echo "⚠️ docker non disponibile nel PATH"
fi
echo
echo "### 2. Backend health"
H=$(curl -s -m 5 "$HEALTH" 2>&1)
echo "${H:-⚠️ health non raggiungibile}"
echo
echo "### 3. Disco"
df -h / | tail -1
echo
echo "### 4. PR aperte"
if command -v gh >/dev/null 2>&1; then
  PRS=$(gh pr list --repo "$GH_REPO" --state open --json number,title,url --jq '.[] | "#\(.number) \(.title) \(.url)"' 2>&1)
  if [ -z "$PRS" ]; then echo "nessuna PR aperta"; else echo "$PRS"; fi
  NEW=$(gh pr list --repo "$GH_REPO" --state open --json number,title,url --jq '.[] | "\(.number)\t#\(.number) \(.title) \(.url)"' 2>/dev/null | while IFS=$'\t' read -r n line; do grep -qx "$n" "$SEEN" || echo "🆕 $line"; done)
  [ -n "$NEW" ] && echo "NOVITÀ:" && echo "$NEW"
  gh pr list --repo "$GH_REPO" --state open --json number --jq '.[].number' 2>/dev/null >> "$SEEN"
  sort -u "$SEEN" -o "$SEEN" 2>/dev/null
else
  echo "⚠️ gh non disponibile nel PATH"
fi
echo
echo "### 5. Release"
if command -v gh >/dev/null 2>&1; then
  gh release list --repo "$GH_REPO" --limit 3 2>&1
else
  echo "⚠️ gh non disponibile nel PATH"
fi
echo
echo "### 6. Agenti"
if command -v herdr >/dev/null 2>&1; then
  herdr agent list 2>/dev/null | python3 -c 'import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    print("⚠️ herdr non disponibile"); raise SystemExit
for a in d["result"]["agents"]:
    print("%s | %s | %s" % (a["name"], a["agent"], a["agent_status"]))'
else
  echo "⚠️ herdr non disponibile nel PATH"
fi
echo
echo "### 7. Handoff aggiornati"
ls -lt "$REPO"/docs/handoff/*.md 2>/dev/null | head -3
for d in "$REPO"-worktrees/*/docs/handoff; do
  [ -d "$d" ] && find "$d" -maxdepth 1 -name '*.md' -newermt '-2 hours' -print 2>/dev/null
done | head -10
} > "$TMP" 2>&1

mv -f "$TMP" "$OUT" 2>/dev/null || rm -f "$TMP"
cat "$OUT" >> "$STATE/$(date +%F).log" 2>/dev/null
# niente stampa su stdout per non duplicare in pane: la pane usa `tail -F latest.md`
