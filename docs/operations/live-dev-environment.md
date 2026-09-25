# Ambiente di sviluppo live (hot reload)

Permette di modificare frontend e backend sul server e vedere subito le
modifiche dal browser del Mac, **senza toccare i container di produzione**
(backend `:8088`, frontend `:3000`, esposti via Cloudflare).

## Comandi

```bash
# 1. Backend dev (FastAPI + uvicorn --reload, porta 8002)
~/counselorbot-sbs/scripts/dev-backend.sh

# 2. Frontend dev (next dev con HMR, porta 3107)
/home/nugh75/counselorbot-sbs/scripts/dev-frontend.sh
```

Oppure in background:

```bash
nohup ~/counselorbot-sbs/scripts/dev-backend.sh > /tmp/cb-dev-backend.log 2>&1 &
nohup ~/counselorbot-sbs/scripts/dev-frontend.sh > /tmp/cb-dev-frontend.log 2>&1 &
```

Log: `/tmp/cb-dev-backend.log`, `/tmp/cb-dev-frontend.log`.

## Accesso dal Mac (SSH port forwarding)

```bash
ssh -N \
  -L 3107:127.0.0.1:3107 \
  -L 8002:127.0.0.1:8002 \
  <utente>@<server-remoto>
```

Nel browser del Mac: **http://localhost:3107** (il backend dev è raggiungibile
anche su http://localhost:8002/docs, ma serve solo per il debug delle API).

Arresto: `Ctrl+C` sui due processi (o `pkill -f "uvicorn backend.main:app"`,
`pkill -f "next dev"`).

## Architettura

| Componente | Comandi | Porta | Note |
|---|---|---|---|
| Backend dev | `scripts/dev-backend.sh` | 8002 (host `127.0.0.1`) | `uvicorn --reload`, venv `backend/.venv` (uv) |
| Frontend dev | `scripts/dev-frontend.sh` | 3107 (host `127.0.0.1`) | `next dev` con Turbopack + HMR |
| DB del backend dev | — | 5435 → **counselorbot_test** | stesso server di produzione, database separato |
| DB di produzione | container `counselorbot_postgres` | 5435 → `counselorbot` | non viene toccato dallo sviluppo |
| Produzione (Docker) | `docker compose up -d --build` | backend 8088, frontend 3000 | NON avviare comandi compose durante lo sviluppo |

Il proxy `/api/*` di Next in dev va a `http://127.0.0.1:8002` grazie a
`frontend/.env.development` (variabile `BACKEND_ORIGIN`). In produzione la
stessa variabile non esiste e il rewrite resta su `http://backend:8000`
(nome servizio Compose), quindi la configurazione di produzione non cambia.

## Database di sviluppo

Il backend dev si collega a `counselorbot_test` (stesso Postgres, database
diviso): le modifiche sperimentali (creazione obiettivi, upload, ecc.) non
finiscono nei dati reali. Il database viene creato al primo avvio e le
tabelle per lo sviluppo si generano automaticamente via
`Base.metadata.create_all` allo startup.

## Dipendenze di sistema (graphviz, tesseract)

Il backend usa `dot` (graphviz) e `tesseract` (OCR). Senza `sudo`, sono
installati in `~/.local/opt` (estratti dai `.deb` di Ubuntu) e il path viene
attivato da `dev-backend.sh` tramite `PATH`, `LD_LIBRARY_PATH`,
`TESSDATA_PREFIX`.

## Verifiche fatte (25/09/2026)

- Backend: `/docs` e `/auth/me` → 200. Modificando un file `.py` il processo
  si ricarica automaticamente ( StatReload, verificato).
- Frontend: pagina `/` e `/profilo` → 200; `/api/auth/me` via proxy → 200.
- Reload verificato end-to-end sia lato Python sia lato Next.
- Produzione in esecuzione e ininterrotta durante tutta la configurazione.

## Limitazioni dello sviluppo locale (host)

- `ai4auth` e `omniroute` non sono raggiungibili per nome host: compare un
  log "Admin sync fetch failed" avvio. È innocuo per lo sviluppo (login dev
  usa l'header `x-test-user` come nei test browser se si usa il fixture).
- In caso di modifica dei modelli o dipendenze di sistema, serve un nuovo
  `uv pip install -r backend/requirements.txt --python backend/.venv/bin/python`.

## Riferimenti

- Piano origine dell'implementazione: `docs/plans/2026-09-24-obiettivi-rete-plan.md`
- Anteprima senza backend (solo dati demo): `docs/operations/personal-area-dev-preview.md`
