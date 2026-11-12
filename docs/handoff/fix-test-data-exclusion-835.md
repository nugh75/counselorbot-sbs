# Handoff — fix/test-data-exclusion-835 (#835)

## Stato
Completo: test verdi, commit e PR aperta.

## Fatto
- `backend/test_accounts.py`: un solo punto per i dati di prova (`is_test_member`, `real_membership()`, `real_log()`).
- Iscritti, elenchi studenti (classe e piano), noticing, consiglio di classe, obiettivi condivisi, consiglio orientativo: esclusi account demo e proprietario della classe (in lettura, nessuna migrazione).
- Bug 2: `/groups/join` risponde 403 al proprietario e agli account demo.
- Bug 3: `/admin/logs/stats` e `/admin/logs/export` escludono turni di prova e demo (viewer log e costi invariati: spesa reale).
- Bug 1: avvio di uno strumento senza punteggi in prova non salva più un risultato vuoto sul docente (`frontend/src/app/page.tsx`, helper `isPracticeRun`).

## Verifiche
- Prima della correzione: 7/8 test di `backend/tests/test_test_data_exclusion.py` falliscono (i tre bug riprodotti).
- Dopo: 8/8; con `test_class_council`, `test_orientation_recommendation`, `test_class_settings_admin` 61 verdi (Postgres di test isolato, poi rimosso).
- `make guidance-check` ok; `check-sql-portability` ok.
- `frontend/src/lib/notebook-context.test.ts`: 6/6.

## Prossimi passi
Merge della PR da parte dell'utente; deploy con rebuild --no-deps del frontend.

## Blocchi e rischi
- Iscrizioni via Telegram del proprietario non bloccate in scrittura, ma escluse in lettura.
