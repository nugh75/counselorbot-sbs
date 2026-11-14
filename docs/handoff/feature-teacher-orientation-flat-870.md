# Handoff — feature/teacher-orientation-flat-870 (#870)

## Stato
Completato in locale; PR da aprire.

## Fatto
- `GoalCatalogEditor`: `Card` piatta, form senza fieldset sunken, proposte condivise a filetti.
- `docente/orientamento`: righe categorie/archiviate a `divide-y`, moduli senza box, `details` con filetto.
- Invariati: menu azioni (popover), avviso errore `warning-soft`, bottoni, navbar.
- Doc: `docs-counselorbot/funzionalita-counselorbot.md` (#870).
- Test: nuovo caso in `frontend/tests/flat-area-subpages.test.mjs`.

## Decisioni
- Nessun `EntrySection/EntryLink`: pagine di editing, non indici di link.
- `GoalCatalogEditor` è usato anche in `GoalDraftCard` (chat): lì perde il box esterno.

## Verifiche
- `node --test` flat-area-subpages (node 22): 6/6.
- tsc: nessun errore nei file toccati (solo PNG guida mancanti, preesistenti).
- Nessun controllo visivo (nessun dev server). `institution-categories.test.mjs` è un test browser, non eseguito.

## Blocchi e rischi
- Worktree senza `node_modules`: symlink temporaneo al checkout principale, da rimuovere.
