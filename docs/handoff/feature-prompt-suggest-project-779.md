# Handoff — Issue #779: Suggerire al progetto una modifica prompt via email o issue GitHub

## Scopo e contesto
Implementazione della issue [#779](https://github.com/nugh75/counselorbot-sbs/issues/779) (Milestone `#45` — *Prompt ownership*): consente agli amministratori delle istanze con un prompt personalizzato rispetto alla fabbrica di inviare una proposta al maintainer tramite **«Suggerisci al progetto»** da *Amministrazione › Salute dei prompt*, scegliendo tra email (SMTP) o apertura di una issue GitHub.

Il testo di fabbrica nel codice/repository e i prompt dell'istanza non vengono mai modificati finché il maintainer non accetta la proposta.

## Modifiche principali
- **Servizio suggerimenti (`backend/prompt_suggestions.py`):** rileva i canali configurati (`email` via `PROMPT_SUGGESTION_MAINTAINER_EMAIL` + `SMTP_*`; `github` via `PROMPT_SUGGESTION_GITHUB_TOKEN` / `GITHUB_TOKEN` + `PROMPT_SUGGESTION_GITHUB_REPO`), costruisce titolo, motivo, diff unificato e nome istanza (`COUNSELORBOT_INSTANCE_NAME` / `COUNSELORBOT_HOSTNAME`) senza importare `prompt_health`, preservando il grafo di isolamento verificato da `test_forum_privacy.py`.
- **API e scheda prompt (`backend/prompt_health.py`, `backend/routes/prompt_health.py`, `.env.example`):** aggiunge `suggestion_channels` su `prompt_card`, l'endpoint `POST /api/admin/prompt-health/suggest` e documenta le variabili d'ambiente in `.env.example`.
- **UI «Salute dei prompt» e i18n (`frontend/src/components/admin/PromptSuggestForm.tsx`, `PromptCompare.tsx`, `PromptHealthPage.tsx`, `prompt-health.ts`, `i18n-prompt-health.ts`):** aggiunge «Suggerisci al progetto» nella scheda del prompt e nel pannello di confronto, con selezione canale, motivazione obbligatoria, avviso se nessun canale è configurato e traduzioni nelle 6 lingue.
- **Test (`backend/tests/test_prompt_suggestions_779.py`, `frontend/src/lib/prompt-health.test.ts`):** copre assenza di canali configurati, rifiuto di prompt non personalizzati (`409`), invio email mockato con SMTP, apertura issue GitHub mockata con `httpx.MockTransport` senza leak di credenziali e immutabilità del testo di fabbrica.

## Verifica
- `PYTHONPATH=. python3 -m pytest -q backend/tests/test_forum_privacy.py -k "not test_exports_and_pdf_do_not_query_or_include_forum_content" backend/tests/test_prompt_registry.py backend/tests/test_prompt_suggestions_779.py backend/tests/test_prompt_maintainer_777.py backend/tests/test_prompt_levels_778.py backend/tests/test_prompt_proposals_776.py backend/tests/test_prompt_ownership_775.py`
- `npm run i18n:check && npx next typegen && npx tsc --noEmit -p . && npm run test:ci && npx eslint .`
- `make guidance-check`
