# Audit: quanti prompt di sistema arrivano a ogni turno (caso QSA)

Data: 2026-10-05 · Ambito: sola lettura, nessuna modifica al codice di produzione
Ramo: `docs/audit-qsa-prompt-rounds` · Caso di studio: percorso guidato QSA (10 step)

## Domanda

«Molti prompt vengono dati a ogni turno. Sarebbe il caso di darli solo all'inizio?»

## Risposta in una riga

No, non letteralmente — ogni turno è una chiamata stateless al provider, quindi il
prompt di sistema deve essere rispedito. Ma la misura mostra che **il 96% di quel
prompt non cambia mai dentro uno step** e che **nessun provider è configurato per
riusarlo**: è la leva vera, non il numero di blocchi.

## Come è stata misurato

Nessuna chiamata LLM, nessuna scrittura. Due strumenti:

1. **Strumento di progetto (riproducibile da chiunque)** — `POST /admin/prompt-audit/dry-run`
   restituisce l'envelope esatto (`system_prompt_final`, `full_message`, `history`) per
   un qualsiasi `(strumento, step, lingua, mode)` senza toccare il database.
   Due dry-run con lo stesso step, uno `use_phase_prompt=true` e uno `false`, mostrano
   la differenza; due dry-run con step diversi mostrano quanto resta comune.
2. **Impalcatura offline di sola lettura** (SQLite, `prepare_chat_turn`, nessuna
   rete) che ha riprodotto una sessione QSA completa — ingresso step + 2 o 3 follow-up
   per step, transcript registrato come fa `/chat` — e ha confrontato i prompt di
   sistema turno per turno byte per byte. Script in `/tmp/qsa_prompt_audit/`
   (`measure.py`, `decompose.py`, `session.py`, `session4.py`, `dupes.py`).
   Non committato: è uno strumento di misura, non un test. Se serve, si può portare
   in `backend/tests/` come test di regressione.

## Cosa contiene oggi il prompt di sistema QSA

Media su 20 turni (10 step × {ingresso, follow-up}), caratteri:

| Blocco | char/turno | quante varianti | quando cambia |
|---|---:|---:|---|
| Sezione di step QSA + direttive fattore + `[SESSION NOTES]` | 4.649 | 10 | al cambio step |
| Fascio direttive globali (`LANGUAGE`, `REGISTER`, `THINKING`, `AFFIRMATIVE`, `CONTEXT`, `PLATFORM CAPABILITIES`, risposta) | 3.199 | 1 | **mai** nella sessione |
| `[META SYSTEM PROMPT]` (teoria Pellerey) | 1.349 | 10 | al cambio step |
| `[TURN CONTRACT]` | 1.320 | 10 | al cambio step |
| `[GUIDED PATH]` (solo posizione) | 725 | 10 | al cambio step |
| `[VISIBLE RESPONSE FORMAT]` | 402 | 1 | mai |
| Prompt di step | 319 | 11 | solo al turno di ingresso |
| `[STUDENT]` | 69 | 10 | al cambio step |
| **Totale** | **~12.149** | 20 | — |

Verifiche negative fatte along the way, tutte superate:

- **zero duplicazioni interne**: nessuna frase >45 caratteri ripetuta dentro il prompt
  di sistema, verificato su **tutti i 20 turni** (10 step × {ingresso, follow-up}):
  0 ripetizioni in 242.992 caratteri.
- **nessun prompt di step duplicato** nel messaggio utente per QSA (la duplicazione
  esiste solo per QPCS/IDEA, ed è voluta e commentata).
- **il catalogo strumenti completo è già condizionato**: `[PLATFORM CAPABILITIES]`
  pieno solo ai turni che possono parlarne (intro, fuori percorso, domanda esplicita).
- **il percorso guidato è già ridotto**: `_guided_path_context(full=False)` manda solo
  la posizione (663 char) invece dell'elenco completo (1.202 char). È il precedente
  giusto già applicato in codebase: *si manda tutto solo quando serve*.

