# Il tavolo: prompt, generi di schema, icone — design

Data: 2026-09-11
Branch: `feature/tavolo-prompt-preset`
Segue: `2026-09-10-tavolo-design.md`

## Problema

Il tavolo si riempie a mano, un pezzo per volta, oppure con quattro intenti che
lavorano su quello che c'e' gia': `what-is-missing`, `organize`, `connect`,
`continue`. Nessuno dei quattro sa fare la cosa piu' ovvia, cioe' partire da
una frase — "fammi lo schema di come i fattori del QSA si influenzano" — e
mettere sul tavolo uno schema intero.

Il seme da testo esiste nel codice (`source_text` su `POST /tavolo`, prompt in
`_seed_request`) ma nessuna interfaccia lo manda: era il seme dalla chat, e la
chat non entra piu' nel tavolo.

Manca anche il genere dello schema. Un flusso di lavoro, una mappa causale e
una mappa argomentativa non sono lo stesso disegno con parole diverse: hanno
vocabolari e convenzioni distinti, e un modello che vede tutti e dodici i verbi
insieme li mescola. Chi fa questo mestiere lo sa da prima dei modelli: le mappe
mentali associano, le mappe concettuali etichettano gli archi, le mappe
argomentative guardano solo l'inferenza, i causal loop diagram guardano le
retroazioni. I generatori di diagrammi da testo lo trattano allo stesso modo:
prima si sceglie il tipo, poi si scrive il prompt.

E i pezzi non hanno icone. Il campo `icon` sul nodo del tavolo esiste dal primo
giorno, nessuno lo valida e nessuno lo disegna: i cento SVG in
`backend/diagram_icons/` oggi li vede solo Graphviz, server-side, per i
diagrammi in chat.

## Decisioni prese in fase di design

- **Il preset e' una grammatica, non un prompt precompilato.** Ogni genere
  porta i verbi ammessi, le forme tipiche, un frammento di prompt, due prompt
  d'esempio, un grafo d'esempio e un verso di layout. Il vocabolario si
  restringe *prima* della generazione: e' la stessa lezione delle quattro
  famiglie, dove il modello sbaglia meno quando ha meno da nominare.
- **Lo schema generato arriva tutto `pending`.** L'invariante del tavolo non si
  tocca: il modello propone, la persona accetta. Con "tieni tutto" e "scarta
  tutto" il costo e' un clic, e `POST /settle` accetta gia' batch fino a 64 id.
- **Le icone le mettono sia il modello sia la persona.** Il modello sceglie dal
  catalogo dei cento con lo stesso prompt dei diagrammi in chat, la persona
  cambia o toglie da un selettore.
- **Preset ed esempi in codice, JSON versionato.** Nessuna tabella, nessun
  pannello admin: il ritocco di un prompt costa un rebuild, che qui si fa
  comunque. Se un giorno servira' tararlo in produzione si aggiungera' una
  chiave `configs` allora.
- **Il genere scelto vive dentro il grafo**, cioe' nel JSON della revisione:
  niente colonna nuova, niente migrazione.

## La decisione della spec precedente che qui si rovescia

La spec del tavolo chiude gli intenti con una ragione esplicita: "elenco
chiuso: il tavolo e' suo, e un intento libero diventerebbe un secondo canale di
conversazione". Il prompt riapre quell'elenco, e va detto invece di essere
fatto in silenzio.

Resta delimitato in tre modi, e sono gli stessi tre che rendevano accettabile
il seme dalla chat:

1. Il testo della persona e' **materiale da leggere, mai un'istruzione** — la
   regola e' gia' scritta in `_seed_request` e il frammento di prompt del
   genere la ripete.
2. Il **genere restringe il vocabolario** prima che il modello parli: un prompt
   in un flusso di lavoro non puo' produrre `supports`.
3. L'esito e' **sempre una proposta tratteggiata**, non contenuto.

Il secondo canale di conversazione non nasce perche' il tavolo non risponde a
parole: risponde con pezzi da tenere o da scartare.

## I cinque generi

