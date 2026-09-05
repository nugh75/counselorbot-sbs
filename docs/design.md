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
| `ochre-500` | `#c9711f` | pallini e segni **senza testo sopra** (ago della bussola) |
| **`ochre-600`** | **`#b15f17`** | **riempimento delle CTA d'ingresso** (`Button variant="accent"`) |
| `ochre-700` | `#8f4c14` | hover delle CTA, etichetta dello step attivo |

> **Regola.** Bianco su `ochre-500` misura 3.58:1 e non passa AA per il testo
> normale: l'ocra che porta testo è `ochre-600` (4.65:1). `ochre-500` resta la
> tinta dei segni senza testo.

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
Quelli sono i colori del **segno** (la tacca sulla barra). Il testo delle fasce e
del badge del punteggio passa dai token `--zone-*` in `globals.css`, con
override scuro: come hex inline restavano fuori dal remap e leggevano 2.5-3.7:1.
Ogni esito porta anche un **glifo** (▲ forza, ● adeguato, ▽ crescita) nella
barra, nel badge e nella legenda: il colore non è mai l'unico canale.

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

`html { font-size: 15px }` — scala -1 rispetto al default. Le bolle delle
conversazioni usano `text-base` (15px), mantenuto anche nel Markdown; il campo
di scrittura guidato usa 16px per facilitare la lettura su mobile. Tutte le utility
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
- **Altezza chat**: `--chat-h` / `h-chat` / `min-h-chat`, con fallback `svh`/`dvh`
  e `safe-area-inset`. Nel percorso guidato `ChatViewport` misura lo spazio sotto
  i comandi della pagina e segue il ridimensionamento del viewport visibile.
  I messaggi scorrono dentro la chat; scrittura e avanzamento restano raggiungibili.
  Sugli schermi mobili bassi la fase è indicata nella chat e la panoramica del
  percorso lascia spazio ai messaggi. In OpenCode, sotto 1280px, la conversazione
  precede il pannello dei punteggi, che resta disponibile scorrendo la pagina.
- **Focus**: anello `2px` petrol con `outline-offset: 2px` su tutti gli
  interattivi, via `:focus-visible`. Non si rimuove.
- **Target tattili**: menu compatto, categorie e azioni della home, BackButton
  e ForwardButton hanno almeno 44px effettivi: `h-11` con radice a 15px non basta.
- **Intestazione**: navigazione completa da `xl` (1280px); sotto questa soglia
  il menu raccoglie anche counselor, strumento e movimento. I nomi lunghi
  vengono troncati entro lo spazio disponibile.
- **Selezione strumento**: la barra con nome selezionato e Continua resta
  visibile sotto l’intestazione durante lo scorrimento.
- **Home di ritorno**: ripresa e catalogo completo precedono le attività
  secondarie; counselor e preferenze stanno in un pannello espandibile, che
  conserva anche l’accesso alla presentazione iniziale. La Bussola resta accanto
  al titolo del catalogo.
- **Movimento**: le variabili `--animate-*` vanno in `@theme`, non in `:root`
  — Tailwind v4 genera le utility `animate-*` solo da lì, e tenute in `:root`
  esistono le variabili ma non le classi. Solo `fade-in-up` all'ingresso e la barra indeterminata di
  attesa. `prefers-reduced-motion` azzera tutto — vale anche per l'ago della
  bussola, che controlla `useReducedMotion`. Per framer-motion la media query
  CSS non basta: `layout.tsx` avvolge l'albero in `MotionConfig
  reducedMotion="user"`.

---

## 5. Componenti

Le primitive in `components/ui/` sono la forma canonica. **L'adozione è
incrementale e oggi parziale**: convivono con classi inline equivalenti scritte a
mano. Regola per il nuovo codice: *si usa la primitiva*; se manca una variante, si
aggiunge alla primitiva.

| Primitiva | Cosa fissa |
| --- | --- |
| `Button` | 6 varianti (primary/**accent**/secondary/ghost/danger/success) × 3 taglie; `md` e `lg` partono da 44px |
| `Card` | `glass-panel p-6` |
| `ChatBubble`, `ChatPending` | la forma condivisa delle tre chat (guidata, Bussola, assistente) |
| `SkipLink` | primo elemento focalizzabile della pagina, verso `#contenuto` |
| `Callout` | i 4 ruoli semantici, con icona di default |
| `PageHeader` | titolo + sottotitolo + back-nav |
| `BackButton` | due varianti dichiarate: `icon` (cerchio, percorso guidato) e `labelled` (pillola con testo, pagine autonome) |
| `ForwardButton` | il primario del percorso: petrol pieno, etichetta visibile, 44px |
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

Due passaggi nello stesso giorno: il primo sui token, il secondo sull'uso.

### 8.1 Primo passaggio — igiene dei token

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
- Fogli QR stampati e grafici delle survey usavano l'indigo vecchio. Passati ai
  valori petrol.

