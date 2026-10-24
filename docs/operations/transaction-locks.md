# Lock di transazione portabili (F1-05d)

`backend.db_compat.xact_lock(db, *parts)` accetta una `Session` o una
`Connection` SQLAlchemy e almeno una parte identificativa. Tutti i percorsi
che proteggono la stessa risorsa devono passare le stesse parti, nello stesso
ordine. Le parti diventano stringhe separate da `:` e codificate UTF-8;
Blake2b con digest di 8 byte produce un intero signed big-endian a 64 bit.
Su Postgres l'helper esegue un advisory lock di transazione parametrizzato.

```python
from backend.db_compat import xact_lock

xact_lock(db, "assignment", username, request_id)
# Controllo di idempotenza e scrittura nella stessa transazione.
db.commit()  # anche rollback/close liberano il lock
```

Su SQLite il registro usa riferimenti deboli a `threading.Lock`, protetti da
un mutex globale. Il proprietario e i thread in attesa mantengono riferimenti
forti; le chiavi inutilizzate non restano nel registro. La stessa transazione
può prendere più lock e riacquisire la stessa chiave senza bloccarsi.

Per le sessioni, il rilascio segue `after_transaction_end` della transazione
esterna: copre commit, rollback e chiusura, senza rilasciare i lock al termine
di un flush o di un savepoint. Per le connessioni si usano gli eventi
`commit`/`rollback`; i savepoint non li attivano. L'helper seleziona l'opzione
`sqlite_begin="IMMEDIATE"` del motore F1-05b per le transazioni successive;
un'eventuale transazione già aperta non viene riavviata. I chiamanti che
leggono prima del lock devono quindi aprire già una sessione di scrittura
(`write_session()` per i job, `get_db` per POST/PUT/PATCH/DELETE). Non tenere
transazioni di scrittura aperte durante chiamate ai modelli (ADR-0003 §4.3).

I salvataggi di workspace, le copie nella timeline e le importazioni della
timeline personale condividono `("visual-workspace", username, session_id)`;
per il workspace personale `session_id` è `None`.

## Un solo worker SQLite

Il desktop deve usare un solo processo backend. `check_sqlite_workers()`
viene eseguito durante la configurazione del motore SQLite e a ogni lock:
solleva `RuntimeError` se `WEB_CONCURRENCY` o `UVICORN_WORKERS` supera 1,
oppure se `--workers`/`-w` negli argomenti del processo o in
`GUNICORN_CMD_ARGS` configura più worker. Questi controlli non limitano
Postgres. Eventuali launcher programmatici devono mantenere lo stesso
contratto: non avviare più processi indipendenti sullo stesso file SQLite.
Il comando Docker server predefinito con quattro worker richiede Postgres;
per SQLite avviare esplicitamente Uvicorn con `--workers 1`.

## Verifica

Usare la venv del progetto (Python ≥ 3.10).

```sh
PYTHONPATH=. pytest backend/tests/test_xact_lock.py
TEST_DB=sqlite python3 -m pytest backend/tests/test_xact_lock.py
python3 scripts/check-sql-portability.py
```

La suite controlla esclusione reciproca tra thread, chiavi indipendenti,
commit/rollback/close, savepoint, riacquisizione, riuso del proprietario,
worker e chiavi Blake2b. Con `DATABASE_URL` del Postgres di test esegue anche
le prove con due connessioni reali; senza Postgres queste prove sono saltate.
Le migrazioni legacy restano solo Postgres; il lock di sessione che serializza
l'avvio in `main.py` resta distinto dai lock di transazione.
