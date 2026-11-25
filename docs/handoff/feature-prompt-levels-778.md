# Handoff: feature/prompt-levels-778

## Stato
Implementazione e verifiche completate per #778 (classificazione prompt di 1° e 2° livello e doppia conferma per i prompt di 1° livello).

## Fatto
- **Backend:**
  - Aggiunti `LEVEL_FIRST`, `LEVEL_SECOND`, `FIRST_LEVEL_CONFIG_KEYS`, `PromptEntry.level` e `prompt_level(...)` in `backend/prompt_registry.py`.
  - Esposti `level` / `prompt_levels` in `prompt_health.py`, `prompt_factory_proposals.py` e `GET /admin/prompt-health/map`.
  - Imposta la conferma esplicita `confirm_first_level=True` (HTTP `409` `first_level_confirmation_required` se omessa) su `POST /admin/prompt-health/save` e `POST /admin/prompt-health/proposals/merge`.
- **Frontend:**
  - Tipi e helper `PromptLevel` / `isFirstLevelPrompt` in `frontend/src/lib/prompt-health.ts` e traduzioni `admin.promptHealth.level.*` nelle 6 lingue in `frontend/src/lib/i18n-prompt-health.ts`.
  - Badge livello e schermata `alertdialog` di doppia conferma in `PromptCompare.tsx` e `PromptFactoryProposals.tsx`; badge livello in `PromptCardView` e `PromptStatusCatalog` (`PromptHealthPage.tsx`).
- **Test & Documentazione:** `backend/tests/test_prompt_levels_778.py`, esteso `frontend/src/lib/prompt-health.test.ts`, aggiornati `docs-counselorbot/funzionalita-counselorbot.md` e `docs/progetto/piano-interventi.md`.
