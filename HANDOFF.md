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

---

## S2 — salvataggio metodo → azione (2026-10-02)

Agente sostituto: `s2-method-action-yolo-1002`; worktree
`/home/nugh75/counselorbot-sbs-worktrees/s2-method-action-1002`, branch
`fix/method-action-save-deadlock`, base `4a5435e1d289ccaa014f859a8f1a3267bec2a102`.
Task: `0d0cd211-b467-4365-b8ad-747017adc8d7`.

### Correzione e perimetro

Con il metodo modificato, «Metti in pratica» preparava un'azione mentre il
salvataggio dell'obiettivo era bloccato dalla bozza dell'azione e quello
dell'azione dalle modifiche all'obiettivo. Ora il pulsante attende il salvataggio
esplicito, con istruzione accessibile nelle sei lingue; poi apre il modulo
precompilato e porta il focus al titolo. Solo la conferma crea l'azione collegata.
Le altre bozze e i salvataggi in corso restano protetti; un riferimento sincrono
impedisce due invii prima dell'aggiornamento dello stato React.

File: `GoalDialog.tsx`, `MethodPicker.tsx`, testi `i18n-goals.ts`/`i18n.ts`,
suite `frontend/tests/goal-method-action.test.mjs`, script
`scripts/dev-method-action-tests.sh`, funzionalità e documentazione operativa,
manifest della guida. Nessun redesign, modifica backend o intervento sui task
separati bozze/errori. Deroga esplicita dell'utente alla revisione cross-modello:
nessun revisore o sub-agente; mantenuti test tecnici e controllo dei diff.

### Verifiche e prove prima/dopo

- Prima del fix: la suite riproduceva `goal save disabled = true ; action save
  disabled = true`, seguita dall'assert fallita. Dopo: 10/10 test browser verdi,
  riconfermati dal sostituto con `cd frontend && node --test
  --experimental-strip-types tests/goal-method-action.test.mjs`.
- Copertura: sei lingue a 390 px, metodo modificato, nuovo obiettivo, apertura,
  modifica e conferma dell'azione, legame e revisione API, annullamento uscita,
  errori/retry, idempotency key, invii duplicati e altra bozza. Anche testo guida,
  immagini della sezione interessata e assenza di overflow nelle sei lingue.
- ESLint mirato sui quattro sorgenti modificati e sulla suite, controllo i18n
  (2863 chiavi × sei lingue), TypeScript `tsc --noEmit`, `git diff --check` e
  `make guidance-check`: verdi. Log precedente `npm test`: 42 file di libreria
  superati, nessun fallimento; conservato in `/tmp/s2-frontend-tests.log`.
- Lint globale fuori perimetro: 17 diagnostici (1 errore, 16 warning), identici
  dopo normalizzazione dei percorsi in `/tmp/s2-current-lint.json` e
  `/tmp/s2-baseline-lint.json`. Errore: `NewDeckDialog.tsx:36`,
  `react-hooks/set-state-in-effect`. Non corretto in questo task.
- Vecchia suite `guide-audiences.test.mjs`: sei fallimenti sul ramo corrente al
  selettore pubblico, riga 32. Prova italiana 1440 px riprodotta sulla baseline
  isolata con `GUIDE_BASE_URL=http://127.0.0.1:3113 node --test
  --experimental-strip-types --test-name-pattern='1440px in it'
  tests/guide-audiences.test.mjs`: stesso timeout sul link Docente nella
  navigazione «Scegli la guida». La fixture simula un visitatore non autenticato,
  mentre il codice mostra il selettore solo ai docenti. Sorgente guida e test
  nella baseline verificati identici a HEAD; nessuna modifica a questi file.
  Confronto baseline limitato alla prova italiana, non all'intera vecchia suite.

Evidenze precedenti recuperate dalla sessione Codex
`01a0fcf1-69ff-78d0-8d12-d1105b52c8a8`: risultato finale baseline nella chiamata
`call_6okmbeJ831cCObg6jJSJbhqQ`. Nuova esecuzione della suite 10/10 conservata
in `/tmp/s2-yolo-method-action.log`.

