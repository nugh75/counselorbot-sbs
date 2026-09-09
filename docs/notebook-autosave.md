# Salvataggio automatico del Taccuino

Il modulo condiviso `LearnerProfileCard` conserva ogni modifica subito in una
bozza locale e la invia all'API esistente dopo 600 ms senza digitazione. Questo
vale per l'Area personale, il percorso iniziale e le proposte accettate dallo
studente. Nessun suggerimento AI viene salvato senza l'azione «usa» dello studente.

La bozza usa la chiave `cb_notebook_draft_v1:<username>`, con l'identità effettiva
(anche per gli account di prova). Viene rimossa soltanto dopo la conferma del
server relativa agli stessi dati. Il salvataggio cattura gli header dell'account
all'apertura del modulo, così un cambio successivo di anteprima non cambia il
destinatario di una richiesta rimasta in coda.

Una coda per account serializza le richieste e sopravvive ai cambi di pagina
interni. Il modulo tenta di completarla anche quando viene smontato o riceve
`pagehide`; le richieste usano `keepalive`. La bozza locale permette il recupero
anche se la pagina si chiude prima che la richiesta sia completata. Una risposta
precedente non sostituisce ciò che lo studente sta ancora scrivendo.

Gli errori mostrano «Riprova», mantengono la bozza e vengono ritentati al ritorno
della connessione o alla riapertura del modulo. La conferma «Taccuino aggiornato»
compare dopo il salvataggio sul server. Se lo storage del browser è disabilitato,
restano la coda in memoria e il salvataggio server, ma non il recupero locale dopo
la chiusura della pagina.

L'autosalvataggio lascia il modulo aperto e non chiama `onDone`: il percorso
iniziale avanza soltanto con il comando esplicito. «Salva taccuino» resta
utilizzabile per completare le scritture in attesa. La chiusura del modulo salva;
non annulla modifiche già salvate automaticamente. L'eliminazione confermata
attende le scritture avviate e rimuove la bozza solo dopo il successo della DELETE.

Non cambia l'API: ogni salvataggio diverso crea una revisione e il backend
continua a evitare duplicati identici. Non cambia il modello dati né occorrono
migrazioni; occorre ricostruire il frontend Docker.

Verifiche da `frontend/`:

```bash
node --test --experimental-strip-types src/lib/notebook-autosave.test.ts src/lib/notebook-flow.test.ts
node --test tests/notebook-autosave.test.mjs tests/account-onboarding.test.mjs
npm run i18n:check
npx tsc --noEmit
```

I test browser usano fixture API e `ACCOUNT_BASE_URL` (predefinito
`http://127.0.0.1:3107`), senza modificare dati personali reali. Coprono desktop e
mobile, cambio pagina prima del debounce, errore di rete, ricarica, recupero,
retry e assenza di avanzamento automatico dell'intake.