### 8.2 Secondo passaggio — usabilità

Venti rilievi misurati sul codice e sul CSS compilato. Tutti chiusi tranne
quanto elencato in 8.3.

**Movimento morto.** Tolta la riga doppia, le tre `--animate-*` erano rimaste in
`:root`: le variabili esistevano, le utility no. `.animate-fade-in-up` e
`.animate-indeterminate` erano assenti dal bundle e i dieci call-site inerti — la
barra "preparazione PDF" era un blocco fermo a un terzo, che si legge come
progresso bloccato. Spostate in `@theme`. Rimosse `custom-scrollbar` (mai
definita), `text-gradient` (mai usata) e le classi `animate-in …` della chat, che
chiedevano un plugin non installato.

**Contrasto.** Ocra delle CTA 3.58 → 4.65. Badge del punteggio nel profilo
1.77-3.20 → 6.6-7.6. `text-slate-400` 2.56 → 4.76 su 312 usi (in tema scuro lo
stesso token stava già a 5.71: falliva solo il tema chiaro). `text-slate-300`
1.48 → 4.76 dove portava significato. Etichette di fascia 2.5-3.7 → 6.1-7.0 in
entrambi i temi.

**Accessibilità.** `aria-live` esisteva una volta sola in tutta l'app: chat
guidata e assistente ora hanno un `role="log"` con nome e una regione live che
porta due stati (attesa, risposta finita) invece di riannunciare a ogni token.
Etichetta sui pulsanti di invio. `role="alert"` dentro `Callout variant="danger"`.
`MotionConfig reducedMotion="user"` per framer-motion. Skip-link verso
`#contenuto`. Icone della topbar a 44px su puntatore grossolano.

**Modulo dei punteggi.** Etichette (erano venticinque campi anonimi), messaggi
d'errore con `aria-invalid`/`aria-describedby`, riepilogo `role="alert"`, fuoco
sul primo campo mancante. Il filtro da tastiera cedeva anche `Ctrl+V`: chi
copiava i punteggi dal PDF non poteva incollarli. `InputRow` estratto dal
componente, che lo ricreava a ogni render smontando tutti i campi.

**Gerarchia e coerenza.** `ForwardButton` era 36px e grigio accanto a un
`BackButton` di 48px: l'azione principale del percorso era più piccola e più
quieta di quella che torna indietro, e senza testo. Ora è il primario con
etichetta, entrambi a 44px. Back-nav ridotta a due varianti dichiarate. Tre
comandi finali stipati in `grid-cols-3` anche a 360px, con due primari
indistinguibili: ora impilano e uno solo è pieno. `FlowStepper` mostra il nome
della tappa corrente anche su mobile e porta `aria-current`. `metadata` non
parlava più solo del QSA.

### 8.3 Resta aperto

- **Adozione delle primitive**: fatto il percorso studente (home, flusso,
  Bussola) e le due primitive di navigazione. Restano ~107 `bg-indigo-600`
  scritti a mano in pannelli admin, pQBL e area personale. Da chiudere a lotti,
  per area, come questo.
- **Doppio dialetto di token**: `SkillsPanel` parla shadcn (`bg-primary`,
  `bg-muted`, `text-destructive`), il resto dell'app parla utility Tailwind
  diretto. Va scelto uno dei due; il secondo è quello di fatto.
- **`green` vs `emerald`**: due famiglie per lo stesso ruolo.
- **`ScoreInputForm`** usa `font-mono` per i codici fattore ma non per i
  punteggi; `ProfileVisualization` idem.
- **`PencilButton`** è rimasto a 36px, fuori dai 44px delle altre primitive
  circolari.
- **ai4auth** non condivide i token: allineamento da fare nell'altro repo.

---

## 9. Audit — 2026-09-02 (secondo giro, sui percorsi)

Il primo audit aveva chiuso token, contrasto e gerarchia. Questo guarda i
**percorsi**: dove si perde lavoro, dove un comando promette una cosa e ne fa
un'altra, dove l'app aspetta senza dirlo. Ventuno rilievi misurati sul codice
(non test con utenti), tutti chiusi tranne quanto elencato in 9.2.

**Lavoro perso.** La somministrazione teneva cento item in un solo `useState`,
senza bozza, senza guardia all'uscita: era l'unica superficie lunga senza rete,
mentre la chat guidata si congela da sola e pQBL tiene l'avanzamento. Il modulo
dei punteggi perdeva i suoi venticinque campi anche solo tornando indietro di un
passo, perché si smonta. Entrambe le bozze vivono ora in `lib/compilation-draft.ts`,
per strumento (e per lingua nella somministrazione: i numeri degli item non
significano nulla fra strumenti diversi), annunciate al ripristino invece che
applicate di nascosto. **Il consenso non entra mai in una bozza**: è un gesto,
non un dato, e ritrovarlo spuntato farebbe passare per acconsentito quel che
nessuno ha acconsentito in questa sessione.

