#!/usr/bin/env bash
set -euo pipefail

CONF="/etc/nginx/sites-available/counselorbot-sbs.ai4educ.org.conf"
BACKUP="${CONF}.bak.$(date +%F-%H%M%S)"

echo "Backup: $BACKUP"
sudo cp "$CONF" "$BACKUP"

sudo tee "$CONF" > /dev/null <<'EOF'
server {
    listen 80;
    server_name counselorbot-sbs.ai4educ.org;

    include /etc/nginx/snippets/authelia-location.conf;

    location = /counselorbot {
        return 301 /;
    }

    location ~ ^/counselorbot/(.*)$ {
        return 301 /$1;
    }

    location / {
        auth_request /internal/authelia/authz;
        error_page 401 =302 https://auth.ai4educ.org/?rd=https://$http_host$request_uri;

        auth_request_set $user $upstream_http_remote_user;
        auth_request_set $groups $upstream_http_remote_groups;
        proxy_set_header Remote-User $user;
        proxy_set_header Remote-Groups $groups;

        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

sudo nginx -t
sudo systemctl reload nginx

echo "Fatto."
