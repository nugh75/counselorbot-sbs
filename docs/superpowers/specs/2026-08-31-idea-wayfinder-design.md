# Idea, seconda passata: diagnosi wayfinder e tipi di task

Data: 2026-08-31
Branch: `feature/idea-wayfinder`
Prima passata: `2026-08-30-messa-a-fuoco-idea-design.md`

## Problema

La prima passata fa crescere la mappa ma non la giudica mai. Un nodo entra e
resta lì: nessuno dice che quell'assunto non si appoggia a niente, che due
nodi fanno lo stesso lavoro, che un concetto è usato prima di essere spiegato.
La mappa mostra *cosa* è stato detto, non *cosa non regge* — che è la parte
per cui si apre uno strumento di messa a fuoco.

Secondo difetto: `research` faceva due lavori insieme. Diceva chi è la persona
(registro) e che lavoro sta facendo (sostanza). Sono assi diversi: un docente
che progetta un'unità didattica e uno che scrive un articolo hanno lo stesso
registro e due compiti che non si somigliano.

## Decisioni prese (2026-08-31)

| # | Decisione | Scelta |
|---|---|---|
| D5 | Assi di wayfinder da portare dentro | tutti e quattro: difetti, status, decisioni, registro diagnostico |
| D6 | Destinatari | tutte le varianti, con lessico diverso per registro |
| D7 | Famiglie di task | tutte e quattro, dieci task |
| D8 | Come si determina il task | lo chiede lo step 0, in linguaggio naturale |

## Asse 1 — lo status del concetto

Campo `status` sul nodo, dal vocabolario chiuso di wayfinder ridotto a quattro
gradini: `mentioned` → `defined` → `delimited` → `related`.

Scartati due gradini dell'originale: `operationally explained` è una sfumatura
di `defined` che serve alla prosa scientifica e non a una mappa; `unmotivated`
non è uno status ma un difetto, e vive nell'asse 2 come `orphaned`.

**Resa grafica: intensità del riempimento.** Un nodo appena nominato è pallido,
uno messo in relazione è pieno. Non serve leggere niente per vedere cosa è
ancora fumoso, ed è esattamente ciò che la persona deve vedere.

## Asse 2 — i difetti strutturali

Campo `flaw` sul nodo: `orphaned`, `unsupported`, `duplicate`, `overloaded`,
`premature`, oppure assente. Resa con bordo tratteggiato e nome del difetto
nella descrizione testuale.

`sequencing mismatch` non entra: una mappa radiale non ha ordine, il difetto
non è rappresentabile e fingerlo sarebbe peggio che ometterlo.

`missing bridge` non è un difetto di nodo ma di relazione, e diventa un tipo
di arco: **`unclear`**, puntinato pallido con pastiglia `?`. Riusa il
meccanismo degli archi invece di introdurre un terzo tipo di marcatore.

### Due difetti li calcola il server

- **`orphaned`**: nodo senza alcun cammino verso il nodo `idea` (grafo trattato
  come non orientato).
- **`unsupported`**: un nodo `idea` o `implication` senza nessuna `evidence`
  adiacente.

Sono topologia, non interpretazione. Calcolarli lato server li rende non
negoziabili: il modello non può convincersi che vada bene. Gli altri tre
richiedono di leggere il senso e restano marcati dal modello.

## Asse 3 — l'esito come decisioni

Ruolo nuovo **`decision`**: una scelta che solo la persona può fare, con una
conseguenza in entrambi i casi. Lo step di sintesi smette di chiedere *un
prossimo passo* e produce il minimo insieme di decisioni, che nel PDF
guadagnano una sezione propria.

Il criterio di chiusura prende una seconda riga: oltre ai ruoli obbligatori,
non devono restare difetti non affrontati.

## Asse 4 — il registro diagnostico

Il modello constata prima di chiedere: «questo assunto non si appoggia a
niente che tu abbia detto» → poi la domanda. L'ordine conta: la constatazione
dà alla domanda un motivo, e una domanda socratica senza motivo irrita.

## Il lessico, due registri

Al modello si parla sempre canonico (`mentioned`, `unsupported`, `premature`):
è un contratto unico, come le istruzioni delle skill. Alla persona no.

| canonico | registro ricerca | registro studente |
|---|---|---|
| `mentioned` | nominato | l'hai detto, non ancora spiegato |
| `defined` | definito | si capisce cos'è |
| `delimited` | delimitato | si capisce dove finisce |
| `related` | messo in relazione | si lega al resto |
| `orphaned` | nodo orfano | sta lì da solo, non si aggancia |
| `unsupported` | affermazione non sostenuta | non si appoggia a niente che hai detto |
| `duplicate` | funzione duplicata | questo lo hai già detto in altro modo |
| `overloaded` | unità sovraccarica | qui stai facendo due cose insieme |
| `premature` | concetto prematuro | lo usi prima di averlo spiegato |

