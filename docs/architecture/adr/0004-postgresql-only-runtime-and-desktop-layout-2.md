# ADR-0004 — PostgreSQL unico e layout desktop 2

- Stato: **Accettato come architettura target** (2026-10-26); implementazione non ancora consegnata.
- Decisione dell'utente del 26/10: «ok passiamo a postgresql così lo sviluppo è uguale per tutto».
- Sostituisce: [ADR-0003](0003-dual-database-postgres-sqlite.md), conservandone misure e lavoro storico.
- Integra: [ADR-0001](0001-installation-profiles-and-desktop-packaging.md) e [ADR-0002](0002-desktop-phase-1-contracts.md).
- Versione target dei contratti desktop: **`desktop_contract = 2`**; layout dati target: **`layout = 2`**.
- Baseline tecnica: spike [F0-02](../spikes/f0-02-embedded-postgres.md), quattro target già verificati.

> **Stato pubblicato.** La versione `v0.1.1` e i bundle correnti usano ancora SQLite,
> `desktop_contract = 1` e layout 1. Questo ADR non dichiara una funzione già disponibile e
> non autorizza una release. Il passaggio a contratto 2 avviene solo dopo converter,
> backup/restore, CI e validazione previsti qui. La pubblicazione SQLite `0.1.2` resta sospesa.

## 1. Decisione e confine dei motori

PostgreSQL è l'unico database applicativo di **server, portable, teacher-pc e student-pc**.
Sviluppo, test e CI usano PostgreSQL per i dati di business. SQLite resta soltanto:

1. sorgente in lettura delle installazioni desktop layout 1;
2. formato delle fixture sintetiche e dei test del converter legacy;
3. formato dei backup SQLite storici usati per import o rollback.

Non sono ammessi nuovi percorsi runtime SQLite, fallback automatico da PostgreSQL a SQLite o
default che creino `counselorbot.db`/`counselorbot.sqlite3` fuori dal converter. Il lavoro già
fatto per ADR-0003 resta utile per leggere le installazioni esistenti e non viene cancellato.
Il database e i volumi PostgreSQL di produzione non cambiano versione, configurazione o dati
per effetto di questa migrazione desktop.

Il profilo studente mantiene bundle ID, sync a eventi e perimetro dati di ADR-0001/0002; userà
un cluster PostgreSQL locale layout 2. Il suo contratto di sync resta da definire in F2-01 e non
è riscritto da questo ADR.

## 2. Versione e risorse PostgreSQL incluse

### 2.1 Versione fissata

- Major: **PostgreSQL 15**, uguale alla major del server attuale.
- Minor iniziale del bundle: **15.19**, già eseguita da F0-02 su macOS ARM64, macOS x64,
  Windows x64 e Ubuntu 22.04 x64.
- macOS/Windows: distribuzione **theseus-rs/postgresql-binaries 15.19.1**, come nello spike.
- Linux: build riocabile dai sorgenti **PostgreSQL 15.19** su `ubuntu-22.04`, con le opzioni
  `--without-icu --without-readline` e RPATH relativo già misurate in F0-02.

Una minor diversa richiede una modifica esplicita del manifest e una nuova verifica sui quattro
target; non è un aggiornamento implicito delle dipendenze. Una major diversa richiede un nuovo
ADR e una procedura dump/restore o `pg_upgrade`: mai un upgrade automatico del cluster o della
produzione.

### 2.2 Layout delle risorse nel bundle

Ogni installer contiene tutto il necessario, senza download, Docker, PostgreSQL preinstallato o
privilegi di amministratore a primo avvio:

```text
resources/postgresql/
├── manifest.json
├── bin/
│   ├── postgres[.exe]
│   ├── initdb[.exe]
│   ├── pg_ctl[.exe]
│   ├── pg_isready[.exe]
│   ├── psql[.exe]
│   ├── pg_dump[.exe]
│   └── pg_restore[.exe]
├── lib/                 librerie runtime e RPATH relativo
└── share/               file richiesti da initdb/postgres
```

