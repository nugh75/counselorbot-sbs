# Handoff: feature/prompt-proposals-776

## Stato
Implementazione e test completati per #776 (proposte di aggiornamento dei prompt di fabbrica e aggiornamento automatico per i prompt mai personalizzati).

## Fatto
- **Backend:**
  - Nuova tabella `prompt_factory_proposal_dismissals` in `backend/models.py` (creata via `create_all`, nessuna migrazione ALTER).
  - Nuovo modulo `backend/prompt_factory_proposals.py` con `auto_apply_uncustomised`, `list_proposals`, `pending_count`, `accept_proposal`, `ignore_proposal`, `reopen_proposal`, `merge_proposal`.
  - Collegato `auto_apply_uncustomised` allo startup in `backend/main.py` dopo `restore_admin_owned` e `reconcile`.
  - Aggiunte le rotte `/api/admin/prompt-health/proposals*` e il campo `pending_proposals` in `GET /api/admin/prompt-health` (`backend/routes/prompt_health.py`), con pulizia dismissal in `backend/prompt_factory_alignment.py`.
- **Frontend:**
  - Nuovo componente `PromptFactoryProposals` in `PromptHealthPage` (contatore proposte in sospeso, diff, Accetta, Ignora, Unisci a mano con anteprima, elenco ignorate con Riapri).
  - Badge `pending_proposals` sul pulsante `PromptHealthPanel` e link ancora nella panoramica di `PromptHealthPage`.
  - Traduzioni `admin.promptProposals.*` nelle 6 lingue in `frontend/src/lib/i18n-prompt-alignment.ts`.
- **Test & Documentazione:**
  - `backend/tests/test_prompt_proposals_776.py` (unit + HTTP routes SQLite in-memory).
  - Esteso `frontend/src/lib/prompt-health.test.ts` per le nuove chiavi i18n.
  - Aggiornati `docs/operations/prompt-factory-alignment.md`, `docs-counselorbot/funzionalita-counselorbot.md` e `docs/progetto/piano-interventi.md`.

## Prossimi passi
- Completare Wave 1 con `#778` (prompt di 1°/2° livello con doppia conferma) o `#911` / `#83`.
