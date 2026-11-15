# Audit visivo 2 — quali pagine differiscono ancora dal look principale

Data: 2026-11-15. Codice letto: `main` a `39fd6b17`. Percorsi relativi a `frontend/src/`.

## Metodo e limiti

- **Solo lettura del codice**: nessun dev server, browser, Docker o test. Nessuna pagina è stata vista renderizzata; tema scuro, hover e 390 px sono dedotti dalle classi.
- Rotte elencate da `app/**/page.tsx` più `error.tsx` e `not-found.tsx` (78 file). Per ogni rotta ho seguito i componenti importati (chiusura degli import, test esclusi) e contato con regex: `<Card` senza `variant="flat"`, `rounded-card` + `border` scritti a mano, `shadow-*`, `rounded-full`, raggi vecchi, palette grezza, `dark:`, `bg-white`, `<input|select|textarea>` nativi, `glass-panel`, `animate-spin`, `text-[Npx]`, `font-bold|font-medium`, `uppercase`, `h-9|h-11`, hex.
- I conteggi sono ordini di grandezza. Le righe citate sono state lette una per una.
- Classi: **ALLINEATA**, **MINORE** (pochi residui, stessa forma), **DIVERSA** (un altro look: pile di card, riquadri annidati, pillole, palette grezza diffusa). Sforzo: S < mezza giornata, M 1-2 giorni, L trasversale.
- Navbar e pulsanti arrotondati sono fuori perimetro (`docs/design.md` §4). `Card` boxed è ammessa per «messaggi di stato e form isolati» (§4): le card di stato centrate (login, accesso negato) non sono contate come difetto.

## Verdetto

Le 13 PR di stamattina hanno chiuso quasi tutto il primo audit: i conteggi globali che contavano sono a zero o quasi (`glass-panel` 0, `animate-spin` 1 solo in `Button.tsx`, ombre fuori token 0, `min-h-[44px]` 0, `text-[Npx]` 7, raggi vecchi 0 fuori da admin e `DiagramBlock`, `dark:` 8 tutti in `components/ui/`).

Restano **quattro zone con un altro look**, in ordine di visibilità:

1. **Le sottopagine «a sezione» di `/profilo`** rese da `app/profilo/page.tsx` (compilazioni, taccuino, portfolio, orientamento, più classi, telegram, analisi combinata, tavolo): ancora `Card` boxed con riquadri dentro e pillole. Sono a un clic dalla home piatta.
2. **Gli strumenti visivi** (`/profilo/azioni`, `/carte`, `/confronto`, `/timeline`): pannello con ombra e articoli riquadrati dentro.
3. **La pagina della classe del docente** (`/docente/classi/[id]`): cinque schede su sei sono pile di card (16 `Card` boxed, 13 pillole). Solo «Piani» è piatta.
4. **Lo stack delle chat** (percorso guidato in `/`, `/bussola`, `/assistente`, passi dei piani operativi): struttura già appiattita, ma tutto su palette grezza (`slate-*`, `indigo-*`, più `teal-*`/`sky-*`), con pillole, `uppercase`, `font-bold` e target da 41 px.

In più tre pagine isolate: `/questionario`, `/guide`, e in parte `/somministrazione`.

L'admin è su token (solo 41 classi di palette grezza in 6 file) ma ha forma propria: 311 raggi vecchi, 66 ombre, 59 pillole, 334 campi nativi. È esentato dal test dei raggi; va giudicato a parte.

Causa comune ancora aperta: **le primitive esistono ma l'adozione è bassa**. `Field/Input/Select/Textarea` in 17 file contro 142 file con campi nativi; `Dialog` in 3 file contro 22 con `fixed inset-0` e 10 con `<dialog>`; `StatusBadge` in 8 file contro ~50 con pillole; `ButtonLink/buttonClasses` in 6 file, 16 link primari ancora scritti a mano.

---

## Tabella delle rotte

### Ingresso, percorso guidato, chat

