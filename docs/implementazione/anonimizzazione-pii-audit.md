# Anonimizzazione PII in modalità solo-audit

Proposta per estendere la redazione PII di CounselorBot oltre l'attuale regex
(email/telefono/codice fiscale), ispirandosi a [rizzo-pii](https://rizzo-ai-academy.github.io/rizzo-pii/)
(detection locale via modello piccolo + rete deterministica regex/checksum).

## Stato attuale

- `backend/pii.py`: redazione deterministica regex su email, telefono, codice
  fiscale. Replacement distruttivo, applicata **solo** ai record di log
  (`Log.details` ed envelope); il testo inviato all'LLM resta integro.
- Flag di config `log_pii_redact` (default attivo), toggle live dalla admin UI.
- `redact_always` per le uscite esterne (web_lookup).
- Report PII in admin (`/admin/logs/pii-report`).

**Gap noti**

1. Solo 3 categorie: nomi, indirizzi, IBAN, PIVA, targhe non coperti.
2. Nessuna validazione checksum (CF match solo su forma, non carattere di controllo).
3. `session_memory/*.md` su disco: trascrizioni raw, non redatte.
4. Nessun rilevamento ML/NER.

## Opzioni

### A. Estensione deterministica (regex + checksum)

Aggiungere a `pii.py`: IBAN (mod-97), PIVA (algoritmo ufficiale), carte (Luhn),
targa italiana, CF con checksum reale.

**Pro**

- Zero dipendenze, zero latenza, zero RAM extra.
- Language-neutral: copre tutte e 6 le lingue UI (IT/EN/ES/FR/DE/SV).
- Nessun falso positivo possibile sui checksum (validazione matematica).

**Contro**

- Non rileva nomi, indirizzi, città (impossibile via regex senza falsi positivi).
- Nessuna copertura del testo libero oltre gli identificatori strutturati.

### B. Sidecar con modello rizzo-pii-0.3B

Container separato con `rizzoaiacademy/rizzo-pii-0.3B` (ModernBERT, ~0.3B param,
~0.5 GB RAM, CPU) esposto via HTTP `/analyze`; backend chiama il sidecar.

**Pro**

- 22 tag PII, inclusi i 5 tag IT-legal unici (CF, PIVA, CATASTO, DOCID, PROVINCE)
  assenti da ogni altro modello pubblico — rilevanti per app italiana-first.
- Licenza MIT (weights compresi), verificata sulla model card.
- Addestrato multilingua su 8 lingue (IT rinforzato a ~45% del training).
- Backend resta pulito (transformers dentro il container isolato).

**Contro**

- Nuovo container da gestire (build, memoria, healthcheck) + dependency `transformers`.
- Validazione solo italiana: qualità sulle altre lingue meno garantita.
- Nessuna copertura dello svedese (SV).

### C. GLiNER multi PII (`urchade/gliner_multi_pii-v1`)

Stesso schema sidecar, con GLiNER multi PII al posto di rizzo-pii.

**Pro**

- Apache-2.0, 40+ tag PII, 6 lingue europee (EN/FR/DE/ES/PT/IT).
- Variante ONNX più piccola (~278M param), benchmark CPU buoni
  (~95 ms per 1000 char su hardware recente).

**Contro**

- Niente tag IT-legal (CF/PIVA/CATASTO): differenziatori di rizzo-pii assenti.
- Copre 5/6 lingue di Counselorbot (ha PT, manca SV come rizzo-pii).
- Libreria `gliner` da aggiungere al sidecar.

### D. Ollama piccolo (qwen3:0.6b già presente)

NER via prompt con output strutturato sul modello già installato.

**Pro**

- Zero infrastruttura nuova: Ollama già in uso (`certified_translation.py`).
- Multilingua per costruzione, copre anche SV (unica opzione a coprire tutte
  e 6 le lingue UI).
- Un solo modello per tutte le lingue; prompt modificabile senza redeploy.

**Contro**

- Qualità NER inferiore a un token-classifier dedicato; rischio allucinazioni
  su identificatori strutturati (mitigato solo se il layer deterministico resta
  autoritativo).
- Latency per chiamata più alta (0.5–2 s) e costo CPU maggiore.
- Prompt engineering + validazione output da mantenere.

**Nota implementativa (prompt-as-layer)**: il modello restituisce SOLO una
lista `[{type, value}]` in JSON forzato (Ollama format json / JSON schema);
il codice applica exact-match replacement sul valore (non offset carattere)
con placeholder numerati + mapping in RAM, mai testo riscritto dal modello.
Layer deterministico (checksum) sempre on e autoritativo; modello solo per
nomi/indirizzi in testo libero.

## Applicazione audit-only (comune a B/C/D)

- **Non** in linea per-request (latency): redazione asincrona post-write
  (`BackgroundTasks`) per i nuovi `Log.details`.
- Sweep periodico su `session_memory/*.md` (oggi raw) + backfill dei log esistenti.
- Layer deterministico (A) sempre attivo e sempre in linea: è lui che copre
  gli identificatori strutturati in tutte le lingue, incluso SV.
- Testo verso l'LLM resta integro; `log_pii_redact` resta master switch.
- Report admin esteso alle nuove categorie.

## Raccomandazione

A + B: estensione deterministica subito (win sicuro, indipendente), poi sidecar
**rizzo-pii-0.3B** come modello ML primario — i tag IT-legal valgono più del
gap svedese su testo libero (utenza SV minima; identificatori strutturati in SV
coperti comunque dal layer A). Se in futuro servisse copertura SV completa su
nomi/indirizzi, fallback D solo per sessioni `lang=sv`.

## Scenario 2 — Anonimizzazione verso provider LLM esterni (DeepSeek, OpenAI...)

Caso d'uso esatto per cui nasce rizzo-pii: i dati dello studente escono verso
API cloud (`api.deepseek.com` ecc.). Flusso: anonimizzare localmente → inviare
placeholder → ripristinare i valori reali nella risposta prima di mostrarla.

**Punto di inserzione unico**: `ai_service.stream_response` / `call_model`
(`backend/ai_service.py:740` / `:404`) — tutto il traffico LLM passa di lì.
Se provider esterno (`deepseek`, `openai`, `anthropic`, `gemini`, `mistral`,
`openrouter`, `groq`, `cerebras`, `together`, `fireworks`, `deepinfra`) →
anonimizzare envelope (`user_message`, `system_prompt`, `history`) prima della
call; provider locali (`ollama`, `llamacpp`) → nessuna modifica. Restore dei
placeholder nella risposta (streaming incluso, con buffer per placeholder
spezzati tra chunk). `web_lookup` già coperto da `redact_always` (distruttivo,
solo query outbound).

**Reversibilità necessaria** (a differenza dello scenario 1, distruttivo):
mapping placeholder→valore in memoria per-request, scartato a fine risposta,
mai scritto su disco.

**Pro**

- I dati reali non escono mai dalla macchina → minimizzazione dati (GDPR art. 5).
- Risposta coerente per lo studente (nomi ripristinati prima della visualizzazione).
- Un solo choke point da modificare, tutti i provider esterni coperti.

**Contro**

- Latency ML pre-call sui provider esterni (~0.2–1 s CPU, modello 0.3B).
- Restore streaming: buffer per token spezzati, superficie di test non banale.
- L'LLM può generare testo che collide con la sintassi placeholder (raro, da sanificare).
- Fallback se il detector è giù: bloccare la call o inviare senza anonimizzazione? (decisione policy)
- Mapping in RAM: se il processo muore a metà risposta, placeholder restano orfani (risposta da rigenerare).

**Layer**: deterministico (checksum) sempre on + ML (rizzo-pii-0.3B) per
nomi/indirizzi. Flag di config dedicato (es. `external_pii_redact`, default on),
indipendente da `log_pii_redact`.

## Design implementato (2026-09-01)

Branch `feature/pii-external-anonymization`. TDD: `backend/tests/test_pii_external.py`
(27 test, puri, senza rete/DB).

### Componenti

- **`backend/pii.py`** — refactor: motore unico `find_pii(text) -> [(tipo, valore)]`
  con validazione checksum (IBAN mod-97, PIVA, Luhn, CF carattere di controllo)
  e targa; identificatori esteri: DNI/NIE spagnolo (tabella mod-23), NIR
  francese (mod-97), NINO britannico, personnummer svedese (Luhn); telefoni
  internazionali (`+...`, conteggio cifre) e nazionali ES/FR/DE/SV/UK. Due
  consumatori: `redact()` distruttivo (audit, invariato) e `anonymize()`
  reversibile con token `[[PII:TIPO:N]]` + mapping. `restore()` inverte.
  Priorità dei rilevatori a checksum sul pattern telefonico.
- **`backend/pii_ner.py`** (nuovo) — layer ML prompt-driven: `anonymize_texts`
  applica il deterministico su tutti i testi + NER Ollama (`qwen3:0.6b`,
  format json) per nome/indirizzo/città, exact-match sul valore (il modello
  non riscrive il testo). Token unici per (tipo, valore) su tutta la richiesta.
  `ner_ok=False` distingue "detector non risponde" da "nessuna entità".
  `StreamRestorer` tiene in buffer la coda che può essere un prefisso di token
  e ripristina i chunk streaming senza perdere placeholder spezzati.
- **`backend/ai_service.py`** — `LOCAL_PROVIDERS = {ollama, llamacpp}`;
  `_anonymize_external` su `stream_response`, `call_model` e `generate_summary`
  (quest'ultimo senza restore: il riassunto è testo interno). Restore sui chunk
  `content` con buffer e su `reasoning` best-effort. Fallback
  `external_pii_fallback`: `block` (AIError) o `send_raw`.
- **`backend/main.py`** — seed 4 chiavi config:
  `external_pii_redact` (true), `external_pii_fallback` (block),
  `pii_ner_enabled` (true), `pii_ner_model` (`qwen3:0.6b`); load flag NER nel
  lifespan come `log_pii_redact`.

### Invarianti

- Testo verso provider locali: mai toccato.
- Log audit: redazione distruttiva separata (`log_pii_redact`), invariata.
- Mapping PII: solo RAM per-request, mai su disco.
- Latency NER: solo su provider esterni, disattivabile da admin.

### Rimasto fuori (decisioni aperte)

- Sweep `session_memory/*.md` (oggi raw) e backfill log storici: fuori scope,
  il wrapper copre solo il traffico uscente.
- Copertura svedese su nomi/indirizzi: gap noto del layer NER (identificatori
  strutturati in SV coperti dal deterministico).
- Placeholder cross-turn non stabili (mapping per-request): token opachi per
  l'LLM, nessun impatto funzionale.