**Cronologia.** I dodici passi del percorso guidato vivevano in `useState` senza
toccare `history`: Indietro del browser, e la gesture di ritorno che su Android è
la navigazione principale, uscivano dall'app. `lib/flow-history.ts` tiene il
cammino percorso con una profondità che le entrate di cronologia trasportano,
così indietro **e avanti** si muovono dentro il percorso. Ci passa anche il
BackButton sullo schermo, il che chiude di riflesso il ritorno che portava sempre
all'inserimento manuale anche a chi era arrivato da un PDF.

**Comandi che non mantengono.** "Scarica il resoconto PDF" costruiva un blob e lo
mostrava in un `iframe`: nessun file sul dispositivo, e su iOS un riquadro bianco.
Ora salva come già facevano area personale e libretto. Due invii — l'apertura
della chat e quello della somministrazione — non si bloccavano durante la
chiamata: un secondo click creava una seconda sessione e una seconda riga di
risultato, rumore nei dati di ricerca prima che nell'interfaccia.

**Attesa.** `OrientationGate` rimetteva `checking` a ogni cambio rotta e
interrogava `/orientation/status` senza cache, sostituendo la pagina con una
barretta: lo pagavano tutti a ogni click, anche chi non poteva esserne rimandato
indietro. Il cancello si risolve una volta per caricamento; un errore di rete
resta fail-open e si riprova al cambio rotta. `/auth/me` non era memoizzata e la
home ne aveva tre chiamanti insieme: ora una richiesta condivisa.

**Chat.** Tutte e tre aprivano un `AbortController` per ogni richiesta ma non lo
esponevano mai: nessun modo di fermare una risposta andata per il verso
sbagliato. Il primario diventa "ferma" mentre la richiesta è aperta, e il testo
già arrivato resta. La chat guidata disabilitava anche la casella per tutto lo
streaming, cioè proprio quando si formula la domanda dopo. La Bussola aveva
ancora `aria-live` sul contenitore — lo schema che l'audit precedente aveva
sostituito nelle altre due — l'errore in fondo alla pagina e un
`max-h-[34rem]` scritto a mano invece dei token di altezza (aggiunta
`max-h-chat` accanto a `h-chat` e `min-h-chat`).

**Tocco e nomi.** I pollici del riscontro erano bersagli da ~22px, sotto il
minimo di 24px, in tutte e tre le chat; allegato e congela stavano a 32px. La
classe `.tap-icon` applica la regola che la topbar già segue: disegno invariato,
44px al dito. Nell'assistente pollici e "?" avevano solo `title`.

**Testo e titoli.** `text-[10px]` in cinquantotto punti — valore assoluto, non
segue né il 15px di radice né il carattere scelto nel browser — diventa il
gradino `text-2xs` in rem. Solo il layout radice e `/guide` dichiaravano
`metadata`: venti rotte prendono il proprio titolo. La lingua del documento era
fissa a `it` fino all'idratazione e ora si applica nello script no-flash.

**Dialoghi nativi.** Libretto e portfolio chiedevano conferma con `window.confirm`
e il caricamento PDF segnalava l'errore con `alert()`: finestre che non seguono
il tema scuro, non traducono i propri pulsanti e bloccano. Nuova primitiva
`ConfirmInline`; l'errore del caricamento resta nella pagina.

**Colore.** L'avanzamento di Savickas era `bg-green-600` dove ogni altro
strumento usa petrol, e "ripeti il passo" era `bg-amber-600`, che il sistema
riserva agli avvisi.

### 9.1 Falso positivo, per memoria

Il primo elenco segnalava una chiave spagnola mancante
(`assistant.welcome.studente`). Non manca: è a `i18n.ts:2211`, senza
indentazione, e la regex dell'analisi l'aveva saltata. `npm run i18n:check`
esiste già e passa su tutte e sei le lingue — è il controllo di parità da
credere, non un'ispezione a mano.

### 9.2 Resta aperto

- Tutto quanto elencato in 8.3, che questo giro non ha toccato.
- **`text-[11px]`** in trentanove punti: stesso problema di `text-[10px]`, non
  convertito per non cambiare la misura visibile insieme al meccanismo.
- **Sottopagine dell'area personale**: hanno il titolo di scheda, non ancora una
  conferma di eliminazione uniforme — `profilo/page.tsx` tiene la propria,
  scritta a mano, accanto alla nuova `ConfirmInline`.
- **Doppio ingresso in cronologia**: il percorso guidato ora spinge le proprie
  entrate, ma rientrando in `/` da un'altra rotta il cammino riparte da zero e un
  Indietro più profondo non trova nulla da muovere. Degrada senza rompere.