`resources/postgresql/manifest.json` contiene, per il target del bundle: `major`, `minor`,
`distribution`, `version`, URL e nome asset della CI, SHA-256 dell'archivio sorgente, SHA-256 del
contenuto potato, elenco dei binari e riferimenti a licenza/notice/SBOM. La CI scarica gli asset
solo in build, verifica gli hash prima dell'estrazione e pubblica il manifest e le notice nel
bundle. Gli hash effettivi sono quindi verificati sugli artifact, non valori documentali inventati.
L'avvio verifica target, versione e integrità del manifest; una risorsa assente o non coerente è
un errore bloccante. `include/`, simboli `.pdb`, statiche `.a`, PL/Python e documentazione non
necessaria restano esclusi come nella potatura misurata da F0-02.

Il mapping Tauri aggiunge `resources/postgresql/` senza cambiare i percorsi delle risorse backend,
frontend, Node o cloudflared. Non si installano servizi OS e non si modifica `PATH`.

## 3. Cartella utente e layout 2

Radice `app_local_data_dir()` e identificatori restano **immutati**:
`org.ai4educ.counselorbot.teacher` e, in Fase 2, `org.ai4educ.counselorbot.student`.
Si conservano upload, memoria, RAG, credenziali locali, configurazione, log e backup esistenti.

```text
<radice>/
├── layout.json                    {"layout":2,"app":"teacher","created_with":"X.Y.Z","migrated_with":"Y.Y.Y"}
├── db/
│   ├── postgresql/                PGDATA del solo cluster proprietario, PG_VERSION=15
│   └── counselorbot.sqlite3       eventuale sorgente layout 1, conservata e mai riaperta dal runtime
├── migration/
│   ├── sqlite-import.json         stato persistente, scrittura atomica
│   └── <attempt-id>.json          report senza contenuti delle righe
├── uploads/ rag/ memory/ credentials/ config/   invariati
├── logs/                          + postgresql.log; nessuna URI o password
├── backups/
│   ├── *.sqlite3                  snapshot storici, retention separata
│   └── postgresql/                dump custom + manifest SHA-256
└── run/
    ├── shell.lock sidecars.json
    └── postgresql.json            identità cluster/processo e porta corrente
```

Su Unix radice e `db/postgresql` hanno permessi `0700`; file privati `0600`. Su Windows si usano
le ACL della cartella utente, mai un processo elevato. `layout.json` continua a rifiutare layout
più recenti e cambia da 1 a 2 **solo come ultimo passo** della migrazione verificata (§7).

### 3.1 Decisione all'apertura di una cartella

| Evidenza | Comportamento obbligatorio |
|---|---|
| Nessun `layout.json`, nessun file SQLite/backup/dato utente preesistente | Nuova installazione: crea layout 2 e inizializza PostgreSQL; nessun converter. |
| `layout = 2` | Avvia soltanto PostgreSQL; non consulta SQLite per il runtime. |
| `layout = 1` con `db/counselorbot.sqlite3` | Esegue/riprende il converter; il backend applicativo non parte fino al completamento. |
| `layout = 1` senza sorgente ma con snapshot SQLite | Blocca e propone ripristino dello snapshot; non crea un PostgreSQL vuoto per nascondere la perdita. |
| Qualunque layout 1 o artefatto legacy non classificabile | Blocco leggibile e diagnostica; nessuna inizializzazione vuota automatica. |
| Layout sconosciuto/più recente | Rifiuto come oggi; nessuna riscrittura. |

La sola dimensione zero o piccola del file non dimostra che un'installazione sia vuota. Il test di
nuova installazione richiede una radice realmente nuova, non l'assenza di righe in una tabella.

## 4. Database, credenziali e rete locale

