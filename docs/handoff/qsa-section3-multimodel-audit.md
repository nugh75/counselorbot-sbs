# QSA Sezione 3 (Second-level) — audit multi-modello + handoff

**Data**: 2026-06-27 · **Branch**: `fix/qsa-certified-second-level-advice` (pushed, non in main)

Continua da [`qsa-next-steps-todo.md`](./qsa-next-steps-todo.md). Questo doc copre il lavoro
sulle strategie certificate, l'ingest delle schede Ottone, il supporto QSAr e l'audit
multi-modello della Sezione 3.

## Cosa è stato fatto in questa sessione

1. **Copertura strategie certificate completata** — create C2, C6, A2 → **14/14 fattori QSA**.
   Le 3 voci `factor_codes=[]` erano Savickas (scope `["SAVICKAS"]`): corrette, non toccate.
2. **Ingest fonte Ottone** — scaricate e trascritte le schede dei 14 fattori (testo integrale)
   da competenzestrategiche.it → [`03_Schede_fattori_QSA_testo_integrale.md`](../fonti/competenze-strategiche/sito-competenzestrategiche/guide/schede-bibliografiche/03_Schede_fattori_QSA_testo_integrale.md)
   (commit `0d463db`). Le 14 descrizioni certificate **allineate verbatim** a Ottone + `source_reference`.
3. **+2 strategie evidence-based** — `qsa-retrieval-practice`, `qsa-spaced-practice`
   (Dunlosky et al. 2013; The Learning Scientists). Totale **15 righe QSA-domain**.
4. **Supporto QSAr** — gli 8 fattori `r`-suffixed (C1r..A4r) mappati **per costrutto** alle
   strategie QSA (NB: C3r=C5, C4r=C6, A4r=A6) + `questionnaire_types` esteso a `["QSA","QSAr"]`.
   Patch gating in `certified_strategy_service.py` per riconoscere i codici `r` + test
   (commit `74141b5`). Copertura **8/8 QSAr**.
5. **Fix score-gating retrieval-practice** — `recommended_when` da plurale "aree" a singolare
   "risulta un'area di crescita" → ora correttamente escludibile quando C7/C2 non sono in crescita.
6. **Audit multi-modello Sezione 3** (vedi sotto).

## Audit Sezione 3 — 7 modelli × 6 step (42 conversazioni)

Profilo fisso (C1:7 C2:5 C3:3 C4:6 C5:4 C6:7 C7:5 A1:8 A2:6 A3:5 A4:8 A5:3 A6:3 A7:7).
Endpoint `/admin/prompt-audit/live`, mode second-level, knowledge on, max_tokens 900.
**42/42 completate, 0 errori di rete.**

### Correttezza dei consigli (deterministica per step — indipendente dal modello)
| Step | Target crescita | Consiglio | Esito |
|---|---|---|---|
| 3.1 Elaborazione | nessuno (C1 forza, C5/C7 adeguati) | omissione | ✅ (dopo fix #5; prima iniettava retrieval) |
| 3.2 Autocontrollo | **C6=7** | `concentration-environment` (+disorientation) | ✅ ⭐ caso prima rotto |
| 3.3 Motivazione | A6=3 | `perceived-competence` | ✅ |
| 3.4 Gestione emotiva | A1=8 / A7=7 | `anxiety-regulation` + `emotional-interference` | ✅ |
| 3.5 Stile attributivo | A4=8 | `growth-mindset-attribution` | ✅ |
| 3.6 Dimensione sociale | nessuno (C4=6 adeguato) | omissione | ✅ |

Pipeline certified-advice **promossa**: 6/6 step corretti (incluso C6 prima rotto e le omissioni
score-aware dove non serve piano).

### Qualità per modello (red checks: lingua/greeting/formato/coverage/scope/inversione/refusal/leak)
- **Perfetti (red=0 su tutti e 6)**: Marco (deepseek-v4-flash), Luca (gemma4:12b),
  Elena (openrouter/deepseek-v4-flash), Davide (ling-2.6-flash), Giulia (mistral-small-24b).
- **Sara (gemma4:e4b)**: 5/6, **vuoto** sullo step più complesso (3.2). Modello 4B sotto carico.
- **Nadia (qwen3.5:9b, reasoning on)**: **1/6**. 3 risposte **vuote** (il `<think>` consuma
  il budget, ollama non cappa il thinking), 2 **scope leak**. Inaffidabile.

### Tempi medi: Davide 3.4s · Sara 9.6s · Giulia 12.3s · Marco 12.9s · Nadia 19.1s · Luca 26s · Elena 29.3s.

## qwen3.5:9b — due versioni create (richiesta utente)
| Preset | Counselor | Config | Esito test 6 step |
|---|---|---|---|
| 9 `Qwen 3.5 9B Reasoning` | Nadia (id 7) | thinking on, reasoning_budget 12000 | **1/6** puliti, 3 vuoti, lento (20-30s) |
| 10 `Qwen 3.5 9B No-Think` | Nora (id 8) | `disable_thinking=true` | **4/6** puliti, 0 vuoti, **2.6-4.6s** |

Conclusione: **alzare il reasoning non risolve** (ollama non limita il think → vuoti/leak
intermittenti, qualunque budget). La versione **no-think è nettamente migliore** ma qwen mantiene
un limite intrinseco di **aderenza allo scope** (2/6 scope leak). Nadia ha in descrizione l'avviso
"più lento".

## Stato DB attuale (solo-DB, nessun seed in codice)
- `certified_strategies`: 15 righe QSA-domain (14 fattori + retrieval + spaced) + 3 Savickas + 3 ZTPI.
- `model_presets`: +id 9 (qwen reasoning), +id 10 (qwen no-think).
- `counselors`: +id 7 Nadia (preset 9), +id 8 Nora (preset 10).

## Aperti
- **Merge in main** del branch (dopo eventuale review).
- **Seed idempotente** delle certified_strategies in `startup_event` (oggi solo-DB → DB nuovo vuoto).
- **Floor di modello** Sezione 3: escludere 4B (gemma4:e4b) e qwen-reasoning; qwen no-think
  accettabile ma con scope leak residui.
- **Scope leak qwen** (anche no-think): rinforzo prompt sullo scope o LLM-judge dello scope.
- TODO storici (punti 3-5): batteria con certified attivo, metrica `pochi-consigli`,
  inversione su modelli piccoli.
- `qsa-spaced-practice` non ancora osservata in output (codici C2/A5 non salienti con questo profilo);
  verificare con un profilo dove C2 o A5 sono in crescita.

## Pointer
- Strategie: tabella `certified_strategies`; CRUD `backend/routes/certified_strategies.py`;
  retrieval/scoping `backend/certified_strategy_service.py` (patch QSAr).
- Audit: endpoint `/admin/prompt-audit/live` (header `X-Prompt-Audit-Token`).
- Commit sessione: `0d463db` (ingest Ottone), `74141b5` (QSAr+test), `bf58cfe` (TODO update).
  Modifiche DB (15 strategie, fix retrieval, presets/counselors qwen) **non in git**.
