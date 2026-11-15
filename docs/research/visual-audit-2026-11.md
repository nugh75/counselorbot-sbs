# Audit visivo del frontend Counselorbot — coerenza con il look piatto

Data: 2026-11-15. Codice letto: `main` a `2d98e380`. Percorsi relativi a `frontend/src/`.

## Metodo e limiti

- **Solo lettura del codice.** Nessun dev server, browser, Docker o test. Ogni rilievo è verificato su `file:riga`, ma **nessuna pagina è stata vista renderizzata**: i rilievi su hover, tema scuro e 390 px sono dedotti da classi e token e vanno confermati a occhio prima della correzione.
- Riferimenti: `docs/design.md` (letto per intero), prototipo `origin/prototype/flat-areas`, audit UX `origin/research/ux-audit-2026-11`.
- I conteggi vengono da `grep` sui `.tsx` (test esclusi) e sono indicativi dell'ordine di grandezza.
- Impatto: **alto** (si vede su pagine molto usate o rompe la direzione piatta), **medio**, **basso**. Sforzo: **S** (< mezza giornata), **M** (1-2 giorni), **L** (trasversale).

## Verdetto

Le due home d'area, il catalogo, la palestra di prova, gli obiettivi e i piani operativi sono coerenti: token semantici, `EntrySection`/`EntryLink`, `Card variant="flat"`. Non ci sono emoji nel codice, i gradienti CSS sono spariti (uno solo, voluto, in `StickyActions`), le ombre fuori token sono 15 in tutto, ogni tabella ha `overflow-x-auto`.

Il look piatto però si ferma alla porta delle aree. Restano tre zone "vecchie":

1. **Il percorso guidato prima e durante la chat** (`components/qsa/*`, `CounselorSelector`, `CounselorCover`): card con ombra, pillole, una seconda tinta `teal-*`, copertine a gradiente in vero indaco.
2. **La compilazione dei questionari** (`QuestionnaireRunner`): cento card con ombra, ognuna con quattro riquadri dentro.
3. **Le pagine isolate** (`/gruppo`, `/consiglio/[token]`, `/privacy`, forum): palette grezza, `font-bold`, `dark:` sui call-site.

Sotto c'è una causa comune: **mancano quattro primitive** (campo di form, link-bottone, badge di stato, finestra modale). Senza di esse ogni pagina riscrive le classi a mano, e la deriva continua anche dopo la migrazione.

## Già noti — non ripetuti qui

- Audit UX: S3 (pagina strumento, riquadri colorati), S4 («In preparazione» tratteggiato), S7 (Risultati e Taccuino a pila di card), S10, T1, T4, T5, T6 (focus nei form di classe), T7, T8, T9 (panoramica classe), X1 (`--success`), X2 (doppio gutter), X3 (cinque «indietro»), X7, X8, X9 (palette grezza in chat, forum, privacy, profilo).
- `docs/design.md` §4 dichiara aperti: le quattro schede di `IntroScreen` (`components/home/IntroScreen.tsx:38`) e il riquadro tratteggiato degli strumenti «in arrivo» (`components/home/InstrumentCatalog.tsx:183`).

Dove un rilievo qui sotto tocca una di queste zone, aggiunge solo l'aspetto grafico nuovo.

---

## Rilievi — impatto alto

### A1. L'hover delle voci d'elenco è invisibile
- **Dove:** tutte le pagine con `EntryLink` (`/profilo`, `/docente`, catalogo, palestra, classi).
- **File:** `components/ui/EntryList.tsx:28` (`hover:bg-surface-sunken`), `app/layout.tsx:60` (`body … bg-surface-sunken`), token in `app/globals.css:213` e `:693`.
- **Problema:** la riga in hover prende `surface-sunken`, che è lo stesso colore del fondo pagina (`#f8fafc` chiaro, `#0f172a` scuro). Cambia solo il colore del titolo. Il `rounded-card` della riga non si vede mai. Il prototipo usava un filetto sotto la riga (`.entry:hover{border-bottom-color:var(--line)}`).
- **Stessa causa:** `Button variant="ghost"` (`components/ui/Button.tsx:20`) e i pulsanti icona con `hover:bg-surface-sunken` quando stanno su pagine piatte senza card (116 occorrenze della classe in totale, da filtrare per contesto).
- **Correzione:** in `EntryLink` usare `hover:bg-surface-raised` (già usato da `PersonalAreaHeader.tsx:21`) oppure il filetto del prototipo; stessa scelta per `ghost`.
- **Sforzo:** S.