| Rotta | Stato | Motivo principale (file:riga) |
|---|---|---|
| `/` (intro + percorso guidato + chat) | **DIVERSA** | `components/qsa/ScoreInputForm.tsx:79` (ogni fattore è un riquadro `bg-white border border-slate-200`), `:21-27` (titoli di gruppo `purple/cyan/green`), `:82`, `:104`, `:235` (`font-bold`); `PDFUploader.tsx:122-150` (palette grezza, bottone a mano, `min-h-11`); `ChatWorkspace.tsx:116`, `:135`, `:138`; `GuidedChatInterface.tsx:1972`, `:1997`, `:2004`, `:2144` (pillole, `uppercase tracking-widest`), `:1974`, `:2159`, `:2170` (`teal-*`), 89 classi grezze; `RecommendationsPanel.tsx` (87 grezze, 14 `h-9/h-11`); `ChatSettingsCard.tsx:64-132`; `SessionReport.tsx:141-185`; `home/IntroScreen.tsx:38` (quattro schede riquadrate, dichiarato aperto in `design.md`) |
| `/bussola` | **DIVERSA** | sei `Card` boxed: `app/bussola/page.tsx:275`, `:289`, `:301`, `:311`, `:414`, `:450`; chat sulle primitive grezze `ui/ChatBubble.tsx:16-17`, `ui/ChatShell.tsx:71-123` |
| `/assistente` | **DIVERSA** | `app/assistente/page.tsx:571`, `:650`, `:691` (tre pannelli `rounded-card border … shadow-card`), `:415` (link primario a mano); stesse primitive chat |
| `/counselor`, `/inizia` | MINORE | `questionnaire/CounselorSelector.tsx:403`, `:427` (chip filtro `rounded-full`), `:267` (`Card` boxed `bg-surface-sunken`), `:468` (riquadro vuoto) |
| `/strumenti/[id]` | MINORE | testa piatta; tre riquadri colorati `app/strumenti/[id]/page.tsx:150`, `:169`, `:194`, con riquadri dentro (`:175`, `:178`); bottoni a mano `:122`, `:161` |
| `/questionario` (gradimento) | **DIVERSA** | cinque `Card` boxed `app/questionario/page.tsx:309`, `:379`, `:426`, `:448`, `:465`; conferma `:267` con cerchio icona `:269`; campi a mano `:368`, `:400`, `:459`, `:471`, `:535`; `h2` `text-xl` |
| `/somministrazione` | MINORE | griglia di card per strumento `app/somministrazione/page.tsx:71`, avvisi-riquadro `:53`, `:62`, link primario a mano `:84` |
| `/somministrazione/[instrument]`, `/[locale]` | MINORE | gli item ora sono piatti (`QuestionnaireRunner.tsx:683`); restano due `Card` boxed di apertura `:537`, `:547` e la card finale `:488` |
| `/guide` | **DIVERSA** | `app/guide/page.tsx:106`, `:121`, `:132` (card con `shadow-card`, griglia di box per gruppo), `:130` (lista in riquadro), `:99` (campo a mano `min-h-[48px]`), `:115` (link primario a mano); `guide/GuideFigure.tsx:47` (`bg-slate-950/90`) |
| `/guide/dati-riservatezza` | ALLINEATA | — |
| `/privacy` | ALLINEATA | solo `font-medium` (12 volte: `privacy/ConsentToggles.tsx:143-220`, `ChoiceHistory.tsx:72`, `:76`, `SharingRevocation.tsx:201`, `:210`) |
| `/gruppo` | ALLINEATA | `PageHeader` + `Callout` + `ButtonLink` (`app/gruppo/page.tsx:98-117`) |
| `/unisciti` | MINORE | tre `Card` boxed da form isolato (`:158`, `:212`, `:266`, ammesse); sei `<input>` a mano (`:166`-`:274`) |
| `/consiglio/[token]` | ALLINEATA | residuo: `font-medium` `council/ClassCouncilView.tsx:50`, `:68`, `:69` |
| `/telegram-link` | MINORE | `h1` a mano invece di `PageHeader` (`:101`), link primario a mano (`:110`), riquadro codice (`:115`) |
| `/tavolo`, `/tavolo/[id]` | MINORE | righe riquadrate `tavolo/TavoloList.tsx:149`; link primari a mano `TavoloWorkspace.tsx:338`, `:359`, `TavoloCompose.tsx:94`, `TavoloCanvas.tsx:390`; tinte `emerald/rose/sky/violet` dei pezzi (ammesse da §2.4: distinguono oggetti) |
| `/login`, `/accesso-locale`, `/logout`, `/register` | ALLINEATA | una `Card` boxed di stato ciascuna (`app/login/page.tsx:39`, `app/accesso-locale/page.tsx:61`), ammessa |
| `error.tsx`, `not-found.tsx` | ALLINEATA | nuove (PR di stamattina); `app/not-found.tsx:13` link primario a mano |
| `/pqbl`, `/profilo/libretto`, `/profilo/chatgpt`, `/docente/chatgpt`, `/docente/obiettivi`, `/docente/palestra`, `/docente/proposte`, `/docente/risorse`, `/admin/classi` | — | solo `redirect()` |

### Area personale (`/profilo`)

