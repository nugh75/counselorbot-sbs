# Cataloghi e assegnazioni dei docenti

Nell’Area docenti (`/docente`), **Cataloghi** riunisce obiettivi, strategie e
libri, film e altri materiali. Ogni voce pubblicata e attiva ha **Assegna**.
Le bozze sono modificabili, ma non assegnabili.

Il docente sceglie un gruppo o una classe che gestisce, direttamente o tramite
condivisione, poi una persona oppure l’intero gruppo. Può aggiungere indicazioni.
Il modulo mostra il numero attuale dei destinatari prima della conferma.
Si può assegnare all’intera classe anche quando è vuota: chi si iscrive in seguito
trova le assegnazioni della classe ancora attive. La revoca le ritira anche per
gli iscritti futuri. Le assegnazioni individuali restano riservate alla persona
selezionata, che deve già essere iscritta.

**Assegnazioni effettuate** mostra gli invii del docente, il destinatario o il
gruppo, il numero di destinatari e il contenuto consegnato. **Revoca assegnazione**
ritira la consegna da tutti i destinatari dell’invio. Un altro docente non può
revocare invii altrui. Ripetere la revoca non produce ulteriori effetti.

In Area personale, **Assegnazioni ricevute** (`/profilo/assegnazioni`) mostra
contenuto, docente, gruppo/classe, data e indicazioni. Per film e letture conserva
anche autori, reperibilità e avvertenze, se presenti nel catalogo. Le assegnazioni
sono distinte dagli obiettivi personali: questi non vengono sovrascritti né
condivisi. La consegna avviene nell’app, senza email o messaggi Telegram.

## Accesso e persistenza

- Tabelle additive `teacher_assignments` e `assignment_recipients`, create dal
  consueto `Base.metadata.create_all` all’avvio; nessuna migrazione distruttiva.
- Le assegnazioni all’intero gruppo sono visibili in base alle iscrizioni attuali,
  senza dipendere dalle righe di consegna salvate al momento dell’invio. Questa
  regola vale anche per le assegnazioni di gruppo già esistenti; non richiede
  migrazioni. Il conteggio docente segue il numero attuale degli iscritti.
  Le righe `assignment_recipients` conservano i destinatari presenti all’invio
  e determinano l’accesso alle assegnazioni individuali. Il client
  non può scegliere utenti esterni o gruppi non gestiti dal docente.
- Un obiettivo pubblicato per un gruppo è assegnabile solo a quel gruppo. Gli
  obiettivi comuni pubblicati sono visibili e assegnabili dai docenti, che possono
  duplicarli ma non modificarne l’originale se non ne sono autori.
- Ogni invio conserva uno snapshot del catalogo: modifiche o eliminazioni
  successive della fonte non cambiano il contenuto già ricevuto.
- L’elenco personale filtra destinatario, appartenenza attuale e gruppo attivo.
  Uscita o disattivazione nascondono le assegnazioni; il rientro rende nuovamente
  visibili quelle già ricevute e non revocate.
- `request_id` univoco per docente e blocco transazionale PostgreSQL evitano
  duplicati, anche concorrenti. Una richiesta identica restituisce lo stesso
  invio; un payload diverso con lo stesso ID restituisce 409.
- Le risposte personali non includono i dati degli altri destinatari.

## API

| Metodo | Endpoint | Uso |
| --- | --- | --- |
| GET | `/teacher/assignment-targets` | Gruppi gestiti attivi e partecipanti |
| GET, POST | `/teacher/assignments` | Invii del docente; nuova assegnazione |
| DELETE | `/teacher/assignments/{id}` | Revoca di un proprio invio |
| GET | `/user/assignments` | Assegnazioni ricevute attualmente accessibili |

POST richiede `source_kind` (`goal`, `strategy`, `reading`), `source_id`,
`group_id`, `request_id`. `recipient_username: null` indica tutto il gruppo;
un nome utente seleziona una sola persona. Facoltativi: `instructions` (massimo
3000 caratteri) e `language` (traduzione disponibile del materiale).

## Verifiche

- `backend/tests/test_assignments.py` e `backend/tests/test_goals.py`: PostgreSQL,
  schemi isolati e rollback tramite `artifact_session`, ruoli e permessi reali.
- `backend.tests.assignments_browser_server`: fixture opzionale su porta 18099,
  database di prova e identità simulate. Non importarla nell’app di produzione.
- Avviare la fixture con un `DATABASE_URL` di prova e il frontend su porta 3098;
  da `frontend/`, eseguire `node --test tests/assignments.test.mjs`. Le variabili
  `ASSIGNMENTS_BASE_URL` e `ASSIGNMENTS_API_URL` cambiano gli indirizzi.
  Assegnazioni e cataloghi usano API reali nella fixture; gli altri servizi sono
  simulati. Test desktop/mobile, invio/ricezione/revoca e interfaccia in sei lingue.
  I casi di classe vuota assegnano strategie e film prima delle iscrizioni,
  poi verificano la ricezione dopo l’ingresso tramite l’API reale `/groups/join`.
- `tests/teacher-catalogs.test.mjs`: regressioni di pubblicazione e partecipazione
  personale rispetto alla gestione, con API simulate.
