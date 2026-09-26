# Handoff: Area docenti illustrata con sottopagine
Data: 2026-09-26 | Sessione precedente: refactor `/docente` in home illustrata + sottopagine

## Objective
Rendere l'Area docenti (`/docente`) simile all'Area personale studente: home
illustrata con gruppi per scopo, pannelli pesanti spostati su sottopagine
`/docente/<slug>`, guard unificato. Opzione 2 scelta dall'utente (subpagine,
come `/profilo/<slug>`). Finire test residue, docs gate, commit, push e PR.

## Progress
- [x] `frontend/src/lib/teacher-area.ts` — slugs (`classi`, `assegnazioni`,
      `catalogo-obiettivi`, `strategie`, `materiali`, `orientamento`,
      `somministrazioni`), gruppi, immagini (asset esistenti, nessuna generata).
- [x] `frontend/src/lib/i18n-teacher-area.ts` — testi 6 lingue (nome/descrizione
      per slug, gruppi, forbidden/back, notebook).
- [x] Home `/docente` riscritta: hero OBIETTIVO_DOCENZA + 3 gruppi illustrati +
      Taccuino inline; heading 'Area docenti' (usato dai test).
- [x] `TeacherAreaHeader` (back a /docente, speculare PersonalAreaHeader),
      `TeacherAccess.tsx` (TeacherForbidden/TeacherLoading),
      `useTeacherAccessState.ts`, `TeacherAreaPage.tsx` (guscio sottopagine).
- [x] Sottopagine create: `/docente/{classi,assegnazioni,catalogo-obiettivi,
      strategie,materiali,somministrazioni}/page.tsx`. `/docente/orientamento`
      invariata. `TeacherCatalogs.tsx` eliminata.
- [x] `MyGroupsCard` link "vai all'Area docenti" → `/docente/classi`.
- [x] Test smoke nuovi: `tests/teacher-area-home.test.mjs` (5 scenari, PASS).
- [x] `tsc --noEmit` pulito, `npm run i18n:check` OK, unit lib 233/233.
- [x] Test aggiornati e PASS: teacher-catalogs (7/7), assignments (11/11),
      personal-goals (12/12), personal-5a (4/4).
- [ ] `tests/institution-categories.test.mjs`: 18 pass, 2 fail residuali da
      diagnosticare (vedi Problems).
- [ ] Lint completo (`npm run lint` = eslint + i18n) e `npm run build`.
- [ ] Docs: `docs-counselorbot/funzionalita-counselorbot.md` (sezione Docenti)
      + `make guidance-refresh` + `make guidance-check` (gate del repo).
- [ ] Capture screenshots guida: aggiornare `scripts/capture-guide.mjs`
      (teacher-area → home; teacher-groups → `/docente/classi`;
      teacher-catalog/assignment → `/docente/catalogo-obiettivi`;
      teacher-feedback → `/docente/assegnazioni`) e rigenerare screenshot.
- [ ] CONTEXT.md: aggiungere bullet "Teacher-area entry".
- [ ] Commit atomici, push, `gh pr create`, passare PR all'utente.

## Problems Encountered
- institution-categories: 2 fail rimasti (di quali test non ancora identificati
  al momento dell'ultimo run abortito). Gli id/selector del test usavano il
  click dal link su /docente per arrivare a /docente/orientamento: già corretto
  in 2 punti (goto diretto + history back ora aspetta
  `${origin}/docente/orientamento`). Se i 2 fail riguardano i test
  "unsaved form guards" o lifecycle, verificare selector e fixture
  (`CATEGORIES_BASE_URL=http://127.0.0.1:3107`).
- `scripts/capture-guide.mjs` NON ancora aggiornato: fa riferimento a
  `#teacher-catalogs-title` (id rimosso con TeacherCatalogs) e cattura la
  vecchia home; il capture con GUIDE_SCREENS=teacher-area aspetta il link
  "Orientamento dell'istituto" (esiste ancora, card della home).
- Screenshots `public/guide/*/teacher-area.png` non rigenerati.

## Resolutions
- Test falliti pre-esistenti su main, NON causati dal refactor (verificati via
  stash): heading 'Gruppi e classi a cui partecipo' rimosso dalla UI da
  ef71333; 'Lascia il gruppo o la classe' → 'Lascia il gruppo' (b7e13fb);
  ConfirmInline al posto di window.confirm; in assignments: goal link ora solo
  `['action']` (40c044c), 'Apri le mie attività' al posto del link timeline
  (event non più creato), region 'Assegnazioni nel mio percorso' rimossa
  (61e5c6b). Fix in tests/assignments.test.mjs e teacher-catalogs.test.mjs
  allineati al comportamento attuale.
- Fixture API per test browser reali: backend fixture su :18099 con
  `DATABASE_URL=postgresql://counselorbot_user:<pw>@127.0.0.1:5435/counselorbot`
  via `python -m backend.tests.assignments_browser_server`; goals fixture su
  :18096 con `GOALS_TEST_HOST=127.0.0.1 GOALS_TEST_PORT=18096` +
  `-m backend.tests.goals_browser_server`. PW = `docker exec
  counselorbot_postgres printenv POSTGRES_PASSWORD`. RIavviare le fixture se
  ci sono residui tra run (lo schema resta vivo nel processo).
- Test browser: usare `TEACHER_CATALOGS_BASE_URL=...:3107`,
  `ASSIGNMENTS_BASE_URL=...:3107`, `PERSONAL_5A_BASE_URL=...:3107`,
  `CATEGORIES_BASE_URL=...:3107` (default 3097/3098/3108 non attive).

## Decision Log
- Opzione 2 (subpagine) scelta dall'utente su proposta: home illustrata +
  rotte `/docente/<slug>`, guard client `canUseTeacherAssistant` invariato —
  backend già permessa via `get_current_plan_manager` (stesso scope).
- Taccuino del docente resta INLINE sulla home (non sottopagina): form compatto,
  nota di ruolo sempre visibile (scelta validata dall'utente nel mock ASCII).
- `orientamento` resta `/docente/orientamento` pagina dedicata (invariata);
  la card è visibile solo a `isTeacher` come prima.
- Pannelli NON modificati (GroupsPanel, CertifiedStrategies/Readings,
  AdministrationPlans, GoalCatalogEditor, AssignmentsPanel): mantengono i loro
  h2 interni sotto l'h1 della sottopagina — come sulle pagine /profilo.
- Eliminato TeacherCatalogs.tsx (accordions): ogni catalogo ha la sua pagina,
  coerente con il pattern uno-strumento-una-pagina dell'area personale.
- Heading home 'Area docenti' tenuto esplicito (h1 + subtitle) perché i test
  esistenti lo aspettano.
- Dev server: frontend `next dev` su :3107 (era libero; killato il processo
  preesistente su :3108 fermo da tempo). Backend dev :8002 già attivo. A fine
  sessione segnalare lo stato dei processi dev.

## Comandi utili
- Test smoke area: `node --test tests/teacher-area-home.test.mjs` (da frontend/,
  server su :3107)
- Lint: `npm run lint`; Build: `npm run build`
- Docs gate: `make guidance-refresh && make guidance-check` (root repo)