### Docker e consegna

Build precedente riuscita (exit 0), recuperata dal log della sessione:
`docker build --tag counselorbot-sbs-s2-method-action:validation
--build-arg NEXT_PUBLIC_API_URL=/api frontend`.
Tag riconfermato con `docker image inspect`: ID
`sha256:0716e1b9c760405b27b3b70631153293833b33c69f50839ba3e18fbb30922f8d`,
creato il 2026-10-02 alle 14:20:54 UTC. Nessuna nuova build o avvio container,
nessun deploy o merge. Le fixture usano localhost:3112 e backend fittizio
`http://127.0.0.1:9`, senza database; vengono arrestate prima della consegna.

Pubblicare commit atomico e PR verso main nel Project CounselorBot; notificare
la PR e chiudere il solo task S2 dopo push e apertura verificata. Il successore
bozze `8b8119a1-e636-4422-8846-28dc40e2ac14` attende il merge dell'utente e la
conferma di tier/modello/avvio: non avviarlo. Il goal complessivo resta aperto.

## S3 — protezione bozze assegnazioni e letture (2026-10-02)

Task `8b8119a1-e636-4422-8846-28dc40e2ac14`, branch
`fix/protect-assignment-reading-drafts`, worktree
`/home/nugh75/counselorbot-sbs-worktrees/s3-draft-protection-1002`, base
`53c586859f1a047cf65a73fd34307c3faa21e901` (PR28 MERGED riverificata).
Deroga esplicita dell’utente alla revisione cross-modello: nessun altro agente
o revisore; mantenuti regressioni, verifiche tecniche e controllo dei diff.

Il dettaglio delle assegnazioni e la card delle letture venivano smontati senza
consultare lo stato della bozza. Ora gli editor comunicano modifiche e richieste
in corso ai controlli che possono sostituirli. La conferma nativa già tradotta
precede chiusura dettagli, altra scheda/hash, filtri, cambio compilazione e
ricerca che nasconde il risultato attivo. Annullare conserva testo, oggetto,
selezione e filtri. Durante un salvataggio i passaggi interni attendono la risposta;
un errore conserva la bozza. Baseline indipendenti per lavoro/restituzione,
confronto dei valori per lettura, blocco sincrono degli invii duplicati e nessun
feedback di un editor già smontato. Richiudere il risultato mantiene già montata
«La mia lettura»: questa conservazione è coperta da regressione.

Sorgenti: `AssignmentsPanel.tsx`, `AssignmentWork.tsx`, `ResultReadingCard.tsx`,
`app/profilo/page.tsx`. Nessuna modifica backend/schema, dipendenza, autosave,
condivisione implicita o redesign. Aggiornati funzionalità, guida IT/EN/ES/FR/DE/SV,
documentazione della fixture e manifest `platform-guidance-state.json`.

Prove riproducibili con `scripts/dev-draft-protection-tests.sh` (:3112 localhost,
upstream fittizio :9, tutte le API simulate, nessun database):

- Prima del fix, chiusura dettagli e cambio compilazione fallivano entrambi
  con `0 !== 1` sulla conferma mancante. Log locali in `.tmp/s3/assignment-red.log`
  e `.tmp/s3/reading-red.log`; non sono artefatti versionati.
- `cd frontend && node --test --experimental-strip-types
  tests/draft-protection.test.mjs tests/goal-method-action.test.mjs`: 34/34 verdi,
  di cui 24 protezioni bozze e 10 regressioni PR28. Le 24 prove sono state
  riconfermate dopo l’ultima modifica. Fixture anonime verificano anche i corpi
  API: bozza A mai inviata a B, errori, ripristino, attesa e invii duplicati,
  link/beforeunload, tastiera e screenshot della guida nelle sei lingue/mobile.
