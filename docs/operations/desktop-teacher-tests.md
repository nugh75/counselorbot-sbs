# Verifica dell'app docente — F1-17

Le prove usano esclusivamente profili temporanei e dati inventati. Annotare
commit, sistema/architettura, build Actions, installer, esito SHA-256, data ed
esito di ogni voce. La [guida docente](desktop-teacher-guide.md) descrive i limiti
attuali. Una build verde non certifica il percorso didattico completo.

## Smoke automatizzato

Il workflow `.github/workflows/desktop-teacher.yml` costruisce DMG ARM64 e Intel,
NSIS Windows per utente e deb Linux. Sul bundle estratto/installato esegue:

```sh
bash desktop/teacher/scripts/check-lifecycle.sh --full /percorso/counselorbot-teacher
# Linux CI, dopo installazione deb:
bash desktop/teacher/scripts/check-lifecycle.sh --full /usr/bin/counselorbot-teacher xvfb-run -a
```

Richiede Bash (Git Bash su Windows), Node 22, Python e curl; Linux richiede le
librerie Tauri e un display o Xvfb. `--full` rimuove il backend minimale ed esegue
il lifespan reale con SQLite. Senza `--full` resta la prova rapida del solo guscio.
Il quick tunnel richiede accesso alla rete Cloudflare; un errore di rete fa fallire
il test e non va trasformato in un successo. Non usa chiavi API reali o portachiavi OS.

Lo script genera un profilo `cb-lifecycle.*/data` sotto `RUNNER_TEMP`/`TMPDIR`:
non accetta una cartella dati della lezione. Verifica avvio/arresto, snapshot dei
PID, health/versione/contratto SQLite, protezione `/internal` anche dal frontend,
riavvio backend dopo crash, arresto sidecar quando il guscio è ucciso e recupero
residui al lancio successivo su Unix. Con `--full` verifica inoltre schema locale,
seed `configs`/`instruments`, integrità SQLite e vincoli esterni dopo primo avvio e
riavvii, `/api/health` a backend dinamico, health JSON pubblico attraverso il
quick tunnel (fino a 90 s per collegare l’origine) e Telegram escluso. `check-teacher-data.py`
apre il database in sola lettura: un file assente non viene creato dal controllo.

I report JSON sono negli artifact CI per tre giorni. I bundle/checksum e manifest
hanno artifact separati. Il test termina i processi; se interrotto, individuare
solo i PID della prova nei report e rilanciare il controllo sulla macchina di test.
Non applicare comandi di pulizia a processi della lezione.

Regressioni mirate, dal repository con un ambiente Python dedicato (CI: 3.12),
dipendenze backend installate e comando `python` riferito a quell’ambiente:

```sh
PYTHON_DOTENV_DISABLED=1 TEST_DB=sqlite python -m pytest -q \
  desktop/teacher/sidecar/test_server.py \
  desktop/teacher/scripts/test_check_teacher_data.py \
  desktop/teacher/scripts/test_generate_update_manifest.py \
  backend/tests/test_shell_contract.py backend/tests/test_request_origin.py \
  backend/tests/test_local_auth.py backend/tests/test_local_pairing.py \
  backend/tests/test_teacher_profile.py backend/tests/test_sqlite_backup.py
node --test desktop/teacher/sidecar/server-wrapper.test.js desktop/teacher/src/*.test.js
cargo test --locked -j 1 --manifest-path desktop/teacher/src-tauri/Cargo.toml
make guidance-refresh
make guidance-check
```

Il check `check-api-routing.sh` avvia il frontend standalone con un backend
sintetico su una porta diversa da quella di build, senza segreto e con segreto
sintetico. Riusa `frontend/tests/request-origin.test.mjs` per API, SSE e handshake
WebSocket; nessun DB o servizio AI. La CI lo esegue su Linux dopo la build frontend.
I test unitari `api-proxy.test.ts` verificano cambio porta, upload/cookie/origine,
streaming, blocco interno, errori sanitizzati, decompressione, HEAD e risposte 204.

