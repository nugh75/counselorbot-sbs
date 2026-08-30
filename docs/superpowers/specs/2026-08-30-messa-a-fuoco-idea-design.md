# Idea — strumento di messa a fuoco

Data: 2026-08-30
Branch: `feature/idea-focus`
Strumento: `IDEA` — nome visibile in tutte le lingue: Idea

## Problema

Gli strumenti attuali partono tutti da un materiale già dato: un questionario
compilato, un evento narrato, un profilo esistente. Manca il caso in cui lo
studente (o il docente) arriva con un'idea ancora informe — un progetto, una
scelta di indirizzo, una domanda di ricerca, un'unità didattica — e ha bisogno
non di una risposta, ma di vederla prendere forma.

La chat lineare schiaccia il pensiero non lineare: si esplora, si torna
indietro, si perde il filo. La ricerca sulle interfacce a canvas (Canvas Chat,
ThoughtDAG, CanvasConvo) indica il rimedio: la conversazione fa crescere **una
mappa unica e persistente**, che è l'artefatto vero della sessione.

## Vincoli

- Il motore diagrammi esiste già ed è quello giusto: spec JSON neutro +
  Graphviz server-side (vedi `2026-08-30-diagrammi-in-chat-design.md`). Mermaid
  e Markmap sono stati valutati e restano scartati: richiederebbero Chromium
  headless per Telegram e PDF.
- La skill `concept-diagram` oggi vieta esplicitamente al modello di usare il
  diagramma per riassumere prosa e gli impone di accompagnare, non sostituire,
  la spiegazione. Qui il rapporto si inverte: **la mappa è il prodotto**. Serve
  una skill distinta, non una modifica di quella.
- Il limite attuale di 8 nodi e 12 archi è tarato sul diagramma-illustrazione.
  Una mappa cumulativa lo supera per costruzione.
- Sei lingue, `npm run i18n:check`.
- Il backend è `python:3.10-slim` con `graphviz` già installato.

## Decisioni prese (2026-08-30)

| # | Decisione | Scelta |
|---|---|---|
| D1 | Dominio e destinatario | Tutte e tre le varianti, con persona diversa per tipologia di utente |
| D2 | Collocazione | Nuovo strumento a step liberi dentro la chat guidata |
| D3 | Comportamento della mappa | Mappa unica cumulativa e persistente |
| D4 | Esito di fine sessione | PDF con mappa e sintesi, voce nel portfolio, revisione del taccuino |

## Modello concettuale

Il difetto da evitare è una mappa di testo libero: bolle che dicono qualcosa ma
non fanno niente. Ogni nodo porta un **ruolo argomentativo** dal vocabolario
chiuso, ed è il ruolo a decidere icona e trattamento visivo:

| ruolo | icona | cosa contiene |
|---|---|---|
| `idea` | `idea` | l'idea centrale, in una frase. Unico nodo accentato |
| `assunto` | `brain` | ciò che si dà per scontato senza averlo verificato |
| `evidenza` | `check` | un fatto, un dato, un'esperienza a sostegno |
| `alternativa` | `compass` | un'altra lettura possibile della stessa cosa |
| `implicazione` | `target` | ciò che seguirebbe se l'idea reggesse |
| `domanda-aperta` | `question` | ciò che non si sa ancora, e che decide |
| `vincolo` | `shield` | un limite reale: tempo, risorse, regole |
| `passo` | `clock` | la prossima cosa concreta da fare |

I cinque tipi di arco esistenti (`drives`, `strengthens`, `weakens`,
`feedback`, `link`) bastano e non si toccano.

Il criterio di "a fuoco" diventa così verificabile e mostrabile allo studente:
c'è un nodo `idea`, almeno un `assunto` reso esplicito, almeno una
`domanda-aperta` e almeno un `passo`. Finché mancano, la sessione non è chiusa.

## Percorso: step liberi

Otto step DB-driven, ordinati ma **non vincolanti**: a differenza di SAVICKAS
non c'è `[[AVANZA_STEP]]` obbligatorio, lo studente può saltare e tornare. Le
sei classi centrali sono quelle di Paul-Elder, l'impianto socratico con la
maggiore evidenza di efficacia sull'impegno cognitivo.

