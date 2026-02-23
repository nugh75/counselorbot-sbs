#!/bin/bash
set -e

echo "=== Deploy Counselorbot ==="

# 1. Installa config nginx custom
echo "[1/3] Configurazione Nginx Proxy Manager..."
sudo mkdir -p /opt/nginx-proxy-manager/data/nginx/custom
sudo cp /home/ddragoni/Counselorbot-10-step/nginx_custom_location.conf \
   /opt/nginx-proxy-manager/data/nginx/custom/server_proxy.conf

# 2. Build e avvia i container
echo "[2/3] Build e avvio container..."
cd /home/ddragoni/Counselorbot-10-step
sudo docker compose up -d --build

# 3. Ricarica nginx
echo "[3/3] Reload Nginx..."
sudo docker exec nginx-proxy-manager nginx -s reload

echo ""
echo "=== Deploy completato ==="
echo "App disponibile su: http://localhost:9080/counselorbot"
