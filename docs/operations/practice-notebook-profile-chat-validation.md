# Profili di prova e chat guidata — validazione

Task Diario `a284bc1a-0845-42b2-99e0-39fed5b99a66`, base iniziale `71a35aa6`.
Ripresa s7: modifiche s5 conservate in commit prima del merge ordinario di
`origin/main` (`cfb48674`, PR #252). Nessun reset o rebase. Il solo conflitto,
nel manifesto della guida, è stato risolto rigenerandolo sui sorgenti integrati.

## Audit e scelta UX

- UI: `PracticeNotebooks` contiene `PracticeRepertoire`; l’editor riusa
  `ScoreInputForm`, prima con «Continua» come submit. Il repertorio permetteva
  creazione/generazione/eliminazione, senza modifica o avvio diretto.
- API/modelli: `TeacherPracticeNotebook` e `TeacherPracticeResult` sono già
  separati dalle compilazioni reali. CRUD proprietario e guard plan-manager
  esistono; il PUT dei punteggi estende il medesimo router senza nuove tabelle.
- Chat: `app/page.tsx` gestisce `?start`, counselor, punteggi e nuova sessione;
  `GuidedChatInterface` invia contesto e ID, li salva negli snapshot e li
  ripristina. `chat_preparation` e l’envelope verificano ruolo/proprietà a ogni
  turno; un taccuino altrui/archiviato non introduce dati reali.
- UX: editor inline già usato dal repertorio, salvataggio esplicito con etichetta
  «Salva profilo», conferma riuscita ed errore che conserva la bozza. Modifica
  conserva identità/strumento/provenienza; «Avvia chat guidata» apre il percorso
  corrente con il profilo salvato. Token petrol/ocra/slate, target da 44px,
  sei lingue e larghezza mobile seguono `docs/design.md`.
- Guida: aggiornata la sezione docente nelle sei lingue. Le immagini esistenti
  dell’Area docenti non rappresentano il repertorio e restano pertinenti;
  screenshot del nuovo editor acquisito soltanto con fixture anonime per QA.

## Ambiente e comandi

Usare Node 22 e Python 3.11 (le dipendenze PDF richiedono Python >=3.10).
Nessun `.env`, credenziale o servizio di produzione. PostgreSQL effimero,
trust su loopback, dati sintetici, schema di ogni test annullato alla fine. Nel container di test montare
`docs-counselorbot` in sola lettura a `/app/docs-counselorbot`, come nel runtime,
per i test della Bussola:

```bash
# Prima controllare che 18594 e 3141 siano libere: ss -ltn, oppure lsof su macOS.
docker run -d --rm --name s5-practice-notebooks-test-postgres \
  -p 127.0.0.1:18594:5432 -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_USER=practice_test -e POSTGRES_DB=counselorbot_test postgres:16
python3.11 -m venv backend/.venv/runtime
backend/.venv/runtime/bin/python -m pip install -r backend/requirements.txt
PYTHON_DOTENV_DISABLED=1 DATABASE_URL=postgresql://practice_test@127.0.0.1:18594/counselorbot_test \
  backend/.venv/runtime/bin/python -m pytest backend/tests/test_practice_notebooks.py \
  backend/tests/test_notebook_context.py backend/tests/test_teacher_context.py -q
cd frontend
npm ci --no-audit --no-fund
npm test
npm run i18n:check
# TypeScript nella copia isolata creata dal runner (contiene next-env.d.ts):
# cd backend/.venv/class-settings-frontend-<id> && npx tsc --noEmit
npx eslint src/app/page.tsx src/components/teacher/PracticeRepertoire.tsx \
  src/lib/practice-notebooks.ts src/lib/practice-notebooks-api.ts \
  src/lib/practice-notebooks.test.ts src/lib/i18n-practice-notebooks.ts \
  src/lib/i18n-guide-audiences.ts
# Terminale separato, dalla radice del worktree:
DEV_FRONTEND_PORT=3141 BACKEND_ORIGIN=http://127.0.0.1:9 \
  bash scripts/dev-class-settings-frontend.sh
# Runner comune con snapshot esplicito dei sorgenti: nessun file ambiente copiato.
TEACHER_PRACTICE_BASE_URL=http://127.0.0.1:3141 \
  node --test tests/teacher-practice-notebooks.test.mjs
# La build Docker frontend esegue next build su un contesto che esclude .env*.
cd ..
make guidance-refresh
make guidance-check
```

Le fixture browser intercettano tutte le API e bloccano traffico esterno;
verificano salvataggio tramite pulsante, refresh, modifica, retry e doppio click,
lingue/layout, avvio dal profilo e continuazione da snapshot nonostante una
preferenza browser diversa. I test API verificano lettura fresca dal DB,
validazione e 403/404 anche per un risultato di un altro taccuino dello stesso
docente. I test envelope coprono separazione dei dati reali e controlli a ogni
turno. Le risposte AI sono simulate: nessuna chiamata a un provider reale.

Preview SSH: `ssh -N -L 3141:127.0.0.1:3141 <user>@<server>`, poi
`http://localhost:3141/docente/taccuini-prova` (fixture disponibili solo nei test).
Fermare Next con Ctrl+C nella sessione che lo ha avviato; fermare solo il DB
creato qui con `docker stop s5-practice-notebooks-test-postgres`.

Build Docker richieste solo con tag locali `s5-practice-notebooks-backend:local`
e `s5-practice-notebooks-frontend:local`, senza Compose, avvio o riavvio di
servizi di produzione. Nessun deploy o passo sudo richiesto.

## Rilievi della ripresa s7

- L'exit 1 dell'handoff non è identificabile con certezza, ma il log completo
  `backend/.venv/practice-browser-warm.log` contiene 22/23 test browser passati:
  fallisce l'asserzione di larghezza in svedese. Riprodotto sull'immagine s5
  isolata, porta 3142: viewport 390, documento 396 px. La parola lunga nel titolo
  dell'intestazione docente forza la colonna `1fr`; corretti minimo della colonna
  e wrapping, senza tagliare il testo. Bug Diario
  `13f32b4a-7aca-49f7-97b1-110a3c45a895`.
- Dopo il merge QPCC, il nuovo PUT consentiva i fattori legacy K. Il test di
  regressione ha riprodotto 200 invece di 422; aggiunta validazione canonica
  sullo strumento memorizzato. Copertura: legacy, profili incompleti/misti,
  decimali, booleani/stringhe, lettura fresca e assenza di compilazioni reali.
  Bug Diario `1208ac31-4d5d-4092-898c-13416490af29`.
- Un test preesistente cercava `3B` nell'intero prompt e falliva quando il codice
  casuale della conversazione conteneva quelle lettere. L'asserzione verifica
  ora la riga della classe e la descrizione. Bug Diario
  `d8a8a9c8-c5cc-49bd-b276-fffcadd8911a`.
- Su macOS il runner dev comune richiede `ss`, assente sull'host. La porta è
  stata controllata con `lsof` prima dell'avvio; il runner resta invariato.
  Rilievo di tooling separato nel Diario: `7d2dd326-3346-4b42-8356-1161a11d0c09`.
- La copia frontend dev senza `.env` ha superato il timeout di compilazione;
  fermati solo i processi s7. I due server Next estranei, con cwd nel checkout
  principale, non sono stati toccati. Le fixture browser usano un container
  frontend locale isolato, backend deliberatamente inesistente e API simulate.
- Build s7 con tag `s7-practice-notebooks-{backend,frontend}:local`. Il contesto
  backend contiene solo file tracciati necessari; `.env*` è escluso anche dal
  contesto frontend. Docker dispone di 4 GiB: per la build frontend di verifica
  si usa una copia temporanea del Dockerfile con heap Node limitato a 1 GiB e
  telemetria disattivata. Il Dockerfile del progetto resta invariato.
- Revisione cross-modello non necessaria per questo task/PR, per deroga esplicita
  dell'utente registrata nel Diario. La deroga non autorizza merge o deploy.

## Ripresa s8: isolamento delle verifiche

La build backend s7 è completata (log `backend/.venv/s7-backend-build.log`).
Il secondo fallimento della suite post-merge QPCC era un file di fixture assente
dal container, non un errore del contratto: i test di allineamento leggono anche
`questionari/item_catalog/qpcc.json` e `frontend/src/lib/qpcc-schema.json`.
Montare entrambi in sola lettura, oltre a `docs-counselorbot` e ai test correnti.
Rilievo Diario `29f937d7-0189-42af-95e7-7b30f1acedfa` (sospetto).

L'host dispone di 8 GiB; durante la ripresa sono stati osservati swap intenso
e attese prolungate. Sono stati fermati soltanto la build e il pytest residui
s7 e le verifiche duplicate s8. Il Postgres condiviso non è stato modificato.
`pg_stat_activity` ha mostrato `IO / DataFileImmediateSync` durante il bootstrap
dello schema di test. Rilievo di ambiente Diario
`aa5cf61f-caab-4614-a70e-43c1177f610c` (sospetto).

Per ripetere la suite senza scritture persistenti, usare un Postgres dedicato
con dati su tmpfs e durabilità disattivata **solo per questo DB effimero**:

```bash
docker run -d --rm --name s8-practice-notebooks-postgres \
  --tmpfs /var/lib/postgresql/data:rw,size=256m \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=practice_test \
  -e POSTGRES_DB=counselorbot_test postgres:16 \
  -c fsync=off -c synchronous_commit=off -c full_page_writes=off
# Attendere "database system is ready to accept connections" nei log.
docker run --rm --name s8-practice-backend-tests-memory \
  --network container:s8-practice-notebooks-postgres \
  -e PYTHON_DOTENV_DISABLED=1 \
  -e DATABASE_URL='postgresql://practice_test@127.0.0.1:5432/counselorbot_test?connect_timeout=8' \
  -e COUNSELORBOT_DOCS_DIR=/app/docs-counselorbot \
  -e SESSION_MEMORY_DIR=/tmp/s8-session-memory \
  -v "$PWD/backend/tests:/app/backend/tests:ro" \
  -v "$PWD/questionari:/app/questionari:ro" \
  -v "$PWD/frontend/src/lib/qpcc-schema.json:/app/frontend/src/lib/qpcc-schema.json:ro" \
  -v "$PWD/docs-counselorbot:/app/docs-counselorbot:ro" \
  s7-practice-notebooks-backend:local python -u -m pytest \
  backend/tests/test_practice_notebooks.py backend/tests/test_notebook_context.py \
  backend/tests/test_teacher_context.py backend/tests/test_qpcc_alignment.py \
  -vv --tb=short --disable-warnings -o faulthandler_timeout=45
docker stop s8-practice-notebooks-postgres
```

La copia frontend s8 contiene sorgenti/configurazioni correnti, dipendenze e
asset, senza `.env*`. Il controllo TypeScript richiede `next-env.d.ts`, generato
da Next o copiato da una precedente copia isolata. Build e test vanno eseguiti
in sequenza per contenere il consumo di memoria. Nessun deploy o passo sudo.

Verifiche già concluse nella ripresa: 430 test unitari frontend (log s7),
controllo traduzioni 3.325 chiavi nelle sei lingue, `tsc --noEmit` sulla copia s8,
ESLint sui file modificati (zero errori, un warning React preesistente),
`make guidance-refresh`, `make guidance-check`, gate `--base origin/main` e
`git diff --check`. Suite backend post-merge, browser dopo il fix mobile e build
frontend restano in verifica; la PR viene mantenuta in bozza finché non conclusi.
