# Handoff — F1-05j backup SQLite
Agente: s49-f105j-codex · Branch: feature/f1-05j-sqlite-backup
Task diario: b2fa405f-2e23-48e2-b020-878673b39024
PR: https://github.com/nugh75/counselorbot-sbs/pull/552 (progetto CounselorBot)
Aggiornato: 2026-10-24

## Stato
Fatto — implementazione verificata, PR #552 aperta, Diario aggiornato.

## Fatto
- Verificati worktree, branch, istruzioni, ADR-0003 e bootstrap subagente.
- Decisione: backup online nativo, pubblicato solo dopo integrity_check;
  restore a backend fermo con copia preventiva; PostgreSQL no-op.
- Destinazione richiesta dal task: DATA_DIR/backups (il guscio passa DATA_DIR=uploads).
- Implementati backup, retention per DB, restore offline con snapshot preventivo,
  no-op PostgreSQL e timeout; procedura in docs/operations/sqlite-backups.md.
- Commit feature: 88300719, pushato; PR #552 aperta e collegata a CounselorBot.
- Diario: task fatto, link PR nel body; notifica inviata, ricezione non confermata.
- Bug SHM c7b07a14-1020-42d6-8184-4affa50e9bcf registrato nel Diario e corretto.
- Follow-up CI (d1b1270b): test allineato alla migrazione LocalSession c2804b5c;
  richiede almeno 165 UTCDateTime e nessun DateTime grezzo.
- Bug 9c92273f-8b59-4b8d-99ae-6d56c7ba0b14 registrato e risolto nel Diario.

## Verifiche
- Stato iniziale: solo .metadata_never_index non tracciato, da preservare.
- Python 3.11.9: 38 test del modulo passati, 74 con motore/db_compat/schema SQLite.
- SQL portability, guidance-refresh/check e git diff --check passati.
- Follow-up Python 3.11.9, TEST_DB=sqlite, test_utc_datetime.py: 6 pass, 1 skip
  (test esplicito PostgreSQL); fallimento originale riprodotto prima del fix.
- Rebuild Docker finale non completato; nessun ulteriore rebuild su richiesta
  dell'utente. Nessun build/dev attivo; produzione non modificata.

## Prossimi passi
- Revisione e merge della PR da parte dell'utente; nessun merge automatico.
- F1-16: collegare gli helper all'updater e al layout backup del guscio.

## Blocchi e rischi
- Restore richiede chiusura di tutte le connessioni e sospensione dei writer.
- Solo database: upload e chiavi richiedono il proprio archivio coordinato.
