# Handoff — contratto PostgreSQL unico

## Stato
- PR #603 aperta: `docs/postgresql-unified-contract`; recupero 26/10/2026.
- Task recupero `44e57ba9-93be-4de9-a173-7be75608e4d8`, agente `s20-fix-603-codex`.
- PR #600 MERGED: `2fa78bd905aa613c67da28f51b7d97d6d3a61c1d`.
- Merge di quel commit già in corso ripreso senza abort/reset o riapplicare snapshot.

## Fatto
- Conservato ADR-0004: target PostgreSQL 15 unico, layout/contratto 2 da implementare.
- Conservati contratto PG, contenuti P10/builder e tutti i file integrati da #600.
- Unico conflitto: `platform-guidance-state.json`, rigenerato con snapshot dello script
  progetto sull’albero combinato e `make guidance-refresh`; nessuna scelta ours/theirs.
- Frontend/backend/desktop staged identici a origin/main; nessuna riscrittura runtime.
- Snapshot di sicurezza in `/tmp/counselorbot-postgresql-migration-20261026/codex-recovery-603`
  non applicato. Nessun dato reale, ambiente, credenziale o produzione toccato.

## Verifiche
- `make guidance-refresh`, `make guidance-check`: OK.
- `python3 scripts/check-platform-guidance.py --check --base origin/main`: OK.
- `make version-check`: 0.1.2 allineata, nessuna pubblicazione autorizzata.
- Python 3.12.9: 3 test `test_platform_guidance_check.py` superati.
- Link Markdown locali dei 15 documenti della PR: 97 verificati, zero errori.
- `git diff --check` e `git diff --cached --check`: OK prima del commit.
- Nessuna suite backend, build Docker, processo dev o deploy necessario per il recupero docs.

## Prossimi passi
1. Completare il merge con commit Conventional e push sul branch esistente.
2. Verificare remoto=locale, PR #603 MERGEABLE e nuove CI guidance/Release Drafter.
3. A CI verde chiudere solo il task recupero e notificare nel Diario, senza commit di esiti CI.

## Blocchi e rischi
- Nessun merge autonomo della PR; task PG successori fermi finché #603 non è MERGED.
- Nessuna release SQLite 0.1.2; runtime/dati/unificazione e gate OS restano da implementare.
- QPCC #604–610 (milestone 37) resta backlog successivo ai lavori correnti inclusa migrazione PG.
