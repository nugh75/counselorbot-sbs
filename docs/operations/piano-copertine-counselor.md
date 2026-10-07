# Piano Architetturale ed Esecutivo: Copertine Rettangolari YouTube-Style per i Counselor e Copertura Totale Illustrazioni

## 1. Obiettivo e Visione

### 1.1 Richiesta dell'Utente
> *"per quanto riguarda i counselor in alcuni mancano le immagini adesso hai fatto per alcuni un piccolo tondino ma io vorrei una copertina stile youtube rettangolare prima della descrizione. Non tanto grande ma che rendesse l'idea del counselor"*

### 1.2 Diagnosi dello Stato Attuale
1. **Formato e posizionamento attuale (`CounselorSelector.tsx`)**:
   - L'illustrazione del counselor è attualmente mostrata come un piccolo avatar circolare (`h-11 w-11 rounded-full`, 44×44 px) collocato a sinistra del nome, comprimendo la testata orizzontale della card.
   - La card non offre una vera identità scenica: non c'è spazio per comunicare l'atmosfera, il mestiere, il contesto metaforico o lo stile del counselor prima che l'utente legga il testo.
2. **Copertura incompleta nel database**:
   - Nel database di produzione sono censiti **26 counselor**.
   - Solo **12 counselor** dispongono di un file SVG in `frontend/public/images/counselors/` (`marco`, `sara`, `luca`, `elena`, `davide`, `giulia`, `nadia`, `nora`, `iride`, `clio`, `bruno`, `minerva`).
   - Gli altri **14 counselor** (`giulio`, `bianca`, `erik`, `carmen`, `otto`, `teo`, `sonia`, `rocco`, `aidan`, `camille`, `luz`, `vera`, `omar`, `gemini`) non possiedono un asset grafico corrispondente: il browser genera un errore 404 e la gestione `onError` nasconde completamente l'immagine, lasciando le relative card prive di identità visiva.
3. **Formato grafico non conforme**:
   - I 12 SVG esistenti sono stati generati con `viewBox="0 0 100 100"` e una base circolare interna (`<circle cx="50" cy="50" r="48" ...>`), pensata esclusivamente per medaglioni circolari e non per copertine orizzontali.
4. **Assenza di fallback resiliente**:
   - Se un amministratore crea un nuovo counselor (es. personalizzato tramite personal API o console admin), l'assenza di un file statico produce un buco visivo.

### 1.3 Obiettivo della Soluzione
1. **Riprogettare le illustrazioni nel formato copertina YouTube compatta**:
   - Rapporto d'aspetto orizzontale 16:9 (`viewBox="0 0 320 180"`) o compatto 2:1.
   - Dimensioni controllate nella card UI: proporzione orizzontale con altezza contenuta (`h-24` / `h-28`, max 100-115px), per dare carattere senza allungare eccessivamente l'elenco dei counselor.
   - Posizionamento: collocata **subito prima della descrizione del counselor**, dopo la testata (nome, modello AI, tagline e badge di approccio).
2. **Copertura al 100% per tutti i 26 counselor**:
   - Rimodulazione rettangolare per i 12 counselor già illustrati.
   - Creazione ex novo di copertine rettangolari dedicate per tutti i 14 counselor mancanti, traducendo in grafica vettoriale i mondi metaforici definiti nei loro profili (es. la liutaia Bianca di Cremona, il falegname Erik in Dalarna, la ceramista Carmen di Triana, l'orologiaio Otto della Foresta Nera, l'allenatore di canottaggio Rocco, la psicologa Vera dei tratti temporali ZTPI, ecc.).
3. **Fallback procedurale deterministico**:
   - Componente dedicato `CounselorCover` con fallback dinamico SVG elegante basato su hash, colori di piattaforma e categoria di approccio per gestire counselor futuri o custom senza asset statici.

---

## 2. Specifiche di Design Visivo e Stile Copertina

