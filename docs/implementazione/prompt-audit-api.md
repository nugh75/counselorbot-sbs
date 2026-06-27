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

- `POST /admin/prompt-audit/dry-run`: risolve counselor, preset, step guidato, prompt finale, messaggio effettivo, history opzionale, contesto knowledge opzionale e warning. Non chiama il modello.
- `POST /admin/prompt-audit/live`: usa lo stesso envelope del dry-run, chiama il provider/modello risolto dal counselor o dal preset e restituisce risposta, usage, costo stimato, durata e controlli euristici.
- `POST /admin/prompt-audit/matrix`: produce un riepilogo dry-run per ogni step guidato dello strumento e per i counselor selezionati.

## Campi principali

`PromptAuditRequest` accetta `questionnaire_type`, `language`, `phase`, `mode`, `use_phase_prompt`, `message`, `scores_context`, `session_id`, `counselor_id`, `max_tokens`, `include_knowledge` e `include_history`.

`PromptAuditMatrixRequest` accetta `questionnaire_type`, `language`, `counselor_ids`, `scores_context`, `include_knowledge` e `max_tokens`.

## Garanzie

Gli endpoint non scrivono su `session_memory`, non creano righe `Log`, non generano `SharedChatResponse` e non modificano la memoria conversazionale.

## Persistenza in produzione

I log conversazionali (`action="chat_message"` da `/chat`, `/chat/stream` e `/chat/message`) salvano ora in `details.envelope` lo stesso envelope del dry-run (`system_prompt_final`, `full_message`, `history`), così audit e produzione sono confrontabili. La persistenza è controllata dalla config DB `log_full_prompt` (default `true`, editabile live nella admin Config UI) e rispetta la redazione PII (`log_pii_redact`) come gli altri campi testuali. Gli endpoint `prompt-audit` restano read-only.
