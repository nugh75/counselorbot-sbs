#!/bin/bash
# Aggiunge timeout 600s al vhost API di counselorbot (mancavano → default 60s)
set -e

CONF="/etc/nginx/sites-available/api-counselorbot-sbs.ai4educ.org.conf"

echo "==> Backup $CONF"
cp "$CONF" "${CONF}.bak.$(date +%Y-%m-%d-%H%M%S)"

echo "==> Scrittura nuova config"
cat > "$CONF" << 'EOF'
server {
    listen 80;
    server_name api-counselorbot-sbs.ai4educ.org;
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Timeout per risposte AI lente (Ollama modelli grandi)
        proxy_read_timeout 600s;
        proxy_connect_timeout 30s;
        proxy_send_timeout 600s;
    }
}
EOF

echo "==> Test configurazione nginx"
nginx -t

echo "==> Reload nginx"
systemctl reload nginx

echo "==> OK: timeout 600s applicati a api-counselorbot-sbs.ai4educ.org"
