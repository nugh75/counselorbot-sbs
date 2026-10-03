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

## QSA — anteprima e allineamento dei prompt di fabbrica (2026-10-03)

Ramo `feature/questionnaire-prompt-preview`. L’utente ha autorizzato
l’allineamento alla `Guida_Costruzione_Prompt_QSA_CounselorBot.docx` e ha
confermato che i prompt devono rimanere in inglese. Il documento caricato ha
testo identico alla guida già versionata. Nessun altro agente impiegato.

I dieci step QSA e i blocchi di sistema/pedagogici seguono il documento;
conservati il veto di nuove strategie nella sintesi e la composizione delle
direttive condivise. La matrice dei componenti QSA alimenta runtime ed editor;
un consiglio esplicito nei follow-up ammessi può attivare una strategia, salvo
override amministrativi. L’anteprima senza bozze usa le regole effettive del
turno. Lingua della risposta e interfaccia mantengono IT/EN/ES/FR/DE/SV.

Risolta la causa della presentazione Savickas tra gli step QSA: le tre
presentazioni QSAr/ZTPI/Savickas mancavano di `questionnaire_type`. I default
lo dichiarano ora esplicitamente; l’avvio riclassifica soltanto i tre ID noti
erroneamente assegnati a QSA, conservando tutti gli altri campi.

I testi di un DB esistente non vengono riscritti all’avvio. Il comando
`backend.qsa_factory_alignment` prepara un piano per gli esatti default
precedenti riconosciuti tramite hash, preservando personalizzazioni e revisioni
admin. `backend.prompt_updates` applica/annulla atomicamente con controllo
degli hash. Procedura e comandi Codespaces in
`docs/operations/qsa-factory-alignment.md`.

Verifiche: 95 test backend mirati e 206 smoke, 236 unitari frontend, TypeScript,
ESLint mirato (un warning preesistente), i18n (2863 chiavi × sei lingue),
anteprima browser a 1440/390 px per tutti gli undici pannelli e le sei lingue,
guidance-refresh/check e diff check. Il test legge direttamente la guida DOCX
indipendente e simula dieci step in sei lingue senza chiamate LLM.

Nella sola copia cloud di sviluppo: applicati 17 aggiornamenti dei vecchi testi
di fabbrica; il secondo piano è vuoto. QSA ha dieci step con `intro` iniziale,
QSAr nove, ZTPI sette, Savickas otto, ciascuno con la propria presentazione.
Nessun intervento sul Codespace dell’utente o sulla produzione; nessun merge,
deploy, chiave LLM o aggiornamento di altri prompt.

Dev nativo ancora attivo su localhost:3107 (frontend), :8002 (backend), DB
dedicato su :5435. Avvio locale tramite `.cloud-counselorbot/start-backend.sh`
e `scripts/dev-frontend.sh`; arresto con Ctrl+C nei terminali di avvio. Nel
Codespace si usa il precedente `start.sh`, porta privata 3107; fare pull e
applicare il piano al DB di sviluppo prima del nuovo avvio.

Docker di sola validazione: backend ricostruito come
`counselorbot-qsa-alignment:dev`, import dei nuovi prompt e del comando riusciti.
Per il proxy cloud è stato necessario montare il trust bundle del sistema solo
nella fase pip, usando un Dockerfile temporaneo esterno al repository; TLS
rimane verificato e i Dockerfile versionati sono invariati. La build frontend
è stata tentata ma i download npm falliscono con `ENOTFOUND` e `npm ci`
termina con «Exit handler never called», lasciando Next non installato;
nessuna immagine frontend finale prodotta. Nessun
container di produzione ricostruito, avviato o riavviato.

## Pulsante comune di allineamento dei prompt (2026-10-03)

L’utente ha approvato il pulsante e precisato che deve coprire tutte le chat.
Implementato sopra le schede di `ConfigForm`, con anteprima di sola lettura,
confronto prima/dopo, elenco dei testi conservati e conferma esplicita.
Interfaccia IT/EN/ES/FR/DE/SV, testi del modello in inglese. Nessun agente
delegato. Continua il ramo `feature/questionnaire-prompt-preview`, PR #38.

