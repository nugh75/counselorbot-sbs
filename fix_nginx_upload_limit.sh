#!/usr/bin/env bash
# Imposta client_max_body_size a 100MB sull'nginx di counselorbot-sbs.
# Senza questo, nginx usa il default 1MB e ogni upload PDF > 1MB -> 413.
# Idempotente: non duplica la direttiva se gia' presente.
# Uso:  sudo bash fix_nginx_upload_limit.sh
set -euo pipefail

CONF="/etc/nginx/sites-available/counselorbot-sbs.ai4educ.org.conf"

if [[ $EUID -ne 0 ]]; then
    echo "Esegui come root:  sudo bash $0" >&2
    exit 1
fi

if [[ ! -f "$CONF" ]]; then
    echo "Config non trovata: $CONF" >&2
    exit 1
fi

echo "=== Backup: ${CONF}.bak ==="
cp -a "$CONF" "${CONF}.bak"

if grep -q "client_max_body_size" "$CONF"; then
    echo "client_max_body_size gia' presente, nessuna modifica."
else
    echo "=== Aggiungo client_max_body_size 100m; (livello server) ==="
    sed -i '/server_name counselorbot-sbs.ai4educ.org;/a\    client_max_body_size 100m;' "$CONF"
fi

echo "=== Test configurazione nginx ==="
nginx -t

echo "=== Reload nginx ==="
systemctl reload nginx

echo "=== Fatto. Limite upload ora 100MB. ==="
