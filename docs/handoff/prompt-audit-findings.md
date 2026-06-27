# Prompt Audit QSA — Findings e Piano Interventi

**Data**: 2026-06-27
**Branch**: `feature/prompt-audit-api`
**Test eseguiti con**: Prompt Audit API (`/admin/prompt-audit/*`) — dry-run, live, matrix

---

## 1. Contesto

### Profilo QSA usato per i test

```
C1=5  C2=6  C3=8  C4=5  C5=4  C6=9  C7=3
A1=9  A2=4  A3=5  A4=8  A5=9  A6=3  A7=9
```

**Fattori invertiti** (alto = problema): C3, C6, A1, A4, A5, A7

### Modelli testati

| Modello | Provider | Step testati |
|---|---|---|
| `qwen3.5:9b` | Ollama | cognitive IT, affective IT, sl-elaboration IT, cognitive EN |
| `gemma4:e4b` (Sara, counselor 2) | Ollama | percorso completo QSA (9 step) |

### Endpoint usati

| Endpoint | Risultato |
|---|---|
| `POST /admin/prompt-audit/dry-run` | OK — risolve prompt, counselor, knowledge, warning |
| `POST /admin/prompt-audit/live` | OK — chiama il modello, ~2-11s per risposta |
| `POST /admin/prompt-audit/matrix` | OK — 9 step × 6 counselor = 54 dry-run, nessun warning |

---

## 2. Bug nelle risposte del modello

### 2.1 Tabella riepilogativa

| # | Bug | Modello | Step | Dettaglio |
|---|---|---|---|---|
| B1 | **Label inglese** | gemma4:e4b | cognitive | Usa "Good" invece di "Adeguato" per C2 e C5 |
| B2 | **C7 non-invertito → "Forza"** | entrambi | cognitive, sl-elaboration | C7=3/9 dovrebbe essere "Area di crescita" (1-3 non-invertito), ma il modello dice "Forza" |
| B3 | **Sconfinamento fattori** | gemma4:e4b | affective | Elenca C3, C6, C4 (cognitivi!) nello step affettivo |
| B4 | **A2 omesso** | gemma4:e4b | affective | Lo step affettivo non menziona A2 (Volizione)=4 |
| B5 | **Label doppie** | gemma4:e4b | sl-* | "C1 (Strategie elaborative) Strategie elaborative" — nome duplicato |
| B6 | **Loop allucinatorio** | qwen3.5:9b | cognitive EN | Dopo C6 degenera in cascata di parole (frutta → multiverso), 11s sprecati |
| B7 | **[NO META] violato** | qwen3.5:9b | cognitive EN | Scrive "Because this is an inverted factor" esponendo regole interne |
| B8 | **Label "Normale" su non-invertito** | qwen3.5:9b | affective | A2 e A3 usano "Normale" (riservato agli invertiti) anziché "Adeguato" |
| B9 | **C5 4/9 → "Area di crescita"** | qwen3.5:9b | cognitive | C5 non-invertito, 4 rientra in 4-6=Adeguato, non Area di crescita |

### 2.2 Esempi concreti

**B2 — C7 3/9 → "Forza" (gemma4:e4b, cognitive):**
```
C7 (Autointerrogazione) 3/9 - Forza. Misura la capacità di porsi domande [...]
Questo punteggio indica una notevole tendenza a verificare costantemente il proprio livello di conoscenza.
```
Errore: C7 è NON-invertito, 1-3 = Area di crescita, non Forza.

**B3 — Sconfinamento (gemma4:e4b, affective):**
```
C3 (Disorientamento) 8/9 - Area di crescita [...]
C6 (Difficoltà di concentrazione) 9/9 - Area di crescita [...]
A1 (Ansietà di base) 9/9 - Area di crescita [...]
C4 (Disponibilità alla collaborazione) 5/9 - Adeguato [...]
```
Lo step è affective (solo A1-A7) ma parte con 3 fattori cognitivi.

**B5 — Label doppie (gemma4:e4b, sl-elaboration):**
```
C1 (Strategie elaborative) Strategie elaborative
C5 (Organizzatori semantici) Organizzatori semantici
```
Il modello scrive "C1 Strategie elaborative", poi `_annotate_qsa_factor_codes` aggiunge `(Strategie elaborative)` ma non rimuove il nome già presente.

