# Handoff: chore/eslint-773-chat-teacher

## Stato
Completato — tutte le verifiche verdi (ESLint 54 errori <= 54, i18n, next typegen, tsc, 962/962 test CI, guidance-check); pronto per commit, push e apertura PR.

## Fatto
- Rifattorizzati i 9 errori `react-hooks/set-state-in-effect` in Chat/QSA/entry (`privacy/page.tsx`, `unisciti/page.tsx`, `IdeaBranchBar.tsx`, `IdeaBranchTree.tsx`, `IdeaMapPanel.tsx`, `IdeaSourcesPanel.tsx`, `SessionReport.tsx`, `CounselorSelector.tsx`).
- Rifattorizzati i 14 errori `react-hooks/set-state-in-effect` in Teacher area (`AssignmentButton.tsx`, `AssignmentWork.tsx`, `AssignmentsPanel.tsx`, `ClassMeetingsManager.tsx`, `ClassOverviewTab.tsx`, `ClassPathsTab.tsx`, `PracticeNotebooks.tsx`, `PracticeRepertoire.tsx`, `TeacherDevicesPanel.tsx`, `useTeacherResource.ts`).
- Aggiornato `ESLINT_MAX_ERRORS` da `'78'` a `'54'` in `.github/workflows/frontend-lint.yml`.
- Aggiornato `docs-counselorbot/funzionalita-counselorbot.md` per `make guidance-check`.

## Verifiche
- `npx eslint -f json`: 54 errori totali (0 sui 18 file modificati), 55 warning.
- `npm run i18n:check`: 3920 chiavi su 6 lingue OK.
- `npx next typegen && npx tsc --noEmit -p .`: 0 errori.
- `npm run test:ci`: 962/962 passati.
- `make guidance-check`: OK.

## Prossimi passi
- Ondata 2 di #773: risolvere i 54 errori rimanenti in Personal area (15) e Admin panels (39) fino a `ESLINT_MAX_ERRORS: '0'`.

## Blocchi e rischi
Nessuno.