## Cosa cambia davvero a ogni turno

Sessione QSA simulata, 30 turni (ingresso + 2 follow-up per step), con transcript
registrato come in produzione:

| Metrica | Valore |
|---|---:|
| Token di input totali | 150.964 |
| di cui **prompt di sistema** | 123.648 (**82%**) |
| di cui history | 26.076 (17%) |
| Token di sistema per turno (media) | 4.121 |
| Caratteri di prompt di sistema inviati | 369.585 |
| Caratteri **identici al turno precedente** | 121.121 (**33%**) |
| Stessa misura con 3 follow-up per step (40 turni) | **49%** |

Il 33%/49% è il **minimo** misurabile: basta un follow-up in più e la porzione
ridondante cresce, perché dentro uno step il prompt di sistema è identico al 100%.
Con 5 follow-up per step la quota ridondante supera il 60%.

Costo indicativo con la tabella prezzi di `backend/model_pricing.py`: 124k token di
input per sessione QSA valgono ~0,03 USD su deepinfra/llama-3.3-70b (0,23 $/M) e
~0,11 USD su cerebras/llama-3.3-70b (0,85 $/M). Il risparmio è proporzionale al numero
di studenti.

## Perché «solo all'inizio» non è possibile

Tutti i provider usati (`backend/ai_service.py`: openai, anthropic, gemini, mistral,
openrouter, ollama, llamacpp) sono chiamati come Chat Completions stateless:
`messages = [{"role": "system", ...}] + history + user`, senza alcuna primitiva di
sessione lato server. Il prompt di sistema non può essere "depositato" al primo turno:
o lo rispedi identico ogni volta, oppure lo infili nella history, dove verrebbe
potato da `MAX_TRANSCRIPT_TURNS = 12` / `MAX_TRANSCRIPT_CHARS = 6000`
(`backend/memory_service.py`) e dove non è più un'istruzione affidabile.

Esistono invece due leve vere, entrambe a costo di input zero dal punto di vista del
modello:

1. **Prompt caching esplicito** (`cache_control` Anthropic; le cache di prefisso
   automatiche di OpenAI/Gemini richiedono invece un prefisso stabile in testa).
   **Oggi non esiste in tutto il backend**: `grep -rnE "cache_control|prompt_cach|
   cached_tokens|cache_read|cache_creation" backend/ --include=*.py` → zero riscontri.
2. **Riordino del prompt di sistema** con l'invariante in testa. Oggi l'ordine è
   `[prompt di step][persona][sezione di step + direttive globali][META][STUDENT]…`, e
   `build_context_envelope` mette la sezione di step davanti a tutto. Misurato: al
   cambio di step il **prefisso comune col turno precedente è 0%**, quindi non esiste
   alcun prefisso stabile e le cache automatiche non possono colpire nulla. Spostando
   in testa il fascio invariante (3.199 char ≈ 1.023 token con l'estimatore di
   progetto, sopra la soglia di 1.024 token richiesta da OpenAI) si crea un prefisso
   stabile **per tutta la sessione**.

## Cosa NON ho fatto e perché

- **Nessuna modifica al codice**: il compito è di audit. Le due leve sono proposte,
  non implementate, e toccano `chat_logic.py` / `ai_service.py` / `model_context.py`.
- **Nessuna verifica su dati di produzione**: ho misurato con l'impalcatura offline.
  Per confermare sul traffico reale esiste già il contatore: le chiamate loggano
  `prompt_tokens` e `model_pricing.estimate_cost_usd`. Query per il Timoniere:
  `SELECT details->>'prompt_tokens', model FROM logs WHERE ...` aggregata per
  sessione QSA — va eseguita con le credenziali dell'operatore, che qui non ho toccato.