Ogni app possiede un cluster, un database `counselorbot` e il ruolo proprietario
`counselorbot_app`. Il ruolo amministratore iniziale è `counselorbot_admin`; non è usato dal
backend. Collazione iniziale `C`, come nello spike, uguale sui quattro sistemi. `TZ=UTC` per i
processi di manutenzione; le colonne applicative restano `TIMESTAMP WITH TIME ZONE`.

Portachiavi OS, servizio invariato `org.ai4educ.counselorbot.teacher` (o `.student`):

| Account/voce | Contenuto | Consumatore |
|---|---|---|
| `postgresql-app` | 32 byte casuali base64url | `DATABASE_URL` del backend, dump/restore applicativo |
| `postgresql-admin` | 32 byte casuali base64url, distinto | solo init/manutenzione del guscio |

Le password sono generate al primo init con il generatore OS e salvate prima dell'uso. Se il
portachiavi è bloccato o non disponibile l'avvio fallisce in modo leggibile: nessun segreto in
chiaro su disco e nessun fallback a password fissa. Le voci API esistenti e le chiavi Fernet/Privacy
non vengono rigenerate o migrate.

`DATABASE_URL` è costruito in memoria con password URL-encoded:
`postgresql://counselorbot_app:<secret>@127.0.0.1:<port>/counselorbot`.
Viene passato soltanto all'ambiente del backend o del processo di migrazione, mai a frontend,
cloudflared o `postgres`. `PGPASSWORD` è ammesso soltanto nel processo di manutenzione che lo
richiede; mai negli argomenti comando. Log, errori IPC, report e diagnostica redigono sempre la
password e non serializzano l'URI: la forma ammessa è
`postgresql://counselorbot_app:***@127.0.0.1:<port>/counselorbot`. Il pannello espone soltanto
stato, database, major e porta, non credenziali.

Il cluster ascolta solo TCP su `127.0.0.1`, porta dinamica, senza socket Unix (`unix_socket_directories=''`,
così non ci sono limiti di lunghezza del percorso), SSL disabilitato sul solo loopback e
`pg_hba.conf` che richiede `scram-sha-256` per `127.0.0.1/32` e rifiuta le altre origini.
`listen_addresses`, `password_encryption=scram-sha-256`, `fsync=on`, `full_page_writes=on` e
`synchronous_commit=on` sono verificati a ogni avvio. Una porta occupata fa scegliere un'altra
porta: non autorizza a terminare chi la occupa.

## 5. Gestione del cluster proprietario

### 5.1 Interfaccia del runtime desktop

Il task runtime implementa nel guscio un `PostgresClusterManager` con questa superficie logica;
nomi di metodi e tipi restano il contratto tra supervisore, backup e converter:

```text
prepare_new(resources, data_root, credentials) -> ClusterIdentity
start(identity, resources) -> RunningCluster
probe(running, app_credentials) -> ClusterHealth
stop(running, mode = Fast, timeout = 10s) -> StopResult
```

- `ClusterIdentity`: `cluster_uuid`, percorso assoluto `PGDATA`, major, app/bundle ID.
- `RunningCluster`: identità, PID postmaster, executable, fingerprint di avvio, porta, log.
- `ClusterHealth`: `ready`, `major`, `database`, `role`, `server_version`; nessun segreto.
- Ogni metodo è idempotente o restituisce un errore stabile senza contenuti SQL/dati.

`run/postgresql.json` registra queste identità, `resource_version` e `owner_bundle_id`. Il file
`PGDATA/postmaster.pid` è un indizio, non una prova sufficiente. Prima di adottare o fermare un
processo si verificano insieme: cluster UUID/percorso, PID, executable nelle risorse attese e
fingerprint di avvio. Al riavvio si può fermare un residuo solo se tutte coincidono; altrimenti si
lascia il processo in pace e si mostra l'errore. Sono vietati `pkill`, `killall`, `taskkill /IM`
e qualunque stop basato soltanto su porta, nome `postgres` o PID.

