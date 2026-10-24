# P6 — Gateway AI unico

Stato: **implementato in modalità di transizione** (2026-10-24), blocco P6 di [03-piano-blocchi](03-piano-blocchi.md),
progetto in [02-progettazione](02-progettazione.md) §6. Agente `s63` (Claude Opus 5.5), branch
`feature/privacy-p6-ai-gateway`.

## 1. Forma

`backend/privacy/gateway.py`:

- `AIGateway(config, *, transport=None, text_filter=None, public_content=False, mode=None, purposes=None,
  authorize=None, audit=None, pid_of=None)`.
- `send(request, ctx) -> AIResponse | Iterator[AIChunk]`: esegue il trasporto passato al costruttore con la
  richiesta filtrata e ripristina la risposta testuale (`chat_stream` → `AIChunk` ripristinati fra i chunk). Senza
  trasporto: `EgressBlockedError`, nessun invio.
- `prepare(request, ctx) -> Prepared`: passi 1-4 e 7 per i chiamanti che eseguono da sé il trasporto (streaming con
  ripieghi, async, vettori, audio). `Prepared.request` è l'unica richiesta che può uscire; `restore(text)` e
  `stream_restorer()` sono il passo 6.
- `context_for(username, purpose="guided_chat")` costruisce il `PrivacyContext` delle chiamate del backend;
  `is_local(target)` classifica per host (`is_trusted_local`), mai per nome del provider; `shadow_report()` conta i
  passi non applicati in transizione (`passo:codice`, nessun contenuto).

`AIRequest` resta quello di P1 (`kind`, `target`, `texts`, `images`, `audio`, `attachments_context`). `PrivacyEvent`
guadagna `target` e `categories_count` (solo conteggi). Lo stub `policy.AIGateway` di P1 è sostituito.

## 2. Passi (02 §6.1)

| # | Passo | `strict` | `transitional` (default) |
|---|---|---|---|
| 1 | finalità attiva con base giuridica (`require_purpose`) | blocca (`PurposeDisabled`, `ConsentMissing`) | valutato e contato, non blocca |
| 2 | `authorize_data_access(principal, "send_to_ai", subject, purpose)` | blocca (`AccessDenied`) | valutato e contato, non blocca |
| 3 | target locale solo se loopback o in `PRIVACY_LOCAL_HOSTS`; host vuoto o sconosciuto = esterno | sempre | sempre |
| 4 | esterno: testi, system prompt, cronologia, RAG e documenti filtrati **insieme** (stessa mappa), poi verifica residui con le regole deterministiche (`ResidualPII`); immagini e audio verso esterni bloccati | motore P4 obbligatorio (`PIIDetectorUnavailable` se assente); pseudonimizza anche in locale per `teacher_noticing`, `research` o `pseudonymize_local` | motore P4 se installato, altrimenti il filtro attuale `pii_ner` (regole + NER locale, `external_pii_fallback`) |
| 5 | credenziali del backend, TLS verificato, timeout e limiti | nei trasporti esistenti; il test statico vieta `verify=False` | idem |
| 6 | ripristino solo con la mappa della richiesta; con P4 solo se `restore_authorized` lo consente, altrimenti restano i segnaposto; log solo con conteggi | sempre | sempre |
| 7 | `record_privacy_event("ai_transmission", target, purpose, categories_count)` **prima** dell'invio | blocca (`AuditUnavailable`, `KeyUnavailable`) | valutato e contato, non blocca |

`PRIVACY_GATEWAY_MODE=strict|transitional`; ogni altro valore vale `strict`. In transizione ogni esito non applicato
viene registrato una volta per processo (`Privacy gateway (transitional): step … not enforced (codice)`), senza testo.
Passare a `strict` in produzione richiede P7 (grant), gli eventi privacy di P8, P9 (finalità e consensi) e il modello
P4 configurato: oggi bloccherebbe ogni chiamata AI. Decisione dell'utente del 2026-10-24.

## 3. Comportamento per `kind`