| id | label | classe socratica |
|---|---|---|
| `idea-intro` | 0. Presentazione e patto | — |
| `idea-statement` | 1. L'idea in una frase | chiarimento |
| `idea-assumptions` | 2. Cosa sto dando per scontato | assunti |
| `idea-evidence` | 3. Su cosa mi baso | evidenze e ragionamento |
| `idea-alternatives` | 4. Come si potrebbe vedere diversamente | punti di vista alternativi |
| `idea-implications` | 5. Dove porta | implicazioni e conseguenze |
| `idea-question` | 6. È la domanda giusta? | mettere in discussione la domanda |
| `idea-synthesis` | 7. Mappa e prossimo passo | — |

Correttivo obbligatorio: la ricerca segnala che il socratico puro viene
percepito come meno utile e genera frustrazione. Il prompt di ogni step chiede
**una domanda alla volta** e, subito dopo la risposta, **restituisce la mappa
aggiornata**. La mappa è la ricompensa che il socratico da solo non dà.

### Le tre varianti (D1)

Un solo insieme di step, una direttiva di variante scelta all'avvio e ricordata
nella sessione. Tre chiavi di config editabili dall'admin:

- `prompt_idea_variant_student_path` — studente, idea di studio o carriera:
  può agganciare taccuino, profili, letture certificate;
- `prompt_idea_variant_student_open` — studente, idea qualunque: nessun
  aggancio agli strumenti, nessuna interpretazione psicologica;
- `prompt_idea_variant_research` — docente o ricercatore: disegno di ricerca,
  domanda di ricerca, unità didattica.

La variante di default segue il ruolo di `auth`; lo studente può scegliere fra
le due sue all'avvio.

## La mappa persistente

### Modello dati

`IdeaMapRevision`, append-only sul modello di `LearnerProfileRevision`: la
revisione più recente per `session_id` è la mappa corrente, le precedenti sono
lo storico del pensiero.

```
id, username, session_id, spec (JSON DiagramSpec), source, step_id,
created_at
```

`source` ∈ `turn | manual | synthesis`. Nessun `updated_at`: non si modifica
una revisione, se ne aggiunge un'altra.

### Come cresce: patch, non riscrittura

Il modello riceve la mappa corrente nel contesto ed emette una **patch**, non
la mappa intera. La riscrittura completa a ogni turno costa token e fa
derivare le etichette; la patch è deterministica e non può cancellare in
silenzio.

```
{"type":"idea-patch",
 "add_nodes":[{"id":"a3","label":"Non so se ho tempo","role":"vincolo"}],
 "add_edges":[{"from":"a3","to":"idea","kind":"weakens"}],
 "update":[{"id":"idea","label":"Fare la tesi sulla dispersione"}],
 "remove":["a1"]}
```

- `remove` solo se lo studente lo chiede: il prompt lo dice esplicitamente;
- il server applica la patch alla revisione corrente, valida il risultato con
  il renderer e scrive una revisione nuova;
- patch non valida: la mappa resta com'era e il testo del turno non si rompe,
  come già succede per uno spec malformato.

### Renderer (T1)

- `DIAGRAM_TYPES` guadagna `mindmap`; `engine_for` → `twopi` (radiale, il nodo
  accentato è la radice);
- limiti per tipo invece che globali: 8 nodi / 12 archi restano il default,
  `mindmap` sale a 24 nodi / 30 archi;
- `DiagramNode` guadagna `role: str | None` dal vocabolario chiuso sopra;
  assente resta valido, e quando c'è decide l'icona se `icon` non è dato. Gli
  spec già prodotti restano validi;
- `describe()` traduce il ruolo a parole, così la mappa resta leggibile da
  screen reader, TTS e PDF.

## Componenti

| # | Task | File | Dipende da |
|---|---|---|---|
| T1 | tipo `mindmap`, engine `twopi`, limiti per tipo, campo `role` | `backend/diagram_render.py`, `backend/tests/test_diagram_render.py` | — |
| T2 | `IdeaMapRevision`, applicazione della patch, API mappa | `backend/models.py`, `backend/idea_map.py`, `backend/routes/idea_map.py` | — |
| T3 | strumento, step, prompt, skill `idea-focus`, tre varianti | `backend/prompt_config.py`, `backend/skills_seed.py`, `backend/routes/survey.py` | T2 |
| T4 | frontend: strumento avviabile, canvas della mappa, i18n | `frontend/src/app/page.tsx`, `frontend/src/components/qsa/GuidedChatInterface.tsx`, `frontend/src/lib/i18n.ts` | T1, T2 |
| T5 | esiti: PDF, portfolio, taccuino | `backend/pdf_generator.py`, `backend/routes/` | T2 |
| T6 | verifica e rebuild | — | tutti |

