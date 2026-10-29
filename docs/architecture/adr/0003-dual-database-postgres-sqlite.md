# ADR-0003 — Doppio database: Postgres per server e portable, SQLite per le app desktop

- Stato: **Sostituito da [ADR-0004](0004-postgresql-only-runtime-and-desktop-layout-2.md)** (2026-10-26).
  La decisione del 24/10 e le misure restano come storia e descrivono i bundle layout 1, inclusa `v0.1.1`.
- Sostituisce: decisione D4 del piano (Postgres incorporato) e lo spike [F0-02](../spikes/f0-02-embedded-postgres.md) come scelta per il desktop.
- Collegati: [ADR-0001](0001-installation-profiles-and-desktop-packaging.md), [ADR-0002](0002-desktop-phase-1-contracts.md); compiti F1-05a..j del piano.

## Contesto

Il piano (§3.3) aveva scelto Postgres incorporato perché il backend usa costrutti Postgres in molti punti.
L'utente ha deciso diversamente: **server e portable restano su Postgres 15; le app desktop (docente e studente)
usano SQLite; il backend deve essere compatibile con entrambi, con test su tutti e due in CI.**
Questo ADR misura cosa è specifico di Postgres, decide una strategia per ogni categoria e fissa come gira la CI.

## 1. Come è stato misurato

Base: `main` @ `b69e591a`. Due misure:

1. **Statica** — `git grep` sui `.py` di `backend/` esclusi i test (253 file). I conteggi includono commenti e righe
   già protette da controlli di dialetto: indicano il lavoro, non il numero di errori.
2. **Dinamica** — avvio reale su SQLite: `scripts/spikes/f0-04-sqlite-startup-probe.py` importa `backend.main`
   (che esegue `create_all` e le 23 migrazioni di `backend/migrations/`) e poi `_seed_and_migrate()` su un file SQLite nuovo,
   registrando **ogni** errore del database, anche quelli che il codice inghiotte con `try/except`.
   Python 3.11.9, SQLAlchemy 2.0.55, SQLite 3.51.0, macOS arm64.

```bash
PYTHONPATH=. python3 scripts/spikes/f0-04-sqlite-startup-probe.py --data /tmp/cb-sqlite   # cartella nuova
```

### Esito dinamico

