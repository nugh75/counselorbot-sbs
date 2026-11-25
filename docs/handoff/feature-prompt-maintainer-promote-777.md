# Handoff — Issue #777: Maintainer mode per promuovere un prompt a testo di fabbrica via PR

## Scopo e contesto
Implementazione della issue [#777](https://github.com/nugh75/counselorbot-sbs/issues/777) (Milestone `#45` — *Prompt ownership*): consente alla sola istanza maintainer (esplicitamente abilitata e dotata di token GitHub) di aprire una Pull Request su GitHub con l'azione **«Rendi testo di fabbrica»** direttamente da *Amministrazione › Salute dei prompt*.

Le istanze distribuite mantengono la fabbrica in sola lettura: senza `PROMPT_MAINTAINER_MODE=true` e token configurato, il campo `maintainer_promote` non compare nelle risposte API e il pulsante non viene mostrato né consentito (HTTP `403 maintainer_mode_disabled`).

## Modifiche principali
- **Risoluzione sorgenti di fabbrica (`backend/prompt_factory_source.py`):** analisi AST su `backend/prompt_config.py` e `backend/prompts/*.md` per individuare file Markdown dedicati o stringhe inline univoche (con conversione offset UTF-8 per evitare corruzioni dovute a commenti accentati), escludendo in sicurezza sorgenti condivise o composte dinamicamente.
- **Motore PR GitHub (`backend/prompt_maintainer.py`):** verifica configurazione (`PROMPT_MAINTAINER_MODE`, `PROMPT_MAINTAINER_GITHUB_TOKEN` / `_FILE`, `PROMPT_MAINTAINER_GITHUB_REPO`, `PROMPT_MAINTAINER_GITHUB_BASE_BRANCH`), crea un branch dedicato, committa la modifica e apre una PR via REST API GitHub senza mai esporre il segreto nei log o nelle risposte.
- **API e UI (`backend/prompt_health.py`, `backend/routes/prompt_health.py`, `frontend/src/components/admin/PromptPromotePanel.tsx`, `PromptCompare.tsx`, `PromptHealthPage.tsx`):** espone `maintainer_promote` nella scheda prompt, endpoint `POST /api/admin/prompt-health/promote-factory`, componente UI riutilizzabile nella scheda prompt e nel confronto, traduzioni nelle 6 lingue in `i18n-prompt-health.ts` e variabili documentate in `.env.example`.
- **Test (`backend/tests/test_prompt_maintainer_777.py`, `frontend/src/lib/prompt-health.test.ts`):** verifica disattivazione di default, risolutori AST/UTF-8, creazione PR mockata via `httpx.MockTransport` senza leak di credenziali e rifiuto `409` su prompt invariati.

## Verifica
- `PYTHONPATH=. python3 -m pytest -q backend/tests/test_prompt_registry.py backend/tests/test_prompt_maintainer_777.py backend/tests/test_prompt_levels_778.py backend/tests/test_prompt_proposals_776.py backend/tests/test_prompt_ownership_775.py`
- `npm run i18n:check && npx next typegen && npx tsc --noEmit -p . && npm run test:ci && npx eslint .`
- `make guidance-check`
