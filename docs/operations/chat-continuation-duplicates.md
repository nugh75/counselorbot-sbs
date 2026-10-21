# Ripresa delle risposte senza duplicazioni (#425)

## Caso identificato

Il 21 ottobre 2026 i log della sessione QSA
`2f9ee096-d425-4cfa-9a13-121df5750d6f` mostrano tre risposte duplicate
con OpenRouter, modello `mistralai/mistral-large-4-0`:

| Log | Ora UTC | Fase | Prefisso già visibile | Risposta salvata prima della correzione |
| --- | --- | --- | --- | --- |
| 1256 | 10:12:53 | cognitive | 2009 caratteri | 5937 caratteri |
| 1258 | 10:21:56 | affective | 1811 caratteri | 6136 caratteri |
| 1263 | 10:30:45 | sl-synthesis | 2031 caratteri | 5647 caratteri |

In tutti e tre i casi `details.envelope.full_message` contiene
`PARTIAL_ANSWER_JSON`, quindi si tratta di una continuazione automatica.
`requested_response_length=medium` e `effective_response_length=null`
confermano il passaggio dal turno iniziale alla ripresa senza limite di parole.
Il client riprende anche dopo `done` con `incomplete=true`, emesso quando il
server limita il testo alla lunghezza richiesta.

Il modello ha ricominciato dall'inizio, pur avendo ricevuto l'istruzione di
generare solo la parte mancante. Il server concatenava sempre
`partial_response + testo_generato`: la ripetizione entrava nello stream,
nel log e nella memoria. Nei primi due casi il nuovo testo cambia dopo
443 e 472 caratteri identici; nel terzo ripete tutto il prefisso. Eliminare
soltanto un prefisso ripetuto integralmente non risolverebbe i primi due casi.

## Comportamento

`backend.chat_continuation.merge_continuation` unisce una vera continuazione
al prefisso già visibile. Se il nuovo testo ricomincia con gli stessi primi
80 caratteri di un prefisso abbastanza lungo, sostituisce la risposta precedente
con quella rigenerata, anche se la formulazione successiva cambia.

Durante la verifica del prefisso e finché il testo rigenerato non raggiunge
quello precedente, lo stream mantiene il testo già visibile: il duplicato non
compare neppure per un istante. Alla chiusura può adottare una riscrittura
completa più breve. Un'eco senza alcun avanzamento restituisce un errore
recuperabile e non salva un turno riuscito.

La stessa funzione serve chat guidate/Bussola (`/chat/stream`), Assistente
(`/site-chat/stream`), chat OpenCode e ripristino della cronologia OpenCode.
Filtri dei blocchi privati, segnali di controllo e salvataggio lavorano sul
testo riunito. I log guidati registrano `continuation_prefix_chars`, anche
senza attivare la registrazione integrale dei prompt.

La guardia riguarda le continuazioni; non elimina frasi ripetute dai normali
turni. Somiglianze inferiori a 80 caratteri restano ambigue e non provocano
la sostituzione. Lo storico già salvato non viene riscritto automaticamente.

## Verifica

Test mirati, senza connessioni al database, dentro un container separato:

```sh
docker build -f backend/Dockerfile -t counselorbot-chat-repeat-test:425 .
docker run --rm \
  -e DATABASE_URL=postgresql://test:test@127.0.0.1:1/counselorbot_test \
  -e SESSION_MEMORY_DIR=/tmp/session-memory \
  -e RAG_INDEX_DIR=/tmp/rag-index \
  -e COUNSELOR_TRANSLATE_DISABLED=1 -e ADMIN_SYNC_DISABLED=1 \
  counselorbot-chat-repeat-test:425 \
  python -m pytest -q --disable-warnings \
    backend/tests/test_chat_continuation.py \
    backend/tests/test_chat_think_fallback.py \
    backend/tests/test_recommendation_blocks.py
```

Nel portabile la build usa
`--build-arg PYTHON_BASE_IMAGE=mirror.gcr.io/library/python:3.10-slim`.
La suite controlla chunk da 1, 17 e 4096 caratteri, ripartenze esatte e
riscritture, eco senza progresso, errori a metà ripresa, salvataggio singolo
di testo e candidato, segnali di controllo e cronologia OpenCode.
Esito: **99 test passati**, con avvisi di deprecazione già presenti.
Anche i **15 test** del lettore SSE passano:
`cd frontend && node --test --experimental-strip-types src/lib/chat-stream.test.ts`.

Verifica sui tre log reali in sola lettura: a ogni confine di chunk il testo
rimane il prefisso precedente oppure una sola versione della risposta nuova.
I risultati riuniti misurano rispettivamente 3928, 4325 e 3616 caratteri.
Nessun testo personale è stato esportato o reinviato al provider.

Prova live con dati inventati e lo stesso modello OpenRouter: streaming
di risposta ricominciata e richiesta di continuazione completati, senza
duplicazione del prefisso. Ollama non raggiungibile sull'installazione
portabile (`host.docker.internal:11434`, errore di connessione): nessuna
verifica live con un modello locale.

Per distribuire la correzione dopo il merge va ricostruito il solo backend.
La validazione usa un'immagine dedicata e non riavvia i servizi di produzione.
Non occorrono migrazioni, modifiche ai prompt DB o interventi sudo.