### 2.1 Dimensioni e Layout Rettangolare YouTube-Style
- **Rapporto d'aspetto canonico**: `16:9` (standard thumbnail video / YouTube card).
- **Coordinate SVG standard**: `viewBox="0 0 320 180"`, responsive `width="100%" height="100%"`.
- **Dimensioni contenitore nel selettore**:
  - Nel layout a griglia/lista di `CounselorSelector.tsx`, la copertina occupa la larghezza utile della colonna con classi Tailwind:
    `w-full aspect-[16/9] max-h-28 overflow-hidden rounded-lg border border-slate-200/80 bg-slate-100 shadow-xs`.
  - In modalità compatta o mobile: `aspect-[16/9] max-h-24` per preservare una densità verticale confortevole.
- **Posizionamento nella card**:
  ```
  +-------------------------------------------------------+
  | [Nome Counselor]  [Badge Modello]  [Badge Origine]    |
  | "Tagline distintiva del counselor"                    |
  | [Badge Approccio: filosofo] [Badge Approccio: tutor]  |
  +-------------------------------------------------------+
  |                                                       |
  |     COPERTINA RETTANGOLARE STILE YOUTUBE (16:9)       |
  |     (Illustrazione vettoriale del mondo/mestiere)    |
  |                                                       |
  +-------------------------------------------------------+
  | Descrizione completa del counselor e del suo modo di  |
  | accompagnare lo studente...                           |
  |                                                       |
  | [Badge Strumenti: QSA, ZTPI, ...]                     |
  +-------------------------------------------------------+
  ```

### 2.2 Palette Cromatica della Piattaforma CounselorBot
Le copertine devono integrarsi armoniosamente con la palette Tailwind del sistema:
- **Tonalità primarie di sfondo**:
  - *Teal profondo* (`#042f2e`, `#0f766e`, `#115e59`, `#14b8a6`): colore identitario storico di CounselorBot, cannocchiali, mappe, orientamento.
  - *Indigo / Blu notte* (`#1e1b4b`, `#312e81`, `#4338ca`, `#6366f1`): pensiero riflessivo, università, ricerca, cielo notturno.
  - *Ardesia / Navy* (`#0f172a`, `#1e293b`, `#334155`, `#475569`): architettura, officina, rigore metodico, precisione.
- **Accenti di calore ed energia**:
  - *Ambra / Oro caldo* (`#f59e0b`, `#fbbf24`, `#fef3c7`): luce di fari, focolari, riparazioni kintsugi, pergamene, stelle guida.
  - *Arancio vivo / Terracotta* (`#f97316`, `#ea580c`, `#c2410c`): motivazione, ceramica andalusa, canottaggio, aghi bussola.
  - *Smeraldo / Menta* (`#059669`, `#10b981`, `#6ee7b7`): natura nordica, salvia mindfulness, freschezza pedagogica.
- **Gerarchia visiva orizzontale (composizione YouTube)**:
  - Lato sinistro o centrale: sfondo atmosferico, orizzonte o texture di contesto.
  - Lato focale (centro-destra o regola dei terzi): elemento iconico protagonista ben riconoscibile (es. liuto, fusto del faro, piccozza alpina, orologio a pendolo, cannocchiale).
  - Nessun testo rasterizzato o testo pesante all'interno dell'SVG: le informazioni testuali (nome, approccio) rimangono semantiche in HTML per accessibilità e internazionalizzazione.

---

## 3. Matrice Completa dei 26 Counselor e Concept Visivi

Ogni counselor ha un'identità e un mondo metaforico unici, documentati nel database e nei prompt. Di seguito il piano iconografico dettagliato per ciascuno:

