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

## Dall’assegnazione al riscontro

Il docente distingue **Proposta da esplorare** e **Attività con restituzione
attesa**, specifica che cosa restituire e può indicare una scadenza. Le
assegnazioni precedenti restano proposte; la scadenza non conclude attività,
non assegna voti e non impedisce di inviare una restituzione successiva.

Da **Lavora su questa assegnazione**, lo studente può:

1. Pianificare una prova, anche senza data: vengono create un’attività e una
   tappa nello stesso workspace personale già usato da Attività e Linea del
   tempo. Entrambe conservano il collegamento di ritorno all’assegnazione.
2. Collegarle a un proprio obiettivo, senza crearne o condividerne uno
   automaticamente. Il collegamento compare anche nell’obiettivo.
3. Scrivere e salvare una riflessione personale: è la riflessione della tappa,
   leggibile e modificabile anche dalla Linea del tempo. L’attività rimanda a
   questa riflessione invece di chiederne un’altra.
4. Preparare una restituzione in un modulo separato. Può copiare la riflessione,
   modificarla e scegliere titolo e descrizione di un proprio lavoro del
   Portfolio. L’anteprima mostra esattamente il testo da condividere; immagini,
   link privati e altri dati del Portfolio non vengono allegati.
5. Condividere esplicitamente quella copia con il docente autore dell’invio,
   oppure ritirarla in seguito. Una nuova restituzione sostituisce la precedente
   e il relativo riscontro; modificare il lavoro personale non aggiorna la copia.

Il docente apre **Restituzioni condivise** sulla propria assegnazione e salva
un riscontro per ciascuna persona. Non vede le bozze, le date della pianificazione
personale, gli obiettivi collegati o la riflessione non condivisa. Ritirare una
restituzione rimuove anche il relativo riscontro dal flusso, lasciando intatti
attività, diario e Portfolio. Una revoca dell’assegnazione non cancella il lavoro
personale; interrompe l’accesso al flusso di restituzione e riscontro.

**Il mio percorso** mostra fino a tre assegnazioni, dando precedenza a quelle
con riscontro e poi alle scadenze, con accesso all’elenco completo. Non interpreta
un’attività svolta come un obiettivo personale raggiunto.

I permessi storici della classe restano invariati: chi la gestisce può consultare
Taccuino, risultati e relative conversazioni. L’informativa ora li esplicita anche
nel Taccuino, nelle compilazioni e nei punti d’iscrizione. La condivisione degli
obiettivi e delle restituzioni resta una scelta separata.

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
- `assignment_learning_settings` aggiunge tipo, scadenza e richiesta di
  restituzione; `assignment_work` conserva riferimenti al workspace, revisione,
  copia condivisa e riscontro. Sono nuove tabelle create dal bootstrap, senza
  riscrivere quelle esistenti. La pianificazione è idempotente per studente e
  assegnazione, transazionale e non ricrea elementi eliminati dal workspace.
- Le scritture controllano la revisione del lavoro; la riflessione controlla
  anche quella del workspace, il collegamento quella dell’obiettivo e l’allegato
  testuale quella del Portfolio. Un conflitto restituisce 409 e conserva la
  bozza nell’interfaccia, con ricaricamento esplicito. I controlli d’accesso
  si ripetono a ogni richiesta, anche dopo uscita, revoca o perdita di gestione.

## API

| Metodo | Endpoint | Uso |
| --- | --- | --- |
| GET | `/teacher/assignment-targets` | Gruppi gestiti attivi e partecipanti |
| GET, POST | `/teacher/assignments` | Invii del docente; nuova assegnazione |
| DELETE | `/teacher/assignments/{id}` | Revoca di un proprio invio |
| GET | `/user/assignments` | Assegnazioni ricevute attualmente accessibili |
| GET | `/user/assignments/{id}/work` | Lavoro proprio, riferimenti, copia condivisa e riscontro |
| POST | `/user/assignments/{id}/plan` | Crea attività e tappa personali, data facoltativa |
| PUT | `/user/assignments/{id}/reflection` | Salva la riflessione nella tappa collegata |
| POST | `/user/assignments/{id}/goal` | Collega attività e tappa a un obiettivo proprio |
| POST, DELETE | `/user/assignments/{id}/submission` | Condivide una copia o la ritira |
| GET | `/teacher/assignments/{id}/submissions` | Sole restituzioni condivise dagli iscritti attuali |
| PUT | `/teacher/assignments/{id}/submissions/{username}/feedback` | Riscontro dell’autore dell’assegnazione |

POST richiede `source_kind` (`goal`, `strategy`, `reading`), `source_id`,
`group_id`, `request_id`. `recipient_username: null` indica tutto il gruppo;
un nome utente seleziona una sola persona. Facoltativi: `instructions` (massimo
3000 caratteri), `language` (traduzione disponibile del materiale), `intent`
(`proposal`, predefinito, oppure `requested`), `due_date` e `response_prompt`
(massimo 1500 caratteri). I retry dei vecchi client mantengono lo stesso hash.

Le scritture del lavoro richiedono `revision`; la riflessione anche
`workspace_revision`; il collegamento `goal_id` e `goal_revision`. La condivisione
riceve `text` (massimo 3000 caratteri) e facoltativamente `portfolio_id` e
`portfolio_updated_at`, corrispondente all’anteprima letta. La cancellazione usa
`?revision=…`. La pianificazione accetta `{date: "YYYY-MM-DD"}` oppure `{}`.

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
- `backend/tests/test_assignment_work.py`: workspace unico, retry, conflitti,
  proprietà degli obiettivi e del Portfolio, copie immutabili, bozze private,
  riscontri, ritiro, revoche e accesso di altri docenti/studenti.
- La suite browser include pianificazione, obiettivo, riflessione, anteprima,
  testo del Portfolio, riscontro, accesso da Il mio percorso e ritiro su
  desktop e telefono. Queste API sono reali nella fixture isolata.
- Eseguire i test PostgreSQL e la fixture browser **in sequenza**: le transazioni
  esterne della fixture mantengono i lock consultivi per gli stessi utenti di
  prova fino allo spegnimento, anche se gli schemi sono distinti.

### Verifica del percorso, 19 settembre 2026

- 70 test backend su assegnazioni, restituzioni, obiettivi, Linea del tempo,
  strumenti visuali e cataloghi docenti; fixture PostgreSQL isolate.
- 11 test browser passati anche sul frontend di produzione, con API reali in
  fixture: desktop/mobile, tema scuro, sei lingue, classe vuota, conflitto fra
  schede senza perdita della bozza, navigazione attività/diario/assegnazione,
  condivisione, riscontro e ritiro.
- TypeScript, i18n e build Docker superati. ESLint senza errori, con i due
  warning preesistenti degli hook in `ConfigForm.tsx`.
- Container backend/frontend aggiornati; avvio completato dei quattro worker,
  nuove tabelle presenti e hash delle route uguali ai sorgenti verificati.
  Pagina locale 200, API del lavoro anonima 401, dominio pubblico 302 al login
  SSO. Nessuna sessione autenticata sul dominio pubblico né invii a utenti reali.
