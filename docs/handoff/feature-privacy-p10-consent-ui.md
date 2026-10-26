# P10 — recupero PR #589

## Stato
- s15-fix-589-codex; GPT-6.1-Sol medium, T1; stessa sessione Full Access/`--yolo` autorizzata, pane `wS:p4G`. Sostituto S15 autorizzato in questa sessione; Codex precedente fermato/chiuso dopo l'handoff, nessun altro agente avviato.
- Task `2666f647-d62e-478c-ab60-51fa0d693ec5` aperto; Timoniere `t-copilota-codex`, pane `wS:p46`, in pausa quota fino al 26/10/2026 02:00 Europe/Stockholm.
- Solo worktree/branch `feature/privacy-p10-consent-ui`; PR https://github.com/nugh75/counselorbot-sbs/pull/589.
- Head di codice verificato `88e873e69ad5e0cd5e9fb9b3ec207d05b3612878`; head docs `6d98522cedd1a629ad6fd1e305a2f37c775bbe47` (PR #589 OPEN/MERGEABLE/UNSTABLE). I commit docs successivi non cambiano codice. Merge `3cad8721` integra main `586d01b8`, docs/diagnosi in `88e873e6`, entrambi pushati.
- Issue #599 (milestone Desktop apps) traccia diagnosi e correzione SSE; PR dedicata #601, solo test, branch `fix/sse-disconnect-done-callback` da main `586d01b8`; CI `backend-db` verde su SQLite e PostgreSQL, merge al proprietario.
- v0.1.1 già pubblicata: nessuna nuova release/deploy da eseguire.

## Fatto
- Recuperato merge s14 di `e72cf3fa` in `77e21b14`; integrata #594 `e793de23` in `4467b2b5`; handoff in `e90c807d`/`fe891bb4`, tutti pushati.
- Preservati P10 e lavori #590–594, integrata la release già pubblicata #596/#597; manifest combinato rigenerato; checker conserva dizionario privacy e proprietà abbreviate P10, eccezioni puntuali di main.
- P10: documenti/finalità/scelte/condivisione/cronologia in sei lingue; docente/classe esposti solo nelle scelte del soggetto.
- Backup s14 `/tmp/counselorbot-opencode-handoff-20261025` non applicato; nessun runtime SSE o ratchet modificato in P10.
- Sostituto S15: verificati head `88e873e6` e run `40231539939`; confermato unico inatteso SSE. Riprodotto con pytest reale (3/20 processi exit 1) e probe (80/100 fail). Fix solo test in PR #601: `await asyncio.sleep(0)` prima dell'asserzione e rimozione della voce SQLite ormai passante; nessuna modifica a `backend/sse.py`, `postgres_known_failures.txt` o al builder #595. Evidenza commentata su #599.

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
- Avviso whitespace ereditato: riga finale vuota in `docs/handoff/chore-release-0.1.1.md`, identico a main; preservato.
- Prima del nuovo main: guidance-refresh/check anche con base `e793de23`, 3 test checker, 24 test Node mirati, i18n 3647 chiavi/6 lingue verdi.
- Prove P10 storiche: 26 test P9 SQLite verdi; browser navbar/personal-area non eseguiti (Next dev non Ready).

## Prossimi passi
- Merge main `586d01b8` completato: solo conflitto manifest risolto; v0.1.1 allineata, 7 test sync-version e 3 test checker verdi con Python 3.12.
- CI `88e873e6`: guida push/PR, startup SQLite, portability e Release Drafter verdi; SQLite run `40231539939` verde (444 noti/0 inattesi/0 listed-passing, 4997 passed); Postgres concluso rosso sul solo flake SSE.
- Manifest dai 1411 blob prodotto staged validato dalla CI; CLI locale interrotto per attesa I/O, PNG intatto.
- Rerun manuali su #589: **0**; nessun rerun Postgres usato. La matrice `backend-db` di PR #601 (SQLite + PostgreSQL) è la verifica autorevole del fix.
- PR #601 verde su SQLite e PostgreSQL (head `96306c22`); il merge resta al proprietario. Dopo il merge, #589 e #595 devono integrare main e girare una sola volta. I run P10 `40236628829` e `40239883712` mostrano che senza il fix il Postgres può passare solo per caso o fallire sullo stesso test, mentre lo SQLite fallisce per `NOW PASSING`: **unico impedimento** è #601 non merged. Nessun merge autonomo, nessun ampliamento del ratchet, nessuna modifica al builder #595.
- Task `2666f647…`: aggiornato (`in corso`, agent `s15-fix-589-opencode`), body con consegna e classificazione finale; resta aperto fino al merge del proprietario. Nessun successore o controllo su s16 avviato qui.
- Notify di consegna inviate: prima `recipient_working` (pane `wS:p4S`), seconda `delivery_unknown` con `submitted: true`; consumo non confermato. Nessun'altra azione automatica.

## Blocchi e rischi
- Bug SSE Diario `5218df41-50eb-4164-bd04-22ffafe84a8c` (issue #599): fix solo test in PR #601, CI verde su entrambi i DB al head `96306c22`. Runtime SSE invariato, contratto heartbeat invariato. P10 resta rosso su entrambi i DB per lo stesso test (`NEW FAILURE` su Postgres, `NOW PASSING` su SQLite) finché non integra #601.
- Diagnosi e correzione documentate in `docs/operations/sse-disconnect-flake.md`; nessuna deroga estesa, nessuna voce aggiunta alla baseline Postgres; rimossa solo la voce SQLite ormai passante.
- Consensi/documenti `[DA VALIDARE]`; revoca disabilitata se docente non risolto; prove browser/legali restano da coordinare.
- Attesa locale lettura PNG 1129 byte durante checker: bug sospetto Diario `aa54680f-b8de-4f3a-aa45-089028cb6ede`; causa ambientale non confermata, file intatto.
- Nessun deploy/sudo/segreto/.env/dato produzione o processo/container altrui toccato; fermati solo i checker precedenti, nessun dev avviato.