| ID | Slug | Nome | Categorie Approccio | Mondo / Mestiere | Concept Copertina Rettangolare (16:9) | Palette Principale |
|---|---|---|---|---|---|---|
| **1** | `marco` | Marco | filosofo, maieutico, riflessivo, orientatore | Esploratore classico, cartografo delle idee | Cannocchiale telescopico in ottone su carte nautiche, meridiani curvilinei, fascio verso isola all'orizzonte e astro guida arancio. | Teal / Ardesia / Oro caldo |
| **2** | `sara` | Sara | psicologo, empatico, accogliente, orientatore | Maestra elementare, accoglienza rassicurante | Faro costiero illuminato su scogliera accogliente, fascio di luce calda su mare calmo, stella guida polare a 8 punte. | Teal notturno / Ocra / Ambra |
| **3** | `luca` | Luca | tutor, pragmatico, diretto, orientatore | Meccanico d'officina, concretezza e riparazioni | Banco da lavoro con lampada tecnica a braccio, chiavi inglesi ordinate, ingranaggi e calibro di precisione. | Ardesia / Blu officina / Ambra |
| **4** | `elena` | Elena | filosofo, maieutico, analitico, docente | Giornalista d'inchiesta, domande accurate | Scrivania di redazione con lampada ministeriale verde smeraldo, taccuino aperto con stilografica e rotativa di giornale. | Indigo scuro / Smeraldo / Ottone |
| **5** | `davide` | Davide | tutor, motivazionale, coach, orientatore | Guida alpina di cordata, sfide a tappe | Creste montuose all'alba con cordata stilizzata, piccozza e corda con moschettoni, vetta illuminata dal primo sole. | Notte alpina / Ghiaccio / Arancio alba |
| **6** | `giulia` | Giulia | docente, metodico, organizzativo, tutor | Architetta, fondamenta e progetti passo dopo passo | Tavolo da disegno con squadra, compasso, planimetrie isometriche e blocchi modulari che si incastrano con metodo. | Teal grafite / Ciano tecnico / Bianco |
| **7** | `nadia` | Nadia | orientatore, docente, equilibrato | Mediatrice di progetti, ascolto e armonia | Ponte ad arco sospeso tra due colline diverse, cerchi concentrici di convergenza equilibrata e bilancia armoniosa. | Teal equilibrato / Lavanda / Smeraldo |
| **8** | `nora` | Nora | orientatore, docente, sintetico | Sintesi essenziale, pensiero cartesiano | Orizzonte pulito a linee pure, prisma geometrico minimale, bussola essenziale senza fronzoli visivi. | Indigo ardesia / Turchese puro / Argento |
| **9** | `giulio` | Giulio | psicologo, orientatore | Counselor per percorsi complessi, pazienza | Dedalo/labirinto visto dall'alto che si trasforma in sentiero luminoso verso una radura aperta, clessidra e bussola d'oro. | Indigo cupo / Sabbia dorata / Teal |
| **14** | `iride` | Iride | tutor, sintetico, orientatore | Quadro d'insieme per studenti | Grande prisma di cristallo centrale che scompone una lama di luce bianca in fascio cromatico coordinato collegando idee sparse. | Indaco / Viola / Spettro cromatico |
| **15** | `clio` | Clio | docente, analitico, tutor | Spiegazioni dettagliate passo dopo passo per studenti | Filo d'Arianna dorato che attraversa una pergamena a tappe, lente d'ingrandimento su dettagli precisi con frecce ordinate. | Cobalto / Menta / Oro pergamena |
| **16** | `bruno` | Bruno | docente, ricercatore, teorico-pratico | Ponte ricerca-pratica per docenti | Ponte monumentale ad arcate che collega un'aula universitaria a un laboratorio sperimentale, grafici e libri aperti. | Ardesia accademica / Ocra / Rosso mattone |
| **17** | `minerva` | Minerva | ricercatore, docente, analitico | Rigore scientifico ed evidenze per docenti | Civetta stilizzata della sapienza che scruta scaffali di biblioteca scientifica, grafici di dati e costellazione astronomica. | Notte profonda / Oro antico / Perla |
| **18** | `bianca` | Bianca | psicologo | Liutaia di Cremona, cura e accordatura | Bottega di liuteria: sagoma di violino in lavorazione, riccio intagliato, trucioli d'acero/abete, pialla artigianale e onde armoniche. | Mogano caldo / Ambra / Teal tenue |
| **19** | `erik` | Erik | tutor | Falegname svedese in Dalarna, misura lagom | Bottega di intaglio nordico: pino silvestre, cavallino di Dalarna intagliato nel legno di betulla, lago montano e foreste sullo sfondo. | Verde pino nordico / Betulla chiara / Blu lago |
| **20** | `carmen` | Carmen | psicologo, docente | Ceramista di Triana (Siviglia), kintsugi | Vaso di ceramica artigianale con venature kintsugi in foglia d'oro lucente, azulejos geometrici andalusi e ritmo fluido. | Terracotta / Oro kintsugi / Cobalto sivigliano |
| **21** | `otto` | Otto | docente, metodico | Orologiaio della Foresta Nera, ingranaggi e tempo | Officina d'orologeria: ingranaggi in ottone, pendolo in movimento armonico, dettagli di legno d'abete e quadrante con cucù. | Marrone corteccia / Ottone lucido / Muschio |
| **22** | `teo` | Teo | psicologo, docente, tutor, metodico | Studente universitario peer, metodo pratico | Scrivania da studio moderna: laptop con sticker, tazza da caffè fumante, evidenziatori, taccuino e post-it organizzati. | Ardesia moderna / Arancio vivace / Giallo |
| **23** | `sonia` | Sonia | psicologo, docente, tutor | Insegnante di mindfulness e respiro | Spazio di quiete: cerchi concentrici nell'acqua che si distendono, campana tibetana stilizzata, fiore di loto e onde di respiro calmo. | Verde salvia / Lavanda / Blu nebbia |
| **24** | `rocco` | Rocco | tutor | Allenatore di canottaggio, ritmo di squadra | Barca a quattro con remi all'unisono che solcano l'acqua all'alba, scia dinamica simmetrica e cronometro sul pontile. | Blu marino / Ciano acqua / Corallo |
| **25** | `aidan` | Aidan | psicologo, docente, tutor | Cantastorie irlandese, racconti concreti | Scogliera atlantica con cottage costiero, camino acceso visibile dalla finestra, nodo celtico a trifoglio e mare aperto. | Smeraldo irlandese / Ambra fuoco / Granito |
| **26** | `camille` | Camille | orientatore | Bibliotecaria parigina, chiarezza cartesiana | Grande libreria parigina in rovere, lampada opalina verde su tavolino di lettura, tazzina da caffè e libri ordinati. | Verde biblioteca / Mogano / Ottone caldo |
| **27** | `luz` | Luz | psicologo, docente, orientatore | Madrilena dei mercati di quartiere, storie umane | Patio accogliente di Madrid con pergolato e piante in terracotta, tavolino con taccuino e calda luce dorata pomeridiana. | Ocra madrilena / Terracotta / Verde oliva |
| **28** | `vera` | Vera | psicologo, orientatore | Psicologa personalità e tempo ZTPI | Mappa delle tre dimensioni temporali (Passato, Presente, Futuro) a cerchi concentrici, costellazione psicologica e meridiani. | Indigo profondo / Magenta violaceo / Stelle oro |
| **29** | `omar` | Omar | psicologo, docente, tutor, orientatore | Cartografo di sintesi multidimensionale | Diagrammi di Venn multilivello, curve di livello topografiche isometriche, intersezione di bussole e orizzonte chiaro. | Teal profondo / Oltremare / Arancio coordinate |
| **30** | `gemini` | Gemini | orientatore | Orientamento digitale a doppia intelligenza | Doppia stella binaria luminosa in orbita sincronizzata, onde digitali convergenti in portale di conoscenza accogliente. | Indaco stellare / Ciano elettrico / Viola aurora |

