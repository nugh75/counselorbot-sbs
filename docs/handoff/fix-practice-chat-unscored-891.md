# Handoff fix/practice-chat-unscored-891

## Stato
Implementato, PR da aprire.

## Fatto
- `practiceNotebookChatHref` e `parsePracticeEntry` in lib/practice-notebooks.ts (+ test).
- page.tsx: ingresso senza `practice_result_id` per strumenti agentOnly; salta la scelta method-select.
- Doc funzionalita aggiornata.

## Verifiche
- node --test practice-notebooks.test.ts: 9 pass. tsc/eslint: vedi PR.
- Nessuna verifica visuale/browser (nessun dev server).

## Prossimi passi
Merge da parte dell'utente.

## Blocchi e rischi
Nessuno.