Due registri × sei lingue, applicati a descrizione, legenda, pannello e PDF.
Il registro segue la variante: `research` → registro ricerca, le due varianti
studente → registro studente.

## I tipi di task

Organizzati per **cosa deve produrre il lavoro**, perché è questo a stabilire
quando l'idea è a fuoco.

| famiglia | task | ruoli obbligatori | difetto tipico |
|---|---|---|---|
| affermazione da difendere | `thesis-chapter`, `article`, `position` | `idea`, `evidence`, `alternative` | `unsupported` |
| domanda a cui rispondere | `research-question`, `systematic-review` | `idea`, `open-question`, `constraint` | `premature` |
| disegno da eseguire | `empirical-study`, `teaching-unit`, `intervention` | `idea`, `implication`, `constraint`, `step` | `overloaded` |
| scelta da fare | `study-path`, `personal-project` | `idea`, `alternative`, `decision` | `duplicate` |

Più `unknown`, finché lo step 0 non ha una risposta.

### Cosa cambia il task, e solo questo

1. **Quali ruoli sono obbligatori** perché l'idea si dica a fuoco. Oggi sono
   quattro fissi per tutti; diventano dipendenti dal task.
2. **Quale classe socratica pesa** in quale step: una revisione sistematica
   passa metà del tempo su assunti e vincoli, una tesi su evidenze e
   alternative.
3. **Che forma hanno le decisioni finali**: scope per la prima famiglia,
   metodo per la seconda, disegno per la terza, vita per la quarta.

Fuori da queste tre cose il task non cambia niente, altrimenti diventa una
tassonomia decorativa.

### La domanda pivot

Ogni task porta la domanda che manca sempre in quel genere di lavoro, e che lo
step pertinente deve fare almeno una volta:

| task | domanda |
|---|---|
| `thesis-chapter` | cosa devi convincere il lettore a credere? |
| `article` | cosa sa il campo che tu stai cambiando? |
| `position` | chi ha ragione se hai torto tu? |
| `research-question` | cosa vedresti, se fosse falsa? |
| `systematic-review` | cosa **non** entra, e perché? |
| `empirical-study` | rispetto a cosa? |
| `teaching-unit` | da cosa capisci che hanno imparato? |
| `intervention` | e se non cambia niente? |
| `study-path` | cosa perdi scegliendo bene? |
| `personal-project` | chi se ne accorge, se lo fai? |

### Dove vive il task

Colonna `task_type` su `IdeaMapRevision`: viaggia con le revisioni, quindi si
può correggere strada facendo senza riscrivere il passato. Il modello lo
dichiara nella patch (`"task": "research-question"`), il server lo valida
contro il vocabolario chiuso e lo scrive sulla revisione.

Lo **step 0 lo chiede** con una domanda in linguaggio naturale, non con dodici
pastiglie da scegliere prima di aver detto una parola. Chi non sa rispondere
resta su `unknown`, e il modello lo fissa più avanti quando è chiaro.

## Il percorso non e' una sequenza: e' un albero derivato

Un albero di step scritto a mano sarebbe finto: resterebbe una sequenza con
bivi decisi in anticipo. Se le ramificazioni nascono dal ragionamento,
l'albero si deriva, e la mappa ha gia' quello che serve per derivarlo: cosa le
manca per quel task, e quali difetti porta.

> Il prossimo step non e' il successivo. E' quello che ripara cio' che alla
> mappa manca.

Ruolo obbligatorio assente -> lo step che lo produce. Difetto presente -> lo
step che lo affronta. Gli otto step restano, ma come **repertorio**: nessun
ordine, nessun `sort_order` come cammino, nessun `[[AVANZA_STEP]]` per IDEA.
La navigazione passa dal client al server: `GET /idea/next-step` risponde
*quale step e perche'*.

### I task che escono dal ragionamento

Ruolo nuovo **`task`**: un pezzo di lavoro che emerge parlando e che va messo
a fuoco per conto suo. Porta il proprio `task_type`, quindi i propri ruoli
obbligatori e la propria domanda pivot. Ogni nodo `task` e' una radice locale
e apre un ramo.

"Tesi sulla dispersione" fa nascere parlando "vedere cosa esiste gia'"
(`systematic-review`) e "decidere come misuro" (`empirical-study`): due nodi
figli, due rami, due chiusure distinte. La mappa non e' piu' solo il prodotto:
e' la navigazione, e si clicca un nodo per farlo diventare il fuoco.

### Freni

1. **Profondita' massima 2**: idea -> task -> sotto-task. Piu' giu' non e'
   messa a fuoco, e' procrastinazione strutturata.
2. **Un ramo aperto alla volta**: gli altri restano visibili ma dormienti,
   altrimenti la conversazione si sfilaccia.
