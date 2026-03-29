#!/bin/bash
set -e

echo "=== Aggiornamento Nginx Proxy Manager ==="

sudo cp /home/nugh75/Counselorbot-10-step/nginx_custom_location.conf \
   /opt/nginx-proxy-manager/data/nginx/custom/server_proxy.conf

sudo docker exec nginx-proxy-manager nginx -s reload

echo "=== Fatto. Location attive: /questionari e /counselorbot ==="