---

## 4. Architettura Tecnica e Modifiche nel Codice

### 4.1 Gestione Asset Statici
- I file SVG risiedono in: `frontend/public/images/counselors/<slug>.svg`.
- Specifiche file:
  - Formato: SVG 1.1 puro, inline definitions (`<defs>`, gradienti con ID prefissati dallo slug, es. `#bg_bianca`, `#grad_erik` per evitare collisioni SVG nel DOM).
  - Dimensione massima: < 5 KB ciascuno (media ~3 KB).
  - Vettorialità pura: nessun elemento raster `<image xlink:href="...">`.
  - Attributi radice: `viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"`.

### 4.2 Componente `CounselorCoverImage` (Frontend)
Creazione di un componente dedicato in `frontend/src/components/questionnaire/CounselorCover.tsx`:
```tsx
interface CounselorCoverProps {
    src?: string | null;
    alt: string;
    counselor: PublicCounselor;
    className?: string;
    compact?: boolean;
}
```
**Comportamento del componente**:
1. Tenta il rendering dell'immagine all'URL `src` (default `/images/counselors/${slug}.svg`).
2. Se `src` è assente o scatena l'evento `onError` (file mancante o 404):
   - Non nasconde il contenitore.
   - Attiva il rendering del **fallback vettoriale generativo**.
