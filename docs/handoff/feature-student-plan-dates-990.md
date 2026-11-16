# Handoff feature/student-plan-dates-990 (#990)

## Stato
Implementato, in verifica finale.

## Fatto
- class-path-schedule.ts: dueHint, dueBeforePlanned (+ test in class-paths.test.ts).
- ClassPathHeroCard: una data per passo (scadenza, altrimenti giorno previsto), cenno relativo, luogo con etichetta, nulla se completato.
- ClassPathsTab: avviso non bloccante scadenza < somministrazione; scheduleHelp aggiornato (6 lingue).
- funzionalita-counselorbot.md aggiornato.

## Verifiche
- node --test class-paths.test.ts: 27 pass. tsc/eslint: vedi PR.
- Nessun controllo visivo (niente dev server).

## Prossimi passi
Push, PR, make guidance-check.

## Blocchi e rischi
Condivide ClassPathHeroCard.tsx con p-attempts: merge origin/main prima della PR.
