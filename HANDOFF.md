# Handoff: Libretto nella triade — Lotto A completato, si passa al lotto B
Data: 2026-09-26 (h ~00:55) | Sessione precedente: orchestrazione pi/glm (A6 review + A7 completo)
Worktree: `/tmp/cb-libretto` (branch `feature/libretto-triade`, pushato; `~/counselorbot-sbs` resta su `main`)
Piano: `docs/plans/2026-09-25-libretto-nella-triade-plan.md` (21 task: A1–A7 ✅, poi B, C, D)
Ledger: `/tmp/cb-libretto/.superpowers/sdd/2026-09-25-libretto-nella-triade-plan/` (progress.md = registro cronologico)

## Objective
Fondere il «libretto dello studente» nella triade Obiettivi–Azioni–Linea del tempo. **Lotto A (backend) è COMPLETO**. Prossimo: lotto B (frontend Obiettivi: popup, metodo, bilancio, controlli in bacheca) — task B1–B4 nel piano.

## Progress (lotto A)
- [x] A1 Modello dati — `80de914`, revisionato
- [x] A2 Ruoli link + origine — `0b55df6` + fix `609d332`, revisionato
- [x] A3 Metodo e strategie proprie — `97d0c28` + fix `c22ceb1`, revisionato
- [x] A4 Azioni di controllo e rilettura tappe — `c803a1c`, revisionato (1 parked: RED evidence persa per crash pi)
- [x] A5 Bilancio dell'obiettivo — `f49db99`, revisionato (1 parked: doppio trailer attribuzione)
- [x] A6 «La mia lettura» — `91731af`, revisione APPROVED (glm): 5 findings Minor (gap test da gestire in consolidation)
- [x] **A7 Migrazione del libretto — `6045166`, revisione APPROVED (glm)**: 7 test GREEN + 38/15 correlati; prova a secco su copia prod: 8 utenti, 9 letture, 2 nuovi obiettivi, idempotente. Hook spento di default (`BOOKLET_MIGRATION=1`, si accende in C5).

## Problems Encountered
- Quota Anthropic esaurita (reset ore 2:20) → **l'utente ha stabilito R7: revisioni ed esecuzione anche via pi/glm, niente subagenti Anthropic finché quota limitata**. Funzionato bene per A6 review e A7 completo (implementazione + revisione severa).
- Flag pi: `--thinking off` è il flag giusto per l'errore 400 `reasoning_effort` del provider opencode-go; `--no-reasoning` NON esiste.
- `run-pi.sh` gestisce già retry automatico con thinking off.
- pi ha cancellato uno stash durante la verifica di A7: recuperato integro (`git stash store` da `48147c0`), stash list verificato = 3 voci. Evitare `git stash`/`checkout` nel worktree nelle future verifiche di pi.

## Resolutions
- Test backend SEMPRE dal worktree: `cd /tmp/cb-libretto && set -a && . /home/nugh75/counselorbot-sbs/.env && set +a && DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5435/${POSTGRES_DB}" python3 -m pytest <file> -q` (Ruling R5).
- Reviewer glm: sessione separata dall'implementatore, prompt con checklist di severità massima, unico file scrivibile = findings.md.
- Smoke failure residuo NOTO: `test_an_older_stage_of_the_map_can_be_drawn_again` (test_smoke.py) — preesistente, riprodotto su `ae1eebc`; da aggiungere alle note del piano.
- Dispatch pi: `$W/run-pi.sh <TASK_ID>` (timeout 25', stdin </dev/null, retry automatico).

## Decision Log
- Worktree `/tmp/cb-libretto` per tutto il lotto; main non toccato finché lotti non chiusi.
- pi implementa, glm revisiona in sessione separata (R7 sostituisce R1 per la quota); revisione Claude/opus possibile al reset quota.
- Migrazione A7 idempotente con marcatore Log; hook spento di default, si accende in C5; ; in C5 aggiungere per-user try/except in `migrate_all_booklets` (finding revisione).
- Troncamenti silenziosi note>2000/item>12: conformi al piano, da monitorare in C5.
- Dettagli estetici rimandati: a-capo A3, righe di attribuzione A5, newline personal_strategies.py.
- gap test A4/A6 da raccogliere in un task di consolidation: RED evidence A4, clean() readings, GET altro utente null, strumenti senza fattori, corpo 409, limiti validazione.

## Prossimo passo alla ripresa
1. `git -C /tmp/cb-libretto log --oneline -3` → ultimo = `6045166` (A7).
2. Dispatchare **lotto B** con `run-pi.sh B1` (e poi B2–B4 in sequenza). Brief già pronti: `$W/task-B*-brief.md`. Attenzione Ruling R2: traduzioni B1 scritte dall'implementatore, anche in glm.
3. Alla fine del lotto B: revisione glm come per A6/A7 (checklist severità, sessione separata).
4. Il piano prevede commit Conventional in inglese + trailer Generated-with: pi (opencode-go/glm-5.3-flash).
