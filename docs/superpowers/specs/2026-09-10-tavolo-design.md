# Il tavolo — design

Data: 2026-09-10
Branch: `feature/tavolo`

## Problema

I diagrammi di oggi sono illustrazioni: il modello li disegna, la persona li
guarda. Non c'e' nessun posto in cui la persona e il modello costruiscano
insieme una struttura e la tengano. La mappa di Idea ci si avvicina, ma e'
scritta solo dal modello e serve a un solo strumento.

Serve un tavolo di lavoro: un grafo che nasce dentro una discussione, che la
persona modifica con le mani, su cui il modello propone mosse che la persona
accetta o scarta, e che si puo' salvare e riprendere.

## Decisioni prese in fase di design

- **Terzo strumento indipendente.** Non sostituisce i diagrammi in chat ne' la
  mappa di Idea. Chat e Idea lo aprono, non lo contengono.
- **Persona e modello alla pari, ma il modello propone e la persona accetta.**
  Coerente con il perimetro della Bussola (informa e suggerisce, mai scrive) e
  con la regola del progetto: mostrare prima di applicare.
- **Il tavolo ha il suo modello e il suo endpoint**, non passa dall'envelope dei
  counselor. Il budget dei blocchi non regge un grafo intero a ogni turno, e
  questo progetto ha gia' visto un blocco sparire in silenzio per quel motivo.
- **Nasce nella discussione, si salva come entita' `tavolo`, si riprende.**
- **Uscita: immagine catturata dal browser al salvataggio**, piu' una resa
  testuale generata sul server.
- **Solo desktop.** Sotto la soglia il tavolo non si apre.

## Le connessioni

Il vocabolario e' la ragione dello strumento. Quattro famiglie messe su una
lista piatta farebbero tredici tipi e il modello sbaglierebbe: la lezione delle
quattro forme dei nodi (`2026-08-30-diagrammi-in-chat-design.md`) vale anche
qui. Due assi invece di una lista.

**Asse uno — che legame e'.** Un solo campo `rel`, un solo token che il modello
deve nominare. La famiglia non la dichiara nessuno: si deriva da `rel` sul
server, e serve alla grafica e al pannello, non al contratto.

| famiglia | rel | canale visivo |
|---|---|---|
| `argument` | `supports`, `contradicts`, `assumes`, `needs-evidence` | petrolio |
| `cause` | `causes`, `hinders`, `feeds-back` | grigio |
| `time` | `then`, `blocks`, `if` | ocra |
| `part` | `part-of`, `example-of` | grigio chiaro, senza punta |

Quattro colori si distinguono a colpo d'occhio, tredici no. La punta della
freccia e la parola sull'arco dicono quale `rel` dentro la famiglia. Chi
collega due nodi a mano sceglie prima la famiglia, quattro bottoni, poi il
verbo.

**Asse due — i modificatori.** Forza e incertezza non sono tipi di legame, sono
aggettivi di qualunque legame: `strength` (1–3) diventa lo spessore del tratto,
`hypothesis` lo tratteggia. Cosi' "a volte causa" e "sempre causa" sono lo
stesso `rel` con peso diverso, e non due voci di vocabolario. E' anche il
difetto dei cicli QSA di oggi, dove ogni freccia sembra una legge.

**I nodi** non hanno vocabolario nuovo: `form` (`concept`, `action`, `decision`,
`outcome`) e il catalogo di icone esistente, cosi' un tavolo e un diagramma in
chat si somigliano. Due campi tecnici in piu': `by` (`person` | `model`) e
`state` (`live` | `pending` | `dropped`).

**Eredita'.** Un tavolo che nasce da una mappa Idea o da un diagramma esistente
traduce `strengthens` → `supports`, `weakens` → `hinders`, `drives` →
`causes`, `feedback` → `feeds-back`, `link` → `part-of`. `link` diventa
appartenenza e non un legame generico perche' nella mappa di Idea e' il filo
dell'albero: li' un figlio e' un pezzo del ramo che lo tiene.

## Dati

Due tabelle, la seconda append-only come `idea_map_revisions`.

**`tavoli`** — l'entita' che si salva e si riprende.

