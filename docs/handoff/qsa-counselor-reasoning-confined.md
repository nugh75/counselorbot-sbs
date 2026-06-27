# QSA Counselor — Confinamento del reasoning + log dei test

**Data**: 2026-06-27
**Branch**: `feature/qsa-reasoning-confined` (mergiato in `main`)
**Test eseguiti con**: Prompt Audit API (`/admin/prompt-audit/live`) su counselor reali, modello come "counselor"
**Continuazione di**: [`prompt-audit-findings.md`](./prompt-audit-findings.md)

---

## 1. Contesto e obiettivo

Sessione di test del **flusso QSA** usando l'API prompt-audit `/live` con i counselor reali
(modello LLM = counselor). Obiettivo emerso strada facendo:

1. Mantenere il "pensiero" del modello come elemento **didattico** ("come ragiona l'LLM")
   ma **confinarlo** in un canale «sto pensando», fuori dalla risposta allo studente.
2. Rendere i **run di test visibili nei log** dell'applicazione.

### Profilo QSA usato (italiano)

```
C1=7  C2=5  C3=3  C4=6  C5=4  C6=7  C7=5
A1=8  A2=6  A3=5  A4=8  A5=3  A6=3  A7=7
```
Fattori invertiti (alto = area di crescita): C3, C6, A1, A4, A5, A7.

### Counselor / modelli testati

| ID | Counselor | Provider | Model | Note |
|---|---|---|---|---|
| 2 | **Sara** | ollama | `gemma4:e4b` | counselor Gemma principale del test |
| 3 | **Luca** | ollama | `gemma4:12b` | Gemma grande |
| 1 | **Marco** | deepseek | `deepseek-v4-flash` | cloud, famiglia diversa (controllo cross-modello) |

### Endpoint

| Endpoint | Uso |
|---|---|
| `POST /admin/prompt-audit/dry-run` | verifica envelope/counselor senza chiamare il modello |
| `POST /admin/prompt-audit/live` | esecuzione reale del modello (counselor), ora **loggata** |

Auth: header `X-Prompt-Audit-Token` (config `PROMPT_AUDIT_API_TOKEN`).
Backend live in Docker: host `127.0.0.1:8088` → container `:8000`. Ollama via `host.docker.internal:11434`.

---

## 2. Cosa è stato implementato

Quattro commit sul branch:

| Commit | Tipo | Sintesi |
|---|---|---|
| `f3cf9b7` | feat(reasoning) | Gemma 4 classificato come reasoning (Ollama `think:true`) con answer headroom ampio |
| `0c6dbc9` | feat(qsa) | Confinamento del reasoning nel canale «sto pensando» (direttiva + split + cattura + check) |
| `3d95cda` | fix(reasoning) | Profilo dedicato per `gemma4:12b` (headroom maggiore) |
| `bc0d68d` | feat(prompt-audit) | Persistenza dei run `/live` nei log dell'app (action `prompt_audit_live`) |

### 2.1 Confinamento del «sto pensando» (punto 4 + helper)
- `chat_logic._apply_thinking_directive`: direttiva `[THINKING]` — tutto il ragionamento in **un solo blocco
  `<think>…</think>`** all'inizio, conciso; nel visibile niente meta-commento ("Attivazione interna", piani, "Devo…").
  Applicata in `routes/chat.py` (`/chat` e `/chat/stream`) e in `prompt_audit.py`.
- `chat_logic.split_thinking` (non-stream) e `chat_logic.ThinkStreamSplitter` (streaming, robusto ai tag spezzati
  tra chunk): estraggono i blocchi `<think>` e ripuliscono il testo visibile (fallback model-agnostico).

### 2.2 Cattura del reasoning in `ai_service`
- `_call_ollama` / `_stream_ollama`: catturano il campo **nativo** `message.thinking` (Ollama) in `self.last_thinking`
  e, in fallback, estraggono i tag `<think>` inlineati. Guard: per le chiamate **JSON** (parser QSA `gemma4:e2b`)
  si forza `think:false` (nessun reasoning, output strutturato intatto).
- `/chat/stream` instrada il reasoning su un evento SSE `reasoning` separato (già esistente) → riquadro «sto pensando».

