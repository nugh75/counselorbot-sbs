# Istanza di prova con hot reload (Docker)

Questa configurazione serve **solo all'istanza di prova**: frontend e backend
girano in modalità sviluppo con il codice montato nei container. Non è una
configurazione di produzione e non va usata con dati reali.

## Cosa cambia rispetto al deploy normale

- Il frontend usa `next dev` (hot reload) invece del build di produzione.
- Il backend usa `uvicorn --reload`.
- `frontend/src`, `frontend/public`, i file di configurazione del frontend e
  `backend/` sono montati dai path del repository.
- Porte e URL pubblici restano gli stessi del deployment portable:
  frontend `127.0.0.1:3108`, backend `127.0.0.1:8087` (o le variabili
  `COUNSELORBOT_FRONTEND_PORT` / `COUNSELORBOT_BACKEND_PORT` del `.env`).
  Nginx e Cloudflare continuano a puntare agli stessi servizi.

## Comandi

Dalla radice del repository:

```bash
scripts/dev-test-instance.sh up       # avvia; al primo giro costruisce l'immagine dev
scripts/dev-test-instance.sh logs     # segue i log di frontend e backend
scripts/dev-test-instance.sh status   # stato dei container
scripts/dev-test-instance.sh stop     # ferma solo frontend e backend
scripts/dev-test-instance.sh rebuild  # dopo modifiche a dipendenze/Dockerfile
scripts/dev-test-instance.sh prod     # torna alle immagini di produzione
scripts/dev-test-instance.sh clean    # libera immagini dangling e build cache
```

Il primo `up` può richiedere alcuni minuti perché costruisce l'immagine
frontend `counselorbot-portable-counselorbot-frontend:dev`. Le modifiche
successive al codice **non** richiedono build: il file viene sincronizzato dal
bind mount e Next.js/uvicorn ricaricano.

## Cosa si aggiorna senza rebuild

- pagine, componenti e stili sotto `frontend/src`;
- immagini e file sotto `frontend/public`;
- `frontend/next.config.ts`, `postcss.config.mjs`, `tsconfig.json`,
  `eslint.config.mjs`;
- codice Python sotto `backend/` (uvicorn riavvia il worker);
- documenti sotto `knowledge/` (già montati dal compose base).

## Cosa richiede `rebuild`

- `frontend/package.json` o `frontend/package-lock.json`;
- `backend/requirements.txt`;
- `frontend/Dockerfile` o il compose dev;
- nuove dipendenze di sistema.

Dopo queste modifiche:

```bash
scripts/dev-test-instance.sh rebuild
```

## Pulizia Docker

Il comando `clean` esegue:

- `docker image prune -f` (solo immagini dangling, non quelle in uso);
- `docker builder prune -f` (build cache non più necessaria);
- `docker container prune -f` limitato al progetto
  `counselorbot-portable` (solo container fermati).

Non rimuove volumi, database o immagini in uso. Non usare
`docker system prune --volumes` su questa macchina: cancellerebbe i dati
persistenti anche di altri progetti.

Dopo il passaggio alla modalità hot reload la build cache non serve più per le
modifiche quotidiane; eseguire `clean` quando serve spazio. Se in futuro si
torna al deploy di produzione, la prima build sarà più lenta perché la cache
è stata rimossa.

## Limiti

- Modalità sviluppo: errori dettagliati, source map e nessuna ottimizzazione di
  produzione. Va bene per una istanza di prova, non per utenti reali.
- Se l'hot reload non parte, controllare i log con
  `scripts/dev-test-instance.sh logs`. Su Docker Desktop macOS può essere
  necessario aggiungere `WATCHPACK_POLLING=true` (e, per il backend,
  verificare che `--reload-dir /app/backend` veda il mount).
- Per lo sviluppo più veloce senza Docker restano disponibili
  `scripts/dev-frontend.sh` (:3107) e `scripts/dev-backend.sh` (:8002), descritti
  in [live-dev-environment.md](live-dev-environment.md).

## Ritorno alla produzione

```bash
scripts/dev-test-instance.sh prod
```

Se il codice è cambiato, il comando usa le immagini di produzione esistenti;
per ricostruirle serve il normale deploy:

```bash
docker compose --env-file .env -f docker-compose.portable.yml up -d --build counselorbot-backend counselorbot-frontend
```
