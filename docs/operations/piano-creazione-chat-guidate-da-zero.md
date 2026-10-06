# Piano Architetturale: Creazione Chat Guidate da Zero in Amministrazione

## 1. Obiettivo e Visione

Attualmente, CounselorBot supporta strumenti di auto-valutazione psicometrica (QSA, QSAr, ZTPI, QPCS, QPCC, QAP) e percorsi guidati narrativi / di orientamento (SAVICKAS, EVENTO_STUDIO, EVENTO_PROFESSIONALE, OBIETTIVO_STUDIO, OBIETTIVO_DOCENZA, IDEA).
Tuttavia, l'aggiunta di un nuovo strumento o percorso guidato richiede la modifica manuale di numerose costanti, modelli e mapping hardcoded sia nel backend Python che nel frontend TypeScript (vedi tabella in `CONTEXT.md` "Adding an instrument: the lists to touch").

L'obiettivo di questa architettura è consentire agli amministratori di **creare, configurare, testare in bozza e attivare una nuova chat guidata interamente dall'interfaccia di amministrazione**, senza dover modificare il codice sorgente o rieseguire deploy di container.

---

## 2. Analisi dell'Architettura Esistente

### 2.1 Modello Dati Attuale
1. **`instruments`** (`models.Instrument`):
   - Rappresenta lo strumento nel catalogo.
   - Campi: `code` (PK), `name_it`, `name_en`, `name_es`, `name_sv`, `name_i18n` (JSON), `response_scale_min`, `response_scale_max`, `response_labels`, `report_scale_type` ("stanine" | "raw"), `status` ("experimental" | "active").
   - Esiste già un CRUD base in `backend/routes/admin.py` (`GET/POST /admin/instruments`, `PUT /admin/instruments/{code}`).
   - **Mancanza**: non distingue nativamente se lo strumento è un questionario con scala/fattori o un percorso agent-only/conversazionale (attualmente dedotto a runtime da `item_count == 0` o hardcoded). Non gestisce `is_active` o `draft` esplicito per la visibilità studente.

2. **`guided_steps`** (`models.GuidedStep`):
   - Rappresenta i passaggi sequenziali ordinati per `questionnaire_type`.
   - Campi: `id` (PK, es. `sl-intro`, `sl-cognitivi`), `sort_order`, `label`, `label_i18n` (JSON), `prompt` (istruzione di sistema o fase), `system_prompt_mode`, `color_theme`, `questionnaire_type` (FK logica su `instruments.code`).
   - Gestito tramite `GET/POST/PUT/DELETE /admin/guided-steps` e `PATCH /admin/guided-steps/reorder`.

3. **`guided_step_questions`** (`models.GuidedStepQuestion`):
   - Domande suggerite all'utente durante uno step guidato.
   - Campi: `id`, `questionnaire_type`, `step_id`, `language`, `text`, `sort_order`, `is_active`.

4. **`configs`** (`models.Config`):
   - Chiavi-valore per prompt di sistema globali, di fase o di strumento (`prompt_meta_<TYPE>`, `prompt_<TYPE>_intro`, `text_<type>_questions_intro`, `text_<type>_conclusion`).
   - Revisionato in append-only tramite `models.PromptRevision`.

5. **`counselors`** (`models.Counselor`):
   - Personalità selezionabile in chat.
   - Campo `questionnaire_types` (JSON array di codici stringa). Se vuoto, gestisce tutti gli strumenti non riservati (`counselor_restricted_instruments`). Se uno strumento è riservato o dedicato, solo i counselor che lo citano possono operare.

6. **`content_language_versions`** (`models.ContentLanguageVersion`):
   - Traccia la certificazione linguistica per `content_type="instrument"` e `content_key=code`.

### 2.2 Punti Critici e Gate Hardcoded Rilevati
L'analisi del runtime evidenzia diversi gate restrittivi che oggi bloccherebbero qualsiasi nuovo strumento non presente nel codice:
- **`backend/schemas.py`**:
  - `FROZEN_SESSION_TYPES` blocca il salvataggio o la ripresa delle sessioni congelate se il codice non è nel set hardcoded.
  - `PRACTICE_RESULT_TYPES` blocca i profili di prova.
- **`backend/routes/memory.py`**:
  - `MEMORY_QUESTIONNAIRE_TYPES` controlla la persistenza della session memory su disco (`SESSION_MEMORY_DIR`).
