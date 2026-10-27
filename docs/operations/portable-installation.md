# Installazione portabile collegata alla Console

Questa procedura installa CounselorBot con Docker su macOS e pubblica il
frontend tramite la Console su `https://counselorbot.labform.net`. Usa
`docker-compose.portable.yml` come file autonomo, con progetto
`counselorbot-portable`. Consultare prima
[l'audit dell'installazione](portable-install-audit.md).

## Prerequisiti

- Docker funzionante con Docker Compose v2 e spazio per immagini e dati.
- Per controlli frontend eseguiti sull'host, Node.js 22 o superiore;
  l'immagine frontend usa Node 22.
- Console attiva e rete Docker `console-platform_default` disponibile,
  oppure il nome della rete impostato nella configurazione portabile.
- Ingress della Console capace di raggiungere
  `http://counselorbot-portable-frontend:3000` sulla rete condivisa.
- Console portabile con ai4auth raggiungibile come
  `http://ai4auth:9091/api/verify`, cookie condiviso su `.labform.net` e
  tunnel wildcard per il dominio. La sola rete Docker non autentica gli utenti.
- Nessuna installazione Ollama richiesta per avviare il sito. Provider AI e
  politica di trattamento dei dati verranno configurati separatamente.

Il Compose portabile non usa `proxy-network`, `ai4educ-console_default`,
socket Linux dell'agent o workspace del precedente server. La procedura
non richiede comandi `sudo`.

## Configurazione privata

Creare un `.env` locale a partire da `.env.example`; se esiste già,
preservarlo e aggiornare soltanto le variabili di questa installazione.
Usare password DB nuove e conservarle fuori dal repository. `.env` e
credenziali devono restare esclusi da Git.

Configurazione concettuale da completare con i valori dell'installazione:

```dotenv
POSTGRES_USER=counselorbot_user
POSTGRES_DB=counselorbot
POSTGRES_PASSWORD=<password-nuova-generata-localmente>
SECRET_KEY=<segreto-nuovo-generato-localmente>
AI4AUTH_PUBLIC_HOST=counselorbot.labform.net
AI4AUTH_VERIFY_URL=http://ai4auth:9091/api/verify
FORWARD_AUTH_SHARED_SECRET=
ADMIN_GROUPS=admins
COUNSELORBOT_CONSOLE_NETWORK=console-platform_default
COUNSELORBOT_HOSTNAME=counselorbot.labform.net
COUNSELORBOT_FRONTEND_PORT=3108
COUNSELORBOT_BACKEND_PORT=8087
OLLAMA_BASE_URL=
OLLAMA_PRELOAD=false
COUNSELOR_TRANSLATE_DISABLED=1
ADMIN_SYNC_DISABLED=1
```

I valori tra `<...>` sono placeholder: sostituirli prima dell'avvio.
Questa installazione usa verifica del cookie ai4auth e lascia vuoto il
segreto forward-auth. Se in futuro si abilita il percorso con segreto,
questo deve essere privato e corrispondere a quello del proxy fidato;
non deve essere restituito al browser o accettato dagli header del client.

