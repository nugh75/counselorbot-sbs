# Handoff: Libretto nella triade — Lot A (backend)
Data: 2026-09-26 | Sessione precedente: orchestrazione pi + revisioni Claude (serata 25–26/9)
Worktree: `/tmp/cb-libretto` (branch dedicato; `~/counselorbot-sbs` resta su `main`)
Piano: `docs/plans/2026-09-25-libretto-nella-triade-plan.md` (21 task: lotto A backend = A1–A7, poi B, C, D)

## Objective
Fondere il «libretto dello studente» nella triade Obiettivi–Azioni–Linea del tempo: lotti A (dati, API, migrazione), B (frontend), C, D. Lotto A completo quando tutti i 7 task sono committati e revisionati su `/tmp/cb-libretto`.

## Progress
- [x] A1 Modello dati — commit `80de914`, revisionato.
- [x] A2 Ruoli link obiettivo + origine — `0b55df6`; fix round 1 `609d332` (ruolo «mezzo» su assegnazioni docente e migrazione, normalizzazione DB, test origine «sessione»), revisione confermata.
- [x] A3 Metodo obiettivo e «Le mie strategie» — `97d0c28`; fix round 1 `c22ceb1` (test update metodo su obiettivo esistente), chiuso. Annotato dettaglio estetico (a-capo) per dopo.
- [x] A4 Azioni di controllo e rilettura tappe — `c803a1c` (pi caduto per errore API dopo commit; test eseguiti manualmente: 72 PASS). Revisione ok, retrocompatibilità dei dati confermata. Mancava la prova «prima della modifica» annotata nel journal.
- [x] A5 Bilancio dell'obiettivo — `f49db99` (28 test in test_goals.py, 2 prima falliti poi verdi). Revisione ok; annotata osservazione sulle righe di attribuzione del commit.
- [x] A6 «La mia lettura» — `91731af` (API readings). **Revisione completata alle 00:40: APPROVED** (via pi/glm: gli agenti Anthropic erano bloccati dal rate limit; i 429 si sono ripresentati). Il report di revisione è in `task-A6-findings.md`: 5 findings, tutti Minor (3 test-coverage, 1 lambda style, 1 race info). Gap test da gestire in un task di consolidamento: `clean()` (scarto vuoti/troncamento 120), GET altro utente → `null`, strumenti senza fattori (SAVICKAS/IDEA), corpo del 409, limiti validazione.
- [ ] **A7 Migrazione del libretto — NON assegnato/avviato.** È il task più delicato: piano vuole che sia svolto da un agente Claude, NON da pi. Spec § 8 del piano: `backend/booklet_migration.py` + hook in `main.py` dopo `seed_goals`, test `backend/tests/test_booklet_migration.py`, 8 regole (scheda→lettura/obiettivo/strategie/bilancio/tappe, eventi `booklet-{id}-*` → `migrated-`, schede `EVENTO_*`, link `GoalResourceLink` booklet, marker `MIGRATION_ACTION`, seconda esecuzione no-op).

## Problems Encountered
- **Limite di sessione Anthropic colpito** (429, reset ore 2:20): la revisione A6 fatta invece da pi/glm (deciso dall'utente: niente subagenti Anthropic finché quota limitata).
- Pi (GLM 5.3 Flash via opencode-go) a volte si è bloccato o caduto: le contromisure funzionanti sono in Resolutions. Nota tecnica: `--thinking off` è il flag giusto per il fallback del provider opencode-go (l'errore 400 `reasoning_effort` arriva quando il provider passa reasoning nativo); `--no-reasoning` NON esiste.

## Resolutions
- Il dossier di lavoro del lotto A vive nel worktree `/tmp/cb-libretto`; i commit sono già sul branch (non su main). Verificare con `git log --oneline` e rispettare che `~/counselorbot-sbs` resti su main.
- Pi bloccato → fermarlo e rilanciarlo in **sessione nuova** con limite ~25'; watchdog su stall >6 min o exit, che punti alla sessione corrente (i watchdog vecchi puntano al file della sessione giusta solo quando creati dopo il rilancio, altrimenti rimangono appesi all'infinito).
- Errore `reasoning_effort is not allowed` dal provider opencode-go (caduta di A4): il codice/commit erano già salvati; aggiunto tentativo automatico che rilancia pi **senza ragionamento esteso** per i soli passi mancanti (test, commit, report). Pi è risalito.
- Gap nei test colti in revisione (A3): la revisione mira «che i test coprano le modifiche» ha dato esito utile → mantenerla per ogni task.
- I test si possono eseguire anche manualmente dal worktree (pytest su `backend/tests/`) se pi cade prima del report.

## Decision Log
- Back-end direttamente sul worktree `/tmp/cb-libretto`, main non toccato finché lotto A non chiuso — così gli altri agenti lavorano su main in parallelo.
- Ripartizione dei ruoli: pi scrive codice e test; un agente Claude di revisione approva ogni task prima di passare al successivo — la revisione ha già colto buchi (A2 e A3), costo giustificato.
- A7 affidato a Claude e non a pi — giudizio del piano: la migrazione tocca 8 regole e dice «Consumes A1–A6», troppo delicata per pi.
- Data migration idempotente (seconda esecuzione = no-op) — già deciso nel piano spec § 8, non rivisitare.
- Normalizzazione dei collegamenti già in DB su A2 (ruolo «mezzo») — fatta una volta sola nel fix round 1, non rifare.
- Etichette note della migrazione in italiano («Cosa ho capito: …») come nel piano — non cambiare lingua.
- Le due righe di attribuzione nei commit (firma pi) si lasciano: rischiare la riscrittura della cronologia per estetica non ne vale la pena; annotata, non fixata.
- Dettaglio estetico A3 (a-capo) rimandato a post-lotto per non fermare la catena dei task.

## Prossimo passo alla ripresa
1. Verificare `git -C /tmp/cb-libretto log --oneline -10` e confermare che A6 (`88e7ee0` docs handoff) è l'ultimo commit; revisione A6 APPROVED già registrata in `progress.md` e `task-A6-findings.md`.
2. Dispatchare **A7 (Migrazione del libretto)** a un implementatore, seguendo le 8 regole in spec § 8 del piano (riga ~894). Ruling R1 del ledger: A7 a Claude; se la quota Anthropic fosse ancora esaurita, si può chiedere all'utente se farlo scrivere a pi (il piano lo sconsiglia: 8 regole di migrazione, troppo delicato).
3. Revisione di A7 quando pronto (quota Anthropic al reset, oppure glm).
4. Esecuzione TDD come i task precedenti: test che falliscono → implementazione → tutti verdi → commit convenzionale.