| Rotta | Stato | Motivo principale (file:riga) |
|---|---|---|
| `/profilo` | MINORE | home piatta (`PersonalAreaHome`, `InstrumentCatalog`); residui: `profile/ActiveActionsCard.tsx:55`, `:66` (`Card` boxed «Da riprendere» in cima alla home), `home/InstrumentCatalog.tsx:93`, `:140` (avvisi a mano), `:184`, `:193` (riquadro tratteggiato «in arrivo» + pillola, dichiarato aperto), `:104` (link primario a mano) |
| `/profilo/compilazioni` | **DIVERSA** | `app/profilo/page.tsx:470`, `:573`, `:774` (`Card` boxed), `:624`, `:643`, `:702`, `:727` (riquadri dentro la card), `:565`, `:578`, `:706` (pillole), `:490` (vuoto tratteggiato), `:505`, `:519` (campi a mano), `:457` (avviso-riquadro); più `ActiveActionsCard` e `ResultReadingCard.tsx:150` |
| `/profilo/taccuino` | **DIVERSA** | `profile/LearnerProfileCard.tsx:463` (`Card` boxed), `:402` (riquadro per campo dentro la card), `:476` (`border-ochre-200 bg-ochre-50`: ocra come fondo di avviso, contro §2.2); `TeacherNotesCard.tsx:43`; `app/profilo/page.tsx:457` |
| `/profilo/portfolio` | **DIVERSA** | `profile/PortfolioCard.tsx:279` (`Card` boxed), `:322`, `:431` (riquadri dentro), `:473`, `:479` (pillole), `:425` (tratteggiato), `:524` (modale a mano `bg-slate-950/80`), nove campi a mano (`:303`-`:495`) |
| `/profilo/orientamento` | **DIVERSA** | `profile/OrientationDirectoryCard.tsx:60`, `:84`, `:120` (card per evento e per contatto), `:68` (chip filtro a pillola) |
| `/profilo/analisi-combinata` | MINORE | `profile/CrossSynthesisCard.tsx:64` (`Card` boxed), `:110` (riquadro dentro), `:77` (pillola), `:86` (tratteggiato) |
| `/profilo/classi` | MINORE | `profile/MyGroupsCard.tsx:191` (`Card` boxed), `MeetingDetails.tsx:131` (boxed), `:79` (select a mano) |
| `/profilo/telegram` | MINORE | `profile/TelegramLinkCard.tsx:233` (`Card` boxed), `:280` (link primario a mano) |
| `/profilo/tavolo` | MINORE | `tavolo/TavoloList.tsx:149` (righe riquadrate invece di `EntryLink`) |
| `/profilo/assegnazioni` | MINORE | `teacher/AssignmentsPanel.tsx:42` (chip `rounded-full border`), `:119-132` (select a mano); `AssignmentWork.tsx:137`, `:144`, `:152`, `:187` (riquadri) |
| `/profilo/azioni`, `/carte`, `/confronto`, `/timeline` | **DIVERSA** | `visual/VisualTools.tsx:296` (pannello `rounded-card border bg-surface shadow-card`), `:374`, `:603` (articoli riquadrati dentro), `:511`, `:527`, `:693` (card con ombra), `:633` (modale a mano), `:42`, `:552` (`text-[15px]`, `text-[14px]`), 22 campi a mano; `PersonalTimeline.tsx:239`, `:265`, `:266`, `:282` (tappe riquadrate), `:300`, `:331`; `TimelineCalendar.tsx:30` |
| `/profilo/piani-operativi/[pathId]/[stepId]`, `/…/approfondimento` | **DIVERSA** | `administration/AdministrationStepFlow.tsx:379`, `:407`, `:436`, `:451`, `:506` (cinque `Card` boxed), `InAppAdministrationRunner.tsx:71`, `ResultsDeepDiveFlow.tsx:145`, `:179`, `PlanChatCompleted.tsx:12`; poi lo stack della chat guidata |
| `/profilo/piani-operativi` | ALLINEATA | `profile/ClassPathHeroCard.tsx:93` è `variant="flat"`; residui `:102` (`uppercase`), `:199`, `:205`, `:209-213` (`ochre-600`/`indigo-600`/`slate-*` grezzi), `:353` (link primario a mano) |
| `/profilo/obiettivi` | ALLINEATA | `goals/GoalTree.tsx` senza riquadri; 15 campi a mano nei form obiettivo (`GoalForm.tsx`, `GoalReviewStep.tsx`) |
| `/profilo/pqbl` | ALLINEATA | 11 `Card variant="flat"`; `app/profilo/pqbl/page.tsx:510` area di rilascio tratteggiata (accettabile) |
| `/profilo/flashcard` | MINORE | `flashcards/FlashcardsPage.tsx:218` (pillola di stato), `:236`, `:254` (due modali a mano `bg-slate-900/50`), `:18` (`text-[15px]`), `:262` |
| `/profilo/cambiamenti` | MINORE | `app/profilo/cambiamenti/page.tsx:44`, `:62` (card di stato scritte a mano con cerchio icona `:45`, `:63`) |
| `/profilo/api-personali` | MINORE | `profile/ChatGPTConnectionPanel.tsx:142` (`Card` boxed) con riquadro dentro `:165`; 12 campi a mano in `PersonalAPISettings.tsx` |
| `/profilo/classi/[id]/forum` | MINORE | struttura piatta (5 `Card flat`), ma `forum/ForumView.tsx` ha 56 classi grezze (`:37-226`: `text-slate-700`, `border-slate-300 bg-white`) e 10 campi a mano: è il file non-chat più indietro sui token |

