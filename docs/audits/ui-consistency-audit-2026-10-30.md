# Audit di coerenza grafica del frontend — 30 ottobre 2026

Passo 1 di 4 del piano: **1 audit**, 2 token semantici, 3 migrazione per zone,
4 revisione UX. Issue #690.

**Metodo.** Sola lettura di `frontend/src` (597 file `.ts`/`.tsx`, test esclusi)
con `grep` e piccoli script Python. Nessun dev server, nessun browser: i numeri
sono **occorrenze nel sorgente**, non pixel misurati. Le osservazioni UX (§8)
sono ipotesi da verificare nel passo 4.

**Lettura veloce.** Il sistema dichiarato in `docs/design.md` è solido
(petrol, ocra, solo slate, remap scuro centralizzato) e il colore è in buona
parte rispettato: `gray-*`, `zinc-*`, `stone-*`, `neutral-*` sono a **zero**.
L'incoerenza vera sta **nelle forme e negli stati**: 659 `<button>` scritti a
mano contro 526 `<Button>`, 39 combinazioni diverse di bottone primario, tre
grigi per il testo secondario, tre raggi per le card, quattro dialetti di focus,
e un'altezza "44px" che a radice 15px vale 41px.

---

## 1. Inventario per zona

### 1.1 Adozione delle primitive (`components/ui`)

File che importano la primitiva (esclusa `ui/` stessa):

| Primitiva | File | Note |
| --- | --- | --- |
| `Button` | 96 | 526 usi JSX; **659** `<button>` grezzi in tutto il codice |
| `Callout` | 50 | 155 usi; ~146 box colorati ancora a mano (§1.3) |
| `Card` | 31 | 67 usi; 682 card a mano (335 senza padding, 347 con sei padding diversi) |
| `Tooltip` | 17 | |
| `Toast` | 14 | 78 chiamate `toast.*`; molte pagine usano ancora messaggi di stato propri |
| `BackButton` / `PreviousPageButton` / `ForwardButton` | 13 / 6 / 8 | |
| `PageHeader` | **7** | contro 45 `<h1>` scritti a mano |
| `ConfirmInline` | 5 | contro ~70 `window.confirm` in 38 file |
| `Skeleton` | 4 | 13 usi; 152 spinner (`animate-spin`/`Loader2`) |
| `StickyActions` | 4 | |
| `FlowStepper` | 1 | solo percorso guidato |

`design.md` cita `CompassMark.tsx` e `SkipLink` fra le primitive di `ui/`:
`CompassMark.tsx` non esiste più nel repo, `SkipLink` sta in `components/layout/`.

### 1.2 Tabella per zona

Calcolata seguendo gli import di ogni `page.tsx` (librerie, `ui/` e `layout/`
esclusi). I file condivisi fra zone contano in ciascuna: i totali non si sommano.

| Zona (route) | File / righe | `<button>` / `bg-indigo-600` a mano | Card a mano / `glass-panel` | `<h1>` / spinner |
| --- | --- | --- | --- | --- |
| Pubblico e home (`/`, `/guide`, `/privacy`, `/unisciti`, `/login`…) | 60 / 13.0k | 110 / 26 | 22 / 33 | 12 / 52 |
| Area personale (`/profilo/*`, `/tavolo/*`) | 75 / 10.6k | 104 / 33 | 48 / 17 | 8 / 30 |
| Piano e percorsi (`/profilo/piani-operativi/*`, obiettivi, assegnazioni) | 75 / 13.9k | 126 / 21 | 32 / 22 | 5 / 55 |
| Questionari e chat guidata (`/questionario`, `/somministrazione/*`, `/strumenti/[id]`, `/inizia`, `/counselor`, pQBL) | 20 / 4.7k | 28 / 18 | 10 / 35 | 10 / 8 |
| Bussola e Assistente | 8 / 1.7k | 13 / 2 | 6 / 7 | 4 / 8 |
| Area docente (`/docente/*`) | 94 / 15.1k | 110 / 17 | 51 / 3 | 5 / 18 |
| Amministrazione (`/admin/*`) | 122 / 37.4k | **386 / 73** | **163** / 28 | 5 / 108 |

