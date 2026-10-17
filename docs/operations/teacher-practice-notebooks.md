# Taccuini di prova del docente

Il docente crea quanti **taccuini studente di prova** vuole e ne sceglie uno
dalle Opzioni di una chat guidata (o della Bussola) per vivere la conversazione
dal lato dello studente e allenarsi a guidarla prima delle sessioni reali. Il
modello riceve un blocco `[SIMULATION]` dedicato che gli dice che lo studente è
simulato.

## Struttura

```
/docente (TeacherAreaHome)
 ├─ [img] Taccuino del docente   → /docente/taccuino
 ├─ [img] Taccuini di prova      → /docente/taccuini-prova      (nuovo)
 ├─ Percorso guidato docenza
 └─ gruppi classe / cataloghi / ricerca (invariati)

/docente/taccuini-prova (TeacherAreaPage slug="taccuini-prova")
 ┌────────────────────────────────────────────────────┐
 │ ← Area docenti                                     │
 │ [img] Taccuini di prova                            │
 │       Studenti immaginari per allenarti ...        │
 ├────────────────────────────────────────────────────┤
 │ Nota: niente dati reali; il modello sa che è una   │
 │ simulazione; si sceglie in Opzioni della chat.     │
 │ [+ Nuovo taccuino di prova]                        │
 │ ┌ «Giulia, 3ª liceo» ───────────────────────────┐  │
 │ │ Classe: 3ª liceo · Difficoltà: ansia verifiche│  │
 │ │ [Modifica] [Archivia]                         │  │
 │ └───────────────────────────────────────────────┘  │
 │ ▸ Archiviati (n)   [Ripristina] [Elimina]          │
 └────────────────────────────────────────────────────┘
 Editor inline: Nome* + campi del taccuino studente (lp.field.*), una colonna
                Classi dello studente: [x] 3B — Liceo   [x] 4A
                                       «contesto non condiviso: non entra»
                [Salva] [Annulla]   — nessun autosalvataggio

Popover Opzioni (chat guidata e Bussola), solo docenti/ricercatori/admin:
 Taccuino nel contesto  [Predefinito][Studente][Docente][Prova][Nessuno]
 └ se Prova:  Taccuino di prova [▾ nomi attivi]   Gestisci →
              (nessuno attivo → testo + link alla pagina di gestione)
 Bussola: [Predefinito][Prova] (gli altri valori non esistono lì)

Envelope del turno (modalità prova):
 [STUDENT]     metadati di sessione (invariati)
 [GUIDED PATH] (invariato)
 [SIMULATION]  SIMULAZIONE — ALLENAMENTO DEL DOCENTE ... (lingua UI)
 [PROFILE]     ## Taccuino studente di prova (simulato): «Giulia»
               - Classe / professione: ...
               (+ punteggi della sessione, se presenti)
 niente: taccuino/portfolio/obiettivi/lettura/contesto classe del docente
```

## Contratti

- **Modello** `TeacherPracticeNotebook` (`teacher_practice_notebooks`): owner,
  nome (≤120), dati (stessi campi di `LEARNER_PROFILE_LABELS`, ≤600 per campo),
  `group_ids` (JSON, classi dello studente simulato), `archived_at`. Tabella
  creata da `create_all`; `group_ids` aggiunta alle tabelle esistenti all'avvio
  (`ALTER TABLE … ADD COLUMN IF NOT EXISTS group_ids JSON NOT NULL DEFAULT '[]'`).
  Nessun limite al numero di taccuini.
- **Classi**: salvate solo se attive e del docente o condivise con lui
  (`teacher_context.visible_group_for_teacher`), le altre si scartano. In chat
  `class_context_for_practice` le riverifica a ogni turno e passa solo quelle
  con `context_visible_to_students`, con lo stesso blocco e lo stesso tetto
  (600) di `class_context_for_student`; mai in IDEA né nella Bussola. Le
  iscrizioni del docente come partecipante non entrano.
