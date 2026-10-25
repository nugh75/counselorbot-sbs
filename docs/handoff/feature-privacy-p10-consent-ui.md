# P10 — recupero PR #589

## Stato
- s15-fix-589-codex; GPT-6.1-Sol medium, T1; stessa sessione Full Access/`--yolo` autorizzata, pane `wS:p4G`. Sostituto S15 autorizzato in questa sessione; Codex precedente fermato/chiuso dopo l'handoff, nessun altro agente avviato.
- Task `2666f647-d62e-478c-ab60-51fa0d693ec5` aperto; Timoniere `t-copilota-codex`, pane `wS:p46`, in pausa quota fino al 26/10/2026 02:00 Europe/Stockholm.
- Solo worktree/branch `feature/privacy-p10-consent-ui`; PR https://github.com/nugh75/counselorbot-sbs/pull/589.
- Head GitHub `88e873e69ad5e0cd5e9fb9b3ec207d05b3612878`, PR OPEN/MERGEABLE, checks UNSTABLE; merge `3cad8721` integra main `586d01b8`, docs/diagnosi in `88e873e6`, entrambi pushati.
- Issue #599 (milestone Desktop apps) traccia diagnosi e correzione SSE; PR dedicata #601, solo test, branch `fix/sse-disconnect-done-callback` da main `586d01b8`.
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
- Avviso whitespace ereditato: riga finale vuota in `docs/handoff/chore-release-0.1.1.md`, identico a main; preservato.
- Prima del nuovo main: guidance-refresh/check anche con base `e793de23`, 3 test checker, 24 test Node mirati, i18n 3647 chiavi/6 lingue verdi.
- Prove P10 storiche: 26 test P9 SQLite verdi; browser navbar/personal-area non eseguiti (Next dev non Ready).

## Prossimi passi
- Merge main `586d01b8` completato: solo conflitto manifest risolto; v0.1.1 allineata, 7 test sync-version e 3 test checker verdi con Python 3.12.
- CI `88e873e6`: guida push/PR, startup SQLite, portability e Release Drafter verdi; SQLite run `40231539939` verde (444 noti/0 inattesi/0 listed-passing, 4997 passed); Postgres concluso rosso sul solo flake SSE.
- Manifest dai 1411 blob prodotto staged validato dalla CI; CLI locale interrotto per attesa I/O, PNG intatto.
- Rerun manuali su #589: **0**; nessun rerun Postgres usato. La matrice `backend-db` di PR #601 (SQLite + PostgreSQL) è la verifica autorevole del fix.
- Attendere l'esito CI di #601; il merge resta al proprietario. Dopo il merge, #589 e #595 possono integrare main e girare una sola volta. Nessun merge autonomo, nessun ampliamento del ratchet, nessuna modifica al builder #595.
- Task `2666f647…`: aggiornato con la consegna; nessun successore o controllo su s16 avviato qui.
- Notify di consegna al Timoniere da inviare con `journal-cli.mjs`; nessun'altra azione automatica.

## Blocchi e rischi
- Bug SSE Diario `5218df41-50eb-4164-bd04-22ffafe84a8c` (issue #599): fix solo test in PR #601; CI #601 in attesa. Runtime SSE invariato, contratto heartbeat invariato.
- Diagnosi e correzione documentate in `docs/operations/sse-disconnect-flake.md`; nessuna deroga estesa, nessuna voce aggiunta alla baseline Postgres; rimossa solo la voce SQLite ormai passante.
- Consensi/documenti `[DA VALIDARE]`; revoca disabilitata se docente non risolto; prove browser/legali restano da coordinare.
- Attesa locale lettura PNG 1129 byte durante checker: bug sospetto Diario `aa54680f-b8de-4f3a-aa45-089028cb6ede`; causa ambientale non confermata, file intatto.
- Nessun deploy/sudo/segreto/.env/dato produzione o processo/container altrui toccato; fermati solo i checker precedenti, nessun dev avviato.