`backend.prompt_factory_alignment` ricava dai registri 93 istruzioni di config
e 101 step in dodici percorsi, inclusi assistenti, contesti e direttive.
Aggiorna solo vecchi testi riconosciuti tramite hash o storico seed/migration;
personalizzazioni e proprietà admin prevalgono. Esclusi varianti linguistiche,
testi UI, impostazioni operative, persone dei counselor e step personalizzati.
La classificazione errata di uno step impedisce di riscriverne il prompt.

Il POST accetta solo il digest del piano rivisto, lo ricostruisce con lock e
applica atomicamente con storico. Un conflitto restituisce 409; il browser
richiede una nuova anteprima, blocca i doppi click e sincronizza gli editor.
I salvataggi e ripristini admin acquisiscono gli stessi lock anche quando
il testo è identico. Quattro prove concorrenti fallivano prima della correzione
e ora verificano il blocco effettivo su connessioni PostgreSQL separate.
Bozze e salvataggi pendenti impediscono l’allineamento. CRUD e riordino
aggiornano la baseline salvata senza nascondere bozze ancora aperte.

Le revisioni di questa operazione hanno origine migration, così restano
aggiornabili da future versioni di fabbrica. Un salvataggio admin identico al
testo seed acquisisce la proprietà admin una sola volta. La CLI precedente
mantiene il proprio comportamento; nessuna riscrittura automatica all’avvio.
Procedura: `docs/operations/prompt-factory-alignment.md`.

Verifiche: 55 backend mirati, 206 smoke, 236 unitari frontend, otto nuove prove
browser e due regressioni delle anteprime desktop/mobile riusciti. TypeScript,
i18n (2884 chiavi × sei lingue), ESLint mirato (solo un warning preesistente),
guidance-refresh/check e diff check. Schemi PostgreSQL di test isolati; nessun
LLM chiamato. Anteprima autenticata sul dev: HTTP200, zero aggiornamenti
necessari e storico invariato; accesso anonimo HTTP401.

Backend Docker ricostruito con il trust bundle cloud temporaneo, TLS verificato:
`counselorbot-prompt-factory-alignment:validation`, immagine
`sha256:3cde72012b693b5856418b2e7218c3923cc1d0b33b296b468bd5172b58bcf63a`.
Import del catalogo 93/101 riuscito in container effimero senza rete. Frontend
Docker tentato, bloccato dall’errore npm/DNS dell’ambiente che lascia Next
non installato; controlli e browser nativi riusciti. Dockerfile versionati
invariati. Dev ancora su :3107/:8002, PostgreSQL dedicato su :5435; avvio e
arresto come nella sezione precedente. Per Codespaces: aggiornare il ramo
(oppure main dopo il merge dell’utente), riavviare frontend/backend e usare
Amministrazione → Allinea prompt di fabbrica. Nessun aggiornamento del DB
del Codespace o di produzione, nessun merge o deploy in questa sessione.


## Abbonamento personale ChatGPT (2026-10-03)

Implementazione autorizzata dall'utente dopo il piano; priorita' alle chat dentro
CounselorBot. Ramo `feature/chatgpt-subscription`, derivato da main aggiornato e
aggiornato poi con fast-forward al merge della PR #38 (`1cac9b6b`), verificata
MERGED su GitHub prima della pubblicazione.
Nessun agente delegato, nessun merge/deploy e nessun account OpenAI reale usato.

Flusso SIWC ufficiale verificato sui documenti OpenAI attuali: callback OAuth
sul computer della persona tramite helper Python standard scaricabile, pairing
monouso con hash e scadenza, PKCE/state/nonce, verifica dei JWT RS256 con JWKS
fisso. Il client ID pubblico emesso viene conservato prima dello scambio del
codice; un grant non verificato non abilita inferenza. Token Fernet nel DB,
mai risposte/log/browser storage. Rinnovo serializzato con lock PostgreSQL e
sessione separata; rispetto di earliest_refresh_at e token rotanti. Revoca
remota tentata e cancellazione locale garantita, avviso se revoca non confermata.

Area personale e indicatore nelle chat in IT/EN/ES/FR/DE/SV; catalogo disponibile
per account, scelta esplicita del modello e attivazione. Connessione da sola non
consente inferenza. Provider `openai_chatgpt` via Responses con istruzioni,
cronologia, store:false e streaming completato solo all'evento finale. La scelta
personale prevale sui preset e non ripiega su API a pagamento. Quote/errori
localizzati, nessun prezzo API inventato. Identita' autenticata propagata alle
chiamate personali, account demo/view-as esclusi; OCR ed embeddings restano
servizi dell'installazione. OpenCode bloccato con scelta personale attiva.
Anteprima prompt mostra il trasporto senza token e prima del filtro PII.