- **Repertorio di prove** `TeacherPracticeResult` (`teacher_practice_results`,
  tabella nuova): `notebook_id`, owner, strumento (QSA, QSAr, ZTPI, QPCS, QPCC,
  QAP), punteggi 1–9 (≤60 fattori), `session_id`, `source`
  (`manual|generated|chat`). API `GET/POST /teacher/practice-notebooks/{id}/results`
  (filtro `questionnaire_type`; stesso `session_id` = idempotente) e
  `DELETE …/results/{rid}`; eliminare il taccuino elimina il repertorio.
  All'avvio in prova (`app/page.tsx`) i punteggi nuovi vanno qui con
  `source=chat` e `session_id` della chat; un profilo scelto dal repertorio non
  si duplica; nessun `POST /questionnaire-result`. Le sessioni in prova non hanno
  un `QuestionnaireResult`: proprietà da log/snapshot, strumento dei diagrammi
  dal repertorio. In prova `skills.handlers.load_profile_results` legge il
  repertorio (id risolto con ruolo e proprietà in `chat_preparation`) e la
  Bussola elenca gli strumenti del repertorio senza punteggi.
- **API** (`auth.get_current_plan_manager`, owner verificato, altrui = 404):
  `GET /teacher/practice-notebooks[?include_archived=true]`,
  `POST /teacher/practice-notebooks`, `PUT /teacher/practice-notebooks/{id}`
  (nome, dati, `archived`), `DELETE /teacher/practice-notebooks/{id}`.
- **Chat guidata**: `ChatRequest.notebook_context="practice"` +
  `practice_notebook_id`. Il server riverifica il ruolo a ogni turno e carica
  il taccuino solo se è del richiedente e non archiviato. Senza ruolo vale il
  default dello strumento; con ruolo ma taccuino non valido (archiviato,
  eliminato, altrui) il profilo resta vuoto come con `none`, senza blocco
  `[SIMULATION]`: nessun dato reale entra al posto della prova.
- **Bussola**: `notebook_context`/`practice_notebook_id` su avvio e messaggi,
  stessa risoluzione. In prova la Bussola non legge taccuino, compilazioni,
  sessioni, portfolio né obiettivi del docente.
- **Blocco `[SIMULATION]`**: `practice_notebooks.simulation_notice(lang)`, testo
  in sei lingue (IT/EN/ES/FR/DE/SV) scelto dalla lingua dell'interfaccia. Sta
  fuori da `[PROFILE]`, quindi i livelli di contesto CR1–CR4 che riducono il
  profilo non lo tagliano.
- **Persistenza scelta**: localStorage (`cb-notebook-context`,
  `cb-practice-notebook-id`) e snapshot della sessione congelata
  (`notebook_context`, `practice_notebook_id`).
- **Privacy**: i taccuini di prova sono del docente, non vengono mai letti per
  altri utenti e non toccano tabelle dello studente.

## Verifica

```bash
set -a && . /home/nugh75/counselorbot-sbs/.env && set +a
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5435/${POSTGRES_DB}" \
  python3 -m pytest backend/tests/test_practice_notebooks.py backend/tests/test_notebook_context.py backend/tests/test_teacher_context.py -q
cd frontend && npm test && npm run i18n:check && npx tsc --noEmit
```

Browser (frontend isolato, fixture anonime, nessun backend):

```bash
cd frontend
BACKEND_ORIGIN=http://127.0.0.1:9 npm run dev -- --hostname 127.0.0.1 --port 3141
TEACHER_PRACTICE_BASE_URL=http://127.0.0.1:3141 node --test tests/teacher-practice-notebooks.test.mjs
```

Limiti:

- Telegram e OpenCode non hanno il popover Opzioni e non offrono la scelta; la
  chat dell'Assistente non usa il taccuino.
- La trascrizione, i punteggi e la memoria sono quelli della sessione del
  docente (sono parte della simulazione). Le sessioni in prova non compaiono
  tra le Compilazioni: PDF e conversazione dall'Area personale non le elencano.
