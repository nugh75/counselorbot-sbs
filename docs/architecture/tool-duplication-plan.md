# Duplicare uno strumento (admin) — piano

Analisi del 23 ottobre 2026 (branch `feature/admin-duplicate-tool`, base `9fce92c4`).
Richiesta: un pulsante «Duplica strumento» che crea un **nuovo strumento indipendente**
(prompt, step, skill, impostazioni, testi), con nome/codice scelti dall'admin,
modificabile senza toccare l'originale e attivabile per le classi come gli altri.

**Esito: non implementato in questa PR.** Una copia fedele di uno strumento storico
(QSA, ZTPI, Savickas, …) richiede di sciogliere il legame tra comportamento e codice
dello strumento/id degli step nel motore di chat: più di una sessione di lavoro.
Una prima fase limitata è fattibile (vedi *Spezzamento proposto*).

## Dove è definito oggi uno strumento

| Parte | Dove | Chiave |
|---|---|---|
| Anagrafica, scala, visibilità, categoria, icona, colore | tabella `instruments` (`models.Instrument`) | `code` (PK) |
| Fattori, item, soglie normative | `factors`, `items`, `norm_thresholds` | `instrument_code` |
| Step della chat guidata | `guided_steps` | `id` **PK globale**, `questionnaire_type` |
| Domande suggerite | `guided_step_questions` | `questionnaire_type` + `step_id` |
| Agganci delle skill | `guided_step_skills` | `questionnaire_type` + `step_id` (o `*`) |
| Meta prompt, componenti, note, varianti di livello | righe `configs` | `prompt_meta_<CODE>[_<step>]`, `prompt_components_<CODE>_<step>`, `prompt_guidance_<CODE>_<step>`, `…__level_*` |
| Testi di fase (Domande/Conclusione) | righe `configs` | `text_<slug>_questions_intro`, `text_<slug>_conclusion` (+ `__<lingua>`), oppure chiavi fisse per gli storici (`routes/chat.py` `_INSTRUMENT_PHASE_TEXTS`) |
| Prompt di sistema per modalità | righe `configs` | `prompt_<mode>` (condivisi fra strumenti, `prompt_config.MODE_TO_SYSTEM_PROMPT_KEY`) |
| Counselor, strategie approvate/certificate, letture certificate | colonne JSON `questionnaire_types` / `questionnaires` | elenco di codici |
| Attivazione per le classi | `class_tools.tool_catalog` legge `instruments` (dinamico) | `code` |

Già dinamici: registro degli strumenti (`dynamic_registry.py`), creazione guidata
(`CreateInstrumentDialog`, `lib/instrument-wizard.ts`), catalogo delle classi
(`class_tools.tool_catalog`), mappa dei prompt (`prompt_map.ordered_instruments`).
Uno strumento nuovo creato col wizard usa il runtime generico delle chat guidate.

## Cosa impedisce una copia fedele

1. **Step id globali e semantici.** `guided_steps.id` è chiave primaria unica in tutto
   il DB, quindi la copia deve rinominare gli step. Ma il motore usa l'id dello step
   come significato: `GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS` (12 fasi d'ingresso per
   id, `prompt_config.py:1001`), `WELCOME_PHASE_IDS`, `GUIDED_PHASE_ALIASES`,
   `_NO_NEW_ADVICE_STEP_IDS` (`chat_logic.py:1206`), `QSA_PROMPT_COMPONENT_DEFAULTS`
   per id, controlli `phase.startswith("ztpi-")`. Uno step rinominato perde prompt
   d'ingresso, default dei componenti e regole sui consigli.
2. **Comportamento per codice strumento.** Riferimenti letterali nel backend (escluse
   test e migrazioni): QSA 136 in 38 file, QPCC 110/36, ZTPI 72/29, QSAr 74/25,
   QPCS 64/26, QAP 62/27, Savickas 50/21, IDEA 46/18. Esempi: punteggi e profili,
   moduli di bozza (`event_booklet`, `goal_draft`), mappa IDEA, testi di fase,
   default dei componenti QSA. Una copia `QSA_BIS` girerebbe come strumento generico.
