#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "=== CounselorBot Update Script ==="
echo ""

# 1. Status before
echo "--- Stato attuale ---"
git status --short
echo ""

# 2. Stash uncommitted + untracked changes in case of conflict
echo "--- Stashing locale changes ---"
git stash push -u -m "update-stash-$(date +%s)" || true

# 3. Pull latest
echo "--- Aggiornamento da remote ---"
git pull origin main || git pull origin master || { echo "ERROR: pull fallito"; exit 1; }

# 4. Reapply stashed changes
echo "--- Riapplicazione modifiche locali ---"
if git stash list | grep -q "update-stash-"; then
    git stash pop || {
        echo ""
        echo "=== MERGE CONFLICT RILEVATI ==="
        echo "Risolvi i conflict nel working tree, poi:"
        echo "  git add <file>"
        echo "  git commit   (oppure git merge --abort per annullare l'update)"
        exit 2
    }
fi

# 5. Rebuild / restart (Docker)
echo ""
echo "--- Docker rebuild & restart ---"
docker compose build backend frontend 2>&1
docker compose up -d backend frontend postgres 2>&1

echo ""
echo "=== Update completato con successo! ==="
echo "Contenitori attivi:"
docker compose ps
