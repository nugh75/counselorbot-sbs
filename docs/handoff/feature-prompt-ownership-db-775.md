# Handoff — Prompt ownership DB (#775)

- **Stato:** pronto per review / PR aperta verso `main` su `feature/prompt-ownership-db-775`.
- **Scope (#775):** DB come unica fonte runtime dei prompt, storico append-only e ripristino, stato a 3 valori in *Salute dei prompt*, «Allinea prompt di fabbrica» consolidato come azione multipla selettiva dentro *Salute dei prompt*, rimozione di `FORCED_FACTORY_KEYS`.

## Fatto
- **Runtime DB unico:** `orientation.py` legge `counselorbot_chat_context` dal DB (fallback di fabbrica solo se assente); `_ensure_questionnaire_guided_steps` registra `ORIGIN_SEED` al seed iniziale; verificati tutti i consumer (`_resolve_system_prompt`, `_apply_global_directives`, `free_chat_contract`, `_resolve_site_prompt`, `orientation.analyze_turn`).
- **Storico e ripristino:** `prompt_revisions.ensure_baseline` salva sempre il testo vivo precedente prima di salvataggi/ripristini (`routes/admin.py`, `prompt_health.py`, `prompt_revisions.restore`); `is_versioned_config_key` copre anche le famiglie dinamiche del registro; `PromptHistory` montato in scheda prompt e confronto dentro *Salute dei prompt*.
- **Stato 3 valori:** `prompt_health.prompt_status` / `all_prompt_statuses` (`factory` / `customised` / `factory_update` / `code`) esposti in `GET /admin/prompt-health/prompt` e `/map`, mostrati su scheda, confronto, mappa e sezione «Stato dei prompt» (filtri + ricerca).
- **Allineamento multiplo e rimozione forzature:** rimossa `FORCED_FACTORY_KEYS` in `prompt_factory_alignment.py`; `make_plan` include diff e stato sui personalizzati (`preserved`); `apply_review` accetta `selected` (422 su non ammessi, 409 su piano scaduto); `PromptFactoryAlignment` spostato da `ConfigForm` a `PromptHealthPage` con elenchi separati (aggiornamenti di fabbrica pre-selezionati, personalizzati deselezionati).
- **NON costruito (fuori scope, PR dedicate):** #776 (proposte individuali accetta/ignora/merge + contatore), #778 (livelli 1/2 e doppia conferma), #777 (modalità manutentore + PR GitHub), #779 (suggerisci al progetto via email/issue).

## Verifiche
- Backend PostgreSQL 15 (container temporaneo `cb-test-pg-775` rimosso a fine test): **423 passed, 0 failed** (`test_prompt_ownership_775`, `test_prompt_registry`, `test_prompt_health`, `test_prompt_factory_alignment`, `test_prompt_revisions`, `test_prompt_coherence_pr1`, `test_strategies_step`, `test_admin_guided_step_structure`, `test_goal_focused_definition`, `test_questionnaire_description`).
- Backend SQLite (`test_prompt_ownership_775.py`): tutti verdi.
- Frontend: `i18n:check` (3940 chiavi × 6 lingue), `next typegen`, `tsc --noEmit`, `test:ci` (**967 passed, 0 failed**), `eslint` sui file modificati.
- Documentazione: `docs-counselorbot/funzionalita-counselorbot.md`, `docs/operations/prompt-factory-alignment.md`, `CONTEXT.md`, `make guidance-check`.
- Non eseguiti (vincolo Mac 8 GB): dev server Next.js, test browser Playwright, build Docker di produzione.

## Prossimi passi
- Review e merge PR #775 su `main`, poi avvio di #776 (proposte individuali accetta/ignora/merge manuale + contatore).

## Blocchi e rischi
- Nessun blocco. Nessuna migrazione schema (riusa `prompt_revisions`, `configs`, `guided_steps`).
- `frontend/tests/prompt-factory-alignment.test.mjs` (suite Playwright locale non eseguita su Mac 8 GB) testa ancora la vecchia collocazione in `ConfigForm`; andrà aggiornata quando si riesegue la suite Playwright.
