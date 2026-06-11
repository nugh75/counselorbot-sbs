#!/usr/bin/env bash
set -euo pipefail

echo "=== Nginx Access Log (counselorbot-sbs.ai4educ.org) ==="
sudo tail -n 50 /var/log/nginx/access.log | grep -E "upload|qsa|pqbl" || true

echo ""
echo "=== Nginx Error Log ==="
sudo tail -n 50 /var/log/nginx/error.log
