# Ripristino CI desktop e verifica dell'istanza — 26 ottobre 2026

## Cause verificate

- `78529246` ha troncato `backend/class_access.py`: mancavano resolver,
  controlli chat, strumenti, counselor e opzioni forum. Ripristinata la versione
  precedente completa; le suite esistenti coprono anche vista classe e permessi.
- Il codice usa `datetime.UTC` (Python >= 3.11), mentre Docker usava Python 3.10.
  Le prove desktop/CI usano Python 3.12; la configurazione del portable
  resta fuori da questa correzione.
- Le PR #618/#619 non erano integrate in `main` al momento del controllo.
  Il ripristino include download e costante forum, oltre ai blocchi successivi.
- La panoramica classe su `main` conteneva un ternario JSX chiuso prima
  del ramo alternativo: corretto il blocco che impediva tutte le build Next.js.
- Il workflow PostgreSQL eseguiva Bash in PowerShell su Windows, perdeva
  permessi/symlink negli artifact, ignorava errori di build e non propagava
  i fallimenti nel riepilogo. Ora usa Bash e archivi tar, test Rust e smoke nativo.
- I pacchetti upstream realmente disponibili sono PostgreSQL 15.12.1
  (server 15.12). Il pin comprende SHA-256 verificati prima dell'estrazione.
  Linux viene compilato su Ubuntu 22.04 con rpath relativo; gli archivi GNU
  upstream richiedono una glibc più recente. I binari macOS richiedono macOS 15:
  runner e minimo dichiarato nell'app sono allineati.
- Il gestore Rust non compilava, non creava ruolo/database applicativo e
  passava a initdb una PGDATA contenente il file password. Manifest, bootstrap,
  file temporaneo privato e conversioni degli errori sono stati corretti.
  Sui runner Windows elevati le prove native usano il token ristretto di un
  utente normale e ACL temporanee sulle sole cartelle di test: `postgres`
  rifiuta correttamente il token amministrativo, mentre l'app reale resta non
  elevata e continua ad avviarlo direttamente come figlio sorvegliato.
- Il converter SQLite → PostgreSQL passa ora dizionari di parametri nominati a
  SQLAlchemy, invece di liste posizionali non accettate da `TextClause`.
- L'ambiente del backend sovrascriveva l'URL PostgreSQL con quello SQLite.
  Il guscio ora applica l'URL effettivo dopo le variabili della cartella dati.
- I controlli lifecycle richiedevano ancora contratto 1/SQLite; ora verificano
  contratto 2/PostgreSQL, schema e seed, PID PostgreSQL e arresto dopo crash.
  Il controllo backend CI legge `/health` prima di fermare il processo.

## Verifiche ripetibili e isolamento

```sh
python3 -m unittest discover -s scripts/tests -p test_download_postgres_binaries.py
python3 scripts/download-postgres-binaries.py --target macos-arm64 --output /tmp/cb-resources/postgresql
cargo test --locked --manifest-path desktop/teacher/src-tauri/Cargo.toml
cargo run --locked --manifest-path desktop/teacher/src-tauri/Cargo.toml -- \
  --postgres-smoke /tmp/cb-resources /tmp/cb-profile-nuovo
```

Su Linux installare `patchelf` prima del download/build. Scegliere il target
corretto; la directory del profilo deve essere nuova. Lo smoke avvia solo il
cluster temporaneo, effettua SQL come ruolo applicativo e lo ferma due volte.
Le modalità smoke/headless usano credenziali sintetiche in memoria, mai il
portachiavi dell'utente; PostgreSQL richiede una cartella dati di test esplicita.
La finestra normale continua a usare password casuali nel portachiavi OS.

`desktop-teacher.yml` costruisce backend e frontend condivisi con l'app web,
installer e lifecycle completo sui quattro target. Le modifiche a entrambi i
lati dell'applicazione ora attivano questo workflow. `desktop-postgres.yml`
verifica separatamente checksum, runtime nativo, formattazione e unit test.
La guida interfaccia nelle sei lingue è stata rivista: nessuna navigazione
cambia; il requisito macOS e i limiti di upgrade sono documentati qui.

## Stato dell'istanza controllata

L'istanza Docker portable del Mac montava il backend da questo checkout ma
usava ancora Python 3.10: import di `datetime.UTC` fallito. Il frontend in
esecuzione dichiarava `0.1.0` e non conteneva `/unisciti` e
`/docente/dispositivi`, mentre `VERSION` e `main` erano a `2.0.0`.
Quindi merge del codice e distribuzione dell'applicazione erano due stati diversi.

L’istanza Mac portable e la sua autenticazione tramite Console portable sono
escluse da ogni deploy di questa attività. Non sono stati sostituiti o riavviati
i suoi container. Le immagini `*:desktop-ci-validation` sono soltanto prove
separate. Il lavoro prosegue in un worktree fuori dai mount del portable.

Le app desktop usano invece `AUTH_PROVIDER=local`: il docente entra dal guscio,
condivide un link Cloudflare Quick Tunnel temporaneo e approva gli studenti.
Non occorrono Console portable, account ai4educ o domini personalizzati.
La predisposizione ai tunnel con dominio è inattiva nel pannello e nel
comando di avvio, anche riaprendo una vecchia configurazione nominativa.
L’approvazione del docente è selezionata inizialmente nella creazione del link.

## Limiti per la release

Un profilo legacy layout 1 viene rifiutato dall'app PostgreSQL: non viene
creato un nuovo cluster vuoto al posto dei dati preesistenti. L'integrazione
assistita del converter e dei backup/restore PostgreSQL nell'updater resta un
prerequisito per offrire l'upgrade da v0.1.1. Vedere
[contratto di upgrade](postgresql-desktop-upgrade.md). La CI verde da sola non
certifica una migrazione dei dati reali né una release pronta alla pubblicazione.
