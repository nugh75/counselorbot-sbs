# QSA Counselor Battery — esito dopo i fix (before → after)

**Data**: 2026-06-27
**Branch**: `fix/qsa-second-level-interplay` (stacked su `fix/qsa-factor-names-canonical`)
**Baseline di confronto**: [`qsa-counselor-battery-report.md`](./qsa-counselor-battery-report.md)
**Metodo**: stessa batteria, stesso profilo unico, 6 counselor × 8 step QSA (48 celle live)
via Prompt Audit API. Profilo: `C1=7 C2=5 C3=3 C4=6 C5=4 C6=7 C7=5 · A1=8 A2=6 A3=5 A4=8 A5=3 A6=3 A7=7`.

## Fix applicati tra baseline e questo run
1. **Nomi fattori canonici** (PDF Pellerey): C5 → "Uso di organizzatori semantici" in tutte le
   lingue; allineati backend + frontend; rimosso codice morto (`ChatInterface`, `qsa-model`);
   test guardia anti-drift. (`fix/qsa-factor-names-canonical`)
2. **Stop duplicazione nome** in `_annotate_qsa_factor_codes` (niente più
   "A6 (Percezione di competenza) Percezione di competenza").
3. **Direttiva `[FACTOR INTERPLAY]`** sui prompt di secondo livello (QSA + QSAr): impone almeno
   una frase su come i fattori si rinforzano/compensano/ostacolano. Applicata a default codice +
   righe DB vive (upgrade one-off idempotente in `startup_event`).
4. Metrica `connection_score` della batteria estesa ai verbi causali (rinforza/compensa/frena…)
   per misurare davvero l'interplay.

## Before → After

| Segnale | Before | After | Lettura |
|---|---:|---:|---|
| poca-connessione (celle) | 26 | **8** | obiettivo del round ✅ |
| copertura (fattori mancanti) | 9 | **3** | ↓ |
| reasoning-leak | 0 | 0 | resta pulito |
| refusal | 0 | 0 | |
| warning prompt (statica) | 0/54 | 0/54 | direttive intatte |
| hard-fail (❌) | 3 | 6 | rumore inversione (vedi sotto) |
| pochi-consigli | 7 | 8 | invariato (primo livello, rinviato) |

> Caveat onesto: parte del calo di `poca-connessione` deriva anche dall'ampliamento del lessico
> metrica (ora conta i verbi causali). La prova **qualitativa** però è netta e indipendente dalla
> metrica (vedi sotto).

## Prova qualitativa dell'interplay (risposte reali, dopo il fix)
- Giulia (mistral-small): *"A2 (Volizione) è sostenuta dalla A6 (Percezione di competenza) ma è
  ostacolata dalla A5 (Mancanza di perseveranza)."*
- Davide (ling): *"A2, A5, A6 lavorano insieme: la volizione sostiene la motivazione… una bassa
  percezione di competenza può indebolire A2, e una forte A5 aiuta a compensare quando A6 è bassa."*
- Marco (deepseek): *"il punto che frena il quadro è una percezione di competenza bassa (A6)…
  anche se hai la volontà, dubitare delle tue capacità ti rende più incerto."*

Prima i secondo livello erano elenchi ("spiego A2, poi A5, poi A6"); ora collegano i fattori.

## Scorecard after

| Counselor | Provider/Model | Hard-fail | Inv.alta | Acc.interp | Leak | Lat.media | Costo |
|---|---|---:|---:|---:|---:|---:|---:|
| Marco (1) | deepseek/deepseek-v4-flash | 0 | 0 | 0.80 | 0 | 10.6s | $0.0027 |
| Sara (2) | ollama/gemma4:e4b | 1 | 2 | 0.71 | 0 | 7.7s | $0.0000 |
| Luca (3) | ollama/gemma4:12b | 2 | 2 | 0.75 | 0 | 18.2s | $0.0000 |
| Elena (4) | openrouter/deepseek-v4-flash | 0 | 0 | 0.83 | 0 | 21.5s | $0.0029 |
| Davide (5) | openrouter/ling-2.6-flash | 1 | 1 | 0.67 | 0 | 34.0s | $0.0003 |
| Giulia (6) | openrouter/mistral-small-24b | 0 | 0 | 0.83 | 0 | 10.8s | $0.0010 |

## hard-fail 3→6: è rumore, non regressione
Tutti i nuovi hard-fail sono inversione "ALTA" su modelli piccoli (Sara A1/A7, Luca A6+A4,
Davide A6). Riprovati a mano, **tornano corretti**:
- Luca/A4=8 → *"…fattori esterni (A4)… limita la tua capacità di intervenire… devi ridurre A4."* (corretto)
- Davide/A6=3 → *"…una bassa percezione di competenza può indebolire A2… A6 è il punto su cui lavorare."* (corretto)

Causa: euristica lessicale di polarità (falsi positivi su fattori invertiti a basso punteggio) +
nondeterminismo dei modelli piccoli. Ortogonale ai fix di questo round.

## Verdetto
UX migliorata sui punti lavorati: secondo livello **collega** i fattori, nomi corretti, nessuna
duplicazione, niente leak/refusal/warning. I numeri "peggiori" (hard-fail) sono rumore dei
modelli piccoli, confermato dai replay.

## Rinviati (non in questo round, per scelta)
- `pochi-consigli` sul primo livello (factor): valutare se chiedere un micro-suggerimento per fattore.
- Floor di modello per QSA: `gemma4:e4b` e `ling` restano i più deboli/variabili sull'inversione.
- Grader d'inversione deterministico (etichetta-banda verbatim o LLM-judge) per togliere il rumore.

## Riproduzione
```bash
python -m backend.tests.test_qsa_counselor_prompt_battery   # full 6×8
QSA_BATTERY_COUNSELORS=1,2,6 QSA_BATTERY_STEPS=sl-motivation,sl-emotions,sl-attribution \
  python -m backend.tests.test_qsa_counselor_prompt_battery # subset second-level
```
