# Iride: ragionamento nella risposta visibile

Verifica del 6 settembre 2026. Iride risolve il preset corrente in
`ollama / nemotron-cascade-2:latest`, con thinking abilitato.

Il modello può ripetere nel contenuto una coppia `**Ragione**` / `**Risposta**`
dopo aver già usato il canale thinking nativo. Il filtro precedente separava
soltanto i tag XML. Una prima prova reale ha inoltre riprodotto tag citati o
ripetuti che lasciavano frammenti del piano nel contenuto visibile.

- Per Ollama, la direttiva `[THINKING]` viene adattata al momento della chiamata:
  ragionamento nel canale nativo, sola risposta finale nel contenuto, senza
  richiedere una seconda serializzazione con tag. Il valore amministrativo nel
  database e le direttive per gli altri provider restano invariati.
- Il separatore riconosce anche una coppia Markdown iniziale Ragione,
  Ragionamento o Reasoning / Risposta, Answer o Response. Lo streaming trattiene
  il possibile preambolo fino al riconoscimento della risposta. Parole in prosa,
  esempi preceduti da altro testo e intestazioni senza coppia restano intatti.
- Le chiamate sincrone conservano insieme il ragionamento nativo e quello
  estratto. La risposta pulita prosegue verso chat e salvataggio ordinari.

Validazione: 16 test del separatore e del trasporto Ollama, 5 test dei profili
reasoning, 187 smoke test. Prove reali di benvenuto QSA con Iride, in streaming
e sincrone, hanno restituito risposte italiane senza i preamboli osservati.
I test deterministici verificano ogni punto di separazione tra due chunk e lo
stream carattere per carattere, inclusa l'assenza di esposizione transitoria.

La correzione riguarda le nuove generazioni: non riscrive messaggi già salvati.
Non è un classificatore semantico di qualsiasi possibile ragionamento libero;
il filtro Markdown richiede il formato esplicito descritto sopra.

## Risposte troncate e pulsante Continua

Il caso successivo si fermava a C6 senza mostrare Continua. Il limite visibile
poteva tagliare una risposta e inviare ugualmente `done: true`; inoltre i
trasporti Ollama e OpenAI compatibili ignoravano la terminazione `length`.

Le chat guidate ordinarie e la chat del sito ora terminano il segmento tagliato
con un evento SSE `done: true, incomplete: true`, contenente `response`,
`session_id` e `conversation_id`. Il client conserva quel testo e apre il
controllo Continua esistente. Il segmento non viene salvato come risposta
conclusa: il proseguimento usa `partial_response` e salva una sola risposta
ricomposta. La scelta Continua supera il limite di parole del segmento iniziale.
Il percorso IDEA mantiene il trattamento preesistente della patch strutturata.

Un `done_reason: length` Ollama o `finish_reason: length` OpenAI compatibile
genera invece un'interruzione recuperabile dopo aver trasmesso i frammenti già
ricevuti. Una chiusura normale `stop` resta un completamento ordinario.
Non si deduce l'incompletezza dalla sola punteggiatura della risposta.

Verifiche del seguito: 15 test backend di continuazione/terminazione, 6 test
del parser SSE e 10 test Playwright di recupero. I casi browser includono
`incomplete: true` a 390 e 1440 px, clic su Continua, secondo errore recuperabile
e un'unica risposta finale. Una chiamata reale a Nemotron con budget controllato
di 32 token ha trasmesso 64 caratteri visibili e segnalato correttamente il
limite. Build backend/frontend e 187 smoke test superati; lint senza errori
con quattro avvisi preesistenti in file estranei alla correzione.
