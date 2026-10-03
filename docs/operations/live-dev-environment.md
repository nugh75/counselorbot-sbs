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

- Classi S13 e successivo popup S14: `scripts/dev-teacher-class-management-tests.sh`,
  solo frontend su `127.0.0.1:3133`, upstream inutilizzabile e API simulate;
  nessun backend/database. Start/stop, comandi e limiti in
  `docs/operations/teacher-class-management-validation.md`.

- Piano origine dell'implementazione: `docs/plans/2026-09-24-obiettivi-rete-plan.md`
- Anteprima senza backend (solo dati demo): `docs/operations/personal-area-dev-preview.md`

## Regressione metodo → azione (solo frontend e fixture)

Da questo worktree, verificare che la porta 3112 sia libera con `ss -ltn`, poi
avviare `./scripts/dev-method-action-tests.sh`. Il frontend ascolta soltanto su
`127.0.0.1:3112`; il backend è impostato su una porta inutilizzabile e il test
intercetta tutte le API con dati sintetici in memoria, comprese le scritture.
Non servono backend, database o container. Arrestare il processo con Ctrl+C.

Da `frontend/`, eseguire:

```bash
node --test --experimental-strip-types tests/goal-method-action.test.mjs
```

Il test copre metodo modificato, salvataggi espliciti, apertura e precompilazione
azione, sei lingue/mobile, nuovo obiettivo, annullamento e riapertura, errori,
retry e invii duplicati/in corso. `GOALS_BASE_URL` può cambiare l’URL del frontend
locale. Le fixture verificano UI e richieste API, non la persistenza del backend.
Le schermate della guida mostrano un popup con metodo vuoto e obiettivo non
modificato, oltre al modulo di condivisione: i controlli cambiati non sono visibili
in quelle fixture e questa correzione non richiede ricatture.

## Regressione bozze assegnazioni e letture (solo frontend)

Verificare con `ss -ltn` che 3112 sia libera, poi avviare
`./scripts/dev-draft-protection-tests.sh`. Ascolta su `127.0.0.1:3112` con
upstream fittizio `http://127.0.0.1:9`; nessun backend o database è necessario.
La suite intercetta tutte le API (anche scritture) e blocca destinazioni esterne:
usa soltanto assegnazioni e compilazioni anonime in memoria. Da `frontend/`:

```bash
node --test --experimental-strip-types tests/draft-protection.test.mjs
```

`DRAFTS_BASE_URL` può cambiare l’URL localhost. Non eseguire queste fixture su
produzione. Copertura: annulla/scarta, dettagli, altra scheda, quattro filtri,
hash, cambio compilazione/ricerca, vista richiusa, ripristino, salvataggio
riuscito/fallito e in corso, invii duplicati, isolamento del testo e guard dei
link/browser. Le sei lingue e i controlli da tastiera sono verificati nel browser.
La guida nelle sezioni 12 e 14 descrive le protezioni: le immagini esistenti
mostrano navigazione e lista in stato pulito, ancora corrispondenti alla UI.
La conferma riutilizza il dialogo nativo già presente, senza nuovo layout.
Le prove non certificano la persistenza backend, SSO reale o dispositivi fisici.

Per vedere il frontend tramite SSH: `ssh -N -L 3112:127.0.0.1:3112 <utente>@<server>`,
poi `http://localhost:3112`. I dati della suite sono disponibili solo nel browser
Playwright che li intercetta. Arrestare il server con Ctrl+C; non lasciare
processi della fixture attivi a fine lavoro.

## Fixture per errori di caricamento docente (S4)

`scripts/dev-teacher-loading-errors-tests.sh` avvia soltanto il frontend su
`127.0.0.1:3124`, con upstream API `127.0.0.1:9`. Verificare prima che la porta
sia libera (`ss -ltn`). I test Playwright intercettano tutte le API e bloccano
il traffico esterno: dati anonimi in memoria, nessun backend o database.
Da `frontend/`: `node --test tests/teacher-loading-errors.test.mjs`.
Per vedere la fixture: `ssh -N -L 3124:127.0.0.1:3124 <utente>@<server-remoto>`,
poi `http://localhost:3124`. Senza fixture API le chiamate falliscono volutamente.
Arresto: Ctrl+C nel terminale che ha lanciato lo script. Dettagli e limiti in
`docs/operations/teacher-loading-errors.md`.