| id | verbi ammessi | forme | verso | convenzione propria |
|---|---|---|---|---|
| `workflow` | `then`, `blocks`, `if` | action, decision, outcome | `LR` | il tempo scorre in una direzione sola |
| `causal` | `causes`, `hinders`, `feeds-back` | concept, outcome | `TB` | polarita' e retroazione (vedi sotto) |
| `concept` | tutti e dodici | concept | `TB` | parola sull'arco obbligatoria |
| `argument` | `supports`, `contradicts`, `assumes`, `needs-evidence` | concept, outcome | `TB` | un solo accento: la tesi |
| `algorithm` | `then`, `if`, `blocks` | decision, action, outcome | `LR` | ogni bivio ha almeno due uscite |

La mappa a raggiera non c'e': un centro con rami `part-of` e' la mappa di Idea,
e un secondo posto per farla non aggiunge niente.

`concept` non restringe i verbi perche' la sua convenzione e' altrove:
l'etichetta sull'arco. Una mappa concettuale senza parole sugli archi e' una
mappa mentale disegnata male.

**La mappa causale e le convenzioni del causal loop diagram.** Le tre
obbligatorie ci sono gia': la polarita' positiva e' `causes` (le due grandezze
si muovono insieme), la negativa e' `hinders` (si muovono all'opposto), e
l'anello lo chiude `feeds-back`. Le altre due della letteratura — l'etichetta
`R`/`B` al centro dell'anello e il marcatore di ritardo sull'arco — **non
diventano vocabolario**: il frammento di prompt chiede invece di nominare
l'anello nella parola sull'arco che lo chiude, con un nome parlante
("scorciatoie da pressione", non "R1"). Due segni grafici nuovi per due
informazioni che una parola porta gia' non valgono il prezzo; se l'uso dira'
il contrario, si aggiungono allora.

**Il vocabolario resta uno.** La grammatica di un genere e' una restrizione, non
un dialetto: un tavolo generato come `workflow` e uno fatto a mano usano gli
stessi dodici verbi e le stesse quattro famiglie, e la restrizione vale solo
nel momento in cui il modello genera. Dopo, la persona collega quello che
vuole.

## I due sensi di "esempio"

Sono due cose diverse e vanno chiamate diversamente, perche' fanno gesti
diversi.

- **Prompt d'esempio**: due per genere, cliccabili, riempiono la casella e si
  modificano. Servono a far vedere *come si chiede*.
- **Grafo d'esempio**: uno per genere, si apre come tavolo gia' pieno. Arriva
  come contenuto `live` con `kind=seed`, non come proposta: e' materiale
  nostro, e non ha senso chiedere alla persona di accettare un esempio che ha
  aperto lei. Serve a far vedere *com'e' fatto* uno schema di quel genere.

Due grafi d'esempio sono quelli chiesti: un flusso di lavoro e i fattori del
QSA che si influenzano.

Italiano e inglese scritti a mano; le altre quattro lingue tradotte con lo
stesso script Ollama usato per le descrizioni dei counselor.

## Superficie

Una terna sola — chip del genere, casella, esempi — in tre posti:

- **Tavolo aperto**: blocco "componi" in cima al pannello, sopra i quattro
  intenti. Gli intenti restano dove sono e non cambiano: lavorano su quello che
  c'e', il prompt fa nascere.
- **Elenco dei tavoli** e **tab del profilo**: il bottone "nuovo" apre la terna
  in un dialogo, e il tavolo nasce con lo schema gia' proposto.

I chip sono sei: i cinque generi piu' "decidi tu", dove il modello sceglie il
genere e lo dichiara nella nota della proposta. Casella da 1200 caratteri.

Sotto la soglia desktop non cambia niente: il tavolo la' e' in lettura.

## Contratto

**`POST /api/tavolo/{id}/compose`** — `{preset, prompt, lang, counselor_id,
base_index}`. Scrive una revisione `kind=proposal` con tutti gli elementi
`pending`. Tetto **16 nodi e 24 archi**, con un tipo `TavoloComposition` suo:
`TavoloProposal` resta a `MAX_PROPOSED = 6`, perche' un intento che propone
sedici pezzi sarebbe un'altra cosa.

**`POST /api/tavolo`** prende `preset` accanto a `source_text`, che qui diventa
il prompt della persona. Nessun endpoint nuovo per creare: un tavolo nato da un
prompt e' un tavolo.

