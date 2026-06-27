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

## AGGIORNAMENTO 2026-06-27 (sera) — punti 1-2 fatti, deploy live

- **Punto 1 FATTO**: create le 3 strategie mancanti **C2, C6, A2**; copertura ora **14/14 QSA**.
  Le 3 voci `factor_codes=[]` erano le **Savickas** (scope `["SAVICKAS"]`, niente codici fattore):
  **corrette, non malconfigurate** → non toccate.
- **Ingest fonte**: scaricate e trascritte le schede Ottone (testo integrale) da
  competenzestrategiche.it → `docs/.../03_Schede_fattori_QSA_testo_integrale.md` (commit `0d463db`).
  Le 14 descrizioni certificate sono state **allineate verbatim** a Ottone + `source_reference`.
- **+2 strategie evidence-based**: `qsa-retrieval-practice`, `qsa-spaced-practice`
  (Dunlosky et al.; The Learning Scientists). Totale **15 righe QSA-domain**.
- **QSAr** ora coperto: gli 8 fattori `r`-suffixed (C1r..A4r) mappati per costrutto alle
  strategie QSA + `questionnaire_types` esteso a `["QSA","QSAr"]`. Patch gating in
  `certified_strategy_service.py` per riconoscere i codici `r` (commit `74141b5`, con test).
- **Punto 2 FATTO**: `docker compose build backend && up -d backend` eseguito, container healthy.
  Smoke **77 pass / 4 fail** (3 `site_chat` auth + 1 `prompt_audit_live` assert stantia, **tutti
  preesistenti**); `test_qsa_factor_directive` 17/17.
- Branch pushato. **Caveat**: le `certified_strategies` sono **solo-DB** (nessun seed in codice):
  un DB nuovo nasce vuoto.

### ~~1. Colmare i buchi di copertura~~ ✅ FATTO (vedi sopra)

### ~~2. Deploy del branch + verifica~~ ✅ FATTO (vedi sopra)

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