Cosa usa ogni zona, e cosa rifà a mano:

- **Pubblico e home.** Usa quasi tutto il kit chat (`ChatShell`, `ChatBubble`,
  `ChatMarkdown`, `FlowStepper`, `ForwardButton`). Rifà a mano: CTA della home
  (`components/home/ReturningHome.tsx:335`, `min-h-[44px] px-3.5`), card delle
  categorie con `glass-panel` diretto, intestazioni `h1` (`app/page.tsx:948`,
  `:1041`) invece di `PageHeader`.
- **Area personale.** `PersonalAreaHeader` è un secondo header di pagina accanto
  a `PageHeader` (stessa scala `text-2xl font-bold`, più `tracking-tight`).
  `app/profilo/page.tsx` è il caso più denso: bolla utente ricostruita a mano
  con `prose` (`:779`), primari `py-2.5` senza altezza (`:420`, `:439`),
  `window.confirm` per l'uscita dalla bozza (`:166`).
- **Piano e percorsi.** Kit chat usato bene nei passi; le card del piano sono
  `rounded-lg border bg-white` a mano (`components/profile/ClassPathHeroCard.tsx`
  porta anche 34 varianti `dark:`, contro la regola §6 di `design.md`).
- **Questionari.** Zona più vicina al sistema: `PageHeader`, `StickyActions`,
  `BackButton`/`ForwardButton`. Resta il primario a mano di `/questionario`
  (`app/questionario/page.tsx:497`, `min-h-[44px] px-6`) e i titoli `text-xl`
  di `/somministrazione/[instrument]` e `/strumenti/[id]` (`:28`, `:80`, `:92`)
  fuori dalla scala dichiarata.
- **Bussola e Assistente.** Allineate allo standard chat; titolo `text-3xl
  font-display` (`app/bussola/page.tsx:278`) diverso da `PageHeader`.
- **Area docente.** `TeacherAreaHeader` terzo header di pagina. Card a mano
  ovunque (51), quasi mai `glass-panel` (3). Skeleton usato (unica zona con
  adozione regolare).
- **Amministrazione.** Il grosso del debito: 386 `<button>`, 73 primari a mano,
  163 card a mano, 108 spinner, bottoni `h-9` (36px nominali) come taglia di
  default dei pannelli. `.admin-shell` in `globals.css` compensa i target solo su
  puntatore grossolano.

### 1.3 Pattern ricreati a mano

- **Bottoni**: 659 `<button>`; 95 primari `bg-indigo-600 text-white` su
  `<button>` in **39 combinazioni** di classi, più 22 su `<Link>`/`<a>`.
- **Card**: 682 contenitori `bg-white border rounded-*`/`glass-panel`; padding
  `p-4` 131, `p-3` 62, `p-6` 42, `p-8` 41, `p-5` 39, nessuno 335. `Card` fissa `p-6`,
  che è solo la terza scelta.
- **Header**: tre componenti (`PageHeader`, `PersonalAreaHeader`,
  `TeacherAreaHeader`) e 45 `<h1>` a mano.
- **Callout**: box `bg-X-50` + `border-X-200/300` a mano: indigo 62, amber 32,
  red 31, emerald 7, rose 6, sky 6, green 2.
- **Toast/stato**: `Toast` in 14 file; altrove messaggi "Salvato"/errore con
  stato locale e stili propri, una forma per pannello.
