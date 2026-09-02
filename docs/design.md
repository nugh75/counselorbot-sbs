# Identità grafica — CounselorBot

Questo file è la **fonte di verità dichiarata** dell'identità visiva. Il codice
resta la fonte di verità *eseguita*: quando i due divergono vince il codice, ma
la divergenza è un bug da chiudere, non una variante.

Dove vive davvero l'identità:

| Superficie | File |
| --- | --- |
| Token colore, tipografia, utility, dark mode | `frontend/src/app/globals.css` |
| Caricamento dei tre font | `frontend/src/app/layout.tsx` |
| Mark (bussola) | `frontend/src/components/ui/CompassMark.tsx` |
| Primitive UI | `frontend/src/components/ui/` |
| PDF dei risultati | `backend/pdf_generator.py` (costanti `APP_*`) |
| Diagrammi (SVG/PNG per web, Telegram, PDF) | `backend/diagram_render.py` (`PALETTE`) |
| Login e landing pre-accesso | repo `ai4educ-console`, `ai4auth/` (**fuori da questo repo**) |

---

## 1. La direzione: "Strumento misurato"

L'app misura: profili multi-asse, codici fattore, punteggi, zone forza/crescita.
L'identità prende da lì il suo registro — **strumento di misura**, non prodotto
consumer. Concretamente significa tre cose:

1. **Niente indigo di default.** Il viola-blu di Tailwind è la firma di
   "dashboard generata": il brand è un **petrol** (teal profondo) che sta per
   riflessione e distanza.
2. **Una sola nota calda.** L'**ocra** marca il movimento — inizio, progresso,
   conversazione in corso. Serve a distinguere *dove sei* da *dove sei stato*.
   Tutto il resto è petrol e neutro.
3. **Densità e quiete.** Base tipografica a 15px, angoli tondi ma non morbidi,
   ombre quasi assenti, nessuna animazione decorativa.

Il mark è una **bussola**, non un radar: il counseling orienta, non valuta. Ago
nord-est in ocra (la direzione *propria*, non il nord dato), coda in petrol.

---

## 2. Colore

### 2.1 Petrol — il brand

Non esiste un token `petrol-*`. La scala Tailwind `indigo-*` è **rimappata** in
`@theme` alla famiglia petrol: un solo punto di verità, zero modifiche ai
call-site, ogni `bg-indigo-600` esistente diventa petrol.

| Token | Hex | Uso |
| --- | --- | --- |
| `indigo-50` | `#e9f2f2` | fondo callout/badge tenui |
| `indigo-100` | `#c8e0e1` | fondo chip |
| `indigo-200` | `#a0cccd` | bordo hover card |
| `indigo-300` | `#69abad` | bordi, separatori accentati |
| `indigo-400` | `#3c8d90` | connettori, stati completati leggeri |
| `indigo-500` | `#1f7376` | icone |
| **`indigo-600`** | **`#155e63`** | **primario: CTA, link, step completato** |
| `indigo-700` | `#124e52` | hover del primario, testo accentato |
| `indigo-800` | `#103f42` | fondo scuro tenue (dark mode) |
| `indigo-900` | `#0e3539` | testo su fondo petrol chiaro |
| `indigo-950` | `#08262a` | — |

> **Regola.** Non si scrivono hex petrol a mano nei componenti. Se serve una
> tinta che non c'è, si aggiunge al token, non al call-site.

### 2.2 Ocra — il momento

| Token | Hex | Uso |
| --- | --- | --- |
| `ochre-300` | `#dca055` | accento nei diagrammi e nel PDF |
| `ochre-500` | `#c9711f` | pallino dello step attivo, ago della bussola |
| `ochre-700` | `#8f4c14` | etichetta dello step attivo |

> **Regola.** Ocra ≠ ambra. L'ambra è un **avviso** (`Callout variant="warning"`),
> l'ocra è **movimento**. Non si usa l'ocra per segnalare un problema, né l'ambra
> per marcare il passo corrente.

### 2.3 Neutro

`slate-*` è l'unica scala neutra. `gray-*`, `zinc-*`, `stone-*`, `neutral-*` non
si usano: oltre a essere una seconda voce, **il remap dark mode copre solo
slate**, quindi un `text-gray-300` resta illeggibile in tema scuro.

### 2.4 Ruoli semantici

Fissati in `components/ui/Callout.tsx` e validi ovunque:

