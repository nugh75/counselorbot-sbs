# Handoff — #911 Lotto 2: test browser area/catalogo/strumenti/palestre/flat

## Stato
Completo. Branch `fix/911-browser-tests-lotto2` da `origin/main` db35c5c2.
Scope solo `frontend/tests/` + questo handoff; nessuna modifica a `src/`.

## Fatto
- Riscritti i test obsoleti sul markup/flusso attuale, mai saltati o cancellati:
  - `visual-tools`: menu «⋮» #682 (impostazioni in sottolivello; «Pannello» con
    contatore), guida task-based #989 (18 task con figura + zoom), un solo `pre` visibile.
  - `account-onboarding`: ingressi intro resi come link (non heading) e nomi categoria
    attuali («Analisi questionari», «Percorsi guidati»).
  - `teacher-practice-notebooks`: distinzione Palestra via `data-role-badge` (flat #962).
  - `activities-timeline`: nascosto `nextjs-portal` (overlay dev Next a 390px).
- Riusate le modifiche pendenti, verificate verdi: `active-actions`, `guide-audiences`,
  `teacher-catalogs`.
- Test statici flat: gia' allineati, nessuna modifica necessaria.

## Verifiche (file -> pass/totale)
| File | Esito |
|---|---|
| flat-area 9/9 · flat-student 2/2 · flat-isolated 3/3 · flat-quick 4/4 | ok |
| flat-visual 2/2 · compass-entry 3/3 · questionnaire-runner 5/5 | ok |
| resources 2/2 · pqbl 4/4 · flashcards-flat 2/2 · forum-changes 2/2 · offline 5/5 | ok |
| visual-tools | 32/34 (2 skip preesistenti) |
| student-class-catalog | 9/9 |
| student-class-counselors | 3/3 |
| teacher-catalogs | 7/7 |
| activity-tools | 1/1 |
| activities-timeline | 5/5 |
| teacher-practice-notebooks | 29/29 |
| guide-audiences | 25/25 |
| flashcards-autosave | 2/2 |
| design-usability | 25/25 |
| account-onboarding | 47/47 |
| active-actions | 7/7 |

`npx eslint` sui 7 file toccati: 0 errori. `npx tsc --noEmit`: 0 errori.
Ambiente: `next dev --webpack` 127.0.0.1:3192 (`BACKEND_ORIGIN=127.0.0.1:9`),
Postgres `s2-911-pg` + `backend.tests.goals_browser_server` :18096 (solo timeline).
Dev server, container e server Python FERMATI a fine lavoro.

## Prossimi passi
- Lotto 3 (classi, goal catalog, incontri, admin, chat, residui) al Timoniere.

## Blocchi e rischi
- Nessun bug applicativo osservato in questo lotto.
- `opencode.json` modificato localmente: NON committato. `output/` non committato.
