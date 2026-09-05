# Prompt Audit API

Gli endpoint `prompt-audit` sono strumenti admin-only per verificare i prompt guidati di CounselorBot senza passare dalla UI.

## Autenticazione

Gli endpoint accettano l'autenticazione admin/ricercatore standard via ai4auth. Per prove API automatizzate possono anche usare l'header `X-Prompt-Audit-Token`, ma solo se il backend riceve la variabile `PROMPT_AUDIT_API_TOKEN` dall'ambiente gestito da ai4educ Console.

Esempio:

```bash
curl -sS http://127.0.0.1:8088/admin/prompt-audit/dry-run \
  -H 'Content-Type: application/json' \
  -H "X-Prompt-Audit-Token: $PROMPT_AUDIT_API_TOKEN" \
  -d '{"questionnaire_type":"QSA","language":"it","phase":"cognitive","mode":"factor","use_phase_prompt":true}'
```

## Endpoint

- `POST /admin/prompt-audit/dry-run`: usa la preparazione comune a `/chat` e `/chat/stream`, risolve counselor, preset, step, prompt, history opzionale e warning. Non chiama modelli, retrieval o handler delle skill. Per riprodurre fonti e skill di un turno occorre fornire `retrieval_context`; `include_knowledge=true` da solo produce un avviso di materiale non riprodotto.
- `POST /admin/prompt-audit/live`: usa la preparazione comune con retrieval opzionale e riduzione dell'intero percorso quando serve una sintesi. Chiama il modello selezionato e gli eventuali ripieghi configurati. Restituisce il modello effettivo, i tentativi, il contesto adattato, risposta, usage, costo, durata e controlli euristici. Registra un log `prompt_audit_live`.
- `POST /admin/prompt-audit/matrix`: produce un riepilogo dry-run per ogni step guidato dello strumento e per i counselor selezionati.

## Campi principali

`PromptAuditRequest` accetta `questionnaire_type`, `language`, `phase`, `mode`, `use_phase_prompt`, `message`, `scores_context`, `session_id`, `conversation_id`, `counselor_id`, `max_tokens`, `response_length` (`short`, `medium`, `long`), `idea_variant`, `idea_budget`, `include_knowledge`, `include_history`, `component_flags`, `retrieval_context` e `journey_context`.

`retrieval_context` riproduce il materiale già raccolto: `knowledge_context`, `strategy_ids`, `certified_strategy_ids`, `reading_ids`, `skills_blocks` e `recommendation_meta`. Gli ID sono risolti nel catalogo corrente: per un confronto esatto deve essere lo stesso catalogo del turno originario. `journey_context` può riprodurre le note complete già ridotte per una sintesi. Non inserire credenziali in questi campi.

`PromptAuditMatrixRequest` accetta `questionnaire_type`, `language`, `counselor_ids`, `scores_context`, `include_knowledge` e `max_tokens`.

## Garanzie

`dry-run` e `matrix` non scrivono la memoria, non ne aggiornano la scadenza, non creano log e non eseguono modelli o handler delle skill. `live` genera una risposta e un log; può eseguire retrieval e skill. Non applica patch alla mappa IDEA e non avanza il percorso dello studente.

Una fase inesistente può essere visualizzata nel dry-run con `runtime_valid=false`; il live la rifiuta. `resolved.context_budget` distingue limiti configurati, stima dell'input, materiale facoltativo eliminato e storico rimosso. Una capacità remota sconosciuta rimane esplicitamente sconosciuta. I controlli sul testo sono euristiche, non una validazione semantica universale.

## Persistenza in produzione

I log conversazionali salvano l'envelope preparato (`system_prompt_final`, `full_message`, `history`), insieme a `model_attempts`, `context_budget` e, per le sintesi, `journey_coverage`. Il provider e il modello sono quelli effettivamente usati. La persistenza del prompt completo dipende da `log_full_prompt` e rispetta la redazione PII. L'audit live restituisce l'envelope adattato al tentativo riuscito: in caso di ripiego, la preparazione riparte dall'input completo, prima dei tagli del primo modello.

Configurazione e verifiche: [audit e piano del 5 settembre 2026](../audits/2026-09-05-prompt-coherence.md).