Il blocco B del taccuino riutilizza lo stesso server e isolamento. Da `frontend/`:
`node --test tests/teacher-notebook-links.test.mjs tests/teacher-notebook-copy.test.mjs`.
Copre rimandi, scarto/annullamento della bozza, salvataggio, cronologia, ruoli e
sei lingue; dettagli in `docs/operations/teacher-notebook-links-validation.md`.
Nessuna nuova porta, backend o procedura di avvio/arresto.

## Fixture popup Classi dal taccuino (S14)

`scripts/dev-teacher-class-picker-tests.sh` avvia solo il frontend con hot reload
su `127.0.0.1:3134`, upstream `http://127.0.0.1:9`. Verificare prima la porta
con `ss -ltn 'sport = :3134'`. Nessun backend, SSO, database o container avviato;
le API sono fixture anonime in memoria nel browser e il traffico esterno è bloccato.
Da `frontend/`:

```bash
TEACHER_PICKER_BASE_URL=http://127.0.0.1:3134 node --test --experimental-strip-types tests/teacher-class-picker.test.mjs
```

Tunnel: `ssh -N -L 3134:127.0.0.1:3134 <utente>@<server>`; URL
`http://localhost:3134`. Senza le fixture non è una preview autenticata.
Arresto: Ctrl+C nel terminale dello script; usare solo PID verificati di questa
sessione, mai pkill generici. Le prove compilate usano la stessa porta dopo aver
arrestato il dev, con i comandi in `teacher-class-management-validation.md`.
La baseline S13 è stata copiata in `/tmp/s14-parent-app`, servita solo su
`127.0.0.1:3136` e arrestata al termine. Nessun altro worktree è stato modificato.


## Pagina Taccuino docente (S16)

`/docente` contiene solo l’ingresso illustrato; il form e il popup Classi vivono
in `/docente/taccuino`. La suite riusa `scripts/dev-teacher-class-picker-tests.sh`
e `127.0.0.1:3134`, dopo `ss -ltn 'sport = :3134'`; nessuna nuova porta o dato.
Upstream `http://127.0.0.1:9`, API intercettate e dati anonimi in memoria; nessun
backend, SSO, DB o container avviato. Da `frontend/`:

```bash
TEACHER_PICKER_BASE_URL=http://127.0.0.1:3134 node --test --experimental-strip-types tests/teacher-notebook-page.test.mjs
GUIDE_BASE_URL=http://127.0.0.1:3134 GUIDE_SCREENS=teacher-notebook node --experimental-strip-types scripts/capture-guide.mjs
```

La cattura aggiorna solo home docente, pagina taccuino e popup nelle sei lingue.
Tunnel: `ssh -N -L 3134:127.0.0.1:3134 <utente>@<server>`;
URL `http://localhost:3134/docente/taccuino`. Senza fixture le API falliscono
volutamente. Stop: Ctrl+C nel terminale di avvio, oppure TERM ai soli PID
verificati di questa sessione. Fermare il dev prima di build e server compilato.
Comandi completi, baseline e limiti: `teacher-notebook-page-validation.md`.

## Taccuino primo nella home docente (S18)

Stesse fixture, porta 3134, upstream isolato e avvio/stop di S16. Il primo
collegamento della home `/docente` è `/docente/taccuino`, prima di DOCENZA.
Il test `teacher-notebook-page.test.mjs` verifica ordine DOM, Tab/Shift+Tab,
destinazione e layout a 320/1440 px nelle sei lingue. Per aggiornare soltanto
le sei immagini della home, da `frontend/`:

```bash
GUIDE_BASE_URL=http://127.0.0.1:3134 GUIDE_SCREENS=teacher-area node --experimental-strip-types scripts/capture-guide.mjs
```

Taccuino, popup e altre immagini non vengono rigenerati. Evidenze e limiti:
`teacher-notebook-first-validation.md`. Nessun processo di S18 lasciato attivo.

### Fixture browser delle API personali

Avvio frontend isolato: `./scripts/dev-personal-api-fixtures.sh`, URL
`http://127.0.0.1:3135`. La porta è verificata prima dell'avvio. Fermare con
Ctrl+C nello stesso terminale. Nessun backend né database aggiuntivo è richiesto
per `cd frontend && npm run test:personal-api`: tutte le API sono intercettate
con fixture di account e chiavi fittizie. Non usare questa pagina per inserire
credenziali reali durante la prova senza un backend di sviluppo isolato.

