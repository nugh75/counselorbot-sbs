# Architecture Decision Records

Decisioni architetturali congelate. Un ADR **accettato** si cambia solo con un nuovo ADR che lo sostituisce
(campo «Sostituisce» / «Sostituito da»), non riscrivendolo.

| N. | Titolo | Stato | Data |
|----|--------|-------|------|
| [0001](0001-installation-profiles-and-desktop-packaging.md) | Profili di installazione e packaging dell'app desktop | Accettato; integrato da 0004 | 2026-10-24 |
| [0002](0002-desktop-phase-1-contracts.md) | Contratti della Fase 1 desktop: identità locale, abbinamento, cartella dati, guscio↔sidecar | Accettato; integrato da 0004 | 2026-10-24 |
| [0003](0003-dual-database-postgres-sqlite.md) | Doppio database: Postgres per server/portable, SQLite per le app desktop | Sostituito da 0004; storia layout 1 | 2026-10-24 |
| [0004](0004-postgresql-only-runtime-and-desktop-layout-2.md) | PostgreSQL unico e layout desktop 2 | Accettato come target; non consegnato | 2026-10-26 |

Contesto generale: [`../desktop-apps-plan.md`](../desktop-apps-plan.md) (epic #499, milestone «Desktop apps»).
