#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Deploy CounselorBot ==="

echo "[1/2] Build e avvio container..."
docker compose -f "$ROOT_DIR/docker-compose.yml" up -d --build

echo "[2/2] Configurazione Nginx Proxy Manager..."
"$ROOT_DIR/update_nginx.sh"

echo ""
echo "=== Deploy completato ==="
echo "Frontend locale: http://127.0.0.1:3000"
