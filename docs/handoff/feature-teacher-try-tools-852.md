# Handoff feature/teacher-try-tools-852

## Stato
Codice scritto, NON verificato. PR non aperta, task non chiuso.

## Fatto
- `TryToolsSection.tsx` (blocco crema, voci da `resolveActiveStudentTools` + OBIETTIVO_DOCENZA, link `/?start=<id>`), montato in `TeacherAreaHome` dopo la palestra.
- i18n 6 lingue (`tryToolsTitle`, `tryToolsDescription`).
- `tests/teacher-area-home.test.mjs` aggiornato (ordine h2 + href).

## Verifiche
- Nessuna: `next dev` nel worktree non parte (node_modules symlink al checkout principale; nessun output, porta 3152 non risponde). tsc/eslint lanciati ma lenti.

## Prossimi passi
- Far partire next dev (valutare `npm ci` nel worktree), eseguire `TEACHER_AREA_BASE_URL=... node --test tests/teacher-area-home.test.mjs`, check 390px chiaro/scuro.
- Aggiornare docs-counselorbot/funzionalita-counselorbot.md + CONTEXT.md, `make guidance-check`.
- Commit, push, PR (EN, milestone, Closes #852), notify, update-task.

## Blocchi e rischi
- Ambiente di verifica bloccato; nessun dev process lasciato attivo.
