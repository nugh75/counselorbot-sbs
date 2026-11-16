# Handoff test/known-failures-block3-1006

## Stato
Completo, PR in apertura (issue #1006).

## Fatto
- Rimosse 22 voci da postgres_known_failures.txt (admin_sandbox, chat_preparation x2, lean_envelope, privacy_p6ac x2, single_question_prompts, 14 in test_smoke).
- Test riscritti sull'app attuale (parole del contratto, rebuild RAG asincrono, patch dell'indice RAG, token Idea, piano ragionamento, step Strategie/Domande).
- Causa comune di molti fallimenti smoke: test_smoke importato due volte (`tests.` e `backend.tests.`), alias in sys.modules.
- Restano 3 voci con bug reale registrato nel Diario: QPCC K1-K5 (a5cc0960), blocco [PLATFORM CAPABILITIES] mai aggiunto nell'intro (f3a1242a, 2 test).
- Bug sospetto registrato: migrazione dei prompt intro per frase non più usata.
- Le 2 voci di blocco 2 (inapp_administration, plan_questionnaire_chats) non toccate (PR #1014).

## Verifiche
7 file di test, ratchet 0 inattesi salvo test_an_older_stage (serve graphviz `dot`, assente su questo Mac; passa in CI). Python 3.12 in venv temporaneo.

## Prossimi passi
Merge utente; nessun deploy (solo test). Issue per i 2 bug confermati: le crea la sincronizzazione del Diario.

## Blocchi e rischi
Mac senza graphviz: test_an_older_stage non verificabile qui.
