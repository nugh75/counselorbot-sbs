# Chiavi API desktop — F1-08

Nel pannello nativo **CounselorBot Docente → Chiavi API**, ogni fornitore
mostra «Configurata» o «Mancante». Il valore salvato non torna alla webview.
Inserire una chiave nel campo mascherato e scegliere **Salva nel portachiavi**.
Il campo si svuota anche in caso di errore. **Rimuovi** elimina la voce dal
portachiavi; **Aggiorna stato** rilegge le voci, anche dopo uno sblocco.

**Testa connessione** usa la bozza inserita o, se il campo è vuoto, la chiave
salvata. Non salva la bozza e svuota il campo: per salvarla dopo il test va
reinserita. Esegue solo una richiesta GET autenticata, senza generazioni AI;
un esito positivo verifica l'accesso all'endpoint, non credito o disponibilità
di tutti i modelli. Rifiuto/permessi (401/403), limite (429) e indisponibilità
sono distinti. Nessuna risposta del provider o dettaglio dell'errore è esposto.

Dopo salvataggi o rimozioni usare **Applica e riavvia servizi**: interrompe
le richieste in corso e riavvia backend/frontend con le nuove credenziali.
Le modifiche valgono anche al prossimo avvio/crash restart del backend. Una
chiave rimossa può restare nel processo già attivo fino al riavvio; il testo
del pannello lo indica. Se il riavvio fallisce il comando resta disponibile.
Durante la preparazione il supervisore risponde di attendere e riprovare.

## Archivio e ambiente

`keyring` 3.6 usa Keychain su macOS, Credential Manager su Windows e Secret
Service persistente su Linux (sessione D-Bus e portachiavi sbloccato richiesti).
Il servizio è `org.ai4educ.counselorbot.teacher`, l'account è l'ID del fornitore.
Nessun fallback su file o archivio volatile nell'avvio ordinario. Un errore di
lettura blocca l'avvio del backend, senza avviare servizi con credenziali parziali.
Sbloccare il portachiavi, aggiornare lo stato e applicare le credenziali.

Le voci coprono tutti i provider di `backend/api_secrets.py`: OpenAI, Anthropic,
Gemini, Mistral, OpenRouter, Groq, Cerebras, DeepSeek, Together, Fireworks,
DeepInfra e OmniRoute. OpenCode e `PRIVACY_KEK` sono voci riservate: la loro
conservazione non abilita OpenCode nel profilo docente né il Privacy Layer.
Non viene generata o ruotata automaticamente una KEK.

Il supervisore legge il portachiavi a ogni costruzione dell'ambiente backend.
Imposta i nomi `API_KEY_*` usati dal backend e i relativi alias SDK
(`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, ecc.). Imposta a stringa vuota tutte le
voci mancanti, sovrascrivendo eventuali valori ereditati dal terminale.
Frontend e cloudflared rimuovono dall'ambiente tutte queste variabili.
Il backend riceve anche `PYTHON_DOTENV_DISABLED=1`; non viene scritto alcun
`.env`, file di configurazione, report o log con i valori. I segreti casuali
shell/frontend del contratto ADR-0002 restano separati e solo in memoria.
Il percorso `credentials/` per le API personali resta quello previsto
da ADR-0002: questa funzione non migra archivi personali preesistenti.

I test remoti sono disponibili per OpenAI, Anthropic, Gemini, OpenRouter,
Mistral, Groq, Cerebras e DeepSeek. Gli altri mostrano esplicitamente la verifica
non disponibile: non si considera valido un token usando un catalogo pubblico
o un endpoint locale arbitrario. Le richieste usano HTTPS con verifica TLS,
host fissi, nessun redirect/proxy, timeout totale 15 s e di connessione 5 s;
chiavi solo negli header marcati sensibili, mai negli URL o nei body.
Riferimenti: [keyring](https://docs.rs/keyring/3.6.3/keyring/),
[OpenAI models](https://developers.openai.com/api/reference/resources/models/methods/list),
[Anthropic models](https://platform.claude.com/docs/en/api/models/list),
[OpenRouter key](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key).

## Verifiche riproducibili

```sh
cargo fmt --check --manifest-path desktop/teacher/src-tauri/Cargo.toml
cargo test --locked -j 1 --manifest-path desktop/teacher/src-tauri/Cargo.toml
node --test desktop/teacher/sidecar/server-wrapper.test.js desktop/teacher/src/*.test.js
make guidance-check
```

Gli unitari usano un credential store in memoria e uno che simula errori;
nessun segreto reale o richiesta ai provider. L'integrazione avvia un processo
Python sintetico tramite lo stesso `sidecar::spawn`, verifica gli alias env,
la rimozione al lancio successivo e l'assenza della sentinella nei file della
cartella dati, nel report e nel contenuto decompresso della diagnostica.
I test Node verificano mascheramento, pulizia dei campi, mancata esposizione
degli errori, test senza salvataggio, rimozione e riavvio fallito.
La CI desktop esegue queste prove su macOS arm64/x64, Windows e Linux.

Le modalità esplicite `--headless` e `--smoke` usano sempre uno store vuoto in
memoria, senza accedere al portachiavi del docente; non sono modalità per
lezioni reali. La prova manuale del prompt di autorizzazione, persistenza dopo
riavvio dell'app e rimozione nel portachiavi va svolta su ciascun OS con una
credenziale di prova. Non occorrono Docker, deploy, migrazioni o sudo.