### A2. Compilazione del questionario: cento card con ombra e riquadri annidati
- **Dove:** `/somministrazione/[instrument]`, somministrazione in app.
- **File:** `components/administration/QuestionnaireRunner.tsx:735` (ogni item è `rounded-card border bg-surface shadow-card`), `:746-751` (quattro etichette-riquadro per item), `:720` (barra di avanzamento sticky in card con ombra), `:440`, `:545`, `:686`, `:703`, `:771` (altri riquadri).
- **Problema:** è la superficie più lunga dell'app ed è l'opposto del piatto: riquadro dentro riquadro, ripetuto per ogni domanda.
- **Correzione:** item come `Card variant="flat" as="fieldset"` (filetto in alto, niente ombra né fondo); opzioni della scala come riga di radio con sola evidenza `bg-brand-soft` sul selezionato; barra sticky senza card, solo `border-b border-line` su `bg-surface-sunken`.
- **Sforzo:** M.

### A3. Scelta del counselor: card stile vetrina, pillole e gradienti in indaco vero
- **Dove:** passo «Counselor» del percorso guidato.
- **File:** `components/questionnaire/CounselorSelector.tsx:191` (card), `:218`, `:223`, `:230`, `:239`, `:259`, `:277`, `:380`, `:393`, `:435` (nove pillole `rounded-full border`), `:457`, `:481` (ombre fuori token); `components/questionnaire/CounselorCover.tsx:78-82`, `:124`, `:169`, `:213-217`, `:263`, `:314` (sei `linearGradient`), `:221-242` (`#1e1b4b`, `#818cf8`).
- **Problema:** fino a sei pillole per card; la copertina di ripiego è un gradiente con indaco/viola reali, cioè la tinta che `design.md` §1 esclude («niente indigo di default»). 76 hex letterali, mentre §7 ammette hex solo in `DiagramBlock`.
- **Correzione:** copertina di ripiego piatta sulle variabili `--i-*` (stessa grammatica di `ToolIllustration`); metadati come riga di testo `text-xs text-ink-muted` separata da «·» al posto delle pillole; lista counselor come righe con filetto.
- **Sforzo:** M.