3. **Fallback vettoriale dinamico**:
   - Genera un SVG procedurale con gradiente armonico calcolato dall'hash dello slug/nome del counselor.
   - Include un pattern geometrico di sfondo ispirato alla prima categoria di approccio (`filosofo` -> cerchi/meridiani, `psicologo` -> onde morbide, `tutor` -> frecce/vettori di progresso, `docente` -> blocchi e linee di struttura, `ricercatore` -> rete di nodi, `orientatore` -> stella polare).
   - Inserisce un monogramma tipografico centrale elegante e un badge d'approccio in basso a destra.

### 4.3 Aggiornamento di `CounselorSelector.tsx`
Nel file `frontend/src/components/questionnaire/CounselorSelector.tsx`:
1. **Card principale (`renderCard`)**:
   - Rimuovere il vecchio cerchio `h-11 w-11 rounded-full` accostato al nome (`div className="flex items-start gap-3"`).
   - Ristrutturare la testata: Nome del counselor, badge modello, badge provenienza e bottone di selezione/check disposti orizzontalmente con respiro.
   - Sotto la testata, mostrare la tagline e i tag delle categorie di approccio.
   - **Subito prima della descrizione (`c.description`)**, inserire il blocco copertina:
     ```tsx
     <div className="relative my-2.5 aspect-[16/9] w-full overflow-hidden rounded-lg border border-slate-200/80 bg-slate-100">
         <CounselorCover
             src={c.avatar_url}
             alt={c.name}
             counselor={c}
         />
     </div>
     ```
   - Sotto la copertina: paragrafo descrittivo (`c.description`) e badge degli strumenti abilitati (`questionnaire_types`).
2. **Scheda raccomandazione (`recommendation?.counselor`)**:
   - Sostituire l'avatar circolare `h-12 w-12 rounded-full` con una versione orizzontale compatta della copertina YouTube, preservando il layout con motivazione e badge di confidenza.

### 4.4 Allineamento Backend (`counselor_identity.py`)
Nel backend:
- `COUNSELOR_IDENTITY_DEFAULTS` in `backend/counselor_identity.py` attualmente contiene solo 14 counselor. Aggiungere le configurazioni canoniche per tutti i 14 counselor aggiuntivi (`giulio`, `bianca`, `erik`, `carmen`, `otto`, `teo`, `sonia`, `rocco`, `aidan`, `camille`, `luz`, `vera`, `omar`, `gemini`), completando:
  - `tagline_i18n` (italiano, inglese, spagnolo).
  - `approach_categories`.
  - `avatar_url: "/images/counselors/<slug>.svg"`.
- Nessuna migrazione database distruttiva necessaria: la colonna `avatar_url` esiste già e il backfill automatico all'avvio garantisce l'idempotenza.

---

## 5. Scomposizione Verticale in Compiti Atomici (Task per i Costruttori C)

La realizzazione è suddivisa in tre compiti verticali atomici, sequenziali e indipendentemente verificabili:

### Task C1: Asset Grafici Copertine SVG (26 Counselor YouTube-Style)
- **Ruolo costruttore**: C (Builder assets / design).
- **Scope**:
  1. Rimodulazione delle **12 copertine esistenti** in formato rettangolare 16:9 (`viewBox="0 0 320 180"`), eliminando il medaglione circolare e componendo una scena orizzontale panoramica ricca di atmosfera:
     - `marco.svg`, `sara.svg`, `luca.svg`, `elena.svg`, `davide.svg`, `giulia.svg`, `nadia.svg`, `nora.svg`, `iride.svg`, `clio.svg`, `bruno.svg`, `minerva.svg`.
  2. Creazione delle **14 nuove copertine rettangolari 16:9** per i counselor mancanti, rispettando fedelmente le metafore della Tabella Sezione 3:
     - `giulio.svg`, `bianca.svg`, `erik.svg`, `carmen.svg`, `otto.svg`, `teo.svg`, `sonia.svg`, `rocco.svg`, `aidan.svg`, `camille.svg`, `luz.svg`, `vera.svg`, `omar.svg`, `gemini.svg`.
  3. Estensione di `COUNSELOR_IDENTITY_DEFAULTS` in `backend/counselor_identity.py` per includere i 14 counselor con le rispettive tagline multilingue e categorie canoniche.
