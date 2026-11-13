# Handoff feature/class-dropdown-851

## Stato
Implementato, in verifica (npm ci lento sul volume).

## Fatto
- `ClassViewSwitcher` rimosso da Header/HeaderMenu, montato in cima a `/profilo` (solo home, non nelle sotto-aree).
- Etichette i18n x6: «Scegli la tua classe», «Senza classe» (solo `i18n-class-view.ts`; `allTools`/`allInstruments` sono altri concetti).
- `nav.classView` rimosso da `header-navigation`; fixture/test navbar, guide-task, CONTEXT e docs aggiornati.

## Verifiche
Da eseguire: tsc, node --test su src/lib, navbar-visibility e class-path-placement (browser, dev server proprio).

## Prossimi passi
Controllo 390px chiaro/scuro, commit, PR, guidance-check.

## Blocchi e rischi
Nessuno. Rischio merge: piccole modifiche in `app/profilo/page.tsx` (condivisa con #850/#852).