- **Stati vuoti**: ~80 chiavi `*empty*`, nessun componente. Stili misurati sulle
  righe con classe esplicita: `text-sm text-slate-500` (12), `text-sm
  text-slate-600` (9), `py-5 text-center` (`FlashcardsPage.tsx:205`), `px-3 py-6
  text-center` (`CertifiedStrategiesPanel.tsx:357`), box grigio
  (`SharingRevocation.tsx:131`), `py-8 text-center` (`RagDocsPanel.tsx:497`),
  testo ambra (`PersonalAPISettings.tsx:211`).
- **Caricamento**: 90 `animate-spin` + 62 `Loader2` contro 13 `Skeleton`.

---

## 2. Palette di fatto

Occorrenze delle utility (con varianti `hover:` ecc.) e numero di file.

### 2.1 Per ruolo probabile

| Ruolo | Classi in uso (occorrenze) | Doppione? |
| --- | --- | --- |
| Testo primario | `slate-900` 303, `slate-800` 435 | **sì**: due neri per titoli e corpo |
| Testo corpo | `slate-700` 545 | |
| Testo secondario | `slate-500` 1241, `slate-600` 720, `slate-400` 100 | **sì**: tre grigi |
| Testo su primario | `white` 208 | |
| Link / testo accentato | `indigo-700` 307, `indigo-600` 152, `indigo-800` 40 | **sì** |
| Superficie | `bg-white` 778 | |
| Superficie incassata | `bg-slate-50` 424, `bg-slate-100` 174 | **sì** |
| Bordo | `slate-200` 831, `slate-300` 390, `slate-100` 84 | **sì**: tre spessori visivi |
| Divisore | `divide-slate-100` 24, `divide-slate-200` 14 | sì |
| Primario (riempimento) | `bg-indigo-600` 160, hover `bg-indigo-700` 106 | |
| Primario tenue | `bg-indigo-50` 186, `bg-indigo-100` 39 | |
| Bordo accentato | `indigo-200` 86, `indigo-300` 52, `indigo-400` 35, `indigo-500` 30 | **sì** |
| Ocra (movimento) | ~40 occorrenze in tutto (`bg-ochre-600` 9, `text-ochre-*` 9) | usata pochissimo |
| Errore | testo `red-600` 96, `red-700` 85, `red-800` 23, `red-500` 17; `rose-*` 32 | **sì** (+ `rose`) |
| Avviso | testo `amber-800` 51, `amber-900` 41, `amber-700` 39, `amber-600` 25 | **sì** |
| Successo | testo `emerald-700` 61, `emerald-600` 34; `green-*` 28 | **sì** (+ `green`) |
| Info | `bg-sky-50` 13 / `bg-indigo-50` (Callout) | due famiglie |
| Anello focus | `ring-indigo-500` 43, `ring-indigo-400` 28, `ring-teal-500` 6 | **sì** |

Famiglie fuori lista con peso visibile: `teal` (40 testo, 40 sfondo, 19 bordo,
quasi tutti in `components/qsa/Idea*`, `OpenCodeExperience`), `violet` 29,
`purple` 12, `blue` 13, `cyan` 13.

### 2.2 Hex e rgb letterali

188 letterali di colore in 16 file (esclusi numeri di issue tipo `#174`):

| File | Letterali | Ammesso da `design.md`? |
| --- | --- | --- |
| `components/questionnaire/CounselorCover.tsx` | 91 | no (copertine generate) |
| `components/layout/FlagIcon.tsx` | 18 | sì di fatto (bandiere) |
| `components/admin/ResearchContactsPanel.tsx`, `AdministrationPlansPanel.tsx` | 12 + 12 | sì (fogli QR stampati) |
| `app/profilo/page.tsx` | 11 | no (`#334155`, `#64748b`, `#e2e8f0`…) |
| `components/admin/SurveyViewer.tsx` | 10 | parziale (grafici) |
| `components/qsa/ProfileVisualization.tsx`, `lib/ztpi-model.ts` | 9 + 3 | sì (segni delle zone) |
| `components/ui/MessageDiagramButton.tsx` | 2 | **no**: `design.md` ammette solo `DiagramBlock.tsx` |
| `components/qsa/OpenCodeExperience.tsx`, `lib/opencode-terminal.ts` | 3 + 4 | terminale scuro |