### Area docente (`/docente`)

| Rotta | Stato | Motivo principale (file:riga) |
|---|---|---|
| `/docente` | ALLINEATA | `TeacherAreaHome`, 9 `EntrySection/EntryLink` |
| `/docente/classi/[id]` (= `/admin/classi/[id]`) | **DIVERSA** | `teacher/ClassOverviewTab.tsx:394`, `:492`, `:587`, `:748` (`Card` boxed), `:502`, `:598`, `:761` (pillole), `:839`; `OrientationTab.tsx:166`, `:176`, `:196` (boxed), `:162`, `:163`, `:190`, `:219`, `:264` (pillole); `ClassNoticingTab.tsx:102`, `:150`, `:34`; `ClassCouncilTab.tsx:69`, `:93`; `ClassStudentsTab.tsx:22` (card tinta `border-brand-line bg-brand-soft`); `ClassEmailInvitations.tsx:126` (card tinta di ruolo, contro §2.8); `ClassSettingsAudit.tsx:51` (una card per riga); `ClassPairingSection.tsx:65`; `ClassImageModal.tsx` (7 ombre, modale a mano). La scheda «Piani» (`ClassPathsTab.tsx`) è piatta |
| `/docente/classi` | ALLINEATA | `admin/GroupsPanel.tsx` con `EntryLink` |
| `/docente/piani-operativi` | ALLINEATA | piatta (#951); residui: 11 `Button size="sm"` (`ClassPathsTab.tsx`, `StepPresentationFields.tsx`), `PathTemplateUpdate.tsx:87` (`Card` boxed) |
| `/docente/taccuini-prova`, `/[id]` | ALLINEATA | `PracticeNotebooks` con `EntrySection`; le bolle ereditano le primitive chat grezze |
| `/docente/catalogo-obiettivi` | ALLINEATA | usa già `Field` (`goals/GoalCatalogEditor.tsx:98`, `:104`) |
| `/docente/compilazioni` | ALLINEATA | `ClassCompilationsSection` piatta; `StudentResultItem.tsx:98` (riquadro del dettaglio) e `qsa/ProfileVisualization.tsx` (32 classi `slate-*`) |
| `/docente/taccuino` | ALLINEATA | residuo `teacher/TeacherNotebook.tsx:300` (riquadro `border-brand-line`), `:359` (link primario a mano) |
| `/docente/incontri` | ALLINEATA | 20 campi a mano in `ClassMeetingsManager.tsx` |
| `/docente/dispositivi` | MINORE | `teacher/TeacherDevicesPanel.tsx:148` (pillola di stato), `:176` |
| `/docente/istituti`, `/[id]` | MINORE | `teacher/InstitutesPanel.tsx:60`, `:164` (`Card` boxed per i form) |
| `/docente/assegnazioni` | MINORE | come `/profilo/assegnazioni`; `AssignmentButton.tsx:80` (`<dialog>` a mano con `backdrop:bg-black/40`) |
| `/docente/materiali`, `/docente/strategie` | MINORE | pannelli admin riusati: `admin/CertifiedReadingsPanel.tsx` (23 campi a mano), `CertifiedStrategiesPanel.tsx` (11), `outline-none` |
| `/docente/somministrazioni` | MINORE | `admin/AdministrationPlansPanel.tsx` (3 pillole, 2 `uppercase`, 15 campi a mano), `PlanStudentsPanel.tsx` (3 ombre) |
| `/docente/orientamento` | MINORE | `app/docente/orientamento/page.tsx:169`, `:199` (menu popover a mano), 4 campi a mano |
| `/docente/api-personali` | MINORE | come `/profilo/api-personali` |

### Admin (priorità bassa, giudicato a parte)

| Rotta | Stato | Motivo principale |
|---|---|---|
| `/admin` | **DIVERSA (look admin denso)** | 61 file in `components/admin/`: 311 `rounded`/`rounded-md`/`rounded-lg` (peggiori: `PromptMap.tsx` 49, `PromptExperimentsPanel.tsx` 19, `CostStats.tsx` 19, `LogViewer.tsx` 18), 66 `shadow-*`, 59 `rounded-full`, 334 campi nativi, 13 `Card` boxed. Sui token colore è quasi pulito: 41 classi grezze in 6 file (`PromptMap.tsx` 24, `CreateInstrumentDialog.tsx` 13). Esentato dal test dei raggi (`lib/ui-primitives-tokens.test.ts:107-112`) |
| `/admin/preview-chat` | **DIVERSA** | `admin/AdminChatSandbox.tsx` (6 ombre, 4 pillole) + stack chat |
| `/admin/classi/[id]` | **DIVERSA** | stesso `ClassSettingsPage` del docente |

---

## Correzioni per le rotte DIVERSE

| Rotta | Correzione | Sforzo |
|---|---|---|
| `/profilo/compilazioni` | estrarre la sezione da `app/profilo/page.tsx:467-781` in un componente; `Card variant="flat"` per elenco e dettaglio; i riquadri interni (`:624`, `:643`, `:702`, `:727`) diventano sezioni con titolo e filetto `border-b border-line-strong`; pillole (`:565`, `:578`, `:706`) → `StatusBadge`; campi → `Input`/`Select`; vuoto tratteggiato → `<p>` `text-ink-muted` | M |
| `/profilo/taccuino` | `LearnerProfileCard.tsx:463` e `TeacherNotesCard.tsx:43` → `variant="flat"`; `:402` riga con `border-b border-line`; `:476` → `Callout variant="info"` | S |
| `/profilo/portfolio` | `PortfolioCard.tsx:279` → flat; form `:322` senza riquadro; voci `:431` come righe con filetto o griglia di immagini senza bordo; pillole → `StatusBadge`; lightbox `:524` → `Dialog`; campi → `Field` | M |
| `/profilo/orientamento` | `OrientationDirectoryCard.tsx:84`, `:120` → voci con filetto (`EntryLink` dove c'è un link); chip `:68` → `Select` o bottoni `rounded-control` | S |
| `/profilo/azioni`, `/carte`, `/confronto`, `/timeline` | `VisualTools.tsx:296` senza riquadro né ombra quando `embedded`; articoli `:374`, `:603` e tappe `PersonalTimeline.tsx:239-282` con `border-t border-line`; costante `inputClass` (`:42`, `PersonalTimeline.tsx:30`, `ExperienceReview.tsx:16`, `FlashcardsPage.tsx:18`) → `Input`/`Textarea`; modale `:633` → `Dialog`. Le carte (`:511`) restano riquadri: sono oggetti, non contenitori | M |
| `/profilo/piani-operativi/[pathId]/[stepId]` | i cinque `Card` di `AdministrationStepFlow.tsx` → `variant="flat"`; `ResultsDeepDiveFlow.tsx:145`, `:187` → riga con filetto + `Select` | S (la chat dentro segue il pacchetto chat) |
| `/docente/classi/[id]` | per scheda: `Card` → `variant="flat"` o `EntrySection`; pillole → `StatusBadge`; `ClassStudentsTab.tsx:22` e `ClassEmailInvitations.tsx:126` → sezione con filetto + `RoleBadge`; `ClassSettingsAudit.tsx:51` → lista `divide-y divide-line`; `ClassImageModal` → `Dialog` | M |
| `/` percorso guidato (pre-chat) | `ScoreInputForm.tsx`: riga senza riquadro, `Input`, token `ink`/`link`, togliere `PREFIX_COLOR` (un solo colore + etichetta), `font-bold` → `font-semibold`; `PDFUploader.tsx`: token + `Button`; `ChatSettingsCard.tsx`, `SessionReport.tsx`: token + `Callout`; `IntroScreen.tsx:38` → `EntrySection`/`EntryLink` con `ToolIllustration` (decisione di disegno) | M |
| Stack chat (`/`, `/bussola`, `/assistente`, palestra, piani) | passare ai token le primitive `ui/ChatBubble`, `ChatShell`, `ChatMarkdown`, `ChatOptionsMenu`, `ChatActionsPopover`, `AudioInput`, `ResponseFormat/Length/ReasoningSelector`, `InlineRename`, `PencilButton`, `QuestionnaireLink`, `ConfirmInline`, `Toast`, `Tooltip`, `FlowStepper`, `ForwardButton` (≈200 classi) e aggiungerle a `lib/ui-primitives-tokens.test.ts`; poi `qsa/GuidedChatInterface.tsx`, `FreeChatInterface.tsx`, `ChatWorkspace.tsx`, `RecommendationsPanel.tsx`, `Idea*.tsx` (≈330 classi): `teal-*`/`sky-*` → `brand-*`, pillole `uppercase` (`:1997`, `:2004`) → testo `text-xs text-ink-muted`, `h-9/h-11` → `min-h-control` | L |
| `/bussola` | sei `Card` → `variant="flat"`; il pannello chat `:311` resta l'unico riquadro | S |
| `/assistente` | `:571`, `:650`, `:691`: togliere `shadow-card`, un solo riquadro per la conversazione; `:415` → `ButtonLink` | S |
| `/questionario` | cinque `Card` → `variant="flat"` con `h2` `text-lg`; campi → `Field`/`Input`/`Textarea`/`Select`; conferma `:267` → `Callout variant="success"` | S |
| `/guide` | gruppi `:132` → `EntrySection` + righe; scheda `:106` e «correlati» `:121` senza ombra né riquadro (`Card variant="flat"`); ricerca `:99` → `Input`; `:115` → `ButtonLink` | S-M |
| `/admin` | solo se il proprietario lo vuole: sostituzione meccanica dei raggi (`rounded`/`rounded-md` → `rounded-control`, `rounded-lg` → `rounded-control` o `rounded-card` secondo il contesto), poi togliere l'esenzione dal test | M (meccanico) |

## Correzioni per le rotte MINORI

| Rotta | Correzione | Sforzo |
|---|---|---|
| `/profilo` | `ActiveActionsCard.tsx:55`, `:66` → `EntrySection` con righe (stessa forma della home); `InstrumentCatalog.tsx:93`, `:140` → `Callout`; `:184` «in arrivo» → `EntrySection` con voci disabilitate e `StatusBadge`; `:104` → `ButtonLink` | S |
| `/profilo/analisi-combinata`, `/classi`, `/telegram` | `Card` → `variant="flat"` (`CrossSynthesisCard.tsx:64`, `MyGroupsCard.tsx:191`, `MeetingDetails.tsx:131`, `TelegramLinkCard.tsx:233`); pillola `:77` → `StatusBadge`; `:280` → `ButtonLink` | S |
| `/profilo/tavolo`, `/tavolo` | `TavoloList.tsx:149` → `EntryLink`; link primari → `ButtonLink` | S |
| `/profilo/assegnazioni`, `/docente/assegnazioni` | `AssignmentsPanel.tsx:42` chip → `StatusBadge`; select → `Select`; `AssignmentWork.tsx` riquadri → filetto; `AssignmentButton.tsx:80` → `Dialog` | S |
| `/profilo/flashcard` | `:218` → `StatusBadge`; `:236`, `:254` → `Dialog`; `inputClass` → `Input` | S |
| `/profilo/cambiamenti` | `:44`, `:62` → `Card` + `Callout` (come `TeacherAccess`) | S |
| `/profilo/api-personali`, `/docente/api-personali` | `ChatGPTConnectionPanel.tsx:142` → flat; campi → `Field` | S |
| `/profilo/classi/[id]/forum` | `ForumView.tsx`: `slate-*`/`bg-white` → `ink*`/`surface`/`line-strong`; campi → `Field`/`Input`/`Textarea` | S (meccanico) |
| `/strumenti/[id]` | `:150`, `:169` → `Callout` con azione; `:175`, `:178` valori in `font-mono` senza riquadro; `:194` → sezione con filetto; `:122`, `:161` → `ButtonLink` | S |
| `/somministrazione` | `:71` griglia → `EntrySection`/`EntryLink`; `:53`, `:62` → `Callout`/`<p>`; `:84` → `ButtonLink` | S |
| `/somministrazione/[instrument]` | `QuestionnaireRunner.tsx:537`, `:547` → `variant="flat"` | S |
| `/counselor`, `/inizia` | chip `:403`, `:427` → bottoni `rounded-control` (o `Select`); `:267` → flat | S |
| `/unisciti`, `/telegram-link` | `<input>` → `Input`; `h1` → `PageHeader`; `:110` → `ButtonLink` | S |
| `/docente/dispositivi`, `/istituti` | `:148` → `StatusBadge`; `InstitutesPanel.tsx:60`, `:164` → flat | S |
| `/docente/materiali`, `/strategie`, `/somministrazioni`, `/orientamento`, `/incontri` | campi a mano → `Field`; pillole → `StatusBadge`; togliere `outline-none` | S-M (meccanico) |
| `/privacy`, `/consiglio/[token]` | `font-medium` → `font-semibold` o normale | S |

---

## Primo audit: verificato chiuso / ancora aperto

**Chiuso (verificato nel codice):**

- A1 hover delle voci: `ui/EntryList.tsx:27` usa `border-b border-transparent hover:border-line`; `ghost` usa `hover:bg-surface-raised` (`ui/Button.tsx:22`).
- A2 item del questionario piatti: `QuestionnaireRunner.tsx:683` (`border-t border-line py-6`), barra sticky senza card (`:668`).
- A3 copertina counselor: `CounselorCover.tsx` 0 hex, 0 `linearGradient`. (Restano due chip, vedi sopra.)
- A4 `teal-*` nel percorso IDEA: sparito da `Idea*Intro/Tree/Sources/Map/Bar/Panel` e `GuidedChatIntro`; `text-[11px]` a zero.
- A6 `/gruppo`, `/consiglio/[token]`, `/privacy`: su primitive e token; nessun `dark:` nei componenti privacy.
- M4 `GoalTree` senza riquadri. M5 `glass-panel` a zero; `AnalysisModeSelector` su `EntryLink`. M7 illustrazioni SVG per le voci d'area (nessun PNG in `lib/tool-illustrations.ts`, `personal-area.ts`, `teacher-area.ts`). M10 raggi: zero fuori da admin e `DiagramBlock` (test `ui-primitives-tokens.test.ts:107`).
- B1 `app/not-found.tsx`, `app/error.tsx` presenti. B2 nessuna ombra fuori da `shadow-card/pop/modal`. B4 `text-[Npx]` 7 residui (tutti `text-[14px]/[15px]` in `visual/*` e `FlashcardsPage`). B9 `min-h-[44px]` zero. B11 `animate-spin` solo in `Button.tsx`. B12 `ClassPracticeStudents` senza card di ruolo. B13 scorciatoie classe su `EntryLink`. Filetti di sezione `border-line-strong` in 11 file; `BackButton` link di testo.
- Primitive create: `Field/Input/Select/Textarea`, `ButtonLink/buttonClasses`, `StatusBadge`, `Dialog`, `Spinner/Skeleton/TypingDots`.

**Ancora aperto:**

- A5/M1/M2/M3 **adozione delle primitive**: 142 file con campi nativi (237 `border border-line-strong` a mano in 94 file); 16 link primari a mano fuori admin; ~95 pillole in 50 file; 22 file con `fixed inset-0` e 10 con `<dialog>` contro 3 che usano `Dialog`; velature ancora miste (`bg-slate-900/50`, `bg-slate-950/80`, `bg-black/40`).
- A4 residuo `teal-*`/`sky-*`: `qsa/GuidedChatInterface.tsx` (11), `IdeaConclusion.tsx` (5), `FreeChatInterface.tsx` (3), `IdeaTabs.tsx` (1), `SessionReport.tsx:181` (1).
- M6 colori dei fattori: `qsa/ScoreInputForm.tsx:21-27` ancora `purple/cyan/green`.
- M8 avvisi a mano: 50 occorrenze in 28 file (erano 98); es. `InstrumentCatalog.tsx:93`, `:140`, `strumenti/[id]/page.tsx:150`, `:169`, `LearnerProfileCard.tsx:476`.
- M9 target piccoli: `h-9`/`h-11` in 16 file non-admin (`RecommendationsPanel.tsx` 14, `ui/ChatShell.tsx` 4, `ui/InlineRename.tsx` 3); `size="sm"` fuori admin in `ClassPathsTab.tsx` (5), `StepPresentationFields.tsx` (6).
- B3 primitive `ui/` su palette grezza: ~200 classi in 25 file (`DiagramBlock` 38, `ChatMarkdown` 20, `ChatOptionsMenu` 15, `ChatShell` 13, `InlineRename` 12 con 4 `dark:`…).
- B6 `outline-none` ancora in 45 file (19 admin, 5 `ui/`, 21 altri, es. `app/profilo/page.tsx`, `PortfolioCard.tsx`, `LearnerProfileCard.tsx`, `VisualTools.tsx`).
- B7/B8 pesi: `font-bold` 12, `font-medium` 70 in 30 file; `uppercase` 14 in 10 file.
- Dichiarati aperti in `design.md`: `IntroScreen.tsx:38`, `InstrumentCatalog.tsx:184`.
- Non coperti dal primo audit e trovati ora: sottopagine a sezione di `/profilo`, strumenti visivi, schede della classe docente, `/bussola`, `/assistente`, `/questionario`, `/guide`.

---

## Pacchetti di lavoro proposti (una PR ciascuno, base `main`)

**PR A — Sottopagine di `/profilo` piatte (giudizio, M).**
`/profilo/compilazioni`, `/taccuino`, `/portfolio`, `/orientamento`, `/analisi-combinata`, `/classi`, `/telegram`, `/tavolo`, più `ActiveActionsCard` sulla home. File: `app/profilo/page.tsx`, `profile/LearnerProfileCard`, `TeacherNotesCard`, `PortfolioCard`, `OrientationDirectoryCard`, `CrossSynthesisCard`, `MyGroupsCard`, `MeetingDetails`, `TelegramLinkCard`, `ResultReadingCard`, `ActiveActionsCard`, `tavolo/TavoloList`. Serve giudizio su come raggruppare senza riquadri (compilazioni e portfolio). Verifica: zero `<Card` senza `variant="flat"` e zero `rounded-full px-` in quei file.

**PR B — Pagina della classe docente piatta (giudizio, M).**
Schede Panoramica, Orientamento, Osservazioni, Consiglio, Studenti, Registro di `/docente/classi/[id]`: `Card` → flat/`EntrySection`, pillole → `StatusBadge`, card tinte → `RoleBadge` + filetto, `ClassImageModal` → `Dialog`. Stesso criterio di verifica.

**PR C — Strumenti visivi e pagine isolate (giudizio leggero, M).**
`visual/VisualTools`, `PersonalTimeline`, `TimelineCalendar`, `ExperienceReview`, `FlashcardsPage`; `/questionario`, `/guide`, `/bussola` (card → flat), `/assistente` (ombre), `/strumenti/[id]`, `/somministrazione`, `AdministrationStepFlow`. Si può dividere in due se troppo grande: C1 strumenti visivi, C2 pagine isolate (C2 è quasi meccanico).

**PR D — Adozione meccanica delle primitive (MECCANICO, adatto a un modello economico, a lotti).**
Regole fisse, nessuna scelta di disegno:
1. `<input|select|textarea>` con `rounded-control border border-line-strong` → `Input`/`Select`/`Textarea` (+ `Field` dove c'è l'etichetta); togliere `outline-none`.
2. `<Link|a>` con `bg-brand … text-ink-on-brand` → `ButtonLink` (16 punti elencati sopra).
3. `rounded-full px-* text-xs font-semibold bg-*-soft` → `StatusBadge` con il tono corrispondente.
4. coppie `border-<stato>-line bg-<stato>-soft` → `Callout`.
5. `font-bold`/`font-medium` → `font-semibold`; `h-9`/`h-11`/`min-h-11` → `min-h-control`/`h-control`; `size="sm"` → `md` fuori admin.
6. `ForumView.tsx`: `slate-*`/`bg-white` → token.
Lotti: (1) area personale, (2) area docente, (3) pagine isolate. Un test di guardia per lotto (elenco file, regex a zero). Le modali a mano → `Dialog` vanno in A/B/C perché cambiano focus e chiusura: non sono meccaniche.

**PR E — Stack chat sui token (misto, L, per ultima).**
E1 (MECCANICO): primitive `ui/*` della chat sui token + estensione di `lib/ui-primitives-tokens.test.ts`; tabella di sostituzione unica (`text-slate-900`→`text-ink`, `-700`→`text-ink-body`, `-500/-600`→`text-ink-muted`, `border-slate-200`→`border-line`, `-300`→`border-line-strong`, `bg-white`→`bg-surface`, `bg-slate-50`→`bg-surface-sunken`, `bg-slate-100`→`bg-surface-raised`, `bg-indigo-600`→`bg-brand`, `hover:bg-indigo-700`→`hover:bg-brand-hover`, `bg-indigo-50`→`bg-brand-soft`, `border-indigo-200`→`border-brand-line`, `text-indigo-600/700`→`text-link`, `text-white` su brand→`text-ink-on-brand`, `red-*`→`danger-*`, `amber-*`→`warning-*`, `emerald-*`→`success-*`).
E2 (giudizio): `GuidedChatInterface`, `FreeChatInterface`, `ChatWorkspace`, `RecommendationsPanel`, `Idea*`, `ScoreInputForm`, `PDFUploader`, `ChatSettingsCard`, `SessionReport`: stessa tabella più le scelte su `teal/sky`, pillole `uppercase`, colori dei gruppi di fattori e `IntroScreen`. In chiaro il colore non cambia (i token valgono gli stessi `slate`/`indigo`), quindi il rischio visivo è basso; il guadagno è il tema scuro senza remap e la fine della doppia lingua.

**Facoltativa — PR F, raggi dell'admin (MECCANICO, M).** 311 sostituzioni in `components/admin/`, poi togliere l'esenzione in `ui-primitives-tokens.test.ts:112`.

Ordine consigliato: A (più visibile, a un clic dalla home), poi B, C, D a lotti in parallelo con un modello economico, E per ultima.
