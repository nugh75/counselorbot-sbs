# Aggiornamenti dello schema SQLite (F1-05g)

ADR-0003 §3.3-§3.4. Un file SQLite desktop nasce con `create_all`; quando l'app si
aggiorna, `create_all` non cambia le tabelle che esistono già. SQLite non ha
`ALTER COLUMN` né `ADD/DROP CONSTRAINT`: vincoli, nullabilità e tipi si cambiano
ricostruendo la tabella. `backend/sqlite_schema.py` lo fa con
`alembic.operations.Operations.batch_alter_table` usato come libreria: nessuna
catena di revisioni Alembic, nessuna cartella `alembic/`. Postgres non cambia.

## `sqlite_rebuild_table(engine, table, **batch_kwargs)`

Context manager per le migrazioni doppie: produce l'oggetto batch di Alembic
(`alter_column`, `create_check_constraint`, `drop_constraint`,
`create_foreign_key`, …) e alla chiusura ricostruisce la tabella in una sola
transazione (tabella nuova, copia dei dati, rinomina).

- `PRAGMA foreign_keys=OFF` prima del `BEGIN` e ripristino alla fine: con le
  chiavi esterne attive il `DROP TABLE` della vecchia tabella cancellerebbe a
  cascata le righe figlie.
- `PRAGMA foreign_key_check(<tabella>)` prima del commit: una violazione annulla
  la ricostruzione (`RuntimeError`).
- Con `copy_from=<Table del modello>` la tabella nasce dal modello; gli indici
  `Column(index=True)`, che Alembic in questo caso salta, sono ricreati nella
  stessa transazione. Gli indici parziali `sqlite_where` restano.
- Solo SQLite (`NotImplementedError` altrove). Nel ramo Postgres della migrazione
  restano `ALTER TABLE … ALTER COLUMN / ADD CONSTRAINT`.

```python
from backend.db_compat import is_sqlite
from backend.sqlite_schema import sqlite_rebuild_table

if is_sqlite(engine):
    with sqlite_rebuild_table(engine, "legacy_rows") as batch:
        batch.alter_column("label", existing_type=String(20), nullable=True)
```

## Sincronizzazione dei CHECK all'avvio

`main.py`, dopo le migrazioni: `sync_sqlite_check_constraints(engine, Base.metadata)`.
Per ogni tabella del modello presente nel file confronta i CHECK riflessi da
`sqlite_master` (nome e testo, spazi normalizzati) con quelli del modello; se
differiscono ricostruisce la tabella da `copy_from=<modello>`. Su un file nuovo
o già allineato non tocca nulla (solo letture del catalogo). Su Postgres è un no-op.

Le colonne del file devono coincidere con quelle del modello: se no l'avvio si
ferma con `RuntimeError` («align them with a dual migration»), senza modifiche.
Una colonna nuova va quindi aggiunta prima, da una migrazione doppia
(`db_compat.add_column_if_missing`), che gira prima della sincronizzazione.

Limiti: si confrontano solo i CHECK. Indici di file sperimentali creati prima di
F1-05f (prenotazioni senza `WHERE`) cambiano solo se la tabella viene ricostruita
per un CHECK; altrimenti serve una migrazione dedicata. Il backup prima di
migrare è del guscio (F1-05j, F1-16).

## Dipendenze e pacchetto desktop

`alembic>=1.13,<2` in `backend/requirements.txt` (puro Python, porta Mako).
`desktop/teacher/scripts/build-backend.sh` aggiunge `--collect-submodules alembic`.

## Verifica

```sh
TEST_DB=sqlite python3 -m pytest backend/tests/test_sqlite_schema_updates.py \
  backend/tests/test_sqlite_create_all.py backend/tests/test_db_compat.py -q
```

La fixture `previous_sqlite` crea un file con il CHECK `class_path_step_target`
di una versione precedente, un percorso, due passi e un progresso figlio
(`ON DELETE CASCADE`): il test verifica rifiuto del tipo `pending` prima,
ricostruzione all'avvio, dati e figli conservati, nuovo CHECK attivo, indici
uguali a `create_all` e seconda sincronizzazione senza lavoro. Il probe di doppio
avvio SQLite (`docs/operations/dual-db-ci.md`) resta verde.
