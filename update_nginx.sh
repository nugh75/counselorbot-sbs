#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NPM_CUSTOM_DIR="${NPM_CUSTOM_DIR:-/opt/nginx-proxy-manager/data/nginx/custom}"
NPM_CONTAINER="${NPM_CONTAINER:-nginx-proxy-manager}"

echo "=== Aggiornamento Nginx Proxy Manager ==="
sudo mkdir -p "$NPM_CUSTOM_DIR"
sudo cp "$ROOT_DIR/nginx_custom_location.conf" "$NPM_CUSTOM_DIR/server_proxy.conf"

if sudo docker ps --format '{{.Names}}' | grep -q "^${NPM_CONTAINER}$"; then
    echo "Riconfigurazione Nginx all'interno del container Docker ${NPM_CONTAINER}..."
    sudo docker exec "$NPM_CONTAINER" nginx -t
    sudo docker exec "$NPM_CONTAINER" nginx -s reload
elif systemctl is-active --quiet nginx; then
    echo "Riconfigurazione Nginx nativo rilevato sull'host..."
    sudo nginx -t
    sudo systemctl reload nginx
else
    echo "Errore: Nginx non è attivo né come container Docker '${NPM_CONTAINER}' né come servizio host."
    exit 1
fi

echo "=== Fatto. Location attive: /questionari e / (compat redirect da /counselorbot) ==="
