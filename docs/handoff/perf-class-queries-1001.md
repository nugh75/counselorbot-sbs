# Handoff perf/class-queries-1001

## Stato
PR aperta per #1001 (N+1 su elenco classi e scheda studenti).

## Fatto
- `_serialize_groups`: conteggi iscritti/condivisioni/istituti con GROUP BY e IN.
- `get_group_students`: risultati, link Telegram e profili caricati in blocco.
- Test `backend/tests/test_class_query_counts.py`; doc funzionalita aggiornata.

## Verifiche
- pytest: test_class_query_counts, test_class_data_integrity, test_class_settings_admin, test_class_covers verdi (Postgres 15 effimero, rimosso).
- make guidance-check verde.

## Prossimi passi
Merge da parte dell'utente; deploy solo backend.

## Blocchi e rischi
Le decisioni di autorizzazione privacy restano per studente (modulo privacy fuori scope, crea grant): ~5 query/studente residue.