- **Criteri di successo e verifica**:
  - Tutti i 26 file SVG esistono in `frontend/public/images/counselors/`.
  - Ogni file SVG è valido XML, ha `viewBox="0 0 320 180"` e dimensione inferiore a 5 KB.
  - Test suite di backend `pytest backend/tests/test_counselor_identity.py` passa con esito positivo.

### Task C2: Componente UI `CounselorCover`, Modifica `CounselorSelector` e Fallback
- **Ruolo costruttore**: C (Builder frontend).
- **Scope**:
  1. Creazione di `frontend/src/components/questionnaire/CounselorCover.tsx`:
     - Gestione caricamento `<img>` con `onError`.
     - Generatore procedurale vettoriale di fallback con pattern basato su approccio e palette deterministica.
  2. Aggiornamento di `frontend/src/components/questionnaire/CounselorSelector.tsx`:
     - Eliminazione dell'avatar circolare `h-11 w-11 rounded-full` dal layout iniziale.
     - Posizionamento del blocco copertina rettangolare **prima della descrizione**, conforme alla richiesta dell'utente.
     - Aggiornamento della card raccomandazione con la copertina orizzontale.
     - Mantenimento intatto di tutte le logiche di selezione (single-click e double-click per avanzare), badge disabilitati e ordinamento locale/cloud.
- **Criteri di successo e verifica**:
  - `npm run build` o `npm run lint` nel frontend completano senza errori.
  - La card mostra la copertina rettangolare prima della descrizione.
  - Se un counselor ha un URL errato, il fallback visuale viene mostrato senza errori in console.

### Task C3: Test di Regressione, Integrità Asset e Validazione E2E / Browser
- **Ruolo costruttore**: C (Builder verification & tests).
- **Scope**:
  1. Aggiornamento di `frontend/src/lib/counselor-identity.test.ts`:
     - Test di verifica della presenza del blocco copertina prima della descrizione in `CounselorSelector.tsx`.
     - Test unitario di validità di tutti i 26 file SVG (controllo presenza file, viewBox 16:9, integrità tag SVG).
     - Test del componente fallback di copertina.
  2. Esecuzione dei test browser Playwright:
     - `node --test tests/account-onboarding.test.mjs` (verifica flusso di selezione counselor a 375px e 1280px).
  3. Screenshot di confronto visivo in dev mode (mobile 375px e desktop 1280px) per verificare l'armonia dell'aspetto visivo.
- **Criteri di successo e verifica**:
  - Tutti i test unitari frontend (`npm test`) e test backend (`pytest`) passano.
  - Nessuna regressione sui contratti di selezione o accessibilità.

---

## 6. Piano di Rilascio, Sicurezza e Considerazioni Operative

1. **Nessun cambio allo schema database**:
   - I campi `avatar_url`, `tagline_i18n` e `approach_categories` sono già presenti nella tabella `counselors`.
   - Nessuna migrazione SQL distruttiva; non sono richieste password sudo per il rilascio.
2. **Nessun impatto su sessioni di chat attive**:
   - I dati scambiati tra frontend e backend usano gli stessi endpoint (`/api/counselors`).
   - Gli avatar memorizzati rimangono puntatori stringa `/images/counselors/<slug>.svg`.
3. **Resilienza e performance**:
   - Essendo asset SVG statici compressi serviti da Next.js public directory, il carico di rete è trascurabile (< 100 KB totali per tutti i counselor).
   - Il rendering vettoriale garantisce nitidezza assoluta su schermi mobile, tablet e desktop 4K.

---

## 7. Prossimi Passi

1. Sottoporre a revisione questo piano tramite PR draft verso `main`.
2. Assegnare i task di costruzione ai builder C (C1: Asset copertine SVG; C2: UI CounselorSelector e fallback; C3: Test e validazione).
3. Revisionare l'aspetto visivo finale prima del merge.