### 2.3 Profili di reasoning (`reasoning_profiles.py`)
- `gemma-?4.*12b` → reasoning, budget 2000 + **headroom 4000** (totale 6000).
- `gemma-?4` (e4b/e2b) → reasoning, budget 1500 + **headroom 2000** (totale 3500).
- Motivo headroom ampio: **Ollama non separa i token thinking/risposta** (un solo `num_predict`); il pensiero
  nativo di Gemma è verboso, quindi serve spazio garantito per la risposta visibile.

### 2.4 Audit `/live`: reasoning separato + check + log
- `run_prompt_audit_live` ora ritorna `reasoning` separato, `response_visible` ripulito, e un nuovo check
  **`reasoning_leak`** (regex su marcatori tipo "Attivazione interna", "Ho i punteggi", `<think`).
- Scrive una riga `Log` (action **`prompt_audit_live`**) ricalcando il logging di `/chat`: provider, model,
  questionnaire_type, phase, mode, cost, identità; `details` con risposta visibile, reasoning, checks, warnings,
  usage, durata; envelope completo redatto se `log_full_prompt` è attivo. Best-effort (non rompe l'audit).
  → **risolve parzialmente il gap log §4 di `prompt-audit-findings.md`** per il percorso audit.

---

## 3. Test eseguiti

### 3.1 Unit (container usa-e-getta, immagine ricostruita)
- `backend/tests/test_thinking_directive_split.py` — **8/8** (direttiva, `split_thinking`, `ThinkStreamSplitter`
  incl. tag spezzati char-by-char).
- `backend/tests/test_qsa_factor_directive.py` — **6/6** (sanity, invariato).
- `reasoning_profiles` (assert inline): gemma3 non-reasoning; gemma4:e4b→3500; gemma4:12b→6000; qwen invariato.
- `test_smoke.py::test_reasoning_resolve_plan` aggiornato (gemma4 reasoning); **pytest non è nell'immagine** →
  eseguito via runner `__main__` + script inline.

### 3.2 Flusso QSA live single-counselor (Sara / gemma4:e4b)
Step `intro, cognitive, affective, sl-motivation, sl-attribution`: reasoning confinato nel canale, visibile pulito,
`reasoning_leak=True`, interpretazioni e inversioni corrette. Ripetuto 3× su `sl-attribution`: nessuna risposta vuota
dopo il fix dell'headroom.

### 3.3 Prova in parallelo (3 counselor, stesso profilo, italiano)
6 chiamate `/live` concorrenti (ThreadPool), step `cognitive` + `affective`:

| Counselor | Modello | cognitive | affective |
|---|---|---|---|
| Sara | gemma4:e4b | OK | OK |
| Luca | gemma4:12b | OK | OK (dopo fix headroom 12b) |
| Marco | deepseek-v4-flash | OK | OK |

Wall-clock ~65 s. Confinamento + `reasoning_leak` verdi ovunque, cross-modello.

### 3.4 Verifica logging
Chiamata `/live` (Sara, QSA/cognitive, `session_id=prova-log-001`) → riga `logs` `id 11039`:
`action=prompt_audit_live, provider=ollama, model=gemma4:e4b, qtype=QSA, phase=cognitive, mode=factor,
username=prompt-audit-token`; `details` con `source`, `duration_ms`, `checks.reasoning_leak={ok:true}`,
`envelope` presente, `reasoning` presente.

---

## 4. Problematiche emerse

| # | Problema | Causa | Stato |
|---|---|---|---|
| P1 | **Fuga di reasoning** nel visibile ("Attivazione interna…") su `sl-attribution` | Il preset di Sara aveva `disable_thinking=false` che sovrascrive la config globale; per Ollama il pensiero veniva inlineato nel `content` senza canale dedicato | **Risolto**: direttiva + canale nativo + split + check `reasoning_leak` |
| P2 | **Risposte vuote** quando il thinking nativo consuma tutto il budget di output | Ollama usa un **unico `num_predict`** per thinking + risposta; un pensiero lungo lascia 0 token alla risposta | **Mitigato** (headroom e4b=3500, 12b=6000). **Non eliminabile al 100%** sui modelli piccoli: osservato 1 caso vuoto su e4b con `max_tokens=500` |
| P3 | **Thinking verboso** nonostante la direttiva "poche righe" | Ollama non può **cappare** la lunghezza del thinking nativo; la direttiva è solo un nudge | Aperto. Conciseness reale solo sui provider con reasoning budget dedicato (gemini/anthropic/openrouter) |
| P4 | **Serializzazione in parallelo** dei modelli Ollama locali | Stesso host Ollama → e4b e 12b si serializzano (wall-clock 65–86 s) | Per natura. I modelli cloud (deepseek) non contendono |
| P5 | I check dell'audit non rilevavano la fuga di reasoning | Mancava un controllo dedicato | **Risolto**: aggiunto check `reasoning_leak` |
| P6 | Duplicazione nome fattore ("A1 (Ansietà di base) Ansietà di base") | `_annotate_qsa_factor_codes` (vedi B5 in `prompt-audit-findings.md`) | Cosmetico, non affrontato in questa sessione |

---

## 5. Limiti noti e raccomandazioni

- **P2 (vuoti intermittenti)**: su modelli piccoli locali con thinking attivo il rischio resta. Opzioni:
  alzare ulteriormente l'headroom, prevedere un retry/fallback su risposta vuota, oppure usare
  `disable_thinking=true` nel preset dove il "sto pensando" didattico non serve.
- **Parser QSA (`gemma4:e2b`)**: ora classificato reasoning ma protetto dal guard JSON (`think:false` quando
  `format=json`). Verificare che l'estrazione QSA non regredisca.
- **Ambito direttiva**: applicata solo a chat counselor + prompt-audit; **esclusi di proposito** `routes/opencode.py`
  e `routes/site_chat.py`.
- **Immagine baked**: nessun mount del sorgente → ogni modifica al codice richiede `docker compose build backend`
  e redeploy. `pytest` non è nell'immagine (usati runner `__main__` + script inline).
- **Frontend log viewer**: l'action `prompt_audit_live` compare automaticamente nella tendina filtri
  (`/admin/logs/options` è dinamico) e in `/admin/logs?action=prompt_audit_live`.

---

## 6. Come riprodurre i test

```bash
# Backend live: docker compose (host 127.0.0.1:8088 -> :8000)
# Token in .env: PROMPT_AUDIT_API_TOKEN

# Esempio singola chiamata /live (Sara = gemma4:e4b, step cognitive)
curl -s http://localhost:8088/admin/prompt-audit/live \
  -H "Content-Type: application/json" \
  -H "X-Prompt-Audit-Token: $PROMPT_AUDIT_API_TOKEN" \
  -d '{"questionnaire_type":"QSA","language":"it","phase":"cognitive","mode":"factor",
       "use_phase_prompt":true,"counselor_id":2,"include_knowledge":false,"max_tokens":700,
       "scores_context":"Punteggi QSA (scala 1-9):\n- C1: 7/9\n- C2: 5/9\n- C6: 7/9"}'

# Unit (container usa-e-getta con immagine aggiornata)
docker compose build backend
docker compose run --rm --no-deps -T backend python -m backend.tests.test_thinking_directive_split

# Log scritti
docker compose exec -T postgres psql -U counselorbot_user -d counselorbot \
  -c "SELECT id,action,provider,model_name,phase,mode FROM logs WHERE action='prompt_audit_live' ORDER BY id DESC LIMIT 5;"
```

---

## 7. File toccati

- `backend/reasoning_profiles.py` — profili reasoning gemma4 (e4b/12b).
- `backend/chat_logic.py` — `_apply_thinking_directive`, `split_thinking`, `ThinkStreamSplitter`.
- `backend/ai_service.py` — `last_thinking`, cattura nativa + fallback tag, guard JSON.
- `backend/routes/chat.py` — applicazione direttiva su `/chat` e `/chat/stream`.
- `backend/prompt_audit.py` — reasoning separato, check `reasoning_leak`, logging `prompt_audit_live`.
- `backend/routes/prompt_audit.py` — passa l'identità al logging.
- `backend/tests/test_smoke.py` — assert reasoning-plan aggiornati.
- `backend/tests/test_thinking_directive_split.py` — nuovo test puro.