| Ruolo | Famiglia | Bordo / fondo / testo |
| --- | --- | --- |
| info | `sky` | `sky-200` / `sky-50` / `sky-950` |
| warning | `amber` | `amber-300` (2px) / `amber-50` / `amber-950` |
| success | `emerald` | `emerald-200` / `emerald-50` / `emerald-950` |
| danger | `red` | `red-200` / `red-50` / `red-800` |

Le zone del profilo (`ProfileVisualization`) hanno una scala propria, perché non
sono stati dell'interfaccia ma **esiti di misura**: forza `#22c55e`, adeguato
`#eab308`, crescita `#ef4444` — e il verso si inverte sui fattori invertiti.

Fuori da queste liste (`teal`, `rose`, `purple`, `violet`, `blue`, `cyan`,
`orange`, `lime`, `fuchsia`, `pink`, `green`) ci sono tinte usate per
**distinguere strumenti e rami**, non per comunicare uno stato. Vanno bene dove
servono a separare oggetti pari-grado; non vanno bene come secondo vocabolario di
stato. `green` in particolare è un doppione di `emerald`: nel nuovo codice si usa
`emerald`.

### 2.5 Le variabili `--console-*`

Palette condivisa con ai4educ-console, così la topbar e il fondo pagina sono gli
stessi fra i due prodotti. `--console-primary` è **lo stesso petrol** di
`indigo-600`. Le usano `body`, l'header, l'anello di focus e le classi
`.console-*`.

---

## 3. Tipografia

Tre ruoli, caricati in `layout.tsx` con `next/font`:

| Ruolo | Font | Dove |
| --- | --- | --- |
| corpo | **Inter** (`font-sans`) | tutto il testo |
| display | **Bricolage Grotesque** (`font-display`) | wordmark, titoli `h1.text-2xl`/`text-3xl`, `tracking -0.02em` |
| mono | **IBM Plex Mono** (`font-mono`) | codici fattore, punteggi, link, numeri |

`html { font-size: 15px }` — scala -1 rispetto al default. Tutte le utility
`text-*` si rimpiccioliscono in proporzione: l'interfaccia è densa per scelta.

La display face si applica **da CSS sui selettori**, non classe per classe: un
`h1.text-2xl` la riceve senza che il call-site sappia nulla. `PageHeader` fissa
il titolo di pagina a `text-2xl font-bold`; non si inventano altre scale.

---

## 4. Forma, spazio, movimento

- **Raggio**: `--radius: 0.75rem`. Le card usano `rounded-xl` cotto dentro
  `glass-panel`; i controlli `rounded-md`.
- **Card**: utility `glass-panel` (bianco, bordo `slate-200`, ombra minima) +
  `glass-panel-hover` per le card cliccabili. 91 call-site: è il contenitore.
- **Larghezza**: due soli token. `page-narrow` (max-w-4xl) per lettura e form;
  `page-wide` (max-w-6xl) per chat, dashboard, admin.
- **Altezza chat**: `--chat-h` / `h-chat` / `min-h-chat`, basate su `svh`/`dvh`
  con `safe-area-inset`: le superfici di chat non saltano su mobile.
- **Focus**: anello `2px` petrol con `outline-offset: 2px` su tutti gli
  interattivi, via `:focus-visible`. Non si rimuove.
- **Target tattili**: `console-topbar-icon--lg` = 44px per il menu mobile.
- **Movimento**: solo `fade-in-up` all'ingresso e la barra indeterminata di
  attesa. `prefers-reduced-motion` azzera tutto — vale anche per l'ago della
  bussola, che controlla `useReducedMotion`.

---

## 5. Componenti

Le primitive in `components/ui/` sono la forma canonica. **L'adozione è
incrementale e oggi parziale**: convivono con classi inline equivalenti scritte a
mano. Regola per il nuovo codice: *si usa la primitiva*; se manca una variante, si
aggiunge alla primitiva.

| Primitiva | Cosa fissa |
| --- | --- |
| `Button` | 5 varianti (primary/secondary/ghost/danger/success) × 3 taglie |
| `Card` | `glass-panel p-6` |
| `Callout` | i 4 ruoli semantici, con icona di default |
| `PageHeader` | titolo + sottotitolo + un solo pattern di back-nav |
| `FlowStepper` | il passo attivo è ocra, i fatti sono petrol, i futuri slate |
| `Toast`, `Tooltip`, `Skeleton`, `StickyActions` | stati transitori |
| `CompassMark` | il mark, statico nell'header e animato nell'intro |

---

## 6. Dark mode