**`GET /api/tavolo/presets?lang=`** — i sei chip: id, verbi ammessi, forme,
verso del layout, i due prompt d'esempio nella lingua chiesta, la presenza del
grafo d'esempio. Label e descrizione dei chip **non** passano da qui: stanno in
`i18n-tavolo.ts` come tutte le altre parole dell'interfaccia. Dal server arriva
solo cio' che il server sa: la grammatica e i testi degli esempi.

**`GET /api/tavolo/presets/{id}/example`** — il grafo d'esempio, nella lingua
chiesta, pronto da passare a `POST /tavolo`.

**`GET /api/diagram-icons/{id}.svg`** — un'icona del catalogo. Allowlist sul
catalogo, cache lunga, `404` fuori elenco. Diventa l'unica fonte per la tela,
per la cattura PNG e per Graphviz.

Il genere scelto sta in `TavoloGraph.preset` (`str | None`, validato sui sei
id): dentro il JSON della revisione, quindi nessuna migrazione. La resa
testuale lo nomina, perche' un tavolo letto a voce senza il suo genere perde la
convenzione con cui va letto.

## Errori e ripieghi

- **Verbo fuori dalla grammatica del genere**: si scarta l'arco, non il grafo.
  Stessa regola dell'icona inventata e della forma inventata: un pezzo sbagliato
  non vale piu' del tavolo.
- **Zero elementi validi**: nessuna proposta, il tavolo non cambia, avviso
  discreto. Non e' un errore di sistema.
- **Preset sconosciuto**: `422`, come l'intento sconosciuto.
- **Modello assente o JSON invalido**: ripiego identico a oggi — preset del
  counselor, poi `diagram_preset_id`, una sola riparazione del JSON.
- **`base_index` non combaciante**: `409` e la scheda ricarica, come le altre
  scritture.
- **Icona fuori catalogo**: diventa `null` via `field_validator`, come un
  colore inventato.
- **`feature_tavolo` spento**: `404` su tutto, compreso `compose`. L'endpoint
  delle icone no: serve anche ai diagrammi in chat, che vivono senza il tavolo.

## Icone sui pezzi

| pezzo | come |
|---|---|
| validazione | `field_validator` su `icon` in `TavoloNode`: fuori catalogo, `null` |
| il modello | `ICON_SELECTION_PROMPT` riusato in `compose` e `suggest`; per i nodi-fattore `resolve_symbol` assegna server-side il simbolo fisso (QSA:A6 e simili), che e' quello che rende leggibile l'esempio QSA |
| la persona | selettore nel pannello del pezzo: griglia dei cento, ricerca su significato e label italiana, voce "nessuna icona" |
| resa sulla tela | `<img>` da 20px a sinistra della label; nel rombo sopra la label, che li' lo spazio orizzontale e' poco |
| cattura | `html-to-image` inlinea le immagini same-origin: il test browser verifica che l'icona sia nel PNG, non solo sullo schermo |

## Test

**Backend (pytest)**: verbo fuori grammatica scartato e resto tenuto; tetti 16
e 24; preset sconosciuto `422`; icona fuori catalogo a `null`; `preset` scritto
nel grafo e nominato nella resa; `base_index` vecchio `409`; modello morto
nessuna proposta; endpoint icone `200` sul catalogo e `404` fuori; ogni grafo
d'esempio valido contro la grammatica del proprio genere.

**Frontend (node)**: parse dell'elenco dei preset, verbi del genere, i due
prompt d'esempio che riempiono la casella.

**Browser (`npm run test:tavolo`)**: prompt, proposte tratteggiate, "tieni
tutto", pezzi `live`; icona visibile nella cattura.

## Non fatto

- Etichetta d'anello `R`/`B` e marcatore di ritardo del causal loop diagram.
- Preset creabili o modificabili dall'admin.
- Prompt del tavolo dentro la chat: l'ingresso resta l'area personale.
- Generi sulla mappa di Idea.
- Galleria di tavoli d'esempio da sfogliare: c'e' un grafo per genere, non una
  raccolta.
- L'icona dentro la resa a parole: e' scelta dal significato della label, e
  dirla a voce ripeterebbe la label. La resa nomina il genere, non le icone.
