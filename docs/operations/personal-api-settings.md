# Connessioni AI personali di studenti e docenti

La funzione è disattivata per default. Il vero amministratore la abilita in
**Area amministrazione → Configurazione & Prompt → Generale → API personali e ChatGPT**; il ricercatore
non può abilitarla. L’attivazione prepara automaticamente la protezione delle
credenziali, senza comandi o variabili obbligatorie sul server.

La pagina si trova in `/profilo/api-personali` e `/docente/api-personali`.
Entrambe gestiscono lo stesso account CounselorBot. Quando la funzione è
spenta, collegamenti, modulo e sezione della Guida sono nascosti; una visita
diretta rimanda alla rispettiva area. Le connessioni e i counselor restano salvati.

## Connessioni e associazioni

**Aggiungi connessione** salva nome, provider, identificativo esatto del modello
e chiave. Il nome è un’etichetta scelta dall’utente per riconoscere il proprio
account provider: non effettua un login al provider. Si possono aggiungere più
connessioni e chiavi, anche dello stesso provider o di account esterni diversi.
Le chiavi appartengono sempre all’account CounselorBot autenticato: non si possono
leggere, usare o assegnare connessioni di un altro utente.

La chiave è cifrata e non viene restituita nelle risposte. Le nuove credenziali
sono legate all’utente, al provider e all’identificativo della connessione: uno
scambio tra record non consente di usare un’altra chiave. In modifica, il campo
vuoto conserva la chiave per lo stesso provider; cambiarlo richiede una nuova
chiave. **Elimina connessione** chiede conferma e rimuove la chiave e le sue
associazioni; conserva i counselor. Le associazioni rimosse tornano alla scelta
predefinita, come indicato nella conferma. Se era la connessione predefinita,
questa torna alle API di sistema; se non rimangono connessioni, l’uso personale
viene disattivato. Un endpoint di eliminazione resta disponibile al proprietario
anche se l’amministratore ha disabilitato la funzione, senza mostrare la pagina.

In **Modelli dei counselor**, ciascun counselor ha un selettore della
connessione: più counselor possono usare la stessa connessione, oppure
connessioni diverse. **Connessione predefinita** serve i counselor senza
un’associazione specifica e le funzioni senza counselor; può essere impostata
su API di sistema. Le associazioni si applicano solo nell’account del richiedente,
senza modificare preset, persona o prompt dei counselor dell’istituzione.
La lista dei counselor mostra il modello effettivamente assegnato a quell’account.

**Usa le mie API personali** e **Salva associazioni e utilizzo** rendono attive
le scelte. Disattivando e salvando, le nuove richieste usano le API di sistema.
Il passaggio alle API personali disattiva l’uso dell’abbonamento ChatGPT, e
viceversa, conservando tutte le credenziali. Le richieste già avviate mantengono
la configurazione iniziale. Un errore della connessione personale non attiva
modelli o chiavi di sistema di riserva.

## Counselor personali

**Crea un counselor** salva nome, descrizione e istruzioni private dell’account.
Le istruzioni possono essere scritte nella lingua dell’utente: vengono conservate
senza traduzione e si aggiungono alle regole e ai prompt del percorso. I prompt
di fabbrica rimangono in inglese. La lingua della risposta segue le impostazioni
della conversazione. I counselor personali possono essere modificati o eliminati
con conferma e scelti nei normali selettori delle nuove conversazioni. Le sessioni
già congelate mantengono il loro counselor.

I counselor personali gestiscono gli strumenti dichiarati dall’applicazione;
la loro lista strumenti usa `*`, senza eludere autorizzazioni e feature gate dei
singoli percorsi. Non compaiono agli altri utenti, nella lista amministrativa,
nei benchmark, nel laboratorio, nelle revisioni/allineamenti dei prompt, nelle
traduzioni automatiche o nella scelta globale Telegram. Il backend controlla
l’accesso anche se viene inviato direttamente il loro ID. Eliminare un counselor
rimuove le sue associazioni e azzera la preferenza dell’account se lo usava.
Le conversazioni già salvate mantengono il loro testo.

## Prova della connessione ed errori

**Prova connessione e modello** invia solo su richiesta un messaggio neutro
«Reply with OK.» al modello e alla chiave salvati. Non invia risultati, taccuini
o conversazioni. Consuma quota e può costare secondo il provider; salvarli o
associarli non effettua chiamate LLM. La prova conserva il filtro dei dati esterni
ed esclude altre connessioni, abbonamenti e fallback. Una risposta conferma quella
prova breve; non garantisce quote future o capacità del modello sull’intero percorso.

