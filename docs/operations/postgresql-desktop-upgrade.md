# Upgrade desktop a PostgreSQL — contratto operativo

Stato: **procedura target, non ancora disponibile nei bundle**. I bundle `v0.1.1`
usano SQLite, layout 1 e `desktop_contract = 1`; le loro procedure restano in
[backup SQLite](sqlite-backups.md) e [guscio docente](desktop-teacher-shell.md).
Il riferimento normativo è [ADR-0004](../architecture/adr/0004-postgresql-only-runtime-and-desktop-layout-2.md).
Non eseguire questa procedura con dati reali finché i gate di accettazione non sono completi.

## Confine e prerequisiti

- PostgreSQL 15 diventa il database di server, portable, desktop docente e futura app studente.
  Il server di produzione non viene aggiornato o usato per le prove.
- SQLite resta soltanto sorgente legacy e fixture del converter. Non è un fallback di avvio.
- Radice dati e bundle ID non cambiano. Upload, RAG, memoria file, credenziali e portachiavi restano al loro posto.
- La build contratto 2 deve includere runtime cluster, converter, `pg_dump`/`pg_restore` e restore verificato.
  Un updater senza uno di questi componenti non può offrire l'upgrade.
- Test e prove usano soltanto profili temporanei e fixture sintetiche sui quattro target F0-02.

## Sequenza di primo avvio o riapertura

1. Il guscio acquisisce il lock della stessa cartella dati e distingue nuova installazione,
   layout 1 da importare e layout 2 già migrato secondo ADR-0004 §3.1.
2. Avvia soltanto il cluster PostgreSQL proprietario, incluso nel bundle; non richiede admin,
   Docker, rete o PostgreSQL già installato. Porta dinamica su `127.0.0.1` e SCRAM nel portachiavi OS.
3. Verifica processo/PID/percorso e salute del cluster. Se trova una porta occupata cambia porta,
   senza terminare il processo che la occupa.
4. Per layout 1 esegue il converter prima del backend applicativo. Per layout 2 avvia il backend
   con `DATABASE_URL` PostgreSQL solo nel suo ambiente.
5. Accetta soltanto `/health` con versione coerente, `desktop_contract: 2` e `db: "postgresql"`;
   poi avvia frontend e, se richiesto, tunnel.
6. L'arresto è tunnel → frontend → backend → PostgreSQL. Stop/crash agiscono soltanto sul cluster
   identificato da cluster UUID, PID, executable e fingerprint di avvio.

## Upgrade da layout 1: invarianti

1. **Snapshot prima.** Il converter crea con l'API SQLite uno snapshot che include il WAL,
   verifica integrità/FK e conserva il file originale e i sidecar. Non apre il runtime SQLite.
2. **Nessuna installazione vuota.** Un `layout.json`, un file SQLite o backup preesistente impedisce
   il percorso “nuova installazione”. Sorgente assente ma backup presente richiede ripristino.
3. **Una transazione.** Schema, righe, ID, FK, sequence e receipt tecnico sono committati insieme.
   Tabelle/colonne senza mapping esplicito, errori o verifiche diverse fanno rollback.
4. **Verifica semantica.** Conteggi e digest canonici per tabella; PK/FK e sequence; UTC, JSON,
   binari e valori cifrati; account/auth/consensi/audit; manifest degli upload/RAG/memorie.
   Report e log non contengono righe, pseudonimi, URI o password.
5. **Backup PostgreSQL prima dell'attivazione.** `pg_dump` custom e `pg_restore` in un cluster
   temporaneo devono riuscire. Solo dopo si scrive `layout: 2` in modo atomico.
6. **Ripresa sicura.** Dopo crash si cerca il receipt dello stesso tentativo: si riprendono dump e
   marcatura oppure si riparte dal rollback, senza ricopiare alla cieca. La sorgente non cambia.

Lo stato persistente è `migration/sqlite-import.json`; i report sono in `migration/<attempt-id>.json`.
Gli stati `completed` e layout 2 non possono precedere commit, verifiche e restore di prova.

## Backup e ripristino PostgreSQL

I dump risiedono in `backups/postgresql/` con manifest SHA-256, separati dagli snapshot SQLite.
La retention ordinaria conserva sette copie e non elimina i dump protetti pre-import/pre-restore.
Prima di ogni aggiornamento layout 2 è richiesto un restore di prova; un dump soltanto elencabile
non è sufficiente. Se backup o restore fallisce, l'aggiornamento si ferma.

Il ripristino operativo avviene a backend fermo: dump di sicurezza dello stato corrente, restore in
un database di staging, verifiche e soltanto alla fine switch dei nomi. Il database precedente viene
conservato. Dump e restore non comprendono allegati, RAG, memoria file, portachiavi o chiavi locali:
per una copia completa si conserva l'intera radice dati in modo coordinato e protetto.

## Rollback alla build SQLite

Il vecchio bundle rifiuta correttamente layout 2: reinstallarlo senza ripristinare i dati non è un
rollback. La procedura assistita deve:

1. fermare app e tunnel e creare/verificare un dump PostgreSQL di sicurezza;
2. conservare cluster e file utente, quindi ripristinare offline lo snapshot SQLite pre-import;
3. verificare integrità, conteggi e file esterni prima di riportare `layout.json` a 1;
4. reinstallare il bundle precedente, avviare senza tunnel e controllare accessi, classi e allegati.

Le modifiche effettuate in PostgreSQL dopo l'import non sono presenti nel vecchio snapshot: questo
limite deve essere confermato dall'operatore. Né cluster né sorgente legacy vengono eliminati
automaticamente. Il ritorno successivo a PostgreSQL richiede una nuova migrazione esplicita.

## Accettazione obbligatoria prima di una release

- [ ] Primo avvio offline senza admin su macOS ARM64/x64, Windows x64 e Ubuntu 22.04 x64;
      binari 15.19, manifest, hash e notice verificati.
- [ ] Doppio avvio, health contratto 2, stop normale, SIGKILL del guscio, crash/recovery PostgreSQL,
      sleep/ripresa e nessun processo orfano; un altro PostgreSQL resta sempre intatto.
- [ ] Fixture layout 1 con WAL e dati rappresentativi importate senza modificare la sorgente;
      conteggi, ID/FK/sequence, UTC, JSON/binari/cifrati e file esterni verificati.
- [ ] Fault injection prima/durante/dopo commit, dump e marcatura layout 2; retry idempotente,
      nessun duplicato e nessun database vuoto presentato come successo.
- [ ] Restore reale, updater bloccato da backup/restore fallito e rollback eseguito su fixture.
- [ ] CI business solo PostgreSQL, test converter legacy separati, versioni allineate e smoke/carico
      finali superati. Nessun dato reale o servizio di produzione coinvolto.

Fino alla chiusura di tutte le voci la migrazione non è consegnata e non si pubblica una release.
