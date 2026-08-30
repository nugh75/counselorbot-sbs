# Diagrammi nella chat — design

Data: 2026-08-30
Branch: `feature/chat-diagrams`

## Problema

La chat spiega concetti, processi e relazioni solo a parole. Un ciclo
("compito difficile → ansia → rimando → meno tempo → compito più difficile") o
la struttura di un fattore si capiscono meglio visti. Serve che il modello possa
produrre un diagramma dentro la conversazione, con la grafica dell'app.

## Vincoli

- Quattro canali: chat guidata (QSA/ZTPI/…), assistente sito, bot Telegram,
  PDF esportati. Telegram e PDF non hanno un browser: il rendering deve stare
  sul server.
- Il PDF è generato con `fpdf2` → serve PNG oltre all'SVG.
- Backend `python:3.10-slim`; l'immagine deve restare leggera.
- La grafica deve usare i token esistenti del reskin "Strumento misurato"
  (petrol, ocra, radius 0.75rem, font Inter) — nessuna palette nuova.

## Approccio scelto

**Spec JSON neutro emesso dal modello + renderer Graphviz server-side.**

Scartati:
- *Mermaid client-side*: richiederebbe un secondo motore con Chromium headless
  (kroki o mermaid-cli) per Telegram e PDF → +400/600 MB di immagine e deriva
  visiva fra web e stampa.
- *Port di `fireworks-tech-graph` nel backend*: due prove minime one-shot sono
  fallite sulla validazione geometrica (`no collision-free label position`,
  `unresolved collinear overlap`). Quel generatore presuppone un agente che
  itera. Resta innestabile in seguito dietro lo stesso endpoint, perché il
  contratto verso il modello è di dati, non di sintassi di rendering.

## Contratto verso il modello

Il modello scrive nel testo un blocco recintato `diagram` con JSON:

```
{"type":"cycle","title":"Circolo dell'evitamento",
 "nodes":[{"id":"a","label":"Compito difficile"},
          {"id":"b","label":"Ansia","accent":true}],
 "edges":[{"from":"a","to":"b","label":"innesca"}]}
```

- `type` ∈ `flow | relation | cycle | hierarchy`
- `title` obbligatorio, ≤ 80 caratteri
- `nodes`: 2–8 elementi, `label` ≤ 40 caratteri, `accent` opzionale (max 1)
- `edges`: 1–12 elementi, `label` opzionale ≤ 24 caratteri
- label nella lingua dell'utente
- il diagramma accompagna la spiegazione, non la sostituisce

Il modello non produce mai sintassi di rendering: solo dati. Uno spec non
valido non rompe il messaggio, sparisce e resta il testo.

## Componenti

### 1. Skill `concept-diagram` (backend/skills_seed.py)

Riga nuova in `skills`: `slug: concept-diagram`, `slot: directive_tail`,
`routing: optional`, nessun handler, `conditions: {}`, `max_chars: 1200`,
agganciata con `step_id="*"` agli strumenti già serviti dal seed.
`instructions_i18n.en` contiene: quando un diagramma serve (più parti in
relazione, processo, ciclo, gerarchia; **mai** per riassumere prosa), il
contratto JSON, e l'obbligo di produrne uno se lo studente lo chiede
esplicitamente.

Nessun nuovo intento in `intents.py`: la richiesta esplicita è coperta dalle
istruzioni, e un intento `visualize` ruberebbe turni ad `advice`
("come posso fare uno schema?"). L'admin può comunque restringere la skill
con le condizioni esistenti dal pannello.

### 2. Renderer `backend/diagram_render.py`

Unico punto che conosce la grafica.

- valida lo spec (pydantic, limiti sopra) → `DiagramSpecError` se invalido;
- traduce in DOT applicando la palette:

  | elemento | light | dark |
  |---|---|---|
  | nodo fill / bordo / testo | `#e9f2f2` / `#69abad` / `#0e3539` | `#103f42` / `#3c8d90` / `#c8e0e1` |
  | nodo accento | `#faf1e3` / `#dca055` / `#5a3211` | `#6f3c13` / `#dca055` / `#f3dcbe` |
  | archi ed etichette | `#64748b` | `#94a3b8` |
  | sfondo PNG | `#ffffff` | `#1e293b` |

  forme `box` `style="rounded,filled"`, penwidth 1.2, font
  `Inter,DejaVu Sans,sans-serif`;
- motore per tipo: `flow`/`hierarchy` → `dot`, `cycle` → `circo`,
  `relation` → `neato` (`overlap=false`);
- `embed_title`: falso per l'SVG web (il titolo è nell'header HTML della card),
  vero per il PNG di Telegram e PDF;
- accessibilità: `role="img"`, `<title>`/`<desc>` nell'SVG;
- `describe(spec)` produce la descrizione testuale ("A innesca B; …") usata da
  screen reader, TTS ed export;
- esecuzione `dot` via subprocess con timeout 5 s; cache in memoria su
  hash(spec, tema, formato, embed_title).

Dockerfile backend: aggiungere `graphviz` all'`apt-get install` esistente e un
pacchetto font (`fonts-inter` se disponibile nella base, altrimenti
`fonts-dejavu-core`), necessario per rasterizzare il PNG.

### 3. Estrazione dei blocchi `backend/diagram_blocks.py`

- `extract(text) -> (testo_senza_blocchi, [spec])`
- `strip_for_speech(text)` → sostituisce il blocco con titolo + descrizione,
  usato dal TTS e da chi non può mostrare immagini.

