# Handoff PG-01 — runtime PostgreSQL incorporato

- Agente: `s21-pg-runtime-codex`; task `24553a7c-3f63-4e6c-85f7-3f26659aee79`, ancora in corso.
- Branch/worktree: `feature/desktop-embedded-postgresql`, solo questo worktree.
- Base verificata: `origin/main` e HEAD `0ba190223f75d82e97088bbe9ab2551fba056726`.
- PR #603 verificata MERGED via GitHub; predecessore contratti soddisfatto.
- Checkpoint immediato: quota 8% alle 10:30:44 UTC del 26/10/2026, script exit 2.
- Reset indicato: 12:12:22 Europe/Stockholm; nessuna ripresa automatica.
- Nessuna implementazione avviata; albero iniziale pulito. Solo questo handoff aggiunto.
- Letti AGENTS.md, contesto desktop/PG in CONTEXT.md e contratti congelati:
  [ADR-0004](../architecture/adr/0004-postgresql-only-runtime-and-desktop-layout-2.md),
  [runbook](../operations/postgresql-desktop-upgrade.md).

## Ripresa autorizzata solo dopo verifica quota del Timoniere
1. Eseguire `python3 /tmp/counselorbot-postgresql-migration-20261026/codex-quota.py`
   prima di ogni blocco; a <=8% solo checkpoint, a dato incerto non implementare.
2. Rileggere stato/diff e [F0-02](../architecture/spikes/f0-02-embedded-postgres.md),
   probe `scripts/spikes/embedded_postgres_probe.py` e workflow spike.
3. Primo blocco proposto, NON implementato: manifest/packaging PostgreSQL con hash,
   licenze/notice e test pertinenti, verificando prima fonti ufficiali attuali.
4. Versioni congelate: PG 15.19, theseus-rs 15.19.1 Mac/Windows; sorgenti Linux
   Ubuntu 22.04, senza ICU/readline e con RPATH relativo. Quattro target obbligatori.
5. Integrare poi PostgresClusterManager prepare_new/start/probe/stop (ADR §5),
   identità UUID/PID/executable/fingerprint, SCRAM e portachiavi OS, lifeline/JobObject.
6. DATABASE_URL solo backend/converter; nessun segreto in log, frontend o tunnel.
   Health contratto 2/db postgresql; mai initdb su directory esistente non vuota.
7. Proteggere layout 1 e ogni artefatto legacy: nessuna installazione vuota o
   attivazione contratto 2 senza converter/backup/restore verificati dei task successivi.
8. Commit progressivi, push e PR draft Project CounselorBot; CI reali sui nuovi SHA.

## Limiti e verifiche
- Runtime, test PostgreSQL/lifecycle/installer e CI quattro OS tutti ancora da eseguire.
- Nessuna fonte upstream verificata in questa sessione: versione/hash non riconfermati.
- Nessun dato, .env, credenziale, cluster, servizio o volume reale toccato.
- Nessun processo dev avviato; nessuna build Docker/deploy necessaria per questo file.
- Task aperto; nessun successore C/D, subagente, review incrociata, merge o release.
- Prima del commit: controllare diff, whitespace, link locali e limite 40 righe.
