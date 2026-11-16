# Handoff — feature/plan-attempt-choice-991 (#991)

## Stato
Completo. PR #994 aperta; dopo il merge di main (cap httpx2, PR #996) startup e tests (postgres) verdi.

## Fatto
- Backend: tabella `class_path_counted_attempts` (create_all, additiva); `counted` su ogni tentativo; default = ultimo completato.
- `PUT /user/paths/{p}/steps/{s}/counted-attempt` (solo propri tentativi completati: 404/409).
- `GET /teacher/paths/{p}/steps/{s}/attempts/{username}` (senza risposte/trascrizioni).
- Completamento del passo (data per il docente) usa il tentativo che conta.
- Frontend: `?attempt=new` mostra un Dialog di conferma, nessun tentativo creato al caricamento.
- Card: «Tutti i tentativi» con «Conta questo» / «Conta per il piano» quando ≥2 completati.
- Docente: nel dettaglio della casella, elenco tentativi con quello che conta.
- Sei lingue; guida «repeat» aggiornata; docs funzionalita + plan-activity-flow.

## Verifiche
- pytest test_path_activity, test_results_deep_dive, test_it_administration: 69 passed (Postgres 15 usa e getta).
- pytest test_class_paths: 57 passed. Container di test rimosso.
- tsc (solo errori .png preesistenti per next-env.d.ts assente nel worktree), eslint file toccati, node test path-activity/guide-tasks/class-paths: 35 pass; i18n:check ok; make guidance-check ok.
- Nessun controllo visivo (niente dev server per vincolo RAM).

## Prossimi passi
- Merge; deploy con backup DB, rebuild backend + frontend.

## Blocchi e rischi
- Risolto: blocco CI mistralai/httpx2 superato col merge di main (#996).
- Il run «documentation» su evento push confronta col push precedente (solo requirements.txt da main): falso positivo; il run pull_request passa.
- Default questionario/analisi passa dal primo completato all'ultimo (data mostrata al docente può cambiare).
