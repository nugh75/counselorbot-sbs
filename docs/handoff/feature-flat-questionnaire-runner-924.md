# Handoff feature/flat-questionnaire-runner-924

## Stato
Implementazione completa di #924; PR aperta.

## Fatto
- QuestionnaireRunner piatto: item = Card flat fieldset con legend visibile, scala a radio con solo la selezionata in bg-brand-soft, progress bar con border-b, Callout/StatusBadge/ButtonLink/Field al posto dei box scritti a mano.
- Test: tests/questionnaire-runner-flat.test.mjs (asserzioni sul sorgente, nessun vitest nel repo).
- Doc: funzionalita-counselorbot.md.

## Verifiche
- node --test tests/questionnaire-runner-flat.test.mjs: 5/5.
- tsc: nessun errore nel runner (errori preesistenti altrove). eslint: 0 errori. make guidance-check: ok.
- Nessun dev server né Docker: controllo visivo non fatto.

## Prossimi passi
Merge da parte dell'utente.

## Blocchi e rischi
node_modules del worktree è un symlink (non tracciato) a quello del checkout principale.
Test browser (institute-credentials) non rieseguiti: i name/value dei radio sono invariati.