**B6 — Loop allucinatorio (qwen3.5:9b, cognitive EN):**
```
C6 (Concentration difficulties) 9/9: Area for growth. This factor assesses how much it affects you
when outside noises or thoughts pull your focus away from what you are reading [...] 
millennium galactic civilization multiverse dimensionality consciousness awareness perception [...]
apple pear orange lemon lime grapefruit tangerine mandarin [...]
```
Dopo la descrizione di C6 il modello perde coerenza e produce una cascata di parole senza senso per migliaia di token.

---

## 3. Cause radice nei prompt

### 3.1 Prompt bilingue: conflitto di label

Il `system_prompt_final` (9161 caratteri per Sara/cognitive) è costruito così:

```
[PERSONA — ITALIANO]
"Sei Sara, una counselor empatica e accogliente..."

[PROMPT BODY dal DB configs — INGLESE]
"1) NON-inverted factors ... 1-3 = A factor to work on to improve, 4-6 = Good, 7-9 = Your strength
 2) INVERTED factors ... 1-3 = Your strength, 4-6 = Good, 7-9 = A factor to work on to improve"

[STUDENT — ITALIANO]

[KNOWLEDGE — ITALIANO]

[FACTOR LABELS + INVERTED FACTORS — ITALIANO]
"1-3 = Area di crescita, 4-6 = Adeguato, 7-9 = Forza"
```

Il modello legge DUE set di label in due lingue. Spiega:

| Bug | Causa |
|---|---|
| B1 "Good" | Il modello prende la prima occorrenza (inglese nel body) |
| B2 C7→Forza | Logica condizionale su due liste in lingue diverse: il modello 4B fatica |
| B8 "Normale" | Confusione tra set di label duplicati |

**File coinvolti**:
- DB `configs` tabella — il `prompt_factor` salvato contiene label inglesi
- `prompt_config.py:10-17` — `DEFAULT_SYSTEM_PROMPT_FACTOR` (default in inglese)
- `chat_logic.py:493-521` — `_apply_qsa_factor_directive` (appende label italiani in coda)

### 3.2 Full scores_context inviato anche per step scoped

`build_prompt_audit` (`prompt_audit.py`) e `build_context_envelope` (`chat_logic.py`) inviano SEMPRE il `model_scores_context` completo con tutti i 14 fattori, anche quando lo step ne richiede solo un sottoinsieme. La `full_message` contiene:

```
QSA Profile scores (stanine 1-9):
C1=5, C2=6, ... A7=9

DOMANDA DELLO STUDENTE:
Analyse ONLY the AFFECTIVE factors (A1-A7)
```

Il modello vede tutti i fattori e sconfina (B3).

**File coinvolti**:
- `prompt_audit.py:253-269` — `build_context_envelope` chiamata con `model_scores_context` non `message_scores_context`
- `chat_logic.py:931-943` — costruzione `full_message`

### 3.3 Logica a liste per modelli piccoli

La direttiva `[INVERTED FACTORS]` elenca due gruppi separati e chiede al modello di applicare una regola condizionale:

```
Non-invertiti: C1, C2, C4, C5, C7, A2, A3, A6  → 1-3=growth, 4-6=adequate, 7-9=strength
Invertiti:     C3, C6, A1, A4, A5, A7           → 1-3=strength, 4-6=normal, 7-9=growth
```

Un modello 4B non fa lookup accurato su liste: pattern-matcha "basso=Forza" senza verificare in quale lista si trova il fattore (B2).

### 3.4 Duplicazione nome nel post-processing

`_annotate_qsa_factor_codes` (`chat_logic.py:475-490`):
```python
annotated = re.sub(rf"\b{code}\b(?!\s*\()", f"{code} ({name})", annotated)
```
Se il modello scrive `C1 Strategie elaborative`, la regex matcha `C1` (senza parentesi dopo) e lo sostituisce con `C1 (Strategie elaborative)`. Il testo `Strategie elaborative` già presente dopo `C1` rimane, creando la duplicazione (B5).

---

## 4. Gap infrastruttura: log

### 4.1 Cosa NON viene salvato nei log

Il modello `Log` (`models.py:20-41`) ha 17 colonne. `details` (JSON) contiene:

```json
{
  "mode", "phase", "user_input", "effective_user_input", "bot_response",
  "system_prompt_key", "guided_phase_prompt_key", "provider", "model",
  "questionnaire_type", "knowledge_context_length", "usage", "cost_usd"
}
```

**MAI salvati**:
- `system_prompt_final` — il prompt completo inviato al modello
- `full_message` — il messaggio utente assemblato
- `history` — la trascrizione della conversazione
- `scores_context` — il profilo QSA dello studente
- `knowledge_context` — il testo completo della knowledge recuperata