Il tema scuro **non** si scrive con `dark:` sui call-site. È un remap
centralizzato in fondo a `globals.css`: `.dark .bg-white`, `.dark .text-slate-700`,
`.dark .bg-indigo-50`… La specificità `.dark .x` (0,2,0) batte l'utility singola
(0,1,0), quindi niente `!important`.

Palette scura: base `#0f172a`, superficie `#1e293b`, riempimento `#334155`.

> **Regola d'oro.** Una utility di colore usata in un componente deve esistere
> nel blocco `.dark`. Una tinta nuova (o una famiglia fuori lista, o un hex
> letterale) non ha remap e resterà chiara su fondo scuro. È il modo più comune
> di rompere il tema scuro in questo progetto.

---

## 7. Superfici oltre l'app web

**PDF dei risultati** (`backend/pdf_generator.py`): costanti `APP_*` allineate ai
token web (`APP_PRIMARY = (21, 94, 99)` = `#155e63`, `APP_ACCENT` = ocra). Usa
Inter quando i font di sistema ci sono, con fallback Helvetica via alias in
`set_font`. Il mark è ridisegnato in primitive fpdf, non è l'SVG.

**Diagrammi** (`backend/diagram_render.py`, `PALETTE`): sottoinsieme derivato, con
tema chiaro e scuro. Alcuni valori sono **fuori scala di proposito** (`#17747a`
icone, `#41707a` archi forti, `#9acbcd`/`#7fb3b6` in scuro, `#f0b060` per i
difetti) perché tarati sul contrasto dentro un SVG, dove il testo è piccolo e il
fondo è pieno. `DiagramBlock.tsx` ripete gli stessi hex lato client per far
combaciare la cornice con l'immagine: sono gli **unici** hex letterali ammessi nel
frontend, e vanno cambiati insieme ai due file.

**Fogli QR stampati** (pannelli admin piani di somministrazione e contatti di
ricerca): HTML generato inline per la stampa. Non riceve i token Tailwind, quindi
i colori sono scritti a mano — vanno tenuti allineati a mano.

**Login e landing pre-accesso**: vivono in `ai4educ-console/ai4auth`. Non sono
coperti da questi token: chi tocca l'identità qui deve ricordarsi che lo studente
vede *prima* quelle pagine.

---

## 8. Audit — 2026-09-02

### Corretto in questo passaggio

- `--primary` valeva ancora l'indigo di default (`243.4 75.4% 58.6%`) mentre
  `--color-primary` era già petrol: due primari nello stesso `:root`. Ora è il
  petrol in HSL.
- `--animate-fade-in-up` era definito due volte, e la definizione in `@theme`
  puntava a un `@keyframes fade-in-up` **inesistente** (quello vero si chiama
  `fadeInUp`). Rimossa la riga morta.
- `--destructive` non era mai definito, ma `SkillsPanel` usa `text-destructive`
  e `bg-destructive/10`: il banner d'errore era senza colore. Ora è definito,
  con override scuro.
- `--color-muted`, `--color-muted-foreground`, `--color-accent` non avevano
  override in `.dark`: `bg-muted` restava quasi bianco in tema scuro.
- `text-gray-*` in cinque punti (admin, SurveyViewer): fuori scala e senza remap
  scuro. Passati a `slate`.
- Fogli QR stampati e grafici delle survey usavano l'indigo vecchio
  (`#4338ca`, `#3730a3`, `#eef2ff`, `#c7d2fe`, `#4f46e5`, `#6366f1`): materiale
  a stampa fuori marchio. Passati ai valori petrol.

### Resta aperto

- **Adozione delle primitive**: `Button` è importato in 1 file, mentre
  `bg-indigo-600` compare 110 volte in classi scritte a mano, con altezze e pesi
  divergenti (`h-9` vs `py-2.5` vs `py-3`, `font-medium` vs `font-semibold`).
  È il disallineamento più visibile che rimane. Va chiuso a lotti, per area.
- **Doppio dialetto di token**: `SkillsPanel` parla shadcn (`bg-primary`,
  `bg-muted`, `text-destructive`), il resto dell'app parla utility Tailwind
  diretto. Va scelto uno dei due; il secondo è quello di fatto.
- **`green` vs `emerald`**: due famiglie per lo stesso ruolo, ~85 e ~75 usi.
- **`text-gradient`**: utility definita e mai usata (gradiente indigo).
- **`ProfileVisualization` e `ScoreInputForm`** non usano ancora `font-mono` per
  punteggi e codici fattore, che è il punto in cui la scelta tipografica si
  vedrebbe di più.
- **ai4auth** non condivide i token: allineamento da fare nell'altro repo.
