# Guscio desktop docente — F1-02

Il guscio in `desktop/teacher` implementa il ciclo di vita previsto da
ADR-0002 §1–§2.6. Per installazione e uso del pannello vedere la [guida docente](desktop-teacher-guide.md);
per prove e limiti la [checklist F1-17](desktop-teacher-tests.md).
Non è ancora utilizzabile con dati reali: mancano il collegamento del link
monouso docente e le pagine di accesso/abbinamento. SQLite, origine backend
dinamica, portachiavi e tunnel sono implementati e verificati separatamente.
Identificatore immutabile: `org.ai4educ.counselorbot.teacher`.

> **Target non ancora consegnato.** ADR-0004 definisce layout/contratto 2 con PostgreSQL 15
> incorporato, import legacy e backup/restore. Questa pagina descrive sotto il codice corrente
> SQLite/layout 1; il contratto di migrazione e i gate sono in
> [Upgrade desktop a PostgreSQL](postgresql-desktop-upgrade.md). Non è ancora possibile usare il
> target o pubblicare una release PostgreSQL.

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
crash: fino a tre riavvii per sidecar in cinque minuti. Il ripristino dei backup è descritto in [sqlite-backups.md](sqlite-backups.md). stdout/stderr vanno direttamente nei file; rotazione
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
insieme ai bundle negli artifact della build (`teacher-<platform>`).
Gli aggiornamenti automatici (`latest.json` e `latest-beta.json`) e la firma
degli artefatti sono gestiti dall'updater F1-16.

```sh
python -m pytest -q desktop/teacher/sidecar/test_server.py backend/tests/test_shell_contract.py desktop/teacher/scripts/test_generate_update_manifest.py
node --test desktop/teacher/sidecar/server-wrapper.test.js
cargo test --locked --manifest-path desktop/teacher/src-tauri/Cargo.toml
bash desktop/teacher/scripts/check-lifecycle.sh --full /percorso/counselorbot-teacher
```

Con `--full` il lifecycle esegue il lifespan reale e controlla schema, seed e
integrità SQLite a primo avvio e dopo i riavvii; senza flag usa il backend
minimale per isolare il solo guscio. La CI esegue `--full` sui quattro runner.
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
  frontend con la nuova porta backend. Il frontend riceve a sua volta
  `COUNSELORBOT_PUBLIC_ORIGIN` nel proprio ambiente e la pubblica in
  `/runtime-config.js`: i link e i QR condivisi con gli studenti (iscrizione
  classe, link consiglio, URL di raccolta) usano l'origine pubblica del tunnel,
  non l'indirizzo locale del PC `127.0.0.1`. Fuori dal guscio la
  configurazione non esiste e la condivisione resta sull'origine del browser
  (produzione, portable). La modalità nominativa con dominio
  personalizzato (F1-10) consente di configurare un dominio stabile
  (es. `https://counselor.tuascuola.it`) e un token Cloudflare
  (`CLOUDFLARE_TUNNEL_TOKEN` o salvato in `credentials/cloudflared_token`).
  Se il token nominativo non è impostato, il sistema ripiega in automatico
  e trasparentemente sul quick tunnel automatico (F1-09).
- Il frontend usa l'origine backend a runtime (F1-03): F1-17 aggiunge il
  catch-all API Node per evitare il rewrite congelato nel manifest standalone.
  Gli handler specifici di streaming restano prioritari; gli upgrade WebSocket
  passano dal proxy prima del catch-all. La prova completa controlla `/api/health`
  e la raggiungibilità pubblica. Firma F1-19 e blocco interno sono integrati.
- Il pannello apre l'URL locale senza link docente monouso: il backend F1-06
  espone `POST /internal/local-auth/teacher-link` e `/local-auth/redeem`, ma
  la chiamata del guscio e la pagina `/accesso-locale` restano da collegare.
  F1-08 gestisce il portachiavi, F1-15 la matrice CI di packaging DMG/NSIS/deb
  con checksum SHA-256 e F1-16 l'updater con backup preventivo SQLite.

## Aggiornamenti automatici e backup SQLite preventivo (F1-16)

Il guscio desktop integra `tauri-plugin-updater` per la verifica e l'applicazione
degli aggiornamenti dell'applicazione docente.

### Canali di rilascio

