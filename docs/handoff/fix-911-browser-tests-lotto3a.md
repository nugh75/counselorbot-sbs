# Handoff — #911 Lotto 3a: classi, obiettivi, incontri, istituti, taccuini

## Stato
Completo. Branch `fix/911-browser-tests-lotto3a` da `origin/main` ef353f34.
Scope: `frontend/tests/` + 2 fix reali in `src/` + questo handoff. Nessun sudo né produzione.

## Fatto
- Riscritti i test obsoleti sul markup/flusso attuale (mai saltati o cancellati):
  guide task-based, dialog «Gestisci incontri», card piano `do-now`/dettagli,
  checkbox inline, filtri `/docente/assegnazioni?group=`, InlineRename/ConfirmInline
  (tavolo), nuovo `PlanActivityFlow` (approfondimenti), handler fixture mancanti
  (settings classe, targeted goals, `/memory/event`), date slot future (time-bomb).
- Bug reali corretti (commit separato `fix:`):
  - `personal-sources.ts`: `fromServer` tollera bindings assenti → niente crash del
    dialog dettagli counselor con fonti personali disattivate.
  - `ClassOverviewTab.tsx`: errori di salvataggio anagrafica senza detail privato.
- Bug registrati (journal-cli): `4186bb6f` (F31 assegnazioni inline rimosse con b49d1548),
  `fdbc1268` (crash dialog counselor), `80fdad68` (detail privato in anagrafica).

## Verifiche (file → pass/totale)
| File | Esito |
|---|---|
| class-page-keep-drafts 3/3 · targeted-goals 3/3 · notebook-autosave 3/3 | ok |
| combined-analysis-page 2/2 · submission-result-disclosure 7/7 | ok |
| assignments 12/12 · class-meetings 1/1 · individual-meetings 1/1 | ok |
| class-support-access 14/14 · goal-method-action 10/10 · meetings-timeline 1/1 | ok |
| class-path-add-step 1/1 · class-path-placement 17/17 · class-path-presentation 1/1 | ok |
| class-settings 19/19 · path-templates 1/1 · piano-builder-resources 4/4 | ok |
| institute-credentials 11/11 · institution-categories 20/20 · institution-directory 8/8 | ok |
| institution-teachers 7/7 · local-pairing 9/9 · orientation-recommendation 1/1 | ok |
| teacher-class-compilations 36/36 · teacher-class-management 22/22 | ok |
| teacher-class-picker 54/54 · teacher-institutes 14/14 · teacher-loading-errors 57/57 | ok |
| teacher-meetings-page 1/1 · teacher-notebook-copy 18/18 · teacher-notebook-links 25/25 | ok |
| teacher-notebook-page 34/34 · plan-questionnaire-chats 34/34 · tavolo 33/33 | ok |
- `npx eslint` sui file toccati: 0 errori (2 warning preesistenti in teacher-institutes).
- `npx tsc --noEmit`: 0 errori. `personal-sources.test.ts`: 2/2.
- `python3 scripts/check-platform-guidance.py --base origin/main`: allineata.
- `class-settings-live.test.mjs`: NON eseguito (opt-in `CLASS_SETTINGS_LIVE=1`, richiede
  backend/DB sintetici reali su :8002; non modificato).

## Ambiente (FERMATO)
- Dev server Next webpack `127.0.0.1:3201` (`BACKEND_ORIGIN=127.0.0.1:9`): fermato.
- Fixture `backend.tests.assignments_browser_server` :18099 + Postgres `s3-911-pg`: fermati/rimossi.
- `opencode.json` modificato in locale: NON committato. `output/` rimosso, non committato.

## Prossimi passi / rischi
- Lotto 3b (admin/chat/residui) al Timoniere: nessun compito sbloccato avviato.
- PR #1049 aperta non in bozza su `main`; merge al proprietario.