### 5.2 Init e avvio

1. Il guscio acquisisce `shell.lock`, prepara layout/credenziali e verifica che `PGDATA` sia sotto
   la radice attesa. Non esegue mai `initdb` su una cartella non vuota o con `PG_VERSION`.
2. Solo per cluster nuovo: `initdb --pgdata=<PGDATA> --username=counselorbot_admin
   --auth-host=scram-sha-256 --auth-local=reject --locale=C --encoding=UTF8 --pwfile=<...>`.
   La password transita da file temporaneo privato o pipe, mai in argv; il temporaneo è eliminato.
3. Scrive il cluster UUID nel proprio manifest, poi avvia il binario `postgres` **direttamente come
   figlio sorvegliato** con `-D <PGDATA> -p <porta>`. Non usa `pg_ctl start` distaccato:
   stdout/stderr vanno a `logs/postgresql.log`, la pipe di vita resta sotto controllo del
   wrapper/lifeline e Windows assegna il processo e i figli al Job Object.
4. Dopo `pg_isready`, si connette come amministratore al database iniziale `postgres` e crea ruolo
   applicativo e database `counselorbot` con statement parametrizzati/identificatori fissi; assegna
   la proprietà a `counselorbot_app`. Un errore lascia il cluster proprietario per il retry, senza
   rieseguire `initdb` e senza attivare il backend.
5. Apre una nuova connessione SCRAM come `counselorbot_app` con `SELECT 1`, verificando major 15,
   database e ruolo. Solo dopo passa `DATABASE_URL` al backend.

Il backend resta a un worker per la Fase 1, ma PostgreSQL non dipende dai lock in-process SQLite.
Un crash di PostgreSQL ferma frontend/tunnel e backend; il supervisore riavvia prima il cluster,
attende recovery e health, poi riprende la catena. Non riavvia il backend contro un altro cluster.

### 5.3 Stop, crash e avvio della catena

Avvio: **PostgreSQL → cluster health → backend → `/health` e controllo versione/contratto →
frontend → frontend health → cloudflared (se richiesto)**.

Stop normale: **cloudflared → frontend → backend → PostgreSQL fast shutdown**. Si attendono al
massimo 10 s per PostgreSQL, poi si termina soltanto il PID verificato. Su Unix la lifeline invia
SIGINT (fast shutdown) a EOF e, dopo il timeout, SIGKILL al solo cluster figlio. Su Windows il Job
Object chiude l'albero alla morte del guscio. Il crash recovery di PostgreSQL è atteso al riavvio;
non si cancellano WAL, PID o file del cluster per “sbloccare” l'avvio.

`GET /health` del backend contratto 2 restituisce esattamente il contratto e il dialetto attesi:

```json
{"status":"ok","version":"X.Y.Z","desktop_contract":2,"db":"postgresql"}
```

Il guscio rifiuta `db != "postgresql"`, contratto o versione diversi e non pubblica il tunnel.
`/internal/ping` resta obbligatorio per dimostrare che il backend appartiene al guscio. Il timeout
iniziale resta 180 s, poi 60 s, escluso un import esplicito che mostra il proprio avanzamento.

## 6. Backup PostgreSQL e interfaccia di restore

Il task runtime fornisce i binari e primitive; il task dati integra le procedure e l'updater:

```text
PostgresBackupManager.create(running, destination) -> BackupReceipt
PostgresBackupManager.verify_restore(receipt, resources) -> RestoreVerification
PostgresBackupManager.restore(stopped_cluster, receipt) -> RestoreReceipt
```

Un backup usa `pg_dump --format=custom --no-password` sul database `counselorbot`, file temporaneo
privato, `pg_restore --list`, fsync e rename atomico. Nome:
`postgresql-<cluster_uuid>-<UTC>-<uuid>.dump`; il sidecar `.json` contiene formato, app version,
contratto, major/minor, creato_UTC e SHA-256, senza URI o contenuti. La retention predefinita è 7
ed è separata dagli snapshot SQLite e dai dump protetti pre-import/pre-restore.

