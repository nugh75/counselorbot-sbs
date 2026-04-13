#!/usr/bin/env bash
set -euo pipefail

CONF="/etc/nginx/sites-available/counselorbot-sbs.ai4educ.org.conf"

echo "Ripristino config Authentik originale + timeout AI..."

sudo tee "$CONF" > /dev/null <<'EOF'
server {
    listen 80;
    server_name counselorbot-sbs.ai4educ.org;

    # authentik outpost endpoints (forward auth)
    location /outpost.goauthentik.io {
        proxy_pass http://127.0.0.1:9010/outpost.goauthentik.io;
        proxy_set_header Host $host;
        proxy_set_header X-Original-URL https://$http_host$request_uri;
        proxy_set_header X-Forwarded-Proto https;
        add_header Set-Cookie $auth_cookie;
        auth_request_set $auth_cookie $upstream_http_set_cookie;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
    }

    location @goauthentik_proxy_signin {
        internal;
        add_header Set-Cookie $auth_cookie;
        return 302 /outpost.goauthentik.io/start?rd=https://$http_host$request_uri;
    }

    location / {
        # authentik forward auth
        auth_request /outpost.goauthentik.io/auth/nginx;
        error_page 401 = @goauthentik_proxy_signin;
        auth_request_set $auth_cookie $upstream_http_set_cookie;
        add_header Set-Cookie $auth_cookie;
        auth_request_set $authentik_username $upstream_http_x_authentik_username;
        auth_request_set $authentik_groups $upstream_http_x_authentik_groups;
        proxy_set_header X-authentik-username $authentik_username;
        proxy_set_header X-authentik-groups $authentik_groups;
        proxy_set_header Remote-User $authentik_username;
        proxy_set_header Remote-Groups $authentik_groups;
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;

        # Timeout per risposte AI lente (Ollama modelli grandi)
        proxy_read_timeout 600s;
        proxy_connect_timeout 30s;
        proxy_send_timeout 600s;
    }
}
EOF

sudo nginx -t && sudo systemctl reload nginx
echo "Fatto - Authentik + timeout 600s attivi."