Funzione spenta per default. Procedura, chiave persistente, helper/tunnel,
backup, limitazioni e fonti in `docs/operations/chatgpt-subscription.md`.
L'anteprima SIWC per strumenti OSS locali/VM personali non autorizza
automaticamente un server scolastico condiviso o piani Edu/Business. Verificare
il percorso OpenAI dell'installazione; questo codice non implementa il profilo
partner ospitato. Nel repo manca LICENSE: il proprietario deve sceglierla prima
della distribuzione OSS. Accesso, catalogo, inferenza, refresh e revoca con account
reale sono una verifica manuale ancora necessaria; nessuna chiamata a pagamento.

Verifiche: 41 test finali dell'integrazione passati dopo le ultime modifiche;
precedentemente 112 backend mirati (integrazione/routing/PII) e 206 smoke,
236 unitari frontend, 12 prove browser ChatGPT in sei lingue a 390/1440 px e
10 regressioni browser delle anteprime/allineamento prompt. TypeScript,
i18n (2927 chiavi per sei lingue), ESLint mirato riusciti. Il lint globale
resta bloccato dall'errore preesistente setState in effect in
`frontend/src/components/visual/NewDeckDialog.tsx:36` e warning preesistenti.
Nessun LLM reale chiamato, database/schemi di test dedicati.

Docker: build backend e frontend tentate senza avviare produzione. Backend
completo bloccato dall'accesso apt alla rete cloud; frontend da npm/DNS
ENOTFOUND che lascia Next non installato. Anche build backend incrementale
interrotta per spazio insufficiente: nessuna nuova immagine finale prodotta.
Log `/tmp/chatgpt-docker-backend.log`, `/tmp/chatgpt-docker-frontend.log`,
`/tmp/chatgpt-docker-backend-incremental.log`. Restano da ricostruire le immagini
nel normale ambiente di deploy con rete/spazio disponibili.

Durante la validazione Docker il disco root ha esaurito lo spazio. Conservata
copia completa della venv in `/tmp/chatgpt-dev-runtime/backend-venv`; il tentativo
di spostamento non ha liberato spazio. Rimossi solo tre record di cache Docker
non condivisi/reclamabili prodotti dalle build incrementali di questa sessione,
identificati singolarmente: nessun volume, container, immagine o database
rimosso. La venv parziale originale e' conservata in
`/workspace/.cloud-counselorbot/backend-venv-partial-preserved`; backend/.venv e'
un symlink locale escluso da Git alla copia completa. Non eliminare queste copie.

Dev nativo ripristinato: frontend localhost:3107, backend localhost:8002,
PostgreSQL dedicato :5435. Avvio backend con
`/workspace/.cloud-counselorbot/start-backend.sh`, frontend con
`cd frontend && npm run dev -- --hostname 127.0.0.1 --port 3107`.
Processi lasciati attivi: backend reloader PID 24513, frontend npm PID 24514 (Next PID 24533). Arresto: `kill 24513 24533`, senza toccare
PostgreSQL o produzione. Log `/tmp/chatgpt-dev-backend.log` e
`/tmp/chatgpt-dev-frontend.log`. Il Codespace dell'utente non e' stato aggiornato.


## Attivazione ChatGPT dall’Amministrazione (2026-10-03)