- Se in prova il docente sceglie un proprio risultato salvato, la chat usa quei
  punteggi con lo studente simulato e non li copia nel repertorio.
- La Bussola non mostra la scelta prima di aprire una sessione: l'apertura usa
  la scelta già memorizzata nel browser (anche dalle chat guidate).

## Profili: salvataggio esplicito e avvio diretto

Sotto ogni taccuino attivo il repertorio riusa l’editor dei punteggi corrente,
con la coppia di comandi **Salva** (primario petrol con icona di salvataggio) e
**Annulla** (secondario con etichetta nelle sei lingue ufficiali: IT Annulla,
EN Cancel, ES Cancelar, FR Annuler, DE Abbrechen, SV Avbryt). I comandi sono
duplicati sia in testa sia in coda al modulo dei punteggi (`ScoreInputForm` con
`submitAction="save"`), restando sempre raggiungibili anche dopo aver scorso i 25
fattori del QSA senza dover risalire la pagina.

Il comando resta nella pagina e non apre questionari o chat; i flussi ordinari
dei questionari conservano **Continua** e la freccia avanti. Generazione e modifica
non persistono in automatico:

- **Salvataggio**: esegue POST per un nuovo profilo o PUT per uno esistente;
  durante la richiesta campi e pulsanti sono disabilitati (`busy`). A salvataggio
  avvenuto chiude l’editor, mostra «Salvato» e rilegge il repertorio. In caso di
  errore mantiene il modulo e i punteggi compilati per consentire il retry.
- **Annullamento**: il pulsante «Annulla» (in testa o in coda) chiude subito l'editor
  se non ci sono state modifiche; se ci sono modifiche non salvate (`dirty`) o un
  profilo appena generato, richiede conferma esplicita («Ci sono modifiche non
  salvate. Uscire e scartarle?») prima di chiudere e scartare i dati. Se l'utente
  rifiuta, la bozza resta aperta. Lo stesso comportamento con conferma è uniformato
  anche all'editor del taccuino di prova (`PracticeNotebooks`) e al cambio di strumento
  dal selettore con modifiche pendenti.
- **Uscita senza salvataggio**: qualsiasi tentativo di navigazione (link interni,
  ritorno indietro nel browser, chiusura della scheda o ricaricamento) viene intercettato
  da `useDraftGuard` con la stessa richiesta di conferma a protezione della bozza.

`PUT /teacher/practice-notebooks/{notebook_id}/results/{result_id}` accetta
solo `scores`, con la stessa validazione 1–9 del POST. Ruoli e proprietà sono
verificati dal guard esistente e da `_owned`; il risultato deve appartenere
esattamente al taccuino nell’URL (altrimenti 404). Strumento, provenienza e
sessione originale restano invariati. Nessuna nuova tabella o migrazione.
Il PUT accetta numeri JSON, senza convertire stringhe o booleani in punteggi.
Per QPCC richiede anche i dieci fattori canonici e stanine intere, come il POST;
un profilo legacy, misto o incompleto restituisce 422 e non modifica il risultato.

**Avvia chat guidata** (ocra, azione d’ingresso prevista da `docs/design.md`)
riusa `/?start=<strumento>` aggiungendo `practice_notebook_id` e
`practice_result_id`. All’arrivo si rileggono dall’API i taccuini attivi e il
profilo del repertorio: ruolo docente, identità del taccuino e strumento devono
corrispondere. Link non validi non avviano la chat e non salvano compilazioni.
Il percorso passa attraverso il counselor e le impostazioni esistenti, con
modalità guidata; i redirect di configurazione mantengono il link completo.
Ogni avvio ha una nuova sessione; il profilo già salvato non viene duplicato.
Turni e congelamento riusano il contratto practice esistente, compresa la
ripresa dallo snapshot con precedenza sulle preferenze del browser.

Audit e risultati della validazione isolata:
`docs/operations/practice-notebook-profile-chat-validation.md`.
