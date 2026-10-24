# Guscio desktop docente — F1-02

Il guscio in `desktop/teacher` implementa il ciclo di vita previsto da
ADR-0002 §1–§2.6. Non è ancora un'app docente utilizzabile con dati reali:
profilo SQLite completo, autenticazione locale, API personali/portachiavi,
frontend a origine backend dinamica e tunnel per lezioni sono compiti distinti.
Identificatore immutabile: `org.ai4educ.counselorbot.teacher`.

Su Windows il guscio normalizza i percorsi risorse verbatim prima di passarli
ai sidecar: l'entrypoint Node non gestisce correttamente il prefisso esteso
(`EISDIR lstat C:`, [Node #62446](https://github.com/nodejs/node/issues/62446)).
La dipendenza Windows `dunce`, già presente nella risoluzione Tauri, conserva
i percorsi che non hanno una rappresentazione breve equivalente.

## Avvio e dati

Tauri usa `app_local_data_dir()`, crea `layout.json` versione 1 e tutte le
cartelle dell'ADR; la radice e `credentials/` hanno permessi 0700 su Unix.
Nessuna scrittura nelle risorse installate. Il lock della cartella dati e il
plugin single-instance impediscono avvii concorrenti.

Il supervisore avvia backend, frontend, poi cloudflared opzionale, tutti con
indirizzo `127.0.0.1`. Backend su porta nuova; porta frontend salvata in
`config/shell.json`, riusata se libera. Collisione: codice 4 e fino a tre
tentativi. Le attese health sono 180 secondi al primo avvio, 60 ai successivi.
`GET /health` espone stato, versione, `desktop_contract: 1`, dialetto DB.
Un mismatch di versione/contratto impedisce il tunnel e chiude quello esistente.
I segreti shell/frontend sono casuali, distinti e rinnovati a ogni lancio;
non sono inclusi nel report, nella configurazione o nei messaggi del guscio.

`/internal/*` richiede loopback, segreto shell e assenza di intestazioni
`Cf-*`, `X-Forwarded-*`, `X-CounselorBot-Origin`; gli altri accessi ricevono
404. Il frontend blocca `/api/internal/*` prima di firmare l'origine della
richiesta con l'helper F1-19, conservato nell'integrazione di PR #521.

## Arresto e recupero

Backend e frontend leggono la pipe stdin: EOF richiede arresto pulito, con
uscita forzata dopo dieci secondi. Windows assegna i sidecar a un Job Object
KILL_ON_JOB_CLOSE e usa CREATE_NO_WINDOW. Linux aggiunge PDEATHSIG. Su Unix il
guscio avvia cloudflared tramite una seconda istanza `--lifeline`, senza
webview: EOF o SIGTERM fermano il figlio, poi SIGKILL dopo cinque secondi.

Arresto normale in ordine tunnel → frontend → backend. Al riavvio vengono
fermati solo processi registrati il cui PID, nome e ora d'avvio coincidono.
Il limite macOS dell'ADR resta: uccidendo anche la lifeline insieme al guscio,
cloudflared può sopravvivere fino al lancio successivo. Il backend/frontend
sono comunque fermati dalla chiusura di stdin.

Codice backend 3: errore dati e indicazione di ripristino; 4: altra porta;
crash: fino a tre riavvii per sidecar in cinque minuti. Il ripristino effettivo
dei backup è F1-05j. stdout/stderr vanno direttamente nei file; rotazione
all'apertura sopra 10 MB, cinque file. L'esportazione diagnostica comprende
log, layout e versione, escludendo DB, credenziali e registri runtime.

## Build e prove isolate

Non richiede Docker. Su un runner con Python 3.12, Node 22, Rust stable e le
dipendenze di sistema Tauri:

```sh
bash desktop/teacher/scripts/build-backend.sh
bash desktop/teacher/scripts/build-frontend.sh
bash desktop/teacher/scripts/fetch-cloudflared.sh macos-arm64 desktop/teacher/src-tauri/cloudflared
cd desktop/teacher
npm ci
npx tauri build --bundles app
```

Sostituire piattaforma e bundle sui rispettivi sistemi. Gli script ricreano
solo le proprie cartelle di output, ignorate da Git. cloudflared è fissato a
2026.10.0 con SHA-256 degli asset. La CI `desktop-teacher` costruisce e prova
macOS arm64/x64, Windows x64 (NSIS per utente), Ubuntu 22.04 (.deb).
Gli installer sono sperimentali, non firmati; nessuna pubblicazione Release.

```sh
python -m pytest -q desktop/teacher/sidecar/test_server.py backend/tests/test_shell_contract.py
node --test desktop/teacher/sidecar/server-wrapper.test.js
cargo test --locked --manifest-path desktop/teacher/src-tauri/Cargo.toml
bash desktop/teacher/scripts/check-lifecycle.sh /percorso/counselorbot-teacher
```

Il lifecycle script crea una cartella temporanea distinta e imposta
`COUNSELORBOT_TEST_DATA_DIR`, ammessa solo con `--headless`/`--smoke`.
Le porte sono scelte libere dal guscio, nessun dato di produzione coinvolto.
`COUNSELORBOT_REPORT_FILE` produce un report JSON; lo smoke conserva anche
`teacher-report.ready.json` con i PID prima dell'arresto. Si verificano
arresto normale, health, blocco interno dal frontend, riavvio del backend,
uccisione del guscio e pulizia dei residui. Non avviare questa prova su una
lezione reale. I processi di prova terminano durante lo script; se interrotto,
usare i PID del report e il lancio successivo sulla stessa cartella di prova.

## Limiti provvisori

- `COUNSELORBOT_BACKEND_MINIMAL=1` passa `--minimal` al sidecar e salta il
  lifespan: lo health verifica il processo e il contratto, **non** migrazioni,
  seed o disponibilità delle funzioni SQLite. È solo per lo smoke F1-02.
  Nell'avvio ordinario il lifespan resta obbligatorio.
- Il tunnel è spento se non configurato. `{"tunnel":{"mode":"quick"}}` in
  `config/shell.json` lo abilita solo per prove. Quando arriva il nuovo URL il
  backend riparte con `COUNSELORBOT_PUBLIC_ORIGIN` e il frontend con la nuova
  porta backend. Il quick tunnel dipende dalla rete Cloudflare e non è una
  soluzione per lezioni. La modalità nominativa è rifiutata fino a F1-10.
- Il rewrite generale Next congela ancora il backend durante la build:
  F1-03 deve renderlo dinamico prima di dichiarare l'app utilizzabile. La
  firma F1-19 e il blocco interno sono già integrati.
- Il pannello apre l'URL locale senza link docente monouso (F1-06).
  Portachiavi F1-08, QR F1-09, firma/updater/release F1-15 restano separati.

La PR resta in bozza: revisione coordinata dal Timoniere obbligatoria dopo
l'ultimo codice. Una revisione precedente non copre le modifiche successive.
