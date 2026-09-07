# Ciclo di vita delle domande del counselor: decadute, risposte nel discorso, rimaste indietro

Data: 2026-09-07
Branch: `feature/question-lifecycle`
Parenti stretti: `session_ledger.py` (registro della sessione), `thread_guard.py`
(giudice del turno), `recommendation_blocks.py` (blocco note del counselor)

## Problema

Il counselor fa domande. Molte non trovano risposta subito, e poche righe dopo
non ce l'hanno più: erano domande di quella fase, e la conversazione è andata
altrove.

> «Quando un risultato ti delude, prevale la lettura di ciò che avresti potuto
> fare o quella di ciò che non dipendeva da te?»

Chiesta durante i fattori affettivi e lasciata cadere, quella domanda oggi
sparisce senza che nulla dica perché. Tre destini diversi finiscono nello stesso
silenzio:

1. **decaduta** — lo step è cambiato, la domanda apparteneva a quello di prima;
2. **rimasta senza risposta** — lo studente non l'ha mai raccolta;
3. **risposta implicitamente** — nel discorso lo studente ha detto la cosa, senza
   rispondere alla domanda in quanto domanda.

Oggi il sistema non distingue. `session_ledger._open_question` legge con una
regex l'ultima domanda della risposta e la considera «risposta» appena lo
studente scrive qualcosa — qualunque cosa — oppure la lascia cadere dopo due
turni, in silenzio ([`session_ledger.py:231`](../../../backend/session_ledger.py)).
Nella sidebar la domanda resta «aperta» finché lo studente non la chiude a mano,
e nessuno chiude mai niente.

Le conseguenze sono due, opposte: il counselor ripropone domande che il discorso
ha superato, e perde risposte che lo studente ha già dato in altra forma.

## Che cosa esiste già

Il pezzo mancante è il verdetto sulla domanda, non l'infrastruttura.

| Pezzo | Dove | Che cosa fa oggi |
|---|---|---|
| Dichiarazione | `recommendation_blocks.notes_directive` | il counselor copia verbatim la propria domanda in `notes: [{kind:"question", text}]` |
| Registro | `RecommendationHistory` (`recommendation_type="advice"`) | riga per domanda, con `slug`, `name`, `turn_index`, `payload.status` |
| Stati | `recommendation_service.RECOMMENDATION_STATUSES` | `proposed` e `closed` sono gli unici ammessi per una domanda |
| Chiusura | `RecommendationsPanel.AdviceCard` | solo lo studente, a mano, dalla sidebar |
| Ledger | `session_ledger.build` | porta al modello **una** domanda aperta, letta per regex, per due turni |
| Giudice | `thread_guard.evaluate` | gira async ogni turno, giudica il counselor, non la domanda |

## Decisioni prese (2026-09-07)

| # | Decisione | Scelta |
|---|---|---|
| D1 | A chi serve il verdetto | allo studente (sidebar) **e** al modello (ledger) |
| D2 | Chi giudica | ibrido: regola deterministica per la decadenza, `thread_guard` per la risposta implicita |
| D3 | Domanda ancora viva | il counselor la riprende **una volta sola**, riformulata |
| D4 | Domanda risposta nel discorso | si chiude; il counselor la usa come cosa già detta, mai la richiede |
| D5 | Domanda decaduta | tace, ma resta riagganciabile **se è lo studente a tornarci** |
| D6 | Fase della domanda | si registra il numero dello step (`sort_order`), non l'etichetta |

Scartate lungo la strada: giudizio interamente a modello (paga una chiamata dove
la regola non sbaglia mai) e counselor che giudica le proprie domande (è la parte
che il `thread_guard` trova già oggi sbagliata più spesso).

## 1. Il registro

La nota `kind=question` guadagna tre campi nel payload, tutti scritti al momento
della registrazione da `_record_recommendations`, che il turno già conosce:

