# Backup PostgreSQL desktop prima degli aggiornamenti (#738)

Sostituisce il backup SQLite di F1-05j, rimosso con il modulo
`backend/sqlite_backup.py`: dal #735 il backend desktop usa solo PostgreSQL
(layout 2, contratto 2) e restituiva `None` al posto di un percorso, così
l'updater si fermava con «Percorso backup non restituito dal backend».

## Come funziona

Prima di scaricare un aggiornamento il guscio chiede un backup al backend con
`POST /internal/backup` (o avvia il sidecar con `--backup` se il backend è
fermo). Entrambi chiamano `backend.postgres_backup.create_backup()`:

1. trova `pg_dump` e `pg_restore` nella cartella `postgresql/bin` del bundle,
   che il guscio passa al backend in `COUNSELORBOT_PG_BIN_DIR`; fuori dall'app
   (sviluppo, test) li cerca nel `PATH`;
2. esegue `pg_dump --format=custom` sul database del profilo letto da
   `DATABASE_URL`, scrivendo un file temporaneo `.partial` nella cartella backup;
   la password arriva al processo solo tramite `PGPASSWORD`, mai sulla riga di comando;
3. verifica l'archivio con `pg_restore` (legge tutti i blocchi verso un output
   nullo): un archivio troncato o illeggibile non viene pubblicato;
4. sincronizza il file e lo rinomina in
   `postgres-<istante UTC>-<uuid>.dump`;
5. conserva gli ultimi **7** archivi con quel nome; altri file non vengono toccati.

La cartella è `COUNSELORBOT_BACKUP_DIR` (impostata dal guscio a
`<cartella dati>/backups`), altrimenti `DATA_DIR/backups`. Se un passo fallisce
il temporaneo viene rimosso, i backup precedenti restano e l'aggiornamento si
ferma. Il tempo massimo per ciascun comando è 45 s, sotto i 60 s di attesa del guscio.

Il backup copia solo il database. Upload, indici, memoria delle sessioni e
chiavi nel portachiavi del sistema restano nella cartella dati e non sono inclusi.

## Ripristino (assistito)

Il ripristino non ha ancora un pulsante: va fatto da chi fornisce assistenza,
con l'app chiusa e i binari del bundle.

1. Reinstallare la versione dell'app compatibile con il backup, se serve.
2. Con l'app chiusa, avviare il cluster del profilo con i binari del bundle:
   `pg_ctl -D <cartella dati>/db/postgresql -o "-p <porta libera>" start`.
   La password del ruolo `counselorbot_app` è nel portachiavi del sistema
   (voce `postgresql-app`).
3. Ripristinare:

   ```sh
   PGPASSWORD=… <bundle>/postgresql/bin/pg_restore --clean --if-exists --no-owner \
     --host 127.0.0.1 --port <porta> --username counselorbot_app \
     --dbname counselorbot <cartella dati>/backups/postgres-…dump
   ```

4. Fermare il cluster (`pg_ctl -D … stop`) e riavviare l'app.

## Test

- `backend/tests/test_postgres_backup.py`: comandi, gestione della password,
  pubblicazione, errori e retention con un esecutore finto; un test usa il vero
  `pg_dump` quando `DATABASE_URL` è PostgreSQL e `pg_dump` è nel `PATH` (CI backend-db).
- `backend/tests/test_shell_contract.py` e `desktop/teacher/sidecar/test_server.py`:
  contratto di `/internal/backup` e di `--backup`.
- Test Rust `postgres_backend_receives_the_bundled_binaries_for_backups`:
  il guscio passa `COUNSELORBOT_PG_BIN_DIR` solo in modalità PostgreSQL.