`verify_restore` è obbligatorio prima dell'attivazione layout 2 e prima di ogni aggiornamento:
crea un cluster temporaneo sotto `run/restore-check/<uuid>/`, con credenziali sintetiche generate
per la prova e porta libera, ripristina con `pg_restore`, verifica apertura, conteggi e vincoli,
poi ferma soltanto quel cluster e rimuove soltanto quella directory. Un dump elencabile ma non
ripristinato non abilita update o migrazione. Il test non usa server/produzione o cartelle reali
esterne alla propria radice temporanea.

Per il restore operativo il backend è fermo. Si crea prima un dump di sicurezza dello stato
corrente, si ripristina in un database di staging dello stesso cluster, si verifica e solo dopo si
scollegano le sole sessioni applicative e si rinomina il database corrente come copia
`counselorbot_pre_restore_<UTC>` e lo staging come `counselorbot`. Un errore prima dello switch
non modifica il database attivo; quello precedente non viene eliminato automaticamente. Dopo il
riavvio si ripetono health e controlli. Dump e restore non comprendono upload, RAG, memoria su
file, portachiavi o chiavi locali: il backup completo resta la copia coordinata dell'intera radice.

## 7. Converter SQLite legacy → PostgreSQL

### 7.1 Invocazione tra guscio e task dati

Con cluster avviato e backend applicativo fermo, il guscio invoca il sidecar del converter:

```text
counselorbot-backend --import-sqlite-layout2 <request.json>
```

`request.json` (schema `sqlite_import_request = 1`) contiene `attempt_id` UUID, percorso sorgente,
percorso snapshot, percorso report, `source_layout = 1`, `target_layout = 2`, `app_version` e
`schema_fingerprint`. Non contiene `DATABASE_URL` o password, fornite solo nell'ambiente.
Il processo scrive il report atomico indicato. Codici: `0` completato/riagganciato; `3` sorgente
o schema non importabile; `4` configurazione/cluster non valido; `5` verifica fallita; `6` errore
interrompibile da ritentare. Ogni errore usa codice e messaggio senza valori di righe/segreti.

Il task runtime fornisce cluster, credenziali e hook; il task dati implementa il comando e il
report. L'updater non può offrire il salto a contratto 2 finché entrambe le parti non sono nella
stessa build. L'unificazione rimuove solo dopo i fallback SQLite business, non questo comando.

### 7.2 Sequenza transazionale e ripresa

1. Con il lock della cartella e nessun backend attivo, aprire SQLite senza modificarlo; richiedere
   `integrity_check = ok` e `foreign_key_check` vuoto. Creare con l'API SQLite uno snapshot
   consistente che includa il WAL in `backups/`, verificarlo e calcolarne SHA-256. La sorgente,
   inclusi WAL/SHM, resta conservata; nessun `VACUUM`, migrazione schema o scrittura sul legacy.
2. Registrare `pending`/`snapshot_created` in `migration/sqlite-import.json`. Se il fingerprint
   della sorgente cambia prima/dopo lo snapshot, fallire senza toccare il target.
3. Iniziare **una sola transazione PostgreSQL** per schema, tabelle, dati, sequence e receipt.
   Copiare dallo snapshot, non da una sorgente mutevole, con FK attendibili e ID espliciti.
   Ogni tabella/colonna sorgente deve avere una mappatura dichiarata: una tabella o colonna
   sconosciuta, assente o non rappresentabile fa fallire l'import; non si ignorano dati.
4. Aggiornare le sequence PostgreSQL al massimo ID importato (`is_called=true`) oppure a 1 con
   `is_called=false` per tabella vuota. Verificare che il valore successivo non riusi un ID.
