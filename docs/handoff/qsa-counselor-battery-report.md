# QSA Counselor Prompt & Performance Battery

_Generato: 2026-06-27T13:26:34+00:00_  ·  base: `http://localhost:8088`  ·  lingua: `it`

Counselor sotto test: 1, 2, 3, 4, 5, 6  ·  Step: cognitive, affective, sl-elaboration, sl-selfcontrol, sl-motivation, sl-emotions, sl-attribution, sl-social

> ⚠️ **Limiti della metrica.** I segnali DETERMINISTICI (no reasoning-leak, no refusal,
> struttura del prompt, tabella d'inversione pre-risolta, copertura fattori, formato
> codici) sono affidabili. Il check di **polarità interpretativa** (`Inv.alta`/`Inv.screen`,
> `Acc.interp`) è invece **euristico-lessicale**: ha falsi positivi (un fattore invertito a
> basso punteggio ha un nome negativo) ed è sensibile al non-determinismo dei modelli. Si
> leggono come *celle da rivedere a mano* e come *ranking relativo tra modelli*, non come
> verdetti assoluti. Sara/sl-emotions e Elena/sl-motivation, riprovate, sono risultate
> CORRETTE → conferma del rumore della metrica.

> Eseguito con: `python -m backend.tests.test_qsa_counselor_prompt_battery`
> (vedi il file di test per le variabili d'ambiente). Tutto via Prompt Audit API
> `/admin/prompt-audit/{matrix,dry-run,live}`, profilo unico per tutti i counselor.

## Batteria PROMPT (statica, dry-run / matrix)

- Step analizzati: **8**  ·  counselor di riferimento per envelope: `1`
- Celle matrice con warning: **0 / 54**

| Step | Mode | Fattori scoped | Len sysprompt | Problemi |
|---|---|---|---:|---|
| cognitive | factor | C1, C2, C3, C4, C5, C6, C7 | 5824 | ✅ |
| affective | factor | A1, A2, A3, A4, A5, A6, A7 | 5824 | ✅ |
| sl-elaboration | second-level | C1, C5, C7 | 4876 | ✅ |
| sl-selfcontrol | second-level | C2, C3, C6 | 4870 | ✅ |
| sl-motivation | second-level | A2, A5, A6 | 4868 | ✅ |
| sl-emotions | second-level | A1, A7 | 4873 | ✅ |
| sl-attribution | second-level | A3, A4 | 4874 | ✅ |
| sl-social | second-level | C4 | 4875 | ✅ |

## Batteria PERFORMANCE (live, /admin/prompt-audit/live)

Profilo unico per tutti: `{"C1": 7, "C2": 5, "C3": 3, "C4": 6, "C5": 4, "C6": 7, "C7": 5, "A1": 8, "A2": 6, "A3": 5, "A4": 8, "A5": 3, "A6": 3, "A7": 7}`

### Scorecard per counselor

| Counselor | Provider/Model | Celle | Hard-fail | Inv.alta | Inv.screen | Acc.interp | Leak | Lat.media | Costo tot |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Marco (1) | deepseek/deepseek-v4-flash | 8 | 0 | 0 | 0 | 0.95 | 0 | 10.0s | $0.0024 |
| Sara (2) | ollama/gemma4:e4b | 8 | 1 | 2 | 2 | 0.74 | 0 | 7.2s | $0.0000 |
| Luca (3) | ollama/gemma4:12b | 8 | 0 | 0 | 0 | 0.87 | 0 | 16.1s | $0.0000 |
| Elena (4) | openrouter/deepseek/deepseek-v4-flash | 8 | 1 | 1 | 0 | 0.79 | 0 | 20.6s | $0.0024 |
| Davide (5) | openrouter/inclusionai/ling-2.6-flash | 8 | 0 | 0 | 0 | 0.84 | 0 | 16.2s | $0.0002 |
| Giulia (6) | openrouter/mistralai/mistral-small-24b-instruct-2501 | 8 | 0 | 0 | 0 | 0.84 | 0 | 11.9s | $0.0010 |

_Inv.alta = inversione errata ad alta confidenza (bloccante). Inv.screen = sospetto da verificare a mano (fattore invertito a basso punteggio: il nome negativo inganna l'euristica, spesso falso positivo)._

### Celle con hard-fail o flag

| Counselor | Step | Hard-fail | Flag | Inversioni errate |
|---|---|---|---|---|
| Marco | sl-selfcontrol |  | poca-connessione |  |
| Marco | sl-attribution |  | poca-connessione |  |
| Sara | cognitive |  | pochi-consigli |  |
| Sara | sl-elaboration |  | poca-connessione |  |
| Sara | sl-selfcontrol |  | poca-connessione, inversione? | screen: C3=3 (forza→debolezza) |
| Sara | sl-motivation |  | poca-connessione, inversione? | screen: A5=3 (forza→debolezza) |
| Sara | sl-emotions | ❌ | copertura, poca-connessione | ALTA: A1=8 (debolezza→forza); A7=7 (debolezza→forza) |
| Sara | sl-attribution |  | poca-connessione |  |
| Luca | cognitive |  | pochi-consigli |  |
| Luca | sl-elaboration |  | poca-connessione |  |
| Luca | sl-selfcontrol |  | poca-connessione |  |
| Luca | sl-motivation |  | poca-connessione |  |
| Luca | sl-social |  | poca-connessione |  |
| Elena | sl-elaboration |  | poca-connessione |  |
| Elena | sl-selfcontrol |  | poca-connessione |  |
| Elena | sl-motivation | ❌ | poca-connessione | ALTA: A6=3 (debolezza→forza) |
| Elena | sl-attribution |  | poca-connessione |  |
| Davide | cognitive |  | pochi-consigli |  |
| Davide | affective |  | pochi-consigli |  |
| Davide | sl-elaboration |  | poca-connessione |  |
| Davide | sl-selfcontrol |  | poca-connessione |  |
| Davide | sl-motivation |  | poca-connessione |  |
| Davide | sl-attribution |  | poca-connessione |  |
| Davide | sl-social |  | poca-connessione |  |
| Giulia | cognitive |  | pochi-consigli |  |
| Giulia | affective |  | pochi-consigli |  |
| Giulia | sl-elaboration |  | copertura, poca-connessione |  |
| Giulia | sl-selfcontrol |  | copertura, poca-connessione |  |
| Giulia | sl-motivation |  | copertura, poca-connessione |  |
| Giulia | sl-emotions |  | copertura, poca-connessione |  |
| Giulia | sl-attribution |  | copertura, poca-connessione |  |
| Giulia | sl-social |  | copertura |  |

### Regressione mirata — inversione ad alto punteggio (A1=8, A4=8, A7=7)

| Counselor | Step | Errore |
|---|---|---|
| Sara | sl-emotions | ❌ A1, A7 |

_NB: la cella Sara/sl-emotions, riprovata manualmente, ha prodotto un'analisi corretta
("ansia e interferenze emotive sono punti su cui concentrarsi") → flag = falso positivo /
varianza del modello e4b, non un bug sistemico della tabella d'inversione._

## Lettura sintetica

- **Deterministico, tutto verde**: 0/54 warning sul prompt; direttive `[FACTOR LABELS]` +
  `[INTERPRETATION TABLE]` presenti su ogni step; inversione pre-risolta corretta per ogni
  fattore; **0 reasoning-leak** e **0 refusal** su 48 celle live. Il lavoro dell'handoff
  (confinamento reasoning + tabella per-fattore) tiene.
- **Ranking modelli (proxy accuratezza)**: deepseek (Marco) 0.95 ≫ gemma4:12b 0.87 >
  ling/mistral-small ~0.84 > openrouter-deepseek 0.79 > **gemma4:e4b 0.74** (il più debole;
  unico con miss d'inversione ad alta confidenza, per quanto intermittente).
- **Pattern trasversale**: `poca-connessione` su quasi tutti i second-level (tutti i modelli)
  e `copertura` cronica su mistral-small (Giulia). `pochi-consigli` sui first-level.
- **Bug deterministico confermato live**: duplicazione del nome fattore
  (`A6 (Percezione di competenza) Percezione di competenza`). Vedi suggerimenti.
