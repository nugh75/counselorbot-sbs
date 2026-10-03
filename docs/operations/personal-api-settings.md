# API personali di studenti e docenti

La funzione è disattivata per default. Un amministratore reale può abilitarla
in **Amministrazione → Configurazione → Generale → API personali**; il ruolo ricercatore non basta.
I collegamenti compaiono in Area personale (`/profilo/api-personali`) e Area
docenti (`/docente/api-personali`) quando la funzione è abilitata. Le due pagine
configurano lo stesso account ai4auth.

Ogni account salva una connessione attiva: provider, identificativo esatto del
modello, chiave e scelta personale/sistema. Il campo chiave resta vuoto dopo il
salvataggio; vuoto conserva la chiave precedente solo per lo stesso provider.
Cambiare provider richiede una nuova chiave. La verifica effettua una richiesta
in sola lettura al provider, senza generare testo: non garantisce accesso a uno
specifico modello. L’eliminazione richiede conferma in pagina. A funzione
disabilitata non vengono mostrati collegamenti, modulo o sezione della Guida;
un accesso diretto alla pagina rimanda alla rispettiva area personale.
L’endpoint DELETE resta disponibile al proprietario autenticato per eliminare
le proprie credenziali, anche con la funzione disabilitata.

## Attivazione da Amministrazione

Dopo il normale aggiornamento dell’applicazione, selezionare **Consenti API
personali a studenti e docenti**. Non occorre generare chiavi o modificare file
sul server. L’attivazione crea automaticamente una chiave privata Fernet in
`personal_api_credentials/credential.key`, con directory 0700 e file 0600;
la scelta è salvata nel database e si applica subito alle nuove richieste.
Il volume Docker dedicato `personal_api_credentials` conserva la chiave dopo
riavvii e sostituzioni del container. Includerlo nel backup insieme al database.

Una chiave esistente non viene sostituita. Se il file manca mentre esistono
credenziali salvate, l’attivazione richiede il ripristino dal backup. In caso di
permessi insufficienti, la funzione rimane disabilitata e mostra un errore.
Le installazioni che usano già `PERSONAL_API_ENCRYPTION_KEY` continuano a usarla;
non sono necessarie migrazioni delle credenziali. Per operatori avanzati restano
facoltativi `PERSONAL_API_ENCRYPTION_KEY_FILE` (precedenza sul valore diretto)
e `PERSONAL_API_CREDENTIALS_DIR` (directory privata alternativa).

Il backend aggiornato crea idempotentemente `personal_api_settings`. Il
normale aggiornamento Docker richiede la ricostruzione delle immagini; non
servono sudo o modifiche nginx per questa funzione con il proxy esistente.
GET/PUT `/admin/personal-api-policy` sono riservati al vero amministratore.
Le mutazioni richiedono `X-Requested-With: CounselorBot`, sono escluse dalle
anteprime di ruolo e le risposte sono `Cache-Control: no-store`. Il pannello
configurazione generico non può leggere o modificare le impostazioni private.

## Risoluzione e limiti

La connessione personale è risolta sul server dall’identità autenticata del richiedente;
nessun endpoint accetta uno username di destinazione. In pQBL il proprietario
proviene dal documento autorizzato, anche nel lavoro in background.

Chat guidata (streaming e normale), messaggi chat, Bussola, Assistente, studio
da PDF, analisi combinata, sintesi PDF dei risultati, Tavolo e diagrammi usano
la connessione personale selezionata, anche quando il counselor ha un preset
diverso. L'anonimizzazione dei dati verso provider esterni rimane applicata.
Non si accettano endpoint arbitrari, provider locali o il gateway interno
OmniRoute. I servizi locali di OCR/embedding/trascrizione, voce, giudici interni,
benchmark e terminale OpenCode mantengono la configurazione di sistema.

Una connessione personale attiva non usa chiavi di sistema o modelli di riserva
in caso di errore. Lo spegnimento amministrativo e il ritorno alla modalità
sistema si applicano alle nuove istanze/richieste; una richiesta già avviata,
incluso un job pQBL in corso, mantiene la configurazione iniziale. Lo spegnimento
non elimina i dati: alla riattivazione torna valida la scelta personale salvata.

**API personali** e **abbonamento ChatGPT** sono scelte alternative: attivare
una modalità disattiva la preferenza dell’altra nello stesso aggiornamento,
senza cancellare nessuna credenziale. Le pagine studente e docente gestiscono
lo stesso account. Anche i servizi AI annidati usano l’identità del richiedente,
non quella dello studente cui appartiene un risultato consultato. Un’eventuale
vecchia selezione ambigua blocca l’inferenza e richiede una scelta esplicita.

I costi delle chat personali sono marcati nei log con `credential_source=personal`
e non concorrono al blocco del budget mensile di sistema. Il pannello costi può
continuare a mostrare le stime di tutte le richieste: il pagamento delle richieste
personali è a carico dell'account del provider dell'utente. Le chiavi non sono
incluse nelle risposte o negli envelope dei log né salvate nello storage browser.

## Verifiche isolate

Backend: `python -m pytest backend/tests/test_personal_api.py backend/tests/test_personal_ai_admin.py` usa
`backend.tests.artifact_database.artifact_session`, un nuovo schema con rollback
nel database PostgreSQL `counselorbot_test`; nessun uso di dati di produzione.

Frontend: `cd frontend && PERSONAL_API_BASE_URL=http://127.0.0.1:3135 node --test tests/personal-api.test.mjs`.
Avviare un Next dev su `127.0.0.1:3135` per questi test. Le API sono fixture del
browser: nessun provider reale né credenziale reale viene chiamato. La suite
copre accessi studente/docente, salvataggio/verifica/eliminazione, interruttore
admin, errore di salvataggio e sei lingue, tema scuro, larghezze 320/390/1440 px.
`node --test --experimental-strip-types tests/personal-ai-visibility.test.mjs`
verifica inoltre le due aree, ogni combinazione di flag, accessi diretti
disabilitati e attivazione amministrativa senza chiavi preconfigurate.
La schermata `frontend/public/guide/api-personali.png` proviene dalla fixture
italiana con campo chiave vuoto.