| `kind` | Punto di uscita (01 §5) | Esterno |
|---|---|---|
| `chat`, `chat_stream`, `summary` | `AIService._anonymize_external` (#1-4), chiamata da `_attempt_input` e `generate_summary` | pseudonimizzato; riassunto con segnaposto |
| `vision` | `vision_service.call` (#5) | immagine bloccata (`personalAPI.errors.privacy`) prima di chiavi, SDK e rete |
| `ocr` | `qsa_extractor._ollama_post`, `pqbl_generator._local_ollama_ocr` (#6-7) | bloccato; il controllo host P6b resta |
| `embedding` | `embedding_service.embed_texts` (#9) | documenti solo da corpus pubblico (`public_content`, non filtrati); query con `filter_external_query` come filtro del chiamante + verifica residui; `private` mai fuori |
| `tts` | `voice_reader.speech_text` (lettore `/tts`, #11) e il vecchio `/chat/tts` | redazione deterministica `pii.redact_always` (P6c), nessun ripristino; Piper fidato riceve il testo |
| `notify` | `telegram_bot.send_message`/`send_photo` (#15) | consegnato com'è: è il canale collegato dall'interessato; finalità, grant ed evento con conteggi; diagrammi generati dal server ammessi |
| `transcription` | nessun chiamante (audio verso il servizio interno, #12) | audio bloccato |

Correzioni collegate:

- `embedding_service`: un Ollama fuori dagli host fidati è **remoto** per la privacy (testi privati e documenti non
  pubblici rifiutati con `embedding_privacy_blocked`), senza chiave, prezzo o budget. Prima bastava il nome `ollama`.
- `/chat/tts` passa ora dallo stesso filtro di `/tts` (prima Edge riceveva il testo in chiaro).
- Provider con nome locale ma che inoltrano altrove (`omniroute`) sono sempre esterni; solo `ollama` e `llamacpp` hanno
  un host classificabile.

## 4. `external_pii_redact=false` (G12)

Rimosso come opzione: `AIService` non lo legge più, il filtro esterno non si spegne. La chiave resta nel seed come
«obsoleta, ignorata» e non cambia più la modalità del pannello `/admin/external-privacy` (solo NER e
`external_pii_fallback`). Le fixture di test che la usavano disattivano invece il solo NER (`pii_ner_enabled=false`);
i test con provider finto possono sostituire `_anonymize_external` con un passaggio esplicito.

## 5. Nessun bypass

`backend/tests/test_ai_egress_guard.py` analizza l'AST di `backend/` (test esclusi), senza importarlo:

- costruttori `OpenAI`, `AsyncOpenAI`, `Anthropic`, `AsyncAnthropic`, `Mistral`, `genai.Client`, `edge_tts.Communicate`
  ed endpoint (`/api/chat|generate|embed`, `/chat/completions`, `/embeddings`, `/synthesize`, domini dei provider,
  Edge, Telegram) solo nei moduli dell'elenco chiuso;
- ogni modulo di trasporto contiene l'import di `privacy.gateway` (o, per `routes/chat.py`, la chiamata a
  `speech_text`); `chatgpt_responses.stream` è chiamato solo da `ai_service`;
- nessuna voce obsoleta nell'elenco; nessun `verify=False`.

Le altre voci: `chatgpt_connections` e `openrouter_capabilities` (token e cataloghi, nessun dato personale),
`local_llm` (URL e sonde), `pii_ner` (rilevatore interno, solo host fidato), `prompt_lab/local_models` (laboratorio,
escluso da teacher-pc).

## 6. Test

```bash
TEST_DB=sqlite ~/.pyenv/versions/3.11.9/bin/python -m pytest \
  backend/tests/test_privacy_p6_gateway.py backend/tests/test_ai_egress_guard.py
```

`test_privacy_p6_gateway.py`: ogni passo `strict` blocca prima del trasporto; P4 obbligatorio; evento con soli
conteggi; ripristino autorizzato e negato; streaming; conteggi della transizione; modalità sconosciuta = `strict`;
classificazione per host e `PRIVACY_LOCAL_HOSTS`; immagini/audio; residui; `public_content`; TTS e notify; NER remoto.
**E2E**: `AIService` con OpenAI (SDK reale) su un trasporto `httpx`/`httpx2` simulato che risponde solo per
`api.openai.com` e un blocco dei socket non loopback; l'intero corpus P2 passa in messaggio, system prompt e cronologia
(chat, streaming, riassunto) con il motore P4 vero il cui strato ML restituisce le annotazioni del corpus: nessun
valore compare nei corpi HTTP, la risposta torna in chiaro allo studente autorizzato; frasi con salute/art. 9 non
partono affatto. In transizione i valori trovati dalle regole non escono; `external_pii_redact=false` non spegne il
filtro; visione esterna senza connessioni; Edge e query embedding solo filtrati.

## 7. Limiti

- In transizione i passi 1, 2 e 7 non bloccano e il filtro esterno resta quello pre-P4: regole + NER Ollama locale
  (copertura misurata in P2/P3, nomi in prosa non garantiti senza NER). La garanzia dell'E2E riguarda il motore P4,
  non il filtro attuale.
- L'E2E prova il percorso dei dati, non la qualità del rilevatore (misurata in P3/P4 sul modello vero).
- `notify` consegna il contenuto a Telegram: trasferimento a un terzo da decidere con il titolare (04-D2, D9).
- `PrivacyContext` usa `guided_chat` e il ruolo `system` per tutte le chiamate; finalità per funzione (es.
  `teacher_noticing`) e ambiti per conversazione arrivano con P9 e con il collegamento della mappa P8 per richiesta.
- Il passo 5 non è imposto dal gateway sugli SDK: restano i timeout e i limiti dei trasporti esistenti.
- Le misure non rendono da sole il trattamento conforme al GDPR.