Valori arbitrari: `text-[11px]` **115** (design.md ne contava 39),
`text-[10px]` 9 (dovevano essere zero dopo `text-2xs`), `text-[15px]` 6,
`bg-[#0b0f17]`, `bg-[#131924]`, `text-[#17747a]`, `text-[#41707a]`.

### 2.3 Tema scuro

Il remap `.dark` copre slate, indigo, ocra e i pastelli `-50/-100`. Restano
fuori, e quindi chiari su fondo scuro: `text-teal-600/700/800` (21),
`border-amber-200` (28), `border-red-200` (32), `border-sky-400` (28, focus
admin), `text-rose-600/700` (24). Inoltre **182** varianti `dark:` scritte ai
call-site (prime: `ClassPathHeroCard.tsx` 34, `OrientationDirectoryCard.tsx`
16, `docente/orientamento/page.tsx` 14, `privacy/*` 26), contro la regola
"niente `dark:` sui call-site".

---

## 3. Altre scale

- **Raggi**: `rounded-md` 878, `rounded-lg` 426, `rounded` 215, `rounded-full`
  207, `rounded-xl` 146, `rounded-2xl` 19. Il sistema dice card `rounded-xl`
  (via `glass-panel`) e controlli `rounded-md`: `rounded-lg` (426) e `rounded`
  (215) sono il terzo e quarto raggio senza ruolo. Le card a mano usano quasi
  sempre `rounded-lg`, non `rounded-xl`.
- **Ombre**: `shadow-sm` 77, `shadow-xs` 27, `shadow-2xs` 16, `shadow-xl` 14,
  `shadow-md` 14, `shadow-lg` 13, `shadow-2xl` 8, `shadow` 7. Otto livelli per
  un'identità con "ombre quasi assenti": servono tre (card, popover, modale).
- **Padding delle card**: vedi §1.3 (`p-3`…`p-8`, sei valori).
- **Titoli**: `h1` → `text-2xl font-bold` 29, `text-3xl font-display` 5,
  `text-xl font-bold` 3, `text-xl font-semibold` 2, `text-lg font-semibold` 2.
  `h2` → 15 combinazioni, le prime `text-lg font-bold` 69, `text-xl font-bold`
  17, `text-lg font-semibold` 17, `text-xl font-semibold` 12. Pesi: `semibold`
  1178, `medium` 617, `bold` 355.
- **Testo**: `text-sm` 1798, `text-xs` 1441, `text-2xs` 99 + `text-[11px]` 115
  + `text-[10px]` 9: tre gradini sotto `text-xs`, due fuori scala.
- **Larghezze**: `page-narrow` 22 e `page-wide` 21 usi; accanto, contenitori
  a mano `max-w-2xl` 29, `max-w-3xl` 24, `max-w-xl` 23, `max-w-md` 27,
  `max-w-5xl` 8, e `max-w-[96rem]` in `app/admin/page.tsx:175`. 49 `page.tsx` su
  76 non dichiarano una larghezza (la ereditano dal componente).
- **Altezze dei bottoni** (659 `<button>`): `min-h-11` 71, `h-9` 49,
  `min-h-[44px]` 29, `h-10` 11, `h-11` 11, `h-[44px]` 10, `min-h-9` 12, `h-7` 7
  (selettori formato/lunghezza/ragionamento), `min-h-[36px]` 7; **≈280** senza
  altezza dichiarata (`py-2` 71, `py-1` 50, `py-1.5` 48, `p-1.5` 27…) e 144 con
  classi variabili o senza `h`/`py`. A radice 15px **`h-11`/`min-h-11` = 41px**:
  solo `min-h-[44px]`, `h-[44px]`, `tap-icon` (su touch) e `min-h-[48px]`
  arrivano davvero a 44px (≈55 bottoni).
