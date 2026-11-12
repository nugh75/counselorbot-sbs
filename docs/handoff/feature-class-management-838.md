# Handoff — feature/class-management-838 (#838)

## Stato
Completo: test verdi, commit, PR aperta (vedi PR).

## Fatto
- Scheda «Partecipanti e risultati» in tre blocchi: studenti reali (campo email, tinta brand), inviti in attesa (crema docente), studenti di prova (celestino, badge). Solo card e badge tinti.
- `ClassEmailInvitations.tsx` diviso in hook + `ClassAddStudent` + `ClassPendingInvitations`; composizione in `ClassStudentsTab.tsx`; tolto dalla panoramica.
- Nessun backend, nessuna chiave i18n nuova; conteggi invariati (#840).
- Docs: funzionalità, CONTEXT.md.

## Verifiche
- tsc/eslint puliti sui file toccati; `tests/teacher-practice-notebooks.test.mjs` (spunte, classe) verde; 390px chiaro/scuro visto.

## Note
- Il test cercava il titolo con getByText exact, rotto dal badge nel summary: ora usa il summary.
- Provider locale: campo e inviti non compaiono (rotte 404).