- **Nessuna prova che accorciare il prompt non peggiori le risposte**: qui ho misurato
  solo i byte, non la qualità. Qualsiasi riduzione del testo per step richiede
  benchmark (`backend/tests/test_openrouter_qsa_benchmark.py`, `BENCHMARK_QSA.md`).

## Sintesi per il Timoniere

1. Il prompt di sistema QSA è di fatto una **funzione di (strumento, step, lingua,
   config admin)**, non del turno: 20 varianti distinte per 30 turni.
2. Il 33–49% dei byte inviati è **identico al turno precedente** e non viene
   riutilizzato da nessun provider.
3. «Darlo solo all'inizio» non è possibile senza stato lato provider. Le leve reali
   sono **cache esplicita** + **prefisso stabile in testa**: interventi piccoli,
   nessun cambiamento di comportamento osservabile dal modello.
4. Il precedente del percorso guidato già presente in codebase (`full=False`) mostra
   che il team ha già fatto questo ragionamento una volta: vale la pena applicarlo
   anche a `[META SYSTEM PROMPT]` (1.349 char/turno di teoria, identica per tutto lo
   step) e a `[TURN CONTRACT]` nei follow-up in-step, se i benchmark lo confermano.
---

# Addendum: conviene adottare la prompt cache?

Audit successivo, stessa data, svolto insieme a una revisione indipendente con
Claude Opus. Stessa impostazione: sola lettura, nessuna modifica al codice.
Dossier completo: `/tmp/qsa_prompt_audit/cache-dossier.md`; risposta integrale di
Opus: `/tmp/qsa_prompt_audit/opus-cache-verdict.md`.

## Verdetto

**Dipende, e per i provider economici su cui il progetto punta oggi il risparmio è
0 €.** Cerebras, Together (Llama 3.3) e DeepInfra (Llama 3.3) espongono la cache ma
**non scontano** la lettura; Ollama locale non ha alcun costo per token. La cache
conviene solo se la produzione gira su un provider che sconta (DeepSeek ~-98%,
Groq/Fireworks/OpenAI ~-50/-90%) o su Anthropic con breakpoint esplicito.

Quindi **non è decidibile prima di sapere quale provider serve davvero la produzione**
e `active_provider` non basta: preset del counselor, connessioni personali,
`ai_fallback_targets` e budget fallback possono cambiare il provider effettivo.
La verità è nella tabella `logs` (query nel dossier, da eseguire dentro il container
`postgres`, senza toccare il `.env` dell'host).

## La misura che cambia il quadro: il PII

Il 33–85% di prefisso stabile misurato sopra è **un tetto teorico**. Fra il prompt
preparato e quello che arriva al provider passa `_anonymize_external`
(`backend/ai_service.py:557`), attivo di default su tutti i provider esterni: i
segnaposto `[[PII:TIPO:n]]` sono numerati con un contatore **unico per chiamata**, e
i testi vengono elaborati nell'ordine `[user_message, system_prompt, history]`.

Se lo studente scrive un numero di telefono, la numerazione dentro il prompt di
sistema scala di uno: lo stesso prompt viene mandato come `[[PII:TELEFONO:1]]` e poi
come `[[PII:TELEFONO:2]]`. **Riproduzione fatta e registrata come bug.** In più il
layer NER chiama un LLM locale su tutto il testo, prompt di sistema compreso, senza
temperatura né seed.

Prima di qualsiasi breakpoint, quindi, va reso deterministico il prompt di sistema.

## Numeri (1.000 sessioni QSA da 30 turni, ~3.800 token cacheabili per turno)

| Scenario | Risparmio |
|---|---:|
| deepseek (sconto ~98%) | ~3,35 € |
| groq gpt-oss-120b (-50%) | ~2,85 € |
| fireworks llama-3.3 (-50%) | ~17,10 € |
| cerebras / together llama / deepinfra llama | **0 €** |
| Ollama locale | **0 €** |

Break-even: nei provider automatici senza premio di scrittura ogni hit è guadagno,
basta 1–2 follow-up per step. Con scrittura a 1,25× (Anthropic TTL 5 min, OpenAI
recenti) servono almeno 2 follow-up per step **e** almeno il 28% dei follow-up entro
il TTL.

## TTL: non è il collo di bottiglia

5 minuti sembrano incompatibili con un percorso guidato, dove lo studente legge tra
un turno e l'altro. Ma per i provider economici il TTL è ≥ 1 h (Groq 2 h, DeepSeek
ore-giorni), e la parte di prompt **precedente a `[STUDENT]` (~2.800 token) è
identica per tutti gli studenti sullo stesso step**: in un uso di classe la cache
resta calda anche se un singolo studente torna dopo 20 minuti. Il TTL pesa solo per
Anthropic.

