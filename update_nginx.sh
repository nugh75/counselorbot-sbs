#!/bin/bash
set -e

echo "=== Aggiornamento Nginx Proxy Manager ==="

sudo cp /home/nugh75/counselorbot-sbs/nginx_custom_location.conf \
   /opt/nginx-proxy-manager/data/nginx/custom/server_proxy.conf

sudo docker exec nginx-proxy-manager nginx -s reload

echo "=== Fatto. Location attive: /questionari e / (compat redirect da /counselorbot) ==="
