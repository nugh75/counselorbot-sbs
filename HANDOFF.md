# Handoff: Libretto nella triade — Lotti A e B completati, si passa al lotto C
Data: 2026-09-26 (h ~4:40) | Sessione: orchestrazione pi/glm (A6 review, A7, B1–B6)
Worktree: `/tmp/cb-libretto` (branch `feature/libretto-triade`, pushato; `~/counselorbot-sbs` resta su `main`)
Piano: `docs/plans/2026-09-25-libretto-nella-triade-plan.md` (21 task: A1–A7 ✅, B1–B6 ✅, poi C, D)
Ledger: `/tmp/cb-libretto/.superpowers/sdd/2026-09-25-libretto-nella-triade-plan/` (progress.md = registro)

## Objective
Fondere il «libretto» nella triade Obiettivi–Azioni–Linea del tempo. **Lotti A e B completi**. Prossimo: lotto C (Compilazioni «La mia lettura», Taccuino, Linea del tempo, chat, rimozione libretto) — task C1–C5 nel piano, poi D.

## Progress
- [x] **Lotto A** (backend, dati/API/migrazione): A1–A7 tutti revisionati — ultimo `6045166` (A7 migrazione, hook spento `BOOKLET_MIGRATION=1`, si accende in C5).
- [x] B1 Tipi e testi — `9e68755` (48+2 i18n chiavi × 6 lingue)
- [x] B2 MethodPicker — `ddd9599`
- [x] B3 Sezioni nel popup — `9b1b3c5`
- [x] B4 Passo bilancio — `b90d296` + fix `1d1349d` (Retry su 409)
- [x] B5 Progresso sui controlli — `1765840`
- [x] B6 Test browser Obiettivi — `cb338b9` (test:goals 21 pass/1 skipped; npm test 224)

## Problems Encountered (nuovi, dal lotto B)
- **PII redaction vs titoli di test numerici**: un numero a 13 cifre che passa Luhn (es. timestamp `Date.now()`) viene redatto come `[carta]`/`[telefono]` nel workspace salvato → titoli corrotti e test non deterministici. Fix: run id alfanumerico `Math.random().toString(36).slice(2,8)`.
- **`isDisabled()` inaffidabile su `<option>`** → usare `getAttribute('disabled')`.
- **summary non ha role button** nel dialog → usare `getByText`.
- **radii non raggiungibili via fieldset legend** → `getByRole('group', {name}).getByRole('radio')`.
- **fixture browser senza mock `/orientation-directory`** → pageerror «Cannot read properties of undefined (reading 'length')» (InstitutionTimelineDates) e pagina timeline crash → mock aggiunto in `goals_browser_server.py` (uso: il test fixture deve includere `{ events: [] }`).
- **tree focus-return to opener row** non funziona né su baseline (056ce70) né sul lotto: test `tree keyboard` SKIPPED con nota — follow-up da tracciare.
- La fixture `goals_browser_server` NON resetta lo schema tra i run: **riavviarla prima di ogni run di test:goals** (kill + rilancio), altrimenti accumulo di dati fa fallire i locator strict-mode.

## Resolutions (invariate + note)
- Test backend dal worktree: `cd /tmp/cb-libretto && set -a && . /home/nugh75/counselorbot-sbs/.env && set +a && DATABASE_URL=... python3 -m pytest <file> -q` (R5).
- Implementatore: `$W/run-pi.sh <TASK_ID>` (pi glm-5.3-flash, timeout 25', retry automatico con `--thinking off`).
- Reviewer: glm in sessione separata, checklist severità, unico file scrivibile `task-<T>-findings.md` (R7: niente subagenti Anthropic finché quota limitata).
- Dev server per i test browser: `cd /tmp/cb-libretto/frontend && npx next dev -H 127.0.0.1 -p 3117` (NON usare il 3107: gira dal checkout principale senza il codice del branch). Fixture backend: porta 18096.
- Fail preesistenti NOTI (non dipendono dal piano): smoke `test_an_older_stage_of_the_map_can_be_drawn_again`; PNG guide tsc; NewDeckDialog lint; tree keyboard focus (skip).

## Decision Log (nuovi)
- B6 risolto dal controller (io) e non da pi: dopo 3 cadute di pi su B4/B6 e la natura di debugging dei test browser, la correzione diretta era più economica; commit con trailer Claude secondo le Global Constraints.
- I test browser sono dati-persistenti: ordine dei test = file order, tutti su fixture fresh (nota nel test file, righe ~309).
- Dettagli estetici rimandati (dal lotto A): a-capo A3, doppio trailer A5, newline personal_strategies.py, test gap A4/A6 → consolidation task futuro.

## Prossimo passo alla ripresa
1. `git -C /tmp/cb-libretto log --oneline -3` → ultimo `cb338b9` (B6).
2. Dispatchare **lotto C**: C1 (selettore fattori), C2 (taccuino), C3 (Compilazioni + lettura), C4 (timeline + chat), C5 (rimozione libretto e attivazione hook migrazione). Brief: `$W/task-C*-brief.md`. C5 accende `BOOKLET_MIGRATION` e elimina `booklet_timeline.py`/rotte libretto.
3. Ogni task: implementazione pi/glm + revisione glm in sessione separata (come per B*).
4. Nella C5: prima il rebuild Docker (avvisare l'utente) e la prova a secco della migrazione sul DB di test; **nessun passo sudo**.
