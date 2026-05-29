#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NPM_CUSTOM_DIR="${NPM_CUSTOM_DIR:-/opt/nginx-proxy-manager/data/nginx/custom}"
NPM_CONTAINER="${NPM_CONTAINER:-nginx-proxy-manager}"

echo "=== Aggiornamento Nginx Proxy Manager ==="
sudo mkdir -p "$NPM_CUSTOM_DIR"
sudo cp "$ROOT_DIR/nginx_custom_location.conf" "$NPM_CUSTOM_DIR/server_proxy.conf"

sudo docker exec "$NPM_CONTAINER" nginx -t
sudo docker exec "$NPM_CONTAINER" nginx -s reload

echo "=== Fatto. Location attive: /questionari e / (compat redirect da /counselorbot) ==="
