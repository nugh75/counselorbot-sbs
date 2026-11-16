# Handoff fix/protect-cover-memory-999 (#999)

## Stato
Codice, test e doc pronti; PR da aprire.

## Fatto
- `groups.py`: copertina solo per iscritti/docenti/admin, cache private; rimossa `/groups/info`.
- `memory.py`: `GET /memory/user/{id}` solo al proprietario.
- Test: `backend/tests/test_group_cover_memory_access.py`.

## Verifiche
- pytest (py3.11, Postgres 15 temporaneo): 8 nuovi + test_class_access_writes verdi.
- Frontend non modificato: i chiamanti usano cookie same-origin; `memory/user` gestisce !ok. Nessun controllo visivo.

## Prossimi passi
Merge di origin/main, PR, deploy solo backend.

## Blocchi e rischi
Nessuno. Ruff ha errori B008 preesistenti.
