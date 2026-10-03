# API personali di studenti e docenti

La funzione è disattivata per default. Un amministratore reale può abilitarla
in **Configurazione AI → API personali**; il ruolo ricercatore non basta.
I collegamenti compaiono in Area personale (`/profilo/api-personali`) e Area
docenti (`/docente/api-personali`) quando la funzione è abilitata. Le due pagine
configurano lo stesso account ai4auth.

Ogni account salva una connessione attiva: provider, identificativo esatto del
modello, chiave e scelta personale/sistema. Il campo chiave resta vuoto dopo il
salvataggio; vuoto conserva la chiave precedente solo per lo stesso provider.
Cambiare provider richiede una nuova chiave. La verifica effettua una richiesta
in sola lettura al provider, senza generare testo: non garantisce accesso a uno
specifico modello. L'eliminazione richiede conferma in pagina e resta disponibile
anche dopo lo spegnimento amministrativo.

## Configurazione del server

1. Impostare `PERSONAL_API_ENCRYPTION_KEY` nell'ambiente del backend. È una chiave
   Fernet indipendente dalle chiavi API di sistema. Generarla su una macchina
   fidata con `python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'`.
2. Conservarla in un gestore di segreti e nel backup sicuro. Non aggiungerla al
   repository e non sostituirla senza un piano di ricifratura: una chiave diversa
   rende illeggibili le credenziali salvate. L'utente può reinserirle o eliminarle.
3. Ricostruire le immagini e aggiornare l'ambiente applicativo. `Base.metadata.create_all`
   crea idempotentemente la nuova tabella `personal_api_settings`; non modifica
   le tabelle delle chiavi di sistema. Nessuna migrazione di chiavi legacy.
4. Abilitare la funzione nel pannello amministratore. Senza cifratura disponibile
   l'interruttore non si può accendere. Nessun passo sudo o modifica nginx è
   necessario per questa funzione con la configurazione proxy esistente.

## Risoluzione e limiti

La connessione personale è risolta sul server dal proprietario autenticato;
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

I costi delle chat personali sono marcati nei log con `credential_source=personal`
e non concorrono al blocco del budget mensile di sistema. Il pannello costi può
continuare a mostrare le stime di tutte le richieste: il pagamento delle richieste
personali è a carico dell'account del provider dell'utente. Le chiavi non sono
incluse nelle risposte o negli envelope dei log né salvate nello storage browser.

## Verifiche isolate

Backend: `python -m pytest backend/tests/test_personal_api.py` usa
`backend.tests.artifact_database.artifact_session`, un nuovo schema con rollback
nel database PostgreSQL `counselorbot_test`; nessun uso di dati di produzione.

Frontend: `cd frontend && PERSONAL_API_BASE_URL=http://127.0.0.1:3135 node --test tests/personal-api.test.mjs`.
Avviare un Next dev su `127.0.0.1:3135` per questi test. Le API sono fixture del
browser: nessun provider reale né credenziale reale viene chiamato. La suite
copre accessi studente/docente, salvataggio/verifica/eliminazione, interruttore
admin, errore di salvataggio e sei lingue, tema scuro, larghezze 320/390/1440 px.
La schermata `frontend/public/guide/api-personali.png` proviene dalla fixture
italiana con campo chiave vuoto.
