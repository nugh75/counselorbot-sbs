# P10 — recupero PR #589

## Stato
- Responsabile: s15-fix-589-codex; modello richiesto Codex gpt-6.1-sol, T1, effort medium.
- Task recupero: `2666f647-d62e-478c-ab60-51fa0d693ec5`; task P10 originale: `e9d44ca2-e19b-419b-b925-09744e9add34`.
- Worktree `feature-privacy-p10-consent-ui`, branch `feature/privacy-p10-consent-ui`.
- PR esistente: https://github.com/nugh75/counselorbot-sbs/pull/589 (aperta, nessun merge/deploy autorizzato).
- Ripresa da s14 bloccato dal provider: merge di main `e72cf3fa` in corso, zero file unmerged.

## Fatto
- Verificati status, log, MERGE_HEAD, diff e indice; preservate tutte le modifiche importate dalle PR #590–593.
- Manifest rigenerato: risoluzione staged obsoleta, working tree corretto per prodotto P10 + accesso locale #591.
- Guida e menu account conservano entrambi i lavori; backend P9/P10 non modificato dal merge.
- P10: pagina `/privacy`, documenti/finalità/scelte/condivisione/cronologia, sei lingue; API scelte espone docente/classe solo al soggetto.
- Backup s14 in `/tmp/counselorbot-opencode-handoff-20261025`, non applicato.

## Verifiche
- `make guidance-refresh`, `make guidance-check`, checker `--check --base e72cf3fa`: pass.
- `python3 -m unittest discover -s scripts/tests -p 'test_platform_guidance_check.py'`: 3 pass.
- Diff e diff staged senza errori whitespace; Node 22: 18 test privacy/auth-provider/runtime-config pass; i18n: 3633 chiavi, sei lingue.
- Precedente CI rossa su head `45091d7e`/run `40199013418`: baseline nota, riallineata da #593; non vale come verifica del nuovo head.
- Precedenti prove P10: 11 unit frontend, 26 test P9 SQLite verdi; browser navbar/personal-area non eseguiti (Next dev non Ready).

## Prossimi passi
- Terminare test mirati, includere manifest finale e handoff nel merge commit; push sul branch esistente.
- Monitorare check #589 sul nuovo SHA; chiudere task solo dopo verifica verde pertinente e PR aggiornata.
- Revisione cross-modello prima del merge PR (deroga P10 b23782fc già esistente); il merge resta all’utente.

## Blocchi e rischi
- Documenti/basi giuridiche `[DA VALIDARE]`, nessuna pubblicazione automatica; revoca disabilitata se docente non risolto.
- Prove browser/breakpoint e validazione legale restano attività P10 originarie da coordinare col Timoniere.
- Nessun nuovo bug applicativo osservato; nessun rebuild richiesto per manifest/handoff, nessun processo avviato o arrestato.
