# SQL runtime SQLite e PostgreSQL (F1-05f)

`db_compat.dialect_insert(bind, table)` sceglie l'INSERT del dialetto della
Session, Connection o Engine ricevuta. Supporta `values`, `excluded`,
`on_conflict_do_nothing` e `on_conflict_do_update`; gli altri dialetti sollevano
`NotImplementedError`. Usare il bind della richiesta, non il motore globale.
Obiettivi, impostazioni API personali, collegamenti ChatGPT e segnalibri del
forum usano questo helper. Il modulo non importa servizi AI, rete o dati forum;
il gate AST privacy ammette esplicitamente questa dipendenza SQL.

I costi admin sono aggregati in SQL sul database della sessione: PostgreSQL
conserva la funzione nativa; SQLite usa `strftime` e modificatori disponibili
dalla versione minima 3.35. Le settimane iniziano lunedì e conservano etichette
ISO anche a cavallo d'anno; mesi e anni iniziano al primo giorno. Le stringhe
SQLite sono lette come datetime prima della serializzazione della risposta.
Il contratto HTTP (`period`, `start`, `cost`, `turns`) resta invariato.

Gli indici univoci delle prenotazioni incontro includono `status = 'active'`
su entrambi i dialetti: le cancellazioni restano nello storico e non bloccano
una nuova prenotazione. Nessuna migrazione PostgreSQL necessaria. `create_all`
crea gli indici corretti sui nuovi file SQLite; non sostituisce indici già
presenti su file sperimentali creati prima di questa correzione. La riparazione
di tali file richiede una migrazione separata; non cancellare dati.

Il segnalibro forum usa l'ora del database anche su SQLite. Le altre chiamate
forum a `statement_timestamp` restano fuori da F1-05f e devono ancora essere
rese portabili; questo task non dichiara completata la compatibilità del forum.

Verifica mirata, da ripetere con `TEST_DB=postgres` su `counselorbot_test`:

```sh
TEST_DB=sqlite python3 -m pytest backend/tests/test_runtime_sql_compat.py \
  backend/tests/test_sqlite_create_all.py backend/tests/test_db_compat.py -q
TEST_DB=sqlite python3 -m pytest backend/tests/test_forum.py \
  -k read_marker_upsert -q
```

La suite usa database temporanei SQLite o schemi PostgreSQL con rollback.
La Guida interfaccia non richiede modifiche: nessun controllo o flusso UI cambia.