5. Eseguire tutte le verifiche del §7.3 nella stessa transazione. Scrivere il receipt nella tabella
   tecnica `counselorbot_desktop_migrations` (`attempt_id`, `source_backup_sha256`,
   `schema_fingerprint`, `verification_sha256`, `imported_at`, `app_version`) e fare commit.
   Qualunque eccezione/crash prima del commit fa rollback dell'intero import.
6. Creare il dump PostgreSQL e completarne il restore di prova (§6). Scrivere stato `completed`
   con hash del report e del dump; solo allora aggiornare atomicamente `layout.json` a 2 e avviare
   il backend. Un fallimento lascia layout 1 e sorgente intatta, senza fallback al runtime SQLite.

A ogni avvio il guscio legge stato e receipt. Se manca il receipt, un nuovo tentativo riparte da
un database target vuoto dopo rollback; non sopraffà mai un'altra installazione. Se il receipt
esiste ma manca `completed`/layout 2, riverifica fingerprint e report, poi riprende **lo stesso
tentativo** soltanto da dump e marcatura: non duplica l'import e non cambia UUID, anche se il dump
precedente era fallito. Se il commit non è accertabile, si interroga il receipt dello stesso
`attempt_id`; non si rilancia una copia cieca. Un nuovo UUID è ammesso solo prima del commit;
dopo un rollback il target è vuoto oppure viene ricreato esplicitamente nel cluster proprietario,
mai con `initdb` e mai su un DB non riconosciuto. Stato e report usano scrittura temporanea, fsync
e rename atomico.

Stati ammessi: `pending`, `snapshot_created`, `copying`, `verifying`, `import_committed`,
`backup_verified`, `completed`, `failed`. `failed` conserva `attempt_id`, fase e `error_code`;
il retry pre-commit genera un nuovo UUID, quello post-commit conserva l'UUID del receipt. Nessuno
stato contiene pseudonimi, testi, ID utenti o valori cifrati.

### 7.3 Verifiche obbligatorie

Il report contiene soltanto metadati, conteggi e digest:

- inventario completo di tabelle/colonne e mapping; conteggio righe sorgente/destinazione uguale;
- uguaglianza degli insiemi delle primary key e delle foreign key; `PRAGMA foreign_key_check`
  sorgente e query FK orfane destinazione vuote; tutti i vincoli PostgreSQL validati;
- sequence coerenti con max ID e flag `is_called`, senza collisioni al successivo inserimento;
- digest per tabella di una serializzazione canonica ordinata per PK, con NULL distinti, booleani,
  numeri, JSON canonico, binari esatti e timestamp normalizzati a UTC; digest sorgente/target e
  verification SHA-256 uguali. I digest non sostituiscono i conteggi e non espongono righe nel log;
- account/sessioni/auth, consensi/audit, log, impostazioni, prompt, memorie DB e payload cifrati
  copiati byte-per-byte dopo la decodifica del driver; nessuna decifratura, rotazione o nuovo seed;
- manifest dei file esterni: percorso relativo, dimensione e SHA-256 dei riferimenti in upload,
  RAG, memoria file e credenziali locali; i file restano nella stessa radice e devono esistere e
  corrispondere prima e dopo. Il converter non li sposta, riscrive o rigenera.

Il seed di fabbrica non può colmare silenziosamente differenze: schema e contenuti attesi derivano
dallo `schema_fingerprint` della build e dalle regole esplicite di migrazione. Un database vuoto
di destinazione non è un esito valido se lo snapshot contiene dati applicativi.

## 8. Aggiornamento, downgrade e rollback

Una build contratto 2 deve contenere converter, backup e restore verificabile **prima** di essere
offerta a installazioni layout 1. L'updater esegue nell'ordine: snapshot SQLite verificato per
layout 1 oppure dump PostgreSQL verificato per layout 2; verifica restore; download/applicazione;
alla ripartenza import se necessario. Il backup di sicurezza non viene ruotato via dal retention
ordinario finché l'esito non è confermato.

