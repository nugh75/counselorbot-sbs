# Handoff: feature/pqbl-flat-874 (#874)

## Stato
Fatto: PR #883 aperta; main unito (conflitto solo nel doc funzionalità, risolto tenendo entrambi), verifiche ripetute verdi.

## Fatto
- `frontend/src/app/profilo/pqbl/page.tsx`: tutte le `Card` con `variant="flat"`; tolti i riquadri interni
  (tessere del riepilogo, righe per competenza ora `divide-y`, riquadri delle icone dei titoli).
- Restano riquadrati: dropzone, pulsanti di risposta, riscontri, avvisi (`Callout`, banner ripresa).
- Nuovo test di sorgente `frontend/tests/pqbl-flat.test.mjs`.
- `docs-counselorbot/funzionalita-counselorbot.md`: paragrafo #874.
- EntrySection/EntryLink non usati: la pagina non ha elenchi di link.

## Verifiche
- `node --test tests/pqbl-flat.test.mjs` 3/3; eslint OK; tsc OK (solo errori tipi PNG per `next-env.d.ts` assente nel worktree); `make guidance-check` OK.
- Nessun controllo visivo/browser (niente dev server, volume lento).

## Prossimi passi
- Revisione e merge da parte dell'utente.

## Blocchi e rischi
- Nessuno. `tsc` segnala solo PNG guida mancanti nel worktree, non legati a questa modifica.
