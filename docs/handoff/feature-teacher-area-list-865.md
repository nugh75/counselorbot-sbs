# Handoff feature/teacher-area-list-865 (#865)

## Stato
Codice, test e doc pronti; commit e PR da aprire/aperti (vedi PR).

## Fatto
- `EntryLink`: prop opzionale `illustration` (al posto di `image`).
- `/docente`: Progettazione didattica, Le mie classi (una voce), Palestra, Prova gli strumenti (ToolIllustration), Risorse come elenchi piatti.
- `classi` tolto dal gruppo «Classe» per non duplicare la voce.
- Test `frontend/tests/teacher-area-home.test.mjs` aggiornato (vecchi riquadri, zero-state, schede classe, retry rimossi).

## Verifiche
tsc ed eslint sui file toccati; test Playwright aggiornato ma non eseguito (nessun dev server su volume lento).

## Prossimi passi
Controllo visivo da parte dell'utente.

## Blocchi e rischi
Nessun controllo visivo eseguito.
