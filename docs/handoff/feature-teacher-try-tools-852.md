# Handoff feature/teacher-try-tools-852

## Stato
Completo, PR aperta. Test browser e controllo a 390px NON eseguiti (dev server non avviabile, volume lento).

## Fatto
- `TryToolsSection.tsx` (blocco crema, catalogo + OBIETTIVO_DOCENZA, link `/?start=<id>`) in `TeacherAreaHome` dopo la palestra.
- i18n 6 lingue; test `src/lib/teacher-try-tools.test.ts`; `tests/teacher-area-home.test.mjs` aggiornato (non eseguito).
- Doc: funzionalita-counselorbot.md.

## Verifiche
- tsc completo: 0 errori. eslint sui file toccati: ok.
- node 22 --test: teacher-try-tools, teacher-area, teacher-area-dark-theme: 13/13.
- make guidance-check: ok.

## Prossimi passi
- Eseguire tests/teacher-area-home.test.mjs e controllo 390px chiaro/scuro con un dev server.

## Blocchi e rischi
- Nessun dev process attivo.