- `npm test`: 236/236; `npx tsc --noEmit`, ESLint mirato, `npm run i18n:check`,
  `make guidance-refresh`, `make guidance-check` e `git diff --check`: verdi.
  Non rieseguito lint globale né la vecchia guide-audiences: baseline e relativo
  limite sono documentati nel blocco S2. Nuova suite guida mirata interamente verde.
- Docker: sola immagine frontend `counselorbot-sbs-s3-draft-protection:validation`,
  `docker build --tag counselorbot-sbs-s3-draft-protection:validation
  --build-arg NEXT_PUBLIC_API_URL=/api frontend`; nessun avvio container/deploy.
  La build esegue `npm run build` sul sorgente finale.
  Build finale exit 0, immagine
  `sha256:cf00932b32873e573b8754193fee191dc02851b6b9d025b4c603ee1d3665a28d`.

Checkout principale allineato con il solo `git pull --ff-only`, da `4a5435e` a
`53c5868`; `.gitignore` modificato e handoff docente non tracciato conservati
con stato e SHA-256 identici prima/dopo. Nessun edit/commit nel principale.
La fixture viene arrestata prima della consegna. I test non certificano backend,
SSO reale o dispositivi fisici. Dopo push/PR, chiudere il solo task S3; il goal
resta aperto. Successore errori/vuoti `52d583fa-ce96-426c-9956-4328c86a9b38`:
avvio/tier/modello da confermare dopo merge, non lanciare.
## S4 — errori di caricamento docente (2 ottobre 2026)

Task `52d583fa-ce96-426c-9956-4328c86a9b38`, goal
`2ab67a9c-3e74-4ffa-ae45-622b99b1db1a`; worktree
`/home/nugh75/counselorbot-sbs-worktrees/s4-loading-errors-1002`, branch
`fix/teacher-loading-error-states`, base `e1e2b0d` (PR29). Solo
codex/gpt-6.1-sol high: deroga cross-modello esplicita registrata nel diario,
nessun altro agente. Dettagli riproducibili: `docs/operations/teacher-loading-errors.md`.

GroupsPanel, TeacherNotebook e DocenzaClassBar distinguono caricamento, vuoto
valido ed errore. Riprova è esplicito/localizzato; il refresh conserva bozze e
selezione. Salva taccuino e creazione gruppi sono bloccati prima della lettura
riuscita; il composer resta disponibile. Campi classe mai modificati si
aggiornano dal server, bozze modificate restano intatte anche dopo retry riuscito.
Abort e controllo scope scartano risposte tardive; 401/403 seguono il guard.
Nessun cambio backend/schema/dipendenze o alla semantica notebook/default.

Verifiche finali:

- Rosso→verde su tutte e tre le superfici (HTTP503 / rete); 57/57 test browser
  S4 sulla build standalone locale: errori/retry, loading/vuoto valido,
  refresh/bozze/salvataggio, invio unico, unmount/account/ruolo/anteprima,
  sei lingue, tastiera, overflow e guida con immagini ingrandibili.
- PR28/29: draft-protection + goal-method-action 34/34; teacher-catalogs 7/7;
  teacher-area-home smoke verde. `npm test`: 236/236.
- TypeScript, ESLint mirato, i18n (2863 chiavi), build locale e Docker verdi;
  documento funzionale/guida aggiornati; 12 screenshot ricatturati, ispezione
  diretta Area docenti IT e classi EN; guidance-refresh/check e diff check.
- Docker solo validazione: `counselorbot-sbs-s4-loading-errors:validation`,
  image ID `sha256:1e5373d7456124c70977f32e9904a8be42df5cf2e0de64ebbff77cc0b4e79a66`.
  Nessun container avviato, nessun deploy/restart/sudo. Warning ENV Docker legacy
  preesistenti. Backend/DB/SSO reale e release produzione non verificati.
- Baseline note NewDeckDialog (lint globale) e guide-audiences pubblico:
  non rieseguite né modificate. I controlli pertinenti sono verdi. Le prove
  tardive del taccuino sospendono la navigazione in dev con lettura trattenuta;
  sono verdi sulla build compilata. L'anteprima è testata con cambio scope dopo
  il mount; non sono state modificate identità, guard o banner globali.

