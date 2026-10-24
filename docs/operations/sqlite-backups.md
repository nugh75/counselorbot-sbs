# Backup e ripristino SQLite desktop — F1-05j

`backend/sqlite_backup.py` implementa il contratto di F1-05j del
[piano desktop](../architecture/desktop-apps-plan.md), con
`sqlite3.Connection.backup` (API nativa `sqlite3_backup`). Non aggiunge dipendenze,
rotte HTTP, pianificazioni o pulsanti. L'integrazione automatica con l'updater
resta F1-16. Su PostgreSQL entrambi gli helper restituiscono `None`, senza
connessioni SQLite, verifica dei parametri o accessi alla cartella dei backup.

## Creazione online

Dal repository, con lo stesso ambiente del backend (`DATABASE_URL`, `DATA_DIR`):

```python
from backend.sqlite_backup import create_backup

backup = create_backup(retain=7, timeout=30)
print(backup)  # pathlib.Path, oppure None per PostgreSQL
```

Per strumenti e test si possono passare un Engine SQLAlchemy SQLite e una
cartella dati espliciti: `create_backup(engine, data_dir=directory, retain=7)`.
Sono supportati URL SQLite su file ordinari; database in memoria e URL `file:`
vengono rifiutati. Il file deve già esistere ed essere non vuoto: un percorso
errato non genera un database vuoto.

La destinazione di questo modulo è **`DATA_DIR/backups/`**, come richiesto dal
task. Il guscio docente attualmente imposta `DATA_DIR=<radice>/uploads`: quindi
qui i backup finiscono in `<radice>/uploads/backups/`. L'eventuale collegamento
con `<radice>/backups/` del layout ADR-0002 appartiene all'integrazione F1-16;
il modulo non interpreta la radice del guscio né cambia le sue variabili.

La copia usa una connessione di lettura indipendente, include i commit ancora
nel WAL ed esclude le transazioni non confermate. Le altre connessioni possono
continuare a leggere e scrivere durante i passi del backup. Il risultato è uno
snapshot consistente; non include necessariamente le scritture successive.
Non copiare direttamente il file del database mentre è aperto.

Il modulo crea un temporaneo privato, passa la copia in journal mode DELETE,
richiede che `PRAGMA integrity_check` restituisca **esattamente** una riga `ok`,
chiude le connessioni, sincronizza il file e pubblica con rename atomico nella
stessa cartella. Il backup è autonomo: non richiede file `-wal` o `-shm`.
Su POSIX nuovi file/cartella hanno permessi 0600/0700; su Windows valgono
le ACL ereditate dalla cartella dati. Le directory esistenti non cambiano permessi.

I nomi `sqlite-<identità database>-<istante UTC>-<uuid>.sqlite3` sono unici.
L'identità deriva dal percorso assoluto, così database diversi nello stesso
`DATA_DIR` hanno retention separate. Dopo ogni creazione riuscita rimangono
gli ultimi **7** snapshot di quel database (`retain` intero positivo,
configurabile nella chiamata). Esportazioni, file con nomi diversi e symlink
non sono ruotati. Spostando il DB, il vecchio gruppo di snapshot resta intatto.

Se copia/verifica/pubblicazione fallisce, il temporaneo e i suoi sidecar vengono
rimossi, l'errore si propaga e la retention non viene eseguita. Un'eccezione
`BackupIntegrityError` indica che la copia è invalida; non viene conservata
come backup utilizzabile. I dettagli del PRAGMA non entrano nel messaggio
d'errore perché possono contenere dati. Errori del filesystem, incluso un errore
durante la retention, si propagano: in quest'ultimo caso la nuova copia resta
valida ma possono rimanere più di N file.

Il timeout (default 30 s) limita ogni copia nativa, interrompendo anche i retry
su BUSY/LOCKED e le ripartenze dovute a scritture continue; non è una scadenza
globale per `integrity_check` o per l'intera procedura di restore. Si può
ritentare dopo `BackupTimeoutError`. Le operazioni di questo modulo sono
serializzate nel singolo processo desktop; non avviare due processi di
manutenzione indipendenti sulla stessa cartella durante retention/restore.

## Ripristino guidato

1. Scegliere un backup `.sqlite3` della propria installazione, compatibile con
   la versione da avviare. Non vengono verificate versione applicativa o origine.
2. Fermare il backend, richieste, job e tutti gli altri programmi che accedono
   al file; chiudere sessioni SQLAlchemy e connessioni prese dal pool. È un
   requisito del chiamante: `database_stopped=True` lo conferma, non ferma i
   processi e non è un lock tra processi.
3. In un processo di manutenzione con gli stessi `DATABASE_URL` e `DATA_DIR`,
   chiamare l'helper. Non importare `backend.main` (esegue inizializzazioni).

```python
from backend.sqlite_backup import restore_backup

result = restore_backup(
    "/percorso/uploads/backups/sqlite-…-….sqlite3",
    database_stopped=True,
    retain=7,
)
if result is not None:
    print("Database:", result.database)
    print("Copia prima del ripristino:", result.safety_backup)
```

4. L'helper scarta le connessioni inattive del proprio Engine, crea una copia
   temporanea verificata del backup scelto, poi salva e verifica lo stato
   corrente in un **nuovo backup di sicurezza**. Se uno di questi passi fallisce,
   non cambia il database e non ruota i backup precedenti.
5. Ripristina lo snapshot verificato usando ancora `Connection.backup` verso il
   file corrente, senza sostituirne l'inode o eliminare manualmente il suo WAL.
   Verifica nuovamente l'integrità e restituisce `RestoreResult` con i due percorsi.
6. Dopo il successo applica la stessa retention, contando anche la nuova copia
   di sicurezza: un backup sorgente molto vecchio può essere eliminato, anche
   con `retain=1`, perché è stato prima copiato nel temporaneo verificato.
7. Riavviare il backend e verificare dati e avvio; conservare separatamente uno
   snapshot se deve sopravvivere alle rotazioni future.

Se il ripristino fallisce dopo aver creato la copia di sicurezza, solleva
`RestoreError`: `exc.safety_backup` indica la copia da usare per recuperare lo
stato precedente. Nessuna retention viene eseguita in questo caso. Per ripristinare
è necessario un database corrente esistente e verificabile: se è perso o
corrotto, l'helper si ferma perché non può garantire la copia preventiva;
il recupero di emergenza richiede una procedura separata.

Questo è un backup del **solo database**: file caricati, indici, chiavi e
credenziali esterne richiedono il proprio archivio coordinato. Non è una copia
completa dell'installazione. La Guida interfaccia nelle sei lingue e gli
screenshot sono stati rivisti: non cambia alcun percorso o controllo utente.

## Verifiche

```sh
~/.pyenv/versions/3.11.9/bin/python -m pytest backend/tests/test_sqlite_backup.py
TEST_DB=sqlite ~/.pyenv/versions/3.11.9/bin/python -m pytest backend/tests/test_sqlite_backup.py
python3 scripts/check-sql-portability.py
make guidance-check
```

La suite usa esclusivamente file temporanei: scrittura atomica durante i passi
reali del backup, commit nel WAL e transazioni non confermate, integrità e
corruzione, timeout, retention concorrente, restore e guasti della copia di
sicurezza/del ripristino. Il ramo PostgreSQL è verificato senza server.

Riferimenti: [API Python 3.11](https://docs.python.org/3.11/library/sqlite3.html#sqlite3.Connection.backup),
[backup online SQLite](https://www.sqlite.org/backup.html),
[integrity_check](https://www.sqlite.org/pragma.html#pragma_integrity_check).
