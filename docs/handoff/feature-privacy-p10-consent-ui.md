# P10 — recupero PR #589

## Stato
- Responsabile: s15-fix-589-codex; modello richiesto Codex gpt-6.1-sol, T1, effort medium.
- Stessa sessione riavviata con `--yolo` su autorizzazione esplicita utente, pane `wS:p4G`; limiti del mandato invariati.
- Task recupero: `2666f647-d62e-478c-ab60-51fa0d693ec5`; task P10 originale: `e9d44ca2-e19b-419b-b925-09744e9add34`.
- Worktree `feature-privacy-p10-consent-ui`, branch `feature/privacy-p10-consent-ui`.
- PR esistente: https://github.com/nugh75/counselorbot-sbs/pull/589 (aperta, nessun merge/deploy autorizzato).
- Ripresa da s14: merge `e72cf3fa` in `77e21b14`, poi nuovo main `e793de23` in `4467b2b5`, entrambi pushati; zero file unmerged.

## Fatto
- Verificati status, log, MERGE_HEAD, diff e indice; preservate tutte le modifiche importate dalle PR #590–593.
- Manifest rigenerato e committato per il prodotto combinato P10 + accesso locale #591; il precedente indice era obsoleto.
- Guida e menu account conservano entrambi i lavori; backend P9/P10 non modificato dal merge.
- P10: pagina `/privacy`, documenti/finalità/scelte/condivisione/cronologia, sei lingue; API scelte espone docente/classe solo al soggetto.
- Nuovo main `e793de23` (#594) entrato durante la CI: merge aggiuntivo; conflitti limitati a manifest e checker i18n, risolti preservando il dizionario P10 e le eccezioni puntuali di main.
- Backup s14 in `/tmp/counselorbot-opencode-handoff-20261025`, non applicato.

## Verifiche
- `make guidance-refresh`, `make guidance-check`, checker `--check --base e72cf3fa` e poi `e793de23`: pass.
- `python3 -m unittest discover -s scripts/tests -p 'test_platform_guidance_check.py'`: 3 pass.
- Diff e diff staged senza errori whitespace; dopo #594, Node 22: 24 test privacy/auth/runtime-config/administration-plans pass; i18n: 3647 chiavi, sei lingue.
- CI `77e21b14`: guidance push `40209575491` e PR `40209579957`, Release Drafter, portability e startup SQLite verdi.
- Backend run `40209579980`: SQLite verde (444 noti, 0 inattesi, 0 listed-passing); Postgres rosso (53 noti, 1 inatteso, 0 listed-passing).
- Unico inatteso Postgres: `test_sse_heartbeat.py::test_sync_disconnect_returns_promptly_and_closes_after_the_pending_next`, asserzione finale su `_closing`.
- Stesso file SSE/test di main; flakiness preesistente documentata da `3050d8b8` e nei run precedenti. Nessuna modifica al ratchet o fix fuori scope.
- Precedente CI rossa su head `45091d7e`/run `40199013418`: baseline nota, riallineata da #593; non vale come verifica del nuovo head.
- Precedenti prove P10: 11 unit frontend, 26 test P9 SQLite verdi; browser navbar/personal-area non eseguiti (Next dev non Ready).

## Prossimi passi
- Ultimo merge `4467b2b5738a515fb19bac59e6d8934b186fb0c3` verificato su GitHub; PR OPEN/MERGEABLE; codice applicativo stabile dopo questo SHA.
- Questo aggiornamento finale riguarda solo handoff; monitorare i check sul suo SHA (non riusare il verde di un vecchio head). Chiudere Diario solo a CI pertinente verde, altrimenti task aperto.
- Revisione cross-modello prima del merge PR (deroga P10 b23782fc già esistente); il merge resta all’utente.

## Blocchi e rischi
- Documenti/basi giuridiche `[DA VALIDARE]`, nessuna pubblicazione automatica; revoca disabilitata se docente non risolto.
- Prove browser/breakpoint e validazione legale restano attività P10 originarie da coordinare col Timoniere.
- Bug SSE registrato e confermato nel Diario: `5218df41-50eb-4164-bd04-22ffafe84a8c` (prova CI job `121217747071`, sync not-linked); nessuna issue manuale.
- Nessun rebuild richiesto per manifest/handoff; nessun deploy, sudo, processo avviato/arrestato o dato modificato.