Sono supportati due canali (memorizzati in `config/shell.json` alla voce `updater_channel`):
- `stable` (predefinito): punta a `https://github.com/nugh75/counselorbot-sbs/releases/latest/download/latest.json`.
- `beta`: punta a `https://github.com/nugh75/counselorbot-sbs/releases/download/beta/latest-beta.json`.

L'URL dell'endpoint può essere forzato a runtime tramite la variabile d'ambiente `COUNSELORBOT_UPDATER_URL`.

### Firma degli aggiornamenti e configurazione CI

Gli aggiornamenti distribuiti tramite l'updater richiedono la firma digitale Minisign.
Per generare la coppia di chiavi:

```sh
npx @tauri-apps/cli signer generate -w ~/.tauri/counselorbot.key
```

- **Chiave pubblica**: inserita nella configurazione `plugins.updater.pubkey` in `desktop/teacher/src-tauri/tauri.conf.json`.
- **Chiave privata**: deve essere conservata esclusivamente tra i **GitHub Secrets** del repository come `TAURI_SIGNING_PRIVATE_KEY` (ed eventuale password `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). **Non committare mai la chiave privata nel repository**.
- **Comportamento CI**: Se il secret `TAURI_SIGNING_PRIVATE_KEY` non è presente nel repository, la CI stampa un avviso chiaro nel log del job (`::warning::TAURI_SIGNING_PRIVATE_KEY non configurata...`) e compila gli installer saltando la firma e la generazione degli archivi dell'updater, senza fallire silenziosamente né bloccare la pipeline.
- **Manifest CI**: Il job `manifest` nel workflow `.github/workflows/desktop-teacher.yml` esegue `desktop/teacher/scripts/generate-update-manifest.py` raccogliendo i bundle firmati e generando `latest.json` e `latest-beta.json` come artifact. Il workflow non pubblica gli asset nelle Release: serve ancora il passaggio del responsabile del rilascio, insieme agli installer e agli archivi firmati. I soli artifact non rendono operativo l'updater.

### Backup automatico preventivo del database SQLite

Prima di scaricare o applicare qualsiasi aggiornamento, il guscio invoca `POST /internal/backup` verso il backend (oppure avvia il processo sidecar con `--backup` se il backend è fermo):
- Utilizza il meccanismo di snapshot online consistente e verificato con `PRAGMA integrity_check` definito in `backend/sqlite_backup.py` (F1-05j).
- Il backup viene salvato nella cartella `backups/` della cartella dati utente (`layout.json`).
- **Se il backup fallisce per qualsiasi motivo (es. disco pieno, fallimento integrity check), l'aggiornamento viene abortito immediatamente e non viene applicato alcun pacchetto.**

### Procedura di Rollback e Ripristino

In caso di problemi con una nuova versione dell'applicazione:

1. **Rollback dell'eseguibile dell'app**:
   - Scaricare l'installer della versione precedente dalle GitHub Releases (file `.dmg` su macOS, installer `.exe` su Windows, pacchetto `.deb` su Linux).
   - Reinstallare la versione precedente dell'applicazione sovrascrivendo l'applicazione corrente.

2. **Ripristino del database SQLite (se migrato o corrotto)**:
   - Chiudere completamente l'applicazione CounselorBot Docente.
   - Individuare l'ultimo backup valido nella cartella `backups/` del profilo utente:
     - Linux: `~/.local/share/org.ai4educ.counselorbot.teacher/backups/`
     - macOS: `~/Library/Application Support/org.ai4educ.counselorbot.teacher/backups/`
     - Windows: `%LOCALAPPDATA%\org.ai4educ.counselorbot.teacher\backups\`
   - I file di backup hanno formato `sqlite-<identificatore>-<dataUTC>-<uuid>.sqlite3`.
   - Utilizzare la procedura di ripristino verificata offline descritta in [`sqlite-backups.md`](sqlite-backups.md):
     ```python
     from backend.sqlite_backup import restore_backup
     restore_backup("/percorso/.../backups/sqlite-....sqlite3", database_stopped=True)
     ```
   - Impostare `DATABASE_URL` sul database del profilo e `COUNSELORBOT_BACKUP_DIR` sulla sua cartella `backups/`. Conservare anche file caricati e chiavi separatamente; non cancellare manualmente WAL/SHM.
   - Riavviare CounselorBot Docente.
