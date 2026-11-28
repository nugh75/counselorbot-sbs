# Handoff — Condivisione chat con il consiglio di classe (#1027)

## Stato
Implementazione completa sul branch `feature/council-chat-sharing-1027`; test backend e frontend verdi, PR da aprire.

## Fatto
- Tabella `class_council_shares` (whole chat o indici di messaggi dello studente, scadenza 7–90 giorni, revoca).
- Migrazione idempotente `20261128_class_council_shares.py` registrata in `backend/main.py`.
- Rotte: crea/elenca/revoca per il docente che segue lo studente, lettura attiva nel consiglio, lettura per lo studente.
- Autorizzazioni riusate: `_require_visible_group`, `_require_student_result`, `_require_group_member`.
- UI docente «Condividi con il consiglio» nella chat del risultato; sezione «Conversazioni condivise» nel consiglio; riquadro studente «Condiviso con il consiglio di classe».
- i18n in 6 lingue; documentazione in `docs-counselorbot/funzionalita-counselorbot.md`.

## Verifiche
- `pytest backend/tests/test_class_council_shares.py backend/tests/test_class_council.py` su Postgres di test: 11 passed.
- `npm test` (921 test node), `npm run i18n:check`, eslint sui file toccati: verdi.
- `npx tsc --noEmit`: verde dopo aver generato `next-env.d.ts` (gitignored, assente nel worktree).

## Prossimi passi
- Aprire la PR (REST) e aggiungerla al project 5; non mergiare.
- Aggiornare l'handoff a lavoro chiuso.

## Blocchi e rischi
- Estrazione basata sugli indici della conversazione: i log sono append-only, quindi stabili; le risposte del counselor non sono mai selezionabili e la lettura filtra per `username` dello studente.
- Container Postgres effimero `s7-1027-pg` rimosso a fine sessione.
