# Handoff — Proxy portable: 503 leggibile al timeout di auth_request (#254)

Agente: s26-proxy-timeout-254 · Branch: fix/portable-proxy-auth-timeout-254
Issue: #254 (relativa #256) · PR: #616 (https://github.com/nugh75/counselorbot-sbs/pull/616)

## Stato
Completato — fix implementato, test live Docker e test statico superati, push e PR #616 aperta.

## Fatto
- `infrastructure/portable/nginx-counselorbot.conf.template`:
  - timeout espliciti e bounded della sotto-richiesta `auth_request`
    (`proxy_connect_timeout 15s`, `proxy_send_timeout 15s`, `proxy_read_timeout 90s`);
  - `error_page 500 = @auth_unavailable;` in `location /`: ogni fallimento di
    auth (ai4auth irraggiungibile, timeout, 5xx) risponde 503 con `Retry-After: 30`,
    `Cache-Control: no-store` e messaggio IT/EN invece del 500 interno di nginx;
  - location nominata `@auth_unavailable` senza `auth_request`/`proxy_pass`: nessun loop.
- Aggiunto `scripts/nginx-portable-template.test.mjs` (guardia statica del template).
- Documentato in `docs/operations/portable-installation.md` e nel diario di progetto.

## Verifiche
- Test live Docker (nginx:alpine + mock ai4auth/frontend): timeout simulato →
  503 + `Retry-After` dopo ~3s (variante rápida) e ~90s (valori reali del template);
  401 → 302 login e 403 → 302 portal conservati; 200 → proxy con header identità
  del client rimossi e cookie inoltrato; recupero automatico senza reload; endpoint
  pairing `/api/chatgpt/link/*` (senza SSO) funzionanti anche con ai4auth giù.
- `nginx -t` OK sul template renderizzato; log nginx: "auth request unexpected
  status: 504" (la firma dell'incidente) ora seguito da 503 al client.
- Test statico: 4/4 pass (`node --test scripts/nginx-portable-template.test.mjs`).

## Prossimi passi
- Operatore: rieseguire `node scripts/register-portable-console.mjs --hostname counselorbot.labform.net --frontend counselorbot-portable-frontend` nella Console portabile per applicare il nuovo vhost (lo script valida la configurazione nginx e ricarica in modo graceful).
- Operatore: aumentare la memoria della VM Docker Desktop (~4 GB sono pochi; l'incidente è stato causato da saturazione, load ~15) — criterio di accettazione di #254.
- Opzionale (follow-up): stesso hardening per `nginx_counselorbot_host.conf` (host SBS: stesso pattern `auth_request`, ambiente separato non toccato).

## Blocchi e rischi
- Il fix non previene la saturazione della VM: durante un hang totale di ai4auth il sito resta non disponibile, ma risponde 503 retryable invece di 500.
- `proxy_read_timeout 90s` è un compromesso: tolleranza per ai4auth lento; in hang totale la 503 arriva dopo 90s (prima del timeout di Cloudflare, ~100s).
- Non toccati `.env`, segreti o credenziali; nessun container di produzione riavviato; i container Docker di test saranno rimossi a fine sessione.