### T3 — dettagli

- `IDEA` entra in `STUDENT_BOOKLET_TYPES` e in `STARTABLE_QUESTIONNAIRES`;
- `MODE_TO_SYSTEM_PROMPT_KEY` mappa i modi `idea-*` su `prompt_idea_focus`;
- niente `Instrument`/`Factor`/`QuestionnaireItem`: come SAVICKAS, nessun
  punteggio. Al posto di `scores_context` va una riga di contesto e la mappa
  corrente serializzata;
- skill nuova `idea-focus`, `slot: directive_tail`, `routing: always`,
  legata a `IDEA` con `step_id="*"`. Porta il contratto della patch e il
  vocabolario dei ruoli. La `concept-diagram` **non** viene modificata e non
  viene legata a `IDEA`: farebbero a pugni;
- prompt e default vanno scritti **in due posti**, come da CONTEXT: codice in
  `prompt_config.py` e riga DB, altrimenti l'istanza viva non cambia.

### T5 — dettagli

- PDF: riusa il percorso PNG già in `pdf_generator.py`; contiene mappa finale,
  sintesi, e le tappe della mappa se sono più d'una;
- portfolio: `PortfolioItem` con il PNG allegato (le immagini stanno già su
  disco) e categoria `idea`;
- taccuino: `LearnerProfileRevision` con `source="idea_focus"`, e solo per le
  due varianti studente. La variante ricerca non scrive nel taccuino.

## Interruttore

Config `feature_idea_focus`, **default spento** finché il percorso non è stato
provato su utenti veri. Spento: lo strumento non compare, gli endpoint della
mappa rispondono 404.

## Verifiche

Backend (pytest): limiti per tipo e `twopi` per `mindmap`; `role` sconosciuto
degradato come già l'icona; applicazione della patch (aggiunta, aggiornamento,
rimozione, arco verso nodo inesistente, patch che sfonda i limiti); append-only
delle revisioni; endpoint con feature spenta → 404; smoke sulle rotte nuove.

Frontend: `npm run lint` (include `i18n:check`) e `npm run build`.

Docker: rebuild backend e frontend, poi stato container e log.

## Fuori perimetro

- Canvas infinito con branching della conversazione (Canvas Chat, ThoughtDAG):
  qui la mappa è una, la chat resta lineare. Il modello dati append-only non lo
  preclude in seguito.
- Editing dei nodi da parte dello studente col mouse. In questa passata la
  mappa si cambia parlando.
- Telegram: lo strumento nasce sul web. La patch è già server-side, quindi
  l'estensione resta possibile senza rifare niente.

## Nome e collocazione (fissati 2026-08-30)

Lo strumento si chiama **Idea**, sia come codice (`IDEA`) sia verso l'utente.
Nessun secondo nome: la parola è già la cosa, e regge in tutte e sei le lingue
senza traduzione forzata. Voci nuove del glossario di `CONTEXT.md`:

| concetto | it | en | es | fr | de | sv |
|---|---|---|---|---|---|---|
| lo strumento | Idea | Idea | Idea | Idée | Idee | Idé |
| l'artefatto che produce | mappa | map | mapa | carte | Karte | karta |

- **Idea** = strumento a chat libera che mette a fuoco un'idea ancora informe.
  Non è un questionario e non produce punteggi.
- **mappa** = l'artefatto della sessione Idea (`IdeaMapRevision`), una sola per
  sessione, che cresce a ogni turno. Distinta da *profilo* (esiti), *taccuino*
  (auto-descrizione), *libretto* (riflessione per strumento) e *portfolio*
  (lavori). Una mappa finita può diventare una voce del portfolio.

Tutte e tre le varianti stanno **nella home degli strumenti**, non sotto
`/docente`: la variante ricerca si offre a chi ha il ruolo docente o
ricercatore, ma dalla stessa porta delle altre. `/docente` resta la dashboard
di classi e piani.
