# Handoff: feature/student-plans-flat-918 (#918)

## Stato
Implementazione completata; PR aperta contro main (milestone UI consistency).

## Fatto
- `ClassPathHeroCard`: `Card` piatta (`as="section" variant="flat"`), classe come etichetta di testo, tappe come righe `divide-y` senza riquadri colorati.
- Stato tappa con i colori di `FlowStepper` (ocra attuale, indaco completate, grigio successive) e riga di stato `data-step-status` al posto delle pillole.
- Storico tentativi a filetti; barra di `PlanActivityFlow` senza riquadro.
- `ClassPathHeroList` e `StudentClassPathsPage` invariati (già piatti: card piatta vuota, avvisi restano avvisi).
- Doc: `funzionalita-counselorbot.md`, `CONTEXT.md`.

## Verifiche
- `node --test --experimental-strip-types tests/flat-area-subpages.test.mjs`: 7/7.
- `tsc --noEmit`: nessun errore nei file toccati (solo errori PNG per `next-env.d.ts` non generato nel worktree).
- eslint sui file toccati: pulito. `make guidance-check`: ok.
- Nessun controllo visivo/browser (volume lento): id `class-step-N`, testid e nomi dei link invariati.

## Prossimi passi
- Revisione e merge della PR dall'app.

## Blocchi e rischi
- La pagina `/profilo/piani-operativi/[pathId]` non esiste: esiste solo `[pathId]/[stepId]` (attività), trattata come pagina del piano.