- **`backend/routes/survey.py`**:
  - `INSTRUMENT_TYPES` valida il codice su varie route di somministrazione/risultati.
- **`backend/chat_logic.py`**:
  - `_ensure_questionnaire_guided_steps`: carica default hardcoded solo per gli strumenti noti in `defaults_by_type`. Per strumenti nuovi creati dall'admin, gli step devono esistere già nel DB, ma il metodo non deve andare in errore.
  - `DEFAULT_NOTEBOOK_CONTEXT`: mappa statica per decidere se il profilo è "student" o "teacher".
- **`frontend/src/lib/tool-catalog.ts`**:
  - `ACTIVE_QUESTIONNAIRE_IDS`: array statico che governa quali strumenti sono visibili nel selettore studenti e nella home.
- **`frontend/src/lib/questionnaires.ts`**:
  - `QuestionnaireType` (union type statico) e `QUESTIONNAIRES` (record statico).
  - Componenti come `QuestionnaireSelector`, `ReturningHome`, `InstrumentDetailsPage` leggono solo le chiavi note di `QUESTIONNAIRES`.

---

## 3. Architettura Target

L'architettura per consentire la creazione dinamica da zero si basa su **cinque pilastri**:

### 3.1 Estensione del Modello Dati `Instrument`
Aggiunta al modello `models.Instrument` dei campi necessari a descrivere un percorso guidato generico:
- `is_active` (`Boolean`, default `False`): permette di salvare una chat in bozza senza esporla agli studenti.
- `tool_category` (`String`, default `"guided"`): `"guided"` (percorso conversazionale/intervista) vs `"assessment"` (questionario psicometrico con fattori e item).
- `description_i18n` (`JSON`, nullable): descrizione breve dello strumento per il selettore e la home in tutte le lingue supportate.
- `target_audience` (`String`, default `"student"`): `"student"` vs `"teacher"` vs `"both"`.
- `icon` (`String`, default `"compass"`): icona visuale per la UI (`chart`, `clipboard`, `target`, `lightbulb`, `clock`, `compass`, `briefcase`).
- `color_theme` (`String`, default `"blue"`): colore di accento per card e grafici.
- `interview_mode` (`String`, default `"interactive"`): comportamento dei bottoni di avanzamento (`interactive`: attende l'utente o marcatore; `direct`: avanza a ogni risposta).

### 3.2 Dynamic Instrument Registry e Rilassamento dei Gate
1. **Sostituzione dei set hardcoded nel Backend**:
   - `MEMORY_QUESTIONNAIRE_TYPES`, `FROZEN_SESSION_TYPES` e le route correlate devono interrogare il database o una cache in-memory degli strumenti attivi/validi (`db.query(models.Instrument.code).all()`), con fallback difensivo sul set storico.
2. **Dynamic Catalog nel Frontend**:
   - Aggiornamento di `useInstrumentCatalog` per esporre metadati completi (inclusi `tool_category`, `is_active`, `description_i18n`, `icon`, `color_theme`).
   - Refactor di `QuestionnaireSelector` e `ReturningHome`: anziché mappare solo su `QUESTIONNAIRES[id]`, fare fallback elegante sui metadati restituiti da `/api/instruments`.

### 3.3 Flusso di Creazione in Amministrazione (UI & UX)
Creazione di un nuovo flusso integrato all'interno di *Amministrazione → Configurazione → Mappa dei prompt* (oppure pulsante dedicato "Nuova Chat Guidata" in testata alla Mappa e nella scheda Strumenti):

1. **Step 1 — Metadati Base**:
   - Codice identificativo univoco (slug maiuscolo/trattino, es. `ORIENTA_TEST`).
   - Nome e titolo breve (multilingua o italiano sorgente).
   - Descrizione breve per gli utenti.
   - Categoria: "Percorso guidato / Riflessione" (`guided`) o "Questionario strutturato" (`assessment`).
   - Icona e colore.
   - Stato iniziale: Bozza (`is_active = false`).

2. **Step 2 — Counselor Assegnati**:
   - Scelta di quali counselor abilitare per questo nuovo strumento (aggiornamento di `questionnaire_types` nei relativi `models.Counselor`).
   - Possibilità di creare un counselor dedicato contestuale o assegnare il counselor di default.

3. **Step 3 — Configurazione Percorso & Step Iniziali**:
   - Generazione guidata degli step iniziali (es. template predefinito standard: `Intro` -> `Esplorazione` -> `Sintesi / Azioni`).
   - Inserimento dei prompt di sistema e delle istruzioni di ciascuno step.
   - Prompt di sistema per la fase domande e messaggi di conclusione (scritti automaticamente in `configs` con prefisso dedicato).

4. **Step 4 — Collaudo in Sandbox / Anteprima Admin**:
   - Possibilità per l'amministratore di simulare la chat guidata direttamente dal pannello admin (o tramite anteprima interattiva su rotta protetta) prima della pubblicazione agli studenti.

5. **Step 5 — Pubblicazione (`is_active = true`)**:
   - Convalida finale: almeno 1 step esistente, prompt configurati, almeno 1 counselor abilitato.
   - Switch a stato attivo: lo strumento diventa immediatamente visibile nel catalogo studenti.

---

## 4. Suddivisione in Fette Verticali Atomiche (Issue)

Per consentire ai costruttori (C1, C2, C3...) di procedere in modo incrementale senza rompere l'ambiente di produzione o i test smoke, il lavoro è suddiviso nelle seguenti fette verticali:

### Issue 1: Schema DB & Dynamic Instrument Registry (Backend)
- **Obiettivo**: Rendere il backend agnostico rispetto alla lista hardcoded di strumenti, estendendo il modello `Instrument`.
- **Modifiche principali**:
  - Migrazione / colonne in `models.Instrument`: `is_active`, `tool_category`, `description_i18n`, `target_audience`, `icon`, `color_theme`, `interview_mode`.
  - Aggiornamento `schemas.py`: estendere `InstrumentCreate`, `InstrumentUpdate`, `InstrumentResponse`.
  - Dinamizzazione dei controlli di validazione (`FROZEN_SESSION_TYPES`, `MEMORY_QUESTIONNAIRE_TYPES`, `ChatRequest.questionnaire_type`) con verifica su tabella `instruments`.
  - Endpoint `GET /api/instruments`: ritorno dei nuovi campi e filtro per stato attivo/bozza in base al ruolo (solo admin vede le bozze).
- **Definition of Done (DoD)**:
  - Test unitari in `backend/tests/test_dynamic_instruments.py` per creazione, aggiornamento e validazione dinamica dei tipi di sessione.
  - Tutti gli smoke test esistenti (`test_smoke.py`) passano senza regressioni.

### Issue 2: Supporto Runtime Chat & Prompt Map Dinamica (Backend)
- **Obiettivo**: Permettere a `chat_logic.py` e `prompt_map.py` di orchestrare e visualizzare qualsiasi strumento registrato dinamicamente nel DB.
- **Modifiche principali**:
  - `prompt_map.py`: `ordered_instruments` include dinamicamente tutti gli strumenti definiti in `instruments` anche se con 0 step.
  - Risoluzione prompt di sistema: supporto a chiavi di default dinamiche per strumenti non cablati in `prompt_config.py` (pattern convenzionale `prompt_<CODE>_meta`, `prompt_<CODE>_intro`, ecc.).
  - Gestione sicura in `_ensure_questionnaire_guided_steps`: non tentare il seed da costanti hardcoded per strumenti dinamici; non sollevare eccezioni.
- **Definition of Done (DoD)**:
  - Test backend che crea uno strumento dinamico con 2 step e verifica che `GET /admin/prompt-map?instrument=NUOVO` restituisca la mappa completa e modificabile.
  - Test di esecuzione di un turno di chat per il nuovo strumento via `chat_preparation.prepare_chat_turn` o endpoint `/api/chat`.

### Issue 3: Wizard di Creazione Strumento in Amministrazione (Frontend Admin)
- **Obiettivo**: Fornire all'amministratore un'interfaccia intuitiva per creare un nuovo strumento da zero con template iniziale di step.
- **Modifiche principali**:
  - Aggiunta pulsante "+ Nuovo Strumento" / "+ Nuova Chat Guidata" in `PromptMap.tsx` e `QuestionnaireEditor.tsx`.
  - Modale / Wizard `CreateInstrumentDialog`:
    - Raccolta codice, titolo, descrizione multilingua, categoria e colore.
    - Selezione template step (es. "Percorso riflessivo a 3 passi" o "Vuoto").
    - Associazione rapida counselor abilitati.
  - Chiamata a `POST /admin/instruments`, creazione automatica degli step via `POST /admin/guided-steps` e salvataggio prompt iniziali con `prompt_revisions`.
  - Reindirizzamento immediato alla Mappa dei Prompt focalizzata sul nuovo strumento.
- **Definition of Done (DoD)**:
  - Componente admin localizzato in tutte le 6 lingue (`it`, `en`, `es`, `fr`, `de`, `sv`).
  - Test browser con fixture (`admin-prompt-map.test.mjs`) che simula la creazione completa e verifica l'aggiornamento dell'albero.

### Issue 4: Dynamic Tool Catalog & Accesso Studente (Frontend)
- **Obiettivo**: Consentire agli studenti (e ai docenti) di visualizzare e avviare il nuovo strumento quando marcato come attivo, senza modifiche al codice frontend.
- **Modifiche principali**:
  - `frontend/src/lib/use-instrument-catalog.ts` e `frontend/src/lib/tool-catalog.ts`: supporto a elementi dinamici provenienti da API.
  - `QuestionnaireSelector.tsx` e `ReturningHome.tsx`: visualizzazione delle card per strumenti dinamici attivi (leggendo nome, descrizione, icona e colore dai dati API).
  - `InstrumentDetailsPage` (`/strumenti/[id]`): risoluzione dinamica dello strumento se non presente nell'oggetto statico `QUESTIONNAIRES`.
  - Avvio chat guidata (`GuidedChatInterface`) con passaggio del `questionnaireType` dinamico.
- **Definition of Done (DoD)**:
  - Se uno strumento è `is_active=false`, non compare nel catalogo studente.
  - Se uno strumento è `is_active=true`, compare nella categoria corretta, è cliccabile e avvia la chat guidata.
  - Test unitari e di compatibilità rendering passati.

### Issue 5: Anteprima / Sandbox di Collaudo per Admin
- **Obiettivo**: Permettere agli admin di collaudare la nuova chat guidata in bozza (`is_active=false`) prima del rilascio.
- **Modifiche principali**:
  - Pulsante "Collauda chat" nella barra della Mappa dei Prompt per lo strumento visualizzato.
  - Modalità preview sicura o rotta protetta (`/admin/preview-chat?instrument=<CODE>`) che avvia una sessione effimera senza inquinare le statistiche generali o i risultati di ricerca.
- **Definition of Done (DoD)**:
  - L'amministratore può testare l'avanzamento tra i passaggi e le risposte del counselor configurato prima di attivare lo strumento.

---

## 5. Ordine Consigliato di Implementazione per i Costruttori

1. **C1 (Backend Core & Dynamic Registry)**: Implementa **Issue 1** e **Issue 2**. Rilascia il supporto completo lato API e modelli affinché il backend possa accettare e gestire qualsiasi strumento dinamico senza vincoli hardcoded.
2. **C2 (Admin Wizard UI)**: Implementa **Issue 3**. Realizza il form/wizard di creazione in amministrazione integrato con la Mappa dei prompt.
3. **C3 (Student Flow & Dynamic Catalog)**: Implementa **Issue 4**. Collega il frontend studente e il catalogo pubblico ai dati dinamici del backend.
4. **C4 (Admin Sandbox Preview & Rifinitura)**: Implementa **Issue 5**, aggiorna la documentazione utente/docente (`docs-counselorbot/funzionalita-counselorbot.md`), aggiorna manifest (`make guidance-refresh`) e chiude l'integrazione end-to-end.

---

## 6. Rischi, Mitigazioni e Backward Compatibility

- **Rischio Regressioni su Strumenti Esistenti (QSA, QSAr, ecc.)**:
  - *Mitigazione*: Tutti i fallback devono mantenere priorità sulle costanti note. Se uno strumento è presente sia nel codice che nel DB, i comportamenti specifici storici (es. reverse scoring QSA, mappa Idea) continuano a essere gestiti dai moduli dedicati.
- **Rischio Prestazioni Database per Validazione Tipi**:
  - *Mitigazione*: Per non interrogare il DB a ogni singolo messaggio di chat per verificare se `questionnaire_type` esiste, implementare una semplice cache in memoria con TTL breve (o invalidazione su create/update instrument).
- **Sicurezza e Isolamento**:
  - Nessuno strumento creato da zero può accedere a file di sistema o eseguire codice; i prompt rimangono confinati nel contesto conversazionale dell'LLM.
