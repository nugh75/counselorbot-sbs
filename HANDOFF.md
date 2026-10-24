# Handoff 24 ottobre 2026: F1-05j backup e ripristino SQLite

Agente `s49-f105j-codex`, task Diario `b2fa405f-2e23-48e2-b020-878673b39024`,
branch `feature/f1-05j-sqlite-backup`.

- **Obiettivo**: backup online consistente del database SQLite desktop,
  integrità verificata, retention e ripristino con copia preventiva.
- **Modifiche**: `backend/sqlite_backup.py`, helper `create_backup` e
  `restore_backup` basati su `sqlite3.Connection.backup`; snapshot autonomi in
  `DATA_DIR/backups`, `integrity_check` obbligatorio, pubblicazione atomica,
  7 copie per database (N configurabile), pulizia dei temporanei e timeout.
  Restore solo dopo chiusura di richieste/job/connessioni (`database_stopped=True`),
  staging verificato e backup preventivo; sicurezza conservata anche con orologio
  arretrato. PostgreSQL: `None` senza accessi SQLite/filesystem.
- **Test eseguiti**: comando richiesto con Python 3.11.9, 38 pass; con
  `TEST_DB=sqlite`, backup + motore + db_compat + schema, 74 pass. Coperti commit
  concorrente tra passi nativi, WAL/non committati, integrità/corruzione,
  retention concorrente, timeout, restore e guasti. SQL portability,
  guidance-refresh/check e diff whitespace verdi.
- **Documentazione**: `docs/operations/sqlite-backups.md`, CONTEXT, funzionalità,
  manifest guidance e handoff vivo del branch. Guida/screenshot sei lingue
  rivisti, nessun controllo UI cambiato. Collegamento updater ancora F1-16.
- **Limiti**: solo database (non upload/chiavi); restore richiede DB corrente
  verificabile e tutti gli accessi fermi. `DATA_DIR/backups` è oggi
  `<radice>/uploads/backups`, distinto dal layout futuro del guscio.
- Commit feature `88300719`, pushato; [PR #552](https://github.com/nugh75/counselorbot-sbs/pull/552)
  aperta verso main e collegata al progetto CounselorBot. Diario: task fatto,
  URL PR nel body; notifica Timoniere inviata, ricezione non confermata.
- Rebuild Docker finale non completato; nessun ulteriore rebuild su richiesta
  dell'utente. Nessun build o processo dev ancora attivo, nessun deploy o sudo.
  Bug temporanei SHM
  `c7b07a14-1020-42d6-8184-4affa50e9bcf` registrato e risolto nel Diario.

# Handoff 24 ottobre 2026: Privacy Layer P3 — spike motore PII

Agente `s46-p3-opus` (Claude Opus 5.5), task Diario
`34e1ad39-47fa-4f15-a9ef-caf1cba26393`, branch `feature/privacy-p3-pii-engine-spike`, issue #548.

- **Obiettivo**: misurare regole, regole + gazetteer, Ollama NER e GLiNER ONNX sul corpus P2 e scegliere il motore di P4.
- **Modifiche**: `scripts/spikes/p3_pii_engines.py` (gazetteer generico e «roster», unione con regole autoritative,
  adattatore Ollama con `probe()`), `p3_gliner_onnx.py` (GLiNER con solo onnxruntime + tokenizers, identico a
  `gliner==0.2.29`), `p3_pii_benchmark.py` (sottoprocesso per motore: P/R/F1, copertura, «mascherati», latenza, RSS,
  disco), `p3_holdout.py` (33 frasi a mano, nomi fuori dal generatore), `p3_onnx_freeze_probe.py` +
  `.github/workflows/spike-pii-engine.yml` (PyInstaller su macOS arm64, Windows x64, Linux x64). Report
  `docs/privacy/spikes/p3-pii-engine.md`.
- **Esito**: regole + gazetteer 0,84 di richiamo sul corpus ma 0,31 sull'holdout (sovradattate). Con GLiNER
  `gliner_multi_pii-v1` fp16 (568 MB, ~150 ms/frase su M1, RSS ~750 MB) persone mascherate 0,98 corpus / 1,00 holdout.
  L'int8 pubblicato e la quantizzazione dinamica sono rotti (richiamo 0,01). `knowledgator/gliner-pii-base-v1.0`
  (196 MB, 18 ms) come ripiego leggero. Mac solo Apple Silicon (decisione utente): onnxruntime 1.31 non ha ruote macOS
  x86_64. Ollama non installato qui: saltato con motivo, banco pronto.
- **Da fare (P4)**: export fp16 proprio dai pesi `urchade` (Apache-2.0; l'export `onnx-community` non ha licenza),
  regola di unione da precisare in 02 §3.2, modello scaricato al primo uso con hash, togliere o separare la build
  `macos-15-intel` di `desktop-teacher.yml`, estendere regole su telefono/CF.
- **Test eseguiti**: `TEST_DB=sqlite` (Python 3.11.9) `test_privacy_p3_engine_spike.py` + `test_privacy_corpus_benchmark.py`
  + `test_privacy_core.py` 198 pass, 3 skip (pesi reali); con `P3_MODELS_DIR` i 3 test sui pesi passano. Freeze PyInstaller
  locale macOS arm64 ok. `make guidance-check` verde. Test indipendenti dal DB: Postgres non eseguito.
  Nessun deploy, sudo, rebuild Docker o processo dev attivo.

# Handoff 24 ottobre 2026: F1-03 frontend senza URL fissi al build

Agente `s44-f103-opus` (Claude Opus 5.5), task Diario
`afa375f0-73a3-4aec-bc34-da73253cdde4`, branch `feature/f1-03-runtime-app-url`, issue #549.

- Obiettivo: stessa build standalone del frontend per Docker, portabile e
  desktop; nessun `NEXT_PUBLIC_*` compilato nel bundle.
- `frontend/src/lib/runtime-config.ts` + rotta `GET /runtime-config.js`
  (`force-dynamic`, `no-store`): il server Next legge all'avvio
  `COUNSELORBOT_APP_URL`, `COUNSELORBOT_AUTH_URL`, `COUNSELORBOT_PORTAL_URL`,
  `COUNSELORBOT_MANAGER_URL`, `COUNSELORBOT_PROJECT_ID` e li pubblica in
  `window.__COUNSELORBOT_CONFIG__` (`<` escapato). Il layout lo carica con
  `next/script` `beforeInteractive`, prima dell'idratazione.
- `lib/auth.ts`: le costanti di modulo `AI4AUTH_*`/`AI4EDUC_*` diventano
  `getAuthUrls()` calcolato a ogni uso; Header, ConfigForm, piani di
  somministrazione e contatti ricerca (`LANDING_BASE` → `authBase`) aggiornati.
  Valori assenti ⇒ default ai4educ di `createAuthUrls` (invariato per sbs).
- `frontend/Dockerfile`: tolti ARG/ENV `NEXT_PUBLIC_*` (anche `NEXT_PUBLIC_API_URL`,
  già inutilizzato: le API sono relative `/api`). Compose portabile e dev:
  le stesse URL passano da `build.args` a `environment` con i nomi
  `COUNSELORBOT_*`; `frontend/.env.development` usa `COUNSELORBOT_APP_URL`.
- Docs: `portable-installation.md` (cambio URL = ricreare il container, niente
  build), `desktop-apps-plan.md` §3.2, `.env.example`, funzionalità + guidance-refresh.
- Test: `src/lib/runtime-config.test.ts` (lettura env, script servito e riletto,
  escape `</script>`, default SSR) + `auth-urls.test.ts`: 8 pass (Node 22);
  `tsc`, eslint sui file toccati (solo warning preesistenti), `npm run build`,
  `make guidance-check`. `npm run lint` si ferma su `i18n:check` per
  `components/teacher/ClassCouncilTab.tsx`, file non toccato (preesistente).
- Deploy portabile: serve `up -d --build --no-deps counselorbot-frontend`
  (Dockerfile e compose cambiati). Nessun sudo. Nessun deploy fatto qui.
- Desktop (F1-02): il guscio può passare `COUNSELORBOT_APP_URL` (URL del
  tunnel) all'avvio del sidecar frontend; con `AUTH_PROVIDER=local` (F1-06)
  il login ai4auth non serve.

# Handoff 24 ottobre 2026: F1-05g compatibilità SQLite — aggiornamenti dello schema

Agente `s45-f105g-opus` (Claude Opus 5.5), task Diario
`39a7192c-f861-4529-8013-a79c9dad867e`, branch `feature/f1-05g-sqlite-schema-updates`.

- Obiettivo: ADR-0003 §3.3-§3.4 — cambiare vincoli/nullabilità/tipi su un file
  SQLite esistente e sincronizzare i CHECK all'avvio.
- `backend/sqlite_schema.py`: `sqlite_rebuild_table` (Alembic `batch_alter_table`
  come libreria, `foreign_keys` spente durante la copia, `foreign_key_check` prima
  del commit, indici `index=True` ricreati con `copy_from`) e
  `sync_sqlite_check_constraints`, chiamata da `main.py` dopo le migrazioni.
  Colonne diverse dal modello ⇒ `RuntimeError` senza modifiche.
- Dipendenza `alembic>=1.13,<2` (requirements, `--collect-submodules alembic`
  nel build PyInstaller docente: non ricostruito qui).
- Test: `backend/tests/test_sqlite_schema_updates.py` (fixture `previous_sqlite`
  con CHECK vecchio di `class_path_steps`), 7 pass; con `TEST_DB=sqlite` anche
  create_all/db_compat/runtime_sql/local_auth, 40 pass; doppio avvio uvicorn su
  SQLite 200/200; SQL portability e guidance verdi. Postgres: CI dual-db.
- Documentazione: `docs/operations/sqlite-schema-updates.md`, CONTEXT, funzionalità.
- Limiti: indici di file pre-F1-05f cambiano solo se la tabella si ricostruisce
  per un CHECK. Nessun rebuild Docker, deploy, sudo o processo dev.

# Handoff 24 ottobre 2026: Privacy Layer P2 — corpus sintetico italiano e benchmark PII

Agente `s43-p2-opus` (Claude Opus 5.5), task Diario
`e7888984-0a59-4804-a2b9-f329060eff7e`, branch `feature/privacy-p2-italian-corpus`, issue #544, commit `694cdb36` (feat) e `adb241bf` (docs).

- `backend/privacy/corpus/generator.py`: generatore deterministico (seme fisso)
  di `it_school_v1.jsonl`, 613 frasi annotate (offset, `PIICategory`,
  segnaposto atteso `[PERSONA_1]`, testo pseudonimizzato atteso, tag). Nomi
  inventati per combinazione casuale, CF con check char corretto, IBAN mod-97,
  domini `example`, IP TEST-NET. Copre registro, note disciplinari, relazioni,
  DSA/BES/Legge 104, art. 9, contatti, anagrafica, scuole, social; casi
  ambigui («Rosa», «Sole», «Volta»), negativi, indiretti, typo, gergo.
- `backend/privacy/corpus/benchmark.py`: `evaluate(detector, records)` per
  qualunque `PIIDetector` — P/R/F1 per categoria (esatta e per sovrapposizione),
  copertura indipendente dalla categoria, recall per tag, falsi negativi per id,
  latenza; report senza testo del corpus. `RulesBaselineDetector` adatta
  `backend/pii.py` (che non espone offset) come riferimento P3.
- `scripts/privacy_eval.py`: CLI con report JSON e `--summary`.
- Baseline regole: email 0,98, IBAN/IP/URL/social 1,00, CF 0,73, telefono 0,63,
  salute 0,55, persone/scuole/luoghi/indirizzi 0; copertura 0,22; ≈ 0,06 ms/frase.
  Fissate come soglie di non regressione in `backend/tests/test_privacy_corpus_benchmark.py`.
- Scostamento dal piano: corpus in `backend/privacy/corpus/` (come da task) invece
  di `backend/tests/privacy_corpus/`; il piano è aggiornato. Entra nell'immagine
  Docker tramite il COPY esistente (~270 KB, nessun effetto a runtime).
- Verifiche: nuova suite 12 pass con `TEST_DB=sqlite` e `TEST_DB=postgres`
  (Python 3.11.9), `test_privacy_core.py` 170 pass, SQL portability, guidance
  refresh/check, diff-check. Nessun rebuild Docker, deploy, sudo o processo dev.
- Da fare: revisione umana campionaria delle etichette prima di P3.

# Handoff 24 ottobre 2026: F1-05f compatibilità SQLite — SQL a runtime

Agenti `s39-f105f-sol` (implementazione) e `s42-f105f-opus` (finalizzazione), task Diario
`002aa71d-d456-40b9-9926-f4450cf68c83`, branch `feature/f1-05f-sqlite-runtime-sql`.

- `backend/db_compat.py`: `dialect_insert(bind, table)` sceglie l'INSERT del dialetto (upsert portabili);
  usato da obiettivi, API personali, collegamenti ChatGPT e segnalibri forum.
- Costi admin: periodi settimana/mese/anno con `strftime` su SQLite (settimane ISO), funzione nativa su Postgres.
- `backend/models.py`: indici parziali booking con `sqlite_where` oltre a `postgresql_where` (solo `status = 'active'`).
- Fix collaterali: ripristinati `add_column_if_missing` e import `DateTime`; test UTC preserva le colonne naive LocalSession.
- Doc: `docs/operations/runtime-sql-compatibility.md`, `CONTEXT.md`, funzionalità + guidance-refresh.
- Limiti: file SQLite sperimentali creati prima non ricevono i nuovi indici (serve migrazione separata);
  le altre chiamate forum a `statement_timestamp` restano da rendere portabili.
- Verifiche: `TEST_DB=sqlite pytest test_sqlite_create_all test_runtime_sql_compat test_db_compat` 13 pass,
  `test_forum -k read_marker_upsert` 1 pass, `make guidance-check` e `check-sql-portability.py` verdi.
  Postgres affidato alla CI dual-db.
- Nessun deploy, sudo, rebuild Docker o processo dev attivo.

# Handoff 24 ottobre 2026: F1-13 abbinamento studenti desktop (ADR-0002 §4)

Agente `s40-f113-opus` (Claude Opus 5.5), task Diario
`56bfc165-1e54-4cb6-8c6f-88c8414f6c00`, branch `feature/f1-13-student-pairing`.

- **Main rotto, riparato a parte (PR #539, issue #538)**: il merge F1-05e
  (a8f7badb) aveva tolto `add_column_if_missing` da `backend/db_compat.py` e
  l'import `DateTime` usato da `LocalSession`; il backend non si importava.
  Helper ripristinato alla lettera; `LocalSession` passa a `UTCDateTime` e
  `local_auth._now()` a UTC aware (il test UTCDateTime vieta `DateTime` grezzo);
  `backend.db_compat` ammesso nel grafo di import del forum; 55 voci tolte dal
  ratchet SQLite (ora passano in CI). La fix è unita in questo branch con un
  merge: le PR si possono unire in qualsiasi ordine.
- `backend/local_pairing.py`: rotte `/local-auth/pair`, `recover`, `devices`,
  `devices/{id}/approve`, `DELETE devices/{id}`, `students/{username}/personal-code`,
  `classes/{group_id}/pairing-code` come da tabella §4.2; `logout` in
  `local_auth.py`. Tabelle nuove portabili `class_pairing_codes` e
  `local_students` (UTCDateTime, create da `create_all`, nessuna migrazione).
  Chiave di classe 32 byte (solo hash, link `COUNSELORBOT_PUBLIC_ORIGIN/unisciti#k=`),
  7 giorni, nuovo codice revoca i precedenti; codice personale 12 base32 (hash),
  accettato con spazi/trattini/minuscole; pseudonimo con suffisso `Luna 2`, mai
  errore; abbinamento sotto `xact_lock` per classe (usi e nomi senza gare).
  Stessa risposta 401 per chiave inesistente/scaduta/revocata/esaurita/classe
  disattivata. Limiti in memoria §4.3 con `Retry-After`.
- Scelta: studente `pending` ⇒ `identity_from_request` restituisce anonimo (non
  un'identità con username e `authenticated=false`), perché 78 rotte a identità
  facoltativa potrebbero usare lo username. Approvare un dispositivo attiva lo
  studente, quindi tutte le sue sessioni. Rotte docente 403 senza sessione
  admin da origine `local`.
- Da fare: pagine `/unisciti` (studente) e dispositivi/QR (docente), chiamata
  del guscio; `group_id` docente non filtrato per proprietario (sul PC il
  docente è l'unico admin).
- Verifiche: `TEST_DB=sqlite` `test_local_pairing.py` + `test_local_auth.py`
  **53 pass** (venv Python 3.12 di `feature-f1-02-tauri-shell`). Postgres non
  eseguito in locale: due Postgres di test di altri agenti già attivi (regola
  una istanza alla volta), demandato alla CI `backend-db.yml`. SQL portability
  (nessuna nuova), ruff F, guidance-check, version-check, diff-check verdi.
- Nessun deploy, sudo, rebuild Docker (il Dockerfile copia già `backend/*.py`)
  o processo dev rimasto attivo.

# Handoff 24 ottobre 2026: F1-05e compatibilità SQLite — date e ore UTC con UTCDateTime

Agente `s34-f105e-agy` (Gemini 3.8 Flash High), task Diario
`8bbe0bd0-48cb-4262-ad93-59501b92dc1f`, branch `feature/f1-05e-utc-datetime`.

- `backend/db_compat.py`: definita classe `UTCDateTime(TypeDecorator)` con `impl = DateTime(timezone=True)` e `cache_ok = True`.
  - `process_bind_param`: converte datetime aware in UTC, assume UTC per datetime naive, None invariato; gestisce anche stringhe ISO.
  - `process_result_value`: garantisce che i datetime restituiti siano sempre aware con `timezone.utc` (se naive assegna UTC; se aware converte in UTC), None invariato.
  - Su Postgres compila come `TIMESTAMP WITH TIME ZONE` (identico a `DateTime(timezone=True)`), garantendo nessuna modifica allo schema e nessuna migrazione per l'ambiente di produzione.
- `backend/models.py`: sostituite tutte le 161 dichiarazioni di colonna `DateTime(timezone=True)` con `UTCDateTime`, importato da `.db_compat`.
- `scripts/sql-portability-exceptions.txt`: rimossa l'eccezione `backend/models.py datetime-timezone 161`, totale eccezioni sceso da 201 a 40. `python3 scripts/check-sql-portability.py` passa con 0 violazioni.
- `backend/tests/test_utc_datetime.py`: suite mirata che verifica:
  a) Roundtrip di valori aware e naive sia su SQLite sia su Postgres (`artifact_session()` e test dedicato): il valore riletto è sempre aware in UTC.
  b) Confronto e sottrazione con `datetime.now(timezone.utc)` su SQLite senza TypeError, con verifica di controllo del fallimento su `DateTime(timezone=True)` nativo di SQLite.
  c) Verifica contrattuale della DDL compilata per il dialetto postgresql (identica a prima, `TIMESTAMP WITH TIME ZONE`) e su tutti i modelli di `Base.metadata.tables`.
- Verifiche eseguite:
  - `TEST_DB=sqlite python3 -m pytest backend/tests/test_utc_datetime.py -q` (6 passed, 1 skipped per postgres_only).
  - `make guidance-check` e `make version-check` (verdi).
  - `python3 scripts/check-sql-portability.py` (ok, 40 note, 0 nuove).
- Nessun deploy, sudo, rebuild Docker o processi dev rimasti attivi.

# Handoff 24 ottobre 2026: Privacy Layer P1 — s38-p1-sol

Task Diario `1cc50c38-2dee-4c46-ad0a-6148018efbc7`, branch
`feature/privacy-p1-core-contracts`, base `da0fff7c` (main aggiornato).

- Creati `backend/privacy/{__init__,types,errors,policy}.py`: enum, dataclass
  con diagnostica senza valori, protocolli, codici i18n fissi, contratti di
  rilevamento/pseudonimizzazione/ripristino, crittografia, autorizzazione,
  audit e gateway. Operazioni non configurate fail-closed; nessun flusso
  applicativo esistente migrato. Le mappe sono oggetti backend, non ancora
  persistiti/cifrati: P4/P5. Dettagli API e limiti in `docs/privacy/README.md`.
- Policy: finalità non configurate o `undefined` disabilitate, consenso quando
  richiesto, target classificati per IP risolto/allowlist e mai per provider,
  media esterni bloccati, filtro per testi esterni e finalità locali sensibili.
  Il piano di uscita non autorizza l'invio: `AIGateway.send` blocca sempre.
- Errori senza argomenti originali o note libere; contesto implicito nascosto
  nei traceback standard. Le integrazioni devono usare `raise ... from None`
  e non registrare frame locals, attributi, `vars` o `asdict`.
- Verifiche: `test_privacy_core.py` **170 pass** con `TEST_DB=postgres` e
  **170 pass** con `TEST_DB=sqlite`, sia sul Mac (Python 3.11.9 selezionato
  con `PYENV_VERSION=3.11.9 python3 -m pytest`) sia nell'immagine Docker
  Python 3.10 senza rete. Suite deliberatamente senza accessi DB: nessuna
  verifica di persistenza reale richiesta da P1. Tre test del gate guida
  passati; SQL portability (201 occorrenze note, nessuna nuova), guidance
  refresh/check anche contro `origin/main`, version-check e diff-check verdi.
- Dockerfile: aggiunto `COPY backend/privacy/ backend/privacy/`; immagine
  isolata `counselorbot-privacy-p1-core-contracts:local` ricostruita e testata
  con `docker run --rm --network none`, senza volumi né dati reali.
- Guide funzionali, CONTEXT e manifest aggiornati; nessuna modifica UI o
  screenshot necessaria. Nessun deploy, sudo o processo dev rimasto attivo.
  PR in bozza per la revisione del nucleo privacy; nessun merge dell'agente.

# Handoff 24 ottobre 2026: F1-05d lock transazionali SQLite/Postgres

Agente `s35-f105d-sol` (Codex Sol high), task Diario
`9c6c590e-2228-4481-aeb6-a91bb75bb58b`, branch `feature/f1-05d-sqlite-locks`.

- `backend/db_compat.py`: `xact_lock(db, *parts)` con Blake2b signed 64-bit
  su Postgres; registro debole di lock thread su SQLite, riacquisizione nella
  stessa transazione, rilascio su commit/rollback/close e conservazione sui
  savepoint. Controllo multi-worker all'avvio del motore SQLite e nell'helper
  (`WEB_CONCURRENCY`, `UVICORN_WORKERS`, CLI e `GUNICORN_CMD_ARGS`).
- Sostituite le 14 chiamate applicative, preservando la chiave condivisa tra
  workspace e timeline. Migrazioni legacy, lock di sessione dell'avvio e
  Prompt Lab restano nei rispettivi rami Postgres. Eccezioni SQL: 201 → 185.
- Follow-up CI PR #533: rimosso l’import `sqlalchemy.text` inutilizzato da
  `routes/document_retrieval.py`; `ruff check --select F` sul file verde.
- Contratto operativo: `docs/operations/transaction-locks.md`; CONTEXT e
  documentazione funzionalità aggiornati, stato della Guida rigenerato.
- Verifiche: helper 33 pass con Postgres 15 effimero (29 casi SQLite/unitari
  e 4 prove reali Postgres); senza Postgres 29 pass, 4 skip. Suite applicativa
  mirata Postgres: 227 pass. SQLite: 244 pass, 1 fallimento già noto, 4 skip;
  percorsi collegati: 138 pass, 35 fallimenti già noti, 6 skip. Nessun nuovo
  fallimento nei gruppi; ulteriori percorsi: 29 pass e 23 fallimenti noti; rimosse 81 eccezioni SQLite confermate passanti
  (578 → 497). Suite completa demandata alla CI dual-DB.
- Avvio SQLite due volte sullo stesso file: `/health` 200 entrambe; primo
  tentativo con timeout troppo breve, ripetuto con successo. I test applicativi
  richiedono la venv Python 3.12; Python 3.9 di sistema non importa i modelli
  esistenti con annotazioni `str | None`. `PYTHONPATH=.` serve usando il binario
  `pytest` del Mac; `python -m pytest` include già il checkout.
- Rebuild `counselorbot-f105d-backend` completato, isolato dai container in uso.
  Helper nell’immagine finale: 29 pass, 4 skip.
  Portabilità SQL, guidance-check, version-check e diff-check verdi.
  Nessun deploy o sudo; server di prova e Postgres effimero arrestati.)

# Handoff 24 ottobre 2026: F1-09 Quick tunnel automatico

Agente `s37-f109-agy` (Gemini 3.8 Flash High), task Diario
`a3373526-6402-4adf-8a5b-ee0a0a71986a`, branch `feature/f1-09-quick-tunnel`, Issue #211.

- **Supervisor & Sidecar (`desktop/teacher/src-tauri/src/supervisor.rs`)**:
  - Aggiunti comandi e gestione on-demand `start_quick_tunnel` e `stop_quick_tunnel`.
  - Estrazione URL pubblico dai log di `cloudflared` con matching regex `https://[a-zA-Z0-9-]+\.trycloudflare\.com` ed esclusione endpoint interno `api.trycloudflare.com`.
  - Supervisione del processo `cloudflared` tramite lifeline/Job Object senza processi orfani all'arresto on-demand o alla chiusura del guscio.
  - Sincronizzazione automatica di `COUNSELORBOT_PUBLIC_ORIGIN` sul backend tramite riavvio controllato quando l'URL cambia o viene disattivato (ADR-0002 §2.1).
  - Tracciamento `tunnel_mode` nello stato pubblicato per aggiornamento reattivo dell'interfaccia.
- **App Tauri (`desktop/teacher/src-tauri/src/app.rs`)**:
  - Registrati i comandi `start_quick_tunnel`, `stop_quick_tunnel`, `open_tunnel_in_browser`.
  - Dimensioni finestra aggiornate a 580x680 per accogliere card tunnel e QR code.
- **Pannello Docente (`desktop/teacher/src/`)**:
  - `qr.js`: generatore compatto e autosufficiente (basato su Nayuki / licenza MIT) che produce SVG vettoriali ad alta definizione senza dipendenze o CDN esterne.
  - `qr.test.js`: test unitari Node per la corretta generazione di codici QR e markup SVG per domini trycloudflare.
  - `index.html` e `panel.css`: card dedicata Quick Tunnel con badge di stato, banner obbligatorio «Solo per prove («Prova subito»)» (ADR-0001 §2: temporaneo e rate-limitato, mai per lezioni), visualizzazione link e QR code per scansione rapida dagli studenti, pulsanti di avvio, arresto, apertura nel browser e copia link negli appunti.
  - `panel.js`: integrazione reattiva con Tauri IPC, rendering stato e QR code, feedback utente.
- **CI (`.github/workflows/desktop-teacher.yml`)**:
  - Inclusa esecuzione di `desktop/teacher/src/qr.test.js` nei test Node.
- **Verifiche eseguite**:
  - Rust test suite `desktop/teacher/src-tauri`: 18 test passati (inclusi ciclo di vita on-demand e regex URL).
  - Rust formatting: `cargo fmt --check` verde.
  - Node test suite: 6 test passati (`server-wrapper.test.js` + `qr.test.js`).
  - Verifiche guida e versione: `make version-check` e `make guidance-check` verdi.
  - `git diff --check` verde.)

# Handoff 24 ottobre 2026: F1-05c colonne idempotenti SQLite

Agente `s32-f105c-opus` (Claude Opus 5.5), task Diario
`1b0449ce-6d15-4ed7-892a-f94c6b157232`, branch `feature/f1-05c-sqlite-columns`.

- `backend/db_compat.py`: `add_column_if_missing(conn, table, column, type_expr, default=None)`
  con `sqlalchemy.inspect`; su Postgres resta `IF NOT EXISTS` (worker concorrenti).
- Sostituite tutte le 49 righe `ADD COLUMN IF NOT EXISTS`: avvio (`personal_api`,
  `counselor_identity`, `main`), `prompt_lab/provision` e le 20 migrazioni legacy
  (ancora solo Postgres: su SQLite gli upgrade restano a F1-05g). Default `'[]'`
  senza `::json` anche in `main.py` (`teacher_assignments.attachments`).
- Rimossa l'eccezione F1-05c: `scripts/check-sqlite-startup-log.py`, il suo test e
  il ramo della CI. Eccezioni di portabilità da 213 a 201.
- Verifiche locali (Python 3.12 della venv di `feature-f1-02-tauri-shell`):
  avvio due volte sullo stesso file SQLite nuovo, `/health` 200 entrambe, nessun
  errore nei log; SQLite mirati `test_db_compat`, `test_dual_db_checks`,
  `test_database_engine` 43 pass; `test_personal_connections` solo i 14 fallimenti
  noti (`hashtext`, F1-05d). Postgres 15 effimero: avvio riuscito; riavvio dopo
  aver eliminato a mano 4 colonne: `/health` 200, colonne ricreate con default.
  `test_db_compat` su Postgres: 1 pass, 1 fail non diagnosticato perché il disco
  della VM Docker si è riempito (`initdb: No space left on device`); suite
  Postgres mirata interrotta per durata (>20 min). Postgres demandato alla CI
  `tests (postgres)`. guidance-check e version-check verdi.
- Nessun deploy, sudo, rebuild Docker o processo dev rimasto attivo.

# Handoff 24 ottobre 2026: Fase 1 desktop integrata in main (F1-05a, F1-05b, F1-02)

Agente `s31-merge-opus` (Claude Opus 5.5), task Diario
`0ebb940d-c6c7-451b-8fa5-7bf7b210231e`, branch `chore/merge-desktop-phase1`.
Revisione cross-modello derogata dall'utente per quota (task Diario
`a24cf609-898a-4351-9980-1ef183fe49bb`).

- Merge su `main` con merge commit: #523 F1-02 guscio Tauri (`fb9e38ec`),
  #522 F1-05a fixture e CI dual-DB (`68ecc7c6`), #519 F1-05b motore SQLite
  (`0c1b40a9`). Tutte e tre `MERGED`, verificato con `gh pr view` e
  `git log origin/main`. Base `main` attuale: `0c1b40a9`.
- #522 e #523 risultavano già merged all'avvio del task; dopo di loro #519 era
  `CONFLICTING` solo su `HANDOFF.md` e `docs/operations/platform-guidance-state.json`.
  Risolto con merge ordinario di `origin/main` nel branch (`8c9a2d56`, nessun
  rebase né force push): conservate entrambe le sezioni di handoff, stato della
  guida rigenerato con `make guidance-refresh`, `make guidance-check` verde.
- CI sul nuovo head di #519 verde 12/12: engine su ubuntu-22.04, macos-latest,
  macos-15-intel, windows-latest; tests (postgres), tests (sqlite) e
  startup (sqlite) del controllo dual-DB (nessun fallimento fuori baseline);
  portability, offline-retrieval, documentation. #523 era verde sui quattro
  runner build (Ubuntu, macOS arm64, macOS x64, Windows NSIS).
- Nessun test locale, build Docker, deploy, sudo o processo dev: solo
  integrazione e documentazione.

## Prossimi passi (Fase 1)

Ordine da `docs/architecture/desktop-apps-plan.md`:

1. **F1-05c** compatibilità DDL SQLite: `add_column_if_missing` in
   `db_compat.py` al posto delle 49 righe `ADD COLUMN IF NOT EXISTS`; avvio su
   SQLite nuovo due volte sullo stesso file e su Postgres senza errori. Toglie
   l'eccezione F1-05c che oggi tiene verde `startup (sqlite)`.
2. **F1-06** fornitore di identità locale (link monouso / QR del docente,
   `local_sessions`, sessione docente rifiutata dal tunnel): parallelizzabile
   con F1-05c, F1-05d, F1-05e.
3. **F1-13** abbinamento studenti: dipende da F1-06 **e** da F1-09, quindi va
   avviato solo dopo entrambi.

# Handoff 24 ottobre 2026: integrazione PR #519 dopo #521

Agente `s28-pr519-sol` (Codex), task Diario
`2b7fde5b-8f62-4469-bb22-1a084d4b786b`, branch
`feature/f1-05b-sqlite-engine`, PR <https://github.com/nugh75/counselorbot-sbs/pull/519>.

- Merge ordinario di `origin/main` (`b315fa7f`, PR #521) sul precedente head
  `5daa70e4`: nessun rebase, conservati tutti i commit esistenti.
- Risolto il conflitto nella guida conservando entrambi i paragrafi, motore
  SQLite e origine firmata delle richieste. Rigenerato
  `docs/operations/platform-guidance-state.json` con `make guidance-refresh`.
  Nessuna modifica applicativa aggiuntiva rispetto ai due rami.
- Verifiche locali: 42 test backend motore/origine richiesta; 12 test frontend
  origine/proxy (Node 22.23.3); 3 test del controllo documentazione; Ruff
  `--select F` sui moduli e test del motore/origine e sullo script traduzioni;
  `make guidance-check`, controllo con `--base origin/main`, `make version-check`
  e `git diff --check`. Tutto passato. Python locale 3.9.19 / SQLite 3.51.0;
  Python 3.12 sui quattro OS è demandato ai check remoti del nuovo head.
- PR da mantenere **DRAFT**: la revisione precedente riguarda un head vecchio;
  il Timoniere deve applicare il gate di revisione al nuovo head prima del merge.
  Il solo push non prova l'esito della recovery: verificare head, base,
  `mergeable` e check freschi su GitHub. Nessuna ricevuta recovery registrata.
- Nessun nuovo bug osservato, nessuna duplicazione del commento F1-05h su #518.
  Nessuna build frontend/Docker locale, deploy, sudo o modifica a dati reali.
  Nessun processo dev avviato. Suite Postgres e browser live non eseguiti:
  integrazione documentale, test mirati senza rete e dati SQLite effimeri.

# Handoff F1-05a — 24 ottobre 2026 (s27-f105a-sol)

Branch `chore/f1-05a-dual-db-ci`, PR **DRAFT #522**, issue #520.
Subentro Codex da head `5feafc41`; commit preesistenti preservati.
Provenienza artifact, numeri iniziali, estensione proposta della baseline
Postgres e procedura di verifica: `docs/operations/dual-db-ci.md`.
Le due run complete iniziali coincidono nei node ID; la run cancellata è esclusa.
Rimossi dalla baseline i tre fallimenti da dipendenze native mancanti.
CI su codice `ddbdb18c`: run PR `40071399643` e dispatch `40071395812` verdi.
Postgres PR: 5046 pass, 45 fail, 10 skip; SQLite PR: 4043 pass, 341 fail,
237 error (24 moduli non importabili), 10 skip. Anche 23 subtest passati.
Node ID identici nelle repliche: 45 Postgres, 578 SQLite, zero voci nuove o
non più fallenti. Il controllo sul codice pre-F1-05a `e3863061` riproduce
gli stessi 45 fallimenti Postgres (5016 pass). Dopo questi test cambiano solo
documentazione e handoff, senza modifiche al codice o alle configurazioni CI.
Test locali del controllo: 15 pass; portabilità: 213 occorrenze note, zero nuove;
guidance-check e version-check passano. Nessun Docker, dev process, merge o deploy.
I test della consegna sono risolti. Prima del merge restano la revisione
applicabile coordinata dal Timoniere e l'accettazione esplicita dell'estensione
Postgres del contratto; nessuna revisione precedente è riutilizzata.
Startup verde solo per l'eccezione esatta F1-05c: avvio e idempotenza reali
non sono validati. Il motore F1-05b e il guscio F1-02 non sono modificati.
Bug registrati LOCAL nel Diario: `5bb5d5b5` (dipendenze CI), `c0649383`
(suite Postgres), `10f93315` (baseline SQLite); il primo è risolto dopo i tre
test OCR/PDF tornati verdi. Sync `not-linked`, nessuna
issue manuale aperta. Nessun bug rimasto non registrato.
PR presente nel board CounselorBot. Notifica di apertura inviata best-effort:
`recipient_not_ready`, fase pending; canale mobile disattivato. Non ritentata
con prompt al Timoniere in lavoro. Nessun agente o successore avviato.

# Handoff 23 ottobre 2026: stato dopo il ciclo issue di ottobre e prossimi passi

Data: 2026-10-23 | Base: `d83d088a` (main dopo PR #467) | Timoniere: `t-copilota-7t1n`

## Fatto e in produzione (counselorbot.labform.net, portable su questo Mac)

- Fix in parallelo con agenti Herdr: PR #451 (#426), #452 (#424), #453 (#409),
  #454 (#408), #455 (#421), #456 (#407), #457 (#411), #458 (#423, registro QSAr),
  #461 (#413). Prompt di fabbrica riallineati (20 aggiornamenti, 0 residui).
- #460: frontend portable in **build di produzione** (non più `next dev`), vedi
  `docs/operations/test-instance-hot-reload.md`. Backend sempre con `uvicorn --reload`.
- #462 (#422): link con password per il consiglio di classe (`/consiglio/{token}`).
- #463 (#247): quadro di noticing per compilazione, generato su richiesta, con
  citazioni verificate alla lettera.
- #465 (#464): tab **Noticing** della classe (grafici, temi, suggerimenti, studenti
  con citazioni). #467 (#466): un secondo tentativo e log se il modello risponde male.
- Pulizia: container e immagini di prova rimossi, 11 worktree mergiate eliminate,
  PR #349/#351 chiuse come superate, milestone 2, 3, 11, 27 e 28 chiuse,
  diario aggiornato (obiettivo «Issue aperte ottobre 2026» raggiunto, nuovo
  obiettivo «Area docente 21-23 ottobre»).

## Note operative

- Deploy: backup `docker exec counselorbot-portable-postgres-1 sh -c 'pg_dumpall -U "$POSTGRES_USER"'`
  (l'utente `postgres` non esiste) in
  `/Volumes/sviluppo/console-platform/portable/data/backups/counselorbot/`,
  poi `git pull --ff-only` nel checkout principale. Se cambia `frontend/`:
  `docker compose --env-file .env -f docker-compose.portable.yml up -d --build --no-deps counselorbot-frontend`
  e `docker image prune -f`. Nessun sudo.
- Dopo ogni merge `docs/operations/platform-guidance-state.json` va in conflitto
  nelle PR aperte: merge di `origin/main`, `git checkout --theirs` del file,
  `make guidance-refresh`, commit.
- Mac con 8 GB: un solo stack di test alla volta. `next dev` aveva saturato la VM
  Docker (Postgres in recovery, backend bloccato); dettagli su #254.

## Da fare, in ordine suggerito

1. **Validare il noticing con classi reali** (compito nel diario): oggi solo una
   compilazione della classe 1 ha messaggi dello studente. Raccogliere il parere
   dei tutor su tipi di elemento, numero di temi e suggerimenti.
2. **Baseline test verdi** #348 (backend) e #350 (frontend): da rifare da `main`
   attuale, le PR #349/#351 erano superate.
3. **Stabilità portable** #254, #255, #256 (proxy, IPv6 di herder, timeout auth).
4. **Prompt guidati** #57–#60: riduzione delle ridondanze, mai iniziato.
5. **OpenRouter** #404, #405 (milestone 26).
6. **Navbar** #83.
7. **Profili di installazione** #207–#214 (fase successiva, molti compiti nel diario).
8. Bloccati o lontani: #135 (firma helper, decisione del proprietario), #157, #9.

## Pendenze da decidere

- PR #434 (solo `HANDOFF.md`, esito di #431) ancora aperta: unire o chiudere.
- Worktree con modifiche non committate, da controllare prima di toglierle:
  `feat-class-path-step-presentation` (8 file, nessuna PR),
  `practice-student-results-nav` (13 file, PR #365 già unita),
  `qsa-prompting-regression` (10 file, legata al compito di diario «step QSA
  mancanti dopo aggiornamento QPCC», ancora da fare).
- Worktree `task-28b8858d`, `task-476e4e0a`, `task-a6566a73`: pulite ma su una
  storia che non risulta in `main`; probabile storia riscritta, da verificare.
- Tab Herdr opencode «Ripresa refactoring piani lato docente» e «Controllare
  container Docker attivi» lasciate aperte: non avviate da questa sessione.
- #466 è stata aperta a mano come bug: per la regola del diario i bug arrivano
  dalla sincronizzazione; se serve, riclassificarla.

# Handoff: password di classe visibile nel passo di somministrazione

Data: 2026-10-22 | Branch: `fix/institution-password-display` | Base: `ee7184ec`

Nel passo del piano operativo lo studente vedeva «Quella comunicata dal docente»,
ma la password di competenzestrategiche.it è un codice di accesso della classe, non
un segreto personale. Il database conservava solo il verifier bcrypt, quindi non era
recuperabile. La correzione aggiunge `institutions.encrypted_password`: una copia
Fernet separata, scritta e cancellata insieme al verifier; la verifica locale
continua a usare `hashed_password`.

La risposta di launch espone `institution.institution_password` solo per i piani
`external_it` e solo ai membri della classe; la UI la mostra come `********` con
Mostra/Nascondi nelle sei lingue. Le API docente e amministratore non restituiscono
mai la password né le due forme salvate. La copia riusa il volume
`personal_api_credentials` già montato, con chiave gestita oppure
`INSTITUTION_CREDENTIAL_KEY`/`_FILE` facoltativa: nessun nuovo volume e nessuna
modifica Compose. Se la chiave non è utilizzabile il salvataggio del verifier non
si blocca e la pagina studente ripiega sul messaggio localizzato.

Limite operativo: le credenziali già salvate solo come bcrypt non hanno una copia
leggibile. Il docente deve riaprire Istituti → Sostituisci credenziali esterne e
salvare una volta; fino ad allora lo studente vede «Non disponibile qui: chiedila
al docente». Anche la migrazione non fa backfill.

Verifiche eseguite: 67 test backend mirati (credenziali istituto, migrazioni,
Telegram, copia cifrata, amministrazione IT) su PostgreSQL sintetico; 605 test
frontend; `tsc --noEmit`; `i18n:check` (3417 chiavi, sei lingue); `make
guidance-refresh` e `make guidance-check`; build di produzione frontend. Il caso
admin della matrice credenziali è stato corretto nel test: gli amministratori
accedono all'area docente solo tramite membership attiva, quindi il caso 403 usa
un account non membro (comportamento già presente su `main`). Nessun deploy, nessun
riavvio di container di produzione e nessun comando sudo.

# Handoff: presentazione dei passi del piano operativo (OC3, #470, PR #471)

Data: 2026-10-23. Branch `feat/class-path-step-presentation`, Diario
`96488cb8-46aa-423d-9435-fb497a1af048`. Completata la checklist di #470 dopo
il lavoro del costruttore (S0–S4, 21 ottobre); documentazione S5 già sul branch.

- Merge di `main` (`60244c4f`): conflitti con giorno previsto (f3f48bf7),
  card dei piani nella panoramica (2811dbe4) e editor a passi espandibili. La
  pagina piani dello studente prende la versione di main (card hero per ogni
  piano), la card hero usa il resolver condiviso più giorno previsto e luogo.
  La data di un piano di somministrazione compare una volta, come «Previsto il
  …» con il luogo: il resolver non la ripete come scadenza, ma scadenze e filtro
  «In ritardo» la usano. Il paragrafo OC3 della guida è uscito dalla tabella
  che spezzava.
- Bug del merge corretto (`04e7e7ff`): l'editor teneva aperti i passi per
  oggetto e i campi di presentazione sostituiscono l'oggetto, quindi un passo
  salvato si chiudeva alla prima battuta.
- Fixture (`9ab2ce37`): tre passi forum di test senza titolo
  (`test_path_publication`, `test_path_forum`, `test_path_templates`), ora
  rifiutati da `forum_step_title_missing`. Il test browser apre i passi salvati
  con «Modifica».
- Warning ESLint `Circle`: sparito, il file è quello di main.
- Screenshot della guida rigenerati nelle sei lingue dal solo pannello Passi
  (`UPDATE_GUIDE_SCREENSHOTS=1`), con il passo 1 e il 5 aperti.

Verifiche: `tests/class-path-presentation.test.mjs` su build di produzione
locale (`next build` + `next start` su 127.0.0.1:3161, backend chiuso, API
sintetiche) 12/12 combinazioni lingua×larghezza; `node --test src/lib/*.test.ts`
656 passati; backend su Postgres effimero: `test_path_publication` 14,
`test_path_templates` 17, `test_path_forum` 13, `test_class_paths` 56,
`test_class_view` 10 passati. Rossi identici su main e branch (non OC3):
`test_path_forum_concurrency` 2, `test_forum_steps_migration` 8 errori,
`test_path_templates_migration` 4 errori, `test_it_administration` 32 errori,
`test_assignment_tools` 1, `test_class_meetings` 4 errori; ESLint
`PersonalAreaHome.tsx` (set-state-in-effect) e `tsc` nei file della guida
sono già su main.

Limiti: nell'editor, un passo questionario aperto mostra la data del piano sia
nei campi di presentazione («dal piano di somministrazione», con «Data diversa»
per una scadenza propria) sia nella colonna del giorno previsto. Bug Diario
sospetto `a82f855f` (chiavi React dei passi riordinati) non riprodotto.
Piani pubblicati con passi forum senza titolo restano leggibili; vanno
completati al primo ripristino o ripubblicazione.

# Handoff costruttore: confine descrittivo dei questionari (#431)

Data: 2026-10-21 | Branch: `fix/questionnaire-descriptive-phase` | Base: `5f0f3195e5eff6cbe5ed42de6fb924f228dab1f7`

Gate obbligatorio: Diario `prAutopilot=true`. La PR deve restare **DRAFT** fino
alla revisione DeepSeek in sola lettura, avviata e monitorata dal Timoniere.
Il costruttore non esegue `gh pr ready`, non avvia il revisore e non autorizza
merge o deploy. La chiusura del proprio task indica solo la consegna del lavoro.

Audit scritto prima del codice e specifica #431 letta via `gh issue view`.
Matrice, decisioni ZTPI/QSA essenziale, allineamento salvati e riproducibilità:
`docs/operations/questionnaire-description-boundary.md`.

Il contratto comune riconosce fase e modalità nei sei strumenti a ogni turno,
anche dopo la scelta di profondità e nelle varianti Totale/Ristretto/Minimo.
Non serve una risposta personale per proseguire. Nel QSA essenziale la prima
fase è la lettura; focus ed esempio sono nel secondo passo già esistente.
ZTPI resta descrittivo fino al confronto equilibrato incluso; il personale
è nella fase fissa Domande e Approfondimenti. Savickas/Eventi/IDEA/Obiettivi,
scale, punteggi, inversioni e M2 QPCC conservano i propri contratti.

I prompt e suggerimenti DB non sono riscritti. La chat pubblica proietta
suggerimenti di comprensione nelle sei lingue durante la descrizione, conservando
le righe nell’editor admin (anche quelle già compatibili). Le aree successive
mostrano ancora i suggerimenti salvati e gli incipit personali. Il seed evita
nuovi incipit esperienziali nelle letture. Impronte dei default precedenti
registrate per l’allineamento esplicito già esistente, con anteprima/hash e
protezione revisioni admin; non applicato ad alcuna installazione operativa.

## Stato finale della consegna

Base: `5f0f3195e5eff6cbe5ed42de6fb924f228dab1f7`. Branch
`fix/questionnaire-descriptive-phase`; commit atomici `b0192040` (feat),
`ccfd923f` (test), `f8f4c178` (docs), `8db181e0` (aspettative legacy),
`263121d9` (screenshot), `0f7b1eaf` (docs), `33bf2d01` (merge di `origin/main`).
PR **#433** sul progetto CounselorBot:
<https://github.com/nugh75/counselorbot-sbs/pull/433>. Il costruttore non ha
eseguito `gh pr ready`, merge o deploy; il proprietario ha portato la PR in
review alle 21:13Z (`ready_for_review`). Task Diario
`9e4587c0-c861-4772-85d2-22528f8c7633`: in questa
sessione non è disponibile alcuna CLI/MCP Diario, quindi la notifica non è
stata eseguita; il task resta aperto per il proprietario/revisore.

### Passati realmente

- 156 casi nuovi di ingresso/chiarimenti (13 passi descrittivi × 6 lingue × 2
  contratti, tre turni e tre contesti per caso), prima dell'aggiunta del QSA
  essenziale alla matrice. Log `/tmp/cb431-focused.log`.
- 46 ulteriori casi mirati in `/tmp/cb431-focused-rest.log`.
- 14 test mirati trasporti/ripresa/custom/factory in
  `/tmp/cb431-transport.log`, 50.38 s: 6 sync/stream, 6 riprese da disco,
  testo admin/varianti e allineamento protetto. Provider interrotto apposta
  dopo l'envelope; nessuna generazione live.
- 605 unitari frontend (`/tmp/cb431-node-tests.log`), 10 test delle preferenze
  (`/tmp/cb431-preferences-unit.log`); i18n 3417 chiavi / 6 lingue, TypeScript
  ed ESLint mirati (`/tmp/cb431-i18n.log`, `/tmp/cb431-types.log`,
  `/tmp/cb431-eslint.log`).
- Ruff F: otto rilievi già nella base, nessuno nuovo; `json` inutilizzato in
  `test_qsa_factory_alignment.py` è preesistente. `git diff --check` e
  `check-platform-guidance.py --check` puliti.
- Batteria ampia PostgreSQL (`cb431-final-tests-pg`,
  `/tmp/cb431-final-backend-pg.log`): **1842 passati, 6 falliti in 31:20**.
  Tutti e sei classificati e risolti:
  - due aspettative di dicitura in `test_self_questioning.py`: il caso
    `ztpi-t1` ora verifica il contratto descrittivo (niente domanda personale
    obbligatoria) e l'essenziale usa il confronto senza distinzione di
    maiuscole;
  - `test_goal_focused_definition.py`: aggiornata alla nuova frase sui
    chiarimenti della prima fase QSA;
  - due casi `test_qsa_factory_alignment.py`: richiedevano il `.docx` della
    guida, assente nell'immagine ma presente nel checkout; rieseguiti montando
    il documento in sola lettura;
  - `test_qsa_factor_directive.py`: asseriva `MECHANISM`/`example`/`micro-step`,
    già sostituiti nella base da `one relevant mechanism from [KNOWLEDGE]`.
    Aggiornato alle invarianti attuali.
- Dopo le correzioni: **27 test mirati** (`/tmp/cb431-targeted2.log`) e
  **263 test** su `questionnaire_description` + `self_questioning`
  (`/tmp/cb431-targeted3.log`), tutti passati. Non è stata rilanciata l'intera
  batteria da 31 minuti: la copertura dei sei casi è mirata e registrata.
- Browser: **9/9** test di `frontend/tests/guided-navigation.test.mjs` sul
  frontend compilato in container su 127.0.0.1:3162
  (`/tmp/cb431-browser-full.log`), inclusi i due casi descrittivi a 390 e
  1440 px. I timeout precedenti su :3161 erano avvio a freddo (prima
  navigazione >15 s), non regressioni applicative.
- Screenshot `frontend/public/guide/questionnaire-description-{390,1440}.png`
  generati dalla suite, ispezionati (domanda di comprensione, nessun invito
  personale) e committati.
- Build Docker isolate: backend `counselorbot-backend:issue431` ricostruito
  dal checkout corrente (`/tmp/cb431-backend-rebuild3.log`); frontend
  `counselorbot-frontend:issue431` compilato alle 19:51, dopo l'ultima modifica
  ai sorgenti (`/tmp/cb431-frontend-build.log`).

### Limiti e note

- Due test di `qsa_factory_alignment` richiedono
  `docs/Guida_Costruzione_Prompt_QSA_CounselorBot.docx`: nell'immagine non
  c'è, quindi vanno eseguiti montando il documento. Il test di uguaglianza
  testuale con la guida era già obsoleto nella base per 9 passi su 10; ora
  verifica copertura dei dieci passi, veto della sintesi e confine descrittivo,
  con i quattro default già riscritti dopo la guida documentati nel test.
- Il primo run ampio interrotto aveva una motivazione SQLite errata: il file
  smoke dichiara PostgreSQL dedicato. Nessun difetto del modulo lean è stato
  dimostrato; nessuna issue creata e nessuna baseline #348/#350 modificata.
- La migrazione/allineamento dei testi salvati non è applicata ad alcuna
  installazione operativa: resta esplicita, con anteprima/hash e protezione
  delle revisioni admin.
- Nessuna riproduzione LLM live, nessuna chiamata a pagamento, nessun accesso
  ai prompt o ai dati di produzione.
- Processi e container di verifica fermati a fine sessione: dev frontend
  :3161, frontend QA :3162 e PostgreSQL `cb431-postgres`; nessun volume di
  produzione toccato.

# Handoff: link diretto al questionario nelle tappe dei piani operativi
Data: 2026-10-21 | Branch: `fix/path-administration-questionnaire-link` | Base: `5f0f3195`

Worktree isolato `Counselorbot-worktrees/fix-path-administration-questionnaire-link`,
creato da `origin/main`; le modifiche non committate del worktree
`fix/questionnaire-descriptive-phase` non sono state toccate.

La pagina di somministrazione apriva la home di competenzestrategiche.it e
chiedeva solo la password, senza mostrare il codice. Il backend ora espone una
tabella canonica (`backend/questionnaire_sources.py`) e il launch restituisce
l'indirizzo del questionario scelto (`/QSAr/`, non la home); il parser frontend
rifiuta un link che non corrisponda allo strumento. La pagina mostra le stesse
etichette del sito («Codice istituto/ente», «Password di accesso»), separa la
compilazione esterna dall'inserimento dei punteggi, mantiene la verifica locale
come passo esplicito e lascia la password in sola scrittura. L'azione primaria
dei punteggi resta in fondo ai fattori.

Verifiche: 605 test unitari frontend, i18n a 3417 chiavi, TypeScript, ESLint,
build Next riuscita; backend 32 test di `test_it_administration.py`, 55 di
`test_class_paths.py` + concorrenza e 2 di migrazione superati. In
`test_orientation.py` resta un fallimento preesistente e non collegato (brief
QPCC senza l'intestazione «WHAT IT LOOKS AT»). Immagini Docker backend e
frontend costruite con tag isolati `fix-432` e poi rimosse; PostgreSQL sintetico
:18650 arrestato; nessun processo dev, deploy o sudo.

Dato aggiornato sul deployment portable: la classe «Tutor coordinatori» usa
l'istituto «Roma tre» (id 1), che ora ha codice esterno `1087` e password
`counselor`; la revisione è passata a 3 e i grant di verifica precedenti sono
invalidati. Nessun'altra azione manuale richiesta.

# Handoff: testo duplicato nelle chat (#425)
Data: 2026-10-21 | Correzione unita: PR #428 | Documentazione: `docs/chat-continuation-guidance-425`

Tre casi reali QSA/OpenRouter con Mistral Large 4 identificati nei log:
durante la continuazione il modello ricominciava e il server accodava il
testo al prefisso precedente. `merge_continuation` riconosce una lunga
apertura identica, mantiene una sola risposta in stream, memoria e log e
protegge anche Assistente e ripristino OpenCode. Eco senza progresso
recuperabile. Dettagli e limiti in `docs/operations/chat-continuation-duplicates.md`.

99 test backend, 15 del lettore SSE, replay in sola lettura dei tre casi e
due prove sintetiche live OpenRouter superati. Ollama non disponibile.
Build backend con tag isolato `counselorbot-chat-repeat-test:425` riuscita;
container di test terminato, nessun processo dev avviato, nessun deploy o sudo.

PR #428 verificata MERGED; checkout principale aggiornato a `e3507dad`
senza toccare le modifiche locali preesistenti. Ramo locale della fix eliminato.
Questa PR successiva completa il catalogo funzionale e il manifest richiesti
dal controllo CI Platform guidance. Guida dei controlli di chat esaminata
nelle sei lingue: comandi e schermate esistenti restano coerenti.

# Handoff: analisi questionari nei piani operativi
Data: 2026-10-21 | Branch: `fix/operational-plan-questionnaire-chats` | Issue: #249

Issue esistente verificata e aggiornata prima del codice. Checkout isolato da
`origin/main` (`b3ce3068`); modifiche della cartella iniziale conservate.

Questionario e analisi si salvano insieme tramite `results_from`; anche i passi
«Da preparare» sono collegabili. Analisi personale alternativa per i sei
questionari: scelta esplicita dello studente, solo risultati propri e canonici,
sessione esatta conservata con snapshot alla ripresa, completamento sull’ultimo
turno della nuova sessione. Modelli, copia/applicazione e pubblicazione supportano
entrambe le origini senza richiedere risultati in fase di progettazione. Nessun
importatore esterno. Migrazione idempotente del solo vincolo dei target, ID e
progressi precedenti conservati.

179 backend distinti e 605 unitari frontend superati; otto nuovi casi browser,
cinque di posizionamento e suite editor/modelli superati, TypeScript, i18n,
Ruff F mirato ed ESLint dei file modificati. Fixture Home aggiornate all’ingresso
`?view=home` e a una data stabile per le scadenze, senza ridurre le asserzioni.
Guida e screenshot nelle sei lingue aggiornati; dettagli ripetibili in
`docs/operations/operational-plan-questionnaire-chats.md`.

Rebuild Docker backend/frontend riusciti con tag di validazione separati.
Backend avviato sul solo DB sintetico: OpenAPI HTTP 200 e nuovi GET/POST presenti;
frontend avviato senza rete: HTTP 200 per editor e pagina di analisi. Anche i
19 test nuovi/concorrenza passano usando i file copiati nell’immagine backend.
Nessun deploy o sudo. Frontend dev :3159, smoke e PostgreSQL temporaneo :18650
arrestati; nessun processo o container di questa verifica resta attivo.

# Handoff: dettaglio completo delle compilazioni per il docente (#406)
Data: 2026-10-21 | Branch: `feature/teacher-result-detail-406` | Base: `d54d1807`

Worktree separato `Counselorbot-worktrees/teacher-result-detail-406`, creato da
origin/main aggiornato; il checkout dell’agente che segue #418 resta invariato.
Audit e piano prima del codice in `docs/operations/teacher-result-detail.md`.

«Apri compilazione» riunisce profilo dei risultati, sintesi canonica, lettura
salvata dallo studente, PDF completo e conversazione. Componente condiviso da
Compilazioni, matrice/elenco della classe e piani di somministrazione. Forze,
aree di crescita e nota sono parole dello studente e hanno una sezione propria;
lettura mancante o vuota esplicita. Le etichette del profilo si restringono anche
nella scheda mobile. Date nelle etichette accessibili distinguono compilazioni
ripetute. Guida docente e informativa gruppi aggiornate nelle sei lingue.

Nuove letture di dettaglio/PDF per ID del risultato sotto il perimetro classe o
piano. Stessi controlli del transcript; nessun accesso a un’altra compilazione
solo perché dello stesso studente. Lettura risolta per username/sessione/strumento,
nessun collegamento agli obiettivi personali restituito. PDF e sintesi riusano
il percorso dello studente, con la cache/generazione ordinaria della sintesi.
Nessuna migrazione DB o modifica dei prompt salvati. #247 resta separata.

Verifiche: 36 backend su Postgres 15 isolato in tmpfs, inclusi PDF reali estratti
e confrontati nelle sei lingue, accessi/revoche e compilazioni multiple; 600
unitari frontend. Coperti 36 casi browser distinti con batterie parzialmente
sovrapposte: 33/34 iniziali positivi, il timeout di navigazione della classe
a freddo ricontrollato insieme ai due casi visuali; altri due casi finali su
matrice e compilazioni ripetute positivi. Timeout di sola navigazione della
fixture portato a 60 s, controlli interattivi invariati a 30 s. Un ulteriore avvio a freddo oltre 60 s
è passato dopo la compilazione; controlli finali delle etichette a 320/1440 px
positivi. Nessun LLM reale,
SSO o dato produttivo nei test. Screenshot sintetici 320/1440 px verificati.
Immagini Docker di validazione costruite per entrambi i lati
(`counselorbot-teacher-results-validation:20261021`,
`counselorbot-406-frontend-validation:20261021`): la batteria browser completa è
stata rieseguita sul frontend compilato con 36/36 casi superati e la pagina
docente risponde HTTP 200. Il container di prova è stato arrestato.

Dettagli, comandi e limiti nel documento operativo. Nessun deploy o sudo:
il rilascio ufficiale dopo il merge richiede comunque il rebuild delle due
immagini con i tag di produzione. Database temporaneo arrestato e rimosso
automaticamente (nessun volume); frontend dev su :3143 arrestato. Nessun nuovo
processo dev rimasto attivo.

Le modifiche estranee del checkout principale (`.timoniere.json`, `.herdr-web-ui/`,
`chatgpt-connect.py` e gli artefatti dell’altro agente) non sono state toccate.

# Handoff: budget adattivi OpenRouter (#403)
Data: 2026-10-21 | Branch: `fix/adaptive-reasoning-budget`

- Worktree isolato: `Counselorbot-worktrees/fix-adaptive-reasoning-budget`.
- Base provvisoria: `feature/reasoning-effort-openrouter` / PR #418 (#402),
  gestita dall’altro Codex. Nessuna modifica al suo worktree o alla produzione.
- Piano unico risposta/riserva/totale; riserva adattiva locale, minimo Argon 32768,
  cap output e confronto contesto da catalogo; blocco prima del provider se incompatibile.
- Esiti sync/stream e tentativi nei log, compresi errori e stream parziali.
- Editor e anteprima nelle sei lingue; guida operativa e di piattaforma aggiornate.
- Validazione e limiti ambientali: `docs/operations/model-search-token-guidance.md`.
- La PR va su #418 finché quella base non è integrata; poi retarget su main.
- Verifiche: 159 backend mirati, 41 su Postgres, 600 unitari frontend e 17 browser;
  build/type check/i18n/ESLint riusciti. Ruff: soli errori già presenti nella base.
- Nessun deploy o sudo. Processi e container di validazione fermati a fine verifica.

# Handoff: navigazione libera e rami facoltativi nelle chat guidate
Data: 2026-10-20 | Branch: `feature/guided-chat-navigation-branches` | Seguito di #410 / PR #414

PR #414 verificata MERGED, main aggiornato a `5e14001a`, vecchio branch locale
rimosso prima di creare questo. Audit e piano prima del codice in
`docs/operations/guided-chat-navigation-branches.md`.

Tutti i passi selezionabili dopo il patto iniziale, visite/completamenti reali,
ritorno senza rigenerazione e bozze preservate. Approfondimenti in rami con
intestazione, origine, ritorno e riapertura; apertura manuale o segnale del
counselor su risposta completata. Memoria e checkpoint separati; niente
avanzamento, sintesi, bozze finali o modifiche alla mappa IDEA nel ramo.
Snapshot JSON compatibili con le sessioni precedenti; ripristino dopo TTL dal
solo snapshot del proprietario. Nessuna migrazione DB o dei prompt salvati.

Verifiche e comandi nel documento dell’audit: 708 backend, poi 228 mirati
parzialmente sovrapposti; cinque test puri finali, 600 unitari frontend, sette
nuovi browser e sei regressioni, immagini della guida aggiornate, TypeScript,
lint/i18n/guidance. Modelli simulati. Restano da rieseguire su Postgres l’ultimo
test SQL del contatore e il caso di strumento dichiarato diverso dall’origine.

Build backend Docker isolata iniziale riuscita. Disco di sistema esaurito durante
la build frontend, poi Docker Desktop indisponibile. Spostati solo artefatti
sintetici da /tmp a /Volumes/sviluppo/tmp/counselorbot-validation-artifacts,
con symlink ai vecchi percorsi; nessuna eliminazione di immagini, volumi o dati.
Build frontend locale isolata riuscita. Rebuild Docker finale di entrambe le
immagini da ripetere quando il daemon sarà disponibile; nessun riavvio globale
eseguito. Nessun deploy o sudo. Frontend di test fermato a fine sessione;
stato del Postgres temporaneo non verificabile col daemon indisponibile.

Modifiche estranee `.timoniere.json`, `.herdr-web-ui/`, `chatgpt-connect.py`
conservate fuori dai commit. Commit/push e nuova PR sul progetto CounselorBot.

# Handoff: orientamento e scelta degli approfondimenti in tutte le chat guidate
Data: 2026-10-20 | Branch: `feature/guided-chat-choice` | Issue: #410

Audit e piano scritti prima dell'implementazione in
`docs/operations/guided-chat-choice.md`. Contratto comune nei prompt runtime di
95 passi di fabbrica (12 strumenti), percorsi personalizzati, varianti essenziali
e IDEA: cornice breve a ogni risposta, scelta prima dell'approfondimento,
ritorno al percorso e rispetto della decisione di proseguire. Patti iniziali,
sintesi senza domande, punteggi e blocchi privati conservati.

La soglia degli scambi richiama periodicamente la scelta nel prompt invece di
aggiungere un avanzamento forzato. Il QSA essenziale ora mantiene la fase nei
chiarimenti e approfondimenti, fino al segnale su risposta completata. La
richiesta esplicita di avanzare conserva il turno solo marcatore quando serve
all'interfaccia: l'apertura del passo successivo offre la cornice visibile.

Nessuna scrittura o lettura di prompt, dati o conversazioni di produzione.
Il contratto comune si attiva col codice dopo il rilascio; i testi di fabbrica
QA/Obiettivo restano aggiornabili esplicitamente con hash e revisioni da
«Allinea prompt di fabbrica». Prompt personalizzati conservati. Registrate in
un commit fix separato le impronte mancanti dei default Obiettivo già nella base.

Verifiche: 688 backend finali superati; matrice di 576 casi nelle sei lingue e
nei tre livelli di contesto, apertura e prosecuzione. Nella batteria ampia,
1562 test passati e tre fallimenti poi corretti e ricontrollati; un controllo
marcatori richiede il mount dei sorgenti frontend. 596 unitari frontend e cinque
browser pertinenti superati; i18n (3408 chiavi), TypeScript, lint dei file
modificati e guidance superati. Build Docker isolate backend/frontend, avvio
frontend e HTTP 200. Limiti e comandi ripetibili nel documento dell'audit.

Resta anche un test legacy del fallback di audit (`ContextCapacityError` con
16384 token di contesto e 14000 di output), riprodotto identico sul backend di
base senza la nuova direttiva. Gli altri sei controlli della parità e dei
marcatori frontend/backend passano.

Restano quattro test browser legacy del formato Tabella, che il selettore della
base non offre più (QSAr, OpenCode, Bussola e Assistente). Le verifiche usano
risposte simulate; nessun LLM live o provider a pagamento. Non è un'attestazione
della naturalezza di un modello. Guida aggiornata nelle sei lingue; le immagini
esistenti restano pertinenti perché non sono stati aggiunti comandi.

Runner frontend-only: `scripts/dev-guided-choice-tests.sh`, loopback :3157;
nessun backend utilizzabile fuori dalle fixture. Avvio/stop/tunnel documentati in
`docs/operations/live-dev-environment.md`. Nessun deploy, riavvio produttivo o
sudo. A fine sessione vengono fermati runner e container temporanei di verifica.
Modifiche estranee iniziali `.timoniere.json`, `.herdr-web-ui/` e
`chatgpt-connect.py` conservate e non incluse nei commit.

# Handoff: Ricerca dei modelli nei preset e consigli sui budget token
Data: 2026-10-18 | Branch: `feature/model-search-suggestions`

Completato il lavoro recuperato da `feature/model-search-suggestions`, basato su
`main` a `e05b8a77`. Corretto l'errore di sintassi lasciato nel primo commit.

- Selettore ricercabile condiviso fra modello di sistema e Preset; il filtro non
  cambia la selezione, non salva e mantiene gli ID personalizzati.
- Preset: ricerca in creazione/modifica, ricarica, ID manuale, cambio provider
  con azzeramento della selezione e risposte tardive ignorate; errori di salvataggio visibili.
- Aiuti nelle sei lingue per 2000/4000 token, valori automatici, budget reasoning
  separato e limiti del provider. Il limite del preset è distinto da Lunghezza
  nelle chat guidate; nessuna modifica automatica dei preset esistenti.
- Candidati OpenRouter verificati sul catalogo ufficiale e proposti solo se live;
  consigli di confronto tradotti, senza affermazioni di qualità non misurata.
- Documentazione e comandi di verifica: `docs/operations/model-search-token-guidance.md`.

Verifiche: 596 unitari frontend, 14 browser, 72 backend superati; i18n, TypeScript,
build e lint dei file modificati superati (tre warning già presenti).
Lint globale: sette errori e 62 warning identici alla base; PR #351 separata.
I test backend usano rete interna e Postgres sintetico in RAM, senza dati reali.
Font effettivi in cache per build offline; Docker con tag di verifica separato.

A causa di letture bloccate sul volume esterno, la verifica è in
`/tmp/counselorbot-model-search-complete`; i file finali sono riportati nel worktree
originario dopo il confronto con la copia iniziale per preservare modifiche concorrenti. I file estranei del checkout
principale (`.herdr-web-ui/`, `chatgpt-connect.py`) sono intatti. I worktree
storici già integrati non vengono rimossi. Le PR #349 e #351 restano lavori
separati di baseline; verificarne l'esito nella relativa PR.

# Handoff: Token headroom, calibrazione streaming e prevenzione fallback nelle chat guidate
Data: 2026-10-18 | Branch: `fix/guided-chat-token-headroom` | Agente: `s6-token-headroom`

Obiettivo:
- Risolvere il problema del troncamento delle chiamate e del fallback indebito (`reflective_empty_fallback`) nelle chat guidate (in particolare QPCC step 1 `qpcc-profilo` e step con 10 fattori o modelli con reasoning).
- Evitare che il raggiungimento del tetto di token provochi la perdita completa del testo generato fino a quel momento sostituendolo con il messaggio generico di fallback.
- Calibrare il taglio visivo delle parole durante lo streaming SSE per evitare interruzioni a metà frase.

Modifiche principali:
1. `backend/chat_logic.py` e `backend/chat_preparation.py`:
   - Incrementato il budget `max_tokens` nei profili di lunghezza: short a 1000, medium a 2000, long a 4000 token.
   - Per gli step di lettura del profilo (fasi che terminano con `-profilo` come `qpcc-profilo`, `qap-profilo`, `qpcs-profilo`), garantito un budget `max_tokens` di almeno 4000 ed elevata la lunghezza visiva a `long` per consentire l'esposizione completa di tutti i fattori senza troncature.
   - Calibrato `_limit_visible_words` con finestra di tolleranza (+15% parole) per favorire la naturale conclusione della frase (segni di punteggiatura finale).
2. `backend/reasoning_profiles.py`:
   - In `resolve_plan`: calcolato il budget totale sommando il budget di ragionamento (thinking) al margine di risposta richiesto (headroom), evitando che le tracce di reasoning consumino l'intero budget lasciando la risposta a secco.
3. `backend/routes/chat.py`:
   - Nello stream SSE, evitata l'interruzione brutale (`break`) a metà frase o tabella: l'interruzione anticipata avviene solo su fine frase o su tetto massimo (1.3x), con esenzione esplicita per i turni di lettura profilo (`is_profile_turn`).
   - Nel gestore di eccezioni dello stream (`except Exception as e`):
     - Distinto il contenuto prodotto dal singolo stream (`visible_this_stream`) rispetto al cumulato (`visible_all`).
     - Se c'è testo visibile generato prima di un errore di token limit o interruzione, preservato il testo utile (`response = visible_all`, `incomplete: True`) anziché cancellarlo e sostituirlo con `reflective_empty_fallback`.
     - In caso di retry o continuazione (`request.partial_response`), evitato che la mancata produzione di nuovi token cancelli la risposta parziale già visualizzata.
4. `backend/routes/site_chat.py`:
   - Ripristinato l'import di `site_rag_index` da `..rag_index` per coerenza con i test di smoke.
5. `backend/tests/`:
   - Creato `backend/tests/test_guided_chat_headroom.py` con 6 test dedicati a profili, headroom, reasoning budget, grace sentence closure e salvaguardia del testo visibile.
   - Aggiornato `backend/tests/test_smoke.py` per i nuovi massimali token.
6. Documentazione:
   - Aggiornato `docs-counselorbot/funzionalita-counselorbot.md` e riallineato lo stato in `docs/operations/platform-guidance-state.json`.

Test e Validazione:
- `docker exec counselorbot-portable-counselorbot-backend-1 pytest backend/tests/test_guided_chat_headroom.py backend/tests/test_lean_envelope_focus.py backend/tests/test_chat_think_fallback.py backend/tests/test_single_question_prompts.py backend/tests/test_chat_continuation.py -p no:warnings`: 62/62 test superati (100% green).
- `docker exec counselorbot-portable-counselorbot-backend-1 pytest backend/tests/test_smoke.py -k "test_response_length"`: PASS.
- `make guidance-refresh` e `make guidance-check`: PASS.
- Container backend ricostruito e attivo in stato healthy.


# Handoff: Generalizzazione regole universali per tutte le introduzioni e conversazioni (auto-interrogazione, chiarimenti su richiesta, divieto formule «non è... ma...» e disclaimer)
Data: 2026-10-18 | Branch: `fix/qpcc-self-inquiry-agreement` | Agente: `timoniere`, Gemini 3.8 Flash (High)

Obiettivo:
- Stabilire a livello di piattaforma la distinzione tra regole universali condivise e particolarità di ogni singola chat.
- Regola maieutica: le domande poste dal chatbot sono spunti aperti per facilitare l'auto-interrogazione della persona sulla propria esperienza, scelte, strategie e risorse (mai un interrogatorio, quiz o questionario direttivo tipo «io ti faccio domande mirate e tu rispondi»).
- Regola sulle spiegazioni: il chatbot fornisce chiarimenti o spiegazioni su scale, concetti o meccanismi solo in due casi: (1) quando la persona li richiede espressamente, o (2) quando rileva dall'intervento dell'utente che qualcosa detto prima è stato frainteso o non compreso bene. Al di fuori di questi casi, non fa dissertazioni o lezioni spontanee.
- Eliminazione universale delle formule retoriche di contrasto («non è... ma...», es. «non è un giudizio ma...», «non misura quanto vali ma...», «non è un voto ma...») e di tutti i meta-disclaimer difensivi («senza giudizio», «non con giudizio», «non misura quanto vali», «non ci sono risposte giuste o sbagliate», «autopercezioni non verdetti», «non è un test o un voto», «non ti farò domande del questionario»).

Modifiche:
1. `backend/prompt_contract.py`:
   - In `turn_contract()` (applicato a ogni turno di chat di tutti gli strumenti): introdotte le regole universali su auto-interrogazione, chiarimenti solo su richiesta o fraintendimento, divieto di formule "non è... ma..." e blacklist di disclaimer difensivi.
   - In `_self_questioning_contract()` e `_facilitation_contract()`: allineati i contratti con le stesse invarianti pedagogiche.
2. `backend/prompt_config.py` & template di flusso (`backend/prompts/`):
   - In `INTRO_ALLOWED_QUESTIONS`: iniettato il blocco universale di regole per tutte le introduzioni (`*_intro`).
   - `score_based_intro_flow.md` (QSA, QSAr, ZTPI, QPCS, QAP): rimosso «Reassure them that this is a support for reflection, not a test or a grade» e formule «non è... ma...»; introdotto il frame di auto-interrogazione e chiarimento su richiesta.
   - `savickas_intro_flow.md` & `savickas_intro_step_prompt.md`: eliminata la formula asimmetrica «you ask open questions and use the student's answers» e la rassicurazione «no scoring, test or grade».
   - `evento_intro_flow.md`, `evento_intro_step_prompt.md`, `evento_step_patto.md`: rimosso «not to judge it» e l'asimmetria; introdotto il frame di auto-interrogazione.
   - `obiettivo_intro_flow.md`: rimosso «there is no scoring, test or grade».
   - Step iniziali (`qpcs-intro`, `qap-intro`, `savickas-patto`, `qpcc-intro`): ripuliti da formule teoriche/pedagogiche e allineati al tono naturale.
3. `backend/main.py`:
   - Aggiornata la migrazione di startup per riallineare automaticamente tutti i record `models.Config` (`prompt_*_welcome`) e tutti gli step iniziali (`models.GuidedStep`) memorizzati nei database esistenti.
4. `docs-counselorbot/funzionalita-counselorbot.md`:
   - Documentata la formalizzazione delle regole universali di piattaforma e rieseguito `make guidance-refresh` e `make guidance-check`.

Test e Validazione:
- `docker exec counselorbot-portable-counselorbot-backend-1 pytest backend/tests/test_facilitation_contract.py backend/tests/test_single_question_prompts.py backend/tests/test_prompt_pair_drift.py backend/tests/test_qpcc_alignment.py backend/tests/test_chat_preparation.py`: 53/53 test passati (100% green).
- `make guidance-check`: PASS (`Funzionalità CounselorBot: documentazione allineata`).
- Container backend ricostruito e riavviato con successo.


# Handoff: Rimozione lezioni teoriche e formule difensive dall'introduzione e patto di collaborazione QPCC
Data: 2026-10-18 | Branch: `fix/qpcc-natural-intro` | Agente: `timoniere`, Gemini 3.8 Flash (High)

Obiettivo:
- Eliminare il linguaggio prolisso, difensivo e stucchevole ("non misura quanto vali", "con curiosità, non con giudizio", "non ci sono risposte giuste o sbagliate", "non ti farò le 63 domande", "autopercezioni non verdetti", "mai come etichette fisse") anche dal messaggio di benvenuto e dal Patto di Collaborazione (Step 0) del percorso QPCC.
- Rimuovere la lezione accademica/teorica sui costrutti psicometrici (citazione di Pellerey e Orio, 63 item, 4 dimensioni e 10 scale numerate da 1 a 9) rivolta all'utente all'apertura del colloquio, sostituendola con un'accoglienza sobria, naturale e umana in 2-3 paragrafi focalizzata sull'esplorazione pratica delle risorse lavorative e su un chiaro accordo di collaborazione.
- Implementare una migrazione idempotente all'avvio del backend per aggiornare i testi di fabbrica memorizzati su database esistenti senza richiedere interventi manuali.

Modifiche:
1. `backend/prompt_config.py` & `backend/qpcc_factory_legacy.json`:
   - `DEFAULT_SYSTEM_PROMPT_QPCC_INTRO`: rimosso l'aggancio all'intera `qpcc_directive()` che riversava il manuale psicometrico nel prompt di benvenuto. Riscritta l'istruzione per una breve accoglienza calorosa (2-3 frasi), stima dei tempi (20-30 minuti), riservatezza e richiesta di assenso esplicito, con divieto tassativo di lezioni teoriche, disclaimer o formule pedagogiche difensive.
   - `DEFAULT_QPCC_GUIDED_STEPS` (`qpcc-intro`): eliminata la prescrizione di spiegare le 4 dimensioni e le 10 scale o l'assenza di risposte giuste/sbagliate. Sostituita con un patto chiaro in 2-3 brevi paragrafi orientato alle risorse e all'agire nel lavoro.
2. `backend/qpcc.py`, `backend/prompt_contract.py`, `backend/prompts/prompt_qpcc_interview.md`, `backend/prompts/prompt_qpcc_summary.md`, `backend/tool_brief_seed.py`:
   - Rimossa la frase-leakage "Expected duration 20-30 minutes; no right or wrong answers..." dal contratto canonico QPCC.
   - Espansa la blacklist anti-disclaimer in `_facilitation_contract` e `_self_questioning_contract` includendo "non con giudizio", "non misura quanto vali", "non ci sono risposte giuste o sbagliate", "autopercezioni non verdetti", "non ti farò 63 domande", "etichette fisse".
3. `backend/main.py`:
   - Aggiunta migrazione automatica e idempotente all'avvio in `startup_event` che riallinea `prompt_qpcc_welcome` in `models.Config` e lo step `qpcc-intro` in `models.GuidedStep` qualora contengano ancora i testi o le istruzioni con i cliché obsoleti.
4. `backend/tests/test_qpcc_alignment.py`:
   - Aggiornate le asserzioni contrattuali e gestita l'esecuzione isolata sia in container Docker sia su host.
5. `docs-counselorbot/funzionalita-counselorbot.md`:
   - Documentato il nuovo approccio sobrio ed essenziale per lo Step 0 e aggiornato il checksum di guida di piattaforma (`platform-guidance-state.json`).

Test e Validazione:
- `backend/tests/test_qpcc_alignment.py`, `backend/tests/test_single_question_prompts.py`, `backend/tests/test_chat_preparation.py`: 39/39 passed (100% green).
- `make guidance-check`: verifica superata con successo (`Funzionalità CounselorBot: documentazione allineata`).
- Rebuild del container backend: completato con successo.


# Handoff: Rimozione meta-disclaimer e cliché terapeutici e correzione fallback inizio step
Data: 2026-10-18 | Branch: `fix/conversational-tone-and-step-fallback` | Agente: `timoniere`, Gemini 3.8 Flash (High)

Obiettivo:
- Eliminare il linguaggio "stucchevole e finto" generato dall'LLM nelle chat guidate (in particolare QPCC), dovuto alla ripetizione compulsiva di meta-disclaimer difensivi ("è un'ipotesi e non una verità", "senza giudizio", "non è un difetto", "non è una diagnosi", "non è un tratto fisso") trasudati letteralmente dalle istruzioni di sistema (prompt leakage).
- Riconoscere che l'alleanza di lavoro e l'inquadramento non diagnostico appartengono allo Step 0 (Patto di Collaborazione) e non vanno reiterati ad ogni turno, sostituendoli con una curiosità fenomenologica naturale e con modalità epistemica espressa tramite grammatica conversazionale ordinaria.
- Correggere il fallback di emergenza (`reflective_empty_fallback`) all'avvio di uno step o al Patto di Collaborazione, differenziando l'accoglienza e l'introduzione del tema rispetto alla prosecuzione della riflessione per evitare frasi decontestualizzate come "Prenditi un momento... da dove preferisci riprendere la riflessione?".

Modifiche:
1. `backend/prompt_contract.py`:
   - Esteso il contratto di facilitazione metacognitiva (`_facilitation_contract`) con divieto esplicito (blacklist) di meta-disclaimer e cliché terapeutici ("È un'ipotesi, non una verità", "senza giudizio / senza giudicarti", "non è un difetto", "non è una diagnosi", "non è un tratto fisso", "la domanda non è se sei bravo o no").
   - Esplicitato che il frame non diagnostico appartiene allo Step 0 e che le ipotesi vanno formulate con naturalezza dialogica ('sembra che', 'potrebbe essere', 'ti torna o la vivi diversamente?').
   - Inserito divieto analogo in `_self_questioning_contract`.
   - In `turn_contract`, sostituito il prescrittivo "Label interpretations as hypotheses" (che induceva l'LLM a etichettare le frasi) con l'istruzione di formulare ipotesi aperte senza etichette esplicite.
2. `backend/qpcc.py`, `backend/prompts/prompt_qpcc_interview.md`, `backend/prompts/prompt_qpcc_summary.md`, `backend/tool_brief_seed.py`:
   - Aggiunta la direttiva esplicita di non recitare i principi deontologici/contrattuali nel testo visibile allo studente.
3. `backend/chat_logic.py` & `backend/routes/chat.py`:
   - Introdotto il parametro `is_entry` in `reflective_empty_fallback()`. All'avvio di un passaggio (`is_entry=True`), il fallback introduce il tema senza chiedere anacronisticamente "da dove preferisci riprendere".
   - Al Passo 0 (Patto di Collaborazione), il fallback fornisce un saluto iniziale e propone di avviare il percorso.
4. `backend/tests/`:
   - Aggiornato `test_facilitation_contract.py` con verifiche sulle nuove invarianti pedagogiche e anti-disclaimer.
   - Aggiornato `test_chat_think_fallback.py` con test specifici per l'avvio dello step e per il Patto di Collaborazione.
5. Documentazione e Guidance:
   - Aggiornato `docs-counselorbot/funzionalita-counselorbot.md` e riallineati gli hash di `platform-guidance-state.json`.

Test e Validazione:
- Eseguita l'intera suite di test del backend: 787 test passati (100% green).
- `make guidance-check` superato con successo.


# Handoff: Aggiunta servizio Piper TTS 100% offline nella configurazione portatile
Data: 2026-10-18 | Branch: `feature/piper-offline-tts` | Agente: `timoniere`, Gemini 3.8 Flash (High)

Obiettivo:
- Abilitare la sintesi vocale locale e offline (Piper TTS) nella configurazione Docker portatile (`docker-compose.portable.yml`), consentendo agli utenti di ascoltare testi e risposte anche in assenza di connessione Internet o in caso di indisponibilità dei servizi cloud (Edge TTS).

Modifiche:
1. `docker-compose.portable.yml`:
   - Aggiunto il servizio `piper` isolato con immagine `counselorbot-piper:latest` (built da `./services/piper` con 12 voci ONNX incorporate per 6 lingue), filesystem read-only, tmpfs, limiti CPU/memoria e healthcheck dedicato su `/voices`.
   - Assegnato alias `piper` sulla rete `default` e configurata la variabile d'ambiente `PIPER_URL: http://piper:8000` nel servizio `counselorbot-backend`, con dipendenza all'avvio.
2. `backend/routes/voice_reader.py`:
   - Reso configurabile l'endpoint di Piper tramite la variabile `PIPER_URL = os.environ.get("PIPER_URL", "http://piper:8000").rstrip("/")` per gli endpoint `/voices` e `/synthesize`.
3. `docs-counselorbot/funzionalita-counselorbot.md`:
   - Documentata la disponibilità del motore Piper 100% offline anche nell'installazione portatile.

Test e Validazione:
- Build dell'immagine Docker `counselorbot-piper`: completata con successo con verifica checksum dei modelli.
- Suite di test interna Piper offline: `python test_server.py` eseguito con `--network none` (tutte le 12 voci verificate e conformi).
- Test di sintesi end-to-end: verificata la generazione audio WAV offline da container backend verso container piper via `/tts/stream` (200 OK, 1 chunk audio sintetizzato, 0 errori).
- Suite di test del backend: `backend/tests/test_voice_reader.py` (15/15 test passati).
- Allineamento guidance: `make guidance-refresh` e `make guidance-check` superati con successo.


# Handoff: Ripristino lettore audio e aggiornamento dipendenza edge-tts
Data: 2026-10-18 | Branch: `fix/edge-tts-audio-player` | Agente: `timoniere`, Gemini 3.8 Flash (High)

Problema:
- Il lettore audio vocale dell'applicazione (`VoiceReader`, endpoint `/api/tts/stream` e `/tts`) non funzionava e falliva sistematicamente con `chunk_error`. Microsoft ha introdotto nuovi token di autenticazione e validazione anti-abuso (`Sec-MS-GEC` e `Sec-MS-GEC-Version`) per le connessioni WebSocket ai server Edge Read Aloud, causando il rifiuto `WSServerHandshakeError: 403 Forbidden` su versioni di `edge-tts` precedenti a 7.3.0.
- La funzione `reader_voice` in `backend/routes/voice_reader.py` assumeva la presenza di `db.query` (fallendo su test con sessioni mockate prive del metodo `query`).
- La funzione `bind_identity` in `backend/chatgpt_connections.py` assumeva che `db` non fosse `None` e possedesse `info`, sollevando `AttributeError` nei test isolati privi di database reale.

Modifiche:
1. `backend/requirements.txt`:
   - Aggiornato `edge-tts` a `edge-tts>=7.3.1` per supportare il nuovo handshake WebSocket e token `Sec-MS-GEC` di Microsoft Speech.
2. `backend/routes/voice_reader.py`:
   - Gestita la risoluzione del counselor in `reader_voice` sia con sessioni reali (`hasattr(db, 'query')`) sia con mock (`db.get(...)`).
3. `backend/chatgpt_connections.py`:
   - Aggiunto controllo di sicurezza in `bind_identity` per ignorare chiamate con `db is None` o privo dell'attributo `info`.
4. `docs-counselorbot/funzionalita-counselorbot.md`:
   - Documentato il supporto ai token `Sec-MS-GEC` nel motore Edge TTS del lettore vocale.

Test:
- Backend: `backend/tests/test_voice_reader.py` (15/15 test passati con successo).
- Validazione end-to-end: sintesi audio reale verificata con successo (25.488 byte audio generati, stream SSE con 1 chunk e 0 errori).
- Guidance: `make guidance-refresh` e `make guidance-check` passati con successo.


# Handoff: Risoluzione errore chatgpt.errors.signIn in salvataggio Guardiano del filo e fix fallback chat
Data: 2026-10-18 | Branch: `fix/thread-guard-csrf-header` | Agente: `timoniere`, Gemini 3.8 Flash (High)

Problema:
- Nell'area amministrazione (`/admin?tab=threadGuard`), il tentativo di salvare o abilitare la configurazione del Guardiano del filo falliva con errore `chatgpt.errors.signIn` (HTTP 403). La rotta di backend `PUT /admin/thread-guard` richiede la dipendenza anti-CSRF `browser_mutation` (header `X-Requested-With: CounselorBot`), ma `frontend/src/components/admin/ThreadGuardPanel.tsx` ometteva tale header nella richiesta fetch.
- In `backend/routes/chat.py`, la variabile `control_signals` era inizializzata a `None`, provocando un `TypeError: argument of type 'NoneType' is not iterable` durante la gestione dell'eccezione e fallback dello streaming chat.

Modifiche:
1. `frontend/src/components/admin/ThreadGuardPanel.tsx`:
   - Aggiunto l'header `'X-Requested-With': 'CounselorBot'` nella chiamata `fetch('/api/admin/thread-guard', ...)`.
2. `backend/routes/chat.py`:
   - Inizializzato `control_signals = []` e protetto il controllo `bool(control_signals and control_markers.ADVANCE_STEP in control_signals)` con payload streaming sicuro `control_signals or []`.
3. `backend/tests/test_thread_guard.py`:
   - Aggiunti test di regressione per verificare il rifiuto HTTP 403 `chatgpt.errors.signIn` in assenza di header e l'accettazione HTTP 200 con header presente.
4. `docs-counselorbot/funzionalita-counselorbot.md`:
   - Documentato il requisito anti-CSRF dell'endpoint admin del guardiano del filo e il comportamento del fallback dello stream chat.

Test:
- Backend: suite completa `backend/tests/test_thread_guard.py` (68/68 test passati) e `backend/tests/test_chat_think_fallback.py` (16/16 test passati) eseguiti nel container Docker.
- Guidance: `make guidance-refresh` e `make guidance-check` passati con successo.


# Handoff F3: Envelope snello, deduplicazione, esclusione RAG guida sito e divieto elenchi puntati
Data: 2026-10-18 | Branch: `fix/guided-envelope-focus` | Agente: `s3-envelope-snello`, Gemini 3.8 Flash (High)
Task ID: `f4e370b8-15b1-48c0-860b-540bf72046e6` | Milestone: Prompt guidati: personalizzazione e riduzione delle ridondanze

Obiettivo:
Ottimizzazione dell'envelope del prompt di sistema per garantire massima aderenza ed efficienza con modelli locali e compatti nelle chat guidate di questionari e percorsi.

Modifiche:
1. Posizionamento di `[SESSION NOTES]` in coda all'envelope:
   - In `backend/chat_preparation.py`, le istruzioni private (`notes_directive`, schema JSON `recommendations` e gestione delle note `hypothesis`) vengono collocate deterministicamente all'estremità finale del prompt di sistema assemblato (`system_prompt_final`), dopo il contratto del turno e le preferenze visibili. Tale posizionamento si propaga alla coda di tutte le varianti di contesto (`variants`), massimizzando la compliance dei modelli compatti ed eliminando fughe del formato note in prosa.
   - Parametrizzato `example_lens="A1r"` per QSAr in `backend/recommendation_blocks.py` per prevenire falsi allarmi del prompt auditor su codici fattoriali estranei.
2. Eliminazione duplicazioni contrattuali e direttive ridondanti:
   - In `backend/prompt_contract.py`: `turn_contract` verifica la presenza dei contratti specializzati (`_facilitation_contract`, `_self_questioning_contract`, `_objective_focus_contract`) prima di concatenarli; aggiunte sentinelle a monte in `backend/chat_preparation.py`.
   - In `backend/chat_logic.py`: introdotte sentinelle prima di iniettare blocchi strutturali in `build_context_envelope` (`ROLE_BLOCK`, `[STUDENT]`, `[GUIDED PATH]`, `[SIMULATION]`, `[PROFILE]`, `[CONTESTO CLASSE]`, `[READING]`, `[KNOWLEDGE]`) e deduplicazione delle direttive globali in `_apply_global_directives` (`[ORIENTATION]`, `[CONTEXT]`, `[LANGUAGE]`, `[REGISTER]`, `[THINKING]`, `[PLATFORM CAPABILITIES]`).
   - In `backend/chat_preferences.py`: deduplicazione sentinella per `[VISIBLE RESPONSE FORMAT]`.
   - In `backend/recommendation_blocks.py`: deduplicazione sentinella per `[RECOMMENDATION LOG]`.
3. Disattivazione del RAG della guida del sito nelle chat guidate:
   - In `backend/chat_logic.py`: introdotta la funzione `is_guided_chat(questionnaire_type, step_id)` che riconosce tutti i questionari guidati e i passi strutturati.
   - In `get_prompt_component_flags`: forzati a `False` i flag `rag_competenzestrategiche`, `rag_counselorbot` e `rag_questionari` per le chat guidate.
   - In `_retrieved_context`: soppressa l'interrogazione dei motori vettoriali della guida del sito (`site_rag_index`, `counselorbot_rag_index`, `questionari_rag_index`) quando `is_guided` è attivo, risparmiando token di contesto e preservando unicamente le strategie e letture certificate quando abilitate.
4. Regola no-bullet a livello di envelope e contratti di turno:
   - Rafforzato il divieto perentorio di utilizzare elenchi puntati o numerati in `turn_contract`, `_facilitation_contract`, `_self_questioning_contract` e `_objective_focus_contract`, imponendo una conversazione fluida in prosa naturale continua con al massimo una sola domanda aperta per turno.

Test:
- `backend/tests/test_lean_envelope_focus.py`: suite dedicata con 4 test su posizionamento note in coda all'envelope e varianti, deduplicazione dei blocchi sentinella, esclusione del RAG guida sito nelle chat guidate, e rispetto della regola no-bullet.
- `backend/tests/test_chat_preparation.py`: 6 test passati con successo (inclusa la verifica di identità runtime/audit su tutti i 1.170 turni/combinazioni).
- `backend/tests/test_hypothesis_ledger.py`: 8 test passati con successo.
- `make guidance-check`: allineamento completo della documentazione.


# Handoff Filone F2: Prescrizione domanda singola su un solo aspetto nei prompt di step e contratto QPCC ipotetico (finding BLOCCANTE-3 testi, NON BLOCCANTE-5)
Data: 2026-10-18 | Branch: `fix/guided-steps-single-question` | Agente: `s2-single-question`, Gemini 3.8 Flash (High)
Task: `52d3df40-36df-4502-9aad-3631926963c2` | Milestone: Prompt guidati: personalizzazione e riduzione delle ridondanze

Problema:
Nelle chat reali su questionari e strumenti a intervista (in particolare con modelli piccoli come Codestral e Ministral-8b), i counselor tendevano a porre raffiche di 2-5 domande contemporanee per turno, spesso in elenco puntato, disattendendo il principio di facilitazione metacognitiva (BLOCCANTE-3, bug 676c4d54-8a86-499d-8b22-1e92083cea02 e 80e1d321-b95a-4e44-88dc-f15be196e7ad). Inoltre in QPCC i punteggi venivano talvolta trattati con tono diagnostico o con attribuzione di emozioni non dichiarate, e strategie o letture rifiutate venivano riproposte.

Modifiche:
1. `backend/prompt_config.py` e `backend/prompts/*.md`:
   - Rimosse tutte le formule a elenco di domande/aspetti multipli nei default di step di tutti gli strumenti a intervista e percorsi guidati: QPCC (`DEFAULT_QPCC_GUIDED_STEPS`), QAP (`DEFAULT_QAP_GUIDED_STEPS`), QPCS (`DEFAULT_QPCS_GUIDED_STEPS`), QSAr (`DEFAULT_QSAR_GUIDED_STEPS`), ZTPI (`DEFAULT_ZTPI_GUIDED_STEPS`), Savickas (`DEFAULT_SAVICKAS_GUIDED_STEPS`), Evento significativo (`evento_step_*.md`), Obiettivi di apprendimento studio e docenza (`obiettivo_step_*.md`, `default_system_prompt_obiettivo_interview.md`), QSA (`qsa_step_*.md`).
   - Sostituite con formula tassativa e breve: esattamente una sola domanda aperta per turno su un singolo aspetto, mai elenchi di domande; altri aspetti nei turni successivi solo se necessari.
   - Preservati il criterio qualitativo di comprensione, il tetto di sicurezza di circa 5 scambi e il marcatore tecnico `[[AVANZA_STEP]]`.
2. `backend/qpcc.py` (`directive()`), `backend/prompts/prompt_qpcc_interview.md`, `backend/prompts/prompt_qpcc_summary.md` e `backend/tool_brief_seed.py`:
   - I punteggi sono dichiarati come autopercezioni riportate dalla persona e ipotesi esplorative da verificare, mai come fatti oggettivi, diagnosi o etichette.
   - Divieto esplicito di attribuire emozioni o stati affettivi (come ansia o insicurezza) non espressamente nominati dalla persona.
   - Obbligo esplicito di accogliere immediatamente il rifiuto di una lettura o di una strategia abbandonandola senza riproporla.
   - Regola perentoria di porre esattamente una sola domanda aperta per turno su un solo aspetto, mai elenchi di domande.
3. Test:
   - Aggiunto `backend/tests/test_single_question_prompts.py`: verifica la presenza della prescrizione di singola domanda aperta e assenza di elenchi di domande su tutti i percorsi guidati, le regole del contratto QPCC, la preservazione del tetto di 5 scambi e `[[AVANZA_STEP]]`.
   - Aggiornato `backend/tests/test_qpcc_alignment.py` (asserzione su autopercezioni dichiarate nel contratto).
   - Eseguiti con successo con pytest: `test_single_question_prompts.py` (5 test), `test_prompt_files.py` (6 test), `test_prompt_pair_drift.py` (6 test), `test_w4_content.py` (3 test) per un totale di 20/20 test passati.
4. Documentazione e Passi manuali:
   - Aggiornato `docs-counselorbot/funzionalita-counselorbot.md`.
   - Verificato lo stato con `check-platform-guidance.py`.
   - NOTA OPERATIVA POST-DEPLOY: Cambiando i default di fabbrica nel codice, i valori già salvati nel database non si aggiornano automaticamente. Dopo il deploy in produzione/staging è necessario eseguire l'operazione amministrativa «Allinea prompt di fabbrica» dall'interfaccia amministrativa per aggiornare le istruzioni e gli step memorizzati nel DB.


# Handoff s1: selezione provider/modello guardiano del filo e disaccoppiamento da Ollama (F1)
Data: 2026-10-18 | Branch: `fix/thread-guard-provider-selection` | Agente: `s1-guard-provider`, Gemini 3.8 Flash (High)
Milestone: Prompt guidati: personalizzazione e riduzione delle ridondanze

Problema:
Finding BLOCCANTE-2 (bug diario 9e2cb842). Nel DB `thread_guard_enabled=false` e preset di fabbrica id=1 su Ollama qwen3.8 (`backend/thread_guard_seed.py`), ma sulle installazioni portatili o prive di Ollama locale, il guardiano non poteva girare o puntava a un preset rotto. L'amministratore non aveva modo da UI di scegliere provider e modello tra quelli effettivamente attivi con chiavi configurate o raggiungibili.

Modifiche:
- `backend/thread_guard.py`:
  - `is_provider_active`: verifica che il provider abbia chiave configurata (openai, anthropic, google, mistral, deepseek, openrouter, groq) o sia un servizio locale raggiungibile (ollama).
  - `active_providers`: restituisce l'elenco dei provider attivi.
  - `get_guard_configuration`: recupera stato di abilitazione, provider, modello e se il provider è attualmente attivo.
  - `save_guard_configuration`: convalida che il provider sia attivo prima di salvare, crea o riusa un `ModelPreset` con `disable_thinking=True` e aggiorna le configurazioni `thread_guard_enabled` e `thread_guard_preset_id`.
  - Verifica fail-safe in `evaluate`: se il guardiano fallisce, gestisce l'errore registrandolo e restituendo `None` senza interrompere o rompere la chat.
- `backend/thread_guard_seed.py`:
  - `seed_thread_guard`: se Ollama non è attivo, non crea né associa un preset non funzionante (`thread_guard_preset_id=None` e `thread_guard_enabled=false`), evitando preset rotti all'avvio.
- `backend/routes/thread_guard.py` e `backend/main.py`:
  - Nuovo endpoint admin `GET /admin/thread-guard` e `PUT /admin/thread-guard` protetto da ruolo admin e header `browser_mutation`, con validazione HTTP 400 se si tenta di salvare un provider non attivo o inesistente.
- `frontend/src/components/admin/ThreadGuardPanel.tsx`:
  - Riscritto per interfacciarsi con `/api/admin/thread-guard` e `/api/admin/models`.
  - Selettore con i soli provider attivi e caricamento dinamico dei modelli noti per quel provider, con supporto per inserire modelli personalizzati.
  - Banner di avviso ben visibile quando la configurazione corrente punta a un provider non attivo o mancante, con disattivazione del toggle di abilitazione finché non viene selezionato un provider valido.
- `frontend/src/lib/i18n-admin.ts`:
  - Aggiunte e completate le chiavi di traduzione per il pannello del guardiano del filo in tutte le 6 lingue supportate (it, en, es, fr, de, sv).
- Test:
  - `backend/tests/test_thread_guard.py`: aggiunti test per `is_provider_active`, `seed_thread_guard` con provider assente/presente, salvataggio e validazione configurazione, rotte admin `GET`/`PUT /admin/thread-guard` e gestione errori fail-safe (68 test verdi).
  - Build frontend: completata con successo al 100% (63 pagine statiche, zero errori di tipo o lint).
- Documentazione:
  - Aggiornati `docs-counselorbot/funzionalita-counselorbot.md` e stato guidance di piattaforma (`make guidance-refresh` e `make guidance-check` verificati con successo).


# Handoff F4: chiusura server-side a 4-5 scambi con marcatore AVANZA_STEP
Data: 2026-10-18 | Branch: `fix/server-side-step-closure` | Agente: `s5-step-closure`, Gemini 3.8 Flash (High)
Task: F4 (438856b7-1540-4fa1-92e8-1230d6dba178) | Milestone: Prompt guidati: personalizzazione e riduzione delle ridondanze

Problema:
Nelle chat guidate e negli strumenti a intervista (QPCC, QAP, QPCS, QSAr, ZTPI, Savickas, Evento, Obiettivo, ecc.), la permanenza nello step è governata da un criterio qualitativo con tetto di sicurezza a circa 5 scambi. Se il modello non emetteva spontaneamente il marcatore `[[AVANZA_STEP]]` o se lo studente continuava a interagire, la conversazione rischiava di rimanere bloccata indefinitamente nello stesso step senza proporre il passaggio successivo.

Modifiche:
- `backend/step_closure.py`:
  - Implementato modulo per la gestione della chiusura di sicurezza server-side.
  - Soglia predefinita configurabile: `DEFAULT_STEP_SAFETY_THRESHOLD = 5` (personalizzabile tramite DB `models.Config` con chiave `step_safety_threshold` o variabile d'ambiente `STEP_SAFETY_THRESHOLD`).
  - `is_step_closure_eligible(db, step, phase, questionnaire_type)`: esclude chat libere, percorsi privi di step (es. IDEA), passi introduttivi (`WELCOME_PHASE_IDS`, `sort_order < 0`, step `mode="intro"`) e passi di sintesi finale/farewell (`SYNTHESIS_STEPS`, step `mode="summary"` o `mode="farewell"`, ultimo step attivo).
  - `count_step_assistant_exchanges(db, session_id, phase)`: calcola con query ottimizzata su `models.Log` il numero di turni dell'assistente registrati per la sessione nello step corrente.
  - `should_force_step_closure(current_exchange_count, is_eligible, threshold)`: valuta se lo step è idoneo e il conteggio di scambi raggiunge o supera la soglia di sicurezza.
  - `ensure_step_closure(text, should_advance)`: appende `\n\n[[AVANZA_STEP]]` in coda al testo solo se necessario e mancante, senza mai duplicare marcatori già presenti.
- `backend/routes/chat.py`:
  - Integrata la verifica di idoneità e il calcolo degli scambi sia per l'endpoint sincrono `/chat` sia per lo streaming SSE `/chat/stream`.
  - In `/chat`: se la soglia è raggiunta e il marcatore manca, viene aggiunto prima dell'estrazione tramite `control_markers.extract`; `session_memory` viene aggiornato in background con `completed_step=True`.
  - In `/chat/stream`: calcolo della soglia prima dello streaming; alla conclusione del testo generato, `ensure_step_closure` applica il marcatore su `raw_response` (o risposta di fallback) prima dell'estrazione dei segnali di controllo, assicurando `ADVANCE_STEP` in `control_signals` e aggiornando `session_memory` con `completed_step=True` sia nei percorsi standard sia in fallback.
- Test:
  - `backend/tests/test_server_side_step_closure.py`: suite di 20 test completi (unitari e d'integrazione con FastAPI TestClient su `/chat` e `/chat/stream`) che verificano:
    (a) turni iniziali (< 4 scambi) non iniettano forzatamente il marcatore se non presente,
    (b) al raggiungimento della soglia (5 scambi) il marcatore viene aggiunto, i `control_signals` contengono `ADVANCE_STEP` e la `session_memory` segna il passo completato,
    (c) se il modello emette spontaneamente il marcatore prima della soglia, non viene duplicato,
    (d) nei passi di introduzione o nelle sintesi finali/farewell non viene forzato alcun marcatore indebito.
- Documentazione: aggiornati `docs-counselorbot/funzionalita-counselorbot.md` e `docs/operations/platform-guidance-state.json`.

# Handoff F5: rimozione tag <think> e fallback per risposte vuote o solo reasoning
Data: 2026-10-18 | Branch: `fix/empty-response-think-leak` | Agente: `s4-fallback-think`, Gemini 3.8 Flash (High)
Task: F5 (424969f9-efd2-4461-b2f8-f29d9801e259) | Milestone: Prompt guidati: personalizzazione e riduzione delle ridondanze


Problema:
1. I modelli di reasoning (es. DeepSeek-R1, QwQ) emettono catene di pensiero racchiuse tra tag `<think>...</think>`, `<thinking>...</thinking>` o `<sto_pensando>...</sto_pensando>`. Nello streaming chunk-by-chunk SSE e nelle risposte sincrone, tali tag rischiavano di trapelare all'utente o di essere salvati nella cronologia della sessione e nei log.
2. In caso di risposta vuota da parte del provider, risposta di soli spazi, risposta ridotta a stringa vuota dopo la rimozione del blocco `<think>`, o errori di risposta vuota ("empty response"), la chat falliva con errore 500/502 o restituiva messaggi vuoti al client.

Modifiche:
- `backend/chat_logic.py`:
  - Aggiunti pattern regex (`_THINK_TAG_ANY_RE`, `_THINK_OPEN_UNCLOSED_RE`, `_THINK_CLOSE_ORPHAN_RE`) e funzione `strip_thinking(text: str)` per ripulire completamente tag `<think>`, `<thinking>`, `<sto_pensando>`, blocchi non chiusi a fine testo e tag orfani di chiusura.
  - Implementata `reflective_empty_fallback(step_label: str | None = None, language: str = "it")` con frasi gentili, riflessive e contestualizzate allo step guidato corrente, localizzate in italiano, inglese, spagnolo, francese, tedesco e svedese.
  - Implementata `is_empty_response_error(exc: Exception) -> bool` per rilevare eccezioni di risposta vuota generate dai provider LLM.
  - Aggiornato `_student_visible_response` per richiamare `strip_thinking(text)`.
- `backend/ai_service.py`:
  - `_response_with_fallback`: ripulisce con `split_thinking` i risultati sincroni dei vari provider ed esclude il reasoning.
  - `call_model`: chiamata a `split_thinking` prima di restituire il testo.
  - `_iter_chat_stream`: integrato `ThinkStreamSplitter` per filtrare ed escludere i tag `<think>` chunk-by-chunk durante lo streaming.
- `backend/routes/chat.py`:
  - Integrazione di `ThinkStreamSplitter` nello streaming SSE `/chat/stream`: i chunk di reasoning vengono soppressi in tempo reale e non raggiungono mai il client SSE.
  - Aggiunto `strip_thinking` e controllo fallback su risposta vuota in `/chat/stream`, `/chat` (sync) e `/chat/message`.
  - Gestione degli errori di risposta vuota (`is_empty_response_error`) con emissione del fallback contestualizzato anziché crash 500/502.
- `backend/routes/site_chat.py`:
  - Applicazione di `strip_thinking` e `reflective_empty_fallback` sulle risposte della chat del sito.
- Test:
  - `backend/tests/test_chat_think_fallback.py`: suite di 16 test che verificano:
    (a) rimozione completa di `<think>`, `<thinking>` e `<sto_pensando>` (chunk SSE e risposte sincrone),
    (b) fallback automatico quando il testo emesso contiene unicamente reasoning,
    (c) fallback automatico quando il testo emesso è vuoto, solo whitespace o genera `EmptyModelResponseError`, con supporto multilingue e contestualizzazione allo step,
    (d) conservazione intatta della risposta normale priva di reasoning.
- Documentazione: aggiornati `docs-counselorbot/funzionalita-counselorbot.md` e `docs/operations/platform-guidance-state.json`.


# Handoff: riepilogo e PDF al completamento delle chat guidate su questionari di prova (docente/admin)
Data: 2026-10-18 | Branch: `fix/practice-questionnaire-summary` | Agente: `Antigravity`


Problema:
Al termine di una chat guidata di un questionario svolto in modalità simulazione/palestra docente (taccuino di prova con `notebook_context="practice"`), il frontend montava `<SessionReport sessionId={sessionId} ... />` per richiedere riepilogo (`GET /api/user/questionnaire-result/{session_id}/summary`) e PDF (`GET /api/questionnaire-result/{session_id}/pdf`). Tali endpoint rispondevano con 404 poiché `_get_owned_questionnaire_result` interrogava unicamente la tabella degli studenti reali `questionnaire_results` (`models.QuestionnaireResult`) e non `teacher_practice_results` (`models.TeacherPracticeResult`). Inoltre, la mappatura degli ID degli step di sintesi conteneva disallineamenti per QPCC e QAP e mancava dei percorsi `EVENTO_*` e `OBIETTIVO_*`.

Modifiche:
- `backend/models.py`:
  - Aggiunte property `@property def username` e `@property def submitted_at` al modello `TeacherPracticeResult` per garantire conformità di interfaccia duck-type con `QuestionnaireResult`.
- `backend/routes/survey.py`:
  - `_get_owned_questionnaire_result`: introdotto fallback su `TeacherPracticeResult` verificando ownership (`owner_username == current_user.username`) o privilegi admin, preservando la separazione tra dati di prova e record studenti reali.
  - `_final_step_summary`: corretti gli ID step di sintesi per `"QPCC": "qpcc-sintesi"`, `"QAP": "qap-sintesi"`, e aggiunti i mapping per `"EVENTO_STUDIO": "evstudio-final"`, `"EVENTO_PROFESSIONALE": "evprof-final"`, `"OBIETTIVO_STUDIO": "obbstudio-final"`, `"OBIETTIVO_DOCENZA": "obbdocenza-final"`.
  - Passaggio di provider e model coerenti estratti dai log di sessione per la generazione della sintesi LLM.
  - `get_user_session_conversation`: abilitato il recupero della trascrizione anche per sessioni di prova.
- `frontend/src/components/qsa/SessionReport.tsx` e `frontend/src/app/page.tsx`:
  - Semplificazione lineare della schermata di completamento: rimosse scelte dispersive e ridondanti (domanda "Vuoi analizzare un altro questionario?", opzioni radio brief/full, pulsante di rigenerazione sintesi, iframe preview 75vh, pulsante "Termina" con reindirizzamento al questionario di gradimento `farewell`).
  - Due sole azioni dirette: **Scarica il resoconto PDF** (scarica direttamente il documento completo e riporta alla pagina principale) e **Torna alla pagina principale** (per uscire immediatamente azzerando le selezioni).
- Test:
  - `backend/tests/test_pdf_summary.py`: aggiunto `test_practice_questionnaire_summary_and_pdf` che verifica anteprima di riepilogo, generazione PDF, recupero conversazione, permessi proprietario/admin e blocco 403 per utenti non autorizzati.
  - Eseguita verifica end-to-end con la sessione reale docente del mattino (`1986b52c-81ad-4c4a-a2e8-114e11415abf`): riepilogo pronto e PDF generato (18.164 byte).
  - Test suite frontend: 593/593 test superati (`npm test`).
- Documentazione: aggiornati `docs-counselorbot/funzionalita-counselorbot.md` e `docs/operations/platform-guidance-state.json`.

# Handoff t7: estensione guardiano (interpretation_open, hypotheses), preservazione sintesi e rilascio facilitazione (fase 6)
Data: 2026-10-18 | Branch: `feature/metacognitive-guard-synthesis` | Agente: `t-agy-timoniere`, Gemini 3.8 Flash (High)
Issue #378 | Milestone: Prompt guidati: personalizzazione e riduzione delle ridondanze

Implementata la Fase 6 dell'audit (docs/audits/audit-facilitatore-metacognitivo.md), completando l'intero piano di transizione verso il facilitatore metacognitivo:
- `backend/thread_guard.py`:
  - Aggiunto l'asse `interpretation_open` in `Verdict` (default `Check(ok=True)`) per verificare che il counselor non affermi interpretazioni come fatti oggettivi, non attribuisca emozioni non nominate e non ripeta letture rifiutate.
  - Aggiornato `SEVERITY = ("advice_grounded", "interpretation_open", "on_thread", "question_fit")`.
  - Aggiunto il campo `hypotheses: list[dict] = []` in `Verdict` per raccogliere gli esiti delle ipotesi identificate nel turno (`[{"index": int, "outcome": "confirmed"|"corrected"|"rejected"}]`).
  - Aggiornato `SYSTEM_PROMPT` con la spiegazione del nuovo asse e del formato/semantica di `hypotheses`.
  - Implementate le funzioni `open_hypotheses`, `_open_hypotheses_section` e `_close_hypotheses`: aggiornano lo stato dell'ipotesi nel registro con `closed_by="conversation"`, rispettando la regola ferrea che una marcatura esplicita dello studente (`closed_by == "student"`) non viene mai sovrascritta.
  - Integrato in `build_input`, `evaluate` e `store`.
- `backend/recommendation_service.py`:
  - `set_state`: corretto il reset di `closed_by` in modo che per le ipotesi solo il ritorno a `proposed` o `stale` azzeri chi l'ha chiusa, preservando `closed_by` quando lo stato diventa `confirmed`, `corrected` o `rejected`.
- `backend/journey_context.py`:
  - Aggiunto parametro `preserve_hypotheses: bool = False` e la regola esplicita nella riduzione del trascritto: «Preserve the counselor's readings and the student's response to each — confirmed, corrected in their own words, or rejected. Never present a rejected reading as agreed.»
- `backend/chat_preparation.py`:
  - Invocazione di `journey_context` in sintesi con `preserve_hypotheses=(questionnaire_type.upper() in QUESTIONNAIRE_DIALOGUES or is_event_instrument(questionnaire_type))`.
- Rilascio di default della facilitazione metacognitiva:
  - `backend/prompt_config.py`: `SYSTEM_PROMPT_DEFAULTS[FACILITATION_CONTRACT_ENABLED_KEY] = "true"`.
  - `backend/chat_preparation.py`: fallback configurazione a `"true"`.
- Test:
  - `backend/tests/test_thread_guard.py`: 64 test verdi (parsing `interpretation_open`, severità, isolamento `hypotheses`, rispetto di `closed_by="student"`).
  - `backend/tests/test_facilitation_contract.py`: 8 test verdi (default abilitato e fallback esplicito a false, direttiva di preservazione ipotesi in `journey_context`).
  - `backend/tests/test_hypothesis_ledger.py`: 8 test verdi (default rilasciato e flag off).
  - `backend/tests/test_recommendation_state.py` e `backend/tests/test_session_ledger.py`: 37 test verdi.
  - `backend/tests/test_self_questioning.py`: 751 test verdi (retrocompatibilità contrattuale garantita con flag off).
- Documentazione: aggiornati `docs-counselorbot/funzionalita-counselorbot.md` e `docs/operations/platform-guidance-state.json`.

# Handoff t6: profondità d'intervista: budget → criterio di comprensione con tetto di sicurezza (fase 5)
Data: 2026-10-18 | Branch: `feature/interview-depth-safety-cap` | Agente: `t-agy-timoniere`, Gemini 3.8 Flash (High)
Issue #376 | Milestone: Prompt guidati: personalizzazione e riduzione delle ridondanze

Implementata la Fase 5 dell'audit (docs/audits/audit-facilitatore-metacognitivo.md):
- Transizione dal budget rigido di turni («at most two follow-ups», «two or three questions in total») a un criterio qualitativo di comprensione orientato all'agire con tetto di sicurezza flessibile a circa cinque scambi:
  - `backend/prompts/prompt_qpcc_interview.md`: sostituito il budget di follow-up con permanenza nell'area ancorata a ciò che la persona fa, come sceglie e cosa produce, chiusura su risposta all'ipotesi o richiesta di avanzamento o tetto di circa 5 scambi.
  - `backend/prompt_config.py` (`DEFAULT_QPCC_GUIDED_STEPS`): riscritti `qpcc-comunicazione`, `qpcc-controllo`, `qpcc-volizione`, `qpcc-elaborazione`, `qpcc-convinzioni` con il medesimo criterio qualitativo.
  - `backend/prompts/prompt_qap_interview.md` e `DEFAULT_QAP_GUIDED_STEPS`: riscritti `qap-preoccupazione`, `qap-controllo`, `qap-curiosita`, `qap-fiducia` sostituendo la richiesta aneddotica con indagine sulle scelte e sulle modalità di azione e tetto di circa 5 scambi.
  - `backend/prompts/default_system_prompt_savickas_interview.md` e `DEFAULT_SAVICKAS_GUIDED_STEPS`: preservate le 5 domande narrative fisse di Savickas; allineati i follow-up all'indagine sul significato per l'agire e scelte con tetto di circa 5 scambi.
  - `backend/prompts/default_system_prompt_evento_interview.md`: rimosso il limite fisso a 2 follow-up in favore dell'indagine sui fatti e sulla rilettura con le parole della persona e tetto di circa 5 scambi.
  - `backend/prompts/default_system_prompt_qpcs_analysis.md`: rimossi «ask at most two or three questions in total» e «once you have enough, be PROACTIVE...», sostituiti da una domanda riflessiva per turno sull'agire e permanenza fino alla risposta alla lettura come ipotesi.
- Preservazione factory legacy (`backend/prompt_factory_legacy.json`):
  - Registrati tutti gli hash preesistenti di Main per garantire la compatibilità con la funzione «Allinea prompt di fabbrica» senza toccare personalizzazioni admin.
- Test:
  - `backend/tests/test_prompt_factory_alignment.py`, `test_control_markers.py`, `test_self_questioning.py` (801/801 verdi).
  - `backend/tests/test_chat_preparation.py`, `test_evento_significativo.py`, `test_prompt_pair_drift.py` (22/22 verdi).
- Documentazione: aggiornati `docs-counselorbot/funzionalita-counselorbot.md` e `docs/operations/platform-guidance-state.json`.

# Handoff t5: riscrittura step di fabbrica QSA, QSAr, ZTPI e QPCS come ipotesi e indagine sull'agire (fase 4)
Data: 2026-10-17 | Branch: `feature/factory-step-prompts-refactor` | Agente: `t-agy-timoniere`, Gemini 3.8 Flash (High)
Issue #374 | Milestone: Prompt guidati: personalizzazione e riduzione delle ridondanze

Implementata la Fase 4 dell'audit (docs/audits/audit-facilitatore-metacognitivo.md):
- `backend/prompts/qsa_step_*.md`:
  - `qsa_step_cognitive.md` e `qsa_step_affective.md`: fattori restituiti come lenti aperte sui processi e sulle abitudini di studio, non come etichette rigide. Domande centrate su cosa fa lo studente in pratica nello studio.
  - `qsa_step_sl_elaboration.md`, `qsa_step_sl_selfcontrol.md`, `qsa_step_sl_motivation.md`, `qsa_step_sl_emotions.md`, `qsa_step_sl_attribution.md`, `qsa_step_sl_social.md`, `qsa_step_sl_synthesis.md`: interazioni tra fattori formulate come ipotesi aperte («as ONE hypothesis about how this student...») con indagine centrata su comportamenti, scelte e conseguenze («what they actually do, how they choose that, and what that way of acting produces»). Preservate le guardie di simmetria (A2/A5) e aggancio (A6).
- `backend/prompt_config.py`:
  - `DEFAULT_QSAR_GUIDED_STEPS`: rimozione di «short practical comment» su fattori cognitivi e affettivi; lenti di secondo livello presentate come ipotesi aperte e domande sull'agire e sulle scelte pratiche nello studio.
  - `DEFAULT_ZTPI_GUIDED_STEPS`: rimozione di «a practical comment» nei singoli fattori (t1-t5); fattori inquadrati come abitudini di attenzione anziché tratti immutabili; domande focalizzate su scelte e conseguenze nella preparazione (incluso Presente Fatalistico come da §6.2 dell'audit).
  - `DEFAULT_QPCS_GUIDED_STEPS`: rimozione di «connected to a real, recent situation» in tutte le aree (emozioni, comunicazione, volizione, apprendimento, fiducia) in favore di domande di indagine su come lo studente agisce, sceglie e risponde alle situazioni impegnative o di studio.
- `backend/prompt_factory_legacy.json`:
  - Verificata la presenza di tutti gli hash precedenti per garantire la piena compatibilità con la funzione «Allinea prompt di fabbrica» senza alterare le personalizzazioni admin.
- Test:
  - `backend/tests/test_chat_preparation.py` (6/6 passati, preservazione di tutte le definizioni di step).
  - `backend/tests/test_prompt_factory_alignment.py` e `test_control_markers.py` (50/50 passati).
  - Suite di regressione completa in Docker: 870/870 passati.
- Documentazione: aggiornati `docs-counselorbot/funzionalita-counselorbot.md` e `docs/operations/platform-guidance-state.json`.

# Handoff t4: rimozione [ANCHOR] e ritocco di testi e sentinelle in codice (fase 3)
Data: 2026-10-17 | Branch: `feature/code-prompts-cleanup` | Agente: `t-agy-timoniere`, Gemini 3.8 Flash (High)
Issue #372 | Milestone: Prompt guidati: personalizzazione e riduzione delle ridondanze

Implementata la Fase 3 dell'audit (docs/audits/audit-facilitatore-metacognitivo.md):
- `backend/prompts/default_system_prompt_factor.md`, `default_system_prompt_qsar_factor.md`, `default_system_prompt_ztpi_factor.md`, `factor_table_rules.md`:
  - Rimossa la direttiva `[ANCHOR]`, assorbita e governata direttamente dal contratto di facilitazione per evitare formule stereotipate e alleggerire l'envelope.
- `backend/prompt_config.py`:
  - Rimosso l'append di `[ANCHOR]` in `DEFAULT_SYSTEM_PROMPT_QPCC_FACTOR`.
- `backend/prompts/default_second_level_method.md`:
  - Snellite le istruzioni di secondo livello per preservare esclusivamente la parte (1), ossia l'offerta di un'ipotesi interpretativa prima di ogni consiglio pratico. Eliminati i divieti rigidi di value-check e le regole restrittive sulla formulazione delle domande (assorbite in `[FACILITATION]`).
- `backend/prompts/default_qa_depth_directive.md`:
  - Ritoccato il punto (2) di `[DEPTH ON REQUEST]` per connettere la spiegazione del meccanismo a scelte, abitudini e agire nello studio dello studente (o offrire una situazione concreta come esempio da riconoscere/correggere), evitando che il modello imponga un aneddoto scolastico prefissato.
- `backend/chat_preparation.py`:
  - Ritoccata la direttiva `[PERSPECTIVE]` in sintesi: il nesso tra il filo emerso nella sessione, il taccuino e il portfolio viene offerto come domanda aperta che lo studente è libero di cogliere o lasciare.
- `backend/qpcc.py`:
  - `qpcc.directive()`: sostituito il vecchio budget rigido a turni fissi («Ask ONE main open question and at most two concrete follow-ups») con il criterio flessibile di permanenza nell'area ancorato alle scelte e all'agire con tetto di sicurezza (circa cinque scambi).
- Verifiche di contrazione envelope (`make prompt-dry`):
  - QSA cognitive: 14795 → 14395 (-400 caratteri)
  - QSA sl-motivation: 17314 → 16770 (-544 caratteri)
  - QSAr cognitive: 13620 → 13220 (-400 caratteri)
  - ZTPI t1: 15085 → 14685 (-400 caratteri)
  - QPCS profilo: 13940 → 13540 (-400 caratteri)
  - QAP profilo: 13907 → 13507 (-400 caratteri)
- Test aggiornati: `backend/tests/test_prompt_files.py`, `backend/tests/test_prompt_pair_drift.py`, `backend/tests/test_qsa_factor_directive.py`.
- Regressione completa superata in container Docker: 811/811 test verdi.
- Documentazione: aggiornati `docs-counselorbot/funzionalita-counselorbot.md` e `docs/operations/platform-guidance-state.json`.

# Handoff t3: blocco note per ipotesi, accoppiamento risposte e sezione ledger (fase 2)
Data: 2026-10-17 | Branch: `feature/hypothesis-notes-ledger` | Agente: `t-agy-timoniere`, Gemini 3.8 Flash (High)
Issue #370 | Milestone: Prompt guidati: personalizzazione e riduzione delle ridondanze

Implementata la Fase 2 dell'audit (docs/audits/audit-facilitatore-metacognitivo.md):
- `backend/recommendation_blocks.py`:
  - `notes_directive`: supporto a `hypothesis_allowed`, aggiunta di `hypothesis` ai kind ammessi con lente facoltativa e relativo esempio.
  - `extract_notes`: estrazione deterministica di `kind: "hypothesis"`, validazione della presenza verbatim nel messaggio visibile, limite 8-600 caratteri, e validazione facoltativa del campo `lens` su `phase_codes`.
- `backend/recommendation_service.py`:
  - `RECOMMENDATION_STATUSES`: esteso con `answered`, `confirmed`, `corrected`, `rejected`.
  - `set_state`: validazione di `HYPOTHESIS_STATUSES` e persistenza di `payload.outcome`.
  - `couple_hypothesis_reply`: accoppiamento deterministico della risposta dello studente (`user_message`, max 240 caratteri) all'ipotesi aperta più recente con transizione a `answered`.
  - `_carry_over` e `conversation_context`: preservazione di `reply`, `outcome` e `lens`, ed esclusione delle ipotesi aperte/risposte dal blocco di raccomandazioni generiche.
- `backend/session_ledger.py`:
  - Nuove funzioni `hypothesis_rows`, `hypotheses(db, ...)` e `reflection_thread(hypotheses, ...)`.
  - Sezione `Readings you offered in this session, with what the student replied:` in `_compose` e direttiva metacognitiva in `_directives`: «Use the student's reply as their version; never restate a reading they corrected or rejected.»
  - Blocco compatto in-step `[REFLECTION THREAD]` limitato a 500 caratteri sui turni interni allo step con ipotesi aperta o risposta.
- `backend/prompt_contract.py`:
  - `_facilitation_contract` esteso con `thread_state`: aggiunge le righe di vincolo minimo per `introduced`, `hypothesis_open` e `hypothesis_answered`.
  - `turn_contract`: passaggio di `thread_state`.
- `backend/chat_preparation.py`:
  - Calcolo di `thread_state` e iniezione condizionale di `[REFLECTION THREAD]`.
  - A flag `facilitation_contract_enabled` spento: retrocompatibilità totale byte per byte.
- `backend/routes/chat.py`:
  - `_record_recommendations`: invocazione di `couple_hypothesis_reply` su `user_message` pulito e passaggio di `hypothesis_allowed` ed `allowed_lenses` a `extract_notes` sia in chat standard che streaming.
- Test dedicati: `backend/tests/test_hypothesis_ledger.py` (8/8 passati).
- Regressione: `test_facilitation_contract.py` (7/7 passati), `test_self_questioning.py` (751/751 passati), `test_prompt_lab_engine.py` (39/39 passati).
- Documentazione: aggiornati `docs-counselorbot/funzionalita-counselorbot.md` e `docs/operations/platform-guidance-state.json`.

# Handoff t2: contratto di facilitazione metacognitiva governato da feature flag
Data: 2026-10-17 | Branch: `feature/metacognitive-facilitation-contract` | Agente: `t-agy-timoniere`, Gemini 3.8 Flash (High)
Issue #368 | Milestone: Prompt guidati: personalizzazione e riduzione delle ridondanze

Implementata la Fase 1 dell'audit (docs/audits/audit-facilitatore-metacognitivo.md):
- Definito `_facilitation_contract(stage: str)` con sentinella `[FACILITATION]` in `backend/prompt_contract.py`.
- Introdotto il parametro `facilitation_contract_enabled: bool = False` in `turn_contract()` e collegato alla lettura da `configs` in `backend/chat_preparation.py`.
- Registrata la chiave `FACILITATION_CONTRACT_ENABLED_KEY = "facilitation_contract_enabled"` con default `"false"` in `backend/prompt_config.py`.
- Invarianti pedagogiche incorporate:
  1. Spostamento dall'aneddotica situazionale/cronachistica («qual è il momento in cui...») all'indagine metacognitiva su scelte, azioni e conseguenze («Di fronte a questa difficoltà, che cosa fai di solito? Come scegli di muoverti, e che conseguenze ha questo modo di procedere sul tuo lavoro?»).
  2. Profondità flessibile basata su 3 condizioni di comprensione raggiunta (esperienza concreta emersa, comprensione del funzionamento dell'agire, elementi sufficienti per la sintesi), superando il vincolo rigido numerico.
  3. Eliminazione dei convenevoli cerimoniosi («Grazie per aver condiviso», «Capisco la tua riflessione», «Certo.»).
  4. Non forzare l'insight: interpretazioni offerte sempre come ipotesi aperte che lo studente è libero di confermare, correggere o rifiutare.
  5. Value-check a due livelli: verifica interna continua, verifica esplicita solo nei momenti chiave (ipotesi rilevanti, prima di sintesi o disallineamenti).
  6. Neutralità emotiva: risposte concise trattate come stile comunicativo o stanchezza, non resistenza.
- Retrocompatibilità verificata: a flag spento (default `false`) l'output è identico byte per byte a `_self_questioning_contract` (`test_self_questioning.py`: 751/751 superati).
- Test dedicati: `backend/tests/test_facilitation_contract.py` (7/7 superati).
- Documentazione: aggiornati `docs-counselorbot/funzionalita-counselorbot.md` e `docs/operations/platform-guidance-state.json`.

# Handoff t1: allineamento calibrazione Prompt Lab a percezione di competenza (A6) e facilitazione metacognitiva
Data: 2026-10-17 | Branch: `fix/prompt-lab-metacognitive-calibration` | Agente: `t-agy-timoniere`, Gemini 3.8 Flash (High)
Issue #366 | Milestone #1 | PR #367

Allineato il caso di calibrazione di Prompt Lab (`calibration-good`) e il test di base del fattore A6 al costrutto effettivo e al paradigma di facilitazione metacognitiva:
- A6 descrive la percezione di competenza e fiducia nelle proprie capacità nello studio (non l'ansia).
- Eliminato il convenevole cerimonioso iniziale (`Certo.`).
- Sostituita la formulazione aneddotica/situazionale (`qual è il momento in cui cominci a sentirti così`, `momento recente`) con una domanda di processo metacognitivo focalizzata su scelte strategiche, comportamenti e conseguenze sul lavoro di studio (`che cosa scegli di fare di solito, e che conseguenze ha questo modo di procedere sul tuo lavoro?`).
- `backend/chat_preferences.py`: aggiunto `from __future__ import annotations`.
- `backend/prompt_lab/evaluation.py`: aggiornati `_CALIBRATION_CASE` e `CALIBRATION_CASES[calibration-good]`.
- `backend/tests/test_prompt_lab_engine.py`: aggiornato `calibrated()` e aggiunto `test_calibration_good_aligns_with_metacognitive_facilitation` (39/39 passati).
- Documentazione: aggiornato `docs-counselorbot/funzionalita-counselorbot.md` e riallineato `docs/operations/platform-guidance-state.json` (`make guidance-refresh` e `make guidance-check`).

# Handoff a4: comandi avanti e indietro sempre visibili nella chat guidata
Data: 2026-10-17 | Branch: `fix/guided-chat-nav-buttons` | Agente: `a4-agy-guided-nav`, Gemini 3.8 Flash (High)
Issue #248 | Milestone #12 (Incontro tutor PEF del 12 ottobre 2026)

Nella chat guidata (`frontend/src/components/qsa/GuidedChatInterface.tsx`) i pulsanti
«Indietro» (`ChevronLeft`) e «Avanti» (`ChevronRight`/`CheckCircle2`) avevano visibilità
condizionale: «Indietro» spariva al primo passo (`index === 0`), alla conclusione e
in modalità essenziale; «Avanti» spariva all'ultimo passo, in modalità essenziale e nei
percorsi a intervista (`SAVICKAS`, `QPCC`, `QAP`, `EVENTO_*`, `OBIETTIVO_*`) fino
all'invio di 3 messaggi o al marker `[[AVANZA_STEP]]`.

Risoluzione:
- Comandi avanti e indietro resi sempre visibili nel DOM nella barra inferiore di navigazione.
- «Indietro»: abilitato se `phases.indexOf(currentPhase) > 0` e non in caricamento; disabilitato al primo passo.
- «Avanti»: abilitato se `hasNextPhase` (`phases.indexOf(currentPhase) < phases.length - 1`) e non in caricamento; disabilitato all'ultimo passo.
- Indicatore traguardo: mostra costantemente `Passo X/Y: Fase corrente → Fase successiva` quando esiste una fase successiva.
- Barra di navigazione mantenuta sempre visibile (`phases.length > 0`).
- Logica del percorso (`frontend/src/lib/interview-path.ts`): regole di transizione, prompt e quick replies rimaste intatte senza alterazioni.
- Test dedicato: `frontend/src/lib/guided-chat-nav.test.ts` verifica rendering continuo, stati disabilitati e integrità di `interview-path`.
- Documentazione operativa: aggiornata in `docs-counselorbot/funzionalita-counselorbot.md` (§ Chat, voce e ripresa) con `make guidance-refresh`.

Verifiche: `npm test` 593/593 superati; `make guidance-check` superato; zero regressioni.
Nessun Docker, deploy o sudo.

# Handoff a3: valutazione lingua ucraina per il QPCC (#243)
Data: 2026-10-17 | Branch: `docs/qpcc-ukrainian-evaluation` | Agente: `a3-agy-qpcc-ukrainian`, Gemini 3.8 Flash
Issue #243 | Milestone #12 'Incontro tutor PEF del 12 ottobre 2026'

Valutazione tecnica, redazionale e psicometrica sul supporto della lingua ucraina per il QPCC a seguito del quesito posto dai tutor del PEF nell'incontro del 12 ottobre 2026.

Esito della valutazione: supporto escluso per l'attuale perimetro operativo e di ricerca di CounselorBot, coerentemente con `APP_LOCALES` (`backend/content_versions.py: APP_LOCALES = ("it", "en", "es", "fr", "de", "sv")`). La menzione dell'ucraino nella scheda storica presentata ai tutor deriva dalla sperimentazione pilota del progetto europeo Erasmus+ PAGOSTE 2020 condotta con formatori VET (Margottini & Leproni, 2020; Ottone, 2023).

Documentazione e allineamenti prodotti:
- Documento di valutazione completo e studio di fattibilità con stima dello sforzo (10–12 settimane/persona in caso di apertura futura): `docs/validazione/valutazione-lingua-ucraina-qpcc.md`.
- Scheda bibliografica del QPCC aggiornata per chiarire le versioni linguistiche e le sei lingue servite da CounselorBot: `docs/questionari/strumenti/schede-bibliografiche/QPCC_it.md`.
- Aggiornamento della documentazione di validazione: `docs/validazione/dettagli-validazione-questionari.md`.
- Aggiornamento della documentazione operativa: `docs/operations/qpcc-factor-alignment.md`.
- Aggiornamento guida funzionalità: `docs-counselorbot/funzionalita-counselorbot.md` (e allineamento hash con `make guidance-refresh`).
- Aggiornamento diario di progetto: `docs/progetto/diario.md` (sezioni IT ed EN).

Verifiche eseguite: `make guidance-check` superato; test di coerenza di `APP_LOCALES` (`backend/content_versions.py`) e test di parità e schema QPCC (`test_qpcc_alignment.py`) passati. Nessun servizio dev avviato, nessun container/deploy/sudo necessario.

# Handoff g1: palette della Palestra di prova
Data: 2026-10-17 | Branch: `fix/practice-gym-palette` | Agente: `g1-opus-gym-palette`, Claude Opus 5.5 high
Compito Diario `2b1b88a5-d95b-412e-b134-a23cf4193319` | Issue #354 | Milestone #24

La card «Palestra di prova» della home `/docente` (`PracticeGymSection.tsx`) era
verde/teal (`emerald-*`, `teal-*`). Ora: bordo e gradiente petrol
(`indigo-200/90`, `from-indigo-50/50 via-white to-white`), badge «Simulazione
protetta» slate con scudo petrol, etichette slate, CTA d'ingresso
`ochre-600`/`ochre-700`, link «Taccuini di prova» `indigo-700`. Tolte da
`globals.css` le tre voci del remap rimaste orfane (`border-emerald-200/90`,
`from-emerald-50/70`, `to-teal-50/40`); guardia `teacher-area-dark-theme.test.ts`
aggiornata alle nuove tappe. Restano in verde solo i «Salvato» (ruolo success);
il teal di chat guidata e Bussola è di IDEA/Bussola, fuori perimetro. Contrasti
misurati: chiaro 4,65 (CTA ocra)–16,3:1, scuro 4,65–14,0:1. Regola in
`docs/design.md` §2.4. Schermate `teacher-area` della guida rigenerate nelle sei
lingue (una sola esecuzione `GUIDE_SCREENS=teacher-area`).

Verifiche: `npm test` 586/586 (Node 22), ESLint sui file toccati, `tsc --noEmit`.
Dev solo frontend su :3134 con fixture (`next dev --webpack`), fermato. Suite
browser non eseguite. Nessun Docker, deploy o sudo.

# Handoff d1: tema scuro area docente
Data: 2026-10-17 | Branch: `fix/teacher-area-dark-theme` | Agente: `d1-opus-teacher-dark`, Claude Opus 5.5 high
Compito Diario `915b2b9a-ac41-46e9-a801-ec21ce052f4f` | Issue #352 | Milestone #23

Nella home `/docente` le card «Progetta obiettivo per la classe» e «Palestra di
prova: studenti fittizi» (e il vuoto di «Le mie classi», l'hub risorse) restavano
chiare in tema scuro: tappe di gradiente, `bg-white/80|90`, testi
`emerald-800/900`, `indigo-950`, `red-900`, `amber-600` e varianti
`hover:`/`group-hover:` senza voce nel remap. Aggiunte le voci in fondo a
`globals.css` (le tappe ridefiniscono `--tw-gradient-*`), regola in
`docs/design.md` §6, guardia `src/lib/teacher-area-dark-theme.test.ts` (rossa su
main, verde ora). Tema chiaro identico al pixel; testi in scuro 5,3–13,9:1.
Pagine di destinazione (`/docente/taccuini-prova`, `/docente/catalogo-obiettivi`)
già leggibili. Verifiche: `npm test` 586/586, ESLint, `tsc --noEmit`. Dev
fixture solo frontend su :3134 con `next dev --webpack` (Turbopack rifiuta il
symlink `node_modules` del worktree), fermato. Nessun Docker, deploy o sudo.

# Handoff n12: menu mobile a gruppi (P5)
Data: 2026-10-17 | Branch: `feat/navbar-mobile-groups` | Agente: `n12-opus-navbar-p5`, Claude Opus 5.5 high
Compito Diario `4c7f91cd-4637-4950-803f-3e96d36762b3` | Issue #346 | PR #347 (bozza) | Milestone #21

Sotto 1024 px pulsante «Menu» con etichetta e pannello disclosure sotto la barra
(`HeaderMenu.tsx`, `#mobile-menu`): Vista attiva, Area, Supporto, Conversazione
(Riprendi in `#mobile-resume`), Account/Preferenze (`AccountItems` condiviso col
menu desktop). Righe Riprendi condivise (`ResumeList`). Contratto P0 mobile e
nuovi casi browser in `navbar-visibility.test.mjs`. Esito e limiti in
`docs/operations/navbar-visibility-tests.md` (sessione P5). Schermate della guida
rigenerate fino a `teacher-catalog` in sei lingue; `capture-guide.mjs` reso
compatibile con cataloghi collassati, home docente senza compilazioni e
ottimizzatore immagini del dev. Nessun Docker, deploy o sudo; nessun server
rimasto acceso.

# Handoff n11: Questionario di gradimento in home
Data: 2026-10-17 | Branch: `feat/home-feedback-cta` | Agente: `n11-opus-home-feedback`, Claude Opus 5.5 high
Compito Diario `71dd68ba-7e18-4f91-a92a-17d007620546` | Issue #342 | Milestone #21

«Questionario di gradimento» (`/questionario`) tolto dalla barra (icona `xl` e riga
del menu compatto; chiave `nav.feedback` rimossa). Nuovo `FeedbackEntry`
(`frontend/src/components/home/FeedbackEntry.tsx`): riquadro illustrato
«Dicci com’è andata» subito dopo «Vedi tutte le attività e i percorsi» e, per chi
non ha effettuato l’accesso (che su `/` vede la schermata «Accesso richiesto», non
la presentazione), sotto «Accedi a CounselorBot». Illustrazione decorativa
`frontend/public/images/intro/feedback.png` (alt vuoto, prompt nel README). Testi
`app.intro.feedback.*` e `guide.section2.body` nelle sei lingue; contratto P0
aggiornato; guardia in `navbar-terminology.test.ts`; screenshot `introduction`
della guida rigenerati con la nuova cattura mirata `GUIDE_SCREENS=introduction`.

Verifiche: `npm test`, `i18n:check`, `tsc --noEmit`, ESLint sui file toccati,
guidance refresh/check; suite browser navbar 93/93 + test home/anonimo su :3149.
`account-onboarding`: 5/7 test della presentazione verdi; i due a 320/390px
scadono anche senza la nuova card (`profiles.png` mai servita dal dev server in
concorrenza), bug sospetto registrato nel Diario. Gli altri screenshot della guida
a 1440px mostrano ancora l’icona del questionario in barra. Server dev :3149
avviato da `scripts/dev-navbar-tests.sh`; nessun Docker, deploy o sudo.

# Handoff n7: terminologia della navbar (P1)
Data: 2026-10-16 | Branch: `fix/navbar-terminology` | Agente: `n7-opus-navbar-p1`, Claude Opus 5.5 high
Compito Diario `881c2cf4-e5c4-49c7-a1fd-124fa37695ee` | Issue #337 | Milestone #21

Blocco P1 di `docs/operations/audit-navbar.md`, con le decisioni dell'utente:
«Area studente» resta (niente «Area personale»). Assistente generico in ES/FR/DE/SV
come in IT/EN (titolo e testi di accesso, che lo riservavano ai docenti); badge
strumento dell'header tradotto (`q.<codice>.name`, ripiego sul nome del catalogo e
sul codice degli strumenti dinamici; aggiunta `q.IDEA.name`). Glossario
`CONTEXT.md`, `funzionalita-counselorbot.md`, commenti di `roles.ts` e `Header.tsx`
allineati. Fixture P0 aggiornata solo per l'Assistente; nuova guardia
`frontend/src/lib/navbar-terminology.test.ts`. URL, ruoli e comportamento invariati.

Verifiche: `npm run i18n:check`, `npm test` 518/518 (Node 22, include P0 e naming
operativo), `tsc --noEmit`, ESLint sui file toccati, guidance check. **Suite browser
P0 non eseguita**: :3149 occupata dal dev server di un altro worktree e memoria
libera scarsa; va lanciata prima di togliere la PR dalla bozza. Restano invariati,
fuori perimetro: `admin.rolePreview.cap.teacherAssistant` (è davvero la capacità
docente) e gli screenshot della Guida ES/FR/DE/SV, che possono mostrare il vecchio
titolo dell'Assistente. Nessun server dev avviato, nessun Docker, deploy o sudo.

# Handoff s22: aggiornamento e verifica PR #310
Data: 2026-10-16 | Branch: `fix/budget-fallback-configured-provider` | Agente: `s22-cx-fix-310`
Issue #309, PR #310 | Milestone #18. Compito Diario `8bfb8212` lasciato invariato (`fatto`).

Completato il merge pendente di `origin/main` (`9e72bfc1`, PR #317) con
`cc98cbad`: conservate le modifiche RAG di main e il ripiego del budget dai
provider configurati. Incluso il manifest della documentazione già aggiornato
nel worktree e verificato con il controllo guidance.

Verifiche: routing/budget **22 passati**, frontend streaming/errori **19 passati**,
lint F di `ai_service.py` superato, controllo guidance e relativi **3 test** superati.
Smoke completo: **201 passati, 6 falliti identici** sul branch e su main
`9e72bfc1`, nella stessa immagine `counselorbot-budget-validation:s22` e sul
PostgreSQL isolato `cb-s18-test-pg`. Baseline main ottenuta sostituendo nell'immagine
le versioni originali dei cinque file backend modificati dalla PR. Nessuna
regressione aggiuntiva rilevata; nessuna modifica al codice necessaria.

Fallimenti preesistenti: quattro test accedono a `site_chat_routes.site_rag_index`
rimosso dal router (Diario `c9ec0514-ba28-4169-b00e-8a58279dca22`);
`test_rag_docs_dynamic_collection_upload_preview_and_delete` presume un build
sincrono dopo il cambio di ambito (Diario `79b1c34f-d0d6-4291-9806-96fb5054b035`);
`test_build_context_envelope_component_flags_disable_parts` resta il noto
`f6ff90ff-0b05-41f8-9ac7-0eaea2a302e9`. I due nuovi record sono confermati con
evidenze `test:` e agente `s22-cx-fix-310`.

Immagine backend ricompilata per verifica; nessun deploy o intervento sulla
produzione, nessun sudo, nessun nuovo server dev avviato.

# Handoff s19: indici per modello e reindicizzazione atomica (Blocco 5)
Data: 2026-10-16 | Branch: `feat/rag-index-per-model` | Agente: `s19-cx-blocco5-indici`, Codex gpt-6.1-sol high
Task `a960c2f4-399d-464e-afc2-c9fb35f2b187` | Issue #316, PR #317 | Milestone #18

`backend/rag_index.py`: generazioni immutabili per provider/modello/dimensione,
manifest JSON atomico sul percorso esistente, riconoscimento degli indici legacy
sul volume `rag_index`, cache incrementale e deduplica dei chunk. Build in
background con sessione DB e configurazione proprie, lock cross-worker, snapshot
coerente dei lettori, BM25 durante il build, precedente indice conservato dopo
errori di embedding o pubblicazione. Controllo shape/valori finiti della query,
ricostruzione anche se cambia la dimensione dietro lo stesso alias. Pulizia delle
generazioni orfane dopo 24 ore; eliminazione delle collezioni sotto lo stesso lock.

`estimate_reindex()` e `embedding_service.estimate_cost()` sono riusabili dal
Blocco 6: stima offline token/costo, cache/duplicati, prezzi configurabili,
prezzo sconosciuto esplicito, vincoli privacy rispettati. `POST /site-chat/reindex`
restituisce `building`, `stats`, `estimate`; polling su `/site-chat/stats`.
Anche upload, delete e ambito documenti usano il worker. UI dedicata al Blocco 6;
Guida interfaccia e screenshot rivisti: nessun layout o testo UI nuovo.
Contratto storage/API/rollback in `docs/operations/rag-index-versions.md`.
Integrata PR #313 con merge di `origin/main` b827d676: conservati filtro PII,
`vector_query` senza punteggi, blocco delle memorie esterne e `api_publishable`.

Verifiche finali dopo merge privacy: 162 test + 6 sottotest verdi su PostgreSQL
effimero in tmpfs, rete Docker interna senza porte pubblicate (provider, privacy,
versioni RAG, BM25, degradazione, Markdown/PDF, guida). Nuovo modulo: 21 test,
compresi corpus vuoto e cache legacy non valida. Ruff F, format del modulo di
test nuovo, mypy locale (3 moduli), guidance-refresh/check e rebuild dell'immagine
isolata `counselorbot-rag-index-validation:s19` verdi. La CI dedicata verifica
anche mypy con tutti gli SDK. Il primo giro guida su SQLite era incompatibile
con `artifact_session`, poi rieseguito su PostgreSQL; il passaggio locale mypy
con SDK completi è stato interrotto dopo l'esito verde della stessa verifica CI.
Nessun provider live, deploy, sudo, `.env`, stack portabile o dato produttivo
modificato. Nessun server dev avviato; container e rete temporanei di test rimossi.

Bug Diario: `ee5ffca7` (indice attivo cancellato prima del nuovo build),
`e7d27479` (shape query non verificata), `97ff2519` (import inutilizzato nella
rotta site-chat), `e7e58b52` (collezione vuota con dimensioni esplicite),
`a41de8b2` (cache legacy con vettori a zero colonne). I bug `089e7cd5`, `54e4d065`, `c996ef4c` erano già risolti dai
blocchi precedenti. Bug non registrati: nessuno.

# Handoff s16: politica privacy degli embedding (Blocco 4)
Data: 2026-10-16 | Branch: `feat/embedding-privacy-policy` (da `origin/main` 2c97dc0d)
Agente: `s16-op-blocco4-privacy`, Claude Opus 5.5 high | Task `4b69ef06-e952-4dd4-a9cb-24e55d7a05cb` | milestone #18

Il guard temporaneo del blocco 3 è sostituito dalla politica in
`embedding_service.embed_texts` (unico punto di uscita, nessun bypass da config):
`purpose="private"` (MemoryEmbedder: memorie, episodi, strategie, catalogo) mai
esterno; documenti solo da corpus pubblico; query solo verso corpus pubblico e
dopo `filter_external_query` (stesso filtro PII della chat, sempre applicato;
`block` con NER giù → BM25 senza cooldown; punteggi tipo 4/9, 75% e date rimossi;
massimo 4000 byte). La chat guidata passa `vector_query` senza `scores_context`
quando il provider è esterno. Collezioni dinamiche: flag `api_publishable` in
`.collection.json` (default false, PATCH `/admin/rag/collections/{slug}`, casella
nel pannello Documenti RAG), letto a ogni uso. OpenRouter riceve
`provider: {data_collection: deny, zdr: true}`: non verificato sull'API reale
(se nessun endpoint ZDR serve il modello, errore → BM25).

Testi: sezione «Ricerca nei materiali» in `/guide/dati-riservatezza` (6 lingue),
`docs/protocollo-sperimentazione.md` §7 con segnaposto del fornitore configurato,
`embedding-providers.md`, CONTEXT, funzionalità. Informativa/DPA da rivedere
con il titolare: i testi non sono formulazioni legali.

Test: `backend/tests/test_embedding_privacy.py` (19) + suite provider/RAG; suite
ampia su Postgres 16 usa e getta (porta 55447, container già rimosso).
PR #313 in bozza, issue #312. Fallimenti preesistenti su main in
`test_smoke.py`: bug `6c8f223f` e `47a13138`. Nessun deploy, sudo o `.env`.

# Handoff s15: provider embedding configurabile (Blocco 3)
Data: 2026-10-16 | Branch: `feat/embedding-provider-configurable` (da `origin/main` 49e8e9fa)
Agente: `s15-cx-blocco3-provider`, Codex gpt-6.1-sol high | Task `a1d1ce5e-1b67-4f6c-a7b8-1699aebde7ae` | Issue #306, PR #307, milestone #18

Backend: `embedding_service.py` smista Ollama, Mistral, OpenRouter e none;
modello/dimensioni/prezzi persistono in Config via API admin esistente. Default
Ollama preservato; modello esterno vuoto seleziona mistral-embed o
OpenRouter google/gemini-embedding-2 a 768 dimensioni. Al cambio provider cancellare
il vecchio embedding_model o salvare il nuovo modello. Gli altri cinque provider
sono riservati e falliscono con errore classificato, senza chiamate esterne.
Log separato per batch pagato, costo configurabile per modello, budget ricontrollato
tra batch, chiavi di sistema risolte da env senza credenziali personali.

Guard esplicito prima del blocco 4: all’esterno solo documenti dei quattro corpus
pubblici predefiniti. Query sempre BM25 quando il provider è esterno; memorie
sempre locali/keyword; collezioni dinamiche mai inviate. Nessun flag di bypass.
Identità cache/cooldown separate per provider/modello/dimensioni; percorsi indice e
build atomico restano al blocco 5. UI dedicata al blocco 6.

Documentazione: `docs/operations/embedding-providers.md`, CONTEXT, funzionalità e
manifesto guida. Guida UI/screenshot rivisti: nessuna nuova UI in questo blocco.
Rebuild isolato `counselorbot-embedding-validation:s15` riuscito, niente deploy,
sudo, .env, dati/porte di produzione o stack portabile modificati.

Verifiche locali: 86 test provider/RAG + 3 sottotest, 72 test routing/PII e 3 test
guida verdi; Ruff F sui moduli coinvolti, format dei file nuovi, mypy locale e
guidance-check verdi. Mypy con SDK completi ha rilevato il timeout OpenAI tipizzato
come httpx2: corretto usando il timeout numerico supportato da entrambe le versioni
(bug `393dd8a3`), con test SDK su trasporto finto. Il workflow Document retrieval
esegue Ruff, mypy con tutte le dipendenze e la suite offline. Politica consegna:
rendere pronta PR #307 solo dopo tutti i check verdi; nessun merge o deploy manuale.

Bug Diario: `eea9b649` (refuso cooldown/cleanup SDK introdotto e corretto prima del
commit); `8ef0d4ef` (fixture test senza prompt_revisions, corretto, suite verde).
`615f4a79`: F401 os inutilizzato preesistente in backend/main.py: resta fuori ambito;
Ruff dell’intero file main.py non è verde. Nessun bug non registrato.
I bug 089e7cd5, 54e4d065, c996ef4c risultano già risolti dai blocchi precedenti.

# Handoff s14: BM25 sempre attivo e fusione RRF (Blocco 2)
Data: 2026-10-16 | Branch: `feat/rag-bm25-always-on` (da `origin/main` e03f4ab1)
Agente: `s14-cx-blocco2-bm25`, Codex gpt-6.1-sol high | Task `123d2d01-3ba7-4378-99c2-2a0e75e407c6` | Issue #304

`backend/rag_index.py`: BM25 puro Python/numpy persistito nel JSON della
collezione prima degli embedding; tokenizzazione per sei lingue UI, accenti,
metadati di titolo/nome file, codici fattore preservati. Modalità Python
`hybrid|lexical|vector`, RRF k=60 prima di pesi/cap/grafo; errori/cooldown
embedding lasciano BM25 disponibile. Vale per collezioni dinamiche, chat guidate
ed assistente del sito senza modificare i chiamanti. Nessun provider esterno o
configurazione Admin anticipata. Garanzia grezza corretta per rispettare il cap
per sorgente (bug Diario `4cd31859`).

Verifiche: suite retrieval/Markdown/degradazione/guida, 59 test + 3 sottotest
verdi con PostgreSQL effimero su rete Docker interna, nessuna porta pubblicata;
ruff F, mypy del modulo, test e controllo platform guidance. Benchmark reale:
7.641 chunk, host build 15,171 s, query mediana/p95 25,682/47,574 ms; dettagli,
limiti Docker e procedura in `docs/operations/rag-bm25.md`. Workflow CI dedicato
`Document retrieval` con embedder finti. Immagine di verifica isolata
`counselorbot-bm25-validation:s14`; nessun deploy, sudo, `.env` o stack portabile
toccato. Provider live/qualità LLM non verificati, fuori da questo blocco.
I bug già noti `089e7cd5`, `54e4d065`, `c996ef4c` risultano già risolti da PR #303.

Bug non registrati: nessuno (il primo tentativo senza env del Diario è stato
ripetuto correttamente con le variabili del progetto). Il bug transitorio
`fffbc5a2` introdotto durante l'editing è stato corretto prima del commit e il
relativo test Markdown è verde.

# Handoff S9: «Percorsi di classe» diventano «Piano operativo»
Data: 2026-10-16 | Branch: `feature/rename-class-paths-operational-plan` (da `origin/main` b61064ab) | Agente: `s9-piano-operativo` | Task `a09fa477`
Ambito scelto dall'utente: testi visibili + URL. API backend, nomi interni nel codice e schema DB invariati (nessuna migrazione).

## Inventario (prima delle modifiche)

Rotte frontend della funzione:
- `/docente/percorsi` (Area docenti, slug `percorsi` in `lib/teacher-area.ts`, breadcrumb in `lib/teacher-breadcrumbs.ts`, chiavi slug in `lib/i18n-teacher-area.ts`).
- `/profilo/percorsi`, `/profilo/percorsi/{path}/{step}`, `/profilo/percorsi/{path}/{step}/approfondimento` (Area personale, slug `percorsi` in `lib/personal-area.ts` e `lib/i18n-personal-area.ts`).
- Generate dal backend: `start_href` in `backend/path_step_types.py` (`/profilo/percorsi/{path}/{step}[/approfondimento]`), salvato solo nelle risposte, non nel DB.
- Link interni: `ClassPathHeroCard`, `AdministrationStepFlow`, `ResultsDeepDiveFlow`, `lib/forum.ts` (`/profilo/percorsi#class-step-N`), `DidacticDesignSection`, `app/docente/somministrazioni/page.tsx` (`?class=`), `app/guide/page.tsx` (TEACHER_ROUTES).
- `?tab=paths` di `/docente/classi/{id}` e `/admin/classi/{id}`: chiave tecnica inglese come `students`/`toolsTab`, non contiene il nome della funzione → resta invariata.

Testi della funzione (6 lingue it/en/es/fr/de/sv), file dedicati in cui ogni «percorso» è il percorso di classe salvo «percorso guidato»:
`i18n-class-paths.ts`, `i18n-path-publication.ts`, `i18n-path-templates.ts`, `i18n-path-forum.ts`, `i18n-path-assignments.ts`, `i18n-administration-steps.ts`, `i18n-step-kinds.ts` (solo le righe sul percorso della classe).
File misti (solo chiavi della funzione): `i18n-teacher-area.ts` (nome, descrizione, breadcrumb, vuoto, hero progettazione), `i18n-class-settings.ts` (scheda, card panoramica con descrizione oggi sbagliata «Percorsi guidati…», «Visualizza percorsi»), `i18n-personal-area.ts`, `i18n-guide-audiences.ts` (distinzione, sezione docente 9), `i18n.ts` (`guide.section17`, prompt assistente docente `cb_console`/`cb_guida`), `i18n-forum.ts` (`guideLinks`), `components/teacher/class-group-texts.ts` (`percorsiPath`).

NON toccare (altri usi di «percorso»): percorsi guidati/chat guidate degli strumenti (`GuidedStep`, «Percorso guidato», `chooseGuidedPath`, `chatStandalone`), «Il mio percorso»/journey personale (`i18n-goals`, `cb_percorso`, gruppo Area personale), PDF «Percorso dell'obiettivo», «Scelta del percorso» (segnalazioni), percorsi narrativi/pQBL, «Percorso di navigazione» (aria breadcrumb), «percorso DOCENZA», Modelli (restano «modello», cambia solo «un percorso generale» → «un piano operativo generale»).

Backend: nessun testo visibile della funzione (errori API in inglese tecnico, non mostrati come tali) → cambia solo `start_href`.
Email/notifiche: nessuna email/notifica nomina la funzione (verificato con grep backend).
Immagine guida `public/guide/*/teacher-class-paths.png`: screenshot con l'etichetta vecchia; non rigenerata (serve ambiente con dati), segnalata.

## Nome per lingua (coerente col registro esistente, genere invariato rispetto a percorso/itinerario/parcours/Pfad/väg)
IT piano operativo / piani operativi · EN operational plan(s) · ES plan(es) operativo(s) · FR plan(s) opérationnel(s) · DE Arbeitsplan / Arbeitspläne · SV arbetsplan / arbetsplaner.

## Piano
1. URL: `app/docente/percorsi` → `app/docente/piani-operativi`, `app/profilo/percorsi` → `app/profilo/piani-operativi`; slug `piani-operativi`; redirect permanenti (308) in `next.config.ts` per `/docente/percorsi` e `/profilo/percorsi/:path*` (query e #ancora conservate); `start_href` backend e link interni aggiornati. Test: redirect in `lib/` (config) + backend `start_href`.
2. Testi: tutte le chiavi sopra nelle 6 lingue, articoli e plurali; test che nessun testo della funzione nomini più percorso/class path/itinerario de clase/parcours de classe/Klassenpfad/klassväg e che le 6 lingue ci siano (`npm run i18n:check`).
3. Test live Playwright (`frontend/tests/*.mjs`) aggiornati ai nuovi URL/testi (eseguiti solo se l'ambiente lo consente).
4. Documentazione: `docs-counselorbot/funzionalita-counselorbot.md`, Guida interfaccia (testi `guide.*`), `CONTEXT.md` (glossario), `make guidance-refresh` + `check-platform-guidance.py --check`.
5. Verifiche: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` (isolato), pytest backend mirati.

## Esito

Issue #298. Fatto come da piano; in più: due testi che chiamavano «percorsi guidati» i piani
operativi (hero progettazione didattica, card panoramica classe) o «class path» il percorso
guidato Obiettivo (guida docente, EN/DE) ora dicono la cosa giusta; testi mancati
dall'inventario iniziale e corretti: rifiuto di eliminare un'assegnazione che è un passo,
nota sui blocchi admin. `percorsiPath` in `class-group-texts.ts` è inutilizzato (lasciato, solo
tradotto). Screenshot studente della Guida rigenerati (`GUIDE_SCREENS=class-paths`, API
sintetiche); quello docente non contiene il nome ed è identico.

Verifiche (Node 22; build e `next start` su 127.0.0.1:3189 senza backend; PostgreSQL 15 su
tmpfs con `--network none`, immagine `counselorbot-goal-focus-validation:20261015-s6` con copia
del ramo; nessun container o dato di produzione toccato, nessuna chiamata LLM):

| Controllo | Esito |
| --- | --- |
| `npm test` (con `operational-plan-naming.test.ts`) | 495/495 |
| `i18n:check`, `tsc --noEmit`, `next build` | ok |
| `npm run lint` | 6 errori preesistenti in file non toccati |
| Redirect vecchi URL (`curl`) | 308 con query conservata, nuove pagine 200 |
| pytest mirati (class paths, deep dive, forum/assegnazioni, incontri, IT administration, guida) | 194 + 15 + 52 passati dopo i fix |
| Browser: add-step, placement, path-templates, class-meetings, individual-meetings, forum, assignment-delete | verdi |
| Browser: guide-audiences | 10/12; 2 timeout di `reload` a 1440px dopo le asserzioni (`802ea9ab`, sospetto) |
| Browser: teacher-area-home | rosso preesistente su «Cataloghi» (`b13c1129`) |
| Browser: guided-chat-follow-up | rosso su colloquio individuale, logica non toccata (`dd958fd5`, sospetto) |
| `make guidance-check` | allineato |

Bug registrati: `95c5c68b` (stato guida registrato da albero sporco, corretto qui col refresh),
`a227b327` (test rotte Area personale: pagine dei passi non documentate e regex senza
maiuscole, corretto qui), `b13c1129`, `dd958fd5`, `802ea9ab`. Bug non registrati: nessuno.

Passi manuali: nessun sudo, nessuna migrazione, nessun allineamento prompt; al deploy
ricostruire le immagini frontend e backend.

# Handoff S8: fasi Obiettivo con etichette d'azione e marcatore sempre nascosto
Data: 2026-10-15 | Branch: `feature/goal-guided-phase-redesign` (da `origin/main` d5edc358) | Agente: `s8-fasi-obiettivo` | Task `155e1298`
PR: https://github.com/nugh75/counselorbot-sbs/pull/293 (Project CounselorBot, verso `main`). Revisione cross-modello: a scelta dell'utente.

## Piano (scritto prima delle modifiche)

Indagine (fatti): fasi = righe `guided_steps` seminate da `prompt_config._OBIETTIVO_STEP_SPECS`
solo su strumento vuoto (in produzione: 9 righe docenza, 0 studio); il client aggiunge
`questions` e `conclusion` (`GuidedChatInterface.tsx`); etichette `label`/`label_i18n` del DB
(`guided_step_label_i18n.py`). Marcatore: tolto dal client solo a fine stream; il backend
salva `bot_response` grezzo nei `Log`, e PDF, conversazione dell'Area personale, sintesi dello
step e prove del percorso li rileggono così (`routes/survey.py`, `journey_context.py`,
`session_ledger.py`). PDF: `_latin1` trasforma ’ “ ” – — … in `?`; legenda stampata sempre.
Avanzamento completo Obiettivo: il marcatore mostra solo un suggerimento, la persona deve
chiedere di andare avanti e ogni apertura riformula l'obiettivo.

1. Marcatore nascosto ovunque: un filtro backend (`control_markers.py`) applicato dove si
   rileggono i log (PDF/testo, conversazione mostrata, sintesi, prove, voce) e un filtro
   frontend (`lib/control-markers.ts`) su streaming, rendering, ripresa. Il meccanismo di
   avanzamento delle altre chat non cambia. Test su più strumenti ed export.
2. Fasi Obiettivo (studio e docenza): passaggio iniziale unico «Presentazione e accordo»
   (`*-intro`, ora passo dell'accordo con il pulsante Accetto) + 5 fasi:
   `*-partenza` Cosa vuoi che imparino / Cosa voglio imparare · `*-livello` Rendiamo
   l'obiettivo preciso (Bloom, SMART, sfida come controlli interni) · `*-piano` Come ci
   arriveranno / Come ci arrivo · `*-verifica` Come verificherai che ci sono riusciti / Come
   capirò di avercela fatta · `*-final` L'obiettivo finale (sintesi + scelta di salvataggio).
   Id invariati: niente migrazione di schema. `*-patto`, `*-smart`, `*-sfida` escono dai
   default; sulle installazioni esistenti vengono nascosti in lettura solo se il loro testo è
   di fabbrica (stessa regola di «Allinea prompt di fabbrica»), mai cancellati; le etichette di
   fabbrica vecchie si leggono con le nuove, quelle personalizzate restano. Niente
   «Domande e Approfondimenti» né «Conclusione» per gli Obiettivi.
3. Avanzamento completo Obiettivo come l'essenziale: risposta completata con marcatore →
   fase successiva; apertura che avanza solo in «Rendiamo l'obiettivo preciso» se già definito;
   sintesi mai. Contratto runtime: apertura con una frase su cosa si fa ora, nessuna
   riformulazione identica, nessuna richiesta di conferma, una domanda in parole semplici,
   bozza solo da ciò che è stato detto o dal contesto dichiarato con la fonte, dettagli
   concordati conservati; sintesi con Bloom coerente col verbo, destinatari come soggetto in
   docenza, criterio che non controlla i requisiti segnalato; nessuna domanda su di sé.
4. Testi di fabbrica (passi, presentazione, sistema intervista/sintesi) riscritti; hash
   precedenti registrati in `prompt_factory_legacy.json` → applicati solo con «Allinea prompt
   di fabbrica». Il contratto runtime vale subito anche senza allineamento.
5. Compatibilità: snapshot congelati e memoria con fasi ritirate mappati (patto→intro,
   smart/sfida→livello, questions/conclusion→final) senza rigenerare l'apertura.
6. PDF: caratteri tipografici resi, legenda solo con punteggi per fattore.
7. Test backend/frontend, documentazione (`goal-focused-definition.md`, `CONTEXT.md`).

Aggiunta di perimetro (utente, via Timoniere): il segnale resta nascosto in TUTTE le chat,
con codice condiviso nel percorso comune, registro unico, guardia sui tipi di chat
registrati e documentazione per le chat future (`docs/operations/control-markers.md`).

## Esito

Contratti: `docs/operations/control-markers.md` (segnali) e
`docs/operations/goal-focused-definition.md` § «Percorso completo» (fasi Obiettivo).
Scostamenti dalla proposta, motivati dal codice: presentazione e accordo restano lo step
`*-intro` (ora step d'accordo), il patto non è più un passo; le fasi tengono gli id
`partenza/livello/piano/verifica/final` per non toccare snapshot e log; Studio usa
«Come capirò di avercela fatta» (forma neutra rispetto al genere).

Verifiche (PostgreSQL tmpfs su rete Docker interna `counselorbot-goal-phases-s8`, immagine
`counselorbot-goal-focus-validation:20261015-s6` con una copia del backend del ramo, nessun
dato reale, nessun provider, nessun container produttivo toccato; `next dev` su
127.0.0.1:3158 con API tutte simulate, fermato a fine lavoro):

| Controllo | Esito |
| --- | --- |
| `test_control_markers.py` (guardia: 14 tipi di chat × 2 rotte, cronologia, PDF) | verde; per mutazione (estrazione tolta) 28/28 rossi |
| `test_goal_phase_redesign.py`, `test_pdf_export_text.py` | 24 + 2 verdi |
| 31 suite mirate (obiettivi, contratto, prompt, allineamento, revisioni, PDF, eventi, taccuini, docenza, ledger…) | 1141 passed |
| `test_smoke.py` + `test_chat_preparation.py` | 2 failed, 211 passed: stessi 2 dell'immagine base (`f6ff90ff` e `test_all_steps_and_languages…`) |
| Frontend `npm test` | 491 passed |
| Browser `chat-preferences.test.mjs` | 3 test Obiettivo (essenziale, completo, snapshot su fase ritirata) e i 2 QSA verdi; 6 rossi tutti sul selettore «Formato» (difetto preesistente `dace5f97`, codice non toccato) |
| `tsc --noEmit`, `npm run build` | 0 errori (esclusi i moduli `.png` senza `next-env.d.ts` generato) / build riuscita |
| `npm run lint` | i18n ok; 6 errori preesistenti in file non toccati (`50db1e7c`) |
| `make guidance-check` | allineato dopo `guidance-refresh` |

Passo manuale dopo merge e deploy (nessun sudo): Amministrazione → **Allinea prompt di
fabbrica** (con il controllo in sola lettura del documento operativo). Senza, filtro dei
segnali, fasi, etichette, avanzamento, PDF e contratto runtime funzionano subito; i testi
DB di presentazione e passi restano quelli vecchi (es. «7 passi»).

Limiti: nessuna chiamata a modelli; verificate consegna al modello e meccanica, non la
qualità delle risposte reali. Il pannello admin degli step mostra ancora le righe e le
etichette salvate (patto/SMART/sfida inclusi). La scheda strumento nel DB resta col testo
precedente (`c44c5f4a`).

Bug del Diario risolti qui: `5a883270`, `589f502e`, `c498289a`, `0f1d6b34`, `7ec58d51`,
`cdd6b63d`, `510fe79f` (`0f6c3351` scartato, accordo col pulsante invariato). Registrati:
`58beb31e` (ambiente di test senza `backend/__init__.py`), `c44c5f4a` (scheda strumento).
Bug non registrati: nessuno.

# Handoff S6: Obiettivi, un focus preciso e una bozza presto (blocco 2)
Data: 2026-10-15 | Branch: `feature/goal-guided-focused-definition` (stacked su
`fix/goal-guided-group-context`, PR #291) | Agente: `s6-obiettivi-focus` | Task `13b12039`
PR draft stacked: https://github.com/nugh75/counselorbot-sbs/pull/292 (Project CounselorBot). Revisione non Claude obbligatoria prima del merge.

Contratto e procedura: `docs/operations/goal-focused-definition.md`. In sintesi:

- `backend/prompt_contract.py`: contratto runtime `[OBJECTIVE FOCUS]` in
  `[TURN CONTRACT]` per OBIETTIVO_DOCENZA/STUDIO, fasi `definition` (partenza →
  sfida, essenziale focus/smart), `design` (piano, verifica, essenziale plan),
  `synthesis` (sintesi); presentazione e patto esclusi. Un focus preciso,
  priorità proposta e altri risultati da parte, bozza modificabile presto, una
  domanda sul dato mancante, riuso di taccuino/classe/turni, Bloom e SMART come
  controlli delle lacune, niente invenzioni, niente autointerrogazione. Vale
  anche sui testi DB personalizzati senza riscriverli.
- `backend/prompts/obiettivo_*.md` e i due system prompt: stessi criteri nei
  testi di fabbrica (ordine e numero dei passi invariati, patto invariato).
- Presentazione (bug `f8e237bd`): sistema e step con un unico mandato (un solo
  invito facoltativo), segnaposto risolti per strumento (`prompt_config.py`).
- `backend/qsa_essential.py` + `chat_preparation.py`: fasi essenziali Obiettivo
  con apertura/risposta; si chiudono su `[[AVANZA_STEP]]`. `chat_logic.py`:
  descrizione del percorso senza «tre risposte». QSA invariato.
- Frontend: `chat-preferences.ts` (`essentialReplyPhase`,
  `essentialSignalAdvances`, etichette e aiuto in sei lingue),
  `GuidedChatInterface.tsx` (la risposta resta nella fase; avanzamento solo su
  risposta completata col marcatore, apertura di «completare l'obiettivo» se già
  definito, «Passa al prossimo tema» invariato). Guida §7 in sei lingue.
- `prompt_factory_legacy.json`: nuovi hash accanto ai precedenti (20 chiavi).

Cambiamenti visibili dell'essenziale Obiettivo: aiuto «3 fasi brevi (focus,
obiettivo, piano)…»; fasi *Focus e prima bozza*, *Completare l'obiettivo*,
*Piano e prova* / *Attività e verifica*, *Sintesi*; una fase può durare più
risposte; al passaggio compaiono separatore e breve apertura della fase.

Esempi sintetici prima/dopo (costruiti dai mandati, **non** output di un modello):
nel documento operativo. Nessuna chiamata a provider, nessuna conversazione LLM.

Verifiche (PostgreSQL tmpfs su rete Docker interna `counselorbot-goal-focus-s6`,
immagine `counselorbot-goal-focus-validation:20261015-s6`, nessun dato reale,
nessun container produttivo toccato; dev server Next su 127.0.0.1:3151 con API
tutte simulate dai test):

| Controllo | Esito |
| --- | --- |
| Riproduzione bug `f8e237bd` (script su `prompt_config`) | immagine blocco 1: 4 violazioni, exit 1; questo ramo: OK |
| `test_goal_focused_definition.py` | 36 passed |
| 16 suite mirate (autointerrogazione, preferenze chat, file prompt, allineamento/aggiornamenti/revisioni prompt, mappa prompt, docenza, contesto docente, obiettivi, taccuini, deriva coppie) | 965 passed |
| `test_smoke.py` | 206 passed, 1 failed: baseline noto `f6ff90ff` (`'domanda' == ''`), invariato |
| Suite backend completa, confronto con immagine blocco 1 | interrotta dal tetto di memoria Docker (4 GB condivisi con la produzione) a `test_path_publication`; i 15 file con F/E fino a lì (migrazioni, concorrenza, amministrazione IT/in-app, credenziali istituto, diagrammi, orientamento, `test_chat_preparation`) danno **gli stessi 103** FAILED/ERROR su immagine blocco 1 e su questo ramo: richiedono DB/servizi dedicati (es. URL `127.0.0.1:18650`), non toccati qui |
| Frontend `npm test` | 483 passed (10 nuovi) |
| Browser `chat-preferences.test.mjs` | nuovo test Obiettivo e test QSA «failed essential turn»/«complete QSA» verdi; 3 test rossi anche con i file di HEAD (selettore Formato spostato): Diario `dace5f97`, confermato |
| `npm run build` (Webpack), `tsc --noEmit` | superati, 0 errori |
| `npm run lint` | i18n ok; file modificati senza errori; 6 errori ESLint preesistenti in 6 file non toccati (Diario `50db1e7c`) |
| `make guidance-refresh/check` | superati |

Passo manuale dopo merge e deploy (non eseguito, nessun sudo): Amministrazione →
**Allinea prompt di fabbrica**, con controllo preventivo in sola lettura indicato
nel documento operativo. Senza questo passo, sulle installazioni esistenti il
contratto runtime e l'essenziale funzionano subito, ma i testi DB degli step e
la presentazione (bug `f8e237bd`) restano quelli vecchi.

Limiti: verificata la consegna al modello e la meccanica, non la qualità di
risposte reali (serve valutazione autorizzata con modello). Selezione classi
invariata dal blocco 1 (barra del composer). Dopo la sintesi essenziale un
messaggio libero usa ancora il compito di sintesi (comportamento preesistente,
Diario `c5fd53ac`, sospetto, non corretto: fuori contratto).

Bug del Diario: `f8e237bd` risolto qui (fix + test). Registrati: `dace5f97`
(test browser Formato, baseline), `c5fd53ac` (approfondimento dopo la sintesi).
Bug non registrati: nessuno.

# Handoff S5: contesto classi della chat Obiettivi docente (blocco 1)
Data: 2026-10-15 | Branch: `fix/goal-guided-group-context` | Agente: `s5-obiettivi-contesto-auto`
PR draft: https://github.com/nugh75/counselorbot-sbs/pull/291 (Project CounselorBot). Revisione non Claude obbligatoria prima del merge.

Contratto stabile per il successore (blocco 2, prompt/focus/progressione):
`docs/operations/docenza-group-context.md`. In sintesi:

- `group_ids` viaggia a ogni turno ed è salvato nello snapshot congelato
  (`FrozenSessionCreate`/`FrozenSessionDetail`, JSON esistente, assente → `[]`).
  Ripresa = selezione della sessione (vuota per snapshot vecchi); chat nuova =
  preferenza del browser visibile nella barra. Cambio selezione → autosalvataggio.
- Ogni turno: solo classi attive proprie/condivise, anche per l'admin; condivisioni
  confrontate in minuscolo come salvate. Revoca/disattivazione immediate.
- Barra: `/admin/groups?own=true` (stesso insieme del builder); senza `own` la
  gestione admin resta invariata. Hint: default docenza = classi incluse.
- Componente `profile` spento: fuori taccuino docente, classi e taccuino di prova;
  restano `[SIMULATION]` e punteggi come nel ramo studente.
- Invariati: opt-in `context_visible_to_students`, `TeacherNote` mai nel contesto,
  student/practice/none escludono le classi, nessun cambio auth/consenso/punteggi.

Bug del Diario corretti e verificati con test: `b06f03a8` (snapshot),
`e0929d44` (hint), `9a8571fc` (profile=false, solo locale), `caa98bfa` (admin e
co-docente con maiuscole nel nome utente: stessa classe di disallineamento).
Riprodotti prima del fix: 5 test nuovi rossi sul codice originale.

Verifiche (PostgreSQL tmpfs su rete Docker interna, nessun dato reale, nessun
container produttivo toccato):

| Controllo | Esito |
| --- | --- |
| `test_docenza_group_context.py` sul codice originale | 5 failed, 4 passed (riproduzione) |
| Stessa suite dopo il fix | 9 passed |
| Regressione contesto/classi/forum/obiettivi/assegnazioni/percorsi (17 file, sorgenti montati) | 391 passed, 6 skipped (4 inizialmente rossi solo per `docs/` non montato, poi verdi) |
| Immagine backend ricostruita `counselorbot-goal-context-validation:20261015-s5`, 9 file mirati | 177 passed, 6 skipped |
| Smoke + livelli contesto + prompt + autointerrogazione, stessa immagine | 1058 passed, 1 deselected |
| Smoke `component_flags_disable_parts` | 1 failed, baseline noto `f6ff90ff` (`'domanda' == ''`), invariato |
| Frontend `npm test` | 473 passed |
| `npm run build` (Webpack) | superato |
| `tsc --noEmit` dopo il build (genera `next-env.d.ts`) | 0 errori |
| `npm run lint` | i18n ok; 6 errori ESLint preesistenti in 6 file non toccati (identici a `origin/main`, Diario `50db1e7c`); file modificati senza errori né avvisi |
| `make guidance-refresh/check`, check `--base origin/main` | superati |

Limiti: la selezione classi resta nella barra del composer (non prima del primo
turno); nessuna prova browser end-to-end, la ripresa è coperta da test unitari
del ripristino e da test API dello snapshot. Guida UI nelle sei lingue rivista:
il testo esistente resta corretto, nessuno screenshot da rigenerare.

# Handoff: autointerrogazione e scaffolding metacognitivo
Data: 2026-10-15 | Branch: `feature/self-questioning-metacognitive-scaffolding`

- Ambito: tutte le chat guidate dei questionari QSA, QSAr, ZTPI, QPCS, QPCC, QAP
  e Savickas, anche con Iride. Cambia il modo di porre domande, non la struttura:
  numero/ordine dei passi, domande previste, consenso, punteggi e avanzamento
  restano invariati. IDEA, Eventi, Obiettivi e chat libera restano fuori ambito.
- `backend/prompt_contract.py`: invito contestualizzato dopo il profilo; esplorazione
  graduale e adattiva, una domanda principale per turno; autointerrogazione
  facoltativa a fine area, sostegno leggero prima degli esempi, accoglienza delle
  domande spontanee e del rifiuto. Nessun nuovo turno richiesto, nessuna condizione
  aggiunta per proseguire: si conserva la navigazione specifica di ogni strumento,
  senza riaprire le aree già lasciate. Accordi e introduzioni sono esclusi; il
  percorso essenziale conserva i suoi compiti e la sintesi senza altre domande.
  Il contratto segue i testi DB anche nelle varianti Totale/Ristretto/Minimo:
  non occorre migrare o riscrivere prompt personalizzati.
- `backend/chat_preparation.py` e `backend/journey_context.py`: nella riduzione
  delle conversazioni lunghe dei sette questionari si richiede di conservare testualmente le domande
  personali, le correzioni, i ritiri e la distinzione rispetto ai suggerimenti del
  counselor. Si usa la trascrizione già persistita; nessuna nuova tabella o stato
  inferito. La fedeltà della riduzione generativa resta dipendente dal modello.
- `backend/tests/test_self_questioning.py`: envelope reali in sei lingue,
  tutti i passi dei sette strumenti e follow-up con risposte approfondite/terse, difficoltà iniziale e
  persistente, domanda spontanea e rifiuto; parità Prompt Lab/runtime, varianti
  compatte, consenso invariato, sintesi con correzioni e attribuzione, isolamento
  per persona/sessione e nessuna evidenza generata per sessioni vuote. Verificati
  anche compiti del percorso essenziale e invarianza delle definizioni dei passi.
- Documentazione: riferimento funzionale aggiornato e manifest guidance rigenerato.
  Guida UI nelle sei lingue e screenshot esaminati: descrivono la navigazione e
  conservano validità; nessuna modifica a controlli, layout o passi.

Simulazioni qualitative manuali (esempi sintetici costruiti applicando il nuovo
contratto; **non output di un provider live**, né risultati finti di test LLM).
Il percorso completo di esempio è QPCS, con le cinque aree originarie:

| Caso | Scambio simulato e controllo |
| --- | --- |
| Dopo il profilo | Dati sintetici: S3=7, gli altri fattori=5. «Nelle risposte al questionario la perseveranza risulta una risorsa percepita. Quale aspetto di questa lettura vorresti comprendere meglio?» → «Il rapporto con l’ansia». Una scelta libera, nessuna esperienza dedotta dal punteggio. |
| Emozioni, risposta approfondita | «Prima dell’orale temo di dimenticare; dopo la prima risposta mi sciolgo. Per me conta riuscire a iniziare». → «Di quel momento iniziale, che cosa ti piacerebbe capire meglio?» → «Cosa mi aiuta a partire». → «Se ti va, come metteresti questa curiosità in una domanda tua?» → «Che cosa mi aiuta a iniziare quando sono in ansia?». Invito dopo esperienza e interpretazione, non a ogni turno. |
| Comunicazione, risposta tersa | «Boh, a volte». → «Ti viene in mente una conversazione recente di cui ti va di parlare? Possiamo anche proseguire». → «No, passiamo». → «Va bene, puoi passare alla prossima area». Nessuna attribuzione di difficoltà, nessuna domanda obbligatoria. |
| Volizione, fatica iniziale | «Non so che domanda farmi». → «Riguardo al compito che hai descritto, quale parte vorresti capire meglio? Puoi anche lasciarla aperta». La prima risposta aiuta a trovare il focus e non formula una domanda al posto della persona. |
| Volizione, fatica persistente | «Non mi viene, mi dai uno spunto?» → «Potresti partire dal momento in cui decidi se continuare: è solo uno spunto da cambiare o lasciare. Ti interessa quel momento?» → «No, andiamo avanti». → «Va bene». Supporto ulteriore solo dopo richiesta, nessun completamento forzato. |
| Strategie/collaborazione, domanda spontanea | «Collego le idee meglio parlando con un compagno; mi chiedo: come capisco quando il confronto mi aiuta davvero?» → «Hai già dato forma a una domanda tua: “come capisco quando il confronto mi aiuta davvero?”. Possiamo tenerla aperta». Nessuna richiesta duplicata di formularne un’altra, nessun paragone con altri studenti. |
| Fiducia, chiusura variata | «Mi sento capace nel laboratorio, sul futuro non ho ancora un’idea». → «Sul legame fra laboratorio e futuro, ti andrebbe di lasciare una domanda da riprendere?» → «Non adesso». → «Possiamo lasciarlo così». Nessuna scoperta o decisione presunta; chiusura diversa da quella dell’area emozioni. |
| Cinque aree e sintesi | La persona ha attraversato tutte le aree, due con rifiuto; aggiunge «Ritiro la domanda sull’ansia, tengo quella sul confronto». → «Hai scelto di tenere aperta “come capisco quando il confronto mi aiuta davvero?” e di lasciare quella sull’ansia. Quali domande, se ce ne sono, vorresti continuare a esplorare?» Nessuna domanda attribuita alle aree saltate, nessun piano imposto o episodio nuovo. |

Prima/dopo (comportamento, non trascrizioni di produzione):
- Prima: spiegazione → risultato → domande esplorative → lettura del counselor;
  chiusura su proposte e una domanda riflessiva del counselor.
- Dopo: l’esplorazione resta, ma si può arrivare a una domanda della persona;
  «Non so» riceve prima aiuto a individuare cosa capire, «passiamo» viene rispettato;
  la sintesi restituisce le domande effettivamente espresse e lascia la scelta.

Verifica delle altre chat, sempre con esempi sintetici manuali:
- QSA, elaborazione: «Rileggo, ma non so cosa ricordo» → «Di quello che succede
  quando rileggi, quale aspetto vorresti capire meglio?». Si mantiene l’analisi
  dei fattori; nessuna abitudine ulteriore viene dedotta.
- QSAr, autoregolazione: «A volte» → «Ti viene in mente un momento recente in cui
  è successo? Puoi anche proseguire». Sostegno concreto, senza generalizzare.
- ZTPI, passato: «Non voglio raccontare episodi» → «Va bene, possiamo restare alla
  lettura del risultato». Nessun ricordo o trauma inventato, nessun obbligo narrativo.
- QPCC, insicurezza/inadeguatezza: «Non so che domanda farmi» → «Di ciò che hai
  raccontato sul colloquio, quale parte vorresti comprendere meglio?». Prima si
  cerca il focus, senza assegnare diagnosi né confondere le due scale.
- QAP, curiosità: «Mi chiedo: cosa voglio conoscere di quel lavoro?» → «Possiamo
  partire dalla tua domanda: “cosa voglio conoscere di quel lavoro?”». Nessuna
  richiesta duplicata di autointerrogazione o scelta professionale imposta.
- Savickas: resta la domanda prevista sui modelli di ruolo; dopo la risposta
  «Ammiro la pazienza di mia zia» → «Che cosa vorresti capire meglio di questa
  qualità per te?». Nessuna sostituzione della domanda narrativa né nuova fase.

Bug preesistente registrato nel Diario: `f6ff90ff-0b05-41f8-9ac7-0eaea2a302e9`,
triage confermato, sync `not-linked` (nessuna issue GitHub pubblicata).
`test_smoke.py::test_build_context_envelope_component_flags_disable_parts`
fallisce perché si aspetta `full_message == ""` ma riceve `"domanda"`. Riprodotto
isolatamente sia sul ramo sia sui tre moduli originali di HEAD `0024ec2d` copiati
con `git show` in uno snapshot temporaneo, senza toccare il checkout principale.
Comando: `python -m pytest -q --disable-warnings backend/tests/test_smoke.py::test_build_context_envelope_component_flags_disable_parts`
su PostgreSQL effimero `counselorbot_test`, `PYTHON_DOTENV_DISABLED=1`.
Non modificato in questa PR; escluso esplicitamente dal secondo run di regressione.

## Recupero S2: consegna verificata

- Agente: `s2-autointerrogazione`, 2026-10-15. Lavoro del predecessore conservato
  e completato nello stesso worktree e branch. Nessun altro agente avviato.
- Commit funzionale: `0dedc1aa` — `feat: scaffold optional self-questioning in guided chats`.
- PR draft: https://github.com/nugh75/counselorbot-sbs/pull/290,
  `feat: introdurre autointerrogazione facoltativa nelle chat guidate`, verso
  `main`, aggiunta al Project **CounselorBot**. Draft per baseline smoke rosso;
  notifica di apertura sottoposta tramite la CLI Diario al Timoniere
  (`submitted=true`, ricezione non confermata, `delivery_unknown`; mobile disattivo).
- Ultime precisazioni del contratto: priorità alle domande personali nella
  sintesi, ritiri espliciti, nessuna citazione inventata se manca il testo,
  nessuna emozione o bisogno presunto, niente lunghe premesse. L'invito usa un
  follow-up disponibile; esaurito il limite si chiude senza altre domande.
  La difficoltà persistente non provoca ripetizioni o aiuti crescenti non richiesti.
- Nuovi controlli oltre al recupero: cronologia effettiva della difficoltà e del
  rifiuto nelle cinque aree QPCS, isolamento della conversazione, conservazione
  nell'envelope delle domande specifiche ZTPI/Savickas/QPCC/QAP e blocco di
  qualsiasi generazione accidentale nella nuova suite.
- Motivazione dell'ampiezza: i sette percorsi usano `prepare_chat_turn` e il
  contratto del turno condivisi. Si adatta la formulazione senza imporre le cinque
  aree QPCS a QAP, QSA/QSAr, ZTPI o Savickas. Introduzioni e patti esclusi; compiti
  narrativi, limiti dei follow-up, confronto psicometrico ZTPI e sintesi essenziale
  senza domande preservati. Dettagli: `docs/operations/self-questioning-validation.md`,
  collegato da `CONTEXT.md`.

Verifiche effettivamente eseguite su immagine backend ricostruita:

| Controllo | Risultato |
| --- | --- |
| `python -m pytest -q --disable-warnings backend/tests/test_self_questioning.py` | **751 passed**, 53,19 s; contratto/envelope/evidenza, nessun modello live |
| `python -m pytest -q --disable-warnings backend/tests/test_chat_preparation.py` in processo separato | **6 passed**, 30,81 s; parità runtime/audit nei percorsi e nelle lingue esistenti |
| Regressione indicata nel documento operativo, con esclusione nominativa dello smoke già noto | **354 passed, 1 deselected**, 32,57 s |
| `python3 -m unittest discover -s scripts/tests -p test_platform_guidance_check.py` | **3 passed** |
| `make guidance-refresh`, `make guidance-check`, `python3 scripts/check-platform-guidance.py --check --base origin/main`, `git diff --check` | Superati |
| Smoke dei component flags sul branch | **1 failed**, errore già noto `domanda` invece di messaggio vuoto |
| Baseline `0024ec2d`: smoke dei component flags + smoke Obiettivo + parità nello stesso processo | **2 failed, 1 passed**; confermati sia il difetto noto sia quello di ordine della suite |

Il primo run combinato aveva **358 passed, 2 failed, 1 deselected**: la parità
contava anche i 18 passi dei due percorsi Obiettivo creati prima dallo smoke
(83 invece di 65); il controllo QPCC non trovava le fixture non incluse nel
Dockerfile. Il run definitivo esegue la parità in un processo separato e monta
in sola lettura `questionari/item_catalog/qpcc.json` e
`frontend/src/lib/qpcc-schema.json`. Nessun test nuovo fallisce o viene saltato.
Il difetto di conteggio è preesistente, riprodotto sui tre moduli originali di
HEAD copiati con `git show` in un container temporaneo. Non corretto fuori ambito.

Bug nel Diario:

- `f6ff90ff-0b05-41f8-9ac7-0eaea2a302e9`: smoke component flags, già registrato;
  riprodotto nuovamente sul ramo e sul baseline. Resta un difetto aperto.
- `cb078c90-086d-4ca5-8e71-ecb4403b8b24`: dipendenza dall'ordine del test di
  parità, nuovo riscontro verificato, triage **confermato**, sync **not-linked**.
  Nessuna issue GitHub aperta manualmente.
- **Bug non registrati: nessuno.** I due tentativi iniziali non validi di
  registrazione del secondo bug non hanno scritto dati; la registrazione finale
  è stata confermata dalla CLI.

Limiti e operazioni:

- Gli esempi manuali A–F sopra restano esempi redazionali; non provano varietà,
  fluidità o obbedienza di Iride. Nessun LLM live, credenziale, `.env` o dato di
  produzione letto. La fedeltà dopo riduzione generativa resta da campionare;
  non è garantita da un registro deterministico delle domande.
- Guida chat nelle sei lingue e screenshot esistente `chat-guidata.png`
  riesaminati: documentano controlli e navigazione invariati, non i risultati di
  questa strategia. Nessuna modifica UI, nessuna nuova cattura richiesta.
- Rebuild **completato solo per test**, immagine
  `counselorbot-self-questioning-validation:20261015-s2`, ID `7006e0db1c86`.
  Contesto di build composto solo da file necessari versionati e nuovo test;
  PostgreSQL dedicato su tmpfs, rete interna senza provider o porte pubblicate.
- Container di test terminati. Arrestati sia
  `counselorbot-self-questioning-s2-postgres` sia il PostgreSQL di test ereditato
  `counselorbot-self-questioning-postgres`. Nessun processo dev avviato o lasciato
  in esecuzione; nessun container produttivo riavviato, nessun deploy/sudo.
- Handoff/documento operativo in commit documentale separato; il log del branch
  contiene entrambi i commit. Revisione cross-modello affidata al Timoniere.

Revisione cross-modello ancora necessaria prima del merge; nessun merge eseguito.

---

# Handoff S18: Generatore prompt IA per copertine counselor e upload avatar in CounselorsPanel (Issue #288)
Data: 2026-10-15 | Stato: completato, verificato, pronto per commit/PR

- Titolo: 'feat: generatore prompt IA per copertine counselor e upload avatar in CounselorsPanel'
- Branch: `feat/counselor-cover-ai-prompt`
- Issue collegate: Closes #288
- Obiettivo:
  1. Introdurre nel pannello di amministrazione e configurazione dei counselor (`frontend/src/components/admin/CounselorsPanel.tsx`) la stessa funzionalità di generazione e gestione avanzata delle copertine 16:9 introdotta per le classi.
  2. Implementare il generatore di prompt IA ottimizzato per DALL-E/ChatGPT e Gemini/Imagen nello stile concettuale di CounselorBot (palette verde petrolio `#042f2e` / `#0f766e`, indaco `#1e1b4b`, ardesia, accenti ambra `#f59e0b`, ottone e ciano, assenza di caratteri o ritratti fotografici).
  3. Fornire 12 metafore/temi visivi consigliati (`COUNSELOR_METAPHOR_PRESETS`), pulsante copia rapida negli appunti con feedback visivo, e link esterni a ChatGPT e Gemini.
  4. Mostrare l'anteprima live orizzontale 16:9 con il componente `CounselorCover` (incluso fallback procedurale dinamico in assenza di asset o errore di caricamento) sia nel form di `CounselorsPanel` sia in cima al modale.
  5. Implementare l'endpoint backend per l'upload e la memorizzazione persistente su disco dell'avatar/copertina (`POST /api/admin/counselors/{counselor_id}/avatar`) con validazione MIME e limite 5MB, e il serving pubblico con header di cache (`GET /api/counselors/{counselor_id}/avatar`).
  6. Supporto i18n completo nelle 6 lingue della piattaforma (`it`, `en`, `es`, `fr`, `de`, `sv`).
- Modifiche realizzate:
  1. Backend:
     - `backend/routes/counselors.py`: implementati `upload_counselor_avatar` (`POST /api/admin/counselors/{counselor_id}/avatar` e `/admin/...`) con validazione tipi (PNG, JPG, WebP, SVG) e max 5MB, salvataggio su filesystem in `data/uploads/counselors/` e aggiornamento `avatar` e `avatar_url`, e `get_counselor_avatar` (`GET /api/counselors/{counselor_id}/avatar` e `/counselors/...`) con `Cache-Control: public, max-age=3600`.
     - `backend/tests/test_counselor_avatar.py`: test per upload PNG/SVG, salvataggio nel database, serving pubblico con cache-control, validazione formato/dimensione, e risposte 400/404/413.
  2. Frontend:
     - `frontend/src/lib/counselor-cover-prompt.ts`: esportati `composeCounselorCoverAIPrompt` e `COUNSELOR_METAPHOR_PRESETS` (12 metafore visive consigliate).
     - `frontend/src/lib/counselor-cover-prompt.test.ts`: test unitari per i preset di metafore, la generazione corretta del prompt 16:9 conforme al brand, e la gestione dei fallback su opzioni vuote.
     - `frontend/src/components/admin/CounselorCoverModal.tsx`: modale accessibile con tabs "Crea con IA", "Carica da computer" e "URL o preset manuale", anteprima 16:9 con `CounselorCover`, copia del prompt con feedback visivo e link esterni a ChatGPT e Gemini.
     - `frontend/src/components/admin/CounselorsPanel.tsx`: integrata l'anteprima 16:9 dell'avatar con `CounselorCover` accanto al campo di input, aggiunto il pulsante «✨ Crea con IA / Gestisci copertina», gestione dello stato del modale e aggiornamento dinamico di `form.avatar`.
     - `frontend/src/lib/i18n-admin.ts`: aggiunte tutte le chiavi di traduzione per la gestione delle copertine dei counselor in tutte e 6 le lingue (`it`, `en`, `es`, `fr`, `de`, `sv`).
  3. Documentazione e conformità:
     - `docs-counselorbot/funzionalita-counselorbot.md`: documentata la gestione delle copertine e il generatore di prompt IA nel pannello counselor.
- Verifiche superate:
  - Controllo i18n: `node frontend/scripts/check-i18n.mjs` (3.359 chiavi verificate in 6 lingue, 0 violazioni).
  - TypeScript: `npx tsc --noEmit` (0 errori, Node v22.23.3).
  - Test frontend: `npm test` (466/466 superati, 0 fallimenti).
  - Backend pytest: `pytest backend/tests/test_counselor_avatar.py` (3/3 passati).
  - Piattaforma guidance: `make guidance-refresh && make guidance-check`.

---

# Handoff S17: Copertine rettangolari 16:9 stile counselor per le classi con 10 preset, upload e prompt IA (Issue #286)
Data: 2026-10-15 | Stato: completato, verificato, pronto per commit/PR

- Titolo: 'feat: copertine rettangolari 16:9 stile counselor per le classi con preset, upload e prompt IA'
- Branch: `feat/class-counselor-style-covers`
- Issue collegate: Closes #286
- Obiettivo:
  1. Dotare le classi e i gruppi di una personalizzazione visiva con copertine rettangolari in proporzione 16:9 (`viewBox="0 0 320 180"`), realizzate nello stesso stile illustrativo ed elegante delle copertine dei counselor (palette petrolio/teal `#042f2e` / `#0f766e`, elementi vettoriali simbolici, accenti ambra e ciano, assenza di testo o volti umani).
  2. Implementare 10 preset tematici SVG standalone in `frontend/public/images/classes/` e garantire una selezione deterministica basata su hash del gruppo in assenza di copertina salvata.
  3. Implementare backend storage e API: colonna `StudentGroup.image_url`, migrazione runtime, schema Pydantic, rotta di upload con validazione MIME/dimensione `POST /api/admin/groups/{id}/image` e rotta pubblica di erogazione file con cache `GET /api/groups/{id}/image`.
  4. Realizzare il componente `ClassImageModal` con 3 schede (Preset grafici, Carica dal computer, Crea con IA con prompt generatore) e azione di ripristino default.
  5. Integrare la visualizzazione e la modifica in `MyClassesSection` (card in `/docente`) e `ClassOverviewTab` (Hub di classe).
  6. Supporto i18n completo nelle 6 lingue del sistema (`it`, `en`, `es`, `fr`, `de`, `sv`).
- Modifiche realizzate:
  1. Asset grafici SVG:
     - Creati 10 file SVG standalone in `frontend/public/images/classes/` (`class-science.svg`, `class-space.svg`, `class-humanities.svg`, `class-arts.svg`, `class-tech.svg`, `class-nature.svg`, `class-math.svg`, `class-music.svg`, `class-sports.svg`, `class-geography.svg`).
  2. Backend:
     - `backend/models.py`: Aggiunta colonna `image_url` (String, nullable) al modello `StudentGroup`.
     - `backend/main.py`: Aggiunta migrazione automatica di startup per la colonna `image_url` in `student_groups`.
     - `backend/database.py`: Aggiunta configurazione cartella `DATA_DIR` per upload persistenti (default `/app/uploads`).
     - `backend/schemas.py`: Aggiunto campo facoltativo `image_url` in `StudentGroupCreate` e `StudentGroupUpdate`.
     - `backend/routes/groups.py`: Inclusione di `image_url` nei metodi di creazione, aggiornamento e serializzazione gruppo; implementati endpoint `POST /api/admin/groups/{group_id}/image` (validazione max 5MB, tipi PNG/JPEG/WEBP/GIF) e `GET /api/groups/{group_id}/image` con header di cache (`Cache-Control: public, max-age=86400`).
     - `backend/tests/test_class_covers.py`: Test unitari/integrazione per migrazione runtime, aggiornamento schema e upload/serve dell'immagine.
  3. Frontend:
     - `frontend/src/components/teacher/class-group-types.ts`: Esteso `StudentGroup` con `image_url?: string | null`.
     - `frontend/src/lib/class-cover-presets.ts`: Definizione dei 10 preset, helper deterministico `getClassCoverUrl` e generatore di prompt IA `composeClassCoverAIPrompt`.
     - `frontend/src/lib/class-cover-presets.test.ts`: 4 test unitari per preset, fallback deterministico e prompt generation.
     - `frontend/src/components/teacher/ClassImageModal.tsx`: Modale accessibile con tabs Presets, Upload, Crea con IA, anteprima 16:9, feedback di caricamento e reset copertina predefinita.
     - `frontend/src/components/teacher/MyClassesSection.tsx`: Testata card classe 16:9 con preview della copertina, pulsante a matita in hover e integrazione `ClassImageModal`.
     - `frontend/src/components/teacher/ClassOverviewTab.tsx`: Banner anagrafica 16:9 con pulsante «Modifica copertina» e modale `ClassImageModal`.
     - `frontend/src/lib/i18n-teacher-area.ts`: Tutte le etichette localizzate nelle 6 lingue supportate.
  4. Documentazione e conformità:
     - `docs-counselorbot/funzionalita-counselorbot.md` e `docs/operations/platform-guidance-state.json`: Documentata la funzionalità in Guida e sincronizzato lo stato.
- Verifiche superate:
  - TypeScript: `npx tsc --noEmit` (0 errori, Node v22.23.3).
  - Test unitari frontend: `npm test` (463/463 superati, 0 fallimenti).
  - Controllo localizzazione: `node frontend/scripts/check-i18n.mjs` (3.329 chiavi verificate in 6 lingue, 0 violazioni).
  - Backend pytest: `pytest backend/tests/test_class_covers.py` (14/14 passati).
  - Guida di piattaforma: `make guidance-refresh && make guidance-check` (0 violazioni, documentazione allineata).

---

# Handoff S16: Riordino tab classe con Strumenti e counselor in coda e toggle massivo counselor (Issue #284)
Data: 2026-10-15 | Stato: completato, verificato, pronto per commit/PR

- Titolo: 'feat: riordinare tab classe con strumenti e counselor in coda e toggle massivo counselor'
- Branch: `feat/reorder-class-tabs-and-counselor-toggle-all`
- Issue collegate: Closes #284
- Obiettivo:
  1. Spostare il tab «Strumenti e counselor» (`toolsTab`) in fondo all'elenco dei tab della pagina classe, dopo «Registro modifiche» (`audit`). Sequenza: `overview` (Panoramica) → `students` (Studenti e risultati) → `paths` (Percorsi di classe) → `forum` (Forum) → `audit` (Registro modifiche) → `toolsTab` (Strumenti e counselor), allineando anche i pannelli `role="tabpanel"` nel DOM per perfetta accessibilità.
  2. Aggiungere nella sezione Counselor (`ClassCounselorsSection`) i pulsanti per abilitare e disabilitare in blocco tutti i counselor modificabili («Abilita tutti» / «Disabilita tutti», `enableAll` / `disableAll`), analogamente alle categorie di strumenti: azione sui counselor filtrati/visibili, disabilitazione su `busy` o se nessun counselor è modificabile, rimozione del counselor predefinito se tra quelli disabilitati, e aggiornamento stato dirty.
- Modifiche realizzate:
  1. `frontend/src/lib/class-settings.ts`:
     - Aggiunta ed esportata la funzione helper deterministica `toggleCounselorIds(disabledIds, targetIds, enabled)` per gestire l'abilitazione e disabilitazione massiva (o singola) con deduplicazione e ordinamento numerico crescente.
  2. `frontend/src/components/teacher/ClassSettingsPage.tsx`:
     - Aggiornata la definizione di `activeTabs` e lo stato iniziale `tab` per posizionare `toolsTab` in coda dopo `audit`: `['overview', 'students', 'paths', 'forum', 'audit', 'toolsTab']`.
     - Allineato l'ordine dei rispettivi pannelli tab (`role="tabpanel"`) nel JSX per garantire coerenza sequenziale e corretta accessibilità del DOM.
     - Aggiunta prop `onToggleAll` in `ClassCounselorsSection` e inseriti i pulsanti «Abilita tutti» e «Disabilita tutti» (`variant="secondary"`) posizionati sopra l'elenco dei counselor, disabilitati quando `busy` o nessun counselor visibile è modificabile (`!rows.some(row => row.admin_enabled && !row.locked)`).
     - In `ClassToolsEditor`, implementata la funzione `toggleAllCounselors(rows, enabled)`: rimuove gli ID modificabili da `disabledCounselors` su abilitazione, aggiunge gli ID su disabilitazione, azzera `defaultCounselor` se disabilitato, pulisce `notice === 'saved'` e aggiorna `dirty`.
     - Refactoring di `toggleCounselor` per riutilizzare `toggleCounselorIds`.
  3. `frontend/src/lib/class-settings.test.ts`:
     - Aggiunti test unitari completi per `toggleCounselorIds` verificando abilitazione, disabilitazione con ordinamento e deduplicazione, e gestione di liste vuote.
  4. `frontend/tests/class-settings.test.mjs`:
     - Aggiornata la navigazione da tastiera delle tab per riflettere il wrap-around (`ArrowLeft` da `Overview` seleziona l'ultimo tab `Tools & counselors`).
  5. `docs-counselorbot/funzionalita-counselorbot.md` e `docs/operations/platform-guidance-state.json`:
     - Aggiornata la documentazione delle funzionalità per descrivere l'ordine aggiornato dei tab di classe e i comandi di toggle massivo dei counselor, registrato con `make guidance-refresh`.
- Verifiche superate:
  - TypeScript: `npx tsc --noEmit` (0 errori, Node v22.23.3).
  - Test unitari frontend: `npm test` (459/459 superati, 0 fallimenti).
  - Controllo localizzazione: `node frontend/scripts/check-i18n.mjs` (3.329 chiavi verificate in 6 lingue).
  - Guida di piattaforma: `make guidance-refresh && make guidance-check` (0 violazioni, documentazione allineata).
  - CI diff guidance: `python3 scripts/check-platform-guidance.py --base origin/main` (0 violazioni).
- Conformità brand: bottoni `variant="secondary"` (slate/white), palette petrolio `indigo-*`, nessun violazione brand.

---

# Handoff S15: Ripristino token palette brand petrolio (indigo) nei componenti di classe (Issue #282)
Data: 2026-10-15 | Stato: completato, verificato, pronto per commit/PR

- Titolo: 'fix: align class components to indigo petrol brand palette'
- Branch: `fix/restore-brand-petrol-palette`
- Issue collegate: Closes #282
- Obiettivo:
  Correggere la palette cromatica nei componenti di classe ripristinando l'uso dei token ufficiali della scala `indigo-*` (rimappata su verde petrolio istituzionale `#155e63` in `globals.css`), rimuovendo le utility `emerald-*` e `teal-*` usate erroneamente per controlli UI, pulsanti, tab, link, breadcrumb e bordi.
- Modifiche realizzate:
  1. `frontend/src/components/admin/GroupsPanel.tsx`:
     - Pulsante «+ Nuova classe» e pulsante di submit form «Crea»: allineati a `bg-indigo-600 hover:bg-indigo-700 text-white`.
     - Input e select di creazione classe: focus ring allineato a `focus:border-indigo-600`.
     - Link al titolo classe: hover allineato a `hover:text-indigo-700`.
     - Pulsanti «Apri classe →»: allineati a `bg-indigo-600 hover:bg-indigo-700`.
     - Scorciatoie veloci (Partecipanti, Strumenti, Percorsi): hover allineato a `hover:text-indigo-700`.
     - Badge «Condivisa»: bordo e testo allineati a `border-indigo-200 bg-indigo-50 text-indigo-700`.
     - Icona/bottone copia codice: hover allineato a `hover:text-indigo-700`.
  2. `frontend/src/components/teacher/ClassOverviewTab.tsx`:
     - Card indicatori metriche (Partecipanti, Strumenti, Percorsi, Forum): `hover:border-indigo-300`, `bg-indigo-50 text-indigo-700 group-hover:bg-indigo-100`, `text-indigo-700`.
     - Icone d'intestazione sezioni (`UserPlus`, `Share2`, `FileText`, `Power`): `text-indigo-700`.
     - Box Codice Classe in evidenza: `border-indigo-100 bg-indigo-50/50`, `text-indigo-900`, `text-indigo-950`.
     - Checkbox visibilità contesto studenti nel form: `text-indigo-600 focus:ring-indigo-500`.
     - Mantenute le utility semantiche `emerald` per stati di successo (badge «Attiva», messaggi di salvataggio riuscito e icona Check di copia).
  3. `frontend/src/components/teacher/ClassSettingsPage.tsx`:
     - Checkbox e radio button di counselor, strumenti, assistente personale e forum: ripristinato `accent-indigo-600`.
     - Link «Indietro»: ripristinato `text-indigo-700 hover:text-indigo-800`.
     - Tab attiva: ripristinato `bg-indigo-50 text-indigo-700`.
  4. `frontend/src/components/admin/AdminClassesPanel.tsx`:
     - Link modifica/audit e link studenti: ripristinato `text-indigo-700 hover:text-indigo-800 underline`.
  5. `frontend/src/components/teacher/ClassQuickSwitcher.tsx`:
     - Select switcher rapido: hover e focus ring allineati a `hover:border-indigo-400 focus:border-indigo-500 focus:ring-indigo-500/20`.
  6. `frontend/src/components/teacher/TeacherBreadcrumbs.tsx`:
     - Link breadcrumbs: hover e focus outline allineati a `hover:text-indigo-700 focus-visible:outline-indigo-600`.
  7. `docs-counselorbot/funzionalita-counselorbot.md` e `docs/operations/platform-guidance-state.json`:
     - Aggiornata la documentazione delle funzionalità per specificare l'uso dei token istituzionali `indigo-*` (petrol) e allineato lo stato della guida di piattaforma con `make guidance-refresh`.
- Verifiche superate:
  - TypeScript: `npx tsc --noEmit` (0 errori, Node v22.23.3).
  - Test unitari frontend: `npm test` (458/458 superati, 0 fallimenti).
  - Controllo localizzazione: `node scripts/check-i18n.mjs` (3.329 chiavi verificate in 6 lingue).
  - Guida di piattaforma: `make guidance-refresh && make guidance-check` (0 violazioni, documentazione allineata).
  - CI diff guidance: `python3 scripts/check-platform-guidance.py --base origin/main` (0 violazioni).

---

# Handoff S14: Allineamento navigazione admin, breadcrumb e test di integrazione gestione classi (Issue #278)
Data: 2026-10-15 | Stato: completato, verificato, pronto per commit/PR

- Titolo: 'test: allineamento navigazione admin, breadcrumb e test di integrazione gestione classi'
- Branch: `test/admin-class-navigation-and-integration`
- Issue collegate: Closes #278
- Obiettivo:
  Consolidare e validare l'intera Milestone #15 («Unificazione gestione classi e Hub operativo (Docente & Admin)») allineando la navigazione admin con link diretti all'Hub di classe, breadcrumb gerarchici dedicati e test di regressione/integrazione completi.
- Modifiche realizzate:
  1. `frontend/src/components/admin/AdminClassesPanel.tsx`:
     - Modificato il link per gli studenti da `/docente/classi` a `/admin/classi/${row.id}?tab=students` affinché l'amministratore possa aprire direttamente la tab studenti nell'Hub di classe dedicato senza rimbalzare nell'area docente.
     - Allineati i collegamenti alla palette verde/petrol del brand (`text-teal-700 hover:text-teal-800 underline`).
  2. `frontend/src/lib/teacher-breadcrumbs.ts`:
     - Aggiunta la funzione `getClassBreadcrumbs(groupName, groupId, tab, lang, adminRoute)`:
       - Modalità admin (`adminRoute=true`): `Dashboard Admin` (`/admin`) > `Classi` (`/admin?tab=groupsClasses`) > `[Nome Classe]` > `[Tab]`.
       - Modalità docente (`adminRoute=false`): `Area docenti` (`/docente`) > `[Nome Classe]` > `[Tab]`.
  3. `frontend/src/lib/teacher-quick-switcher.ts` e `frontend/src/components/teacher/ClassQuickSwitcher.tsx`:
     - Aggiunto supporto a `basePath` in `computeClassSwitchUrl` e `ClassQuickSwitcher` (default `/docente/classi`, `/admin/classi` quando contestuale all'amministrazione) per preservare la rotta corrente al cambio classe.
     - Allineato lo stile a verde emerald (`hover:border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/20`).
  4. `frontend/src/components/teacher/ClassSettingsPage.tsx`:
     - Integrato `getClassBreadcrumbs` sempre visibile (inclusa la modalità `adminRoute`).
     - Tasto «Indietro» allineato verso `ADMIN_CLASSES_HREF` (`/admin?tab=groupsClasses`) quando `adminRoute=true`.
     - Styling tab e controlli di blocco/opzioni allineati a verde (`bg-emerald-50 text-emerald-800 border-b-2 border-emerald-600`, `accent-emerald-600`).
  5. `frontend/src/components/admin/GroupsPanel.tsx` e `frontend/src/components/teacher/ClassOverviewTab.tsx`:
     - Eliminati tutti i residui `indigo`, convertiti in palette verde (`emerald` / `teal`).
  6. `frontend/src/lib/i18n-class-settings.ts`:
     - Aggiunta chiave `adminDashboard` in tutte le 6 lingue ufficiali (`it`, `en`, `es`, `fr`, `de`, `sv`).
  7. Copertura Test & Aggiornamento:
     - `frontend/src/lib/teacher-breadcrumbs.test.ts`: test completi di `getClassBreadcrumbs` per rotte docente e admin su tutte le lingue e verifica di `computeClassSwitchUrl` con `basePath`.
     - `frontend/src/lib/groups-directory.test.ts`: verifica generazione link diretti all'Hub classe admin e tab studenti.
     - `frontend/src/lib/class-settings.test.ts`: verifica presenza e fallback di `adminDashboard`.
     - `frontend/tests/teacher-class-management.test.mjs`: allineati i flussi e rimossi i selettori obsoleti degli accordion eliminati in `GroupsPanel`.
  8. `docs-counselorbot/funzionalita-counselorbot.md` e `docs/operations/platform-guidance-state.json`:
     - Aggiornata la documentazione delle funzionalità per la navigazione admin delle classi e allineato lo stato della guida di piattaforma con `make guidance-refresh`.
- Verifiche superate:
  - TypeScript: `npx tsc --noEmit` (0 errori).
  - Test unitari frontend: `npm test` (458/458 superati, 0 fallimenti).
  - Controllo localizzazione: `node scripts/check-i18n.mjs` (3.329 chiavi verificate in 6 lingue).
  - Guida di piattaforma: `make guidance-refresh && make guidance-check` (0 violazioni, documentazione allineata).
- Conformità brand: 100% verde (`emerald`, `teal`, `#17747a`), nessun viola/purple.

---

# Handoff S13: Snellimento directory classi in GroupsPanel con accesso diretto all'Hub di classe (Issue #277)
Data: 2026-10-15 | Stato: completato, verificato, pronto per commit/PR

- Titolo: 'Area Docente e Admin: snellire la directory classi in GroupsPanel con accesso diretto all'Hub di classe'.
- Branch: `feature/groups-panel-streamlining`
- Issue collegate: Closes #277
- Modifiche realizzate:
  1. `frontend/src/components/admin/GroupsPanel.tsx`:
     - Rimosse le pesanti sezioni duplicate e i relativi accordion (inclusione di `PlanStudentsPanel`, `GroupAssignments`, box link invito e box di condivisione colleghi con check-boxes, ora centralizzati nella tab Panoramica dell'Hub di classe).
     - Trasformata la lista in una directory di classi pulita, compatta e moderna sia per docenti (`/docente/classi`) che per amministratori (`/admin?tab=groupsClasses`).
     - Aggiunta prop opzionale `basePath?: string` con fallback dinamico su `/admin/classi` se il pathname inizia con `/admin`, altrimenti `/docente/classi`.
     - Ciascuna scheda classe mostra: nome della classe con link diretto a `{basePath}/{group.id}`, codice classe (`group.code`) in font mono con icona/bottone rapido per copiare negli appunti (e feedback visivo temporaneo), numero iscritti (`group.members_count`), scuola/istituto, docente proprietario (`group.owner_username`), badge di stato («Attiva» in verde emerald o «Inattiva» in slate) e badge «Condivisa» in teal (se condivisa con altri colleghi o se l'utente corrente non è il proprietario).
     - Pulsante d'azione primario evidente: «Apri classe →» (`min-h-11`, touch target >= 44px) con link a `{basePath}/{group.id}`.
     - Scorciatoie rapide alle tab più usate: Studenti (`?tab=students`), Strumenti e counselor (`?tab=tools`), Didattica/Percorsi (`?tab=paths`).
     - Form compatto per la creazione rapida («+ Nuovo gruppo o classe») a 4 campi; al salvataggio con successo (`POST /api/admin/groups`), reindirizza direttamente all'Hub della nuova classe creata (`router.push('${basePath}/${createdGroup.id}')`).
     - Puliti tutti gli import e gli stati inutilizzati (`PlanStudentsPanel`, `GroupAssignments`, `allUsers`, ecc.).
  2. `frontend/src/app/admin/page.tsx`: passato esplicitamente `basePath="/admin/classi"` a `<GroupsPanel />`.
  3. `backend/routes/groups.py` e `frontend/src/components/teacher/class-group-types.ts`: aggiunto `shares_count` alla serializzazione del gruppo (`StudentGroup`), permettendo di determinare immediatamente lo stato di condivisione della classe.
  4. `frontend/src/lib/i18n-class-settings.ts` e `frontend/src/components/teacher/class-group-texts.ts`: aggiunte tutte le traduzioni per stato attivo/inattivo, condivisa, copia codice, ecc. nelle 6 lingue ufficiali (`it`, `en`, `es`, `fr`, `de`, `sv`).
  5. `frontend/src/lib/groups-directory.test.ts`: test unitari per la risoluzione del `basePath`, per la determinazione dello stato «Condivisa», per la persistenza di `shares_count` in `parseClassGroups` e per la completezza delle traduzioni nelle 6 lingue.
  6. `docs-counselorbot/funzionalita-counselorbot.md` e `docs/operations/platform-guidance-state.json`: aggiornata la documentazione delle funzionalità per la Issue #277 e allineato il manifest di guida di piattaforma con `make guidance-refresh`.
- Verifiche superate:
  - Controllo tipi TypeScript: `npx tsc --noEmit` (0 errori).
  - Test unitari frontend: `npm test` (456/456 superati, 0 fallimenti).
  - Controllo localizzazione: `node scripts/check-i18n.mjs` (3.329 chiavi verificate).
  - Guida di piattaforma: `make guidance-refresh && make guidance-check` (0 violazioni, documentazione allineata).
- Conformità brand: utilizzo esclusivo della palette verde (`emerald`, `teal`, petrol `#17747a`), nessun viola/purple.

---

# Handoff S12: Allineamento colori Palestra di prova (Area Docente) alla palette verde/petrol del brand
Data: 2026-10-15 | Stato: completato, verificato, pronto per commit/PR

- Titolo: 'Area Docente: Allineamento colori della Palestra di prova alla palette verde del brand CounselorBot'.
- Branch: `fix/teacher-gym-brand-colors`
- Modifiche realizzate:
  1. `frontend/src/components/teacher/PracticeGymSection.tsx`: rimossa ogni sfumatura viola/indigo e allineati gli stili alla palette ufficiale verde/petrol (emerald / teal) del brand:
     - Card container: `border-emerald-200/90 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/40`
     - Badge «Simulazione protetta»: `bg-emerald-100 text-emerald-900` con icona ShieldCheck `text-emerald-700`
     - Tag chip descrittivi: `border-emerald-200 bg-white/80 text-emerald-900`
     - CTA primaria «Entra nella Palestra di prova»: `bg-emerald-700 hover:bg-emerald-800 text-white focus-visible:outline-emerald-700` con freccia `text-emerald-200`
     - Link secondario «Taccuini di prova»: `text-emerald-800 hover:underline`
  2. `docs-counselorbot/funzionalita-counselorbot.md` e `docs/operations/platform-guidance-state.json`: documentata la conformità della Palestra di prova alla palette verde del brand e sincronizzato lo stato della guida di piattaforma con `make guidance-refresh`.
- Verifiche superate:
  - Assenza completa di classi `purple`, `violet` o `indigo` in `PracticeGymSection.tsx`.
  - Test unitari frontend: `npm test` (452/452 superati, 0 fallimenti).
  - Controllo tipi TypeScript: `npx tsc --noEmit` (0 errori).
  - Controllo localizzazione: `node scripts/check-i18n.mjs` (3.329 chiavi allineate nelle 6 lingue).
  - Guida di piattaforma: `make guidance-refresh && make guidance-check` e check `--base origin/main` (SUCCESS).
- Vincoli rispettati: nessun merge autonomo non autorizzato (auto-merge impostato via PR secondo istruzioni utente), nessun deploy diretto, nessun comando sudo.

---

# Handoff S11: Build di produzione frontend con Webpack in ambienti Docker containerizzati
Data: 2026-10-15 | Stato: completato, verificato, pronto per commit/PR

- Titolo: 'Build frontend: adozione di Webpack per prevenire deadlock IPC di Turbopack in container Docker'.
- Branch: `fix/frontend-docker-build-webpack`
- Problema risolto:
  Durante il build Docker del frontend (`counselorbot-frontend`), Next.js 16 (`next: 16.3.8`) utilizza Turbopack di default per `next build`.
  Nei container Linux (specie sotto emulazione o con memoria assegnata limitata), Turbopack andava incontro a deadlock e timeout sul loader IPC di PostCSS per Tailwind v4 (`Error: Node.js subprocess crashed while evaluating loaders [postcss]: failed to receive message ... deadline has elapsed`), bloccando il build per oltre 2.8 ore prima di fallire.
  L'adozione di Webpack (`next build --webpack`) risolve alla radice il problema: la compilazione si completa con successo in circa 3 minuti con basso consumo di memoria ed evitando qualsiasi deadlock IPC.
- Modifiche realizzate:
  1. `frontend/package.json`: aggiornato lo script di build in modo esplicito: `"build": "next build --webpack"`.
  2. `frontend/Dockerfile`: disabilitata la telemetria di Next.js nello stage `builder` tramite `ENV NEXT_TELEMETRY_DISABLED=1` per evitare attese di rete inutili durante la compilazione.
  3. `docs-counselorbot/funzionalita-counselorbot.md` e `docs/operations/platform-guidance-state.json`: documentata la configurazione di compilazione e riallineato il manifest di guida di piattaforma tramite `make guidance-refresh`.
- Verifiche superate:
  - Compilazione frontend di produzione: `npm run build` completato con successo (63/63 pagine generate, 0 errori).
  - Test unitari frontend: `npm test` (452/452 superati, 0 fallimenti).
  - Controllo tipi TypeScript: `npx tsc --noEmit` (0 errori).
  - Localizzazione: `node scripts/check-i18n.mjs` (3.329 chiavi allineate nelle 6 lingue).
  - Guida di piattaforma: `make guidance-refresh && make guidance-check` e check `--base origin/main` (SUCCESS).
- Vincoli rispettati: nessun merge autonomo (in attesa di review utente da app mobile), nessun deploy diretto, nessun comando sudo.

---

# Handoff S10: Area Docente - Navigazione secondaria coerente e breadcrumbs (Issue #268)
Data: 2026-10-14 | Stato: completato, verificato, pronto per commit/PR

- Completamento Issue #268 (Milestone 14 'Riorganizzazione Area Docente: didattica attiva, classi e palestra di prova').
- Titolo: 'Area Docente: Navigazione secondaria coerente e breadcrumbs tra sezioni e classi'.
- Branch: `feature/teacher-area-breadcrumbs-navigation`
- Modifiche realizzate:
  1. `frontend/src/lib/teacher-breadcrumbs.ts`: modulo logico di risoluzione delle breadcrumb gerarchiche per ciascuna sottopagina dell'Area Docente (`getTeacherBreadcrumbsForSlug`), con schema coerente «Area docenti (/docente) › [Sezione genitore opzionale] › [Sezione attiva]».
  2. `frontend/src/components/teacher/TeacherBreadcrumbs.tsx`: componente breadcrumbs accessibile riutilizzabile, conforme agli standard WAI-ARIA (`<nav aria-label="...">` con lista semantica `<ol>` / `<li>`, `aria-current="page"` per l'elemento foglia attivo, touch target >= 44px con `min-h-[44px]` e supporto a controlli contestuali aggiuntivi via prop `extra`).
  3. `frontend/src/components/teacher/ClassQuickSwitcher.tsx` e `frontend/src/lib/teacher-quick-switcher.ts`: switcher rapido di classe integrato nell'Hub di classe `/docente/classi/{id}`, che consente al docente di passare istantaneamente da una classe all'altra preservando l'eventuale tab secondario attivo (`?tab=students`, `?tab=tools`, `?tab=paths`, `?tab=forum`, `?tab=audit`) senza dover tornare alla home o all'elenco classi.
  4. `frontend/src/components/teacher/TeacherAreaHeader.tsx` e `TeacherAreaPage.tsx`: integrato `TeacherBreadcrumbs` in tutte le sottopagine `/docente/<slug>`, garantendo al contempo la retrocompatibilità totale con i selettori di test esistenti (`[data-teacher-area-header] a[href="/docente"]`).
  5. `frontend/src/components/teacher/ClassSettingsPage.tsx`: integrati `TeacherBreadcrumbs` e `ClassQuickSwitcher` nell'intestazione della classe, visualizzando la gerarchia «Area docenti › [Nome Classe] (› [Sottosezione/Tab])» e il menu compatto per il cambio rapido di classe.
  6. Nuove route dedicate con redirect: `frontend/src/app/docente/palestra/page.tsx` (reindirizza a `/docente/taccuini-prova`), `frontend/src/app/docente/obiettivi/page.tsx` (reindirizza a `/docente/catalogo-obiettivi`) e `frontend/src/app/docente/proposte/page.tsx` (reindirizza a `/docente/assegnazioni`).
  7. `frontend/src/lib/i18n-teacher-area.ts`: definite tutte le 21 nuove etichette localizzate nelle 6 lingue ufficiali (`it`, `en`, `es`, `fr`, `de`, `sv`).
  8. `frontend/src/lib/teacher-breadcrumbs.test.ts` e `frontend/src/lib/teacher-area.test.ts`: test unitari per la generazione corretta delle breadcrumb, completezza i18n nelle 6 lingue, calcolo URL dello switcher con preservazione dei tab e filtraggio gruppi attivi.
  9. `docs-counselorbot/funzionalita-counselorbot.md` e `docs/operations/platform-guidance-state.json`: documentazione allineata e verificata con `make guidance-refresh` e `make guidance-check`.
- Verifiche superate:
  - Unit test frontend: `npm test` (452/452 superati, 0 errori).
  - TypeScript: `npx tsc --noEmit` (0 errori).
  - i18n: `node scripts/check-i18n.mjs` (3.329 chiavi allineate nelle 6 lingue, nessun testo JSX hardcoded).
  - Platform guidance: `make guidance-check` e check contro `origin/main` (SUCCESS).
- Vincoli rispettati: nessun merge autonomo (in attesa di review utente da app mobile), nessun deploy, nessun comando sudo.

---

# Handoff S9: Area Docente - Accorpamento Libreria risorse e snellimento cataloghi (Issue #267)
Data: 2026-10-14 | Stato: completato, verificato, pronto per commit/PR

- Completamento Issue #267 (Milestone 14 'Riorganizzazione Area Docente: didattica attiva, classi e palestra di prova').
- Titolo: 'Area Docente: Accorpamento Libreria risorse (Strategie + Letture e materiali) e snellimento cataloghi'.
- Branch: `feature/teacher-area-resources-library`
- Modifiche realizzate:
  1. `frontend/src/components/teacher/TeacherResourcesHub.tsx`: creato il nuovo componente hub `TeacherResourcesHub`.
     - Struttura unificata a schede (tablist accessibile con touch target >= 44px) che unifica e presenta congiuntamente Strategie di studio/vita (`CertifiedStrategiesPanel`) e Letture, film e materiali certificati (`CertifiedReadingsPanel`).
     - Supporto a commutazione reattiva con query parameter URL `?tab=strategie` e `?tab=materiali` e mantenimento dello stato attivo.
     - Header esplicativo coordinato che valorizza il patrimonio didattico di consultazione e arricchimento.
  2. `frontend/src/app/docente/risorse/page.tsx`: creata la nuova route `/docente/risorse` protetta da `TeacherAreaPage` con slug `'risorse'` e rendering di `TeacherResourcesHub`.
  3. `frontend/src/app/docente/strategie/page.tsx` e `frontend/src/app/docente/materiali/page.tsx`: preservata la piena retrocompatibilità senza regressioni, montando `TeacherResourcesHub` con il tab preselezionato (`defaultTab="strategie"` e `defaultTab="materiali"`), consentendo la consultazione e gestione diretta del pannello specifico e la navigazione fluida tra le risorse.
  4. `frontend/src/components/teacher/TeacherResourcesSection.tsx`: creata la sezione dedicata della home nel Pilastro 3 'Profilo e Risorse' con card congiunta illustrata (`library_hall.png`), link principale all'hub `/docente/risorse` e accessi diretti secondari a `/docente/strategie` e `/docente/materiali`.
  5. `frontend/src/components/teacher/TeacherAreaHome.tsx`: snellita l'area cataloghi eliminando la vecchia griglia frammentata `catalogsGroup`. Il Catalogo obiettivi mantiene il suo posizionamento naturale nel flusso di progettazione didattica (Pilastro 1 in `DidacticDesignSection`), mentre Strategie e Materiali sono accorpati nella nuova sezione `TeacherResourcesSection` nel Pilastro 3.
  6. `frontend/src/lib/teacher-area.ts`: aggiunto lo slug `'risorse'`, associata l'immagine `library_hall.png` e aggiornato `teacherAreaGroups` con il gruppo `resources`.
  7. `frontend/src/lib/i18n-teacher-area.ts`: definite tutte le nuove etichette, nomi e descrizioni per `resources`, `resourcesSubtitle`, `resourcesCardDescription`, `resourcesTabStrategies`, `resourcesTabMaterials`, `resourcesHubDescription`, `resourcesDirectStrategies`, `resourcesDirectMaterials` nelle 6 lingue ufficiali (`it`, `en`, `es`, `fr`, `de`, `sv`).
  8. `frontend/src/lib/teacher-area.test.ts`: aggiornati i test del gruppo risorse e aggiunti test di completezza i18n nelle 6 lingue.
  9. `frontend/tests/teacher-area-home.test.mjs`: aggiornate le asserzioni di home per la sezione Libreria risorse, i collegamenti operativi e aggiunto il test per l'hub `/docente/risorse` con switch dei tab.
  10. `docs-counselorbot/funzionalita-counselorbot.md` e `docs/operations/platform-guidance-state.json`: documentazione allineata e verificata con `make guidance-refresh` e `make guidance-check`.
- Verifiche superate:
  - Unit test frontend: `npm test` (446/446 superati, 0 errori).
  - TypeScript: `npx tsc --noEmit` (0 errori).
  - i18n: `node scripts/check-i18n.mjs` (3.329 chiavi allineate nelle 6 lingue, nessun testo JSX hardcoded).
  - Platform guidance: `make guidance-check` (SUCCESS).
- Vincoli rispettati: nessun merge autonomo (in attesa di review utente da app mobile), nessun deploy, nessun comando sudo.

---

# Handoff S8: Area Docente - Separazione e chiarimento della Palestra di prova (Issue #266)
Data: 2026-10-14 | Stato: completato, verificato, pronto per commit/PR

- Completamento Issue #266 (Milestone 14 'Riorganizzazione Area Docente: didattica attiva, classi e palestra di prova').
- Titolo: 'Area Docente: Separazione e chiarimento della Palestra di prova (studenti fittizi)'.
- Branch: `feature/teacher-area-practice-gym-separation`
- Modifiche realizzate:
  1. `frontend/src/components/teacher/PracticeGymSection.tsx`: creata la nuova sezione dedicata `PracticeGymSection` con stile sandbox protetto.
     - Badge esplicito «Simulazione protetta» con icona `ShieldCheck` per identificare chiaramente l'ambiente di test.
     - Titolo e spiegazione esplicita dello scopo protetto: creazione e gestione di profili di studenti fittizi per sperimentare questionari, prompt personalizzati e dinamiche di colloquio prima delle sessioni reali in classe, con garanzia di nessun impatto sulle classi reali né sui dati dei partecipanti.
     - Tag descrittivi ad alta leggibilità: «Studenti fittizi», «Test prompt e questionari», «Nessun impatto sulle classi reali».
     - Azione primaria CTA touch-friendly (min-h-[44px]) «Entra nella Palestra di prova» verso `/docente/taccuini-prova`, affiancata da link secondario canonico «Taccuini di prova».
     - Illustrazione coordinata `chat-guidata.png` responsive.
  2. `frontend/src/components/teacher/TeacherAreaHome.tsx`: riorganizzata la home dell'Area Docente nei tre pilastri logici:
     - **Pilastro 1 (Didattica e Classi)**: Hero di progettazione didattica attiva (`DidacticDesignSection`), Cruscotto operativo (`MyClassesSection`) e gruppo illustrato «Classe e assegnazioni» (`classroom`).
     - **Pilastro 2 (Palestra di simulazione e prova)**: Sezione autonoma protetta (`PracticeGymSection`), visivamente distinta e separata.
     - **Pilastro 3 (Profilo e Risorse)**: Sezione dedicata «Profilo professionale del docente» (`teacher-profile-notebook-section`) con il Taccuino del docente (`/docente/taccuino`), seguita dai gruppi «Cataloghi» (`catalogs`), «Somministrazioni e ricerca» (`research`) e dalle connessioni AI personali (`PersonalAIConnections`).
     - Rimossa definitivamente la precedente griglia iniziale che posizionava Taccuino docente e Taccuini di prova affiancati in cima, eliminando ogni ambiguità tra profilo reale e simulazione.
  3. `frontend/src/lib/i18n-teacher-area.ts`: definite tutte le 11 nuove etichette localizzate nelle 6 lingue ufficiali (`it`, `en`, `es`, `fr`, `de`, `sv`).
  4. `frontend/src/lib/teacher-area.test.ts`: aggiunti test unitari per la presenza e non-vacuità di tutte le nuove chiavi `practiceGym*` e `teacherProfile*` nelle 6 lingue.
  5. `frontend/tests/teacher-area-home.test.mjs`: aggiornato il test browser verificando la gerarchia dei titoli `h2`, la presenza e conformità della card sandbox e della CTA con touch target >= 44px, la collocazione del Taccuino del docente nel pilastro del profilo professionale sotto la palestra e l'attivazione dei collegamenti.
  6. `docs-counselorbot/funzionalita-counselorbot.md` e `docs/operations/platform-guidance-state.json`: documentazione allineata e verificata con `make guidance-refresh` e `make guidance-check`.
- Verifiche superate:
  - Unit test frontend: `npm test` (445/445 superati, 0 errori).
  - TypeScript: `npx tsc --noEmit` (0 errori).
  - i18n: `npm run i18n:check` (3.329 chiavi allineate nelle 6 lingue, nessun testo hardcoded).
  - Platform guidance: `make guidance-check` (SUCCESS).
- Vincoli rispettati: nessun merge autonomo (in attesa di review utente da app mobile), nessun deploy, nessun comando sudo.

---

# Handoff S7: Area Docente - Sezione Le mie classi come cruscotto operativo nella Home (Issue #265)
Data: 2026-10-14 | Stato: completato, verificato, pronto per commit/PR

- Completamento Issue #265 (Milestone 14 'Riorganizzazione Area Docente: didattica attiva, classi e palestra di prova').
- Titolo: 'Area Docente: Sezione Le mie classi come cruscotto operativo nella Home'.
- Branch: `feature/teacher-area-my-classes-dashboard`
- Modifiche realizzate:
  1. `frontend/src/components/teacher/MyClassesSection.tsx`: creata la nuova sezione cruscotto operativo `MyClassesSection`.
     - Carica le classi con `useTeacherResource('/api/admin/groups', parseClassGroups)`.
     - Mostra le classi attive sotto forma di card intuitive con metadati essenziali: nome classe, numero partecipanti/studenti (con gestione singolare/plurale localizzata), istituto/scuola, codice invito `GR-XXXXXX`.
     - Azione rapida primaria: link diretto all'Hub della specifica classe (`/docente/classi/${group.id}`) con touch target >= 44px.
     - Link secondario di gestione complessiva: collegamento «Gestisci classi» che punta a `/docente/classi` con touch target >= 44px.
     - Zero-state incoraggiante per docenti senza classi attive con invito e CTA «Crea la tua prima classe» (`/docente/classi`).
     - Skeleton loader animato con stato accessibile ARIA e gestione errori con Callout danger e pulsante «Riprova».
  2. `frontend/src/components/teacher/TeacherAreaHome.tsx`: integrata `<MyClassesSection />` in posizione armonica subito sotto `<DidacticDesignSection />` e prima dei gruppi illustrati.
  3. `frontend/src/lib/i18n-teacher-area.ts`: definite tutte le 14 etichette localizzate nelle 6 lingue ufficiali (`it`, `en`, `es`, `fr`, `de`, `sv`).
  4. `frontend/src/lib/teacher-my-classes.test.ts`: test unitari per validazione payload gruppi, filtraggio classi attive, conformità route Hub e verifica localizzazione nelle 6 lingue.
  5. `frontend/src/lib/teacher-area.test.ts`: aggiunta suite di test per la presenza e non-vacuità di tutte le chiavi `myClasses*` nelle 6 lingue.
  6. `frontend/tests/teacher-area-home.test.mjs`: aggiornato test per la nuova gerarchia dei titoli h2 e aggiunti scenari per card attive, metadati, hub link, zero-state ed errore/retry con touch targets >= 44px.
  7. `docs-counselorbot/funzionalita-counselorbot.md` e `docs/operations/platform-guidance-state.json`: documentazione di piattaforma allineata e verificata con `make guidance-refresh` e `make guidance-check`.
- Verifiche superate:
  - Unit test frontend: `npm test` (444/444 superati, 0 errori).
  - TypeScript: `npx tsc --noEmit` (0 errori).
  - i18n: `npm run i18n:check` (3.329 chiavi allineate nelle 6 lingue, nessun testo JSX hardcoded).
  - Platform guidance: `make guidance-check` (SUCCESS).
- Vincoli rispettati: nessun merge autonomo (in attesa di review utente da app mobile), nessun deploy, nessun comando sudo.

---

# Handoff S6: Area Docente - Hero di progettazione didattica attiva (Issue #264)
Data: 2026-10-14 | Stato: completato, verificato, pronto per commit/PR

- Completamento Issue #264 (Milestone 14 'Riorganizzazione Area Docente: didattica attiva, classi e palestra di prova').
- Titolo: 'Area Docente: Hero di progettazione didattica attiva (Obiettivi Bloom/SMART in primo piano)'.
- Goal Diario: `a9143835-b8e4-4db8-83e2-2132ffccd43d`
- Task Diario: `e29eb32f-44b2-43bd-8605-1ee959c31ce4`
- Branch: `feature/teacher-area-didactic-design-hero`
- Modifiche realizzate:
  1. `frontend/src/components/teacher/DidacticDesignSection.tsx`: creata la sezione prominente `DidacticDesignSection` con hero card in evidenza (badge didattica attiva con AI, titolo, descrizione pedagogica con tassonomia di Bloom, prova SMART e allineamento costruttivo, CTA touch >= 44px con link diretto a `/?start=OBIETTIVO_DOCENZA`, illustrazione coordinata `obiettivi-classe.png`).
  2. Flusso e ciclo didattico completo: collegamento chiaro e contestualizzato al **Catalogo obiettivi** (`/docente/catalogo-obiettivi`) e ai **Percorsi di classe** (`/docente/percorsi`), spiegando che l'obiettivo progettato può essere pubblicato e inserito direttamente nei percorsi guidati per gli studenti.
  3. `frontend/src/components/teacher/TeacherAreaHome.tsx`: inserita `<DidacticDesignSection />` in posizione prominente tra i taccuini e i gruppi di gestione; rimosso il vecchio link solitario `goal-path` confinato nel gruppo `catalogs`.
  4. `frontend/src/lib/i18n-teacher-area.ts`: localizzate tutte le etichette della sezione e del flusso didattico nelle 6 lingue ufficiali (`it`, `en`, `es`, `fr`, `de`, `sv`).
  5. `frontend/src/lib/teacher-area.test.ts`: aggiunti test unitari per la localizzazione completa delle 14 nuove etichette didattiche nelle 6 lingue e per l'integrità del gruppo `catalogs`.
  6. `frontend/tests/teacher-area-home.test.mjs`: aggiornato lo smoke test browser Playwright verificando la hero card, il touch target >= 44px della CTA, l'ordine dei titoli h2 e i link correlati.
  7. Documentazione e conformità: aggiornato `docs-counselorbot/funzionalita-counselorbot.md` e sincronizzato `docs/operations/platform-guidance-state.json` tramite `make guidance-refresh`.
- Verifiche superate:
  - Unit test frontend: `npm test --prefix frontend` (439/439 superati, 0 fallimenti).
  - TypeScript: `tsc --noEmit -p frontend/tsconfig.json` (0 errori).
  - i18n: `npm run i18n:check --prefix frontend` (3.329 chiavi allineate nelle 6 lingue, nessun testo hardcoded).
  - Browser smoke: `teacher-area-home.test.mjs` (smoke OK con Playwright).
  - Platform guidance: `make guidance-check` e `python3 scripts/check-platform-guidance.py --check --base origin/main` (SUCCESS).
- Vincoli rispettati: nessun merge della PR (in attesa di review utente da app mobile), nessun deploy, nessun comando sudo.

---

# Handoff S5: Compilazioni degli studenti nel gruppo Classe e assegnazioni
Data: 2026-10-14 | Stato: completato, verificato, pronto per commit/PR

- Spostamento di «Compilazioni degli studenti» dalla visualizzazione inline nella home docente alla struttura ad elenco illustrato nel gruppo «Classe e assegnazioni» (`group.id === 'classroom'`).
- Modifiche realizzate:
  1. `frontend/src/lib/teacher-area.ts`: aggiunto lo slug `'compilazioni'` a `teacherAreaSlugs`, al gruppo `classroom` e mappata l'immagine `/images/platform/compilazioni.png`.
  2. `frontend/src/lib/i18n-teacher-area.ts`: aggiunte le traduzioni di nome e descrizione di `compilazioni` nelle 6 lingue ufficiali (`it`, `en`, `es`, `fr`, `de`, `sv`).
  3. `frontend/src/components/teacher/TeacherAreaHome.tsx`: rimossa la sezione inline `<ClassCompilationsSection />`; la voce appare ora ordinatamente come card/tile illustrata nel gruppo «Classe e assegnazioni» insieme a Classi, Percorsi, Incontri e Assegnazioni.
  4. `frontend/src/app/docente/compilazioni/page.tsx`: creata la pagina dedicata con `TeacherAreaPage` e intestazione unificata `TeacherAreaHeader`.
  5. `frontend/src/components/teacher/ClassCompilationsSection.tsx`: aggiunto supporto a `showHeading={false}` per evitare duplicazioni di titoli sotto `TeacherAreaHeader`.
  6. `frontend/src/lib/teacher-area.test.ts`: test unitari per verifica presenza nel gruppo classroom, percorsi immagini e completezza i18n su tutte le 6 lingue.
  7. Documentazione e conformità: aggiornato `docs-counselorbot/funzionalita-counselorbot.md` e rigenerato `docs/operations/platform-guidance-state.json` tramite `make guidance-refresh`.
- Verifiche superate:
  - Unit test frontend: `npm test --prefix frontend` (437/437 superati, 0 fallimenti).
  - TypeScript: `tsc --noEmit -p frontend/tsconfig.json` (0 errori).
  - i18n: `npm run i18n:check --prefix frontend` (3.329 chiavi allineate nelle 6 lingue).
  - Platform guidance: `make guidance-check` e `python3 scripts/check-platform-guidance.py --check --base origin/main` (SUCCESS).
- Vincoli rispettati: nessun comando sudo, nessun deploy diretto.

---

# Handoff S5: Vista d'insieme dei risultati e delle chat dei propri studenti (Issue #246)
Data: 2026-10-14 | Stato: completato, PR pronta su main

- Completamento Issue #246 (Milestone 12 'Incontro tutor PEF del 12 ottobre 2026').
- Goal Diario: `5dac8109-93b1-44fb-acc4-c6b5aaa53df7`
- Task Diario: `ab555dbb-20c3-4ee8-b1c2-242de063fe0b`
- Branch: `feature/teacher-class-overview-matrix`
- Obiettivi realizzati:
  1. Scheda **Partecipanti e risultati** (`?tab=students`) aggiunta alle schede attive di `ClassSettingsPage.tsx` (`/docente/classi/{id}`): il docente consulta direttamente partecipanti, note/messaggi e risultati salvati.
  2. **Vista d'insieme aggregata (matrice)**: `PlanStudentsPanel.tsx` integrato con toggle `Vista d'insieme` (matrice) ed `Elenco partecipanti`.
     - Matrice responsive (`overflow-x-auto`) studenti × strumenti: data di completamento, punteggi sintetici, contatore tentativi multipli.
     - Ispezione rapida: cliccando una casella compilata si apre la scheda di dettaglio con `StudentResultItem` e pulsante per leggere la chat completa.
     - Totali di completamento per strumento (colonna) e per studente (riga).
  3. Percorso docente fluido e continuo:
     - Dalla dashboard `/docente`: link diretto «Vista d'insieme della classe» quando una classe è selezionata nella sezione Compilazioni.
     - Dall'elenco classi `/docente/classi`: link diretto «Partecipanti e risultati» accanto ad «Apri classe», «Strumenti e counselor» e «Percorsi».
  4. Localizzazione: tutte le etichette tradotte nelle 6 lingue ufficiali (`it`, `en`, `es`, `fr`, `de`, `sv`).
  5. Documentazione e conformità:
     - `docs-counselorbot/funzionalita-counselorbot.md` aggiornato.
     - `docs/operations/teacher-class-results-overview.md` redatto.
     - `make guidance-refresh` e `make guidance-check --base origin/main` superati.
- Verifiche superate:
  - Unit test frontend: `npm test --prefix frontend` (434/434 superati, 0 fallimenti).
  - TypeScript: `tsc --noEmit -p frontend/tsconfig.json` (0 errori).
  - i18n: `npm run i18n:check --prefix frontend` (3.329 chiavi allineate nelle 6 lingue).
  - Platform guidance: `make guidance-check` e `python3 scripts/check-platform-guidance.py --check --base origin/main` (SUCCESS).
- Vincoli rispettati: nessun merge della PR (in attesa di review utente da app mobile), nessun deploy, nessun comando sudo.

---

# Handoff S3: seconda integrazione di main per PR #260 (merge PR #261 e PR #259)
Data: 2026-10-14 | Validazione completata; PR #260 MERGEABLE e CLEAN su GitHub

- Integrazione non distruttiva di `origin/main` avanzato a `b2ba6e288d9a16a859f4f606a46f6d3bc5ca6642`
  (merge PR #261 per avvisi primo uso Taccuino/counselor e PR #259 per licenza AGPL-3.0).
- Conflitti di integrazione risolti:
  - `docs/operations/live-dev-environment.md`: integrate coerentemente le sezioni preservando
    sia le istruzioni sulle compilazioni di classe nella dashboard docente (S3), sia le note
    sul primo uso del Taccuino/counselor (S2).
  - `docs/operations/platform-guidance-state.json`: risincronizzato con `make guidance-refresh`
    riallineando i digest SHA256 di prodotto e guida.
  - Codice applicativo (compilazioni di classe, dropdown classi, permessi docente) e modifiche di main
    preservati integralmente senza interventi fuori scope.
- Verifiche superate:
  - Conformità documentale: `make guidance-check` e check con `--base origin/main` superati (documentazione allineata).
  - Test unitari frontend: `npm test --prefix frontend` 430/430 superati (0 fail).
  - Localizzazione: `npm run i18n:check --prefix frontend` (3.329 chiavi allineate nelle 6 lingue).
  - TypeScript / build: verifica tipi con `tsc --noEmit -p frontend/tsconfig.json` superata (0 errori).
- Stato remoto PR #260:
  - Commit di merge: `9e9fdadfe687ff338a323b32b78d01c90678291f` su branch `feature/teacher-class-compilations`.
  - GitHub status: `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`.
  - Check remoti: `Platform guidance` SUCCESS, `Release Drafter` SUCCESS.
- Vincoli rispettati: nessun merge della PR, nessun deploy, nessun comando sudo.

---

# Handoff S3: integrazione non distruttiva di main per PR #260
Data: 2026-10-14 | Validazione locale completata; gate remoto obbligatorio dopo push

- Ripresa IVN sullo stesso worktree/branch. Merge di `origin/main` aggiornato a
  `b81e76067a1e0b66c6dac7faf9e5b9df49e749e2` (PR #258) senza reset/rebase/force push.
- Conflitti solo in HANDOFF e manifest guidance: entrambe le consegne S1/S3
  conservate integralmente, manifest rigenerato sull’integrazione.
  Documentazione prodotto e guida integrano sia **Salva** sia le compilazioni di classe.
- `ScoreInputForm`, `PracticeRepertoire`, copie e test S1 sono byte per byte quelli
  di main. I quattro componenti applicativi S3 sono byte per byte quelli di
  `a85fd816`. Nessuna riscrittura del lavoro S1/S2 o nuova feature.
- Verifiche ripetute perché necessarie all’integrazione: 430/430 unitari;
  TypeScript, i18n 3.325 chiavi, ESLint mirato, 3/3 test del gate guidance;
  `make guidance-refresh`, check e gate `--base origin/main`, diff/staged-check.
- Browser compilato: dashboard 1/1, guida S3 nelle sei lingue 1/1;
  profili S1 23/24 nella suite, caso residuo 1/1 nel rerun selettivo. Lo stesso
  caso passa 1/1 anche sull’immagine S1 di confronto. Tutti i 24 casi S1 verificati;
  l’intermittenza della lettura immediata dei radio resta registrata come sospetta,
  senza modificare test o applicazione di main.
- Build Docker Webpack riuscita: `counselorbot-frontend:s3-class-compilations-integration`,
  ID `sha256:1df249f97b6215ba0bb1bba7184fdd650be6783952a4c57839aef1e2663c5463`;
  container regolare/log senza errori, fixture solo su 127.0.0.1:3143.
  Container di integrazione e confronto (:3144) arrestati prima del commit.
  Nessun DB, deploy, sudo o container di produzione coinvolto.
- I 25 test browser e 9 HTTP PostgreSQL della consegna S3 iniziale restano validi:
  componenti S3 e backend invariati, non ripetuti senza ragione.
- Bug IVN `776c271a-c490-4c92-81e0-aaaa388f63de`: richiede, prima della chiusura,
  readback GitHub fresco con head identico al push, MERGEABLE e check SUCCESS.
  Il solo commit di merge non costituisce prova di compatibilità.
- Nuovo bug LOCAL `fcc442d0-2b46-40d3-849e-805fa4de80a8`: fixture radio del contesto
  intermittente, triage sospetto. Nessun bug non registrato o issue aperta a mano.
  Limiti preesistenti: lint globale e test con dati sintetici, come nella consegna iniziale.

---

# Handoff S3: compilazioni di classe nella dashboard docente
Data: 2026-10-14 | Stato: completato, PR #260 aperta su main

- PR [#260](https://github.com/nugh75/counselorbot-sbs/pull/260), collegata al Project
  CounselorBot; commit funzionale `79546660`. Nessun merge/deploy.
  Notify immediato best-effort: Timoniere destinatario in lavoro, notifica pending;
  canale mobile disattivato, consegna non verificata.
- Task Diario `7e7e3f97-2780-437b-8686-16a86a1fbbe6`, goal `9ce5d48f-e663-489a-9074-5966d55f6c87`.
  Agente `s3-compilazioni-classe`, T2 Codex gpt-6.1-sol high, `--yolo`;
  deroga esplicita utente alla revisione cross-modello limitata a questo task/PR.
- Worktree esclusivo `/tmp/counselorbot-teacher-class-compilations-20261013`,
  branch `feature/teacher-class-compilations`, base aggiornata `4c80f4a5`.
- In `/docente`, sotto i taccuini, sezione sempre visibile **Compilazioni degli studenti**:
  scelta esplicita classe propria/condivisa, risultati salvati ordinati per data,
  username, strumento, data e punteggi disponibili. Conversazione su apertura,
  stesso componente riusato da Classi e Piani di somministrazione.
- API e accessi backend invariati: classe propria/condivisa (admin come prima),
  membro corrente e risultato della sessione. Cambio classe smonta elenco e
  conversazioni, abortisce le letture e ignora risposte tardive. Stati caricamento,
  nessuna classe, nessun risultato, errore/retry e accesso negato localizzati.
  Nessuna inferenza sui questionari mancanti, export o nuovo form/permesso.
- File principali: `ClassCompilationsSection.tsx`, `StudentResultItem.tsx`,
  `TeacherAreaHome.tsx`, `PlanStudentsPanel.tsx`; nuove copie nelle sei lingue,
  guida docente e sei screenshot; documento piattaforma, CONTEXT e operazioni.
  PracticeRepertoire/ScoreInputForm, onboarding, QSA, chat_logic e prompt non toccati.
- Verifiche: **9/9 HTTP FastAPI/PostgreSQL** sintetici (ruoli, proprietà/condivisione,
  revoche, membro rimosso, sessione altrui, docente senza classi/classi vuote);
  **25/25 browser sul compilato** (24 nuovi + smoke dashboard esistente), sei lingue,
  320 px, chiaro/scuro, tastiera, 44 px, selezione, race, errori e guida;
  **430/430 unitari**, TypeScript, i18n 3.325 chiavi, ESLint mirato senza warning,
  build locale Webpack, guidance refresh/check/--base origin/main e diff/staged-check.
- ESLint globale: **5 errori e 50 warning preesistenti**. I cinque errori sono
  confermati sui file della base con `git show HEAD:<file> | eslint --stdin`:
  ReturningHome:67, PersonalAreaHome:98, NewDeckDialog:36, class-paths-tool-names:11,
  use-collapsed-catalog:27. Non corretti in questo task.
- Docker: primo build originale riuscito; rebuild Turbopack senza avanzamento oltre
  25 minuti interrotto. Rebuild finale isolato **Webpack riuscito**, stesso Dockerfile
  e dipendenze salvo il comando di verifica `next build --webpack`, senza modificare
  il Dockerfile versionato. Tag `counselorbot-frontend:s3-class-compilations-validation`,
  ID `sha256:9b0056b2c7068c1b76047a23e5d7e129faf212bdc8933230f80e476a83ea3134`.
  Container senza rete: avvio/log regolari, `/docente` HTTP 200; immagini guida nel
  container identiche ai file finali 6/6. Nessun rebuild/restart produzione, deploy o sudo.
- Processi propri :3143 arrestati; container frontend e PostgreSQL di prova arrestati.
  PostgreSQL :55443 era su tmpfs, senza volumi persistenti. Nessuna modifica al checkout
  principale o agli altri worktree. Comandi e limiti in
  `docs/operations/teacher-class-compilations.md`.
- Bug registrati LOCAL nel Diario (nessuna issue aperta manualmente):
  `50db1e7c-31a4-4ee4-8097-e5490efc74e1` lint globale, confermato e deduplicato;
  `ae6b1009-1d3b-4ef2-967f-a23ed6ee6a86` overflow svedese dei taccuini, risolto;
  `92e23480-bcba-4ae9-b271-78147fbd73b3` rallentamento Turbopack, sospetto
  (carico concorrente; riproduzione deterministica non confermata).
  Bug non registrati: nessuno. I primi timeout dev/fixture sotto carico sono superati
  dalla suite finale compilata; nessuna certificazione SSO o dati reali/produzione.

---

# Handoff S1: Salva nei profili dei Taccuini di prova
Data: 2026-10-14 | Agente: s1-salva-yolo | Ramo: fix/practice-profile-save-label

- Task Diario: `79567a65-a28a-4450-8c8e-57aab9b3b168`; bug richiesto:
  `0de89d6f-e1c7-4e49-8e14-07c3af3c725a`.
- `ScoreInputForm` offre l’azione esplicita di salvataggio con il Button petrol
  e l’icona Save; `PracticeRepertoire` la usa con **Salva** in creazione e modifica.
  Il default dei flussi ordinari resta **Continua** con freccia avanti.
- Messaggio sul salvataggio esplicito e guida allineati in IT/EN/ES/FR/DE/SV;
  documentazione prodotto, documento operativo e manifesto guidance aggiornati.
- Verifiche: 430/430 unitari frontend; 3.325 chiavi i18n nelle sei lingue;
  4/4 test API del repertorio su PostgreSQL effimero, inclusa rilettura fresca.
  Browser: 19 casi passati nella suite, poi 5/5 casi dei link negativi passati
  dopo aver corretto l’attesa del toast transitorio. Tutti i 24 casi verificati.
  Creazione/modifica e reload nelle sei lingue a 390 px, nessun avvio implicito,
  avvio chat separato, retry e assenza di compilazioni reali verificati.
- TypeScript della build e `tsc --noEmit --tsBuildInfoFile .next/cache/.tsbuildinfo`
  passati nel builder isolato (copia standalone spostata fuori dai sorgenti
  solo nel container temporaneo); ESLint mirato e controllo sintassi del test.
  `make guidance-refresh`, `make guidance-check`, gate `--base origin/main`
  e `git diff --check` passati.
- Build Docker frontend completata: `s1-salva-yolo-frontend:local`, contesto
  temporaneo senza `.env*`, heap limitato e telemetria disattivata. Backend
  invariato; test su immagine locale esistente con fixture montate in sola lettura.
  Nessun Compose, merge, deploy, sudo o accesso a dati di produzione.
- Limiti: browser con API sintetiche; persistenza DB verificata separatamente.
  Dipendenze native del worktree incomplete dopo installazioni interrotte:
  controlli eseguiti con Node 22 nel builder e Playwright temporaneo sul Mac.
  Processi e container S1 arrestati prima della consegna.
- Revisione cross-modello dispensata esplicitamente dall’utente il 2026-10-13
  solo per questo task/PR; nessuna autorizzazione a merge o deploy.
- Bug tecnici registrati LOCAL nel Diario: `a2f445e1-ad30-4198-83ad-ae5c0ed2b11d`
  (fixture backend mancanti nel runner, corretto: 430/430);
  `ffeb64b5-1d00-4aa1-b4d1-bf30cfe6e607` (asserzione delle scritture includeva
  le preferenze del layout, corretta);
  `be5f7d3a-c1f4-49fe-97c2-9e5ca1acf243` (attesa networkidle perdeva il toast,
  riprodotto anche sull’immagine precedente e corretto nel solo test: 5/5).
- Bug non registrati: nessuno. Nessuna issue aperta manualmente.

---

# Handoff: Selezione multi-tag per filtro categorie counselor
Data: 2026-10-07 | Stato: Completato, verifiche superate

- **Task**: Consentire la selezione multipla di tag di approccio (categorie) nella scelta del counselor.
- **Modifiche principali**:
  - `frontend/src/components/questionnaire/CounselorSelector.tsx`:
    - Stato sostituito con `selectedCategories: string[]`.
    - Chip "Tutti" azzera la selezione ed è attivo quando `selectedCategories.length === 0`.
    - I chip di categoria effettuano il toggle multi-tag (`toggleCategory`).
    - Aggiunto contatore badge e pulsante «Azzera filtri» (`counselor.filter.reset`) nell'intestazione del filtro.
    - Integrata funzione `filterCounselorsByCategories`: filtro inclusivo (match su almeno un tag) e ordinamento per numero decrescente di tag corrispondenti, con priorità del counselor raccomandato se presente.
  - `frontend/src/lib/counselor.ts`:
    - Esportata funzione `filterCounselorsByCategories` pura e testabile.
  - `frontend/src/lib/i18n.ts`:
    - Aggiunta chiave `counselor.filter.reset` nelle 6 lingue (it, en, es, fr, de, sv).
  - `frontend/src/lib/counselor-identity.test.ts`:
    - Aggiunti test unitari per filtro vuoto, filtro singolo, multi-tag con ordinamento per match count, priorità raccomandato ed esclusione raccomandato senza match.
  - `docs-counselorbot/funzionalita-counselorbot.md` & `docs/operations/platform-guidance-state.json`:
    - Aggiornate le specifiche d'interfaccia e sincronizzato lo snapshot guidance.
- **Verifiche eseguite**:
  - `npm test --prefix frontend`: 291/291 passati (0 fail).
  - `npm run build --prefix frontend`: build Next.js di produzione completata con successo.
  - `make guidance-check`: documentazione sincronizzata con successo.

---

# Handoff: Creazione chat guidate da zero (C1-C4) & Identità visiva Counselor e ricerca per approccio (M2.1-M2.3)
Data: 2026-10-07 | Stato: Tutte le PR mergiate su main, container di produzione rebuildati e sani

Entrambi i macro-obiettivi assegnati sono stati completati in autonomia e mergiati su `main` tramite il pilota automatico:

1. **Goal 1: Creazione da zero di nuove chat guidate dall'amministrazione** (`3f4755d4-809c-44b5-ba07-d9a1cdb5a6d0`) — RAGGIUNTO
   - **Piano**: `docs/operations/piano-creazione-chat-guidate-da-zero.md` (PR [#65](https://github.com/nugh75/counselorbot-sbs/pull/65))
   - **C1 (Backend Core & Dynamic Registry)**: PR [#66](https://github.com/nugh75/counselorbot-sbs/pull/66) — schema DB per strumenti dinamici, `DynamicInstrumentSet`, API survey e admin.
   - **C2 (Admin Wizard UI)**: PR [#67](https://github.com/nugh75/counselorbot-sbs/pull/67) — modale e wizard di creazione in amministrazione, supporto i18n 6 lingue.
   - **C3 (Student Flow & Dynamic Catalog)**: PR [#68](https://github.com/nugh75/counselorbot-sbs/pull/68) — cataloghi studente e docente dinamici, avvio chat guidata per nuovi strumenti.
   - **C4 (Admin Sandbox Preview & Rifinitura)**: PR [#70](https://github.com/nugh75/counselorbot-sbs/pull/70) — collaudo admin con sessioni effimere sandbox senza inquinare le statistiche di ricerca.

2. **Goal 2: Counselor: identità visiva e ricerca per approccio** (`6d3968f9-cf9c-4b3c-a623-8fc444c61edd`, Issue #61) — RAGGIUNTO
   - **M2.1 (Backend Model, Categories & Recommend API)**: PR [#69](https://github.com/nugh75/counselorbot-sbs/pull/69) — estensione counselor, tagline i18n, categorie multiple, endpoint raccomandazione stile/approccio.
   - **M2.2 (Frontend Counselor Selector)**: PR [#71](https://github.com/nugh75/counselorbot-sbs/pull/71) — selettore con frase distintiva, badge di approccio, chip filtri e ricerca stile ("Che tipo di counselor vorresti?").
   - **M2.3 (Illustrazioni Personas Palette di Piattaforma)**: PR [#72](https://github.com/nugh75/counselorbot-sbs/pull/72) — 12 illustrazioni vettoriali SVG curate nei colori della piattaforma (teal/turchese, forme morbide, accenti arancio).
   - **Fix TypeScript Imports**: PR [#73](https://github.com/nugh75/counselorbot-sbs/pull/73) — rimozione TS5097 per la compilazione Next.js di produzione.

- **Deploy & Stato Container**:
  - `docker compose build backend frontend && docker compose up -d backend frontend` eseguito con successo.
  - Container `counselorbot_backend` e `counselorbot_frontend` riavviati e sani (HTTP 200 su 8088 e 3000).
  - Nginx e porte invariati (nessun comando sudo necessario).

---

# Handoff: varianti DB di tutti i prompt per Totale/Ristretto/Minimo
Data: 2026-10-05 | Stato: PR #54 aperta, da revisionare

- PR [#54](https://github.com/nugh75/counselorbot-sbs/pull/54), aperta su main e
  collegata al Project V2 CounselorBot. Notify eseguito immediatamente dopo
  apertura, best-effort; canale mobile disabilitato, consegna non verificata.
- CLI `gh pr edit` richiama Projects classic dismessi: body aggiornato via
  REST, collegamento Project via GraphQL V2. Bug noto nel Diario aggiornato.
- Commit `e7f18bf` (test anteprima precedente), `5b1bdaf` (funzionalità e prove).
- Correzione successiva a #53 (merge dd48085): ogni testo modello nella Mappa
  ha pulsanti Totale/Ristretto/Minimo, varianti Config indipendenti e revisioni.
  Include direttive, sistema/follow-up, meta, Idea, step e persona.
- Worktree `/tmp/counselorbot-prompt-variants-all-levels-1005`, branch
  `feature/prompt-variants-all-levels`, creato da origin/main dopo verifica Git.
  Nessuna modifica ai checkout o ai cambiamenti preesistenti.
- Vuoto eredita Totale; __short compatibile solo con Ristretto. Modelli e
  ripieghi usano il livello assegnato, con gli stessi contratti e dati. Anteprima
  a blocchi/messaggi coerente. Limiti del livello ancora attivi; meta va abilitato
  se desiderato (default ristretto/minimo: escluso).
- Verifiche: 168 backend in Docker, 265 unit frontend, 21 browser Mappa + 2
  anteprima, build, TypeScript, i18n3139/6, lint mirato e guidance. Lint globale
  resta bloccato dal NewDeckDialog preesistente (1 errore/44 warning).
- Confronto Prompt Lab senza generazione: 108 richieste (36 per livello), nessuna
  nuova prova live di qualità; runner live esteso a 216 casi. Nessuna assegnazione
  o scrittura di prompt operativi.
- Dettagli, screenshot, comandi e bug LOCAL:
  `docs/operations/prompt-variants-all-levels-validation.md`.
- Nessun deploy operativo. Dopo merge: rebuild backend/frontend/worker Lab;
  quindi testi e assegnazioni manuali. Nessuna migrazione DB o proxy/sudo.
  Container/processi di prova propri arrestati alla consegna; immagini conservate.
- Bug non registrati: nessuno. Bug nuovi corretti, fixture corrette; errore lint
  fuori ambito già registrato, evidenza aggiornata. Nessuna issue aperta a mano.

---

# Handoff: differenziazione prompt CR1–CR4
Data: 2026-10-05 | Stato: implementazione e verifiche locali, PR da revisionare

PR [#53](https://github.com/nugh75/counselorbot-sbs/pull/53), aperta verso main e
collegata al Project V2 CounselorBot. `gh --project` non compatibile con API
classic dismesse: usata l'API GraphQL V2, bug sospetto registrato LOCAL.
Notify eseguito subito: nessun Timoniere attivo, notifiche mobile disabilitate;
nessun segnale recapitato. Proseguito come previsto dal requisito best-effort.

- Worktree `/tmp/counselorbot-prompt-differentiation-1005`, branch
  `feature/prompt-differentiation`, base origin/main `005cf2c`.
- CR1: stime token su testi/bozze nella Mappa, blocchi/totale/budget in
  anteprima e rapporto nei log sync/streaming.
- CR2: livelli Config rinominabili/aggiungibili, tetti componenti, meta/storico
  e assegnazione esatta manuale provider/modello. Salvataggio esplicito;
  step e contratti obbligatori conservano precedenza.
- CR3: editor `__short` vuoto per ogni prompt di sistema/follow-up, stessa
  proprietà/conferma/revisione; normale se breve assente. Testi scritti soltanto
  dall'amministratore. Ogni ripiego riparte dall'envelope originale.
- CR4: snapshot/worker Prompt Lab condividono l'adattamento. Runner fisso:
  3 step × 12 strumenti × 2 modelli × 2 livelli, 144 prove sintetiche locali.
  Token stimati −9,13%, nessun miglioramento qualità dimostrato; nessuna
  attivazione automatica. Verdetti automatici, non revisione educativa umana.
- Backend: 140 test nell'immagine isolata, inclusa parità 65×6×3.
  Frontend: 265 unità, 19 browser desktop/mobile, build con TypeScript,
  i18n3136/6 e lint mirato. Lint globale bloccato da errore NewDeckDialog
  preesistente; dettagli/limiti/bug nella pagina di validazione.
- Docker backend/frontend ricostruiti come immagini locali di verifica.
  Nessun deploy, merge, sudo, modifica .env, dati o prompt operativi.
  Dev3165 e container propri frontend3166/PostgreSQL18598 fermati alla fine;
  immagini restano disponibili, altri processi non toccati.
- Correzione compact in commit separato `8902e96`; feature/documentazione in
  commit dedicato `d491b16`. Push e PR a main; nessun merge eseguito.
- Documentazione: `docs/operations/model-context-levels.md` e
  `docs/operations/model-context-levels-validation.md`; JSON depurato e
  screenshot desktop/mobile. Manifest guida aggiornato e controllato.
- Bug tutti LOCAL nel Diario, nessuna issue manuale: compact e isolamento
  fixture risolti; segnalazione conferma scartata; qualità sintetica sospetta;
  lint preesistente confermato. Bug non registrati: nessuno.

---

# Handoff: codice incollabile nel terminale e callback SSH
Data: 2026-10-05 | Stato: deploy verificato; PR creata come ultimo passo

- Richiesta dell'utente: mantenere la CLI e risolvere il codice che non compare
  al prompt SSH/code-server. Il precedente `getpass` nascondeva l'input.
- Input ora visibile, messaggio esplicito **premi Invio** e conferma del numero
  di caratteri; `--hide-code` conserva l'inserimento nascosto facoltativo.
  Il campo richiede il codice CounselorBot, mai un token o una chiave OpenAI.
- CLI remota con `--no-browser --callback-port 1455`: URL da aprire nel browser
  locale e callback inoltrato alla stessa porta dello host SSH. Listener sempre
  su127.0.0.1; code-server ha loopback distinto, documentato nella pagina e guida.
- Copia scaricata `chatgpt-connect.py` nella radice confrontata byte per byte
  con la versione Git precedente: nessuna modifica utente. Aggiornata per
  correggere anche il comando effettivamente usato; originale conservato in
  `dist/chatgpt-cli-backups/chatgpt-connect.20261005-083201.py` (0600, escluso da Git).
- Verifiche: input reale in PTY host e container code-server con codice fittizio
  e risposta pubblica409 sicura; 16 test helper nell'immagine Docker isolata
  senza rete (17 subtest), PKCE/callback/porta occupata; 12 browser desktop/mobile
  in sei lingue, TypeScript, lint mirato, i18n2952, guida e build Docker passati.
- Backend/frontend ricostruiti e ricreati, tre container healthy. Download CLI
  autenticato sul dominio confrontato con i byte del sorgente aggiornato;
  identità Console, download Mac, protezione basic, logout e revoca verificati.
- Il percorso dell'utente sul suo SSH e l'accesso reale a ChatGPT restano da
  completare: test soltanto con grant fittizi, nessun account OpenAI utilizzato.
  Procedura: `docs/operations/chatgpt-subscription.md`.
- Branch `fix/chatgpt-ssh-code-input`; nessun merge eseguito dall'agente.
  Dev e processi PTY di prova fermati. Stack applicazione avviato;
  stop senza perdere dati: `docker compose --env-file .env -f docker-compose.portable.yml stop`.
  **`sudo ./update_nginx.sh` non è necessario**: proxy Console già valido.

---

# Handoff: pairing ChatGPT e assistente grafico macOS pubblicati
Data: 2026-10-05 | Stato: deploy e verifiche completati; PR da revisionare

- Riprodotta la causa del fallimento: nginx richiedeva il cookie Console
  anche al helper con Bearer; il terminale code-server non è il computer del
  browser per il callback locale. Anche la User-Agent Python subiva un 403.
- Tre eccezioni nginx esatte per il solo pairing temporaneo; metodi/body
  limitati, cookie e header identità rimossi, no-store. Altre API e download
  mantengono SSO Console. Helper Python con User-Agent accettata e messaggi
  sicuri; file scaricato dall'utente nella radice preservato senza modificarlo.
- Assistente nativo Mac12+, Intel/Apple Silicon, senza Python o terminale:
  sorgenti in `tools/chatgpt-macos`, build/test con `scripts/build-chatgpt-macos.sh`.
  ZIP autenticato disponibile nella pagina; codice di associazione distinto
  dai token. PKCE/state, callback127.0.0.1, trasferimento HTTPS; nessun token
  visualizzato o salvato dal helper. Documentazione e Guida in sei lingue aggiornate.
- Artefatto locale escluso da Git, bind backend readonly. SHA256 ZIP:
  `02f472d3a42cc492a49a7d8fc36b4daa060620df6fddefa4a632f2b8ccf2735d`.
  Firma ad hoc, non notarizzato: eventuale consenso Gatekeeper dalla GUI.
  Finestra aperta su Apple Silicon; Intel compilato senza hardware Intel disponibile.
- Su richiesta esplicita dell'utente applicata protezione **basic** con l'API
  amministrativa atomica: redazione attiva, NER disattivato, fallback block.
  Rilettura API e runtime verificati con testi fittizi; nessuna chiamata Ollama/AI.
- Verifiche: 140 backend su DB separato, 5 helper HTTP, 253 unità frontend,
  12 browser in sei lingue a 390/1440 px, 23 HTTP proxy isolati; test nativi,
  TypeScript, i18n2951, lint mirato, build Docker e guidance passati.
- Backend/frontend aggiornati e tre container healthy. Configurazione Console
  applicata con backup, nginx-t/reload e secondo giro idempotente. Dominio:
  https://counselorbot.labform.net. SSO reale, download ZIP, logout/revoca e
  rifiuto codici assenti/invalidi verificati pubblicamente, nessun pairing reale creato.
- Da completare dall'utente: aprire l'assistente sul Mac del browser, collegare
  il proprio ChatGPT, scegliere un modello e attivare **Usa il mio abbonamento**.
  Nessun account OpenAI o inferenza reale utilizzato nei test.
- Branch `fix/chatgpt-graphical-pairing`; PR creata come ultimo passo, nessun merge.
  PR43 dell'installazione precedente verificata MERGED. Nessun processo dev o
  app di prova lasciato aperto. Stop stack senza perdere dati:
  `docker compose --env-file .env -f docker-compose.portable.yml stop`.
  **`sudo ./update_nginx.sh` non è necessario** per questa installazione Console Docker.

---

# Handoff: installazione portabile con SSO Console su labform.net
Data: 2026-10-05 | Stato: installato e verificato; PR da revisionare

- Applicazione pubblicata su https://counselorbot.labform.net con il tunnel
  Console esistente. Backend, frontend e PostgreSQL separato sono healthy.
- Audit prima dell'installazione e piano: [report](docs/operations/portable-install-audit.md).
  Configurazione, comandi e risultati: [procedura](docs/operations/portable-installation.md).
- SSO pubblico reale verificato: identità condivisa con Console, ruolo admin,
  API amministrative, cookie di dominio Secure/HttpOnly, logout e revoca.
  Registrazione idempotente; backup privato, test nginx e reload completati.
- Next/Plotly aggiornati; produzione frontend senza vulnerabilità note.
  Rilievi residui: cinque high nei tool dev, una CVE Python senza patch
  senza percorso vulnerabile identificato, errore lint upstream e warning.
- Verifiche: 253 test frontend, 202 smoke backend, 85 test auth/segreti/privacy
  con DB separato; build/TypeScript, i18n, guida e browser desktop/mobile passati.
- Nessun Ollama installato. Provider e credenziali attendono l'operatore;
  redazione PII attiva, detector locale attivo, fallback block preservato.
- I tre container dell'app restano avviati; browser e container temporaneo
  chiusi, nessun processo dev. Stop senza perdere dati:
  `docker compose --env-file .env -f docker-compose.portable.yml stop`.
- Ramo `feature/portable-labform-install`; nessun merge. Il deploy Console
  Docker è applicato: `sudo ./update_nginx.sh` non è necessario.

---

# Handoff: chat QSA raggiunge il backend di sviluppo e conserva gli errori
Data: 2026-10-03 | Stato: implementato e verificato, da revisionare nella PR 40

- Riprodotto con HTTP reale: `/api/health` 200, `/api/chat/stream` 500 con
  `ENOTFOUND backend` usando solo `BACKEND_ORIGIN`. Le route streaming ignoravano
  l’indirizzo host usato dal rewrite e dalla prova delle connessioni personali.
- Resolver condiviso: `BACKEND_ORIGIN`, poi `BACKEND_INTERNAL_URL`, poi Docker.
  Chat guidata, sito, OpenCode e voce usano lo stesso backend. Rewrite in fallback
  dopo le route dinamiche: OpenCode passa davvero dalla route SSE senza buffering.
- Proxy chat condiviso: identità, lingua e annullamento inoltrati, corpo upstream
  trasmesso senza consumo. Errori HTTP prima dello stream e problemi di rete
  conservano solo codici allowlist; nessuna esposizione di testi grezzi o chiavi.
  Preparazione backend AI mappata a HTTP 502 con codice sicuro. Messaggi nelle
  sei lingue negli step e follow-up; Ripeti mantiene fase, counselor e cronologia.
- Presentazioni QSA/QSAr disattivano il ragionamento anche con ID/modalità legacy.
  Scelta del ragionamento negli step di analisi conservata; prompt DB non cambiati.
- Verifiche: 158 backend (66 chat/routing/connessioni + 92 privacy/preparazione),
  249 unità frontend, 32 browser a 390/1440 px, 9 test HTTP reali attraverso Next;
  TypeScript, lint mirati, i18n sei lingue, compileall, bash -n e guidance passati.
- Build Next di produzione completa passata con font reali e TLS verificato:
  `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1 npm run build`. Sorgenti e
  dipendenze installate copiati in `/tmp/counselorbot-qsa-frontend-build`, senza
  file ambiente né metadati Git, per non saturare `/workspace`. Primo tentativo
  diagnosticato come mancata fiducia CA; nessun mock o verifica TLS disabilitata.
- Salvati nella bozza Codex requisito della variabile TLS e istruzioni `start_skill`
  aggiornate, preservando installazione, segreti e repository; `saved`,
  `requires_publish=true`. Salvataggio non applica la configurazione al runtime.
  `API_KEY_OPENROUTER` ancora assente qui; nessuna chiave reale verificata o inferenza
  esterna. Le prove della chat usano esclusivamente dati e upstream fittizi.
- Guida nelle sei lingue e documentazione aggiornate; schermate API/protezione
  riviste, nessun controllo o layout nuovo da fotografare. Nuovo launcher per
  fixture HTTP `scripts/dev-stream-proxy-tests.sh`. Processi fixture della sessione
  fermati al termine; PostgreSQL e dati persistenti conservati.
- Stesso branch `feature/personal-api-keys` e PR 40. Il Codespace dell’utente va
  aggiornato e frontend/backend riavviati con i comandi abituali; niente variabili
  server aggiuntive per questa correzione. Nessun merge/deploy. Docker completo
  non ricostruito: meno di 500 MiB liberi. Il successo con la chiave utente nel
  Codespace resta da verificare dopo l’aggiornamento.

---

# Handoff: filtro esterno senza modello locale dalla pagina amministrativa
Data: 2026-10-03 | Stato: implementato e verificato, da revisionare nella PR 40

- Il test dell’utente segnala `personalAPI.errors.privacy`: richiesta bloccata
  prima di OpenRouter per detector Ollama non disponibile, non chiave invalida.
- In Generale, pannello «Protezione dei dati per i modelli esterni»: modalità
  locale (default invariato e bloccante) o filtro automatico senza Ollama.
  Salvataggio esplicito, limiti del filtro base visibili, nessuna chiamata LLM.
- GET/PUT `/admin/external-privacy`, solo vero amministratore, CSRF e no-store;
  aggiornamento atomico di tre impostazioni. Anche la config generica rifiuta
  modifiche della protezione da parte dei ricercatori.
- Detector legge flag/modello dallo snapshot di ogni AIService: cambio recepito
  dalle nuove richieste nei worker già avviati. La redazione di email, telefoni
  e identificativi rimane attiva; nessuna garanzia di anonimato in modalità base.
- Verifiche: 176 test backend (105 protezione/credenziali e 71 ChatGPT/routing),
  38 browser (16 protezione/Guida e 22 visibilità/attivazione), TypeScript,
  lint mirati, i18n sei lingue, compileall, guidance-check e diff check passati.
  Avvio backend dev completo, nuova rotta anonima risponde 401. DB e browser
  isolati con dati fittizi; nessuna inferenza esterna né fatturazione.
- Fixture demo corretta al nome reale `studente.demo`; nessuna asserzione tolta.
  Screenshot `protezione-dati.png` catturato e verificato, Guida nelle sei lingue
  e Markdown aggiornati. I processi locali 8002/3135 vengono fermati al termine.
- Segreto `API_KEY_OPENROUTER`: assente nel processo corrente. Aggiunto soltanto
  il requisito proxy verso `openrouter.ai` nella bozza dell’ambiente Codex;
  risultato `saved`, `requires_publish=true`. Nessun valore letto, stampato o
  copiato nel repository; bozza salvata non equivale a runtime applicato.
  Validità/quote della chiave reale restano non verificate.
- Branch `feature/personal-api-keys`, stessa PR 40, nessun merge/deploy.
  Docker completo non ricostruito: meno di 500 MiB liberi contro riserva 5 GiB.
  Il Codespace dell’utente deve aggiornare il branch prima di usare il pannello.

---

# Handoff: connessioni multiple e counselor privati nella PR 40
Data: 2026-10-03 | Stato: implementato e verificato, da revisionare e unire

- Branch `feature/personal-api-keys`, stessa PR 40 richiesta dall’utente;
  incorpora attivazione amministrativa e visibilità già integrate. Nessun merge,
  deploy o aggiornamento automatico del Codespace dell’utente.
- Studenti e docenti salvano più connessioni nominate, anche chiavi di più
  account dello stesso provider. Connessione predefinita personale/sistema e
  associazioni counselor→connessione; una connessione può servire più counselor.
  Modelli effettivi nel selettore, senza cambiare i preset dell’istituzione.
- Counselor privati: creazione, modifica e cancellazione con istruzioni nella
  lingua dell’utente, senza traduzione. Visibili e utilizzabili solo dal
  proprietario; esclusi da admin, laboratorio, allineamenti, traduzioni e
  catalogo Telegram condiviso. Controllo anche sugli ID inviati direttamente.
- Schema: nuove tabelle `personal_api_connections`, `personal_ai_routing`,
  `personal_counselor_connections`; campo proprietario aggiunto prima degli
  snapshot dei prompt, counselor pQBL conservato in background. Migrazione
  idempotente della vecchia configurazione senza reinserire la chiave.
  Cifratura delle nuove chiavi legata anche all’ID connessione; selezione senza
  ripiego su altre chiavi o credenziali di sistema in caso di errore personale.
- Pulsante esplicito «Prova connessione e modello»: breve richiesta neutra,
  quota/costo indicati prima della prova. Errori sicuri nelle sei lingue per
  chiave, quota, modello, limiti, protezione dati e connessione; spiegazioni
  anche negli step guidati, con «Ripeti passaggio» ancora utilizzabile.
- Verifiche: 100 test backend credenziali/integrità/migrazione e 101 regressioni
  chat/Bussola/Tavolo/diagrammi/preferenze/routing; 237 unità frontend;
  65 browser (23 connessioni, 22 visibilità/attivazione, 20 recupero chat).
  TypeScript, lint mirati, i18n (2947 chiavi / sei lingue), compileall,
  guidance-check e diff check passati. Fixture readings di recovery aggiornata
  al contratto reale null, conservando tutte le asserzioni.
- Prova di avvio backend su DB `counselorbot_dev`: startup completo dopo la
  migrazione, `/docs` e `/auth/me` rispondono; servizi locali RAG/embedding non
  presenti in questo ambiente. Test DB su schemi isolati con rollback.
  Nessuna chiamata LLM reale o fatturazione. Il catalogo pubblico OpenRouter
  contiene `qwen/qwen3.8-27b:free`; non verifica quota/accesso della chiave utente.
- Docker completo non ricostruito: meno di 500 MiB liberi nel filesystem vfs,
  sotto la riserva di 5 GiB. Non rimossi container, immagini, volumi o dati.
  Aggiornare tutti i worker prima di creare counselor privati: vecchie versioni
  non riconoscono la proprietà e richiedono una verifica prima del rollback.
- Documentazione Markdown, Guida nelle sei lingue, schermata senza chiavi e
  manifest guidance aggiornati. Processi di questa sessione uvicorn 8002 e
  frontend fixture 3135 fermati alla fine; PostgreSQL e archivi conservati.
  Collegamento ChatGPT senza terminale ancora sospeso per il futuro pacchetto app.

---

# Handoff: PR unica per attivazione e visibilità delle connessioni AI personali
Data: 2026-10-03 | Stato: implementato e verificato, da revisionare e unire

- Branch `feature/personal-api-keys`, PR 40. Include i commit della PR 41 e
  l’ultimo `main`; conflitti risolti senza rebase o force push. La PR 41 viene
  sostituita dalla 40 su richiesta esplicita dell’utente. Nessun merge o deploy.
- Commit di integrazione `eeb0fd23`; funzione `b85e3bfe`.
- API personali: l’amministratore può abilitare dal pannello senza variabili
  server. Chiave Fernet privata automatica, directory 0700 / file 0600,
  pubblicazione atomica; volume Docker `personal_api_credentials`. Gli override
  operatori esistenti sono rispettati. Una chiave persa con credenziali salvate
  richiede ripristino, non viene rigenerata. Il meccanismo è condiviso con ChatGPT,
  mantenendo archivi e chiavi separati.
- Se disabilitate, entrambe le funzioni sono nascoste nelle aree personali e
  nella Guida; link diretti rimandano all’area. Studenti e docenti hanno
  `/profilo/api-personali`, `/docente/api-personali`, `/profilo/chatgpt` e
  `/docente/chatgpt`. Lo spegnimento amministrativo seleziona il modello di
  installazione per le nuove richieste e conserva credenziali e preferenza.
- Attivare una modalità personale disattiva l’altra nello stesso aggiornamento,
  con lock per account. I servizi annidati rispettano il richiedente autenticato,
  anche consultando risultati altrui; le anteprime/demo non spendono credenziali.
- Validazione: 81 test integrazione e credenziali; 222 regressioni routing/chat/
  diagrammi/pQBL/PII; 202 smoke; 236 unità frontend; 58 test browser (11 API,
  25 ChatGPT, 22 visibilità/Guida/attivazione nelle sei lingue); TypeScript,
  i18n (2947 chiavi, sei lingue), lint mirati e diff check. Nessuna chiamata a
  provider reale o fatturazione. Test PostgreSQL su schemi isolati con rollback.
- Prova live con API reali dell’app, senza mock, su DB `counselorbot_dev`:
  attivazione delle due funzioni da UI, chiave automatica API, navigazione nelle
  due aree personali. Entrambi i flag riportati al valore iniziale (false),
  nessuna chiave API utente salvata e nessun OAuth OpenAI effettuato.
- Docker: Compose validato con fixture `.env` vuota esterna al repository;
  controllo Dockerfile backend passato. Frontend segnala tre vecchi ENV in
  formato legacy, file non modificato. Ricostruzione completa non eseguita:
  circa 800 MiB liberi nel filesystem Docker vfs, sotto la riserva di 5 GiB.
  Non rimossi container, immagini, volumi, database o dati persistenti.
- Il collegamento ChatGPT grafico senza terminale resta sospeso per il futuro
  pacchetto applicativo, come concordato. L’attivazione amministrativa è grafica;
  l’attuale associazione account mantiene il componente locale ufficiale.
- Le credenziali automatiche di sviluppo sono ignorate da Git e Docker e non
  sono state stampate. Documentazione, Guida nelle sei lingue e schermata API
  personali revisionate; manifest guidance aggiornato.
- Processi di sviluppo di questa sessione: uvicorn 8002 / Next 3107;
  al termine della verifica vengono fermati. Il Codespace dell’utente non è
  accessibile a questa sessione e non è stato aggiornato automaticamente.

---

# Handoff: API personali per studenti e docenti
Data: 2026-10-03 | Stato: IMPLEMENTATO, da revisionare e distribuire

- Branch: `feature/personal-api-keys`.
- Account: provider, modello, chiave cifrata Fernet, scelta personale/sistema;
  pagine `/profilo/api-personali` e `/docente/api-personali`, stessa impostazione.
- Admin reale: interruttore in Configurazione AI; policy `personal_api_enabled`,
  default spento, guardia anche nell’API generica config per i ricercatori.
- Runtime: chat, Bussola, Assistente, pQBL, analisi combinata, sintesi PDF,
  Tavolo e diagrammi usano la scelta account. Nessun ripiego sulle chiavi di
  sistema quando la connessione personale fallisce. Filtro PII invariato;
  costi personali esclusi dal blocco del budget di sistema.
- Verifiche: 250 test backend (PostgreSQL `counselorbot_test` isolato), 11 test
  browser (sei lingue, tema scuro, 320/390/1440 px), TypeScript, i18n, lint
  dei file nuovi, guidance-check. Build Docker backend/frontend riuscite;
  import delle nuove rotte e del modello verificato nell’immagine backend.
- Limite preesistente: lint globale fallisce in
  `frontend/src/components/visual/NewDeckDialog.tsx:36`
  (`react-hooks/set-state-in-effect`); il file non è cambiato.
- Nessun deploy o aggiornamento dei container di produzione. Prima di abilitare
  in produzione configurare `PERSONAL_API_ENCRYPTION_KEY` sul backend e
  ricostruire le immagini; nessun comando sudo o modifica nginx necessario.
  Dettagli: `docs/operations/personal-api-settings.md`.
- Le schermate guida usano account e chiavi fittizie; campo chiave vuoto.
- Associazione GitHub Project non disponibile: il token risponde
  `Resource not accessible by integration` alla lettura `projectsV2`.
- Processi di prova fermati: Next fixture :3135 e container PostgreSQL
  `counselorbot-personal-api-test-db`. Script riproducibile e stop documentati
  in `docs/operations/live-dev-environment.md`.

---

# Handoff: Scelta del taccuino nel contesto chat (docente)
Data: 2026-09-27 | Stato: IMPLEMENTATO (backend, frontend, test, doc — in attesa di PR/merge)

## Objective
Il docente (chi ha sia ruoli sia solo docenza) sceglie quale taccuino passa
al contesto della chat guidata — studente, docente o nessuno — per OGNI
strumento, non solo per OBIETTIVO_DOCENZA. La scelta vive nel popover
«Opzioni» della chat (dove si sceglie lunghezza risposta, formato, ecc.).
Il comportamento di oggi (docenza → taccuino docente, tutto il resto →
taccuino studente) resta il DEFAULT, non un hard-code.

## Progress
- [x] Analisi del codice esistente (vedi Resolutions)
- [x] Progetto concordato con l'utente (vedi Decision Log)
- [x] Implementazione backend: campo + envelope
- [x] Implementazione frontend: selettore nel popover Opzioni
- [x] Persistenza scelta (localStorage + frozen session)
- [x] Test backend e frontend
- [x] Doc: CONTEXT.md (taccuino del docente / envelope) +
      docs-counselorbot/funzionalita-counselorbot.md + Make guidance-refresh/check

## Design concordato

### Backend
1. `backend/api_models.py` — `ChatRequest.notebook_context:
   Optional[Literal["student", "teacher", "none"]] = None` (schema di
   `response_length`).
2. `backend/chat_logic.py` `build_context_envelope` (~riga 2790, cerca
   `is_docenza_chat`): sostituire `is_docenza_chat = questionnaire_type ==
   "OBIETTIVO_DOCENZA"` con una scelta richiesta + fallback:
   - `DEFAULT_NOTEBOOK_CONTEXT = {"OBIETTIVO_DOCENZA": "teacher"}`
     (nel dizionario definire anche il default "student" per tutto il resto)
   - il valore della richiesta vale SOLO se l'utente ha davvero il ruolo
     docente (stesso guard del taccuino docente: plan managers — vedere come
     `routes/teacher_profile.py` gated; riverificarlo lato server, mai fidarsi
     del client), altrimenti il default.
   - `teacher` → lo slot `[PROFILE]` prende `teacher_notebook_context` (+
     `teacher_groups_context`, che comunque è vuoto per strumenti senza
     `group_ids`, e `group_ids` resta inviato solo dalla chat docenza);
   - `student` → taccuino/lettura/obiettivi/portfolio dello studente (comportamento attuale);
   - `none` → blocco `[PROFILE]` svuotato di taccuino (il resto delle
     sezioni dell'envelope continua: history, knowledge, skills…).
   Attenzione alla condizione `not is_docenza_chat` che oggi protegge anche
   reading_context e class_context_for_student: riscriverla sulla scelta
   effettiva (`notebook_context != "student"`), non sul tipo strumento.
3. OBIETTIVO_STUDIO resta default student; EVENTO_*/IDEA idem: è il docente a
   decidere se fare il cambio.

### Frontend (`frontend/src/components/qsa/GuidedChatInterface.tsx`)
4. Nel popover `renderConversationOptions` (cerca `ResponseLengthSelector`):
   una riga con un selettore a 3 opzioni "Taccuino nel contesto":
   Studente / Docente / Nessuno. Mostrato SOLO se l'utente ha il ruolo
   docente (guard di `useTeacherAccessState`/`isTeacher`; i dati accesso
   devono già arrivare alla pagina che monta la chat — verificare; altrimenti
   `GET /user/teacher-notebook` errore = non docente). Disabilitato mentre
   la chat è in flight (`isLoading`).
5. Stato `notebookContext` inizializzato da localStorage
   `cb-notebook-context` (helper analogo a `readStoredDocenzaGroupIds`
   in `DocenzaClassBar.tsx`); valori ammessi: student|teacher|none.
6. Includerlo nel payload di OGNI turno accanto a `group_ids` (4 punti
   `chatPayload`-like: ~964, ~1010, ~1033, ~1228 + frozen resume ~1342).
7. `frontend/src/lib/frozen-session.ts`: aggiungere `notebook_context`
   all'autoFreezeSignature e al restore (schema di `response_length`).
8. Hint di `DocenzaClassBar` ("insieme al tuo taccuino del docente")
   adattarlo alla scelta.

### Test
9. `backend/tests/test_teacher_context.py` (o nuovo
   `test_notebook_context.py`): (a) default invariato per 13 strumenti,
   (b) richiesta `teacher` onorata SOLO per utenti docente, (c) `none`
   = blocco profilo vuoto ma envelope valido, (d) classi mai fuori da DOCENZA.
10. Frontend: test esistenti pattern (es. `npm run test:account`,
    `frontend/tests/*.test.mjs`) per il selettore solo-docente e payload
    coerente + frozen resume.

## Problems Encountered
- Uno studente puro non vede il campo: il selettore non deve apparire.
  La verifica "chi è docente" lato server è il punto delicato: individuare
  la funzione guard già esistente (cercare `canUseTeacherAssistant` e i
  guard di `routes/teacher_profile.py` / `teacher_access`).
- `frontend/tests/personal-error-states.test.mjs` e altri toccano già il
  popover: verificare di non romperli.

## Resolutions
- Dove sta la regola oggi: `build_context_envelope` in `backend/chat_logic.py`
  (~2790-2870) — cerca `is_docenza_chat`. Lo swap taccuino-docente avviene
  nello slot `[PROFILE]` (sostituzione totale di profile/portfolio/goals,
  niente punteggi, niente lettura; `[CONTESTO CLASSE]` resta per lo studente).
- Sorgenti contesto: `backend/teacher_context.py`
  (teacher_notebook_context, teacher_groups_context,
  class_context_for_student), specchio di `backend/student_context.py`.
- Popover opzioni: `GuidedChatInterface.tsx` → `renderConversationOptions`
  (~1545), la riga risposta ha `ResponseLengthSelector`.
- `ChatRequest` in `backend/api_models.py` (riga ~8); `group_ids` già
  presente con la stessa semantica "ignorato per strumenti altri / persone.non-docenti".

## Decision Log
- Scelta utente: il docente sceglie il taccuino per strumento dal popover
  Opzioni (dove già sceglie lunghezza/formato) — più pulito di una mappa hard-coded.
- Default invariato per non rompere l'esperienza esistente (docenza =
  taccuino docente, il resto = taccuino studente).
- Un solo enum a scelta singola (student|teacher|none), mai entrambi i
  taccuini insieme: slot [PROFILE] unico, rischio di mescolamento zero.
- Verifica ruolo docente per OGNI turno lato server (come `group_ids`):
  un errore o un role-change esce dal contesto senza rifare nulla.
- La scelta vive per-BROWSER (localStorage + frozen session) come
  `group_ids`, non sul server: nessuna migrazione DB.
- Domande aperte della discussione precedente RISOLTE: EVENTO_PROFESSIONALE,
  IDEA, OBIETTIVO_STUDIO non hanno regole speciali: default invariato, il
  docente può cambiare contesto a mano quando vuole.
- Mappatura strumenti a contesto docente: niente whitelist raffinata per
  strumento; una sola chiave per strumento nel dict DEFAULT (solo
  OBIETTIVO_DOCENZA: 'teacher'), e per i docenti il campo della richiesta
  ha la precedenza.

## Prossima sessione
IMPLEMENTAZIONE COMPLETATA (branch feature/notebook-context-choice, PR da
revisionare). Mappa dell'implementazione reale:
- Backend: `DEFAULT_NOTEBOOK_CONTEXT` in `chat_logic.py` (top, dopo logger);
  risoluzione in `build_context_envelope` (cercare `notebook_mode`);
  `ChatRequest.notebook_context` in `api_models.py`; frozen session in
  `schemas.py` (FrozenSessionCreate/Detail + validator) e
  `routes/frozen_sessions.py`; test in `backend/tests/test_notebook_context.py`.
- Frontend: `NotebookContextSelector.tsx` + `lib/notebook-context.ts`
  (storage `cb-notebook-context`, default = non inviare il campo);
  `GuidedChatInterface.tsx` (stato `notebookContext`, `isTeacherUser` via
  getIdentity/isTeacher, 4 payload, snapshot + restore + firma autosalvataggio,
  riga nel popover visibile solo ai docenti); `auto-freeze.ts` (signature);
  `frozen-session.ts` (tipi); i18n `notebookContext.*` (6 lingue);
  `DocenzaClassBar` hint adattato alla scelta. Test unitario in
  `lib/notebook-context.test.ts` (npm run test, 236 pass).
- Verifiche fatte: pytest notebook/teacher context 11 pass (venv host, DB
  counselorbot_test su :5435); test_smoke confrontato con baseline via stash
  (stessi fallimenti preesistenti, nessuno nuovo); tsc --noEmit pulito; lint =
  baseline (1 errore preesistente NewDeckDialog); npm run build OK; guidance
  refresh/check allineati. NOTA: il container di produzione ha il codice
  dentro l'immagine (no mount /app/backend): i test in-container richiedono
  rebuild; il deploy richiede `docker compose up -d --build`.
Leggere `docs/operations/chat-format-essential-qsa.md` solo se serve per
l'ordine del turno. Lavorare su branch feature/... (mai su main).

---

## S2 — salvataggio metodo → azione (2026-10-02)

Agente sostituto: `s2-method-action-yolo-1002`; worktree
`/home/nugh75/counselorbot-sbs-worktrees/s2-method-action-1002`, branch
`fix/method-action-save-deadlock`, base `4a5435e1d289ccaa014f859a8f1a3267bec2a102`.
Task: `0d0cd211-b467-4365-b8ad-747017adc8d7`.

### Correzione e perimetro

Con il metodo modificato, «Metti in pratica» preparava un'azione mentre il
salvataggio dell'obiettivo era bloccato dalla bozza dell'azione e quello
dell'azione dalle modifiche all'obiettivo. Ora il pulsante attende il salvataggio
esplicito, con istruzione accessibile nelle sei lingue; poi apre il modulo
precompilato e porta il focus al titolo. Solo la conferma crea l'azione collegata.
Le altre bozze e i salvataggi in corso restano protetti; un riferimento sincrono
impedisce due invii prima dell'aggiornamento dello stato React.

File: `GoalDialog.tsx`, `MethodPicker.tsx`, testi `i18n-goals.ts`/`i18n.ts`,
suite `frontend/tests/goal-method-action.test.mjs`, script
`scripts/dev-method-action-tests.sh`, funzionalità e documentazione operativa,
manifest della guida. Nessun redesign, modifica backend o intervento sui task
separati bozze/errori. Deroga esplicita dell'utente alla revisione cross-modello:
nessun revisore o sub-agente; mantenuti test tecnici e controllo dei diff.

### Verifiche e prove prima/dopo

- Prima del fix: la suite riproduceva `goal save disabled = true ; action save
  disabled = true`, seguita dall'assert fallita. Dopo: 10/10 test browser verdi,
  riconfermati dal sostituto con `cd frontend && node --test
  --experimental-strip-types tests/goal-method-action.test.mjs`.
- Copertura: sei lingue a 390 px, metodo modificato, nuovo obiettivo, apertura,
  modifica e conferma dell'azione, legame e revisione API, annullamento uscita,
  errori/retry, idempotency key, invii duplicati e altra bozza. Anche testo guida,
  immagini della sezione interessata e assenza di overflow nelle sei lingue.
- ESLint mirato sui quattro sorgenti modificati e sulla suite, controllo i18n
  (2863 chiavi × sei lingue), TypeScript `tsc --noEmit`, `git diff --check` e
  `make guidance-check`: verdi. Log precedente `npm test`: 42 file di libreria
  superati, nessun fallimento; conservato in `/tmp/s2-frontend-tests.log`.
- Lint globale fuori perimetro: 17 diagnostici (1 errore, 16 warning), identici
  dopo normalizzazione dei percorsi in `/tmp/s2-current-lint.json` e
  `/tmp/s2-baseline-lint.json`. Errore: `NewDeckDialog.tsx:36`,
  `react-hooks/set-state-in-effect`. Non corretto in questo task.
- Vecchia suite `guide-audiences.test.mjs`: sei fallimenti sul ramo corrente al
  selettore pubblico, riga 32. Prova italiana 1440 px riprodotta sulla baseline
  isolata con `GUIDE_BASE_URL=http://127.0.0.1:3113 node --test
  --experimental-strip-types --test-name-pattern='1440px in it'
  tests/guide-audiences.test.mjs`: stesso timeout sul link Docente nella
  navigazione «Scegli la guida». La fixture simula un visitatore non autenticato,
  mentre il codice mostra il selettore solo ai docenti. Sorgente guida e test
  nella baseline verificati identici a HEAD; nessuna modifica a questi file.
  Confronto baseline limitato alla prova italiana, non all'intera vecchia suite.

Evidenze precedenti recuperate dalla sessione Codex
`01a0fcf1-69ff-78d0-8d12-d1105b52c8a8`: risultato finale baseline nella chiamata
`call_6okmbeJ831cCObg6jJSJbhqQ`. Nuova esecuzione della suite 10/10 conservata
in `/tmp/s2-yolo-method-action.log`.

### Docker e consegna

Build precedente riuscita (exit 0), recuperata dal log della sessione:
`docker build --tag counselorbot-sbs-s2-method-action:validation
--build-arg NEXT_PUBLIC_API_URL=/api frontend`.
Tag riconfermato con `docker image inspect`: ID
`sha256:0716e1b9c760405b27b3b70631153293833b33c69f50839ba3e18fbb30922f8d`,
creato il 2026-10-02 alle 14:20:54 UTC. Nessuna nuova build o avvio container,
nessun deploy o merge. Le fixture usano localhost:3112 e backend fittizio
`http://127.0.0.1:9`, senza database; vengono arrestate prima della consegna.

Pubblicare commit atomico e PR verso main nel Project CounselorBot; notificare
la PR e chiudere il solo task S2 dopo push e apertura verificata. Il successore
bozze `8b8119a1-e636-4422-8846-28dc40e2ac14` attende il merge dell'utente e la
conferma di tier/modello/avvio: non avviarlo. Il goal complessivo resta aperto.

## S3 — protezione bozze assegnazioni e letture (2026-10-02)

Task `8b8119a1-e636-4422-8846-28dc40e2ac14`, branch
`fix/protect-assignment-reading-drafts`, worktree
`/home/nugh75/counselorbot-sbs-worktrees/s3-draft-protection-1002`, base
`53c586859f1a047cf65a73fd34307c3faa21e901` (PR28 MERGED riverificata).
Deroga esplicita dell’utente alla revisione cross-modello: nessun altro agente
o revisore; mantenuti regressioni, verifiche tecniche e controllo dei diff.

Il dettaglio delle assegnazioni e la card delle letture venivano smontati senza
consultare lo stato della bozza. Ora gli editor comunicano modifiche e richieste
in corso ai controlli che possono sostituirli. La conferma nativa già tradotta
precede chiusura dettagli, altra scheda/hash, filtri, cambio compilazione e
ricerca che nasconde il risultato attivo. Annullare conserva testo, oggetto,
selezione e filtri. Durante un salvataggio i passaggi interni attendono la risposta;
un errore conserva la bozza. Baseline indipendenti per lavoro/restituzione,
confronto dei valori per lettura, blocco sincrono degli invii duplicati e nessun
feedback di un editor già smontato. Richiudere il risultato mantiene già montata
«La mia lettura»: questa conservazione è coperta da regressione.

Sorgenti: `AssignmentsPanel.tsx`, `AssignmentWork.tsx`, `ResultReadingCard.tsx`,
`app/profilo/page.tsx`. Nessuna modifica backend/schema, dipendenza, autosave,
condivisione implicita o redesign. Aggiornati funzionalità, guida IT/EN/ES/FR/DE/SV,
documentazione della fixture e manifest `platform-guidance-state.json`.

Prove riproducibili con `scripts/dev-draft-protection-tests.sh` (:3112 localhost,
upstream fittizio :9, tutte le API simulate, nessun database):

- Prima del fix, chiusura dettagli e cambio compilazione fallivano entrambi
  con `0 !== 1` sulla conferma mancante. Log locali in `.tmp/s3/assignment-red.log`
  e `.tmp/s3/reading-red.log`; non sono artefatti versionati.
- `cd frontend && node --test --experimental-strip-types
  tests/draft-protection.test.mjs tests/goal-method-action.test.mjs`: 34/34 verdi,
  di cui 24 protezioni bozze e 10 regressioni PR28. Le 24 prove sono state
  riconfermate dopo l’ultima modifica. Fixture anonime verificano anche i corpi
  API: bozza A mai inviata a B, errori, ripristino, attesa e invii duplicati,
  link/beforeunload, tastiera e screenshot della guida nelle sei lingue/mobile.
- `npm test`: 236/236; `npx tsc --noEmit`, ESLint mirato, `npm run i18n:check`,
  `make guidance-refresh`, `make guidance-check` e `git diff --check`: verdi.
  Non rieseguito lint globale né la vecchia guide-audiences: baseline e relativo
  limite sono documentati nel blocco S2. Nuova suite guida mirata interamente verde.
- Docker: sola immagine frontend `counselorbot-sbs-s3-draft-protection:validation`,
  `docker build --tag counselorbot-sbs-s3-draft-protection:validation
  --build-arg NEXT_PUBLIC_API_URL=/api frontend`; nessun avvio container/deploy.
  La build esegue `npm run build` sul sorgente finale.
  Build finale exit 0, immagine
  `sha256:cf00932b32873e573b8754193fee191dc02851b6b9d025b4c603ee1d3665a28d`.

Checkout principale allineato con il solo `git pull --ff-only`, da `4a5435e` a
`53c5868`; `.gitignore` modificato e handoff docente non tracciato conservati
con stato e SHA-256 identici prima/dopo. Nessun edit/commit nel principale.
La fixture viene arrestata prima della consegna. I test non certificano backend,
SSO reale o dispositivi fisici. Dopo push/PR, chiudere il solo task S3; il goal
resta aperto. Successore errori/vuoti `52d583fa-ce96-426c-9956-4328c86a9b38`:
avvio/tier/modello da confermare dopo merge, non lanciare.
## S4 — errori di caricamento docente (2 ottobre 2026)

Task `52d583fa-ce96-426c-9956-4328c86a9b38`, goal
`2ab67a9c-3e74-4ffa-ae45-622b99b1db1a`; worktree
`/home/nugh75/counselorbot-sbs-worktrees/s4-loading-errors-1002`, branch
`fix/teacher-loading-error-states`, base `e1e2b0d` (PR29). Solo
codex/gpt-6.1-sol high: deroga cross-modello esplicita registrata nel diario,
nessun altro agente. Dettagli riproducibili: `docs/operations/teacher-loading-errors.md`.

GroupsPanel, TeacherNotebook e DocenzaClassBar distinguono caricamento, vuoto
valido ed errore. Riprova è esplicito/localizzato; il refresh conserva bozze e
selezione. Salva taccuino e creazione gruppi sono bloccati prima della lettura
riuscita; il composer resta disponibile. Campi classe mai modificati si
aggiornano dal server, bozze modificate restano intatte anche dopo retry riuscito.
Abort e controllo scope scartano risposte tardive; 401/403 seguono il guard.
Nessun cambio backend/schema/dipendenze o alla semantica notebook/default.

Verifiche finali:

- Rosso→verde su tutte e tre le superfici (HTTP503 / rete); 57/57 test browser
  S4 sulla build standalone locale: errori/retry, loading/vuoto valido,
  refresh/bozze/salvataggio, invio unico, unmount/account/ruolo/anteprima,
  sei lingue, tastiera, overflow e guida con immagini ingrandibili.
- PR28/29: draft-protection + goal-method-action 34/34; teacher-catalogs 7/7;
  teacher-area-home smoke verde. `npm test`: 236/236.
- TypeScript, ESLint mirato, i18n (2863 chiavi), build locale e Docker verdi;
  documento funzionale/guida aggiornati; 12 screenshot ricatturati, ispezione
  diretta Area docenti IT e classi EN; guidance-refresh/check e diff check.
- Docker solo validazione: `counselorbot-sbs-s4-loading-errors:validation`,
  image ID `sha256:1e5373d7456124c70977f32e9904a8be42df5cf2e0de64ebbff77cc0b4e79a66`.
  Nessun container avviato, nessun deploy/restart/sudo. Warning ENV Docker legacy
  preesistenti. Backend/DB/SSO reale e release produzione non verificati.
- Baseline note NewDeckDialog (lint globale) e guide-audiences pubblico:
  non rieseguite né modificate. I controlli pertinenti sono verdi. Le prove
  tardive del taccuino sospendono la navigazione in dev con lettura trattenuta;
  sono verdi sulla build compilata. L'anteprima è testata con cambio scope dopo
  il mount; non sono state modificate identità, guard o banner globali.

Main checkout allineato solo con `git pull --ff-only` a `e1e2b0d`;
hash .gitignore `e440397c568fadda1b1d0098779eefd13665da099a26279a875b1ebaadc1e024`
e handoff estraneo `bf3845abf29b27821d49829c80c7eb4f4cd5d9b966aad43205820796f349e824`
identici prima/dopo. Nessun edit/stash/commit nel main checkout.
Fixture dev/standalone su `127.0.0.1:3124`, upstream fittizio `127.0.0.1:9`;
arresto con Ctrl+C prima della consegna, nessun backend o database usato.
Consegna tramite commit/push e PR; chiusura task solo dopo la PR,
goal complessivo lasciato al Timoniere in attesa del merge utente.

## S14 — popup Classi dal taccuino, consegna unica con S13 (2026-10-02)

Worktree esclusivo `s14-class-popup-1002`, branch
`feature/teacher-notebook-class-picker`, stack autorizzato dal commit S13
`d1f3599c141a39573ca8b932e22b5e35dffc65b8` (ancestry, HEAD iniziale e remoto
verificati). Approvazione ASCII di pagina e popup «ok», comportamento
«Conserva il salvataggio attuale», confermati nella consegna S13 esterna.
Un solo agente, nessun revisore o modello aggiunto.

Il rimando Classi apre `ClassGroupPicker` con selezione inizialmente vuota,
editor/PUT S13 riusati, guard di bozza e salvataggio per cambio/chiusura,
focus trap/restore, stati lettura/retry/vuoto/403. Fascia e istituto mantengono
il PUT immediato; Salva e scarto riguardano solo il contesto classe.
Il taccuino resta montato e la bozza privata sopravvive. Nessun cambio di
API, permessi, DB, notebook_context, envelope, sessione/chat, limiti 600/1.200,
ordine/campi/consenso/default A/C o protezioni B/S4. Gli altri tre rimandi
continuano a navigare e la pagina Classi resta nella normale navigazione.
Guide/screenshot del popup nelle sei lingue, documento piattaforma e manifest
allineati. Test e prove combinati, inclusi limiti baseline, in
`docs/operations/teacher-class-management-validation.md`.

Frontend-only su `127.0.0.1:3134`, fixture anonime in memoria, upstream
irraggiungibile `127.0.0.1:9`, traffico esterno bloccato. Baseline S13 copiata
in `/tmp/s14-parent-app` su :3136, senza modificare altri worktree.
Avvio/stop/tunnel in `docs/operations/live-dev-environment.md`; processi propri
arrestati prima della pubblicazione. Immagine frontend di sola validazione:
`counselorbot-frontend:s14-class-popup-1002-validation`; nessun container
avviato, backend/SSO/DB produzione, sudo, merge, deploy o blocco D.

Task `3dc47b92-09aa-4eb9-9ffa-1013b8f750fc`: chiudere solo dopo verifiche,
commit atomico S14, push e PR unica contro main con entrambi gli interventi.
Goal `de3eed06-878a-41c5-8b83-63993f8a35cf` aperto fino al merge dell’utente.

Validazione finale S14: 189/189 browser/smoke compilati (54 popup, 34 Classi,
57 S4, 18 copy A/C, 25 rimandi B, smoke home), 236/236 unitari, TypeScript,
i18n, ESLint mirato, build, guidance e diff riusciti. Lint globale identico
a S13: 1 errore NewDeckDialog + 16 warning; guide-audiences 0/6, stessi vecchi
link sulla base e sulla candidata. Immagine finale
`sha256:ff2ff32e3a441e297986b7e21db80885ae7e20e20c385d98c506b64ce2645cf9`,
138634848 byte, nessun container avviato. Una sola guard di navigazione nel
taccuino riceve i segnali dirty/busy dal popup: evita conferme spurie sulla
bozza privata nel browser legacy, con test rosso prima e verde dopo.

## QSA — anteprima e allineamento dei prompt di fabbrica (2026-10-03)

Ramo `feature/questionnaire-prompt-preview`. L’utente ha autorizzato
l’allineamento alla `Guida_Costruzione_Prompt_QSA_CounselorBot.docx` e ha
confermato che i prompt devono rimanere in inglese. Il documento caricato ha
testo identico alla guida già versionata. Nessun altro agente impiegato.

I dieci step QSA e i blocchi di sistema/pedagogici seguono il documento;
conservati il veto di nuove strategie nella sintesi e la composizione delle
direttive condivise. La matrice dei componenti QSA alimenta runtime ed editor;
un consiglio esplicito nei follow-up ammessi può attivare una strategia, salvo
override amministrativi. L’anteprima senza bozze usa le regole effettive del
turno. Lingua della risposta e interfaccia mantengono IT/EN/ES/FR/DE/SV.

Risolta la causa della presentazione Savickas tra gli step QSA: le tre
presentazioni QSAr/ZTPI/Savickas mancavano di `questionnaire_type`. I default
lo dichiarano ora esplicitamente; l’avvio riclassifica soltanto i tre ID noti
erroneamente assegnati a QSA, conservando tutti gli altri campi.

I testi di un DB esistente non vengono riscritti all’avvio. Il comando
`backend.qsa_factory_alignment` prepara un piano per gli esatti default
precedenti riconosciuti tramite hash, preservando personalizzazioni e revisioni
admin. `backend.prompt_updates` applica/annulla atomicamente con controllo
degli hash. Procedura e comandi Codespaces in
`docs/operations/qsa-factory-alignment.md`.

Verifiche: 95 test backend mirati e 206 smoke, 236 unitari frontend, TypeScript,
ESLint mirato (un warning preesistente), i18n (2863 chiavi × sei lingue),
anteprima browser a 1440/390 px per tutti gli undici pannelli e le sei lingue,
guidance-refresh/check e diff check. Il test legge direttamente la guida DOCX
indipendente e simula dieci step in sei lingue senza chiamate LLM.

Nella sola copia cloud di sviluppo: applicati 17 aggiornamenti dei vecchi testi
di fabbrica; il secondo piano è vuoto. QSA ha dieci step con `intro` iniziale,
QSAr nove, ZTPI sette, Savickas otto, ciascuno con la propria presentazione.
Nessun intervento sul Codespace dell’utente o sulla produzione; nessun merge,
deploy, chiave LLM o aggiornamento di altri prompt.

Dev nativo ancora attivo su localhost:3107 (frontend), :8002 (backend), DB
dedicato su :5435. Avvio locale tramite `.cloud-counselorbot/start-backend.sh`
e `scripts/dev-frontend.sh`; arresto con Ctrl+C nei terminali di avvio. Nel
Codespace si usa il precedente `start.sh`, porta privata 3107; fare pull e
applicare il piano al DB di sviluppo prima del nuovo avvio.

Docker di sola validazione: backend ricostruito come
`counselorbot-qsa-alignment:dev`, import dei nuovi prompt e del comando riusciti.
Per il proxy cloud è stato necessario montare il trust bundle del sistema solo
nella fase pip, usando un Dockerfile temporaneo esterno al repository; TLS
rimane verificato e i Dockerfile versionati sono invariati. La build frontend
è stata tentata ma i download npm falliscono con `ENOTFOUND` e `npm ci`
termina con «Exit handler never called», lasciando Next non installato;
nessuna immagine frontend finale prodotta. Nessun
container di produzione ricostruito, avviato o riavviato.

## Pulsante comune di allineamento dei prompt (2026-10-03)

L’utente ha approvato il pulsante e precisato che deve coprire tutte le chat.
Implementato sopra le schede di `ConfigForm`, con anteprima di sola lettura,
confronto prima/dopo, elenco dei testi conservati e conferma esplicita.
Interfaccia IT/EN/ES/FR/DE/SV, testi del modello in inglese. Nessun agente
delegato. Continua il ramo `feature/questionnaire-prompt-preview`, PR #38.

`backend.prompt_factory_alignment` ricava dai registri 93 istruzioni di config
e 101 step in dodici percorsi, inclusi assistenti, contesti e direttive.
Aggiorna solo vecchi testi riconosciuti tramite hash o storico seed/migration;
personalizzazioni e proprietà admin prevalgono. Esclusi varianti linguistiche,
testi UI, impostazioni operative, persone dei counselor e step personalizzati.
La classificazione errata di uno step impedisce di riscriverne il prompt.

Il POST accetta solo il digest del piano rivisto, lo ricostruisce con lock e
applica atomicamente con storico. Un conflitto restituisce 409; il browser
richiede una nuova anteprima, blocca i doppi click e sincronizza gli editor.
I salvataggi e ripristini admin acquisiscono gli stessi lock anche quando
il testo è identico. Quattro prove concorrenti fallivano prima della correzione
e ora verificano il blocco effettivo su connessioni PostgreSQL separate.
Bozze e salvataggi pendenti impediscono l’allineamento. CRUD e riordino
aggiornano la baseline salvata senza nascondere bozze ancora aperte.

Le revisioni di questa operazione hanno origine migration, così restano
aggiornabili da future versioni di fabbrica. Un salvataggio admin identico al
testo seed acquisisce la proprietà admin una sola volta. La CLI precedente
mantiene il proprio comportamento; nessuna riscrittura automatica all’avvio.
Procedura: `docs/operations/prompt-factory-alignment.md`.

Verifiche: 55 backend mirati, 206 smoke, 236 unitari frontend, otto nuove prove
browser e due regressioni delle anteprime desktop/mobile riusciti. TypeScript,
i18n (2884 chiavi × sei lingue), ESLint mirato (solo un warning preesistente),
guidance-refresh/check e diff check. Schemi PostgreSQL di test isolati; nessun
LLM chiamato. Anteprima autenticata sul dev: HTTP200, zero aggiornamenti
necessari e storico invariato; accesso anonimo HTTP401.

Backend Docker ricostruito con il trust bundle cloud temporaneo, TLS verificato:
`counselorbot-prompt-factory-alignment:validation`, immagine
`sha256:3cde72012b693b5856418b2e7218c3923cc1d0b33b296b468bd5172b58bcf63a`.
Import del catalogo 93/101 riuscito in container effimero senza rete. Frontend
Docker tentato, bloccato dall’errore npm/DNS dell’ambiente che lascia Next
non installato; controlli e browser nativi riusciti. Dockerfile versionati
invariati. Dev ancora su :3107/:8002, PostgreSQL dedicato su :5435; avvio e
arresto come nella sezione precedente. Per Codespaces: aggiornare il ramo
(oppure main dopo il merge dell’utente), riavviare frontend/backend e usare
Amministrazione → Allinea prompt di fabbrica. Nessun aggiornamento del DB
del Codespace o di produzione, nessun merge o deploy in questa sessione.


## Abbonamento personale ChatGPT (2026-10-03)

Implementazione autorizzata dall'utente dopo il piano; priorita' alle chat dentro
CounselorBot. Ramo `feature/chatgpt-subscription`, derivato da main aggiornato e
aggiornato poi con fast-forward al merge della PR #38 (`1cac9b6b`), verificata
MERGED su GitHub prima della pubblicazione.
Nessun agente delegato, nessun merge/deploy e nessun account OpenAI reale usato.

Flusso SIWC ufficiale verificato sui documenti OpenAI attuali: callback OAuth
sul computer della persona tramite helper Python standard scaricabile, pairing
monouso con hash e scadenza, PKCE/state/nonce, verifica dei JWT RS256 con JWKS
fisso. Il client ID pubblico emesso viene conservato prima dello scambio del
codice; un grant non verificato non abilita inferenza. Token Fernet nel DB,
mai risposte/log/browser storage. Rinnovo serializzato con lock PostgreSQL e
sessione separata; rispetto di earliest_refresh_at e token rotanti. Revoca
remota tentata e cancellazione locale garantita, avviso se revoca non confermata.

Area personale e indicatore nelle chat in IT/EN/ES/FR/DE/SV; catalogo disponibile
per account, scelta esplicita del modello e attivazione. Connessione da sola non
consente inferenza. Provider `openai_chatgpt` via Responses con istruzioni,
cronologia, store:false e streaming completato solo all'evento finale. La scelta
personale prevale sui preset e non ripiega su API a pagamento. Quote/errori
localizzati, nessun prezzo API inventato. Identita' autenticata propagata alle
chiamate personali, account demo/view-as esclusi; OCR ed embeddings restano
servizi dell'installazione. OpenCode bloccato con scelta personale attiva.
Anteprima prompt mostra il trasporto senza token e prima del filtro PII.

Funzione spenta per default. Procedura, chiave persistente, helper/tunnel,
backup, limitazioni e fonti in `docs/operations/chatgpt-subscription.md`.
L'anteprima SIWC per strumenti OSS locali/VM personali non autorizza
automaticamente un server scolastico condiviso o piani Edu/Business. Verificare
il percorso OpenAI dell'installazione; questo codice non implementa il profilo
partner ospitato. Nel repo manca LICENSE: il proprietario deve sceglierla prima
della distribuzione OSS. Accesso, catalogo, inferenza, refresh e revoca con account
reale sono una verifica manuale ancora necessaria; nessuna chiamata a pagamento.

Verifiche: 41 test finali dell'integrazione passati dopo le ultime modifiche;
precedentemente 112 backend mirati (integrazione/routing/PII) e 206 smoke,
236 unitari frontend, 12 prove browser ChatGPT in sei lingue a 390/1440 px e
10 regressioni browser delle anteprime/allineamento prompt. TypeScript,
i18n (2927 chiavi per sei lingue), ESLint mirato riusciti. Il lint globale
resta bloccato dall'errore preesistente setState in effect in
`frontend/src/components/visual/NewDeckDialog.tsx:36` e warning preesistenti.
Nessun LLM reale chiamato, database/schemi di test dedicati.

Docker: build backend e frontend tentate senza avviare produzione. Backend
completo bloccato dall'accesso apt alla rete cloud; frontend da npm/DNS
ENOTFOUND che lascia Next non installato. Anche build backend incrementale
interrotta per spazio insufficiente: nessuna nuova immagine finale prodotta.
Log `/tmp/chatgpt-docker-backend.log`, `/tmp/chatgpt-docker-frontend.log`,
`/tmp/chatgpt-docker-backend-incremental.log`. Restano da ricostruire le immagini
nel normale ambiente di deploy con rete/spazio disponibili.

Durante la validazione Docker il disco root ha esaurito lo spazio. Conservata
copia completa della venv in `/tmp/chatgpt-dev-runtime/backend-venv`; il tentativo
di spostamento non ha liberato spazio. Rimossi solo tre record di cache Docker
non condivisi/reclamabili prodotti dalle build incrementali di questa sessione,
identificati singolarmente: nessun volume, container, immagine o database
rimosso. La venv parziale originale e' conservata in
`/workspace/.cloud-counselorbot/backend-venv-partial-preserved`; backend/.venv e'
un symlink locale escluso da Git alla copia completa. Non eliminare queste copie.

Dev nativo ripristinato: frontend localhost:3107, backend localhost:8002,
PostgreSQL dedicato :5435. Avvio backend con
`/workspace/.cloud-counselorbot/start-backend.sh`, frontend con
`cd frontend && npm run dev -- --hostname 127.0.0.1 --port 3107`.
Processi lasciati attivi: backend reloader PID 24513, frontend npm PID 24514 (Next PID 24533). Arresto: `kill 24513 24533`, senza toccare
PostgreSQL o produzione. Log `/tmp/chatgpt-dev-backend.log` e
`/tmp/chatgpt-dev-frontend.log`. Il Codespace dell'utente non e' stato aggiornato.


## Attivazione ChatGPT dall’Amministrazione (2026-10-03)

L’utente vuole abilitare la funzione dall’interfaccia senza generare chiavi o
modificare file con comandi. Ramo `feature/chatgpt-admin-activation` creato da
main aggiornato (`dbeb6167`, PR #39 verificata MERGED). Nessun agente delegato.

Nuova scheda in Amministrazione → Configurazione → Generale → Collegamento
ChatGPT: Abilita/Disabilita, stato e salvataggio immediato, collegamento all’Area
personale. UI e messaggi backend in IT/EN/ES/FR/DE/SV, guida aggiornata nelle sei
lingue. Il controllo cambia solo la disponibilità del servizio; ogni persona
continua a collegare e attivare il proprio account separatamente.

GET/PUT `/admin/chatgpt/settings` ammettono solo un amministratore autenticato
reale; esclusi ricercatori e view-as, PUT protetto dall’header anti-CSRF e payload
booleano stretto. `Config.chatgpt_enabled` persistente precede la variabile
iniziale `CHATGPT_ENABLED`. Effetto sulle nuove richieste senza riavvio; la
lettura del flag non esegue autoflush di scritture chat/punteggi pendenti.
`chatgpt_*` esclusi dalla configurazione generica e scrittura rifiutata lì, per
impedire bypass della preparazione della chiave e modifica dell’host ID.

Prima attivazione: chiave Fernet privata in chatgpt_credentials/credential.key
(0700 directory, 0600 file). Scrittura/fsync in temporaneo e pubblicazione
atomica senza sovrascrittura: worker concorrenti convergono sulla stessa chiave.
Nuovo volume Docker dedicato montato su /app/chatgpt_credentials; esclusioni
Git/Docker, nessuna chiave restituita al browser o inserita nell’immagine.
Le chiavi fornite dall’operatore restano prioritarie, anche se non valide.
`CHATGPT_CREDENTIALS_DIR` può selezionare un altro archivio persistente.

Disattivazione conserva chiave e credenziali, blocca nuove associazioni e
inferenze personali senza ripiego a pagamento. Funziona anche se la chiave è
mancante. Chiave persa con grant esistenti: richiede ripristino dal backup,
non genera un sostituto. Chiave non valida o archivio non scrivibile: errore e
nessuna attivazione salvata. Backup deve includere DB e chiave protetta coerenti.
Procedura principale ora via UI in docs/operations/chatgpt-subscription.md.

Verifiche: 53 backend integrazione/amministrazione, 72 routing/PII, 202 smoke
eseguiti dal runner, 236 unitari frontend passati. Browser: 13 prove nuove
(6 lingue, 390/1440 px + ricercatore) e 20 regressioni connessione personale/
allineamento prompt passate. Controllo ricercatore attende davvero il 403 prima
di verificare che il comando sia assente. TypeScript e i18n (2944 chiavi × sei
lingue) passati; ESLint mirato zero errori, un warning preesistente in ConfigForm
sulla dipendenza getConfigValue. Nessun account OpenAI reale o LLM chiamato.

Prova aggiuntiva sull’app dev effettiva (API non simulate): dal pannello
attivato, ricaricato e disattivato; stato verificato tramite API. Nel solo DB
counselorbot_dev ora la scelta amministrativa è false, con chiave pronta.
Chiave runtime conservata in /workspace/counselorbot-sbs/chatgpt_credentials,
ignorata da Git e non letta/stampata. Screenshot /tmp/chatgpt-admin-live-390.png;
fixture UI /tmp/chatgpt-admin-390.png e /tmp/chatgpt-admin-1440.png.
Nessuna associazione OAuth o modifica di prompt/dati di produzione.

Docker: check del Dockerfile backend passa; frontend restituisce tre avvisi
preesistenti LegacyKeyValueFormat e codice 1. Compose validato con copia e
variabili/credenziali fittizie fuori repo, perché qui non c’è un .env reale.
Il rebuild completo non è eseguibile con circa 983 MiB liberi e driver vfs:
una build precedente ha già saturato il disco; preflight in
/tmp/chatgpt-admin-compose-validation/build-preflight.log. Nessuna nuova
immagine finale prodotta, nessun container/volume rimosso o riavviato.
Il normale aggiornamento dell’operatore deve ricostruire le immagini e applicare
il volume persistente. Limiti SIWC/ammissibilità/licenza della PR precedente
restano documentati; l’attivazione non cambia i piani ammessi da OpenAI.

Dev lasciato attivo: backend :8002 (reloader PID 24513), frontend :3107 (npm
PID 24514, Next PID 24533), PostgreSQL dedicato :5435. Arresto con
`kill 24513 24533`, senza toccare DB/produzione. Venv locale conservata tramite
symlink alla copia in /tmp, come nella sezione precedente. Nessun intervento
sul Codespace dell’utente: aggiornare la nuova PR/main dopo il merge e riavviare
una volta per caricare il codice; poi l’attivazione dal pannello non richiede
ulteriori riavvii. Nessun merge o deploy da parte dell’agente.

# Handoff: class settings S1 (#88, epic #87)

Branch: `feature/class-settings-tools-tab-84`, base `d34fa1b`, dedicated worktree
`c1-class-settings-88`. S1 implements lazy settings storage and reserved lock
columns, the DB-driven student tool registry, owner/co-teacher/admin GET/PUT with
optimistic revisions, and the approved per-class teacher Tools section. Student
filtering, counselor controls, forum/path implementations and lock endpoints/UI
remain separate slices. No merge, sudo or production deployment.

Validation and exact isolated start/stop commands:
`docs/operations/class-settings-validation.md`. PostgreSQL settings tests,
existing group smoke tests, TypeScript, 295 unit tests, i18n, targeted lint,
12 settings browser tests, 34 class-management browser tests and the actual
8002/3107 save/readback flow passed. The isolated production frontend build
passed. Six class-list screenshots and six-language teacher guide text updated.
All owned dev processes and the ephemeral synthetic Postgres instance stopped.

Two registered findings remain outside S1: fresh dependency installation selects
SQLAlchemy 2.1 without its default psycopg driver (confirmed; verification used
2.0.54), and fresh startup does not populate historical guided Instrument rows
(suspected; live tests explicitly register synthetic guided metadata). The
isolated runner and reserved-key collision findings are resolved. No bug report
was left unregistered. Task closure follows successful draft PR creation.


# Handoff: class forum F1 (#102, epic #87)

Branch: `feature/class-forum-core-86`, base `22f5894`, dedicated worktree
`c4-class-forum-102`. Only F1: class/forum tables and HTTP routes, teacher Forum
tab, student class-forum page, safe reduced Markdown, persistent rate limiting,
identity snapshots and inactive read-only archive. Moderation, student-opening
options and unread badges remain separate slices. No production deployment,
sudo, merge or ready-for-review transition.

Validation and reproducible secret-free commands:
`docs/operations/class-forum-validation.md`. Draft PR and task closure follow
successful tests and dev verification. Future slices must retain the import,
export and PDF privacy gates: no forum data reaches any local or external LLM.

# Handoff: guscio desktop docente F1-02 — s26-f102-sol (2026-10-24)

Branch `feature/f1-02-tauri-shell`, PR DRAFT #523, milestone Desktop apps,
Part of #499. Preservati i commit S22 fino a `56ad1def`; integrata `main`
con F1-19 (#521), conservando firma dell'origine e blocco `/api/internal/*`.
Contratti, build, comandi di prova e limiti:
`docs/operations/desktop-teacher-shell.md`.

Test locali: sidecar Python 11, wrapper Node 4, backend health/interno/origine
29, helper frontend 9; tutti passati. Passati anche `cargo check --locked -j 1`,
rustfmt, controlli sintattici, guidance refresh/check e gate contro origin/main.
Il cargo test locale completo è stato interrotto per limitare il carico sul Mac
da 8 GB; Rust e lifecycle dei pacchetti sono verificati dalla matrice CI
macOS arm64/x64, Windows x64 e Ubuntu 22.04. Per gli esiti riferiti all'ultimo
SHA consultare i controlli di PR #523 (non riusare esiti di revisioni precedenti).

Difetti registrati nel Diario: `9f705b41` (snapshot PID dello smoke),
`3c4f9dd8` (tunnel su mismatch/origine pubblica, local-only), `fa010972`
(rewrite frontend fissato in build, residuo F1-03). Nessuna issue manuale.
Registrati anche `1a977fa7` (stato smoke/origine reso atomico) e `296a9474`
(CI Windows: percorso risorse verbatim incompatibile con l'entrypoint Node,
normalizzato con `dunce`; regressione Windows con spazi e caratteri Unicode).
Backend minimal senza lifespan e quick tunnel sono solo prove. F1-03,
F1-06, F1-08, F1-09/F1-10 e F1-05* restano necessari prima dell'uso reale.
Nessun merge, deploy, sudo, rebuild Docker o processo dev persistente.
Revisione del Timoniere richiesta prima di qualsiasi merge; PR da mantenere
in bozza fino al gate applicabile. Non sono stati avviati altri agenti.