| campo | valore | a che serve |
|---|---|---|
| `step_id` | `request.phase` (es. `"affective"`) | confronto esatto per la regola di decadenza |
| `step_order` | `sort_order` della riga `guided_steps` (es. `2`) | dire di che fase è la domanda, con una cifra |
| `closed_by` | `"student"` o `"conversation"`, solo se `status == "closed"` | distinguere chi ha chiuso |
| `revived` | `true` quando lo studente riapre una domanda | sottrarla alla regola di decadenza |

Gli stati ammessi per una domanda passano da due a tre:

```
proposed                        aperta, nello step in cui è nata
closed  + closed_by=student     l'ha chiusa lo studente dalla sidebar
closed  + closed_by=conversation ha risposto nel discorso: l'ha chiusa il giudice
stale                           decaduta: lo step è cambiato, o è passato troppo tempo
```

`recommendation_service.set_status` oggi rifiuta per una domanda tutto ciò che
non è `proposed|closed` ([`recommendation_service.py:165`](../../../backend/recommendation_service.py)):
il vincolo si allarga a `stale`, e `closed_by` diventa un argomento accettato
accanto a `status`. `RECOMMENDATION_STATUSES` guadagna `stale`, che per una voce
di catalogo resta un valore che nessuno scrive.

## 2. La decadenza, deterministica

Nessuna chiamata a modello: la regola sa già tutto ciò che le serve.

Una domanda `proposed` diventa `stale` quando **almeno una** è vera:

- `step_id` della domanda diverso dallo step corrente;
- `turn_index` della domanda più vecchio di `QUESTION_MAX_AGE` turni (3) rispetto
  al turno corrente.

Il passaggio si calcola alla costruzione del ledger e **si scrive**: se restasse
un calcolo, la sidebar continuerebbe a mostrare «aperta» una domanda che il
modello ha già lasciato andare, ed è esattamente la doppia verità da togliere.
L'operazione è idempotente — una `stale` non torna `proposed` da sola — e una
domanda `closed` non decade mai: chiusa è chiusa.

Una domanda che lo studente ha riaperto dalla sidebar porta `revived: true` e la
regola la salta: sarebbe assurdo che il click di chi la vuole riprendere venisse
annullato alla prima costruzione del ledger, che è esattamente ciò che
succederebbe se la fase nel frattempo è cambiata. Resta viva finché è lui a
chiuderla, o finché il giudice non la trova risposta nel discorso.

Il valore attuale `OPEN_QUESTION_MAX_AGE = 2` regolava per quanti turni la
domanda arrivava al modello; diventa `QUESTION_MAX_AGE = 3` e regola quando
decade. La differenza è che ora la decadenza è un fatto registrato, non una
sparizione.

## 3. La risposta implicita, al giudice

`thread_guard` gira già a ogni turno, async, sul suo preset a temperatura zero,
e degrada al silenzio quando fallisce. Riceve una sezione in più e restituisce un
campo in più.

**Input** (`build_input`): dopo lo scambio, le domande aperte dello studente —
al più due, verbatim, numerate, con la fase da cui vengono:

```
OPEN QUESTIONS (asked earlier, still unanswered)
1. (step 2) "Quando un risultato ti delude, prevale la lettura di ciò che
   avresti potuto fare o quella di ciò che non dipendeva da te?"
```

**Output** (`Verdict`): un campo `answered: list[int]` — gli indici delle domande
a cui lo studente, in questo scambio, ha risposto **nella sostanza**, anche senza
rispondere alla domanda in quanto domanda. Lista vuota nel dubbio, come per il
resto del verdetto.

**Effetto** (`store`): quelle domande passano a `closed` con
`closed_by="conversation"`. Gli indici valgono solo dentro la stessa valutazione:
`evaluate` tiene gli slug che ha mostrato al giudice e traduce l'indice su
quelli, invece di rinumerare le domande aperte dopo il verdetto — fra la
costruzione dell'input e la scrittura passa una chiamata a un modello, e nel
frattempo la lista può essere cambiata. Vincoli:

- si chiudono solo domande già nel registro con `status == "proposed"` o `stale`
  (una `stale` risposta nel discorso è comunque risposta);
- non si chiude mai una domanda posta nel turno che si sta giudicando: la
  sezione la esclude a monte, perché lo studente non ha ancora avuto modo;
