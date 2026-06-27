# QSA CounselorBot — cose da fare adesso (handoff)

**Data**: 2026-06-27
**Branch corrente**: `fix/qsa-certified-second-level-advice` (pushed, **non** ancora in main)
**Già in main** (merge `3351588`): nomi fattori canonici (PDF) + stop duplicazione nome +
direttiva `[FACTOR INTERPLAY]` second-level + batteria di test.

## Cosa è stato fatto su questo branch (consigli)
"Consigli pratici" ora **score-aware e certificati**: le strategie pratiche vengono prese solo
dalla KB `certified_strategies` (tabella DB, CRUD admin `/admin/certified-strategies`), filtrate
per i fattori dello step e dal loro punteggio, con i blocchi prompt `[CURRENT STEP SCORE PROFILE]`
+ `[CERTIFIED ADVICE]` + `[CERTIFIED_STRATEGIES]` (vedi
[`qsa-five-models-prompt-audit-sl-motivation.md`](./qsa-five-models-prompt-audit-sl-motivation.md)).
Regola chiave: se per i fattori-target dello step **non** c'è una strategia certificata, il
piano pratico viene **omesso** (la risposta resta interpretativa).
Codice: `backend/certified_strategy_service.py`, `backend/chat_logic.py`,
`backend/prompt_audit.py`, `backend/routes/chat.py`. Test aggiunti in `test_smoke.py` e
`test_qsa_factor_directive.py`.

---

## DA FARE — in ordine di priorità

### 1. Colmare i buchi di copertura delle strategie certificate (BLOCCANTE per la UX)
16 strategie certificate attive. Fattori QSA **coperti**: C1, C3, C4, C5, C7, A1, A3, A4, A5, A6.
**Mancano**: **C2 (Autoregolazione), C6 (Difficoltà di concentrazione), A2 (Volizione)**.
Inoltre **3 voci hanno `factor_codes` vuoto** `[]` → da rivedere (generiche o malconfigurate?).

Impatto concreto: nello step **sl-selfcontrol** (C2, C3, C6) il target di crescita è **C6=7**,
che **non ha** strategia certificata → il piano pratico viene **omesso** proprio sull'area
principale dello studente. Stesso rischio ovunque il target cada su C2/C6/A2.

Azione: creare strategie certificate per **C2, C6, A2** via admin
(`POST /admin/certified-strategies`, poi `status=certified`, `is_active=true`, `factor_codes`,
`match_mode`, testi `*_it/en/es/sv`). Rivedere/riassegnare le 3 voci con `factor_codes=[]`.
(ZTPI: manca solo T2 — fuori scope QSA, segnalato.)

### 2. Deploy del branch + verifica (il codice non è ancora live)
Il backend in esecuzione gira l'immagine di `main` (senza il codice certified-advice). Serve:
```bash
docker compose build backend && docker compose up -d backend
docker compose run --rm --no-deps -T backend python -m backend.tests.test_smoke
docker compose run --rm --no-deps -T backend python -m backend.tests.test_qsa_factor_directive
```
Atteso smoke: 76 pass + i 3 fallimenti **preesistenti** `site_chat`/"Non autenticato" (non legati).

### 3. Ri-eseguire la batteria completa con il certified-advice attivo
```bash
python -m backend.tests.test_qsa_counselor_prompt_battery   # 6×8, stesso profilo
```
Verificare: nessuna regressione su leak/refusal/inversione; i consigli pratici compaiono solo
dove esiste la strategia certificata.

### 4. Riconciliare la metrica `pochi-consigli` della batteria col nuovo comportamento
Ora "niente piano quando non c'è strategia certificata" è **voluto**, non un difetto. La batteria
(`backend/tests/test_qsa_counselor_prompt_battery.py`, flag `pochi-consigli`) lo segnalerebbe come
problema → falso positivo. Aggiornare la metrica: segnalare solo quando una strategia certificata
**era disponibile** per i fattori dello step ma il piano è assente/povero. (Una volta colmati i
buchi del punto 1, i casi legittimi di omissione si riducono comunque.)

### 5. Merge in main
Dopo 1-4 verdi: merge `fix/qsa-certified-second-level-advice` → `main` (no-ff) e push.
Nota: stesso pattern dei merge precedenti; il branch parte già da `main` aggiornato.

---

## Ancora aperti (rinviati dai round precedenti)
Da [`qsa-counselor-battery-suggestions.md`](./qsa-counselor-battery-suggestions.md):
- **Inversione su modelli piccoli (S3)**: `gemma4:e4b`/`ling` ogni tanto leggono male i fattori
  invertiti (rumore intermittente, confermato dai replay). Opzioni: floor di modello per QSA, o
  rinforzo prompt sui fattori invertiti a basso punteggio.
- **Grader d'inversione deterministico (S7)**: l'euristica lessicale ha falsi positivi. Far
  emettere al modello l'etichetta-banda verbatim (controllabile) o usare un LLM-judge.
- **Copertura su mistral-small (S6)**: migliorata (9→3) ma non azzerata; eventuale retry mirato
  sui fattori mancanti o floor di modello.

## Stato deterministico (già a posto, in main)
Nomi canonici, nessuna duplicazione, 0 reasoning-leak / 0 refusal / 0 warning di prompt,
tabella d'inversione pre-risolta, interplay second-level (`poca-connessione` 26→8).

## Pointer utili
- KB strategie: tabella `certified_strategies`; CRUD `backend/routes/certified_strategies.py`;
  retrieval/scoping `backend/certified_strategy_service.py`.
- Audit di riferimento: `qsa-five-models-prompt-audit-sl-motivation.{md,json}`,
  `qsa-sara-certified-second-level-audit.{md,json}`.
- Batteria: `backend/tests/test_qsa_counselor_prompt_battery.py`
  (env: `PROMPT_AUDIT_API_TOKEN`, `PROMPT_AUDIT_BASE_URL=http://localhost:8088`,
  `QSA_BATTERY_COUNSELORS`, `QSA_BATTERY_STEPS`).
