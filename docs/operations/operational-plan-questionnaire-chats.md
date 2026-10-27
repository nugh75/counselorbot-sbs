# Analisi dei questionari nei piani operativi — #249

## Diagnosi e comportamento atteso

Il selettore precedente ammetteva soltanto somministrazioni salvate; escludeva i passi appena aggiunti e i questionari pending dei modelli. Il menu delle chat autonome esclude correttamente i questionari, ma non offriva un ingresso indipendente per analizzarne una compilazione personale. Il risultato deve esistere all’avvio dello studente, non alla progettazione o pubblicazione del piano.

## Contratto della correzione

- `guided_results_chat` mantiene il collegamento esistente `results_step_id`; in alternativa indica in `tool_key` uno dei sei questionari e usa una compilazione personale scelta dallo studente. I due target si escludono. Nessun importatore esterno (#157).
- Il salvataggio accetta `results_from`, posizione zero-based di un passo questionario precedente nello stesso payload, per i passi non ancora salvati. Il riferimento viene risolto nello stesso salvataggio, dopo la validazione completa. Gli ID esistenti restano compatibili. Il riordino frontend usa riferimenti stabili e calcola le posizioni soltanto all’invio.
- Un questionario pending è collegabile. La pubblicazione prepara prima le somministrazioni e conserva i riferimenti; una pubblicazione bloccata annulla tutte le scritture.
- I modelli supportano entrambe le origini senza richiedere compilazioni né istituti per la sola analisi personale.
- GET `.../deep-dive` fornisce le sole compilazioni valide dell’utente, l’eventuale sessione vincolata e l’azione per procurarsi il risultato mancante. POST mantiene il vecchio avvio senza corpo per la somministrazione; per l’origine personale accetta `result_id`.
- Il server verifica accesso al piano/classe/strumento, proprietà, strumento e punteggi canonici. La scelta esplicita crea la sessione una sola volta; riaperture e retry la riusano, e un diverso risultato non la sostituisce. Risultati antecedenti al piano sono utilizzabili nella modalità personale; il completamento richiede comunque l’ultimo turno della nuova sessione dopo l’attivazione del passo.
- Piani e sessioni esistenti conservano ID, progressi e collegamenti. La migrazione amplia solo il vincolo sui target ed è ripetibile.

## Ripresa e nuovo inserimento (27 ottobre 2026)

- «Reinserisci i dati» resta disponibile durante l'analisi, nelle scelte finali e
  quando il caricamento della pausa fallisce. La somministrazione offre la ripresa
  della propria ultima sessione valida, senza richiedere un'altra compilazione.
- Una chat autonoma del piano offre «Riprendi chat» accanto al nuovo avvio;
  la ripresa conserva anche il ritorno al piano. Le sessioni di prova del docente
  sono escluse da questa scorciatoia.
- I vecchi profili QPCC K1–K5 non sono convertiti né riutilizzati. Il piano spiega
  il blocco e apre il modulo con i dieci fattori canonici, anche se il catalogo
  storico del database contiene ancora le cinque scale obsolete. Le nuove
  scritture verificano sempre il contratto canonico QPCC.
- Dopo il nuovo inserimento canonico, l'approfondimento usa una nuova sessione;
  risultati, legami e conversazione storici restano conservati. Questo vale anche
  per l'origine personale: il vincolo a un risultato valido resta immutabile,
  mentre un legame al profilo QPCC obsoleto non impedisce una nuova scelta.
- Nessuna migrazione o correzione automatica dei dati personali. Una conversazione
  legata a K1–K5 resta storica e non può proseguire con l'interpretazione attuale.
- Regressioni sintetiche: `backend/tests/test_plan_chat_resume.py` su entrambi i
  database e scenari QPCC di `frontend/tests/plan-questionnaire-chats.test.mjs` a
  390/1440 px. Il caso reale è stato diagnosticato leggendo solo metadati e schema
  dei punteggi; nessuna modifica ai dati operativi.

## Fine della chat e completamento

- Nei passi somministrazione e analisi, «Continua alle scelte finali» resta nel passo e mostra `PlanChatCompleted`: titolo, `SessionReport` (sintesi e PDF completo) e «Torna ai piani operativi». Prima rimandava subito al piano senza scelte finali.
- A fine chat il frontend cancella la pausa della sessione (`DELETE /session/frozen/{id}`), come la home: la chat non resta in «Riprendi». GET `.../deep-dive` restituisce `completed` (ultimo turno della sessione vincolata già registrato): senza pausa da riprendere, il passo si riapre direttamente sulle scelte finali.
- Sintesi, conversazione e PDF (`/user/questionnaire-result/{session_id}/…`, `/questionnaire-result/{session_id}/pdf`) accettano anche la sessione dell’analisi: risolvono il risultato vincolato a quella sessione per lo stesso studente, in sola lettura e con la conversazione della sessione.
- Le fasi essenziali sono virtuali, fuori da `guided_steps`: il turno sulla fase di sintesi (`qsa-essential-summary`, `obbstudio-essential-summary`, `obbdocenza-essential-summary`) scrive ora il marcatore `guided_chat_completed` dello strumento. Prima un piano con analisi o chat Obiettivo svolte in modalità essenziale non si completava mai e, in modalità vincolante, bloccava i passi successivi.
- Test: `backend/tests/test_results_deep_dive.py` (sintesi essenziale, report della sessione d’analisi), `backend/tests/test_class_paths.py` (marcatore essenziale), scenario browser «final choices» in `frontend/tests/plan-questionnaire-chats.test.mjs` a 390/1440 px.

## Validazione

Verifiche del 21 ottobre 2026, con soli dati e risposte sintetici:

- 179 casi backend distinti: composizione, risultati personali, migrazione ripetuta con conservazione degli ID e vincolo SQL, modelli/pending, avvio/completamento/ripresa, permessi, ordine vincolante, somministrazioni IT/in-app, pubblicazione e avvii concorrenti anche con risultati diversi.
- 605 unitari frontend; TypeScript e i18n (3417 chiavi in sei lingue) superati. Ruff F mirato ed ESLint dei file modificati superati.
- Otto nuovi scenari browser a 390/1440 px, cinque casi di posizionamento dei piani e le suite esistenti aggiunta passi e modelli superati. Le fixture esistenti sono aggiornate alle preferenze dell’account e al nome della scelta di analisi; quelle Home aprono `?view=home` e fissano la data rispetto alle scadenze sintetiche, conservando tutte le asserzioni.
- Screenshot della guida docente/studente rigenerati in sei lingue con `GUIDE_BASE_URL=http://127.0.0.1:3159 GUIDE_SCREENS=class-paths node --experimental-strip-types scripts/capture-guide.mjs` dalla directory frontend. La vista docente estesa non sovrappone le barre sticky alla porzione catturata.
- Rebuild Docker backend e frontend riusciti con tag separati `counselorbot-249-backend:validation` e `counselorbot-249-frontend:validation`. Backend avviato sul DB sintetico: OpenAPI HTTP 200 e nuovi GET/POST presenti. Frontend avviato senza rete: HTTP 200 su editor e pagina di analisi. I 19 test nuovi/concorrenza sono superati anche con i file copiati nell’immagine backend, senza mount dei sorgenti.
- Nessun provider LLM reale, dato operativo, prompt salvato o container di produzione modificato. Nessun deploy/sudo. Dev :3159, smoke e PostgreSQL temporaneo :18650 arrestati al termine.

Comandi principali (dalla radice, salvo gli screenshot):

```sh
npm test --prefix frontend
npm run i18n:check --prefix frontend
npx --prefix frontend tsc --noEmit --project frontend/tsconfig.json --incremental false
node --test frontend/tests/plan-questionnaire-chats.test.mjs
CLASS_PATH_BASE_URL=http://127.0.0.1:3159 node --test frontend/tests/class-path-placement.test.mjs
CLASS_PATH_ADD_STEP_BASE_URL=http://127.0.0.1:3159 node frontend/tests/class-path-add-step.test.mjs
PATH_TEMPLATES_BASE_URL=http://127.0.0.1:3159 node frontend/tests/path-templates.test.mjs
make guidance-refresh
make guidance-check
```

I test backend usano un container dell’immagine backend con `--network container:counselorbot-249-postgres`, `DATABASE_URL=postgresql://c5_test@127.0.0.1:18650/counselorbot_test`, `PYTHON_DOTENV_DISABLED=1` e sorgenti in mount solo durante lo sviluppo; le verifiche dell’immagine finale usano i file copiati nel build. PostgreSQL temporaneo in tmpfs; la produzione non viene ricostruita né riavviata. Avvio/arresto delle fixture in `live-dev-environment.md`.
