# Handoff feature/flat-student-subpages-956 (issue #956)

## Stato
Codice, guard test e docs pronti; commit, push e PR in corso.

## Fatto
- Convertiti i 15 file dello Scope (Card flat, righe con filetto, StatusBadge, Callout, Field/Input/Select/Textarea, ButtonLink, Dialog per il lightbox, EntrySection per «in arrivo»).
- Nuovo guard test `frontend/tests/flat-student-subpages.test.mjs`.
- Docs: `docs-counselorbot/funzionalita-counselorbot.md` (#956).

## Verifiche
- tsc: nessun errore nuovo (restano solo i moduli .png mancanti nel worktree).
- eslint sui file toccati: 0 errori.
- node --test: guard test + 8 test sorgente collegati verdi.
- Non eseguiti: test browser e controllo visivo (nessun dev server su questo Mac, da richiesta).

## Prossimi passi
Commit atomici, push, PR, `make guidance-check`, notifica journal.

## Blocchi e rischi
- `frontend/node_modules` è un symlink al checkout principale (ignorato da git); rimuoverlo a fine lavoro.
- Estrazione di compilazioni in componente non fatta (facoltativa): modifiche in place.
