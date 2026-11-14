# Handoff — feature/teacher-goal-hierarchy-906 (#906)

## Stato
Completo: PR #908 aperta (https://github.com/nugh75/counselorbot-sbs/pull/908), CI non-desktop verde. Nessuna UI (arriva con #907).

## Fatto
- `GoalCatalogEdge` (`goal_catalog_edges`, create_all, FK CASCADE, unico + no self) in `backend/models.py`.
- `backend/goals.py`: `CatalogCreate` (`parent_id`), `CatalogParentWrite`, `catalog_parent_map`, `catalog_descendant_ids`.
- `backend/routes/goals.py`: `parent_id` in POST, `POST/DELETE /teacher/goal-catalog/{id}/parents` (versione, 422 sui cicli, advisory lock per autore), `parent_ids` nelle risposte docente.
- Visibilità per voce (Q4): nessuna ereditarietà; `parent_ids` filtrati alle voci visibili; `/user/goal-catalog` invariato.

## Verifiche
- `test_goals.py` 31 passed, `test_assignments.py` 14 passed (Postgres effimero, container rimossi).
- `scripts/check-sql-portability.py` ok; `make guidance-check` ok; CI: tests/startup (postgres), portability, documentation pass.

## Prossimi passi
- #907: albero e mappa nel `GoalCatalogEditor` (adapter verso `GoalTree`/`GoalMap`).

## Blocchi e rischi
- Aggiungere/togliere un genitore incrementa `version`: un'adozione studente con versione vecchia riceve 409 (ricarica), come per le modifiche.