- **Focus**: anello globale `:focus-visible` in `globals.css`, poi quattro
  dialetti locali: `focus:ring-indigo-*`/`focus-visible:ring-indigo-*` (≈60), `focus-visible:outline-indigo-600`
  (25), `focus:border-sky-400` (26, admin), `focus:ring-teal-500` (6). 103 classi
  con `outline-none`: quasi tutte rimpiazzano l'anello; tre campi no (§4).

---

## 4. Varianti incoerenti più visibili

1. **Bottone primario: 39 varianti.** Stesso petrol, forme diverse:
   - `h-9 px-3 rounded-md text-sm font-medium` — `components/admin/CertifiedStrategiesPanel.tsx:317` (10 usi)
   - `px-4 py-2 rounded-md text-sm font-semibold` — `components/admin/AudioModelsPanel.tsx:170` (9)
   - `h-9 px-3 rounded-md text-sm font-semibold` — `components/admin/AssistantQuestionsPanel.tsx:232` (9)
   - `px-3 py-1.5 rounded text-xs font-semibold` — `components/admin/PromptMap.tsx:550` (5)
   - `min-h-11 px-3 rounded-lg text-sm font-medium` — `components/tavolo/TavoloCanvas.tsx:353` (5)
   - `py-2.5 rounded-md font-semibold` — `app/profilo/page.tsx:420`
   - `py-3 rounded-md font-semibold` — `app/profilo/pqbl/page.tsx:608`
   - `min-h-[44px] px-6 rounded-md text-sm font-semibold` — `app/questionario/page.tsx:497`
   - `px-5 py-3 rounded-md text-sm font-semibold` — `components/qsa/OpenCodeExperience.tsx:488`
2. **`Button` stesso sotto i 44px.** `components/ui/Button.tsx` usa `min-h-11`
   per `md`/`lg` e il commento dice "partono da 44px": a radice 15px sono 41px.
   Stesso equivoco in `InlineRename.tsx:48` e nei 71 `min-h-11`.
3. **Testo secondario a tre grigi.** `slate-500` (1241), `slate-600` (720),
   `slate-400` (100) per lo stesso ruolo: es. sottotitolo `PageHeader`
   `text-slate-500` (`components/ui/PageHeader.tsx`), descrizione
   `PersonalAreaHeader` `text-slate-600` (`components/profile/PersonalAreaHeader.tsx:33`).
4. **Tre header di pagina.** `PageHeader` (7 file), `PersonalAreaHeader`,
   `TeacherAreaHeader` (`:31`), più 45 `h1` a mano con quattro scale.
