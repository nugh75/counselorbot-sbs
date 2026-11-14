# Handoff — feature/journey-noticing-890 (issue #890)

## Stato
Porting su main di `origin/feature/noticing-all-sources` (d8181fc4) completato; PR in apertura.

## Fatto
- Backend: `noticing_sources.py` (lettore unico delle fonti), `student_noticing.py`
  (analisi a blocchi, citazioni ricontrollate), tabella `teacher_noticing_artifacts`,
  rotte `/admin/groups/{id}/students/{username}/noticing[-source]`, `class_noticing.py`
  sul percorso intero (membri reali via `class_council._members`).
- Adattamenti a main: risultati di altre classi esclusi con le loro chat
  (`is_resource_in_group_scope`), `_require_institution_membership` sulle rotte studente.
- NON portati: `orientation_advice.py`, rotte `/orientation-advice`, UI bozza: duplicano
  il Consiglio orientativo di main (#664). Nemmeno `scripts/dev-noticing-tests.sh`.
- Frontend: `ClassNoticingTab` adattato in place (token di design), `StudentJourneyNoticing`,
  `i18n-journey-noticing`; testi forum in 6 lingue corretti (non più «nessun modello legge il forum»).
- Doc: `whole-journey-noticing.md`, funzionalità, CONTEXT, class-centred-plan.

## Verifiche
- pytest (Postgres isolato): student_noticing, class_noticing, forum_privacy, teacher_noticing,
  test_data_exclusion → 38 pass; 1 fallimento già noto (forum metadata reader, in known_failures);
  `test_filters_and_staleness` corretto (aspettativa WIP superata) e rieseguito.
- node --test student/class-noticing: 4 pass. tsc: nessun errore nei file toccati.
- make guidance-check: OK.

## Prossimi passi
- Merge da parte del proprietario; deploy con rebuild frontend `--no-deps`.
- Valutazione educativa con studenti reali (ancora da fare).

## Blocchi e rischi
- Le sintesi di classe pre-#890 nei log non sono più lette: serve una nuova analisi.
- Volume esterno lento: la suite mirata impiega ~30 minuti.