Gli errori espongono codici sicuri e testi nelle sei lingue: autenticazione,
modello senza accesso o provider disponibili, quota/credito, limite temporaneo,
richiesta incompatibile, servizio locale di protezione dei dati, connessione o
configurazione. Gli step guidati conservano questi codici invece di mostrare sempre
un generico problema temporaneo. Testo grezzo del provider, credenziali e dati
inviati non vengono riportati all’utente. Su Codespaces il servizio locale di
anonimizzazione può essere assente: il blocco è riportato esplicitamente; questa
modifica non disabilita automaticamente la protezione.

Gli errori AI durante la preparazione di `/chat` e `/chat/stream`, prima dello
stream, conservano il codice allowlist in HTTP 502 `detail.error_code`. Il proxy
Next e il consumer leggono questi codici anche per risposte HTTP non riuscite;
testo grezzo, errori HTML e codici ignoti non sono mostrati. I problemi di servizio,
accesso e configurazione hanno messaggi distinti nelle sei lingue. Il pulsante
**Ripeti passaggio** conserva step, counselor e messaggi precedenti.

In sviluppo host/Codespaces, chat e prova connessione usano lo stesso backend:
`BACKEND_ORIGIN`, poi `BACKEND_INTERNAL_URL`, poi `http://backend:8000` per Docker.
Una vecchia versione delle route streaming ignorava `BACKEND_ORIGIN` e cercava
l’host Docker anche se le API normali funzionavano. Aggiornare il frontend e
riavviare `next dev` dopo il pull; non occorre una nuova impostazione server.
Il rewrite generale è un fallback dopo le route dinamiche, anche per OpenCode.
Le presentazioni QSA/QSAr disattivano il ragionamento anche per ID/modalità legacy;
gli step di analisi conservano la scelta dell’utente. Nessun prompt DB è riscritto.

### Prove in cloud senza Ollama

Il vero amministratore può aprire **Configurazione → Generale → Protezione dei
dati per i modelli esterni**, scegliere **Solo filtro di base (senza Ollama)**
e premere **Salva protezione dei dati**. Poi l’utente può ripetere **Prova
connessione e modello** e lo step della conversazione. Un precedente errore di
protezione non certifica la chiave: la richiesta era bloccata prima del provider.

Questo filtro conserva email, telefoni e identificativi riconosciuti dalle regole
automatiche come placeholder reversibili. Non garantisce la rimozione di nomi,
indirizzi o tutte le informazioni sanitarie nel testo libero. Usare dati fittizi
nelle prove in cloud; la modalità non garantisce anonimato. Per il riconoscimento
contestuale serve la modalità locale con Ollama e il modello configurato.

GET/PUT `/admin/external-privacy` richiedono un amministratore reale; PUT richiede
anche `X-Requested-With: CounselorBot` e accetta solo `mode: basic|local`.
Il salvataggio aggiorna insieme `external_pii_redact=true`,
`external_pii_fallback=block` e `pii_ner_enabled=false|true`, con lock e una sola
transazione. Non cambia chiavi o prompt e non invia richieste LLM. Le configurazioni
precedenti con filtro spento o fallback permissivo appaiono come personalizzate,
senza modifiche finché non viene salvata una modalità. Anche l’API config generica
rifiuta modifiche di queste impostazioni da ricercatori.

Ogni AIService passa al detector le impostazioni del proprio snapshot DB, anziché
dipendere dal flag globale nel worker. Il cambio vale quindi per le nuove richieste
anche su worker già avviati, conservando la configurazione delle richieste in corso.
Il default resta locale e bloccante; non si passa al filtro di base automaticamente.

## Docenti e studenti

`GET/PUT /api/admin/personal-ai-audiences` gestisce, per `api` e `chatgpt`, le
caselle `teachers` e `students` (chiavi `personal_ai_{api,chatgpt}_{teachers,students}_enabled`
in `configs`; se mancano valgono come attive). `personal_ai_audience.allowed`
decide per ruolo: amministratori e docenti usano la casella docenti, gli altri
quella studenti. Il ruolo arriva dall’identità della richiesta
(`bind_identity`/`remember`); senza identità (lavori in background) è docente chi
possiede o condivide una classe. Valgono nella risoluzione della fonte, nelle
pagine personali, nel salvataggio delle scelte e nel collegamento ChatGPT.

## Permesso per classe (#217)