Rollback da layout 2 all'ultima build layout 1:

1. chiudere app, tunnel e backend; creare e verificare un dump PostgreSQL di sicurezza;
2. conservare il cluster e i file utente; ripristinare offline lo snapshot SQLite pre-import con
   la procedura F1-05j, senza cancellare manualmente WAL/SHM;
3. verificare integrità SQLite, conteggi del report e file esterni; solo dopo riportare
   `layout.json` a 1 con una procedura dedicata e installare il bundle precedente;
4. avviare senza tunnel e controllare accessi, classi, allegati e chiavi prima dell'uso.

I dati modificati in PostgreSQL dopo l'import non compaiono magicamente nel vecchio snapshot:
il pannello/procedura deve avvisare prima del downgrade. Non si elimina automaticamente né il
cluster né la sorgente legacy. Il ritorno a layout 2 richiede un nuovo export/migrazione esplicita;
non è parte di questa fase.

## 9. Sviluppo, CI e criteri di accettazione

L'unificazione successiva rende PostgreSQL obbligatorio negli script di sviluppo e nelle fixture
business, con database/schema temporanei isolati. SQLite compare soltanto nelle fixture del
converter. Il cricchetto di test e i wrapper già portabili non vengono cancellati per nascondere
regressioni: i test utili vengono convertiti a PostgreSQL e quelli legacy restano distinti.

Gate minimi sui quattro target F0-02:

1. bundle offline con binari/hash/licenze verificati; primo avvio senza admin, rete, Docker o
   PostgreSQL installato; doppio avvio sullo stesso cluster e health contratto 2;
2. avvio, stop, SIGKILL del guscio, sleep/ripresa e crash PostgreSQL; nessun orfano e nessuna
   azione su un secondo PostgreSQL sintetico non proprietario o su PID riciclati;
3. import di fixture layout 1 rappresentative (WAL, ID/FK/sequence, UTC, JSON/binari/cifrati,
   upload/RAG/memorie), verifica completa e nessuna modifica alla sorgente;
4. fault injection prima/durante/dopo commit, prima/dopo dump e prima/dopo layout 2; ripresa
   idempotente, nessun dato duplicato e mai un database vuoto presentato come migrazione riuscita;
5. dump/restore reale in cluster isolato, updater bloccato da backup o restore fallito e rollback
   documentato eseguito su fixture;
6. suite backend e CI business solo PostgreSQL, test converter SQLite separati, versioni allineate,
   smoke docente/studente/link/tunnel e carico realistico dopo l'unificazione.

Nessun gate usa dati reali, `.env`, credenziali o volumi di produzione. Nessuna release finché
migrazione e CI non sono complete. I compiti successivi partono solo dopo il merge dei rispettivi
predecessori, coordinati dal Timoniere.

## 10. Conseguenze

- ADR-0003 è superato come scelta target; le sue misure, i benchmark e gli helper SQLite restano
  storia e strumenti di compatibilità per layout 1 fino al completamento del converter.
- ADR-0002 §1–§2 e F1-15/F1-16 sono integrati da layout/contratto 2, ordine con PostgreSQL,
  credenziali OS e dump/restore. Identità, origine richiesta, abbinamento e tunnel non cambiano.
- Gli installer includono nuovamente PostgreSQL (~22–110 MB installati dopo potatura stimata da
  F0-02) e il guscio gestisce un processo in più; in cambio runtime, sviluppo e CI hanno un solo
  dialetto e la stessa semantica di lock, vincoli, sequence e date del server.
- Il backup applicativo non è più una copia del solo file attivo: usa `pg_dump`/`pg_restore` e
  restore di prova. Gli snapshot SQLite restano indispensabili per import e rollback.
- Il lavoro di runtime, dati e unificazione è distinto e sequenziale. Questo documento è il loro
  contratto comune, non la prova che tali implementazioni esistano.
