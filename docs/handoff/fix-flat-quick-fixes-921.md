# Handoff — fix/flat-quick-fixes-921

## Stato
Implementazione completa, PR da aprire (issue #921, mappa #920).

## Fatto
- EntryList: hover con linea inferiore; Button ghost: hover `bg-surface-raised`.
- GoalTree righe con `border-b`, figli con `border-l`; GoalMap senza `shadow-card`; GoalsPanel testi muted.
- `app/not-found.tsx` e `app/error.tsx` (link a `/profilo`).
- ClassPracticeStudents: sezione piatta + RoleBadge test; ClassOverviewTab: EntrySection con 4 EntryLink.
- Test: `frontend/tests/flat-quick-fixes.test.mjs`; doc funzionalità aggiornato.

## Verifiche
- node --test (strip-types): flat-quick-fixes, compass-entry-flat, flat-area-subpages, targeted-goals: 17/17.
- tsc: solo errori preesistenti su PNG mancanti (guide-institutes); eslint: nessun errore.
- Nessun controllo visivo (niente dev server/Docker); personal-goals (browser) non eseguito.

## Prossimi passi
Revisione e merge da parte dell'utente.

## Blocchi e rischi
`node_modules` è un symlink locale al checkout principale (ignorato da git).
