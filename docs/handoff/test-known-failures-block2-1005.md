# Handoff test/known-failures-block2-1005

## Stato
PR aperta (vedi gh). Solo test; nessun cambio di comportamento.

## Fatto
- test_inapp_administration launch: asserisce institution_password None (campo voluto, valore None in-app).
- test_plan_questionnaire_chats personal options: attese le chiavi attempts/completed/legacy_profile.
- Tolte 2 righe da postgres_known_failures.txt.

## Verifiche
pytest dei 2 file su Postgres di test (33 passed); make guidance-check ok.

## Prossimi passi
Nessuna voce "goals" nella lista; test_skills_specialized (K1 in QPCC) lasciato al blocco 3, possibile bug reale.

## Blocchi e rischi
Entrambe le PR (#1013, questa) toccano la lista: unire origin/main prima del merge.
