#!/usr/bin/env bash
# Reinserisce l'eccezione nginx per il webhook Telegram.
#
# Il vhost di counselorbot-sbs.ai4educ.org e' generato dalla console ai4educ e
# ogni rigenerazione riscrive il file perdendo le location custom: senza questa
# eccezione il webhook finisce dietro il forward-auth ai4auth e Telegram riceve
# un 302 verso la pagina di login (il bot smette di ricevere aggiornamenti).
#
# Lo script e' idempotente: rilanciarlo dopo ogni rigenerazione del vhost.
# Va eseguito come root.
set -euo pipefail

CONF_FILE="${CONF_FILE:-/etc/nginx/sites-available/counselorbot-sbs.ai4educ.org.conf}"
BACKEND_UPSTREAM="${BACKEND_UPSTREAM:-http://127.0.0.1:8088}"

if [[ $EUID -ne 0 ]]; then
    echo "Errore: eseguire come root (sudo)." >&2
    exit 1
fi

if [[ ! -f "$CONF_FILE" ]]; then
    echo "Errore: $CONF_FILE non trovato." >&2
    exit 1
fi

if grep -q "location = /api/telegram/webhook" "$CONF_FILE"; then
    echo "Eccezione webhook gia' presente in $CONF_FILE."
else
    cp "$CONF_FILE" "$CONF_FILE.bak.$(date +%Y%m%d%H%M%S)"

    # Il backend monta la route come /telegram/webhook: il prefisso /api esiste
    # solo lato frontend (rewrite di Next.js) e qui va rimosso nel proxy_pass.
    python3 - "$CONF_FILE" "$BACKEND_UPSTREAM" <<'PY'
import sys

conf_file, upstream = sys.argv[1], sys.argv[2]
block = f"""    location = /api/telegram/webhook {{
        proxy_pass {upstream}/telegram/webhook;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }}

"""

with open(conf_file) as handle:
    content = handle.read()

marker = "    location / {"
if marker not in content:
    sys.exit("Errore: blocco 'location / {' non trovato nel vhost.")

content = content.replace(marker, block + marker, 1)

with open(conf_file, "w") as handle:
    handle.write(content)
PY
    echo "Eccezione webhook aggiunta a $CONF_FILE."
fi

nginx -t
systemctl reload nginx
echo "Nginx ricaricato."

echo "Verifica esterna (atteso 401/403 dal webhook, non 302 verso auth):"
curl -s -o /dev/null -w "  HTTP %{http_code} redirect=%{redirect_url}\n" \
    -X POST https://counselorbot-sbs.ai4educ.org/api/telegram/webhook \
    -H 'Content-Type: application/json' -d '{}' || true
