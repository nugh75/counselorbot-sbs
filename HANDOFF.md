# Handoff: Libretto nella triade — riprendere dal lotto C
Data: 2026-09-26 | Sessione precedente: orchestrazione pi/glm (lotti A e B completi, 13/21 task)

## Objective
Completare il piano «il libretto confluisce nella triade» (`docs/plans/2026-09-25-libretto-nella-triade-plan.md`, 21 task): lotti **A (backend) e B (frontend Obiettivi) sono chiusi e revisionati**. Ripartire dal **lotto C** (C1–C5), poi D (D1–D4). Fine: il libretto è eliminato, tutto vive in Obiettivi–Azioni–Linea del tempo + PDF «Percorso dell'obiettivo».

## Progress
- [x] **Lotto A** — dati, API, migrazione (commits `80de914`…`6045166`). A7 migrazione idempotente, hook spento di default (`BOOKLET_MIGRATION=1`), prova a secco su copia prod OK (8 utenti, 9 letture, 2 obiettivi, no-op alla seconda esecuzione).
- [x] **Lotto B** — popup Obiettivi (commits `9e68755`…`cb338b9`): tipi+i18n 6 lingue, MethodPicker, sezioni §7.4, passo bilancio con Retry su 409, progresso sui controlli, test browser 21 pass/1 skipped.
- [ ] **Lotto C** — C1 selettore fattori, C2 taccuino, C3 Compilazioni + «La mia lettura», C4 timeline + chat, C5 rimozione libretto + attivazione hook migrazione (brief: `.superpowers/sdd/2026-09-25-libretto-nella-triade-plan/task-C*-brief.md`).
- [ ] **Lotto D** — PDF «Percorso dell'obiettivo», contesto AI, documentazione (brief D1–D4).

## Problems Encountered
- **pi/glm cade o si blocca** a volte (400 `reasoning_effort` dal provider opencode-go): `run-pi.sh` ha già il retry con `--thinking off`; se si blocca oltre 6–8 min, kill e rilancio in sessione nuova.
- **Test browser e PII**: un numero a 13 cifre che passi Luhn (es. `Date.now()`) viene redatto come `[carta]`/`[telefono]` nel workspace → nei test usare run id alfanumerici (`Math.random().toString(36).slice(2,8)`), MAI timestamp decimali.
- **Fixture browser** (`backend/tests/goals_browser_server.py`, porta 18096) NON resetta lo schema tra i run: **kill + riavvio prima di ogni run** di `test:goals`, altrimenti i locator strict-mode falliscono per accumulo dati.
- **`isDisabled()` inaffidabile su `<option>`** → `getAttribute('disabled')`; **summary senza role button** → `getByText`; **radii** → `getByRole('group',{name}).getByRole('radio')`.
- **tree keyboard focus-return** rotto anche sul baseline (commit `056ce70`): test skipped con nota — follow-up da tracciare (non è regressione del piano).
- Quota Anthropic a volte esaurita: ruling R7 del ledger — revisioni anche via glm (sessione separata), niente subagenti Anthropic finché limitati.

## Resolutions
- Tutto il lavoro vive nel worktree **`/tmp/cb-libretto`** (branch `feature/libretto-triade`, pushato); `~/counselorbot-sbs` resta su `main` per gli altri agenti.
- Implementatore: `bash .superpowers/sdd/2026-09-25-libretto-nella-triade-plan/run-pi.sh <TASK>` (pi glm-5.3-flash, timeout 25', retry automatico).
- Reviewer: glm in sessione pi separata, checklist di severità, unico file scrivibile `task-<T>-findings.md`.
- Test backend SEMPRE dal worktree: `cd /tmp/cb-libretto && set -a && . /home/nugh75/counselorbot-sbs/.env && set +a && DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5435/${POSTGRES_DB}" python3 -m pytest <file> -q`.
- Test browser: dev server DAL WORKTREE su 3117 (`cd /tmp/cb-libretto/frontend && npx next dev -H 127.0.0.1 -p 3117`), fixture su 18096. Il 3107 gira dal checkout principale (senza il branch) → testi i18n assenti.
- Fail preesistenti NOTI (non del piano): smoke `test_an_older_stage_of_the_map_can_be_drawn_again`; PNG guide tsc; NewDeckDialog lint; tree keyboard focus (skip).
- Registro cronologico completo: `.superpowers/sdd/2026-09-25-libretto-nella-triade-plan/progress.md` (decisioni R1–R8, findings di ogni revisione, dettagli estetici rimandati).

## Decision Log
- Ripartizione: **pi/glm implementa**, **glm revisiona** in sessione separata (R7); la revisione Claude/opus resta possibile al reset della quota.
- Task di integrazione delicati (C5, D*) valutabili per implementazione diretta del controller: dopo 3 cadute di pi su B4/B6, la correzione diretta era più economica.
- Commits: Conventional Commits in inglese; quelli di pi portano `Generated-with: pi (opencode-go/glm-5.3-flash)`, quelli del controller `Co-Authored-By: Claude` (R3).
- Migrazione A7: idempotente con marcatore Log; in C5 accendere `BOOKLET_MIGRATION=1` e rimuovere `booklet_timeline.py` + rotte libretto (410), aggiungendo per-user try/except in `migrate_all_booklets` (finding revisione A7).
- Niente sudo nel piano; se cambia, il comando è `sudo ./update_nginx.sh`. Rebuild Docker in C5: **avvisare l'utente prima**.

## Prossimo passo alla ripresa
1. Leggere questo file e `git -C /tmp/cb-libretto log --oneline -3` (ultimo atteso: `321a335` docs handoff).
2. Dispatchare **C1** con `run-pi.sh C1`, poi C2→C5 in sequenza con revisione glm tra i task (pattern dei lotti A/B).
3. C5: rebuild Docker (avvisare prima), attivazione migrazione, rimozione libretto; verifica smoke.
4. A fine lotti C e D: revisione finale (ledger prevede review opus quando la quota Anthropic lo consente), poi merge su main.