3. **Un task si chiude, non si abbandona** (vedi sotto).

## La chiusura di un task

Un task finisce quando il suo **obiettivo** e' raggiunto, non quando la
casella dei ruoli e' piena: i ruoli sono la traccia, non la meta.

### Chi dichiara finito

In tre tempi, perche' nessuno dei tre regge da solo: il server, che vede solo
la forma, chiuderebbe anche a vuoto; il modello, lasciato giudicare,
chiuderebbe per compiacenza; la persona, senza che nessuno glielo faccia
notare, non se ne accorge.

1. il **server rileva** che le condizioni osservabili ci sono;
2. il **modello espone il caso**, rileggendo cosa si e' stabilito;
3. la **persona conferma**.

Un task chiuso si puo' **riaprire** se emerge qualcosa che lo contraddice: la
ricerca non resta finita perche' e' stata dichiarata tale.

### Obiettivo per task

| task | obiettivo raggiunto quando | osservabile |
|---|---|---|
| `thesis-chapter` | sai cosa il capitolo deve stabilire | affermazione reggente in una frase, un'evidenza, un'alternativa considerata |
| `article` | il contributo e' dicibile in una frase che nomina cosa cambia nel campo | affermazione, evidenza, obiezione prevista |
| `position` | regge davanti alla contro-argomentazione piu' forte | affermazione, evidenza, il contro-argomento piu' forte nominato |
| `research-question` | la domanda e' falsificabile | domanda, cosa vedresti se fosse falsa, vincolo di fattibilita' |
| `systematic-review` | il confine del corpus e' deciso | domanda, criteri di inclusione ed esclusione, un caso limite deciso |
| `empirical-study` | sai cosa confronti con cosa e cosa conterebbe come smentita | confronto, misura, implicazione, vincolo |
| `teaching-unit` | sai da cosa capisci che hanno imparato | esito, destinatario, osservabile di apprendimento, vincolo di tempo |
| `intervention` | sai chi cambia, di quanto, in che tempo | destinatario, cambiamento atteso, vincolo, primo passo |
| `study-path` | la scelta e' fattibile e sai cosa rinunci | opzioni, criterio, decisione, cosa perdi |
| `personal-project` | c'e' un primo passo osservabile e sai chi se ne accorge | destinatario, cambiamento, passo |

### Cosa porta un nodo task

Due campi che i nodi concettuali non hanno: **`closed`** e **`conclusion`**
(una frase: cosa ha stabilito). Chiudere senza conclusione non lascia niente.
Sulla mappa un task chiuso si vede - anello pieno, conclusione sotto - e il
fuoco torna al padre.

L'**idea radice e' essa stessa un task**: si chiude quando il suo obiettivo e'
raggiunto e tutti i suoi rami aperti sono chiusi. La ricorsione termina da
se', senza una regola in piu'.

## Componenti

| # | Task | File |
|---|---|---|
| W1 | `status`, `flaw`, arco `unclear`, intensità e tratteggio nel renderer | `backend/diagram_render.py` |
| W2 | calcolo server di `orphaned` e `unsupported`; `task_type`; ruoli obbligatori per task | `backend/idea_map.py`, `backend/models.py` |
| W3 | lessico a due registri × sei lingue | `backend/idea_lexicon.py` (nuovo) |
| W4 | skill `idea-focus`: status, difetti, task, registro diagnostico | `backend/skills_seed.py` |
| W5 | prompt: 8 step + 3 varianti, codice **e** DB (append, mai overwrite) | `backend/prompt_config.py` |
| W6 | pannello: status, difetti, task corrente, decisioni | `frontend/src/components/qsa/IdeaMapPanel.tsx` |
| W7 | PDF: sezione decisioni, difetti nella descrizione | `backend/pdf_generator.py` |
| W8 | ruolo `task`, `closed`, `conclusion`, profondita', ramo aperto | `backend/idea_map.py` |
| W9 | `GET /idea/next-step`: quale step e perche' | `backend/routes/idea_map.py` |
| W10 | UI ad albero: mappa cliccabile al posto dello stepper, niente `[[AVANZA_STEP]]` | `frontend/src/components/qsa/` |
| W11 | test: difetti calcolati, ruoli per task, due registri, chiusura e riapertura | `backend/tests/` |

## Verifiche

Difetti calcolati su grafi costruiti a mano (orfano vero, orfano solo in
apparenza perché legato via terzo nodo, `idea` senza evidenza); ruoli
obbligatori che cambiano col task; lessico che cambia col registro e non con
la lingua sola; migrazione della colonna su DB esistente; conversazione vera a
sette turni per famiglia.

## Fuori perimetro

- `sequencing mismatch`: non rappresentabile su una mappa radiale.
- Task determinato automaticamente: lo chiede lo step 0 (D8).
- Risoluzione automatica dei difetti: il tool li nomina, la persona li risolve.