Questi dati esistono SOLO nell'envelope (`build_log_envelope`) e vengono salvati in `details.envelope` **solo se** il config `log_full_prompt` è attivo. Attualmente l'endpoint `/admin/config/env-status` non mostra questo config → probabilmente non attivo nell'ambiente di produzione.

### 4.2 Impatto sulla diagnosi

Senza il prompt completo nei log, quando si trova un bug come B2 (C7→Forza) non si può risalire a cosa il modello ha effettivamente letto. Il prompt-audit dry-run può ricostruire l'envelope, ma gli manca `scores_context` che non è persistito.

---

## 5. Piano interventi

| # | Intervento | File target | Priorità | Risolve |
|---|---|---|---|---|
| I1 | **Allineare label nel `prompt_factor` DB**: rimuovere label inglesi ("Good", "Your strength") e usare solo quelli italiani. In alternativa, far sì che `_apply_qsa_factor_directive` sostituisca i label nel body, non solo li appenda in coda. | DB `configs` / `chat_logic.py:493` | **Alta** | B1, B8 |
| I2 | **Iniettare regola per fattore, non per lista**: nello step `cognitive`, invece di due liste separate, allegare una tabella con ogni fattore e la sua regola già esplicitata: `C3 (Disorientamento) INVERTITO: 1-3=Forza, 4-6=Normale, 7-9=Area di crescita`. Così il modello non deve fare lookup. | `chat_logic.py:493` o `prompt_audit.py:225` | **Alta** | B2, B9 |
| I3 | **Usare `scoped_scores_context` nella `full_message`**: per lo step `affective`, inviare solo `A1=9, A2=4, ... A7=9`, non l'intero profilo. Il codice già calcola `message_scores_context` via `_scope_scores_to_codes` ma non lo usa nella `full_message`. | `prompt_audit.py:253` / `chat_logic.py:861` | **Alta** | B3, B4 |
| I4 | **Forzare salvataggio envelope nei log**: rimuovere il gate `log_full_prompt` o attivarlo di default. Aggiungere `scores_context` e `knowledge_context` completi a `Log.details`. | `chat_logic.py` (log save), `models.py` (opzionale) | **Media** | Diagnostica |
| I5 | **Migliorare regex `_annotate_qsa_factor_codes`**: dopo l'annotazione, rimuovere la ripetizione del nome se appare subito dopo la parentesi (pattern: `C1 (Nome) Nome` → `C1 (Nome)`). | `chat_logic.py:475-490` | **Media** | B5 |
| I6 | **Aggiungere `max_tokens` più restrittivo per step factor**: il loop allucinatorio (B6) su qwen3.5:9b potrebbe essere contenuto con un limite di token più basso (~1024 per step cognitivi) o con `stop` sequences. | `chat_logic.py` / config | **Bassa** | B6 |

---

## 6. Note aggiuntive

### Lingua dei prompt

Tutti i system prompt (default e DB) sono in inglese. La direttiva `[LANGUAGE]` dice al modello di rispondere nella lingua target, ma il **ragionamento interno** del modello avviene in inglese. Questo crea un gap di qualità: il modello traduce concetti dall'inglese alla lingua target, perdendo sfumature. Una possibile direzione futura: tradurre i prompt nella lingua target prima dell'invio, così il modello ragiona e risponde nella stessa lingua.

### Factor coverage check (falso positivo)

Il check `factor_coverage` nell'audit API (`prompt_audit.py:362`) confronta i fattori presenti nella risposta con TUTTI i codici nello `scoped_scores_context`. Per lo step `cognitive`, lo `scoped_scores_context` contiene ancora A1-A7 (perché `_scope_scores_to_codes` non li filtra se la fase non ha `required_codes` nel DB). Questo produce un falso positivo: il check segnala A1-A7 come "missing" quando lo step è solo cognitivo.

### Matrix

La matrix (`/admin/prompt-audit/matrix`) funziona correttamente: 9 step × 6 counselor = 54 dry-run, nessun warning. I counselor attivi al momento del test:

| ID | Nome | Provider | Model |
|---|---|---|---|
| 1 | ? | deepseek | deepseek-v4-flash |
| 2 | Sara | ollama | gemma4:e4b |
| 3 | ? | ollama | gemma4:12b |
| 4 | ? | openrouter | deepseek/deepseek-v4-flash |
| 5 | ? | openrouter | inclusionai/ling-2.6-flash |
| 6 | ? | openrouter | mistralai/mistral-small-24b-instruct-2501 |