Le suite auth/pairing/profilo/backup riusano le regressioni esistenti. I test del
controllo dati coprono profilo valido, schema/seed mancanti, DB assente/corrotto,
violazioni FK e layout ignoto. Nessuna chiamata a modelli AI è necessaria.

## Checklist manuale per ogni piattaforma

Usare un utente OS di prova separato; il normale avvio grafico usa il suo vero
portachiavi e la sua cartella dati. Registrare «bloccato» quando un percorso manca:
non spuntare una voce basandosi sul solo test API.

- [ ] Scaricare artifact della build concordata, estrarre, verificare SHA-256;
  una copia alterata deve fallire il confronto senza essere installata.
- [ ] Installare e aprire DMG ARM64, DMG Intel, NSIS o deb sul relativo sistema;
  annotare eventuali richieste di autorizzazione/signature del sistema.
- [ ] Primo avvio: stato Pronto, dati fuori dalla cartella installazione, servizi
  su loopback; chiudere con Esci, riaprire senza perdita dei dati; seconda istanza gestita.
- [ ] Portachiavi reale: salvare una chiave di prova, riavviare, verificare persistenza;
  test valido/401/429, rimozione e applicazione; blocco/sblocco del portachiavi Linux.
  Non includere il valore nelle evidenze. Provider senza test devono indicarlo.
- [ ] Apri nel browser: docente autenticato con link monouso, replay rifiutato,
  admin locale; dal tunnel la sessione docente non consente amministrazione.
  **Bloccato oggi: collegamento guscio e pagina accesso locale assenti.**
- [ ] Quick tunnel con dati inventati: link e QR, streaming POST oltre 60 s con
  pausa del provider e heartbeat, stop/restart e URL aggiornato.
- [ ] Tunnel nominativo con dominio di prova: DNS e porta frontend, token valido,
  URL stabile dopo riavvio, token mancante/errato riconosciuto; non accettare il
  ripiego quick come esito nominativo. Serve l'account del proprietario del tunnel.
- [ ] Classe con due studenti sintetici: link di abbinamento, pseudonimi duplicati,
  codice personale mostrato una volta, recupero su altro browser, pending/approvazione,
  revoca, codice classe scaduto/rigenerato e limiti ai tentativi.
  **Bloccato oggi: pagine Unisciti e dispositivi assenti.**
- [ ] Modello locale separato: rilevamento Ollama/compatibile OpenAI, modello selezionato,
  risposta e server spento; nessuna chiave per server senza autenticazione.
  **Accesso alla configurazione dalla GUI bloccato dall'accesso docente mancante.**
- [ ] Aggiornamento firmato da un rilascio di prova: stabile/beta, backup valido prima
  dell'applicazione, backup fallito impedisce update, firma errata rifiutata; provare
  reinstallazione e recupero con dati/allegati inventati. **Richiede pacchetti e manifest
  pubblicati dal responsabile: gli artifact CI da soli non bastano.**
- [ ] Alimentazione e anti-sospensione: macOS/Windows restano attivi con tunnel;
  a tunnel spento torna il comportamento normale. Su Linux configurazione manuale.
- [ ] Studente già collegato: spegnere solo l'app di prova, controllare pagina offline
  e Riprova; primo accesso a tunnel caduto può mostrare Cloudflare; ritorno online.
- [ ] Diagnostica a backend fermo: ZIP leggibile senza DB, credenziali o contenuti
  sintetici dei log; nessun processo residuo dopo Esci/crash e recupero.
- [ ] Con Titolare/DPO: completare [DPIA L2](../privacy/desktop-teacher-dpia.md),
  informative, custodia, conservazione, diritti e responsabilità **[DA VALIDARE]**
  prima di un eventuale uso con dati reali.

## Criterio di chiusura

F1-17 consegna guida, modello e prove riproducibili. La Fase 1 resta aperta finché
le voci bloccate, la pubblicazione degli asset Release e le prove reali OS/tunnel
nominativo non hanno evidenze. Le parti backend già coperte non sostituiscono queste
verifiche. La Fase 2 (studente offline e sincronizzazione) è un lavoro separato.
