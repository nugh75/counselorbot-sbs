# Handoff — feature/targeted-goals-pages-905 (#905)

## Stato
Completo: backend, frontend, docs committati; PR verso main.

## Fatto
- `GET /teacher/goal-catalog/targeted` (`group_id`, `group_id`+`username`, `practice_notebook_id`): proposte non archiviate dell'autore (admin tutte); classe visibile, studente di prova del docente (404 altrimenti). Nessun `targets` nella risposta.
- `goals.practice_goals_context`: blocco `[TARGETED GOALS]` (inglese, max 5: titolo, descrizione, criteri) dentro `[PROFILE]` nelle chat di prova.
- `TargetedGoals.tsx` (piatto, icona SVG lucide): Panoramica classe, studente aperto in «Partecipanti e risultati» (`PlanStudentsPanel` prop `goalGroupId`), `/docente/taccuini-prova/[id]`. Testi in 6 lingue.
- Bug corretto (commit separato `fix:`): il taccuino dello studente di prova non entrava nel prompt (l'avviso `[SIMULATION]` cita `[PROFILE]` e il controllo anti-duplicati lo scambiava per il blocco). Tre test tolti da `postgres_known_failures.txt`. Bug registrato nel Diario.

## Verifiche
- pytest `test_targeted_goals.py` (nuovo, 3), `test_goal_catalog_targets.py`, `test_practice_notebooks.py`, `test_goals.py`: 65 passed, 1 fallimento noto preesistente (Postgres effimero, rimosso).
- node --test `tests/targeted-goals.test.mjs` (statico, 3): ok. i18n:check, eslint file toccati, tsc (solo errori `.png` preesistenti del worktree): ok. make guidance-check: ok.

## Prossimi passi
- Nessuno per #905. Facoltativo: riscrivere `test_practice_turns_are_logged_with_the_resolved_notebook` (DetachedInstanceError nel test, ancora nei fallimenti noti).

## Blocchi e rischi
- Nessun test browser (vietato un secondo dev server): rendering verificato solo con tsc/eslint e test statico.