`class_settings.students_personal_ai` (migrazione `20261011_class_personal_ai`,
predefinito `true`) indica se gli studenti della classe possono usare le proprie
API e il proprio ChatGPT; si salva con le altre impostazioni (`PUT
/api/teacher/groups/{id}/settings`, registrato nel registro modifiche). Se una
classe attiva dello studente lo vieta, `personal_api.class_allows` fa rispondere
l’istituto (`chosen_source` e impostazioni legacy), `/user/api-connections`,
`/user/api-settings` e `/user/chatgpt` restituiscono `class_blocked` e la pagina
personale lo spiega. Docenti e studenti senza classi non sono limitati. Il
permesso riguarda le chiavi proprie degli studenti: la chiave che il docente
mette a disposizione della classe (sezione seguente) resta disponibile.

## Counselor del docente offerti alle classi

Con `personal_api_enabled` e `class_api_sharing_enabled` (casella «Docenti —
possono mettere a disposizione…» in Area amministrazione → Configurazione & Prompt
→ Generale → API personali e ChatGPT, `GET/PUT /api/admin/class-api-sharing`), un
docente spunta nella propria pagina API e ChatGPT `share_with_classes`
(`personal_ai_routing`, migrazione `20261011_teacher_shared_counselors`, che
elimina anche la vecchia tabella per classe `class_api_shares`). `class_api_sharing.offers`
restituisce per lo studente i counselor legati a una connessione API dai docenti
(proprietari o co-docenti) delle sue classi attive; un counselor offerto da due
docenti con chiavi diverse resta all’istituto. Ordine: scelta propria dello
studente, counselor offerto, istituto. I counselor personali del docente offerti
diventano visibili (`visible_counselors`) e consentiti anche agli studenti con
classi filtrate (`class_access`). La chiave è decifrata solo nel backend; i log
registrano `shared_owner` e `credential_source = personal`, quindi il costo non
pesa sul budget dell’istituto e il docente vede richieste e costo del mese. Gli
errori tornano agli studenti come `personalAPI.errors.classShare` e restano al
docente come `share_last_error`. ChatGPT non si offre mai. I dati delle
conversazioni sono trattati dal fornitore dell’account del docente: va indicato
nell’informativa della scuola.

## Protezione, migrazione e API

La chiave Fernet è conservata in `personal_api_credentials/credential.key`
(directory 0700, file 0600), nel volume Docker dedicato. Includere archivio e
DB nel backup. La chiave non viene rigenerata se manca mentre esistono credenziali.
Restano facoltativi gli override `PERSONAL_API_ENCRYPTION_KEY`,
`PERSONAL_API_ENCRYPTION_KEY_FILE` e `PERSONAL_API_CREDENTIALS_DIR`.

L’aggiornamento crea le tabelle `personal_api_connections`, `personal_ai_routing`
e `personal_counselor_connections`, aggiunge `counselors.owner_username` prima
delle query di snapshot dei prompt e `pqbl_documents.counselor_id`.
L’indice del proprietario e le migrazioni sono idempotenti. Le vecchie configurazioni
`personal_api_settings` vengono copiate una volta, conservando cifratura, modello
e attivazione come connessione predefinita. La copia legacy non può riattivare
una chiave eliminata. Non viene modificato nessun prompt salvato.

API del solo proprietario:

- GET/POST `/user/api-connections`; PUT/DELETE `/user/api-connections/{id}`.
- POST `/user/api-connections/{id}/test`: solo prova esplicita, senza dati dell’utente.
- PUT `/user/api-routing`: attivazione, default e associazioni validate insieme.
- GET/POST `/user/counselors`; PUT/DELETE `/user/counselors/{id}`.
- GET `/user/api-settings`: compatibilità per visibilità/stato; le vecchie mutazioni
  rispondono 409 dopo la migrazione per non sovrascrivere configurazioni multiple.

Le mutazioni richiedono `X-Requested-With: CounselorBot`, non accettano username,
URL arbitrari o identità in anteprima; risposte e lista counselor non sono
memorizzabili in cache. Le API amministrative restano riservate al vero amministratore.
Chat, Bussola, Assistente, studio da PDF, sintesi, analisi combinata, Tavolo e
diagrammi rispettano la scelta personale. La generazione pQBL conserva il counselor
scelto anche in background. Servizi locali, OCR, embedding, trascrizione, voce,
benchmark e OpenCode restano su configurazione di sistema.

Per distribuire serve il normale aggiornamento e ricostruzione delle immagini,
senza sudo o modifiche nginx per questa funzione con il proxy esistente.
Aggiornare e riavviare tutti i processi backend prima di creare counselor privati:
le versioni precedenti non riconoscono il campo proprietario e potrebbero elencarli
come counselor condivisi. Un rollback a quelle versioni richiede di verificare
prima la presenza dei counselor privati; non usare processi di versioni diverse.
