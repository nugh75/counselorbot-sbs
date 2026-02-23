#!/bin/bash

# Step 1: Get auth token
echo "Getting NPM auth token..."
TOKEN=$(sudo docker exec nginx-proxy-manager curl -s http://localhost:81/api/tokens \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"identity":"daniele.dragoni@uniroma3.it","secret":"Ciao2025!!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

if [ -z "$TOKEN" ]; then
    echo "ERROR: Could not get auth token"
    exit 1
fi
echo "Token obtained."

# Step 2: Find existing proxy host for this domain
echo "Looking for existing proxy host..."
HOST_ID=$(sudo docker exec nginx-proxy-manager curl -s http://localhost:81/api/nginx/proxy-hosts \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
hosts = json.load(sys.stdin)
for h in hosts:
    if 'prin-orientamento.uniroma3.it' in h.get('domain_names', []):
        print(h['id'])
        break
")

if [ -z "$HOST_ID" ]; then
    echo "ERROR: Could not find existing proxy host"
    exit 1
fi
echo "Found proxy host ID: $HOST_ID"

# Step 3: Update proxy host with advanced config
echo "Updating proxy host with location blocks..."
RESULT=$(sudo docker exec nginx-proxy-manager curl -s "http://localhost:81/api/nginx/proxy-hosts/$HOST_ID" \
  -X PUT \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "domain_names": ["prin-orientamento.uniroma3.it"],
    "forward_host": "counselorbot_frontend",
    "forward_port": 3000,
    "forward_scheme": "http",
    "access_list_id": "0",
    "certificate_id": 0,
    "meta": {
      "letsencrypt_agree": false,
      "dns_challenge": false
    },
    "advanced_config": "location /counselorbot {\n    proxy_set_header Host $host;\n    proxy_set_header X-Real-IP $remote_addr;\n    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n    proxy_set_header X-Forwarded-Proto $scheme;\n    proxy_set_header Upgrade $http_upgrade;\n    proxy_set_header Connection $http_connection;\n    proxy_http_version 1.1;\n    proxy_pass http://counselorbot_frontend:3000;\n}\n\nlocation /questionari {\n    proxy_set_header Host $host;\n    proxy_set_header X-Real-IP $remote_addr;\n    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n    proxy_set_header X-Forwarded-Proto $scheme;\n    proxy_set_header Upgrade $http_upgrade;\n    proxy_set_header Connection $http_connection;\n    proxy_http_version 1.1;\n    proxy_pass http://prin-frontend:3000;\n}",
    "locations": [],
    "block_exploits": false,
    "caching_enabled": false,
    "allow_websocket_upgrade": true,
    "http2_support": false,
    "hsts_enabled": false,
    "hsts_subdomains": false,
    "ssl_forced": false
  }')

echo ""
echo "Result:"
echo "$RESULT" | python3 -m json.tool 2>/dev/null || echo "$RESULT"