### 4. Endpoint

- `POST /api/diagram/render` — body: spec + `theme` (`light|dark`) +
  `format` (`svg|png`); risposta immagine. Autenticazione uguale alle route di
  chat.
- `POST /api/diagram/from-message` — body: testo di un messaggio + lingua;
  chiede al modello **solo** lo spec JSON e lo rende. Serve al bottone
  "Visualizza come schema"; non modifica la conversazione.

Interruttore globale: chiave di configurazione `feature_diagrams`
(default acceso), letta come le altre da `_config_true`. Spenta: la skill non
viene iniettata e gli endpoint rispondono 404.

### 5. Frontend

- `src/lib/markdown-components.tsx`: la mappa oggi privata di
  `GuidedChatInterface` diventa condivisa fra chat guidata e `/assistente`
  (che oggi usa i default), con un handler `code` che intercetta
  `language-diagram`.
- `src/components/ui/DiagramBlock.tsx`: card `glass-panel` con header
  (icona + titolo + chip del tipo), SVG `max-w-full overflow-x-auto`, footer
  con espandi (modal con zoom), scarica PNG, descrizione testuale.
  Entrata con `animate-fade-in-up`.
- Streaming: finché il JSON non parsa (fence ancora aperto) si mostra uno
  skeleton, non un errore. La chiamata al renderer parte solo a blocco chiuso.
- Tema: il componente legge il tema corrente e chiede l'SVG con quella palette;
  al cambio tema rifà la richiesta.
- Bottone "Visualizza come schema" accanto al TTS sui messaggi assistente.
- Stringhe UI nelle 6 lingue previste da `npm run i18n:check`.

### 6. Telegram e PDF

- `backend/telegram_bot.py`: estrae i blocchi, invia il testo ripulito, poi una
  `send_photo` per diagramma con `caption` = titolo.
- Export PDF che includono testi di chat: il blocco diventa PNG inserito con
  `fpdf2.image()`; dove i messaggi non sono inclusi, il blocco è rimosso.
- TTS (`handlePlayTTS` e route `/tts`): il testo letto passa da
  `strip_for_speech`, altrimenti la voce recita il JSON.

## Verifiche

Backend (pytest):
- validazione spec: limiti nodi/archi/label, tipo sconosciuto, accent multiplo;
- generazione DOT: palette e motore corretti per tipo e tema;
- render SVG e PNG (skip se il binario `dot` manca);
- `extract` e `strip_for_speech` su testo con zero, uno e più blocchi;
- endpoint: auth, spec invalido → 422, feature spenta → 404.

Frontend: `npm run lint` (include `i18n:check`) e `npm run build`.

Docker: rebuild dell'immagine backend obbligatorio (Dockerfile modificato),
poi verifica stato container e log.

## Fuori perimetro

- Diagrammi quantitativi (grafici a barre, radar): già coperti da recharts/plotly.
- Editing del diagramma da parte dello studente.
- Persistenza di immagini: la fonte di verità resta il blocco nel messaggio.

## Revisione grafica (2026-08-30, seconda passata)

Alla prova sui disegni veri sono emersi tre difetti: `circo` e `neato` piazzano
l'etichetta a metà arco senza riservarle spazio (la linea taglia il testo, o il
testo finisce sul bordo di un nodo), ogni relazione aveva lo stesso tratto, e a
11/9 pt con nodi vicini le etichette si toccavano.

**Etichette leggibili.** L'etichetta di un arco è una label HTML con
`BGCOLOR` = superficie: una pastiglia opaca sotto il testo, che l'arco non
attraversa più. La superficie è la stessa del fondo della card e dello sfondo
del PNG (`#ffffff` / `#1e293b`), perciò la pastiglia resta invisibile.
`DiagramBlock` passa da `bg-slate-50/70` a `bg-white`: la vecchia classe con
opacità non era intercettata dalla remap dark di `globals.css`, e in tema scuro
la card restava chiara sotto un SVG scuro.

**Un tratto per significato.** Gli archi hanno un campo `kind`:

| kind | tratto | significato |
|---|---|---|
| `drives` (default) | linea piena, freccia | A produce B |
| `strengthens` | linea piena spessa, petrol fondo | A sostiene o potenzia B |
| `weakens` | tratteggio, punta a T | A ostacola o frena B |
| `feedback` | tratteggio fine, `constraint=false` | B ritorna su A e chiude l'anello |
| `link` | punteggiato, senza freccia | legame senza direzione |

Il default mantiene validi gli spec già prodotti. Il tratto non resta muto:
`describe()` traduce il tipo in parole per screen reader, TTS e PDF, la card
mostra la legenda a piè di disegno e il PNG (Telegram, export) la porta sotto il
titolo, con i glifi di `EDGE_GLYPH`. La legenda compare solo se i tipi usati
sono più d'uno.

**Respiro.** Testo 12/10 pt, `ranksep .75` e `nodesep .5` per `dot`,
`mindist 1.5` e archi curvi per `circo`, `sep +22` / `esep +10` / `len 1.9` per
`neato`, margini del nodo più larghi, a capo bilanciato (niente riga piena
seguita da una parola sola), bordo 2.0 sul nodo accentato.

**Migrazione.** `apply_diagram_edge_kinds_policy` (marker
`skills_diagram_edge_kinds_v1`) riscrive il contratto della skill
`concept-diagram` solo dove è ancora quello di serie, riconosciuto per hash: se
l'admin lo ha modificato, il suo testo resta.