3. **Elenchi scritti a mano nel frontend** (12–32 file per codice): `TOOL_OPTIONS`
   (`app/questionario/page.tsx:50`), `STATIC_AVAILABLE_INSTRUMENTS`
   (`app/strumenti/[id]/page.tsx:21`), `QUESTIONNAIRES` statici, `lib/tool-catalog.ts`,
   `PromptExportPanel`, `CertifiedReadingsPanel`, `GuidedStepQuestionsPanel`.
   La copia non comparirebbe in queste viste.
4. **Testi di fase degli storici** hanno chiavi fisse (`text_qsar_conclusion`, …):
   vanno copiati sulle chiavi generiche `text_<slug>_…` del nuovo codice.

## Cosa va reso dinamico (copia fedele)

- Separare **identità** e **ruolo** dello step: nuova colonna `guided_steps.phase_role`
  (es. `intro`, `ztpi-intro`, `sl-synthesis`) usata dal motore al posto dell'id;
  migrazione che la valorizza con l'id attuale per tutte le righe esistenti.
- Sostituire i controlli per codice strumento con un **profilo** dello strumento:
  colonna `instruments.engine_profile` (es. `QSA`, `ZTPI`, `generic`) letta dal motore;
  la copia eredita il profilo dell'originale. Migrazione: profilo = codice per gli storici.
- Leggere il catalogo strumenti dall'API invece che dagli elenchi del frontend.

## Duplicazione (endpoint)

`POST /api/admin/instruments/{code}/duplicate` con `{code, name_i18n}`:

- 409 se il codice esiste già (in `instruments` o come `questionnaire_type` di step).
- Una transazione: copia `instruments` (con `is_active = false`, bozza), `factors`,
  `items`, `norm_thresholds`, `guided_steps` (id nuovo `<slug>-<id originale>`,
  stesso `phase_role`), `guided_step_questions`, `guided_step_skills`, righe `configs`
  con prefisso di codice/step riscritte, testi di fase sulle chiavi generiche.
- Non copia: risultati, log, sessioni, revisioni dei prompt (lo storico parte vuoto),
  attivazioni per classe. Counselor e strategie: opzione «estendi anche alla copia»
  (aggiunge il nuovo codice ai loro `questionnaire_types`).
- Invalida `dynamic_registry`.
- Test backend: copia completa, modifica della copia senza effetti sull'originale (e
  viceversa), 409 sul codice duplicato, catalogo delle classi che mostra la copia.

## Spezzamento proposto

1. **Fase 1 (una sessione):** duplicazione solo per strumenti con profilo generico
   (creati col wizard, non storici). Nessun cambio al motore: copia di righe con id
   step rinominati, 409, test di indipendenza; pulsante nella scheda Questionari.
   Gli storici mostrano il pulsante disattivato con la spiegazione.
2. **Fase 2:** `phase_role` sugli step + migrazione; il motore legge il ruolo.
3. **Fase 3:** `engine_profile` sugli strumenti + migrazione; sostituzione dei
   controlli per codice nel backend, strumento per strumento, con test di parità.
4. **Fase 4:** elenchi del frontend dal catalogo API; duplicazione aperta agli storici.

## Rischi

- Fasi 2–3 toccano il motore di chat in molti punti: rischio di regressioni nei prompt
  degli storici; servono test di parità prima/dopo sul prompt assemblato
  (`/admin/prompt-audit/dry-run`).
- Due migrazioni DB su tabelle usate a ogni turno: da eseguire con backup.
- Conflitto con il lavoro sugli elenchi degli strumenti lato docente
  (branch `fix/teacher-tool-toggles`) nella fase 4.