Main checkout allineato solo con `git pull --ff-only` a `e1e2b0d`;
hash .gitignore `e440397c568fadda1b1d0098779eefd13665da099a26279a875b1ebaadc1e024`
e handoff estraneo `bf3845abf29b27821d49829c80c7eb4f4cd5d9b966aad43205820796f349e824`
identici prima/dopo. Nessun edit/stash/commit nel main checkout.
Fixture dev/standalone su `127.0.0.1:3124`, upstream fittizio `127.0.0.1:9`;
arresto con Ctrl+C prima della consegna, nessun backend o database usato.
Consegna tramite commit/push e PR; chiusura task solo dopo la PR,
goal complessivo lasciato al Timoniere in attesa del merge utente.

## S14 — popup Classi dal taccuino, consegna unica con S13 (2026-10-02)

Worktree esclusivo `s14-class-popup-1002`, branch
`feature/teacher-notebook-class-picker`, stack autorizzato dal commit S13
`d1f3599c141a39573ca8b932e22b5e35dffc65b8` (ancestry, HEAD iniziale e remoto
verificati). Approvazione ASCII di pagina e popup «ok», comportamento
«Conserva il salvataggio attuale», confermati nella consegna S13 esterna.
Un solo agente, nessun revisore o modello aggiunto.

Il rimando Classi apre `ClassGroupPicker` con selezione inizialmente vuota,
editor/PUT S13 riusati, guard di bozza e salvataggio per cambio/chiusura,
focus trap/restore, stati lettura/retry/vuoto/403. Fascia e istituto mantengono
il PUT immediato; Salva e scarto riguardano solo il contesto classe.
Il taccuino resta montato e la bozza privata sopravvive. Nessun cambio di
API, permessi, DB, notebook_context, envelope, sessione/chat, limiti 600/1.200,
ordine/campi/consenso/default A/C o protezioni B/S4. Gli altri tre rimandi
continuano a navigare e la pagina Classi resta nella normale navigazione.
Guide/screenshot del popup nelle sei lingue, documento piattaforma e manifest
allineati. Test e prove combinati, inclusi limiti baseline, in
`docs/operations/teacher-class-management-validation.md`.

Frontend-only su `127.0.0.1:3134`, fixture anonime in memoria, upstream
irraggiungibile `127.0.0.1:9`, traffico esterno bloccato. Baseline S13 copiata
in `/tmp/s14-parent-app` su :3136, senza modificare altri worktree.
Avvio/stop/tunnel in `docs/operations/live-dev-environment.md`; processi propri
arrestati prima della pubblicazione. Immagine frontend di sola validazione:
`counselorbot-frontend:s14-class-popup-1002-validation`; nessun container
avviato, backend/SSO/DB produzione, sudo, merge, deploy o blocco D.

Task `3dc47b92-09aa-4eb9-9ffa-1013b8f750fc`: chiudere solo dopo verifiche,
commit atomico S14, push e PR unica contro main con entrambi gli interventi.
Goal `de3eed06-878a-41c5-8b83-63993f8a35cf` aperto fino al merge dell’utente.

Validazione finale S14: 189/189 browser/smoke compilati (54 popup, 34 Classi,
57 S4, 18 copy A/C, 25 rimandi B, smoke home), 236/236 unitari, TypeScript,
i18n, ESLint mirato, build, guidance e diff riusciti. Lint globale identico
a S13: 1 errore NewDeckDialog + 16 warning; guide-audiences 0/6, stessi vecchi
link sulla base e sulla candidata. Immagine finale
`sha256:ff2ff32e3a441e297986b7e21db80885ae7e20e20c385d98c506b64ce2645cf9`,
138634848 byte, nessun container avviato. Una sola guard di navigazione nel
taccuino riceve i segnali dirty/busy dal popup: evita conferme spurie sulla
bozza privata nel browser legacy, con test rosso prima e verde dopo.
