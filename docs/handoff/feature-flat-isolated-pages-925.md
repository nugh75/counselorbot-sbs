# feature/flat-isolated-pages-925

## Stato
Implementazione completa, PR da aprire (issue #925, mappa #920).

## Fatto
- `/gruppo`: PageHeader, Callout success, ButtonLink.
- `ClassCouncilView`: sezioni piatte con filetto, Field/Input, StatusBadge, token brand.
- `/privacy` e `components/privacy/*`: via glass-panel e dark:, StatusBadge, Button, Field/Select/Input, DocumentViewer su Dialog.
- `size="sm"` -> `md` in ForumView, TeacherDevicesPanel, ClassMeetingsManager, MeetingDetails, LearnerProfileCard, ClassImageModal.
- Test: `frontend/tests/flat-isolated-pages.test.mjs`; doc funzionalita aggiornato.

## Verifiche
- tsc: nessun errore nei file toccati (solo errore preesistente in field-wiring.test.ts).
- eslint sui file toccati: 0 errori (2 warning preesistenti).
- node --test tests/flat-isolated-pages.test.mjs: 3/3.
- Nessun controllo visivo (niente dev server, come da istruzioni).

## Prossimi passi
Controllo visivo da parte dell'utente su /gruppo, /consiglio/<token>, /privacy.

## Blocchi e rischi
Nessuno. `frontend/node_modules` e un symlink locale (ignorato da git).
