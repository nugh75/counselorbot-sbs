# Handoff test/known-failures-block1-1004

## Stato
Completo, PR aperta (issue #1004).

## Fatto
- Rimosse 7 voci da postgres_known_failures.txt (test_class_orientation x5, test_forum_privacy x1, test_practice_notebooks x1).
- test_class_orientation: fixture Mock con chatgpt_model/personal_target = None (i Mock truthy rompevano _effective_model_name).
- test_forum_privacy: insieme raggiungibile aggiornato ai consumatori reali + lista chiusa di consumatori vietati (chat, AI, RAG, PDF, survey, forum).
- test_practice_notebooks: id del notebook letto prima di chiudere la sessione (DetachedInstanceError).

## Verifiche
3 file di test: 58 passed, ratchet 0 inattesi. Postgres di test rimosso.

## Prossimi passi
Merge utente. Nessun deploy necessario (solo test).

## Blocchi e rischi
Nessuno; nessun bug reale trovato.