| Passo | Esito su SQLite |
|---|---|
| import di `backend.main` (`create_all` + migrazioni) | ✅ **112 tabelle**, 14–47 s in 4 esecuzioni (Mac da 8 GB con altri processi) |
| `_seed_and_migrate()` senza aiuti | ❌ si ferma al primo statement: `backend/personal_api.py:194` `ALTER TABLE counselors ADD COLUMN IF NOT EXISTS …` → `near "EXISTS": syntax error` (lo stesso errore visto da F0-01, B2) |
| `_seed_and_migrate()` con le sole due neutralizzazioni della sonda (`ADD COLUMN IF NOT EXISTS` → no-op se la colonna c'è; `pg_advisory*` → `SELECT 1`) | ✅ **seed completo in 5,4–7,9 s** (2 esecuzioni), database di 4,9 MB |
| errori inghiottiti durante il seed | 71 punti: **66** `duplicate column name` (ALTER di colonne già create da `create_all`: innocui), **5** sintassi Postgres (`main.py:539` e `:694` `ALTER COLUMN … DROP NOT NULL`, `main.py:824` `ALTER COLUMN … TYPE JSON USING`, `main.py:832` `'["*"]'::json`, `main.py:899` `ADD CONSTRAINT … UNIQUE`): innocui su un database **nuovo**, perché `create_all` ha già lo schema finale |

Statement Postgres-only eseguiti all'avvio: **6 punti in 3 file**. **2 bloccano** l'avvio (`personal_api.py:194`, `:196`,
in `ensure_schema` senza `try`); 3 hanno un ripiego con `ADD COLUMN` semplice (`counselor_identity.py:696-698`);
1 è inghiottito (`main.py:659`: su un database **esistente** la colonna non verrebbe aggiunta, in silenzio).
Gli advisory lock dell'avvio sono già tutti protetti.

**Conclusione della misura**: un database SQLite **nuovo** è a pochi giorni di lavoro. Il costo vero è altrove:
(a) le **rotte** che a runtime usano SQL Postgres non protetto, (b) gli **aggiornamenti** di un database SQLite
esistente quando la madre cambia vincoli o tipi, (c) la **semantica** che SQLite non replica (lock, fusi orari,
chiavi esterne, indici parziali), (d) una suite di test oggi **solo Postgres** (`CONTEXT.md:728`: «never SQLite»;
72 file di test usano `backend/tests/artifact_database.py`, che richiede `psycopg2` e schemi Postgres).

## 2. Inventario e strategia

Legenda strategia: **P** = SQLAlchemy portabile (un solo codice), **D** = ramo per dialetto dietro un helper,
**R** = funzionalità ridotta o assente su desktop, **—** = nessuna azione.

### 2.1 Schema e migrazioni

| Costrutto | Misura | Dove (esempi) | Su SQLite | Strategia | Compito |
|---|---|---|---|---|---|
| `ALTER TABLE` (totale) | 104 righe, 27 file | 23 in `backend/main.py` | vedi righe sotto | — | — |
| `ADD COLUMN IF NOT EXISTS` | 49 righe, 24 file | `personal_api.py:194`, `counselor_identity.py:696-698`, `main.py:659` | **errore di sintassi**: blocca l'avvio o viene inghiottito (colonna mancante dopo un aggiornamento) | **P**: helper `add_column_if_missing(conn, table, column)` con `sqlalchemy.inspect`; DDL del tipo compilata per dialetto | F1-05c |
| `ADD COLUMN` dentro `try/except` | 125 righe totali di `ADD COLUMN`, 26 file | `main.py:539`, `:706`, `:751`, `:787` | funziona; 66 errori «duplicate column» inghiottiti al primo avvio | **P**: passare all'helper quando si tocca il file (non obbligatorio) | F1-05c |
| default `'[]'::json` | 3 righe | `main.py:535`, `counselor_identity.py:697`, `main.py:832` | errore (`::`) | **P**: default `'[]'` senza cast | F1-05c |
| `ALTER COLUMN` (DROP NOT NULL, SET DEFAULT, TYPE … USING) | 8 righe, 5 file | `main.py:539`, `:694`, `:824`; `migrations/20261009_institute_credentials.py:136-137` | non supportato | DB nuovo: non serve (schema da `create_all`). Aggiornamenti: **D** con ricostruzione tabella (§3) | F1-05g |
| `ADD/DROP CONSTRAINT` (CHECK, UNIQUE, FK) | 25 righe, 15 file | `class_path_step_target` ridefinito in 8 migrazioni (es. `migrations/20261021_personal_results_chats.py:38-39`) | non supportato | **D** ricostruzione tabella; **sincronizzazione dei CHECK** all'avvio (§3) | F1-05g |
| `CREATE INDEX IF NOT EXISTS`, `DROP INDEX IF EXISTS` | 23 + 1 righe, 5 file | `main.py:673-683`, `:794-799` | supportato | — | — |
| indice unico **parziale** `postgresql_where` | 2 | `models.py:2086`, `:2088` (prenotazioni attive per slot) | creato **senza** `WHERE`: una prenotazione annullata impedisce di riprenotare lo slot | **P**: aggiungere `sqlite_where` (SQLite supporta gli indici parziali) | F1-05f |
| `pg_constraint`, `pg_get_constraintdef`, `::regclass`, `information_schema` | 13 righe, 12 file | tutte nelle migrazioni | errore | **R**: migrazioni legacy solo Postgres (già protette, §2.6) | — |
| `DO $$ … $$` (PL/pgSQL) | 2 | `migrations/20261011_reasoning_levels.py:18`, `migrations/20261011_unified_ai_sources.py:15` | errore | **R**: legacy solo Postgres (protette) | — |
| `CREATE TABLE … SERIAL / TIMESTAMP WITH TIME ZONE DEFAULT now()` | 1 blocco | `main.py:418-438` | ha già il ramo SQLite (`main.py:429`) | — | — |
| `DISTINCT ON`, `::text` in migrazioni dati | 3 | `main.py:566`, `:598`, `:617` | errore | dentro un blocco solo Postgres (`main.py:556`): migrazione legacy | — |

### 2.2 Lock e concorrenza

| Costrutto | Misura | Dove | Su SQLite | Strategia | Compito |
|---|---|---|---|---|---|
| `pg_advisory_xact_lock` / `pg_advisory_lock` / `pg_try_advisory_lock` | 39 righe, 38 file; 41 controlli `dialect.name` in 36 file | protetti: `timeline.py:99-101`, `main.py:353-355`, `prompt_lab/worker.py:825-826`, 22 migrazioni | `no such function` (misurato) | **D**: helper unico `xact_lock(db, *parti)` (§4.2) | F1-05d |
| ↳ **non protetti** (errore a runtime su SQLite) | **5** | `personal_api.py:63` (+`hashtext`), `qpcc_alignment.py:114`, `routes/assignments.py:136`, `routes/external_privacy.py:44`, `routes/institutions.py:221` (+`hashtext`) | errore 500 | **D**: stesso helper; chiave calcolata in Python, niente `hashtext` | F1-05d |
| `with_for_update()` / `FOR UPDATE` | 58 righe, 31 file | | SQLAlchemy lo omette su SQLite: nessun lock di riga; le scritture sono serializzate dal lock del database | **P** + misura sotto carico | F1-05h |
| `skip_locked=True` | 1 | `prompt_lab/worker.py:167` | omesso | **R**: Prompt Lab escluso dal desktop | F1-05i |
| scritture concorrenti (thread del pool FastAPI, cicli `_memory_cleanup_loop`/`_log_retention_loop`) | — | `main.py:247-248` | `database is locked` senza attesa | **P**: WAL + `busy_timeout` (§4.1) | F1-05b, F1-05h |
| più worker uvicorn | — | `main.py:202-211` (create_all concorrente) | — | desktop: **1 worker** per contratto (ADR-0002 §2.1) | — |

### 2.3 Upsert, JSON, array, sequence, funzioni

| Costrutto | Misura | Dove | Su SQLite | Strategia | Compito |
|---|---|---|---|---|---|
| `sqlalchemy.dialects.postgresql.insert` + `on_conflict_do_*` | 4 file | `chatgpt_connections.py:20` (`:83`, `:210`, `:213`), `goals.py:360`, `personal_api.py:6`, `routes/forum.py:8` | **compila ed esegue** (misurato: `ON CONFLICT ("key") DO NOTHING / DO UPDATE`); richiede SQLite ≥ 3.24 | **P**: helper `dialect_insert(db)` (`sqlite.insert` / `postgresql.insert`) per non dipendere dalla compilazione incrociata | F1-05f |
| `ON CONFLICT` testuale | 2 | `migrations/20261011_unified_ai_sources.py:34`, `:39` | supportato | legacy solo Postgres | — |
| colonne `JSON` | 94 in `models.py` | | testo JSON | **P** (già portabile) | — |
| `JSONB`, operatori `->`, `->>`, `@>` | `jsonb` 2 righe (solo `prompt_lab/provision.py:20`, `:26`), operatori **0** | | — | **R** (Prompt Lab) | — |
| `ARRAY`, `array_agg`, `unnest`, `= ANY` | **0** (le 8 righe trovate sono `any(` di Python) | | — | — | — |
| sequence (`nextval`, `setval`, `Sequence(`) | **0** nel backend (`check_sequences.py` nella radice del repo è uno strumento solo Postgres) | | rowid | — (nota: SQLite può riusare l'id più alto dopo una cancellazione; nessun codice trovato che lo escluda) | — |
| cast `::interval` + `now()` | 3 | `chat_logic.py:171`, `routes/admin.py:324`, `:338` | errore | già con ramo SQLite (`chat_logic.py:168-177`, `routes/admin.py:320`, `:335`) | — |
| `date_trunc` | 2 | `routes/admin.py:570` (protetto), **`routes/admin.py:659` non protetto** (costi per settimana/mese/anno) | `no such function` (misurato) | **D**: `strftime` su SQLite | F1-05f |
| `hashtext` | 2 | negli advisory lock non protetti | `no such function` | vedi F1-05d | F1-05d |
| `ilike` | 12 righe, 5 file | `routes/admin.py:99-214`, `routes/portfolio.py:77-79` | SQLAlchemy usa `lower() LIKE lower()`: funziona, ma `lower()` di SQLite piega solo l'ASCII («È» ≠ «è») | **R** accettata (ricerca meno tollerante sulle maiuscole accentate) | — |
| `nullslast()`, `IS DISTINCT FROM` | 1 + 0 a runtime | `routes/administration_plans.py:316` | supportati (misurato) | — | — |
| `LISTEN/NOTIFY`, full-text (`tsvector`, `to_tsquery`, `pg_trgm`) | **0** | | — | — | — |
| trigger PL/pgSQL, `GRANT` | 1 file | `prompt_lab/provision.py:9-30` (si rifiuta già se non Postgres) | — | **R** (Prompt Lab) | F1-05i |

### 2.4 Tipi e semantica

| Costrutto | Misura | Su SQLite | Strategia | Compito |
|---|---|---|---|---|
| `DateTime(timezone=True)` | **161** colonne in `models.py`; 64 chiamate `datetime.now(timezone.utc)` in 37 file | restituisce datetime **senza fuso** anche se salvato con fuso (misurato): confronti e sottrazioni con datetime «aware» → `TypeError` | **P**: `TypeDecorator` `UTCDateTime` con `impl = DateTime(timezone=True)` (salva in UTC, restituisce sempre aware UTC) al posto di `DateTime(timezone=True)`; su Postgres la DDL resta identica (`TIMESTAMP WITH TIME ZONE`): nessuna migrazione | F1-05e |
| chiavi esterne | 58 `ForeignKey(` in `models.py`, 53 con `ondelete=` | **ignorate** di default: niente `ON DELETE CASCADE/SET NULL`, righe orfane | **P**: `PRAGMA foreign_keys=ON` a ogni connessione | F1-05b |
| `CheckConstraint` | 20 in `models.py` | creati da `create_all` (misurato); ridefinirli richiede ricostruzione | vedi §3 | F1-05g |
| lunghezze `String(n)` | — | non applicate | — (dove conta ci sono già `CHECK length(...)`, es. `models.py:2141`) | — |
| ordinamento del testo | — | collazione `BINARY` vs `en_US.utf8` di produzione | **R** accettata (ordine di maiuscole/accenti diverso) | — |
| `Boolean` con `server_default=text("false")` | — | accettato (misurato con `create_all`) | — | — |

### 2.5 Fuori dal database ma bloccante per il desktop

| Costrutto | Dove | Effetto | Compito |
|---|---|---|---|
| `import fcntl` | `rag_index.py:10`, `rag_reindex_job.py:12` (misura a `b69e591a`) | su Windows `backend.main` non si importava (F0-01 B1) | **F1-18, fatto** (#513): `backend/file_lock.py`, lock esclusivo `msvcrt` su Windows |

### 2.6 Migrazioni legacy

22 dei 23 file di `backend/migrations/` iniziano con `if dialect.name != "postgresql": return`; il ventitreesimo
(`20260206_institution_code_password.py`, `information_schema` e segnaposto `%s`) non è chiamato da nessuna parte.
Portano schemi Postgres **vecchi** allo schema attuale: su SQLite non servono, perché ogni database SQLite nasce
con lo schema corrente. **Restano solo Postgres.**

## 3. Strategia per le migrazioni

1. **Base SQLite = `create_all`**: un database desktop nasce sempre con lo schema della versione installata.
   Le migrazioni legacy restano solo Postgres.
2. **Da ora ogni migrazione nuova è doppia**: funziona su entrambi i dialetti oppure ha due rami espliciti
   (`if is_sqlite(conn)`), con un test per ciascuno. Si scrive con gli helper di `backend/db_compat.py` (nuovo, F1-05c):
   `add_column_if_missing`, `is_sqlite`/`is_postgres`, `xact_lock`, `dialect_insert`.
3. **Vincoli, nullabilità e tipi su SQLite**: ricostruzione della tabella con **`alembic.operations.Operations.batch_alter_table`**
   usato come libreria (crea la tabella nuova dal modello, copia i dati, rinomina), **senza** adottare la catena di revisioni
   di Alembic. Dipendenza nuova: `alembic` (puro Python).
4. **Sincronizzazione dei CHECK all'avvio (solo SQLite)**: per le tabelle con `CheckConstraint` (es. `class_path_steps`,
   `class_meetings`, forum) si confronta la definizione in `sqlite_master` con quella del modello; se diversa, ricostruzione.
   Evita il caso più probabile: un `CHECK` vecchio che rifiuta un tipo di passo nuovo dopo l'aggiornamento dell'app.
5. **Backup prima di migrare**: il guscio copia il database (API di backup di SQLite) prima di avviare una versione nuova (F1-05j, F1-16).

Alembic completo per entrambi i dialetti è stato considerato e **scartato per ora**: richiede di convertire 23 migrazioni
e le decine di blocchi idempotenti di `main.py`, con rischio sulla produzione, senza vantaggi per il desktop
che nasce sempre dallo schema corrente.

## 4. Configurazione e concorrenza su SQLite

### 4.1 Motore

`backend/database.py` (oggi `:11-18` imposta solo `check_same_thread=False`), a ogni connessione SQLite:

```
PRAGMA journal_mode=WAL;      -- letture e una scrittura in parallelo
PRAGMA busy_timeout=5000;     -- attende invece di fallire subito con "database is locked"
PRAGMA foreign_keys=ON;       -- stesse cascate di Postgres
PRAGMA synchronous=NORMAL;    -- sicuro con WAL
```

e all'avvio un controllo della versione: **SQLite ≥ 3.35** (RETURNING, `DROP COLUMN`, upsert), altrimenti codice di uscita 3.
Il `sqlite3` incluso da Python 3.12 nelle build PyInstaller soddisfa il requisito (da verificare in F1-05b sui 4 runner).

### 4.2 Lock

- **Postgres**: `xact_lock(db, "assignment", username, request_id)` → `pg_advisory_xact_lock(<int64>)` con chiave da
  `blake2b(…, digest_size=8)` calcolata in Python (sostituisce `hashtext`).
- **SQLite**: lock **in processo** per chiave (`threading.Lock` in un registro con riferimenti deboli), preso al momento
  della chiamata e rilasciato sugli eventi `after_commit` / `after_rollback` della sessione. Equivale all'advisory lock
  **perché il desktop ha un solo processo** (1 worker, ADR-0002 §2.1); l'helper rifiuta di partire su SQLite con più worker.
- `with_for_update()` resta: su Postgres blocca la riga, su SQLite le scritture sono comunque serializzate dal lock del database.

### 4.3 Transazioni di scrittura: `BEGIN IMMEDIATE`

Con le transazioni *deferred* predefinite di SQLite, una transazione che prima legge e poi scrive può fallire subito con
`SQLITE_BUSY` (snapshot superato da un altro writer), e in quel caso `busy_timeout` **non** aiuta. Quindi:

- Il motore SQLite disattiva la gestione delle transazioni del driver `pysqlite` e apre le transazioni dall'evento
  `begin` di SQLAlchemy (ricetta documentata da SQLAlchemy per pysqlite).
- Le sessioni **di scrittura** aprono con **`BEGIN IMMEDIATE`** (prendono subito il lock di scrittura, attendendo fino a
  `busy_timeout`); le sessioni di sola lettura restano `BEGIN` (deferred), che in WAL non blocca nessuno.
- Quali sessioni scrivono: la dipendenza `get_db` usa `IMMEDIATE` per i metodi `POST`, `PUT`, `PATCH`, `DELETE`;
  un helper `write_session()` per i cicli in background e i job; `xact_lock` su SQLite richiede una sessione di scrittura.
- Rovescio: una transazione `IMMEDIATE` tiene il lock di scrittura fino al commit. **Nessuna transazione di scrittura
  può restare aperta durante una chiamata a un modello** (le rotte di chat in streaming fanno commit prima della chiamata e
  aprono sessioni brevi per salvare il risultato). F1-05b introduce il meccanismo, F1-05h lo applica ai percorsi lunghi
  e misura sotto carico.

## 5. CI su entrambi i database

### 5.1 Test

- **Fixture unica** (F1-05a): `backend/tests/artifact_database.py` diventa indipendente dal dialetto. Con
  `TEST_DB=postgres` usa lo schema isolato attuale; con `TEST_DB=sqlite` un file temporaneo per test con gli stessi PRAGMA
  della produzione desktop (non `:memory:`, che nasconde WAL e chiavi esterne).
- Marcatore `@pytest.mark.postgres_only` per i test delle migrazioni legacy.
- **Cricchetto**: `backend/tests/sqlite_known_failures.txt` elenca i test che oggi falliscono su SQLite. La CI fallisce se
  un test **non** in elenco fallisce su SQLite, **e** se un test in elenco comincia a passare (va tolto). L'elenco può solo accorciarsi;
  F1-05 è finita quando è vuoto (salvo `postgres_only`).
- **Controllo statico** `scripts/check-sql-portability.py` (F1-05a): segnala nuove occorrenze di `pg_advisory`, `::<tipo>`,
  `ADD COLUMN IF NOT EXISTS`, `date_trunc`, `hashtext`, `dialects.postgresql`, `DateTime(timezone=True)` fuori da
  `backend/db_compat.py` e dalle migrazioni legacy, con un file di eccezioni che può solo accorciarsi.

### 5.2 Workflow

`.github/workflows/backend-db.yml` (F1-05a):

| Job | Database | Quando | Cosa |
|---|---|---|---|
| `tests (postgres)` | servizio `postgres:15` | `pull_request` che tocca `backend/**` o il workflow; `workflow_dispatch` | suite backend completa |
| ~~`tests (sqlite)`~~ | — | — | rimosso 2026-10-29: SQLite non è più supportato |
| ~~`startup (sqlite)`~~ | — | — | rimosso 2026-10-29 (resta `startup (postgres)`) |
| `portability` | — | idem | `check-sql-portability.py` |

Niente esecuzioni su ogni push di `main`. L'import del backend su Windows ha già il suo workflow (`backend-windows.yml`, F1-18) e resta nei workflow desktop (F1-15).

### 5.3 In locale

Sul Mac da 8 GB i test mirati possono girare **su SQLite senza Docker**; Postgres locale (un solo container di test alla volta)
serve quando si toccano SQL, migrazioni o lock. La CI esegue sempre entrambi. `CONTEXT.md` va aggiornato da F1-05a
(oggi «never SQLite»).

## 6. Regole per il codice nuovo (valide da subito)

1. Niente SQL Postgres fuori da `backend/db_compat.py` e dalle migrazioni legacy; se serve, ramo per dialetto con test su entrambi.
2. Nuove colonne data/ora: `UTCDateTime` (appena esiste, F1-05e).
3. Lock: `xact_lock`; upsert: `dialect_insert`; colonne idempotenti: `add_column_if_missing`.
4. Indici parziali: sempre `postgresql_where` **e** `sqlite_where`.
5. Ogni PR che tocca `backend/` passa i job Postgres e SQLite.

## 7. Conseguenze

- Il desktop non porta più Postgres: installer più leggero, avvio senza `initdb`, backup = copia di un file.
- Il backend diventa un po' più complesso (helper di dialetto) e ogni migrazione nuova costa un test in più.
- Funzionalità ridotte su desktop, accettate: Prompt Lab (già solo Postgres), ricerca `ilike` meno tollerante su lettere
  accentate maiuscole, ordinamento del testo diverso dalla produzione.
- La Fase 2 (app studente su SQLite) eredita la compatibilità: F2-02 si riduce al sottoinsieme di tabelle e rotte dello studente.