### A4. Il percorso IDEA e l'introduzione della chat usano una seconda tinta, senza tema scuro
- **Dove:** chat guidata (riquadro introduttivo) e percorso IDEA.
- **File:** `components/qsa/GuidedChatIntro.tsx:35`, `:44-62`; `IdeaBranchIntro.tsx:38-54`; `IdeaBranchTree.tsx:175-275`, `:342-368`; `IdeaSourcesPanel.tsx:134-260`; `IdeaMapPanel.tsx`, `IdeaBranchBar.tsx`, `IdeaPanel.tsx`; `components/council/ClassCouncilView.tsx:32`, `:123`.
- **Problema:** circa 67 classi `teal-*` (più `rose-*` per l'eliminazione). `teal` non è il petrol (`indigo-*` rimappato) e non è un ruolo di stato. In tema scuro `bg-teal-50/60`, `bg-teal-700`, `border-teal-200/300`, `text-teal-900/80`, `bg-rose-50/60`, `border-rose-200` **non hanno voce di remap** (`globals.css:832-855` copre solo `bg-teal-50`, `bg-teal-100`, `text-teal-700/800/900` senza opacità): i riquadri restano chiari su fondo scuro. In più 35 `text-[11px]` e `font-medium`.
- **Correzione:** `teal-*` → `brand`/`brand-soft`/`brand-line`/`link`; `rose-*` → `danger-*`; il riquadro introduttivo diventa `Callout`; `text-[11px]` → `text-xs`.
- **Sforzo:** M.

### A5. Manca la primitiva del campo di form
- **Dove:** tutta l'app.
- **Numeri:** 706 `<input|select|textarea>` nativi; 268 volte `border border-line-strong` scritto a mano in 102 file; **141 stringhe di classi diverse** per lo stesso campo.
- **Esempi di deriva:** con e senza `bg-surface` (`QuestionnaireRunner.tsx:600` contro `:578`), `px-2`/`px-4`, `text-sm`/`text-base`, con o senza `min-h-control` (`PracticeNotebooks.tsx:246` non l'ha), focus a volte rimosso (A8).
- **Correzione:** aggiungere `Input`, `Select`, `Textarea` e `Field` (etichetta + aiuto + errore) in `components/ui/`, sui token `rounded-control border-line-strong bg-surface min-h-control`; adottarli per zona. Estendere `lib/ui-primitives-tokens.test.ts`.
- **Sforzo:** L (primitiva S, adozione a lotti).

### A6. Pagine isolate rimaste al vecchio stile
- **Dove e file:**
  - `/gruppo`: `app/gruppo/page.tsx:96-117` — `font-bold text-slate-800`, bottoni `bg-indigo-600 … text-white` e `border-slate-300` scritti a mano senza `min-h-control`, avviso `bg-emerald-50`.
  - `/consiglio/[token]`: `components/council/ClassCouncilView.tsx:16`, `:123` (`uppercase tracking-wide`), `:26-64` (riquadri `rounded-lg border-slate-200`), `:105`, `:124` (`font-bold`), `:112`, `:136` (campi a mano).
  - `/privacy`: `components/privacy/ConsentToggles.tsx:123`, `:134` (`glass-panel`), `:160` (`dark:` sul call-site, vietato da §6), `DocumentViewer.tsx:16` (pillola `uppercase`), `:79`, `:147` (`min-h-11` = 41 px), `:133` (`shadow-2xl`); 63 `dark:` nei quattro componenti privacy.
- **Problema:** sono le prime pagine che vede chi entra da un invito o dà il consenso, e hanno un'altra grafica.
- **Correzione:** `PageHeader` + `Button` + `Callout variant="success"`; sezioni privacy come `Card variant="flat"`; togliere `dark:` passando ai token; `min-h-11` → `min-h-control`.
- **Sforzo:** M.

---

## Rilievi — impatto medio

### M1. Manca un link-bottone: 68 bottoni primari riscritti a mano
- **File (esempi):** `app/strumenti/[id]/page.tsx:122`, `:162`, `:186`; `components/home/SignInCard.tsx:21`; `components/home/PersonalAreaEntry.tsx:20`; `QuestionnaireRunner.tsx:513`, `:586`; `AdministrationStepFlow.tsx:383`, `:500`; `ClassPathHeroCard.tsx:334`, `:338`; `GoalDialog.tsx:261`.
- **Problema:** `Button` rende solo `<button>` (`components/ui/Button.tsx:38`), quindi ogni `<Link>`/`<a>` che deve sembrare un bottone ricopia le classi, con padding e stati diversi.
- **Correzione:** esportare `buttonClasses(variant, size)` da `Button.tsx` oppure aggiungere `ButtonLink`; sostituire i 68 call-site.
- **Sforzo:** M.

### M2. Manca un badge di stato: 95 pillole scritte a mano
- **File (esempi):** `ClassOverviewTab.tsx:583`, `:679`, `:874`; `OrientationTab.tsx:162`, `:163`, `:190`, `:219`, `:264`; `ClassNoticingTab.tsx:34`; `FlashcardsPage.tsx:217`; `PortfolioCard.tsx:472`, `:478`; `RecommendationsPanel.tsx:173`, `:187`; `QuestionnaireRunner.tsx:492`, `:539`.
- **Problema:** esiste solo `RoleBadge`. Gli stati usano `rounded-full` con padding e tinte diverse; §2.7 punto 5 chiede «indicatori essenziali, senza badge vistosi».
- **Correzione:** primitiva `StatusBadge` (toni neutral/info/success/warning/danger dai token `-soft`/`-ink`), `rounded-control`; dove basta, la riga `status` di `EntryLink` (pallino + testo).
- **Sforzo:** M.

### M3. Manca una primitiva modale: 27 implementazioni, 10 velature diverse
- **File:** 11 con `<dialog>` nativo (`GoalDialog.tsx:37`, `GoalCatalogDialog.tsx:17`, `ClassOverviewTab.tsx:947`…), 16 con `div fixed inset-0` (`FlashcardsPage.tsx:236`, `:254`; `DocumentViewer.tsx:133`; `PortfolioCard.tsx`; `ClassImageModal.tsx`; `ClassGroupPicker.tsx`…).
- **Problema:** velature `bg-slate-900/40`, `/50`, `/60`, `bg-black/40`, `bg-slate-950/50…/90`; raggi `rounded-card`, `rounded-2xl`, `rounded-t-xl`; ombre `shadow-modal`, `shadow-pop`, `shadow-2xl`. Solo `bg-slate-900/40` ha il remap scuro (`globals.css:827`).
- **Correzione:** `Dialog` in `components/ui/` sul `<dialog>` nativo (forma di `GoalDialog`: schermo pieno su mobile, `sm:rounded-card`, testata e piede con filetto), un solo token di velatura, `shadow-modal`.
- **Sforzo:** M-L.

### M4. Albero degli obiettivi: ogni nodo è un riquadro
- **Dove:** `/profilo/obiettivi`, `/docente/obiettivi`, catalogo obiettivi (vista elenco).
- **File:** `components/goals/GoalTree.tsx:22` (`rounded-card border border-line bg-surface p-2 sm:p-4`), `:33` (rientro).
- **Problema:** una pila di riquadri rientrati; con 4 livelli diventa una scala di box. Il resto della pagina è piatto.
- **Correzione:** riga senza riquadro con `border-b border-line`, gerarchia data dal solo rientro (più una linea guida `border-l border-line` sull'`ul` figlio).
- **Nota:** nella mappa (`GoalMap.tsx:19`, `:49`) il riquadro del nodo e la cornice del canvas hanno senso; togliere solo `shadow-card` dal nodo. Il caricamento e il vuoto di `GoalsPanel.tsx:86-87` sono `<p>` senza stile.
- **Sforzo:** S.

### M5. Selettori del percorso guidato ancora a card
- **File:** `components/qsa/AnalysisModeSelector.tsx:58` (card `shadow-sm` con tessera icona colorata `:60`); `InputMethodSelector.tsx:198`, `:204`, `:242-386` (palette grezza, `min-h-11`, bottone a mano `:382`); `ChatSettingsCard.tsx:64` e `ProfileScoresPanel.tsx:102` (`glass-panel`); `app/page.tsx:866`, `:878`, `:1008`, `:1086`, `:1114` (`Card` boxed).
- **Problema:** dalla pagina strumento (piatta) si entra in una sequenza di card.
- **Correzione:** le scelte come `EntryLink` con `onOpen` (già previsto, `EntryList.tsx:44`); pannelli come `Card variant="flat"`; ritirare `glass-panel` (11 usi rimasti) e cancellare l'utility in `globals.css:383-389`.
- **Sforzo:** M.

### M6. Colori arcobaleno dei fattori nel profilo
- **File:** `lib/questionnaires.ts:124-215` (`bg-blue-500`, `bg-sky-500`, `bg-purple-500`, `bg-amber-500`, `bg-emerald-500`, `bg-cyan-500`…), `lib/ztpi-model.ts`, usati da `components/qsa/ProfileScoresPanel.tsx:67`, `:111` (etichette di gruppo `uppercase` colorate) e `ProfileVisualization.tsx:323`, `:331` (`uppercase tracking-wide text-green-700/amber-700`), `:170`, `:219`, `:306-308` (`font-bold`), `:208` (`shadow-md`).
- **Problema:** §2.7 chiede colore solo per marchio, stati e ruoli, grafici con tinte tenui, niente `uppercase`, due pesi. Le tinte `-500` non hanno remap scuro (restano sature, leggibili ma fuori registro).
- **Correzione:** scala di 4-5 passi petrol/slate + ocra per il valore evidenziato; il gruppo si distingue con etichetta e filetto.
- **Sforzo:** M.

### M7. Tre stili di illustrazione nello stesso elenco
- **File:** `lib/personal-area.ts` e `lib/teacher-area.ts` (PNG `/images/platform/*`, `/images/cards/*`), `lib/tool-illustrations.ts:6-19` (12 SVG su `--i-*`), `:22` (ripiego PNG `/images/intro/profiles.png`).
- **Problema:** su `/profilo` e `/docente` convivono SVG al tratto scuro con giallo/arancio (catalogo), PNG `platform` con personaggi a campiture teal, e PNG `cards` geometrici a filetto sottile (`focus_goal.png`, `library_hall.png`, `mind_mapping.png`, `self_reflection.png`, `feedback_loop.png`). Gli strumenti dinamici ricadono su un PNG accanto a SVG. I PNG sono teal scuro su trasparente: su fondo `#0f172a` il contrasto va controllato a occhio; le variabili `--i-*` hanno il valore scuro, i PNG no.
- **Correzione:** portare le voci d'area a SVG `--i-*` (stessa griglia 96×96) a lotti, partendo dai cinque `cards/*` e dal ripiego di categoria.
- **Sforzo:** L (disegno), S per sostituire i cinque `cards/*`.

### M8. Avvisi scritti a mano al posto di `Callout`
- **Numeri:** 98 coppie `border-<stato>-line` + `bg-<stato>-soft` fuori da `Callout` (che è già usato in 63 file).
- **File (esempi, non admin):** `app/profilo/page.tsx` (6), `components/profile/MyGroupsCard.tsx` (4), `CounselorSelector.tsx:352`, `:494`, `QuestionnaireRunner.tsx:545`, `:703`, `:771`, `PortfolioCard.tsx:419`, `FlashcardsPage.tsx:143`, `ClassOverviewTab.tsx:913`, `LearnerProfileCard.tsx:476` (`border-ochre-200 bg-ochre-50`: ocra come fondo di un avviso, contro §2.2).
- **Correzione:** `Callout` con la variante giusta; resta senza icona solo dove l'avviso contiene un form.
- **Sforzo:** M.

### M9. Bottoni da 30 px nelle aree studente e docente
- **File:** `Button size="sm"` (`min-h-8`, `Button.tsx:26`) fuori dall'admin: `ForumView.tsx` (10), `TeacherDevicesPanel.tsx` (6), `StepPresentationFields.tsx` (6), `ClassMeetingsManager.tsx` (6), `ClassPathsTab.tsx` (5), `LearnerProfileCard.tsx` (5), `MeetingDetails.tsx` (4), `ClassImageModal.tsx` (3), `app/privacy/page.tsx` (2). In più `RecommendationsPanel.tsx:374`, `:409`, `:571`, `:632`, `:643` (`min-h-9`) e 31 `min-h-11`/`h-11` (41 px) in `InputMethodSelector`, `ChatShell`, `InlineRename`, privacy.
- **Problema:** sotto i 44 px che `design.md` §2.6 fissa come target.
- **Correzione:** `size="md"` fuori da `.admin-shell`; `min-h-11` → `min-h-control`. In alternativa una regola `@media (pointer: coarse)` come quella dell'admin (`globals.css:549-555`).
- **Sforzo:** S.

### M10. Quattro raggi in uso invece di due
- **Numeri:** `rounded-control` 647, **`rounded-lg` 322**, `rounded-full` 191, **`rounded` 180**, `rounded-card` 155, `rounded-md` 138, `rounded-xl` 13, `rounded-2xl` 8.
- **Problema:** `rounded-md` coincide con `rounded-control` e `rounded-xl` con `rounded-card` (`globals.css:40-42`, `:149-150`), ma `rounded-lg` è un terzo raggio intermedio e `rounded` un quarto. Fuori dall'admin: `TavoloCanvas.tsx` (20), `TavoloWorkspace.tsx` (9), `ClassOverviewTab.tsx` (8), `RecommendationsPanel.tsx` (7), `ClassPathsTab.tsx:733`, `:883`, `ClassNoticingTab.tsx:32`, `:140`, `TeacherAccess.tsx:17`.
- **Correzione:** `rounded-lg` → `rounded-control` sui controlli e `rounded-card` sui contenitori; `rounded-md` → `rounded-control`.
- **Sforzo:** S per zona (sostituzione meccanica).

---

## Rilievi — impatto basso

| # | Rilievo | File:riga | Correzione | Sforzo |
|---|---|---|---|---|
| B1 | **Nessuna pagina 404 o di errore propria.** In `app/` non esistono `not-found.tsx`, `error.tsx`, `global-error.tsx`: si vede la pagina predefinita di Next, fuori identità. | `app/` (assenti) | `not-found.tsx` ed `error.tsx` con `PageHeader`, una frase e un `Button` verso l'area | S |
| B2 | **Ombre fuori dai tre token.** | `ui/Toast.tsx:68` (`shadow-lg`, `rounded-xl`), `ui/ChatBubble.tsx:14`, `:48`, `ui/ChatActionsPopover.tsx:86`, `ui/MessageDiagramButton.tsx:172`, `ui/DiagramBlock.tsx:362`, `qsa/ChatWorkspace.tsx:116`, `:135`, `qsa/IdeaConclusion.tsx:75`, `qsa/IdeaBranchTree.tsx:322` | `shadow-pop` per popover e toast, `shadow-card` o nulla per il resto | S |
| B3 | **Primitive `ui/` ancora su palette grezza**, non coperte dal test dei token. | `ui/BackButton.tsx:21-25` (20), `ui/ChatMarkdown.tsx` (20), `ui/ChatShell.tsx` (15), `ui/ChatOptionsMenu.tsx` (15), `ui/InlineRename.tsx` (14, con `dark:`), `ui/AudioInput.tsx` (14), `ui/FlowStepper.tsx` (11), `ui/PencilButton.tsx` (10), `ui/ConfirmInline.tsx` (10) | passare ai token e aggiungerle a `lib/ui-primitives-tokens.test.ts` | M |
| B4 | **Tre taglie sotto `text-xs`.** `text-[11px]` (48), `text-2xs` (167), più `text-[9px]`, `text-[10px]`. `text-xs` vale già 11,25 px. | `IdeaBranchTree.tsx` (15), `IdeaSourcesPanel.tsx` (8), `ClassPathsTab.tsx:794`, `:801`, `:811`, `PortfolioCard.tsx:471`, `:476`, `app/profilo/page.tsx` (2) | `text-[11px]` → `text-xs`; `text-2xs` solo per codici e contatori | S |
| B5 | **Testo secondario molto piccolo e diffuso.** `text-xs` + `text-ink-muted` 817 volte (11,25 px a 4,75:1). Passa AA di misura, ma su `/docente/taccuini-prova/[id]` quasi tutto il testo di servizio è così. | `PracticeNotebooks.tsx:217-247`, `PracticeChats.tsx:78-105`, `PracticeRepertoire.tsx:112-174` | descrizioni e aiuti a `text-sm`; `text-xs` solo per metadati | S |
| B6 | **Focus rimosso nei campi admin.** `outline-none` con solo `focus:border-brand` (1 px). | `admin/LogViewer.tsx` (8), `CostStats.tsx` (6), `AdministrationPlansPanel.tsx:518`, `AssistantQuestionsPanel.tsx:192`, `:224`, `ApprovedStrategiesPanel.tsx:157-158`, `CreateInstrumentDialog.tsx:514`, `:533`, `CounselorCoverModal.tsx:350`, `:364`; anche `app/profilo/page.tsx:512` | togliere `outline-none`: l'anello globale (`globals.css:416`) basta. Si chiude da sé con A5 | S |
| B7 | **Scala degli `h2` non unica.** `text-lg` 90, `text-xl` 36, `text-sm` 13, `text-base` 11, `text-2xl` 5; `font-bold` in 8. `EntrySection` usa `text-lg`. | `PracticeNotebooks.tsx:312` (`text-xl`), `GoalDialog.tsx:40` (`text-xl`), `ForumView.tsx:288`, `:327`, `:383` (`font-bold`) | `h2` di sezione = `text-lg font-semibold` con filetto; `text-xl` solo per il titolo di una finestra | S |
| B8 | **Spaziature fuori griglia 8.** 372 classi `*-1.5`, `*-2.5`, `*-3`, `*-5`, quasi tutte in `qsa/*`, `ClassCouncilView`, privacy, forum. | `GuidedChatInterface.tsx` (31), `RecommendationsPanel.tsx` (26), `ProfileVisualization.tsx` (20) | allineare a 2/4/6 mentre si migra ogni file (A4, A6, M5) | — |
| B9 | **Due modi di scrivere 44 px.** `min-h-[44px]` 113 volte contro `min-h-control` 454. | `OrientationTab.tsx:179`, `:186`, `ClassNoticingTab.tsx:111`, `:118`, `ForumView.tsx`, `BackButton.tsx:21` | sostituzione meccanica con `min-h-control`/`h-control` | S |
| B10 | **Glifi testuali come icone** (§5 li esclude). Nessuna emoji trovata. | `PlanActivityFlow.tsx:89` («← »), `GuidedChatInterface.tsx:1773` («→»), `admin/ConfigForm.tsx:953` («▼»), `teacher/class-group-texts.ts:56` e le altre cinque lingue («Apri classe →») | `ArrowLeft`, `ArrowRight`, `ChevronDown` di `lucide-react` | S |
| B11 | **Spinner ovunque.** 89 `animate-spin` contro la regola «solo `fade-in-up` e barra indeterminata» (§4 Movimento); `Skeleton` usato in 5 file. | diffuso; riferimento buono `TeacherAccess.tsx:34-37` | decidere: o si aggiorna `design.md`, o le pagine d'area passano a `Skeleton` | M |
| B12 | **Card di ruolo colorata rimasta.** | `teacher/ClassPracticeStudents.tsx:52` (`bg-role-test-soft`) | sezione con titolo e filetto + `RoleBadge role="test"` (stessa decisione di T4) | S |
| B13 | **Scorciatoie della panoramica classe a card** (dettaglio di T9). Quattro card uguali con tessera icona. | `ClassOverviewTab.tsx:392`, `:413`, `:434`, `:454` | `EntrySection` + quattro `EntryLink` con `onOpen` | S |

---

## Pacchetti di lavoro proposti (una PR ciascuno, base `main`)

**PR 1 — Correzioni rapide del piatto (S, ~1 giorno).**
A1 (hover di `EntryLink` e `ghost`), M4 (albero obiettivi), B1 (404/errore), B2 (ombre), B9 (`min-h-control`), B10 (glifi), B12, B13.
Verifica: screenshot chiaro/scuro di `/profilo`, `/docente`, `/docente/obiettivi`; test `EntryList` aggiornato.

**PR 2 — Primitive mancanti (M).**
A5 (`Input`/`Select`/`Textarea`/`Field`), M1 (`ButtonLink` o `buttonClasses`), M2 (`StatusBadge`), M3 (`Dialog`); estensione di `ui-primitives-tokens.test.ts`; B3 per le primitive toccate. Adozione solo in una zona pilota (palestra di prova + obiettivi) per tenere la PR leggibile.
Verifica: test dei token; nessun cambiamento visivo fuori dalla zona pilota.

**PR 3 — Compilazione e pagine isolate (M).**
A2 (`QuestionnaireRunner` piatto), A6 (`/gruppo`, `/consiglio/[token]`, `/privacy`), M9 (bottoni a 44 px), M8 nelle stesse pagine.
Verifica: 390 px e tema scuro sulle quattro pagine; nessun `dark:` né palette grezza nei file toccati.

**PR 4 — Percorso guidato prima della chat (M-L).**
A3 (`CounselorSelector`, `CounselorCover`), A4 (`teal-*` → token, `GuidedChatIntro`, componenti IDEA), M5 (selettori, ritiro di `glass-panel`), M6 (colori dei fattori), B4, B8 sugli stessi file.
Verifica: conteggio `grep` di `teal-`, `glass-panel`, `text-[11px]` a zero nei file migrati; controllo scuro del riquadro introduttivo.

**PR 5 — Uniformità residua (a lotti, bassa priorità).**
M10 (raggi), M8 e B6 nel resto dell'app adottando le primitive di PR 2, B5, B7, B11 (decisione sugli spinner), M7 (illustrazioni SVG al posto dei cinque `cards/*`).

Ordine consigliato: PR 1 subito (alto ritorno, rischio minimo), PR 2 prima di PR 3 e PR 4 perché queste ne usano le primitive.