Lasciare vuote `API_KEY_*` e `OMNIROUTE_API_KEY` finché l'operatore indica
il provider. Non ereditare chiavi da altri container. Le chiavi di sistema
sono lette dall'ambiente del backend, non recuperate mediante API Console.
Il recupero documenti con embedding esterni riusa `API_KEY_MISTRAL` oppure
`API_KEY_OPENROUTER`: nessuna nuova variabile (vedi
[Recupero documenti senza Ollama](#recupero-documenti-senza-ollama)).

## Build e avvio

Usare sempre il file portabile esplicitamente; non combinarlo come override
del Compose upstream:

```bash
docker compose --env-file .env -f docker-compose.portable.yml config --quiet
docker compose --env-file .env -f docker-compose.portable.yml up -d --build
docker compose --env-file .env -f docker-compose.portable.yml ps
docker compose --env-file .env -f docker-compose.portable.yml logs --tail=100 counselorbot-backend counselorbot-frontend
```

`config --quiet` valida la configurazione senza stampare i segreti risolti.
PostgreSQL non pubblica porte sull'host e il backend parte dopo la readiness
del DB. Il backend lo raggiunge mediante l'alias privato dedicato
`counselorbot-portable-postgres`: non usare il nome generico `postgres`,
che può risolvere al database della Console sulla rete condivisa.
Il backend usa un worker per la prima installazione. Il codice
viene copiato nelle immagini: le modifiche richiedono una nuova build.
L'immagine backend è **Python 3.12** (`backend/Dockerfile`, build arg
`PYTHON_BASE_IMAGE`), come CI e bundle desktop: il codice importa
`datetime.UTC` (Python ≥ 3.11), quindi un'immagine 3.10 non riesce nemmeno a
importare `backend.main` e il container entra in crash-loop (il frontend
risponde `ECONNREFUSED` e il sito sembra scollegato dal login). Un
`COUNSELORBOT_PYTHON_BASE_IMAGE` che punta a 3.10 nel `.env` prevale sul
default: correggerlo e ricostruire. Anche l'istanza con hot reload
(`docker-compose.portable.dev.yml`) monta il codice nel container: se il
checkout richiede una versione di Python più recente dell'immagine, la build
va rifatta.
Il frontend copia anche `public` con proprietario `nextjs`, per rendere
leggibili guide e immagini quando il checkout macOS ha permessi `0700`/`0600`.
Gli URL pubblici (`COUNSELORBOT_HOSTNAME`, `COUNSELORBOT_AUTH_URL`,
`COUNSELORBOT_PORTAL_URL`, `COUNSELORBOT_MANAGER_URL`) non sono più compilati
nel frontend: il server li legge all'avvio e li serve in `/runtime-config.js`
(F1-03). Dopo averli cambiati basta ricreare il container frontend
(`up -d --no-deps counselorbot-frontend`), senza nuova build.

I dati persistono in volumi nominati del progetto: DB, upload, memoria,
raccolte dinamiche, indici RAG e chiavi private opzionali. `docs` e
`docs-counselorbot` sono mount dal checkout: conservare anche i documenti
aggiunti dagli amministratori in queste directory. Non eseguire `down -v`,
`docker volume prune` o cancellazione dei dati durante aggiornamenti.

Il frontend ha alias `counselorbot-portable-frontend` sulla rete Console.
Le porte debug `127.0.0.1:3108` per il frontend e
`127.0.0.1:8087` per il backend servono alla diagnosi locale; verificare che
siano libere. Il Compose le abilita su loopback e permette di modificarle
con `COUNSELORBOT_FRONTEND_PORT` e `COUNSELORBOT_BACKEND_PORT`.

## Dominio e autenticazione

Quando frontend e backend sono pronti, registrare il servizio nella Console:

```bash
node scripts/register-portable-console.mjs --hostname counselorbot.labform.net --frontend counselorbot-portable-frontend
```

Lo script utilizza il container `portable-console` (override `--console`),
verifica readiness, crea il virtual host per
`http://counselorbot-portable-frontend:3000`, registra la matrice accessi
e ricarica nginx nella Console. Conserva backup prima delle modifiche,
mantiene le autorizzazioni di una registrazione già esistente e rifiuta
di sovrascrivere virtual host non gestiti dallo script. La nuova voce
nessuna registrazione già esistente e rifiuta
di sovrascrivere virtual host non gestiti dallo script. La nuova voce
usa i gruppi `admins`, `studenti`, `viewer` presenti nella Console.

Il login del server web è il SSO ai4auth: `docker-compose.portable.yml` fissa
`AUTH_PROVIDER: ai4auth` e `COUNSELORBOT_PROFILE` vuoto, quindi un `.env`
ereditato dall'app desktop non può trasformare l'installazione in login locale
(sarebbe senza ai4auth, con un'unica identità docente creata dal guscio).
L'app desktop usa per scelta `AUTH_PROVIDER=local` (ADR-0002 §3): i due login
sono distinti e non condivisibili; cambiare il fornitore del server richiede
una modifica esplicita al Compose e un nuovo deploy verificato.

Il virtual host generato dallo script limita i timeout della sotto-richiesta
di verifica (`auth_request`: connect/send 15s, read 90s) e, se ai4auth non
risponde o risponde 5xx, risponde 503 con `Retry-After` e messaggio leggibile
invece della pagina 500 interna di nginx (issue #254). La location di fallback
non ha `auth_request`, quindi non può entrare in loop, e il recupero è
automatico al ritorno di ai4auth. Dopo un aggiornamento del template basta
rieseguire la registrazione: lo script valida la configurazione nginx prima
del reload.

La pubblicazione usa il tunnel wildcard Console esistente; lo script
non modifica DNS e non crea tunnel. Verificare DNS e TLS pubblici dopo
la registrazione. Non servono modifiche nginx sull'host né `sudo`.
Su questa macchina, dopo la readiness e la registrazione, creare il record
del nuovo hostname nel tunnel Console già configurato:

```bash
cloudflared tunnel route dns a5f567e7-70f4-446f-aaff-04718aa55b25 counselorbot.labform.net
```

Questo comando riguarda l'infrastruttura rilevata nell'audit; su altre
macchine verificare il tunnel prima di usarlo. Non sovrascrivere record
DNS esistenti automaticamente.
Il proxy risolve il frontend tramite il DNS Docker a ogni richiesta:
un eventuale arresto di CounselorBot non impedisce l'avvio di nginx Console.

La configurazione portabile inoltra il cookie al frontend/backend e
ai4auth ne verifica sessione e accesso per
`AI4AUTH_PUBLIC_HOST=counselorbot.labform.net`. L'applicazione legge
l'identità in `backend/auth.py` con questo contratto:

1. Un proxy o adapter autenticato verifica la sessione Console e imposta
   `Remote-User`, `Remote-Email`, `Remote-Name`, `Remote-Groups` insieme al
   segreto `X-Forwarded-Auth-Secret` condiviso con il backend.
2. Gli header identità e il segreto forniti dal client devono essere
   rimossi prima di aggiungere quelli verificati. L'adapter deve usare
   gruppi coerenti con i ruoli del servizio.
3. In assenza di segreto valido il backend verifica il cookie mediante
   `AI4AUTH_VERIFY_URL`; la risposta deve rispettare il contratto ai4auth,
   inclusi header identità e autorizzazione per l'host pubblico.

La Console portabile verificata usa il terzo percorso, tramite ai4auth
sulla rete condivisa. Il cookie ha dominio `.labform.net`, così la
sessione può essere verificata sul sottodominio CounselorBot. La matrice
deve autorizzare anche questo hostname. Non basta cambiare il link login
o collegare il container alla rete.

Il proxy richiede SSO sulle pagine e sulle API personali/amministrative.
Per il collegamento locale ChatGPT esclude soltanto i percorsi esatti
`GET /api/chatgpt/link/parameters`, `POST /api/chatgpt/link/registration` e
`POST /api/chatgpt/link/complete`: il backend li autorizza mediante il
codice temporaneo Bearer. Il download macOS resta protetto dalla sessione
Console. Non occorre un tunnel SSH per questo flusso nella configurazione
portabile. Preparazione del ZIP universale, Gatekeeper e alternativa CLI sono
descritti in [Abbonamento personale ChatGPT](chatgpt-subscription.md).

Collaudare sul dominio pubblico:

- HTTPS senza errori TLS e pagine statiche caricate.
- Login tramite Console e `GET /api/auth/me` con identità reale.
- Gruppi e accesso amministrativo dell'account autorizzato.
- Logout o sessione assente senza identità autenticata.
- Header `Remote-*` falsificati senza credenziale fidata rifiutati.
- Cookie invalido o sessione scaduta senza accesso privilegiato.

L'utente locale creato dal seed non fornisce credenziali per il login.
La sincronizzazione dei contatti amministrativi è un'operazione distinta:
abilitarla soltanto con endpoint e token amministrativo compatibili.

## Abilitazione AI successiva

Il sito può essere avviato e verificato prima di configurare il provider.
Le funzioni che generano testo richiedono una scelta esplicita del provider,
un modello disponibile ed eventuali credenziali assegnate a questo servizio.
Dopo un cambio delle variabili ambiente, ricreare il backend usando lo
stesso file Compose.

La politica iniziale mantiene `external_pii_redact=true`,
`pii_ner_enabled=true`, `external_pii_fallback=block`. Senza NER locale
raggiungibile le chiamate a provider esterni vengono bloccate. Questa
installazione iniziale non modifica tali valori. Quando l'operatore decide,
l'amministrazione offre `local` oppure `basic`: il filtro base ha limiti
esplicitati nell'interfaccia e non garantisce anonimato. Non passare a
`basic`, disattivare la redazione o usare `send_raw` automaticamente.

Il limite mensile, se attivato, a spesa raggiunta passa al primo ripiego
configurato disponibile fra i provider locali o gratuiti (per esempio
llama.cpp, oppure un modello gratuito di un provider con chiave). Il ripiego
non è più fissato a Ollama: su una macchina senza Ollama configurare almeno un
ripiego utilizzabile, altrimenti la chat si ferma con un messaggio chiaro
invece di tentare un servizio assente. Verificare il comportamento al
raggiungimento del limite.

## Funzioni opzionali e limiti senza Ollama

| Funzione | Stato dello stack iniziale |
| --- | --- |
| Questionari, punteggi manuali, area personale | Richiedono il sito e l'identità appropriata; non installano un LLM. |
| Chat, pQBL e sintesi AI | In attesa di provider, modello e scelta privacy dell'operatore. |
| Recupero documenti (RAG) | Ricerca per parole chiave (BM25) sempre attiva, senza chiavi. Ricerca per significato con Mistral o OpenRouter: vedi [Recupero documenti senza Ollama](#recupero-documenti-senza-ollama). |
| Assistente piattaforma | Il documento live può fornire grounding senza embedding; la generazione richiede comunque un provider funzionante. |
| Memoria semantica | Sempre per parole chiave senza Ollama: memorie ed episodi non vanno mai a un'API. |
| Upload OCR QSA | Ollama assente: il ripiego usa il provider di visione configurato (`vision_provider`/`vision_model`) tramite `AIService` e il filtro privacy della chat. Senza provider di visione l'utente riceve un messaggio chiaro. |
| OCR pQBL di PDF scansionati | Ollama assente: l'OCR usa il provider di visione configurato (`vision_provider`/`vision_model`) con il filtro privacy della chat; senza provider di visione compare un errore chiaro. I PDF con testo nativo funzionano sempre. |
| Traduzioni automatiche counselor | Tentativi automatici disabilitati; usa descrizioni disponibili. Le traduzioni del catalogo usano il provider AI attivo. |
| Ripiego per budget | Passa al primo ripiego locale o gratuito configurato; senza ripieghi la chat si ferma con un messaggio chiaro. |
| Thread guard | Disattivato inizialmente; il preset di fabbrica richiede Ollama. |
| Trascrizione audio locale e Piper | Servizi esclusi dallo stack portabile iniziale; installazione e risorse dedicate necessarie. |
| Edge TTS | Richiede connessione al servizio esterno e collaudo separato. |
| OpenCode e prompt lab | Runtime, socket, workspace e modelli non inclusi; nessuna promessa di disponibilità. |

Ollama remoto è un'opzione futura per mantenere le funzioni implementate,
non un prerequisito che questa procedura installa sul Mac.

## Recupero documenti senza Ollama

Il recupero documenti alimenta la chat guidata (materiali di
competenzestrategiche.it, CounselorBot e questionari) e l'Assistente. Ha due
livelli:

- **parole chiave (BM25)**: indice locale sempre attivo, calcolato senza rete
  né chiavi e salvato nel volume `rag_index`;
- **significato (embedding)**: vettori calcolati da un modello. Senza Ollama
  si usa un provider esterno con chiave di sistema: Mistral diretto
  (`mistral-embed`, 1024 dimensioni, fornitore UE) oppure OpenRouter
  (predefinito `google/gemini-embedding-2` a 768 dimensioni, fornitore USA
  che inoltra a Google). Per questa installazione è previsto OpenRouter con
  `google/gemini-embedding-2`.

| Funzione | Solo parole chiave (nessuna chiave) | Con embedding esterno (Mistral o OpenRouter) | Non disponibile senza Ollama |
| --- | --- | --- | --- |
| Materiali nella chat guidata | Passaggi trovati per parole, titoli e nomi dei file; nessun errore visibile | Ricerca ibrida parole + significato (fusione RRF) | — |
| Assistente del sito, tutte le collezioni predefinite | Come sopra; un guasto del servizio mostra un messaggio localizzato, mai l'errore tecnico | Come sopra | — |
| Collezioni caricate dall'amministratore | Parole chiave | Vettori solo se la collezione è marcata «Pubblicabile a un provider di embedding esterno»; altrimenti parole chiave | — |
| Domande degli studenti | Restano nel backend | Inviate al provider solo dopo il filtro dei dati personali della chat e senza punteggi. Con NER locale assente serve il filtro di base (vedi passo 6) | Filtro NER locale dei nomi |
| Memorie, episodi, strategie e letture certificate | Parole chiave | Parole chiave: i testi privati non vanno mai a un'API | Ordinamento semantico locale |
| Costi | Nessuno | Registrati nei log `embedding` e nel budget mensile; stima prima di reindicizzare | — |

Nessuna variabile nuova: si riusano `API_KEY_MISTRAL` o `API_KEY_OPENROUTER`
(accettata anche `OPENROUTER_API_KEY`). Provider, modello, dimensioni e
modalità sono impostazioni del DB, modificabili solo da Amministrazione.
Dettagli tecnici in [Provider di embedding](embedding-providers.md),
[indice BM25](rag-bm25.md) e [indici per modello](rag-index-versions.md).

### Attivazione per l'amministratore

Prima di iniziare: il titolare del trattamento deve aver accettato il
fornitore (Mistral UE, oppure OpenRouter USA con trasferimento extra-UE) e
aggiornato l'informativa. La procedura non richiede `sudo`.

1. **Chiave di sistema.** Nel `.env` del checkout portabile impostare
   `API_KEY_OPENROUTER=<chiave>` (scelta prevista) oppure
   `API_KEY_MISTRAL=<chiave>`. Usare una chiave dedicata al servizio, mai
   una chiave personale. Non stampare il file, non copiarlo in chat o in Git.
2. **Ricreare il backend** perché legga la nuova variabile:

   ```bash
   docker compose --env-file .env -f docker-compose.portable.yml up -d --force-recreate --no-deps counselorbot-backend
   docker compose --env-file .env -f docker-compose.portable.yml ps
   ```

   Se l'immagine è precedente a questa funzione (nessuna sezione «Recupero
   documenti» in Amministrazione), ricostruire backend e frontend con
   `up -d --build`. Il volume `rag_index` resta: l'indice BM25 esistente
   continua a servire.
3. **Aprire il pannello.** Amministrazione → Configurazione & Prompt →
   sezione **Generale** → **Recupero documenti**. Scegliere **Esterno:
   OpenRouter** (oppure **Esterno: Mistral diretto (UE)**). Il pannello deve
   mostrare «Chiave API_KEY_OPENROUTER: presente». Se dice «assente», la
   variabile non è arrivata al container: ricontrollare i passi 1 e 2.
4. **Modello e modalità.** Lasciare vuoti **Modello** e **Dimensioni del
   vettore**: valgono `google/gemini-embedding-2` a 768 dimensioni
   (`mistral-embed` a 1024 per Mistral). **Modalità di ricerca**: «Ibrida:
   parole chiave + significato (consigliata)». Premere **Salva recupero
   documenti**. Con Gemini via OpenRouter gli endpoint a conservazione zero
   (ZDR) non accettano lotti: l'indicizzazione invia una richiesta per
   passaggio ed è più lenta (stesso costo); per collezioni grandi è
   consigliato Mistral, che accetta lotti da 32.
5. **Prova.** Premere **Prova**: invia una frase fittizia, senza dati
   personali, e costa una frazione di centesimo. Esito atteso: «Funziona:
   vettore di 768 dimensioni» (1024 con Mistral). Gli esiti «manca la chiave
   di sistema», «prezzo del modello non configurato», «budget mensile
   esaurito» o «servizio non raggiungibile» indicano il passo da correggere;
   intanto la ricerca resta per parole chiave.
6. **Condizione N1: NER locale assente.** Con le impostazioni di fabbrica
   (`pii_ner_enabled=true`, `external_pii_fallback=block`) le domande degli
   studenti passano dal rilevatore locale dei dati personali, che vive su
   Ollama. Senza Ollama il rilevatore non risponde e, per sicurezza, **nessuna
   domanda viene inviata al provider**: i documenti ricevono i vettori, ma
   ogni ricerca resta per parole chiave. Il pannello lo mostra così:
   - prima di una prova, con un provider esterno salvato: «Le domande verso
     il modello esterno richiedono il rilevatore locale di dati personali
     (Ollama, modello …)»;
   - dopo **Prova** o dopo una domanda: «Rilevatore locale non
     raggiungibile: le domande verso il modello esterno sono disattivate…»
     con il pulsante **Usa solo il filtro di base**.

   Per attivare le query vettoriali esterne l'amministratore sceglie il filtro
   **basic**: pulsante **Usa solo il filtro di base**, oppure «Solo filtro di
   base (senza Ollama)» in **Protezione dei dati per i modelli esterni**.
   Risultato: `pii_ner_enabled=false`, `external_pii_redact=true`,
   `external_pii_fallback=block`. Il filtro deterministico toglie e-mail,
   telefoni e identificativi riconosciuti, ma non tutti i nomi: non garantisce
   l'anonimato. Nulla cambia finché non lo sceglie l'amministratore. Su questa
   macchina `basic` è già attivo dal 5 ottobre 2026: in quel caso nessuno dei
   due messaggi compare. Ripremere **Prova** per confermarlo.
7. **Reindicizzare.** Sotto **Indici per collezione** premere una sola volta
   **Reindicizza tutto**. La conferma mostra la stima complessiva (calcolo
   locale, nessuna chiamata); poi premere **Avvia**. «Framework teorico» vale
   circa il 90% del volume. Durante il lavoro il pannello mostra la
   percentuale e, per ogni collezione, «in attesa», «in corso: x/y
   passaggi», «completata» oppure «errore: motivo». Il pulsante resta
   disattivato e l'avanzamento ricompare anche ricaricando la pagina. Un
   errore su una collezione non ferma le altre e lascia attivo il suo indice
   precedente; i limiti di frequenza del provider vengono ritentati in
   automatico. Lo stato finale è «Parole chiave + significato pronti».
   Mentre una collezione viene indicizzata la sua ricerca usa le parole chiave;
   il nuovo indice entra in servizio solo quando è completo. Le collezioni non
   pubblicabili restano «Non pubblicabile: resta solo parole chiave con un
   modello esterno». Una collezione non reindicizzata a mano viene comunque
   indicizzata in background alla prima ricerca che la usa: fare la stima
   prima di salvare il provider se il budget è stretto.
8. **Verificare.** Fare una domanda all'Assistente su una collezione
   indicizzata e controllare risposta e fonti. Poi leggere i log senza
   stampare segreti:

   ```bash
   docker compose --env-file .env -f docker-compose.portable.yml logs --since 15m counselorbot-backend | grep -i embedding
   ```

   Non devono comparire errori di embedding ripetuti. I costi compaiono nei
   log `embedding` e rientrano nel budget mensile, se attivo.

**Tornare indietro:** scegliere «Nessuno (solo parole chiave)» e salvare.
Nessuna richiesta parte più, la ricerca usa BM25 e gli indici vettoriali
restano sul volume per un eventuale ritorno. Per revocare la chiave,
svuotarla nel `.env` e ripetere il passo 2.

## Verifiche e manutenzione

Verificare stato dei container e log dopo ogni build. Usare un DB separato
per i test: `test_smoke.py` importa il backend prima di applicare alcuni
override, quindi `DATABASE_URL` deve puntare al DB di test già dall'avvio
del processo. Non lanciare benchmark AI come controllo di installazione:
possono inviare richieste reali e generare costi.

Controlli pertinenti dopo eventuali modifiche al codice: test dei segreti,
privacy esterna e forward-auth, smoke del backend, lint e build frontend.
L'audit produzione iniziale aveva rilevato vulnerabilità frontend;
eseguire `npm audit --omit=dev` sul lockfile aggiornato prima della
pubblicazione e riportare l'esito insieme a lint e build.
Il collaudo AI reale resta sospeso finché il provider non è indicato.

Se il pull di immagini fallisce con `no route` verso un indirizzo IPv6,
verificare il percorso di rete Docker. In questa installazione il pull
tramite `mirror.gcr.io` è riuscito. Gli override opzionali permettono di
usarlo come rimedio temporaneo, conservando i default del repository:

```dotenv
COUNSELORBOT_PYTHON_BASE_IMAGE=mirror.gcr.io/library/python:3.12-slim
COUNSELORBOT_NODE_BASE_IMAGE=mirror.gcr.io/library/node:22-alpine
COUNSELORBOT_POSTGRES_IMAGE=mirror.gcr.io/library/postgres:15
```

Non riavviare la Console o gli altri servizi per aggirare il problema
senza un'esigenza verificata. Documentare il mirror realmente utilizzato
e verificare la build completa prima di dichiararla conclusa.

Per interrompere lo stack preservando i dati:

```bash
docker compose --env-file .env -f docker-compose.portable.yml stop
```

Per riavviarlo:

```bash
docker compose --env-file .env -f docker-compose.portable.yml up -d
```

Prima di dichiarare completata la pubblicazione, registrare nel handoff
gli esiti DNS/TLS, identità Console, gruppi, stato dei servizi, test e
funzioni ancora in attesa di configurazione. Per questa procedura non è
necessario eseguire `update_nginx.sh` né comandi `sudo`.

## Esito dell'installazione su questa macchina — 5 ottobre 2026

Installazione completata dal ramo `feature/portable-labform-install`,
basato sull'upstream `4c627565`. Audit e piano sono stati svolti prima
dell'installazione con agenti paralleli per AI/dipendenze, auth e infrastruttura.

- Sito pubblicato: **https://counselorbot.labform.net**, instradato dal
  CNAME Cloudflare verso il tunnel Console esistente. HTTPS verificato
  con controllo del certificato, senza disabilitare TLS. Nessun tunnel nuovo.
- PostgreSQL 15, backend e frontend sono in stato **healthy**, con
  immagini costruite da questo checkout. Le immagini di base usano gli
  override `mirror.gcr.io` riportati sopra. Nessun Ollama installato.
- Registrazione Console e test nginx superati. Seconda esecuzione dello
  script: `changed=false`. Backup configurazione in
  `/portable-data/backups/counselorbot/2026-10-05T05-22-52-855Z-93775`,
  montato su `console-platform/portable/data/backups/counselorbot/`.
  Gli altri servizi Console sono rimasti attivi; nginx è stato ricaricato.
- SSO pubblico verificato con un account amministrativo reale: login
  `auth.labform.net`, ritorno alla pagina admin dell'app, cookie
  `.labform.net` Secure/HttpOnly, identità uguale a `manager.labform.net`,
  ruolo admin e accesso a `/api/admin/config`. Servizio presente nella
  matrice ai4auth. Logout e replay del token di prova confermano la revoca.
  Le sessioni di prova sono state chiuse; nessun utente è stato creato.
- Richieste con header amministrativi falsificati e cookie invalido:
  identità anonima sui servizi locali, redirect al login sul dominio pubblico.
- Collaudo browser: home e Guida reali, asset leggibili; dieci violin
  con fixture survey solo browser, su desktop e mobile. Nessuna scrittura
  nel DB, zero errori JavaScript nel collaudo dei grafici.
- Backend: **202 smoke check passati** e **85 test passati** per auth,
  segreti e privacy, su un DB separato. Frontend: **253 test passati**,
  build Next/TypeScript completata, i18n e documentazione guida allineati.
- Audit npm produzione: **zero vulnerabilità**, rispetto alle nove
  iniziali. Restano cinque high nei tool di sviluppo; il lint completo
  conserva un errore upstream in `NewDeckDialog.tsx` e 44 warning.
  Lint mirato alle modifiche auth: zero errori. Audit Python: un rilievo
  unico high in `ecdsa`, senza patch; nessun percorso vulnerabile
  identificato nell'app. Evidenze e limiti nell'audit collegato sopra.

Al termine dell'installazione iniziale, provider, modello, credenziali AI e
scelta del filtro privacy erano in attesa dell'operatore. Nessuna chiave è stata copiata da altri servizi;
`external_pii_redact=true`, `pii_ner_enabled=true`,
`external_pii_fallback=block` sono stati verificati nel DB dell'app.
La disponibilità del sito non attesta quella di chat, RAG, OCR o audio.

### Aggiornamento ChatGPT e protezione base, 5 ottobre 2026

Corretto il proxy di associazione e pubblicato l'assistente grafico Mac,
scaricabile dalla pagina personale dopo il login Console. Lo ZIP universale
è montato readonly nel backend; nessun token OpenAI va inserito manualmente.
Il trasferimento usa soltanto i tre percorsi Bearer descritti sopra. Il login
Console protegge ancora gli altri percorsi, incluso il download.

Su richiesta esplicita dell'operatore è stato salvato **basic** tramite
`PUT /api/admin/external-privacy`: `external_pii_redact=true`,
`pii_ner_enabled=false`, `external_pii_fallback=block`. Il detector Ollama
non viene chiamato. Il filtro deterministico resta attivo su messaggio,
istruzioni e cronologia, ma può lasciare nomi e altri dati personali.
La configurazione è stata riletta dall'API autenticata e verificata nel
runtime con soli testi fittizi, senza inferenza esterna.

Frontend e backend ricostruiti e ricreati; i tre servizi sono healthy.
Registrazione Console applicata con backup, test nginx, reload e verifica
idempotente. Download ZIP e identità Console verificati sul dominio pubblico,
poi logout e revoca della sola sessione di prova. Verifiche: 140 test backend
su DB separato, 5 test HTTP del helper, 253 unità frontend, 12 percorsi browser
in sei lingue a 390/1440 px, 23 controlli proxy HTTP isolati, build/test nativi
Mac, TypeScript, i18n, lint mirato e guidance passati.

L'app Mac è firmata ad hoc e non notarizzata. Compilate entrambe le architetture;
apertura verificata su Apple Silicon, non su hardware Intel. L'accesso al vero
account ChatGPT, la selezione del modello e una risposta reale restano da
completare dall'utente sul Mac del browser. Nessun account OpenAI usato nei test.

I tre container dell'app rimangono avviati. Il container temporaneo
di validazione e la sessione browser di prova sono stati chiusi;
nessun processo dev resta attivo. Per fermare l'app conservando i dati,
usare il comando `docker compose ... stop` completo riportato sopra.
**`sudo ./update_nginx.sh` non è necessario**: la configurazione Console
Docker è stata applicata e verificata.
