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
