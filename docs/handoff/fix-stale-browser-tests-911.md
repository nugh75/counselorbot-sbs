# Handoff fix/stale-browser-tests-911 (#911)

## Stato
FERMATO per ordine del proprietario (memoria del Mac quasi esaurita): dev server e test arrestati. PR aperta con 'Refs #911'; #911 resta aperta per i file non eseguiti.

## Fatto
- Bug corretti: toast "strumento non abilitato" doppio su ?start/?q/?frozen (`src/app/page.tsx`, guardia consumedQuery); elenchi `EntrySection`/`EntryLink` che uscivano dai 320 px (`grid-cols-1`, riga nome con `flex-wrap`).
- Test riscritti (stale): teacher-area-home, prompt-lab-comparison, student-class-catalog, teacher-practice-notebooks, navbar-visibility, account-onboarding, design-usability, teacher-loading-errors, teacher-notebook-page; import `.js` -> `.ts` in 16 file.
- Doc: `docs-counselorbot/funzionalita-counselorbot.md`; `make guidance-check` ok.
- Diario: 2 bug confermati (toast doppio, overflow 320 px), 1 sospetto (pagina classe perde le bozze a ogni refresh).

## Verifiche
- Verdi: elenco prioritario completo, salvo teacher-loading-errors 17-18.

## Prossimi passi
- Riprendere (di notte, un job alla volta) dai file non eseguiti e dai FAIL del secondo blocco elencati nella PR; con pre-warm di route e immagini.

## Blocchi e rischi
- teacher-loading-errors 17-18 bloccati dal bug sospetto della pagina classe (ClassSettingsPage smonta il form a ogni reload).
- Non eseguibili qui: activities-timeline, assignments, personal-goals, admin-class-settings-live (backend + DB di test); request-origin, stream-proxy (frontend con BACKEND_ORIGIN verso upstream fittizio).
- Ambiente: volume lento, Next dev si riavvia per soglia memoria (8 GB); ottimizzatore immagini a volte bloccato (riavvio + pre-warm delle 79 immagini x 7 larghezze).