| colonna | senso |
|---|---|
| `id` | uuid |
| `username` | proprietario, unico che legge e scrive (l'admin legge) |
| `title` | vuoto finche' e' bozza; il salvataggio lo chiede |
| `origin_session_id`, `origin_instrument` | da quale discussione e' nato |
| `saved_at` | vuoto = bozza legata alla sessione; valorizzato = riprendibile |
| `capture` | percorso del PNG catturato dal browser all'ultimo salvataggio |
| `rendition` | resa testuale dell'ultimo salvataggio |
| `created_at`, `updated_at` | |

**`tavolo_revisions`** — ogni mossa, append-only.

| colonna | senso |
|---|---|
| `tavolo_id`, `index` | l'indice cresce di uno, e serve al controllo di conflitto |
| `graph` | il grafo intero dopo la mossa (JSON) |
| `author` | `person` \| `model` |
| `kind` | `edit` \| `proposal` \| `accept` \| `reject` \| `seed` |
| `created_at` | |

Il grafo intero e non la patch: un tavolo sta sotto i 40 nodi, e rileggere una
revisione senza rigiocare la storia vale piu' dei byte risparmiati. Le patch
restano il modo in cui il *modello* parla, non il modo in cui si conserva.

**Le proposte non toccano il grafo vivo.** Una proposta e' una revisione
`kind=proposal` in cui i nuovi elementi hanno `state=pending`. Accettare scrive
una revisione `accept` che li porta a `live`; scartare scrive `reject` che li
porta a `dropped`. Il tavolo non cambia mai sotto le mani di chi lo guarda
senza che sia stato lui a dirlo.

## Superficie

Pagina dedicata `/tavolo/[id]`, a tutta finestra. Non un pannello dentro la
chat: li' ci sono gia' i messaggi, la mappa di Idea e l'albero dei rami, e un
canvas non ha spazio.

Si apre da due posti, e sono lo stesso posto visto due volte: **l'area
personale** e la **scheda "Tavolo" nella fila degli strumenti**, quella di
taccuino e libretto, che nella chat sta dietro il pannello degli strumenti.
Tutte e due mostrano l'elenco dei tavoli salvati e il bottone che ne apre uno
nuovo; il disegno si fa sempre nella pagina a tutta finestra. Il tavolo resta
uno strumento e non un gesto dentro la conversazione: dai messaggi e dal
workspace di Idea non si entra, e l'ingresso dalla chat e' la voce nella fila
degli strumenti, non un bottone su un messaggio. L'endpoint di creazione
accetta ancora i semi (testo di chat, mappa di Idea) ma nessuna interfaccia li
manda piu'. Con `feature_tavolo` spento la scheda non compare.

Sotto la soglia desktop il bottone non compare, e un tavolo salvato si mostra
come immagine catturata piu' la resa testuale.

Sulla tela il filo non parte da un aggancio fisso: parte dal bordo che guarda
l'altro pezzo, calcolato sulla forma (rettangolo, rombo, ellisse). Con due soli
agganci ogni filo usciva dal fondo ed entrava in cima, e oltre i tre o quattro
archi si accavallavano. Cosi' non c'e' niente in piu' da salvare, e i quattro
agganci per pezzo servono solo a far partire il trascinamento da qualunque
lato.

Il terzo modificatore e' `reciprocal`: una seconda punta all'altro capo, per
dire che il verbo si legge anche all'incontrario. Non e' un verbo nuovo, e
l'appartenenza non ce l'ha, perche' quella famiglia non disegna punte: un
contenuto non contiene chi lo contiene.

Due cose le scrive la persona e nessun altro. La parola sull'arco: se ne scrive
una sua prende il posto del verbo del vocabolario, e la resa a parole dice
quella. L'accento: un pezzo solo per tavolo, il punto, riempito di petrolio
perche' l'ocra qui vuol dire gia' "proposta". Il modello non lo mette mai, un
secondo accento e' un errore di contratto, e la resa a parole lo nomina.

## Le proposte del modello

`POST /api/tavolo/{id}/suggest` con un `intent` da un elenco chiuso:
`what-is-missing`, `organize`, `connect`, `continue`. Il modello riceve il grafo
serializzato compatto, il vocabolario e l'intento; risponde con una patch di
sole aggiunte, tetto di sei elementi per volta.

Ripiego identico a quello dei diagrammi: preset del tavolo, poi il preset di
riserva `diagram_preset_id`, un solo tentativo di riparazione del JSON. Nessuna
proposta valida significa nessuna proposta, non un tavolo rotto.

Le proposte non partono da sole a ogni gesto: solo quando la persona lo chiede,
o quando chiude un tratto di lavoro. Un tavolo che si riempie di fantasmi
mentre scrivi e' rumore.

Il counselor non vede il grafo, ma senza vederne niente non puo' parlarne: nel
suo envelope entra una riga sola quando un tavolo della sessione esiste
(titolo, quanti nodi, cosa manca), non la struttura.

## Uscita

Al salvataggio il browser cattura il viewport con `html-to-image` e lo carica
su `POST /api/tavolo/{id}/capture`. Legandola al salvataggio, la cattura non
invecchia: un tavolo cambia solo quando lo si salva.

Accanto all'immagine il server genera e conserva la resa testuale, nello stile
di `diagram_render.describe`: titolo, elenco dei nodi con la loro forma, elenco
delle connessioni con la loro convenzione. Serve a chi legge con lo schermo,
al TTS, alla ricerca dentro il PDF e a Telegram, che mostra l'ultima cattura e
non ne genera nessuna.

## Errori

- Modello assente, irraggiungibile o JSON invalido: nessuna proposta, il
  tavolo non cambia, avviso discreto.
- Cattura fallita: il tavolo si salva lo stesso, senza immagine; la resa
  testuale c'e' sempre, e la prossima cattura riprova.
- Due schede sullo stesso tavolo: ogni scrittura porta l'indice di revisione
  atteso, un indice non combaciante e' `409` e la scheda ricarica.
- Interruttore globale `feature_tavolo`, letto come le altre chiavi: spento,
  gli endpoint rispondono `404` e i bottoni spariscono.

## Verifiche

Backend (pytest): vocabolario (un `rel` sconosciuto e' rifiutato, la famiglia
si deriva), merge della patch, una proposta non entra mai nel grafo vivo senza
`accept`, `409` su revisione stale, proprieta' del tavolo, feature spenta →
`404`, resa testuale su grafo vuoto, con un nodo e con tutte le famiglie.

Frontend: traduzione mappa Idea → tavolo e serializzazione in test node;
`npm run lint` (include `i18n:check`, sei lingue) e `npm run build`.

Docker: nessuna dipendenza di sistema nuova, ma il backend cambia codice e
schema — rebuild dell'immagine e verifica dei log all'avvio per la creazione
delle tabelle.

## Stato

Fatto e verificato: il vocabolario e i due modificatori, l'entita' e le
revisioni append-only con il controllo di conflitto, le proposte con
accetta/scarta, la tela React Flow con le quattro forme e i quattro colori, gli archi che si
attaccano al bordo, la parola propria sull'arco, l'accento singolo, il
salvataggio con cattura e resa testuale, l'elenco dei tavoli salvati con il
bottone che ne apre uno nuovo nell'area personale e nella fila degli strumenti
della chat, l'interruttore della funzione nel pannello admin. Gli ingressi da un messaggio di chat e dal
pannello della mappa di Idea sono stati rimossi: il tavolo si apre solo
dall'area personale.

Non fatto, e da fare in un giro successivo:

- **la riga nell'envelope del counselor.** Il modello della chat non sa ancora
  che esiste un tavolo di quella sessione, quindi non puo' nominarlo.
- **PDF finale, taccuino e portfolio.** La cattura e la resa esistono e sono
  salvate; nessuno dei tre le legge ancora.
- **Telegram.** Non mostra l'ultima cattura.

## Fuori perimetro

- Tavoli condivisi fra piu' persone, e modifica in contemporanea.
- Il telefono.
- Sostituire i diagrammi in chat o la mappa di Idea.
- Disposizione automatica permanente: il seme si dispone una volta, poi le
  posizioni sono della persona.
