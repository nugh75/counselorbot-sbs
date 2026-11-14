# Handoff: feature/teacher-goal-map-907 (#907)

## Stato
Completo: viste Albero e Mappa nel Catalogo obiettivi del docente, con modifica dei genitori. PR aperta verso main.

## Fatto
- `catalogGoals` (frontend/src/lib/goal-network.ts): adattatore riga catalogo -> forma minima di obiettivo; nessuna visibilità ereditata (Q4).
- `GoalTree`/`GoalMap`: prop opzionali `showProgress` e `canAddChild` (default invariati per gli studenti).
- `GoalCatalogEditor`: viste Elenco/Albero/Mappa (`cb_catalog_view`), sottoproposta con `parent_id`, sezione «Serve a» con stacca/aggiungi genitore, messaggio di ciclo (422).
- Tipo `TeacherCatalogEntry` con `parent_ids`; chiave i18n `viewTree` in 6 lingue.
- Doc: docs-counselorbot/funzionalita-counselorbot.md.

## Verifiche
- tsc: nessun errore nei file toccati (solo TS2307 preesistenti sulle PNG della guida assenti nel worktree).
- eslint sui file toccati: ok. i18n:check: ok.
- node --test src/lib/goal-network.test.ts: 8/8. tests/flat-area-subpages.test.mjs: 6/6.
- make guidance-check: ok.
- Test browser (personal-goals) non rieseguiti: richiedono app e backend dev; la vista predefinita resta Elenco, i selettori usati restano validi.

## Prossimi passi
- Merge della PR dal proprietario; deploy con rebuild --no-deps del frontend al prossimo traguardo.

## Blocchi e rischi
- Nessun blocco. La mappa è solo per schermi lg (come per gli studenti).
