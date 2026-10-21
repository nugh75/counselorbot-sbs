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
