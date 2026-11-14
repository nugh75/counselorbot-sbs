# Handoff — feature/practice-gym-restyle-892 (#892)

## Stato
In corso: codice scritto, verifiche in esecuzione.

## Fatto
- `/docente/taccuini-prova`: elenco piatto `EntrySection`/`EntryLink` (avatar, nome, badge «prova», stato profili/chat aperte), archiviati in sezione sotto, «Nuovo studente di prova».
- Nuova pagina `/docente/taccuini-prova/[id]`: Avvia una chat (tutti gli strumenti), Chat guidate di prova, Profili nei questionari, Chi è, Classi, Archivia.
- Helper `practiceNotebookHref`, `practiceNotebookIdFromHash`, `practiceToolEntry` + unit test.
- Vecchie ancore `#practice-notebook-{id}` → redirect alla pagina.
- PracticeChats/PracticeRepertoire: righe piatte, azioni come link; repertorio con `onResults` e `newProfileType`.
- Docs: funzionalita, CONTEXT, operations/teacher-practice-notebooks.

## Verifiche
- `node --test src/lib/practice-notebooks.test.ts`: 11/11 verdi.
- tsc/eslint: in corso.
- Test browser `tests/teacher-practice-notebooks.test.mjs` aggiornati ma NON eseguiti (niente next dev sul volume lento).

## Prossimi passi
Commit atomici, push, PR verso main (milestone UI consistency).

## Blocchi e rischi
- Test browser non eseguiti: da verificare in CI o con un dev server.
- Worktree: `frontend/node_modules` è un symlink al checkout principale (gitignored).
