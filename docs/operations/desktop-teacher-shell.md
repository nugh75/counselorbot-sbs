# Guscio desktop docente — F1-02

Il guscio in `desktop/teacher` implementa il ciclo di vita previsto da
ADR-0002 §1–§2.6. Non è ancora un'app docente utilizzabile con dati reali:
profilo SQLite completo, autenticazione locale, API personali,
frontend a origine backend dinamica e tunnel per lezioni sono compiti distinti.
Identificatore immutabile: `org.ai4educ.counselorbot.teacher`.

Il pannello chiavi API e il portachiavi di sistema (F1-08) sono descritti in
`desktop-api-keys.md`: nessun valore nei file, accesso solo dal pannello nativo,
passaggio al solo backend attraverso l'ambiente del processo.

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
log sanitizzati, layout e versione, escludendo DB, credenziali e registri runtime.
Con P13 il testo libero viene omesso anche nei log storici: lo ZIP conserva
solo timestamp/livelli, nomi di file ammessi e metadati verificati. Funziona
anche a backend fermo; dettagli e limiti in
[`p13-logs-diagnostica.md`](../privacy/p13-logs-diagnostica.md).

## Build e prove isolate

Non richiede Docker. Su un runner con Python 3.12, Node 22, Rust stable e le
dipendenze di sistema Tauri:

```sh
bash desktop/teacher/scripts/build-backend.sh
bash desktop/teacher/scripts/build-frontend.sh
bash desktop/teacher/scripts/fetch-cloudflared.sh macos-arm64 desktop/teacher/src-tauri/cloudflared
cd desktop/teacher
npm ci
npx tauri build --bundles app,dmg   # nsis su Windows, deb su Linux
```

Sostituire piattaforma e bundle sui rispettivi sistemi. Gli script ricreano
solo le proprie cartelle di output, ignorate da Git. cloudflared è fissato a
2026.10.0 con SHA-256 degli asset. La CI `desktop-teacher` (F1-15) compila ed
esegue il packaging degli installer su una matrice a 4 runner:
- macOS DMG per Apple Silicon ARM64 (`macos-14`)
- macOS DMG per Intel (`macos-15-intel`)
- Windows NSIS installer `.exe` per utente (`windows-latest`)
- Linux `.deb` (`ubuntu-22.04`)

Per ogni installer vengono calcolati i checksum SHA-256 (`.sha256`) e caricati
insieme ai bundle negli artifact della build (`teacher-<platform>`). Gli installer
sono sperimentali e non firmati. Pubblicazione nella Release, `latest.json` e
firma restano da fare (resto di F1-15, updater F1-16).

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
  `config/shell.json` lo abilita per prove immediate («Prova subito»). Quando
  arriva il nuovo URL il backend riparte con `COUNSELORBOT_PUBLIC_ORIGIN` e il
  frontend con la nuova porta backend. La modalità nominativa con dominio
  personalizzato (F1-10) consente di configurare un dominio stabile
  (es. `https://counselor.tuascuola.it`) e un token Cloudflare
  (`CLOUDFLARE_TUNNEL_TOKEN` o salvato in `credentials/cloudflared_token`).
  Se il token nominativo non è impostato, il sistema ripiega in automatico
  e trasparentemente sul quick tunnel automatico (F1-09).
- Il rewrite generale Next congela ancora il backend durante la build:
  F1-03 deve renderlo dinamico prima di dichiarare l'app utilizzabile. La
  firma F1-19 e il blocco interno sono già integrati.
- Il pannello apre l'URL locale senza link docente monouso: il backend F1-06
  espone `POST /internal/local-auth/teacher-link` e `/local-auth/redeem`, ma
  la chiamata del guscio e la pagina `/accesso-locale` restano da collegare.
  F1-08 gestisce il portachiavi e F1-15 la matrice CI di packaging DMG/NSIS/deb
  con checksum SHA-256; Release, firma e updater (F1-16) restano separati.

La PR resta in bozza: revisione coordinata dal Timoniere obbligatoria dopo
l'ultimo codice. Una revisione precedente non copre le modifiche successive.
