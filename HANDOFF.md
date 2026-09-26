# Handoff: Scelta del taccuino nel contesto chat (docente)
Data: 2026-09-27 | Stato: IMPLEMENTATO (backend, frontend, test, doc — in attesa di PR/merge)

## Objective
Il docente (chi ha sia ruoli sia solo docenza) sceglie quale taccuino passa
al contesto della chat guidata — studente, docente o nessuno — per OGNI
strumento, non solo per OBIETTIVO_DOCENZA. La scelta vive nel popover
«Opzioni» della chat (dove si sceglie lunghezza risposta, formato, ecc.).
Il comportamento di oggi (docenza → taccuino docente, tutto il resto →
taccuino studente) resta il DEFAULT, non un hard-code.

## Progress
- [x] Analisi del codice esistente (vedi Resolutions)
- [x] Progetto concordato con l'utente (vedi Decision Log)
- [x] Implementazione backend: campo + envelope
- [x] Implementazione frontend: selettore nel popover Opzioni
- [x] Persistenza scelta (localStorage + frozen session)
- [x] Test backend e frontend
- [x] Doc: CONTEXT.md (taccuino del docente / envelope) +
      docs-counselorbot/funzionalita-counselorbot.md + Make guidance-refresh/check

## Design concordato

### Backend
1. `backend/api_models.py` — `ChatRequest.notebook_context:
   Optional[Literal["student", "teacher", "none"]] = None` (schema di
   `response_length`).
2. `backend/chat_logic.py` `build_context_envelope` (~riga 2790, cerca
   `is_docenza_chat`): sostituire `is_docenza_chat = questionnaire_type ==
   "OBIETTIVO_DOCENZA"` con una scelta richiesta + fallback:
   - `DEFAULT_NOTEBOOK_CONTEXT = {"OBIETTIVO_DOCENZA": "teacher"}`
     (nel dizionario definire anche il default "student" per tutto il resto)
   - il valore della richiesta vale SOLO se l'utente ha davvero il ruolo
     docente (stesso guard del taccuino docente: plan managers — vedere come
     `routes/teacher_profile.py` gated; riverificarlo lato server, mai fidarsi
     del client), altrimenti il default.
   - `teacher` → lo slot `[PROFILE]` prende `teacher_notebook_context` (+
     `teacher_groups_context`, che comunque è vuoto per strumenti senza
     `group_ids`, e `group_ids` resta inviato solo dalla chat docenza);
   - `student` → taccuino/lettura/obiettivi/portfolio dello studente (comportamento attuale);
   - `none` → blocco `[PROFILE]` svuotato di taccuino (il resto delle
     sezioni dell'envelope continua: history, knowledge, skills…).
   Attenzione alla condizione `not is_docenza_chat` che oggi protegge anche
   reading_context e class_context_for_student: riscriverla sulla scelta
   effettiva (`notebook_context != "student"`), non sul tipo strumento.
3. OBIETTIVO_STUDIO resta default student; EVENTO_*/IDEA idem: è il docente a
   decidere se fare il cambio.

### Frontend (`frontend/src/components/qsa/GuidedChatInterface.tsx`)
4. Nel popover `renderConversationOptions` (cerca `ResponseLengthSelector`):
   una riga con un selettore a 3 opzioni "Taccuino nel contesto":
   Studente / Docente / Nessuno. Mostrato SOLO se l'utente ha il ruolo
   docente (guard di `useTeacherAccessState`/`isTeacher`; i dati accesso
   devono già arrivare alla pagina che monta la chat — verificare; altrimenti
   `GET /user/teacher-notebook` errore = non docente). Disabilitato mentre
   la chat è in flight (`isLoading`).
5. Stato `notebookContext` inizializzato da localStorage
   `cb-notebook-context` (helper analogo a `readStoredDocenzaGroupIds`
   in `DocenzaClassBar.tsx`); valori ammessi: student|teacher|none.
6. Includerlo nel payload di OGNI turno accanto a `group_ids` (4 punti
   `chatPayload`-like: ~964, ~1010, ~1033, ~1228 + frozen resume ~1342).
7. `frontend/src/lib/frozen-session.ts`: aggiungere `notebook_context`
   all'autoFreezeSignature e al restore (schema di `response_length`).
8. Hint di `DocenzaClassBar` ("insieme al tuo taccuino del docente")
   adattarlo alla scelta.

### Test
9. `backend/tests/test_teacher_context.py` (o nuovo
   `test_notebook_context.py`): (a) default invariato per 13 strumenti,
   (b) richiesta `teacher` onorata SOLO per utenti docente, (c) `none`
   = blocco profilo vuoto ma envelope valido, (d) classi mai fuori da DOCENZA.
10. Frontend: test esistenti pattern (es. `npm run test:account`,
    `frontend/tests/*.test.mjs`) per il selettore solo-docente e payload
    coerente + frozen resume.

## Problems Encountered
- Uno studente puro non vede il campo: il selettore non deve apparire.
  La verifica "chi è docente" lato server è il punto delicato: individuare
  la funzione guard già esistente (cercare `canUseTeacherAssistant` e i
  guard di `routes/teacher_profile.py` / `teacher_access`).
- `frontend/tests/personal-error-states.test.mjs` e altri toccano già il
  popover: verificare di non romperli.

## Resolutions
- Dove sta la regola oggi: `build_context_envelope` in `backend/chat_logic.py`
  (~2790-2870) — cerca `is_docenza_chat`. Lo swap taccuino-docente avviene
  nello slot `[PROFILE]` (sostituzione totale di profile/portfolio/goals,
  niente punteggi, niente lettura; `[CONTESTO CLASSE]` resta per lo studente).
- Sorgenti contesto: `backend/teacher_context.py`
  (teacher_notebook_context, teacher_groups_context,
  class_context_for_student), specchio di `backend/student_context.py`.
- Popover opzioni: `GuidedChatInterface.tsx` → `renderConversationOptions`
  (~1545), la riga risposta ha `ResponseLengthSelector`.
- `ChatRequest` in `backend/api_models.py` (riga ~8); `group_ids` già
  presente con la stessa semantica "ignorato per strumenti altri / persone.non-docenti".

## Decision Log
- Scelta utente: il docente sceglie il taccuino per strumento dal popover
  Opzioni (dove già sceglie lunghezza/formato) — più pulito di una mappa hard-coded.
- Default invariato per non rompere l'esperienza esistente (docenza =
  taccuino docente, il resto = taccuino studente).