Per rigenerare la schermata della guida con campo chiave vuoto:
`cd frontend && PERSONAL_API_CAPTURE_GUIDE=1 npm run test:personal-api`.
Le esecuzioni normali non riscrivono la schermata. Dettagli e limiti della
funzione: [personal-api-settings.md](personal-api-settings.md).


### Verifiche di attivazione e visibilità AI personali

La PR 40 include anche l’attivazione amministrativa ChatGPT e risolve la
coesistenza delle due modalità. Dal frontend di sviluppo isolato su 3107:

```bash
cd frontend
PERSONAL_API_BASE_URL=http://127.0.0.1:3107 npm run test:personal-api
npm run test:personal-ai
node --test --experimental-strip-types tests/chatgpt-subscription.test.mjs tests/chatgpt-admin-settings.test.mjs
```

Le suite usano account e credenziali fittizi nelle API del browser. La prova
aggiuntiva con API reali dell’app sul database dedicato `counselorbot_dev`
ha verificato che i pulsanti amministrativi preparano le chiavi senza
configurazione manuale, poi ha ripristinato entrambi i flag a false; nessuna
chiave API utente salvata, nessun OAuth e nessuna chiamata LLM. Le directory
private di sviluppo restano sul disco, escluse da Git e dal contesto Docker.
Non usare una copia di produzione per queste prove.

### Connessioni multiple e counselor privati

La stessa fixture browser su `127.0.0.1:3135` verifica più account/chiavi dello
stesso provider, associazioni condivise da più counselor, scelta predefinita,
creazione e modifica dei counselor privati con istruzioni nella lingua scelta.
La schermata `frontend/public/guide/api-personali.png` usa dati fittizi e non
mostra chiavi. Controlli in tema scuro, sei lingue, 320 e 1440 px.

```bash
cd frontend
PERSONAL_API_BASE_URL=http://127.0.0.1:3135 npm run test:personal-api
PERSONAL_API_BASE_URL=http://127.0.0.1:3135 npm run test:personal-ai
CHROMIUM_PATH=/usr/bin/chromium RECOVERY_BASE_URL=http://127.0.0.1:3135 npm run test:recovery
```

`CHROMIUM_PATH` è facoltativo se il browser Playwright è già installato. Le API
di queste prove sono intercettate; non verificano quote o accesso reale a OpenRouter.
Il backend su `127.0.0.1:8002`, collegato al solo DB `counselorbot_dev`, ha
completato l’avvio con l’aggiornamento dello schema e risposto a `/docs` e
`/auth/me`. I test backend usano invece schemi isolati nel DB `counselorbot_test`
con rollback, comprese migrazione della vecchia chiave, cifratura, isolamento tra
proprietari e selezione del modello associato. Nessun provider reale chiamato.

I processi uvicorn 8002 e frontend fixture 3135 vengono fermati al termine della
sessione; PostgreSQL e dati persistenti vengono conservati. La ricostruzione
Docker completa non è stata eseguita: meno di 500 MiB liberi nel filesystem
Docker vfs, sotto la riserva di 5 GiB. Il Codespace dell’utente non è stato
aggiornato automaticamente.

### Filtro esterno senza modello Ollama

Il pannello amministrativo è verificabile nella stessa fixture su 3135:

```bash
cd frontend
PRIVACY_BASE_URL=http://127.0.0.1:3135 node --test --experimental-strip-types tests/external-privacy.test.mjs
```

La suite usa dati fittizi, API intercettate e nessuna chiamata LLM. Verifica
scelta esplicita, salvataggio/rilettura, errori che conservano il modo attivo,
ricercatore escluso, Guida amministrativa, sei lingue e 320/1440 px in tema scuro.
`PRIVACY_CAPTURE_GUIDE=1` rigenera soltanto `guide/protezione-dati.png`.
I test backend controllano che il filtro base non chiami Ollama, mascheri anche
system/history e ripristini la risposta, mentre la modalità locale resta bloccante
anche con un flag globale vecchio nel worker. Nuova rotta provata sul backend
dev 8002: startup completo e 401 senza identità. Processi locali fermati a fine
sessione; nessuna modifica alle impostazioni o al server del Codespace dell’utente.