- il guardiano spento (`thread_guard.enabled` falso) non rompe niente: resta la
  decadenza, e nessuna domanda viene mai chiusa dalla conversazione.

Il prompt di sistema del giudice guadagna una riga per `answered`, nello stesso
registro delle altre: giudica solo da ciò che vede, nel dubbio non chiude.

## 4. Il ledger e ciò che arriva al modello

`_open_question` smette di leggere per regex la risposta e legge il registro.
Al posto di una riga sola, tre, ognuna con la sua regola scritta dove le altre
direttive del ledger già vivono:

```
DOMANDE APERTE (step corrente)
- "…?"  → riprendila una volta sola, riformulata; non ripeterla uguale.

RISPOSTE NEL DISCORSO
- "…?"  → l'ha già risposta parlando: usala come cosa detta, non richiederla.

RIMASTE INDIETRO (2)
- "…?"  → riagganciala solo se è lo studente a tornarci; non riproporla.
```

Il numero fra parentesi è `step_order`: dice al counselor che la domanda veniva
da un'altra fase, e che non è materiale dello step corrente.

Tetti: al più due domande per riga, `MAX_QUESTION_CHARS` invariato, e la regola
di taglio di `render` (le risposte più vecchie cadono per prime) resta l'ultima
parola sul budget del blocco.

La direttiva delle note dice ancora *«Never close a question yourself: the
student marks it closed or reopens it»*
([`recommendation_blocks.py:231`](../../../backend/recommendation_blocks.py)):
resta vera per il counselor, che non chiude niente. Cambia solo che, oltre allo
studente, ora chiude anche il giudice.

## 5. La sidebar

`AdviceCard` mostra oggi due stati. Ne mostra quattro, con il numero della fase
accanto:

| stato | etichetta (it) |
|---|---|
| `proposed` | Domanda aperta · 2 |
| `closed` + `student` | Domanda chiusa · 2 |
| `closed` + `conversation` | Risposta nel discorso · 2 |
| `stale` | Rimasta senza risposta · 2 |

Tre chiavi nuove in `i18n-recommendations.ts` per sei lingue
(`question.answeredInTalk`, `question.stale`, e il separatore della fase); il
numero è una cifra e non si traduce. Il bottone «riapri» resta e vale per tutti
gli stati diversi da `proposed`: riportare una domanda in vita è una facoltà
dello studente, qualunque sia stato il motivo della chiusura.

## 6. Test

Puri, senza rete, dove il modulo lo permette.

**`session_ledger`**
- una domanda di uno step diverso diventa `stale`;
- una domanda più vecchia di `QUESTION_MAX_AGE` diventa `stale`;
- una `closed` non decade;
- la transizione è idempotente e non riscrive righe già `stale`;
- `render` produce le tre righe con la regola giusta e il numero di fase.

**`thread_guard`**
- `parse` accetta un verdetto con `answered` e uno senza (retrocompatibile);
- `store` chiude solo domande esistenti, e mai quella posta nel turno giudicato;
- un indice fuori intervallo non chiude niente e non solleva;
- gli indici si risolvono sugli slug mostrati al giudice, non su una lista
  ricostruita dopo.

**`recommendation_service`**
- `stale` accettato per una domanda, rifiutato per una voce di catalogo;
- `closed_by` scritto solo con `closed`;
- una domanda `revived` non decade al cambio di fase.

**Frontend** (`recommendations.test.ts`)
- i quattro stati arrivano al pannello e producono l'etichetta giusta.

## 7. Ordine di lavoro

1. Registro e stati (`recommendation_service`, `_record_recommendations`) — nessun
   effetto visibile, ma tutto il resto ci si appoggia.
2. Decadenza deterministica nel ledger, con i suoi test: da sola già toglie il
   silenzio, e funziona anche a guardiano spento.
3. Le tre righe del ledger e le direttive.
4. `thread_guard`: sezione di input, campo `answered`, chiusure.
5. Sidebar e traduzioni.

Ogni passo è verificabile da solo; i primi tre non dipendono dal giudice.