- Un solo enum a scelta singola (student|teacher|none), mai entrambi i
  taccuini insieme: slot [PROFILE] unico, rischio di mescolamento zero.
- Verifica ruolo docente per OGNI turno lato server (come `group_ids`):
  un errore o un role-change esce dal contesto senza rifare nulla.
- La scelta vive per-BROWSER (localStorage + frozen session) come
  `group_ids`, non sul server: nessuna migrazione DB.
- Domande aperte della discussione precedente RISOLTE: EVENTO_PROFESSIONALE,
  IDEA, OBIETTIVO_STUDIO non hanno regole speciali: default invariato, il
  docente può cambiare contesto a mano quando vuole.
- Mappatura strumenti a contesto docente: niente whitelist raffinata per
  strumento; una sola chiave per strumento nel dict DEFAULT (solo
  OBIETTIVO_DOCENZA: 'teacher'), e per i docenti il campo della richiesta
  ha la precedenza.

## Prossima sessione
IMPLEMENTAZIONE COMPLETATA (branch feature/notebook-context-choice, PR da
revisionare). Mappa dell'implementazione reale:
- Backend: `DEFAULT_NOTEBOOK_CONTEXT` in `chat_logic.py` (top, dopo logger);
  risoluzione in `build_context_envelope` (cercare `notebook_mode`);
  `ChatRequest.notebook_context` in `api_models.py`; frozen session in
  `schemas.py` (FrozenSessionCreate/Detail + validator) e
  `routes/frozen_sessions.py`; test in `backend/tests/test_notebook_context.py`.
- Frontend: `NotebookContextSelector.tsx` + `lib/notebook-context.ts`
  (storage `cb-notebook-context`, default = non inviare il campo);
  `GuidedChatInterface.tsx` (stato `notebookContext`, `isTeacherUser` via
  getIdentity/isTeacher, 4 payload, snapshot + restore + firma autosalvataggio,
  riga nel popover visibile solo ai docenti); `auto-freeze.ts` (signature);
  `frozen-session.ts` (tipi); i18n `notebookContext.*` (6 lingue);
  `DocenzaClassBar` hint adattato alla scelta. Test unitario in
  `lib/notebook-context.test.ts` (npm run test, 236 pass).
- Verifiche fatte: pytest notebook/teacher context 11 pass (venv host, DB
  counselorbot_test su :5435); test_smoke confrontato con baseline via stash
  (stessi fallimenti preesistenti, nessuno nuovo); tsc --noEmit pulito; lint =
  baseline (1 errore preesistente NewDeckDialog); npm run build OK; guidance
  refresh/check allineati. NOTA: il container di produzione ha il codice
  dentro l'immagine (no mount /app/backend): i test in-container richiedono
  rebuild; il deploy richiede `docker compose up -d --build`.
Leggere `docs/operations/chat-format-essential-qsa.md` solo se serve per
l'ordine del turno. Lavorare su branch feature/... (mai su main).
