# Handoff feature/loading-skeletons-935

## Stato
Implementazione completa, PR da aprire.

## Fatto
- Skeleton a token + SkeletonEntryList/SkeletonText, TypingDots, Spinner/SPIN e prop `busy` in Button.
- 89 `animate-spin` ridotti a Button.tsx; pagine student/teacher con sagome; chat con puntini.
- design.md §4, funzionalita, test src/lib/loading-states.test.ts.

## Verifiche
- tsc senza errori nuovi, eslint sui file toccati, node --test sui test lib, guidance-check ok.
- Nessun controllo visivo (niente dev server).

## Prossimi passi
PR.

## Blocchi e rischi
Spinner nei pulsanti `<button>` grezzi usano `Spinner`, non `Button busy`.
