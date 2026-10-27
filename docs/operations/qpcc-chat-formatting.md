# Formattazione delle risposte QPCC

## Causa e correzione

Il caso osservato contieneva una riga separatrice Markdown con oltre 53.000
trattini e un `</small>` finale: la tabella diventava testo ordinario molto largo.
Un blocco `json` con radice `recommendations` non veniva riconosciuto dal filtro
privato e finiva nella risposta visibile.

- `backend/chat_markdown.py` normalizza le sole righe separatrici delle tabelle
  e rimuove i tag di presentazione `small`, conservandone il testo. Codice
  recintato e inline, prosa, valori e allineamento delle colonne sono preservati.
- La normalizzazione precede la formattazione dei fattori nella chat in streaming
  e viene applicata anche al flusso sincrono. Le nuove risposte salvate non
  contengono la riga separatrice anomala.
- `recommendation_blocks.py` riconosce anche il JSON privato con radice
  `recommendations` e l'involucro `<recommendations>`. La selezione resta limitata
  al catalogo e le note devono essere presenti nel testo visibile. Gli esempi
  JSON pubblici mantengono il comportamento precedente.
- `frontend/src/lib/chat-markdown.ts` protegge anche i messaggi già salvati,
  prima del rendering e della lettura vocale. Non riscrive lo storico.
- Le bolle rispettano la larghezza della chat; lo scorrimento orizzontale è
  limitato alle singole tabelle. Le colonne restano raggiungibili su telefono.

Nessun punteggio, prompt salvato o contenuto personale viene modificato.
Nessuna migrazione e nessun cambio di provider o dipendenze.

## Verifica sintetica

- `backend/tests/test_chat_markdown.py`: riga di 53.776 trattini, codice pubblico,
  HTML di presentazione e metadati privati a ogni confine dello stream.
- `frontend/src/lib/chat-markdown.test.ts`: stesso contratto per rendering e voce.
- `frontend/tests/qpcc-chat-formatting.test.mjs`: storia congelata a
  390/1024/1440/2048 px e risposta in streaming; tutte le colonne raggiungibili,
  prosa contenuta e nessun metadato visibile. Nessuna API reale o chiamata LLM.

Per le fixture usare `scripts/dev-plan-questionnaire-tests.sh`, porta loopback
3159 e backend chiuso sulla porta 9. Il server serve solo alle prove automatiche.
La procedura e il tunnel sono in [live-dev-environment.md](live-dev-environment.md).
Il checkout della correzione è separato dal mount del backend portable.