5. **Callout info in due colori.** `design.md` §2.4 dice info = `sky`;
   `components/ui/Callout.tsx` usa `indigo-50`/`indigo-200` (commento "pale
   teal"), e 6 box info a mano restano `sky-50`.
6. **Card con tre raggi e sei padding.** `glass-panel` (`rounded-xl`) contro
   card a mano `rounded-lg border bg-white p-4` (es. area docente, 51 casi).
7. **Bolla di chat ricostruita.** `app/profilo/page.tsx:779`:
   `bg-indigo-600 text-white prose prose-sm prose-invert` invece di
   `ChatBubble`/`ChatMarkdown`.
8. **Conferme native.** ~70 `window.confirm` in 38 file (es.
   `components/goals/GoalDialog.tsx:24,110,149`, `components/forum/ForumView.tsx`
   5, `components/teacher/OrientationTab.tsx` 5) contro `ConfirmInline` in 5.
9. **Campi di ricerca senza focus visibile.** `outline-none` sull'input e
   nessun `focus-within` sul contenitore: `app/profilo/page.tsx:525`,
   `components/profile/PortfolioCard.tsx:306`; meno grave
   `components/admin/SectionFilter.tsx:135` (popup con `autoFocus`).
10. **Hex fuori regola.** `components/ui/MessageDiagramButton.tsx` (`#17747a`)
    e `app/profilo/page.tsx` (grigi slate in hex), fuori dal remap scuro.

---

## 5. Confronto con i documenti

### 5.1 `docs/design.md`

| Dice | Nel codice | Esito |
| --- | --- | --- |
| Solo `slate` come neutro | `gray/zinc/stone/neutral` = 0 | rispettato |
| Niente hex petrol ai call-site | `#155e63`/`#124e52`/`#e9f2f2` solo nei fogli QR ammessi | rispettato |
| Info = `sky` (§2.4) | `Callout` usa `indigo` | **diverge** (doc o codice da aggiornare) |
| `green` doppione di `emerald` | `green-*` 66 occorrenze | aperto (già in §8.3) |
| Ocra = movimento | `ochre-*` solo ~40 occorrenze | sotto-usata: molte CTA d'ingresso restano petrol |
| Controlli `rounded-md`, card `rounded-xl` | `rounded-lg` 426, `rounded` 215 | **diverge** |
| Ombre quasi assenti | 8 livelli di ombra | **diverge** |
| `PageHeader` fissa il titolo `text-2xl` | 7 file su 76 pagine; titoli `text-xl`/`text-3xl` | **diverge** |
| Due larghezze `page-narrow`/`page-wide` | 43 usi contro ~110 `max-w-*` a mano | parziale |
| `Button` md/lg da 44px | `min-h-11` = 41px | **diverge** |
| `text-[10px]` convertito, `text-[11px]` 39 aperti | `text-[10px]` 9, `text-[11px]` 115 | **peggiorato** |
| Dark mode senza `dark:` ai call-site | 182 `dark:` | **diverge** |
| Solo `DiagramBlock.tsx` con hex | anche `MessageDiagramButton.tsx` | **diverge** |
| `CompassMark.tsx` in `ui/` | file assente | doc da aggiornare |
| ~107 `bg-indigo-600` a mano (§8.3) | 160 `bg-indigo-600`, di cui ≥117 a mano | **cresciuto** |
| `PencilButton` a 36px (§8.3) | ancora `h-9 w-9` | aperto |

### 5.2 `docs/operations/chat-ux-standard.md`

Le tre chat di riferimento (guidata, Bussola, Assistente) e i passi del piano
usano il kit condiviso. Divergenze dal codice:

- **Target**: lo standard chiede `min-h-[44px] min-w-[44px]`; i selettori di
  formato/lunghezza/ragionamento (`ResponseFormatSelector.tsx:32`,
  `ResponseLengthSelector.tsx:39`, `ReasoningSelector.tsx:50`) sono `h-7`,
  compensati solo dal CSS `.chat-options button[role="radio"]` nel menu chat.
  `ChatShell.tsx:117` ha un `min-h-9`.
- **Markdown solo da `ChatMarkdown`**: `react-markdown` importato direttamente
  in 8 file (`app/profilo/page.tsx`, `app/assistente/page.tsx:726` anteprima
  documento, `SessionReport`, `OpenCodeExperience`, `ForumView`,
  `CrossSynthesisCard`, `ProfileChangeReflection`, `StudentResultItem`) e
  `prose` in altri 9. Per i messaggi di chat il punto aperto è
  `app/profilo/page.tsx:779`; gli altri sono resoconti, già nel perimetro di
  `docs/audits/2026-10-29-chat-ux-remaining-surfaces.md`.
- **Composer**: `OpenCodeExperience.tsx:710` e `ForumView` usano `<textarea>`
  propri, non `ChatComposerInput` (superfici fuori standard, già censite in #659).
- **Bolla utente "indaco"**: è il petrol rimappato (`ChatBubble.tsx:17`),
  coerente; solo la parola nel documento è fuorviante.

---

## 6. Proposta per il passo 2 — token semantici

**Dove.** Non c'è `tailwind.config` (Tailwind v4): i token vanno in
`frontend/src/app/globals.css`. Schema consigliato:

```css
@theme inline {
  --color-ink: var(--ink);
  /* … uno per token … */
}
:root  { --ink: #0f172a; /* valori chiari */ }
.dark  { --ink: #f1f5f9; /* valori scuri */ }
```

Così `text-ink`, `bg-surface`, `border-line` cambiano col tema **senza** voci
di remap e senza `dark:`. Il remap `.dark .text-slate-*` resta finché la
migrazione non è finita, poi si accorcia.

**Nomi.** Evitare `primary`, `muted`, `accent`, `border`, `card`: esistono già in
`@theme` col significato shadcn (`--color-accent` è grigio, mentre
`Button variant="accent"` è ocra). Proposta:

| Token | Valore oggi più usato | Ruolo |
| --- | --- | --- |
| `ink` | `slate-900` | titoli, testo forte |
| `ink-body` | `slate-700` | corpo |
| `ink-muted` | `slate-500` → verificare contrasto, forse `slate-600` | secondario, sottotitoli, stati vuoti |
| `ink-on-brand` | `white` | testo su petrol/ocra |
| `surface` | `white` | card, pannelli |
| `surface-sunken` | `slate-50` | fondi incassati, righe alterne |
| `surface-raised` | `slate-100` | chip neutri, hover |
| `line` | `slate-200` | bordo standard |
| `line-strong` | `slate-300` | bordo dei campi |
| `brand` | `indigo-600` (petrol) | CTA primarie, step fatto |
| `brand-hover` | `indigo-700` | hover del primario |
| `brand-soft` | `indigo-50` | fondo selezionato, callout info |
| `brand-line` | `indigo-200` | bordo accentato, hover card |
| `link` | `indigo-700` | link e testo accentato |
| `move` | `ochre-600` | CTA d'ingresso, passo attivo |
| `focus` | `--console-focus` | anello di focus (già esiste) |
| `info-*` / `success-*` / `warning-*` / `danger-*` | da `Callout.tsx` | `bg`, `line`, `ink`, `icon` per ciascuno |

Token di forma (stesso blocco):

| Token | Valore | Ruolo |
| --- | --- | --- |
| `radius-control` | `rounded-md` | bottoni, campi |
| `radius-card` | `rounded-xl` | card, popover |
| `shadow-card` / `shadow-pop` / `shadow-modal` | `shadow-sm` / `shadow-lg` / `shadow-2xl` | tre livelli |
| `h-control` | `44px` (utility `min-h-control`) | target touch reale, non `h-11` |
| `page-narrow` / `page-wide` | già esistenti | larghezze |
| `text-2xs` | già esistente | sostituisce `text-[10px]`/`text-[11px]` |

Contestualmente: `Button` passa a `min-h-control`; `Callout` decide info = petrol
(e si corregge `design.md`) oppure `sky`; si aggiunge una primitiva
`EmptyState` e si estende `Card` con `padding="sm|md|lg"` (`p-4` default reale).

---

## 7. Proposta per il passo 3 — ordine di migrazione

Una PR per zona, basata su `main`, dopo la PR dei token. Stime sui file propri
della zona (non quelli condivisi).

| # | PR | File stimati | Rischio | Perché in quest'ordine |
| --- | --- | --- | --- | --- |
| 0 | Token + primitive (`Button` 44px, `Card` padding, `EmptyState`, `Callout` info) | ~6 | medio: tocca tutto ciò che usa `Button` | base per le altre |
| 1 | Questionari e chat guidata | ~15 | basso | zona già quasi allineata, fa da modello |
| 2 | Bussola e Assistente | ~6 | basso | chat standard, pochi residui |
| 3 | Pubblico e home | ~25 | medio: prima impressione, test navbar | alta visibilità |
| 4 | Area personale (+ `PersonalAreaHeader` su `PageHeader`) | ~40 | medio: `profilo/page.tsx` è grande, bozze e guardie di uscita | molti `window.confirm` e hex |
| 5 | Piano e percorsi | ~25 | medio: chat dei passi, `dark:` di `ClassPathHeroCard` | |
| 6 | Area docente (+ `TeacherAreaHeader`) | ~45 | medio: guardia `teacher-area-dark-theme.test.ts` | |
| 7a/7b | Amministrazione, in due lotti (pannelli contenuti / strumenti di sistema) | ~55 + ~55 | alto per volume, basso per utenti | uso interno, più debito |

Ogni PR: sostituire classi colore con token, bottoni con `Button`, card con
`Card`, `h1` con `PageHeader`, `window.confirm` con `ConfirmInline`, spinner di
pagina con `Skeleton`; aggiornare la guardia dark mode quando tocca il remap.

---

## 8. Prime 10 osservazioni UX (ipotesi da verificare nel passo 4)

1. **Target sotto 44px su telefono.** ≈280 bottoni senza altezza (`py-1`,
   `py-1.5`, `py-2`) e i 41px di `min-h-11`: probabili tocchi mancati fuori
   dall'admin, dove `.admin-shell` non compensa.
2. **Gerarchia del primario debole in admin.** Con 39 varianti e taglie `h-9`
   accanto a `px-4 py-2`, la stessa azione cambia peso da pannello a pannello.
3. **Ocra quasi assente.** Con ~40 usi, "dove sei" e "dove sei stato" si
   distinguono poco fuori da `FlowStepper`: verificare se le CTA d'ingresso di
   home e area personale portano davvero l'ocra.
4. **Secondario poco leggibile.** `slate-500` su `slate-50` e `text-[11px]` in
   115 punti: densità alta, probabile fatica di lettura su mobile.
5. **Attesa a spinner.** 152 spinner contro 13 skeleton: salti di layout al
   caricamento nelle liste (area docente, admin).
6. **Conferme native.** ~70 `window.confirm`: in tema scuro e nelle sei lingue i
   pulsanti del dialogo non seguono l'app; su iOS standalone il dialogo può
   sorprendere.
7. **Stati vuoti muti.** Una riga grigia senza azione nella maggior parte dei
   casi: manca un "cosa faccio ora".
8. **Focus invisibile nei campi di ricerca** di area personale e portfolio
   (`app/profilo/page.tsx:525`, `PortfolioCard.tsx:306`).
9. **Tema scuro a macchie.** `teal`, `rose`, bordi `amber/red/sky` non
   rimappati e 182 `dark:` locali: probabili bordi chiari e testi poco
   contrastati in Idea/OpenCode e nelle schede del piano.
10. **Titoli di pagina diversi per zona** (`text-xl`, `text-2xl`, `text-3xl`
    display, tre header): l'orientamento fra aree si regge sull'header globale
    più che sulla pagina.

---

## Appendice — come rifare i conteggi

Tutti in sola lettura da `frontend/src`, test esclusi:

```sh
# famiglie e gradini colore
grep -rEoh --include='*.tsx' '(text|bg|border)-(slate|indigo|red|amber|emerald|green|sky|teal|rose)-[0-9]{2,3}' . | sort | uniq -c | sort -rn
# bottoni grezzi vs primitiva
grep -rEo --include='*.tsx' '<button\b' . | wc -l
grep -rEo --include='*.tsx' '<Button\b' . | wc -l
# valori fuori scala
grep -rEo --include='*.tsx' 'text-\[(10|11)px\]' . | wc -l
# conferme native
grep -rn --include='*.tsx' 'window\.confirm' . | wc -l
```

L'inventario per route segue gli import di ogni `page.tsx`; gli script usati
non sono nel repo perché servono solo a questo audit.
