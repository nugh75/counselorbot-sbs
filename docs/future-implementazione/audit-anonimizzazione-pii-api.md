# Audit anonimizzazione dati studente prima delle API cloud

> **Stato:** proposta / audit — nessuna modifica al codice applicata.
> **Data:** 2026-06-08
> **Ambito:** flusso dati PII verso provider LLM cloud, con attenzione alla
> internazionalizzazione in corso (più lingue oltre l'italiano).
> **Decisione richiesta:** se/come inserire un layer di de-identificazione tra
> la richiesta di chat e la chiamata al provider, e con quale modello.

---

## 1. Sintesi esecutiva

- L'architettura di **identità è già buona**: la chat usa un `session_id` (UUID),
  lo **username (`Remote-User`) non raggiunge mai il modello**. Il rischio PII
  residuo è il **testo libero che lo studente digita** (nome, scuola, città,
  persone), soprattutto in questionari narrativi tipo **Savickas**.
- Inserire un layer di anonimizzazione ha senso **solo per i provider cloud**
  (openai/anthropic/gemini/mistral/openrouter). Per i provider **locali**
  (ollama/llamacpp) è inutile: il dato resta in casa.
- Il layer redattore **deve girare in locale** (hardware disponibile: RTX 5090
  32 GB, 125 GB RAM, Ollama attivo), altrimenti si sposta solo il leak su un'altra
  API.
- **Buco principale, indipendente dalle API**: la tabella `logs` salva in chiaro
  `user_input` + `bot_response` di **ogni** turno, e la memoria di sessione su
  disco conserva frammenti del testo utente. Questi vivono nel sistema **anche se**
  si anonimizza verso il cloud. Vanno affrontati a parte (§7).
- **Internazionalizzazione**: un modello PII mono-lingua copre bene una sola
  lingua. La lingua è **già nota per richiesta** (`request.language`) → si può
  **instradare al detector giusto per lingua**. Questo è il cardine del design
  multilingue (§5).

---

## 2. Modello di identità attuale (la parte già corretta)

| Aspetto | Stato | Riferimento |
|---|---|---|
| Identità chat | `session_id` UUID, **nessun nome** nel payload modello | `routes/chat.py:154`, `:297` |
| Username | Da header `Remote-User` (ai4auth), **mai inviato al modello** | `auth.py:54-66` |
| Dove vive lo username | Solo `QuestionnaireResult.username`, `ValidationResponse.username`, `SurveyResponse` | `models.py:106`, `:127`; `routes/survey.py:87-143` |
| Collegamento nome ↔ profilo | Esiste **solo localmente** in DB (non esce verso API) | — |

**Conseguenza:** verso le API cloud non parte alcun identificativo diretto. Il
problema è la PII **auto-dichiarata** dallo studente nel testo libero.

---

## 3. Mappa delle superfici dati PII

Legenda rischio: 🔴 alto · 🟠 medio · 🟢 basso. "→API" = il dato raggiunge un
provider cloud.

| # | Superficie | Cosa contiene | Persistenza | →API | Rischio | Riferimento |
|---|---|---|---|---|---|---|
| 1 | **Payload chat** (messaggio + `scores_context` + `conversation_summary`) | Testo libero studente, punteggi, riassunto | Transitorio | **Sì** | 🔴 | `ai_service.py:149`, `:387`; `routes/chat.py:209` |
| 2 | **Tabella `logs`** (`details.user_input`, `effective_user_input`, `bot_response`) | Testo integrale di **ogni** turno, in chiaro | **Permanente (DB)** | No | 🔴 | `models.py:20-28`; `routes/chat.py:250-266`, `:371-388` |
| 3 | **Memoria di sessione su disco** (`SESSION_MEMORY_DIR/*.md`) | `episodes` (fino a 16 msg utente, 300 char), fatti/obiettivi/preferenze estratti, punteggi | TTL 7200 s poi rimossa | No | 🟠 | `memory_service.py:18-28`, `:204-217` |
| 4 | **`QuestionnaireResult`** | `username` ↔ `scores` (profilo psicometrico) | Permanente | No | 🟠 | `models.py:97-107` |
| 5 | **`ValidationResponse`** + export CSV | `username` + risposte item-per-item | Permanente | No | 🟠 | `models.py:110-129`; `validation_export.py:96-127` |
| 6 | **Export dataset SFT** (`training_examples`) | `scores_context` + `student_message` + `assistant_answer` | Permanente; **esce se si fa fine-tuning cloud** | Possibile | 🟠 | `models.py:132-151`; `training_dataset.py` |
| 7 | **`SharedChatResponse`** (candidati da chat) | `bot_response` (può riecheggiare contenuto studente) | Permanente | No | 🟢 | `models.py:82-94`; `routes/chat.py:268` |
| 8 | **Site-chat (RAG)** | Domanda utente + contesto documentale; logga `user_input` e memoria | Permanente (DB) + TTL disco | **Sì** | 🟢 | `routes/site_chat.py:162-225` |

**Note di accuratezza:**

- L'export SFT attuale (`training_dataset.py`) genera testo **sintetico da
  template** per locale (`_student_message`, `_assistant_answer`), quindi a oggi
  è a basso contenuto di PII reale. Il rischio sale se la tabella
  `training_examples` viene popolata con **candidati reali revisionati** (campo
  `source ≠ synthetic-template-v1`). Da gestire al momento dell'attivazione del
  fine-tuning su contenuti reali.
- La site-chat invia al modello la domanda dell'utente: PII possibile ma meno
  probabile (Q&A generico sul sito), comunque **sul percorso cloud** e **loggata**.

---

## 4. Dettaglio: cosa esce verso le API cloud

Nel dispatch verso un provider cloud (`ai_service.get_response` / `stream_response`)
il messaggio utente è già composto da:

```
CONTESTO DELLE CONVERSAZIONI PRECEDENTI:
<conversation_summary>          # memoria sessione + strategie + risposte apprese
---
<scores_context>                # punteggi (sensibili, non identificativi)
DOMANDA DELLO STUDENTE:
<messaggio studente>            # ← testo libero: principale fonte PII
```

- `system_prompt`: istruzioni + label fattori → **nessuna PII**.
- `scores_context`: dato **sensibile** (profilazione psicologica di minori, GDPR
  categoria particolare) ma **non identificativo**; già de-identificato by design.
  Il riassunto rotante esclude inoltre i punteggi grezzi (`SUMMARY_SYSTEM_PROMPT`,
  `ai_service.py:22`).
- `messaggio studente` + `conversation_summary`: unica via per cui può uscire
  PII auto-dichiarata.

**Punto di intervento naturale:** un'unica funzione di de-identificazione
**prima del dispatch**, perché lì `user_message` contiene già tutto (summary +
messaggio). Va però fornita la **lingua** alla funzione: oggi `get_response` non
riceve `request.language` (presente solo in `routes/chat.py`). Due opzioni:
(a) passare `language` a `get_response`/`stream_response`; (b) anonimizzare in
`routes/chat.py` prima di chiamare il service. L'opzione (a) centralizza e copre
anche la site-chat.

---

## 5. Dimensione internazionalizzazione (requisito centrale)

Lingue di risposta AI attualmente supportate (`chat_logic.py:104`,
`SUPPORTED_AI_LANGUAGES`):

```
it · en · es · fr · de · sv
```

L'internazionalizzazione in corso amplia questo insieme. Implicazioni dirette
sulla scelta del detector PII:

### 5.1 Problema

Un detector **mono-lingua** (es. `Italian_NER_XXL_v2`, oppure `openai/privacy-filter`
che è *English-primary*) riconosce bene la PII **solo nella sua lingua**. Aggiungere
lingue significa o accettare buchi di recall, o cambiare strategia.

### 5.2 Tre strategie multilingue

| Strategia | Come | Pro | Contro |
|---|---|---|---|
| **A. Routing per lingua** | `request.language` → seleziona il modello PII migliore per quella lingua | Massima qualità per lingua; modulare | N modelli da gestire/caricare; serve un modello buono per ogni lingua |
| **B. Un modello multilingue** | Un solo modello NER multi-lingua | Semplice, un caricamento | Recall inferiore al best-of-breed per-lingua; copertura lingue limitata |
| **C. LLM redattore locale** | Modello generativo locale, prompt language-agnostic | Copre **qualsiasi** lingua, anche narrativa | +1–3 s/turno, non deterministico, può mancare/allucinare |

La **lingua è già instradata per richiesta** → la strategia **A (routing)** è
naturale e a costo architetturale basso. Un default su un multilingue (B) copre
le lingue non ancora mappate; l'LLM (C) resta come rete di sicurezza per il
batch o per lingue prive di buon NER.

### 5.3 Copertura modelli per lingua (NER)

| Modello | it | en | es | fr | de | sv | Note |
|---|:--:|:--:|:--:|:--:|:--:|:--:|---|
| `DeepMount00/Italian_NER_XXL_v2` (BERT, 0.1B) | ✅ | ◑ | — | — | — | — | 52 tag, GDPR-oriented; **drop-in** stesso pattern di privacy-filter |
| `DeepMount00/GLiNER_PII_ITA` (GLiNER, zero-shot) | ✅ | — | — | — | — | — | label scelte a runtime (es. "scuola", "persona modello") |
| `urchade/gliner_multi_pii-v1` (GLiNER) | ✅ | ✅ | ✅ | ✅ | ✅ | — | **multilingue ufficiale**; manca solo sv |
| `openai/privacy-filter` (token-class, 1.5B/50M attivi) | ◑ | ✅ | ◑ | ◑ | ◑ | — | *English-primary*; 8 categorie fisse |
| `osiria/bert-italian-cased-ner` | ✅ | — | — | — | — | — | base PER/LOC/ORG/MISC, fallback |

Legenda: ✅ supporto dichiarato · ◑ parziale/non garantito · — non coperto.

**Lettura per la i18n:** nessun singolo NER copre l'intero set inclusa **sv**.
`gliner_multi_pii-v1` copre 5/6. Lo svedese (e ogni lingua futura senza NER
dedicato) ricade sulla strategia **C (LLM locale)** o su un modello dedicato da
aggiungere via routing.

### 5.4 Debito i18n già presente (non è leak, ma rilevante)

`memory_service._extract_user_memory` usa **regex solo italiane**
(`voglio|vorrei|devo|ho difficolt|…`, `memory_service.py:308-328`): per le altre
lingue non estrae fatti/obiettivi/preferenze. Da generalizzare in parallelo
all'internazionalizzazione (impatta qualità memoria, non la privacy).

---

## 6. Approcci tecnici al detector

### 6.1 NER deterministico (Presidio / GLiNER / token-classifier)

- Veloce (decine di ms), deterministico, economico, GDPR-oriented.
- Output = **span** → si applica mascheramento o **pseudonimizzazione reversibile**
  (vault per-sessione) a valle, o si passano gli span all'anonymizer di **Presidio**.
- `openai/privacy-filter` e `Italian_NER_XXL_v2` sono **token-classifier**
  (caricati con `transformers`, pattern `pipeline("token-classification")`),
  **non** modelli Ollama; aggiungono `torch`+`transformers` (~2–3 GB) alle
  dipendenze (oggi `requirements.txt` è minimale, senza torch).
- I modelli GLiNER si caricano con la libreria `gliner` e supportano **label
  zero-shot** scelte a runtime (utile per entità di dominio: "scuola",
  "città natale", "persona modello di ruolo" in Savickas).

### 6.2 LLM redattore locale (l'ipotesi iniziale)

- Usa l'infrastruttura locale esistente (Ollama / llama.cpp).
- Pro: language-agnostic, gestisce bene la **narrativa** (Savickas).
- Contro: latenza +1–3 s a ogni turno (pesante in streaming), non deterministico.
- Collocazione ideale: **batch** (export dataset / fine-tuning), non il turno
  real-time.

### 6.3 Reversibile vs irreversibile

| Modalità | Comportamento | Costo |
|---|---|---|
| **Irreversibile** (`[NOME]`, `[LUOGO]`) | Il modello non vede mai il dato vero | Minimo; risposte possono risultare impersonali |
| **Reversibile** (pseudonimo coerente + vault sessione) | Si rimappa il dato nella risposta | Gestione vault + buffering stream |

Per lo streaming, il **buffering progressivo** esiste già come pattern in
codebase: `_annotate_qsa_factor_codes(..., progressive=True)`
(`chat_logic.py:271-286`) fa esattamente replace incrementale sui delta. Stesso
meccanismo riusabile per il de-anonimizzato in uscita.

---

## 7. Rischi residui e debito (indipendenti dal layer API)

> Questi **non** si risolvono anonimizzando verso il cloud: il dato resta nel
> sistema.

1. 🔴 **`logs.details` in chiaro** — testo integrale di ogni turno (`user_input`,
   `bot_response`) persistito in Postgres senza scadenza
   (`routes/chat.py:250-266`, `:371-388`; `routes/site_chat.py:198-221`).
   Mitigazioni: redazione/pseudonimizzazione anche sul log, retention/TTL,
   minimizzazione dei campi salvati.
2. 🟠 **Memoria di sessione su disco** — frammenti del testo utente in
   `SESSION_MEMORY_DIR` (TTL 2 h, già con cleanup `memory_service.py:121-134`).
   Verificare permessi/cifratura del volume.
3. 🟠 **`QuestionnaireResult` / `ValidationResponse`** — collegano `username` a
   profilo/risposte psicometriche. Valutare separazione (pseudo-ID) e base
   giuridica GDPR (dati psicologici, spesso minori).
4. 🟠 **Export SFT con contenuti reali** — se si abbandona il template sintetico,
   scrubbare `student_message`/`assistant_answer` prima dell'export/fine-tuning.

---

## 8. Raccomandazione

Per fase d'uso:

1. **Chat real-time → provider cloud:** pseudonimizzazione **reversibile,
   in-process, locale**, gated su provider cloud, con **routing per lingua**
   (`request.language`):
   - it → `Italian_NER_XXL_v2` o `GLiNER_PII_ITA`;
   - en/es/fr/de → `gliner_multi_pii-v1`;
   - sv e lingue future senza NER → fallback LLM locale.
   Inserire nel dispatch di `ai_service`, riusando il pattern progressive-replace
   per lo stream.
2. **Provider locali (ollama/llamacpp):** **nessuna** anonimizzazione.
3. **Export dataset / fine-tuning su contenuti reali:** pass **LLM locale** in
   batch (latenza irrilevante, copre ogni lingua).
4. **Log e storage (§7):** affrontare separatamente — è il rischio maggiore e
   prescinde dalle API.

**Deployment dipendenze:** per non gonfiare l'immagine backend con `torch`,
valutare un **microservizio sidecar `/redact`** (torch isolato) anziché caricare
i modelli nel processo principale (codice baked nell'immagine, cfr. CLAUDE.md).

**Nota GDPR:** la pseudonimizzazione non equivale all'anonimizzazione legale, ma
riduce sensibilmente il rischio su dati psicometrici di minori.

---

## 9. Prossimo passo proposto: benchmark

Prima di scegliere il modello, **misurare la recall sul testo reale** (registro
conversazionale Savickas/QSA, non documenti legali su cui i NER sono addestrati):

1. Raccogliere 10–20 frasi reali **per lingua** (it prioritario), con nomi
   propri, scuole, città.
2. Confronto a parità di input: `privacy-filter` · `Italian_NER_XXL_v2` ·
   `GLiNER_PII_ITA` · `gliner_multi_pii-v1`.
3. Metrica chiave: **recall sui nomi propri/luoghi** (un nome mancato = leak).
4. Esito: tabella vince-chi-non-perde-nomi, per lingua → definisce la mappa di
   routing §8.

Script di benchmark standalone (non tocca il backend) producibile su richiesta.

---

## Appendice A — Riferimenti nel codice

| Tema | File:linea |
|---|---|
| Dispatch provider (punto inserimento) | `backend/ai_service.py:149`, `:387`, `:66` |
| Composizione payload chat | `backend/routes/chat.py:209-216`, `:340-352` |
| Logging turno (PII in chiaro) | `backend/routes/chat.py:250-266`, `:371-388` |
| Identità / username | `backend/auth.py:54-66` |
| Username ↔ profilo | `backend/routes/survey.py:87-143`; `backend/models.py:97-129` |
| Memoria sessione su disco | `backend/memory_service.py:18-28`, `:204-217`, `:308-328` |
| Lingue supportate (i18n) | `backend/chat_logic.py:104` |
| Pattern progressive-replace (stream) | `backend/chat_logic.py:271-286` |
| Riassunto senza punteggi grezzi | `backend/ai_service.py:22-31` |
| Export validazione (username) | `backend/validation_export.py:96-127` |
| Export SFT (template sintetico) | `backend/training_dataset.py` |

## Appendice B — Modelli e fonti

- [openai/privacy-filter](https://huggingface.co/openai/privacy-filter) — token-classifier 1.5B/50M attivi, EN-primary, Apache 2.0.
- [DeepMount00/Italian_NER_XXL_v2](https://huggingface.co/DeepMount00/Italian_NER_XXL_v2) — BERT 0.1B, IT, 52 tag, Apache 2.0.
- [DeepMount00/GLiNER_PII_ITA](https://huggingface.co/DeepMount00/GLiNER_PII_ITA) — GLiNER zero-shot, IT, Apache 2.0.
- [urchade/gliner_multi_pii-v1](https://huggingface.co/urchade/gliner_multi_pii-v1) — GLiNER multilingue (it/en/es/fr/de/pt).
- [osiria/bert-italian-cased-ner](https://huggingface.co/osiria/bert-italian-cased-ner) — NER IT base.
- [Microsoft Presidio — GLiNER recognizer](https://microsoft.github.io/presidio/samples/python/gliner/) e [PII masking con LiteLLM](https://docs.litellm.ai/docs/tutorials/presidio_pii_masking).
- [GLiNER (repo)](https://github.com/urchade/GLiNER).
