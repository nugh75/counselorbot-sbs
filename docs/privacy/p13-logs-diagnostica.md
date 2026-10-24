# P13 — Log e diagnostica

La redazione distruttiva in `backend/pii.py` restituisce
`[ERRORE_REDAZIONE]` se fallisce rilevamento o sostituzione. Il messaggio e il
traceback dell'errore non vengono registrati: potrebbero contenere l'input.
La modifica riguarda `redact*`; `find_pii`, `anonymize` e `restore` conservano
il loro contratto per i provider esistenti.

## Regole e nomi contestuali

La redazione riusa regole e gazetteer di P4, incluse scuole, titoli, indirizzi
e forme estese di telefono/CF. Gli span sovrapposti vengono uniti senza
lasciare scoperta la coda. I nomi noti si passano con `school_context=`
(`SchoolContext`) o con `with pii.log_redaction_context(school):`.
Il contesto usa `ContextVar`: si ripristina anche dopo errori e non è una
rubrica globale condivisa tra richieste. I payload JSON annidati vengono
copiati e redatti, senza modificare la cronologia della sessione.

Il flag `log_pii_redact` resta compatibile per la scrittura dei log
conversazionali nel DB. **Non disattiva** il formatter dei log Python né gli
export. Non viene caricato il modello ML: nomi sconosciuti senza titolo e
riferimenti indiretti possono sfuggire alle sole regole. Il collegamento del
contesto scolastico alle richieste e del modello completo resta P6; questa
modifica non garantisce anonimizzazione di qualsiasi testo libero.

## Log Python

`backend/log_privacy.py` avvolge i formatter configurati con
`RedactingFormatter`: sanitizza l'intero risultato, inclusi argomenti,
traceback, stack ed eventuali campi aggiuntivi. Anche errori di formattazione
producono il segnaposto. L'installazione è ripetibile all'import/avvio del
backend e dopo la configurazione uvicorn del sidecar, anche in modalità
minimal. I nuovi handler aggiunti successivamente devono usare il formatter
o richiamare `install_log_redaction()`.

`qsa_extractor.py` emette solo eventi operativi fissi a ogni livello: niente
punteggi, fattori, risposte OCR/JSON, percorsi, URL configurati o testo delle
eccezioni. I risultati e i codici d'errore restituiti al chiamante restano
compatibili. Nessuna nuova stampa o handler stdout privato.

## Download dei log backend

`GET /admin/logs/export` conserva autorizzazione amministrativa e filtri.
Prima della serializzazione CSV/JSON applica `redact_diagnostics` anche ai
record storici, indipendentemente dal flag. Omette identificatori diretti,
ID di conversazione/sessione/risposta, codici ricerca e campi di
punteggi/risposte; redige ricorsivamente chiavi e testo restante. Il gazetteer
include username dei record, nomi visualizzati associati e nomi degli
istituti presenti nel DB. Non modifica i contenuti salvati.
Se il contesto o la struttura sanitizzata non sono disponibili, risponde
503 con `privacy.errors.diagnosticsUnavailable`, senza download grezzo.

## «Esporta diagnostica» desktop, anche offline

Il guscio può esportare quando il backend è fermo. Per questo non considera
sanificato alcun testo preesistente: **omette tutto il testo libero**,
conservando timestamp RFC3339 validati e livelli riconosciuti. Ogni riga
porta `[CONTENUTO_LOG_OMESSO]`; contenuti non UTF-8, illeggibili o oltre 10 MB
sono sostituiti con `[ERRORE_REDAZIONE]`.

Lo ZIP ammette solo `shell.log`, `backend.log`, `frontend.log`,
`cloudflared.log` e rotazioni `.1`–`.4`, senza seguire symlink. Non esporta
nomi di file arbitrari. `layout.json` conserva solo layout numerico, app
`teacher` e versione numerica; `version.txt` contiene versione verificata,
OS e architettura. Campi inattesi, percorsi, DB, credenziali e `run/` sono
esclusi. I file locali originali restano intatti; nessuna cancellazione dei
vecchi log. L'archivio contiene meno dettagli tecnici di prima: è una scelta
conservativa finché non esiste un formato di eventi strutturati condiviso.

## Verifica

```sh
~/.pyenv/versions/3.11.9/bin/python -m pytest backend/tests/test_privacy_p13_logs.py
TEST_DB=sqlite ~/.pyenv/versions/3.11.9/bin/python -m pytest backend/tests/test_pii_external.py backend/tests/test_qsa_vision_fallback.py desktop/teacher/sidecar/test_server.py
cargo test --locked --manifest-path desktop/teacher/src-tauri/Cargo.toml diagnostics::tests
make guidance-check
```

Le prove usano solo identità sintetiche, file temporanei e SQLite isolato.
Coprono errori simulati di ogni strato, file di log effettivi con eccezioni,
isolamento del contesto asincrono, QSA locale/ripiego/errori, download HTTP
reali, campi/nomi file inattesi, UTF-8 invalido e symlink desktop.
