# Handoff fix/student-breadcrumbs-973

## Stato
Implementazione completa, PR da aprire.

## Fatto
- `ui/AreaBreadcrumbs.tsx` estratto da `TeacherBreadcrumbs` (wrapper, stessi data-testid).
- `PersonalAreaHeader`: riga «← Area studente › sezione» + Privacy come extra.
- `PageHeader`: ritorno su riga propria sopra il titolo.
- `/profilo`: senza `backHref`. i18n `breadcrumbs` in 6 lingue.
- Doc funzionalita aggiornata.

## Verifiche
- tsc: nessun errore nei file toccati (errori preesistenti solo su png/svg mancanti).
- eslint file toccati: 0 errori.
- node 22 test: flat-area-subpages, teacher-breadcrumbs, ui-primitives-tokens, personal-area, flat-isolated-pages: 58 ok.
- `personal-area-header.test.mjs` (browser) aggiornato ma NON eseguito: serve dev server, vietato.
- Nessun controllo visivo.

## Blocchi e rischi
Nessuno.