L’utente vuole abilitare la funzione dall’interfaccia senza generare chiavi o
modificare file con comandi. Ramo `feature/chatgpt-admin-activation` creato da
main aggiornato (`dbeb6167`, PR #39 verificata MERGED). Nessun agente delegato.

Nuova scheda in Amministrazione → Configurazione → Generale → Collegamento
ChatGPT: Abilita/Disabilita, stato e salvataggio immediato, collegamento all’Area
personale. UI e messaggi backend in IT/EN/ES/FR/DE/SV, guida aggiornata nelle sei
lingue. Il controllo cambia solo la disponibilità del servizio; ogni persona
continua a collegare e attivare il proprio account separatamente.

GET/PUT `/admin/chatgpt/settings` ammettono solo un amministratore autenticato
reale; esclusi ricercatori e view-as, PUT protetto dall’header anti-CSRF e payload
booleano stretto. `Config.chatgpt_enabled` persistente precede la variabile
iniziale `CHATGPT_ENABLED`. Effetto sulle nuove richieste senza riavvio; la
lettura del flag non esegue autoflush di scritture chat/punteggi pendenti.
`chatgpt_*` esclusi dalla configurazione generica e scrittura rifiutata lì, per
impedire bypass della preparazione della chiave e modifica dell’host ID.

Prima attivazione: chiave Fernet privata in chatgpt_credentials/credential.key
(0700 directory, 0600 file). Scrittura/fsync in temporaneo e pubblicazione
atomica senza sovrascrittura: worker concorrenti convergono sulla stessa chiave.
Nuovo volume Docker dedicato montato su /app/chatgpt_credentials; esclusioni
Git/Docker, nessuna chiave restituita al browser o inserita nell’immagine.
Le chiavi fornite dall’operatore restano prioritarie, anche se non valide.
`CHATGPT_CREDENTIALS_DIR` può selezionare un altro archivio persistente.

Disattivazione conserva chiave e credenziali, blocca nuove associazioni e
inferenze personali senza ripiego a pagamento. Funziona anche se la chiave è
mancante. Chiave persa con grant esistenti: richiede ripristino dal backup,
non genera un sostituto. Chiave non valida o archivio non scrivibile: errore e
nessuna attivazione salvata. Backup deve includere DB e chiave protetta coerenti.
Procedura principale ora via UI in docs/operations/chatgpt-subscription.md.

Verifiche: 53 backend integrazione/amministrazione, 72 routing/PII, 202 smoke
eseguiti dal runner, 236 unitari frontend passati. Browser: 13 prove nuove
(6 lingue, 390/1440 px + ricercatore) e 20 regressioni connessione personale/
allineamento prompt passate. Controllo ricercatore attende davvero il 403 prima
di verificare che il comando sia assente. TypeScript e i18n (2944 chiavi × sei
lingue) passati; ESLint mirato zero errori, un warning preesistente in ConfigForm
sulla dipendenza getConfigValue. Nessun account OpenAI reale o LLM chiamato.

Prova aggiuntiva sull’app dev effettiva (API non simulate): dal pannello
attivato, ricaricato e disattivato; stato verificato tramite API. Nel solo DB
counselorbot_dev ora la scelta amministrativa è false, con chiave pronta.
Chiave runtime conservata in /workspace/counselorbot-sbs/chatgpt_credentials,
ignorata da Git e non letta/stampata. Screenshot /tmp/chatgpt-admin-live-390.png;
fixture UI /tmp/chatgpt-admin-390.png e /tmp/chatgpt-admin-1440.png.
Nessuna associazione OAuth o modifica di prompt/dati di produzione.

Docker: check del Dockerfile backend passa; frontend restituisce tre avvisi
preesistenti LegacyKeyValueFormat e codice 1. Compose validato con copia e
variabili/credenziali fittizie fuori repo, perché qui non c’è un .env reale.
Il rebuild completo non è eseguibile con circa 983 MiB liberi e driver vfs:
una build precedente ha già saturato il disco; preflight in
/tmp/chatgpt-admin-compose-validation/build-preflight.log. Nessuna nuova
immagine finale prodotta, nessun container/volume rimosso o riavviato.
Il normale aggiornamento dell’operatore deve ricostruire le immagini e applicare
il volume persistente. Limiti SIWC/ammissibilità/licenza della PR precedente
restano documentati; l’attivazione non cambia i piani ammessi da OpenAI.

Dev lasciato attivo: backend :8002 (reloader PID 24513), frontend :3107 (npm
PID 24514, Next PID 24533), PostgreSQL dedicato :5435. Arresto con
`kill 24513 24533`, senza toccare DB/produzione. Venv locale conservata tramite
symlink alla copia in /tmp, come nella sezione precedente. Nessun intervento
sul Codespace dell’utente: aggiornare la nuova PR/main dopo il merge e riavviare
una volta per caricare il codice; poi l’attivazione dal pannello non richiede
ulteriori riavvii. Nessun merge o deploy da parte dell’agente.