## Ordine dei blocchi: niente riordino generale

Il riordino completo (fascio invariante in testa) costerebbe più di quanto rende:
fra uno step e l'altro resterebbero cacheabili solo ~1.000 token, sotto le soglie di
OpenAI (1.024) e Gemini (2.048–4.096), e LANGUAGE/REGISTER passerebbero davanti alla
sezione di step, cambiando le priorità che i modelli open-weight pesano molto.

**Spostamento chirurgico consigliato:** il prompt di step (319–676 caratteri) oggi
sta al byte 0 solo nei turni di ingresso e azzera il prefisso; spostarlo in coda (o
nel turno utente, come il codice già fa per `qpcs-` e `idea-`) raddoppia gli hit senza
toccare il resto. Da validare con `backend/tests/test_openrouter_qsa_benchmark.py`.

Dove mettere un eventuale breakpoint: in `_attempt_input`, **dopo**
`_anonymize_external` e dopo `fit_context`, che muta la stringa (variante `__short`,
trimming di persona/profilo/knowledge/meta). Salvare l'offset come attributo
separato, senza marchingrini dentro `system_prompt_final`, così
`backend/tests/test_chat_preparation.py` continua a confrontare stringhe uguali.

## Piano a gradini

1. **Misurare, costo zero, nessun codice.** Provider effettivo, `cached_tokens` già
   presenti nei log, pause fra i turni, follow-up per step. Se il provider è Cerebras,
   Together-Llama, DeepInfra-Llama o Ollama: **fermarsi qui**, la cache non è il
   problema.
2. **Rendere stabile il prefisso** (poco codice): determinismo del PII, spostamento
   del prompt di step, `prompt_cache_key` stabile per Mistral e DeepInfra, e
   `estimate_cost_usd` che considera i token cacheizzati.
3. **Breakpoint esplicito** solo se il provider è Anthropic (o OpenRouter verso
   Anthropic/Qwen) e il volume lo giustifica.

**Da non fare:** riordino generale, sentinelle di cache dentro
`system_prompt_final`, cache esplicita Gemini (si paga a €/ora di storage).

## Bug emersi da questo addendum (registrati nel Diario, non pubblicati a mano)

- Contatore PII che rende il prompt di sistema dipendente dal messaggio dello
  studente → nessun riuso del prefisso (confermato, riprodotto).
- Anthropic: `last_usage` mai valorizzato e assente dal listino → `cost_usd` sempre
  null, budget non osservato (confermato).
- `estimate_cost_usd` fattura i token cacheizzati a prezzo pieno → budget in anticipo
  (sospetto).

## Limiti di questo addendum

- Lo stato della cache per provider è stato raccolto da Opus su documentazione
  provider (ottobre 2026) e va riverificato prima di una decisione: i prezzi cambiano
  e `backend/model_pricing.py` risulta già disallineato su Together e DeepSeek
  (affermazione non verificata da me).
- Nessun dato di produzione: manca il provider effettivo e la hit rate reale.
- Nessuna misura sulla qualità: spostare il prompt di step in coda può cambiare
  l'aderenza del modello, e serve il benchmark QSA per dirlo.
