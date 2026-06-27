#!/usr/bin/env bash
set -euo pipefail

CONF_FILE="/etc/nginx/sites-available/counselorbot-sbs.ai4educ.org.conf"

echo "=== Patching Nginx configuration: $CONF_FILE ==="

# Use python to safely parse and inject client_max_body_size 100m; inside the 'location / {' block
python3 -c "
with open('$CONF_FILE', 'r') as f:
    c = f.read()
if 'client_max_body_size' not in c.split('location / {')[1].split('}')[0]:
    c = c.replace('location / {', 'location / {\n        client_max_body_size 100m;')
    with open('$CONF_FILE', 'w') as f:
        f.write(c)
    print('Configuration patched successfully.')
else:
    print('Configuration already patched.')
"

echo "=== Testing Nginx configuration ==="
nginx -t

echo "=== Reloading Nginx service ==="
systemctl reload nginx

echo "=== Nginx updated and reloaded successfully ==="
