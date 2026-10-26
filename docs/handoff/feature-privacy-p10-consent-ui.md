# P10 — recupero PR #589

## Stato
- Sessione Codex precedente chiusa; sostituto S15 e ora Timoniere `t-copilota-2oob`, pane `wS:p46`. Nessun altro agente avviato.
- Task `2666f647-d62e-478c-ab60-51fa0d693ec5` in corso, agent `s15-fix-589-opencode`; Timoniere `t-copilota-2oob`, pane `wS:p46`.
- Solo worktree/branch `feature/privacy-p10-consent-ui`; PR https://github.com/nugh75/counselorbot-sbs/pull/589.
- Head di codice dopo il merge `42c4097f` (`chore: merge main with the SSE disconnect fix into P10`); questo commit docs successivo non cambia codice. Main integrata: `39d72182903e9c54bc2f3e29ec27c2881c4b3ac5`, merge PR #601 (`586d01b8` + `96306c22`).
- Issue #599 e PR #601 chiuse: #601 merged in main il 26/10/2026 06:22:36 UTC; il fix SSE è ora nel branch P10.
- v0.1.1 già pubblicata: nessuna nuova release/deploy da eseguire.

## Fatto
- Recuperato merge s14 di `e72cf3fa` in `77e21b14`; integrata #594 `e793de23` in `4467b2b5`; handoff in `e90c807d`/`fe891bb4`, tutti pushati.
- Preservati P10 e lavori #590–594, integrata la release già pubblicata #596/#597; manifest combinato rigenerato; checker conserva dizionario privacy e proprietà abbreviate P10, eccezioni puntuali di main.
- P10: documenti/finalità/scelte/condivisione/cronologia in sei lingue; docente/classe esposti solo nelle scelte del soggetto.
- Backup s14 `/tmp/counselorbot-opencode-handoff-20261025` non applicato; nessun runtime SSE o ratchet modificato in P10.
- Sostituto S15: verificati head `88e873e6` e run `40231539939`; confermato unico inatteso SSE. Riprodotto con pytest reale (3/20 processi exit 1) e probe (80/100 fail). Fix solo test in PR #601: `await asyncio.sleep(0)` prima dell'asserzione e rimozione della voce SQLite ormai passante; nessuna modifica a `backend/sse.py`, `postgres_known_failures.txt` o al builder #595. Evidenza commentata su #599.
- Merge main `39d72182` (PR #601) in `42c4097f`, senza conflitti; il fix SSE è ora nel branch P10 e la baseline Postgres è invariata. Il diff P10 vs main sui file del fix è vuoto.

## Verifiche
- CI `88e873e6`, run `40231539939`, [job Postgres `121284133754`](https://github.com/nugh75/counselorbot-sbs/actions/runs/40231539939/job/121284133754): 53 noti, **1 inatteso**, 0 listed-passing; 54 failed/5862 passed/15 skipped. Job concluso **failure**.
- Unico inatteso: `test_sse_heartbeat.py::test_sync_disconnect_returns_promptly_and_closes_after_the_pending_next`, riga 168: `_closing` contiene un task già terminato dopo `gather`.
- SQLite stesso SHA: verde, 444 noti/0 inattesi/0 listed-passing, 4997 passed; documentation push/PR, startup SQLite, portability e Release Drafter verdi.
- #595 (builder), [run `40232418743`, job Postgres `121286778608`](https://github.com/nugh75/counselorbot-sbs/actions/runs/40232418743/job/121286778608): stesso unico inatteso, 53 noti/1 inatteso/0 listed-passing; 54 failed/5865 passed/15 skipped. Builder non modificato.
- SSE/test identici a main `586d01b8` (diff vuoto); stessa anomalia documentata da `3050d8b8` e run `40209579980` su `77e21b14`.
- Locale Python 3.12.9: prima del fix 17/20 pytest exit 0 e 3/20 exit 1, sempre riga 168; probe 80/100 fail. Dopo il fix 100/100 run singoli, 50/50 con dipendenze complete e 10/10 file `test_sse_heartbeat.py` intero (16 passed); `FULL_FILE_EXIT=0`, `SINGLE_EXIT=0`, `DIFF_CHECK_EXIT=0`, ratchet 0 inattesi/0 listed-passing.
- CI PR #601, [run `40234732483`](https://github.com/nugh75/counselorbot-sbs/actions/runs/40234732483): [Postgres `121293746069`](https://github.com/nugh75/counselorbot-sbs/actions/runs/40234732483/job/121293746069) 53 noti/0 inattesi/0 listed-passing, 53 failed/5862 passed/15 skipped; [SQLite `121293746213`](https://github.com/nugh75/counselorbot-sbs/actions/runs/40234732483/job/121293746213) 443 noti (uno rimosso)/0 inattesi/0 listed-passing, 216 failed/4997 passed/20 skipped/227 errors. Documentation, portability, startup SQLite e Release Drafter verdi.
- Nuovo run P10 `40236628829` sul head docs `6d98522c`: [Postgres `121299488781`](https://github.com/nugh75/counselorbot-sbs/actions/runs/40236628829/job/121299488781) verde per caso (53 noti/0 inattesi/0 listed-passing, 53 failed/5863 passed/15 skipped); [SQLite `121299489000`](https://github.com/nugh75/counselorbot-sbs/actions/runs/40236628829/job/121299489000) **rosso** con 443 noti/0 inattesi/**1 listed-passing**: il test SSE è passato ma è ancora in `sqlite_known_failures.txt`. Conferma che senza il fix il ratchet stretto non può restare verde in modo stabile; nessun rerun.
- Run finale P10 `40239883712` sul head docs `8a59c4fd`: [Postgres `121309210007`](https://github.com/nugh75/counselorbot-sbs/actions/runs/40239883712/job/121309210007) 53 noti/**1 inatteso** (stesso test SSE)/0 listed-passing, 54 failed/5862 passed/15 skipped; [SQLite `121309209945`](https://github.com/nugh75/counselorbot-sbs/actions/runs/40239883712/job/121309209945) 443 noti/0 inattesi/**1 listed-passing** (stesso test, `NOW PASSING`), 216 failed/4998 passed/20 skipped/227 errors. **Nessun altro test fuori baseline**: l'unico impedimento è il fix #601 non ancora merged.
- Dopo il merge: `check-platform-guidance.py --check` exit 0; 3 unittest del checker OK; `make version-check` → versione 0.1.1 allineata, exit 0; `git diff --check` exit 0. Nessuna suite locale completa duplicata.
- Avviso whitespace ereditato: riga finale vuota in `docs/handoff/chore-release-0.1.1.md`, identico a main; preservato.
- Prima del nuovo main: guidance-refresh/check anche con base `e793de23`, 3 test checker, 24 test Node mirati, i18n 3647 chiavi/6 lingue verdi.
- Prove P10 storiche: 26 test P9 SQLite verdi; browser navbar/personal-area non eseguiti (Next dev non Ready).

## Prossimi passi
- Merge main `39d72182` completato in `42c4097f`: nessun conflitto; fix #601 incluso, manifest guidance invariato.
- Controlli mirati post-merge verdi (guidance-check, 3 unittest checker, version-check 0.1.1, diff-check); nessuna suite completa locale duplicata.
- Push unico di merge e handoff; poi verificare la CI `backend-db` sull'esatto SHA pushato, con zero inattesi e zero listed-passing su PostgreSQL e SQLite. Non usare i run precedenti e non fare rerun.
- Task `2666f647…` resta in corso fino a CI verde; poi chiusura e notify al Timoniere `t-copilota-2oob` (`wS:p46`).
- Nessun merge PR autonomo; #595 e #600 restano agli agenti S19/S18, nessun altro worktree toccato.

## Blocchi e rischi
- Bug SSE Diario `5218df41-50eb-4164-bd04-22ffafe84a8c` (issue #599): fix #601 merged in main (`39d72182`) e integrato in P10 (`42c4097f`); attesa solo la CI sul nuovo SHA. Runtime SSE e contratto heartbeat invariati, baseline Postgres invariata.
- Diagnosi e correzione documentate in `docs/operations/sse-disconnect-flake.md`; nessuna deroga estesa, nessuna voce aggiunta alla baseline Postgres; rimossa solo la voce SQLite ormai passante.
- I run precedenti non valgono come prova del nuovo head: nessun rerun e nessun polling ripetuto.
- Consensi/documenti `[DA VALIDARE]`; revoca disabilitata se docente non risolto; prove browser/legali restano da coordinare.
- Attesa locale lettura PNG 1129 byte durante checker: bug sospetto Diario `aa54680f-b8de-4f3a-aa45-089028cb6ede`; causa ambientale non confermata, file intatto.
- Nessun deploy/sudo/segreto/.env/dato produzione o processo/container altrui toccato; fermati solo i checker precedenti, nessun dev avviato.
