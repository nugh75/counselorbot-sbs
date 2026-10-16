# Audit della navbar e piano di miglioramento

Data: 16 ottobre 2026. Base analizzata: `5bf65bfa` (`origin/main`), branch
`docs/audit-navbar`. Agente: **n1-codex-audit-navbar**, Codex gpt-6.1-sol high.
Issue: [#328](https://github.com/nugh75/counselorbot-sbs/issues/328).
Milestone: [#21 — Navbar redesign (Oct 2026)](https://github.com/nugh75/counselorbot-sbs/milestone/21).
Obiettivo Diario `165d3bbe-adde-41ad-9628-50f0d05be0d2`; compito
`47e0e240-b43d-4dbd-9fe9-f484ed46ec80`.

## Esito e perimetro

La barra globale mescola accessi al lavoro, strumenti della conversazione,
preferenze e account. Su desktop prevalgono icone senza etichette visibili;
Area docente e Amministrazione restano nel menu a tre punti a ogni larghezza.
Su mobile lo stesso menu contiene quasi tutto. La priorità proposta è rendere
leggibili gli ingressi, distinguere navigazione, contesto chat e account,
conservando autorizzazioni, URL e comportamento delle bozze.

Questo audit **non modifica l'applicazione**. Inventaria integralmente la barra
globale, i suoi popover e controlli, il menu amministrativo e le intestazioni
condivise delle aree. I cataloghi di card nelle home sono riportati come
navigazione secondaria; menu di modifica di singoli record, toolbar degli editor,
tab del contenuto di una classe e indice dei capitoli della guida non sono voci
della navbar. Non si propone di riversare questi indici nella barra globale.

Le prove `file:riga` si riferiscono alla base sopra indicata. «Statico» significa
dedotto dal codice, «runtime» richiede una prova nel browser; un rischio non
equivale a un errore HTTP riprodotto. Le condizioni delle tabelle si combinano:
ruolo **e** accesso strumenti **e** viewport **e** stato locale.

## 1. Fonti e contratto dei permessi

| Riferimento | Prova e significato |
| --- | --- |
| E1 | `frontend/src/app/layout.tsx:47`, `:67`, `:68`; `frontend/src/app/globals.css:327`, `:823`: Header globale fisso da 4rem, contenuto con spazio superiore; in iframe con `embedded=1` la barra è nascosta. |
| E2 | `frontend/src/components/layout/Header.tsx:43`, `:49`, `:53`, `:69`, `:96`: identità, accesso strumenti e composizione degli elenchi. |
| E3 | `frontend/src/lib/roles.ts:3`, `:23`, `:27`, `:31`, `:35`, `:42`: docente da sottostringhe dei gruppi; ricercatore da flag o gruppi; area personale e Assistente per ogni autenticato; console per admin/ricercatore. Il commento a `:39` sui soli docenti è obsoleto rispetto alla funzione. |
| E4 | `frontend/src/lib/auth.ts:113`, `:129`; `backend/routes/admin.py:53`; `backend/auth.py:18`, `:67`, `:83`: `/api/auth/me` → `/auth/me`, identità reale verificata con proxy fidato o cookie ai4auth. `is_admin` da `ADMIN_GROUPS`/`ADMIN_GROUP` più `admins`, `is_researcher` dai gruppi. Non basta inviare arbitrariamente `Remote-*`. |
| E5 | `backend/auth.py:162`, `:171`, `:185`: anonimo → 401; admin/ricercatore ammessi da `get_current_active_admin`; docente/ricercatore/admin ammessi da `get_current_plan_manager`. Le guardie delle risorse proprie/condivise restano aggiuntive. |
| E6 | `frontend/src/lib/user-access.ts:22`, `:124`; `frontend/src/lib/use-user-access.ts:14`; `backend/routes/class_access.py:13`, `:25`; `backend/class_access.py:179`: GET `/api/user/access`, PUT `/api/user/access/view`, cache iniziale e aggiornamento della vista. `restricted=false` o payload assente fa passare `isToolAllowed`; non significa autenticazione. |
| E7 | `backend/class_access.py:53`, `:82`, `:126`, `:169`, `:204`; `backend/class_tools.py:17`, `:22`: staff escluso dal filtro classi; studente con classi attive filtrato dall'unione delle classi selezionate; vista `all` rimuove il filtro classe. Strumenti personali `assistant`/`bussola`; notebook/results/classes/assignments sempre disponibili. Guardie server su avvio/scrittura, indipendenti dalla visibilità del link. |
| E8 | `frontend/src/components/layout/Header.tsx:98`, `:131`, `:145`, `:191`, `:205`, `:307`, `:335`, `:342`: tre regimi di navigazione responsive, descritti sotto. |
| E9 | `frontend/src/lib/use-resume-entries.ts:27`, `:48`, `:78`, `:102`; `frontend/src/components/layout/HeaderResume.tsx:34`; `frontend/src/components/layout/ResumeEntry.tsx:20`: riprese server/locali/pQBL, filtro strumenti, errore con retry, cancellazione confermata. |
| E10 | `frontend/src/lib/auth.ts:139`; `frontend/src/lib/auth-urls.ts:10`: URL ai4auth/portale/manager configurati dalle variabili pubbliche di build; default ai4educ. Il link servizi è presente solo per admin/ricercatore, anche se il commento parla di tutti. |
| E11 | `frontend/src/components/layout/AccountSetupGate.tsx:25`, `:33`, `:36`; `frontend/src/components/layout/OrientationGate.tsx:35`, `:51`: la barra rimane fuori dai gate; il contenuto può richiedere taccuino/counselor o rimandare alla Bussola con `next`. |
| E12 | `frontend/src/lib/i18n.ts:1`, `:1048`, `:1138`; `frontend/src/lib/i18n-context.tsx:25`, `:32`: sei lingue IT/EN/ES/FR/DE/SV, preferenza `cb_lang`, aggiornamento di `html.lang`; fallback dei dizionari EN e poi IT in `lookup` a fine `i18n.ts`. |

I marker docente sono `docent`, `insegnant`, `teacher`, `educator`, `professor`,
`faculty`, `staff`; quelli ricerca `ricerc`, `research`, `researcher` (E3/E4).
Sono confronti per sottostringa, non sei ruoli nominativi rigidi.

### Profili d'installazione e flag

Nel percorso che costruisce Header **non esiste uno switch** docente-PC/scuola/
Console: stessa struttura, identità ai4auth e accesso classe determinano le voci
(E2–E7). Console cambia gli URL e l'origine dell'identità, non aggiunge di per sé
un ruolo frontend. Non è stato interrogato alcun ambiente installato per
attribuirgli gruppi o flag: docente-PC non implica automaticamente admin.
Riferimento operativo: `docs/operations/portable-installation.md:140`.

`chatgpt_enabled` e API personali non aggiungono voci al menu globale:
`PersonalAIConnections` compare nelle home `/profilo` e `/docente` solo se almeno
una funzione è disponibile. Un solo link `/{area}/api-personali`, icona `KeyRound`
se API disponibili altrimenti `Bot`, testo `personalAPIText(sectionTitle)`;
account di prova esclusi. Prove: `frontend/src/components/profile/PersonalAIConnections.tsx:9`,
`frontend/src/lib/use-personal-ai-features.ts:8` (API settings e stato ChatGPT).
Il lettore audio globale non è subordinato a questi flag.

In dev nativo `frontend/src/proxy.ts:7` inietta `DEV_AUTH_USER`, `DEV_AUTH_NAME`,
`DEV_AUTH_GROUPS` e `DEV_AUTH_SECRET` sulle sole richieste `/api/*`, solo con
`NODE_ENV=development`: per test HTTP servono segreto di sviluppo corrispondente
e backend isolato. Non è un profilo d'installazione né un bypass produttivo;
nel browser fixture l'intercettazione delle API lo precede.

## 2. Inventario completo della barra globale

Nelle tabelle: **A** anonimo; **S** studente/autenticato senza privilegi;
**D** docente; **R** ricercatore; **M** admin; **T** D/R/M.
«Tutti» comprende A; `auth` significa S/D/R/M. «Menu» è il pulsante `MoreVertical`,
non un hamburger. Non esiste attualmente un menu account separato.

| Voce italiana / chiave i18n | Destinazione o azione | Icona | Renderer e prova | Condizione |
| --- | --- | --- | --- | --- |
| CounselorBot / `nav.homeAria` = Torna alla home | `/`, ricaricamento con `<a>` | immagine `bussola.png`, testo brand | `Header.tsx:120` | Tutti, anche prima dell'identità |
| Apri la Bussola / `orientation.landing.open` | `/bussola` | `Compass` | `Header.tsx:71` | auth, accesso caricato, `isToolAllowed(access,'bussola')` |
| Assistente / `assistant.title` | `/assistente` | `Bot` | `Header.tsx:56`, `:74` | auth, accesso caricato, `isToolAllowed(access,'assistant')` |
| Guida / `nav.guide` | `/guide` | `BookOpen` | `Header.tsx:78` | Tutti dopo il caricamento identità |
| Area studente / `profile.nav` | `/profilo` | `User` | `Header.tsx:79` | auth, anche D/R/M |
| Area docente / `nav.teacherPanel` | `/docente` | `GraduationCap` | `Header.tsx:83` | T, sempre e solo nel menu |
| Area amministrazione / `nav.admin` | `/admin` | `Settings` | `Header.tsx:93` | R/M, sempre e solo nel menu |
| Menu / `header.menu` | apertura disclosure `#mobile-menu` | `MoreVertical` | `HeaderMenu`, `Header.tsx:294` | Tutti dopo identità, ogni viewport |
| Nome/email/username / nessuna chiave (dato account) | `/profilo` | nessuna | `Header.tsx:53`, `:162` | auth con almeno un identificativo, solo `xl`; nel menu compatto è testo Account (`header.account`) |
| Servizi piattaforma ai4educ / `header.services` | manager per M; portale per R | `LayoutGrid` | `Header.tsx:54`, `:62`, `:180`, `:397` | Solo R/M; URL configurabili (E10) |
| Accesso admin / `nav.adminLogin` | ai4auth login con ritorno `/admin` | `LogIn` | `Header.tsx:63`, `:191`, `:403` | A; anche se l'utente vuole soltanto entrare come studente |
| Logout / `nav.logout` | ai4auth `/logout` | `LogOut` | stesse righe della voce precedente | auth; nessun logout locale separato |
| Lettore audio / `voice.title` | apre impostazioni del lettore, non cambia rotta | `Headphones` | `Header.tsx:341`; `voice-reader/VoiceReader.tsx:103` | Tutti; sempre nel menu, anche `xl` |
| Questionario di gradimento / `nav.feedback` | `/questionario` | `ClipboardList` | `Header.tsx:210`, `:393` | Tutti, indipendente da sessione chat |
| Tema scuro/chiaro / `theme.toDark`, `theme.toLight`; aria desktop `theme.switchToDark`, `theme.switchToLight` | toggle `.dark`, salva `cb_theme` | `Moon`/`Sun` | `ThemeToggle.tsx:13`; `Header.tsx:280`, `:407` | Tutti; testo indica l'azione disponibile |
| Riduci/Rimetti il movimento / `motion.reduce`, `motion.restore` (tooltip `motion.reduceHint`/`restoreHint`) | `data-motion`, salva `cb_motion` | `Zap`/`ZapOff` | `MotionToggle.tsx:16` | Tutti **salvo** `prefers-reduced-motion: reduce`; `aria-pressed` presente |
| Cambia lingua / `nav.language` | apre selettore; `setLang` salva `cb_lang` | bandiera attuale + `ChevronDown` su desktop | `LanguageSwitcher.tsx:25`; `Header.tsx:412` | Tutti; compatto mostra titolo «Cambia lingua: Italiano» |
| Italiano, English, Español, Français, Deutsch, Svenska / `LANGUAGES[].label` | cambia lingua, chiude selettore/menu compatto | `FlagIcon` IT/EN/ES/FR/DE/SV | `LanguageSwitcher.tsx:41`; `Header.tsx:417`; `lib/i18n.ts:12` | Tutte e sei disponibili a ogni ruolo; selezione solo visiva |
| Scegli il counselor / `setup.counselor`, fallback `base.counselor.title` | `/counselor`; click semplice intercettato dal dialog globale | `User` | `HeaderCounselor.tsx:15`, `:21`; `CounselorNavigation.tsx:15` | desktop auth; compatto richiede `accountLabel`; nome visualizzato da elenco counselor, non una chiave i18n |
| Strumento selezionato / **nessuna chiave usata** | badge informativo, non link | nessuna | `HeaderInstrument.tsx:9` | ID in `counselorbot_selected_instrument`; non verifica ruolo, pagina o chat attiva |
| Vista attiva / `classViewText('label')` | PUT `/api/user/access/view` | `Layers`, select nativa | `ClassViewSwitcher.tsx:13`, `:49`; `lib/class-view.ts:17`, `:41` | auth con `access.classes` non vuoto; normalmente solo S con classi attive |
| Tutti gli strumenti; Le mie classi; Classe {name} / `classViewText('all','classes','class')` | seleziona `all`, `classes` o ID classe | nessuna aggiuntiva | `lib/class-view.ts:17`; `lib/i18n-class-view.ts:2` | Una classe: due opzioni (tutti + nome classe); più classi: tutti + unione + ogni classe; salvataggio disabilita il select; errore annunciato |
| Riprendi un’attività / `frozen.resumeTitle` | apre elenco riprese | `RotateCcw` | `HeaderResume.tsx:34`; `Header.tsx:345` | `count>0` **oppure** errore elenco; vedi tabella successiva |

I percorsi brevi dei renderer qui sopra sono sotto
`frontend/src/components/layout/` salvo dove specificato.

### Voci dinamiche e azioni ausiliarie

| Voce / chiave | Destinazione o azione | Icona e renderer | Quando |
| --- | --- | --- | --- |
| Titolo della sessione o nome strumento / `resumeLabel` con `tf('q.<tipo>.name', fallback)` | `/?frozen=<session_id codificato>`; navigazione con ricaricamento | `RotateCcw` sulla riga mobile, testo desktop; `HeaderResume.tsx:62`, `Header.tsx:351` | auth per il fetch; sessioni congelate deduplicate per ID e filtrate per strumento |
| Riprendi · strumento / `header.resume` + `resumeLabel` | `/?resume=1`, ricaricamento | come sopra; `HeaderResume.tsx:78`, `Header.tsx:367` | Punto locale presente e strumento ammesso; la lettura locale non è condizionata a `enabled` |
| Riprendi · Studiare da un PDF / `header.resume` + `pqbl.card.title` | `/profilo/pqbl` | come sopra; `HeaderResume.tsx:94`, `Header.tsx:383` | Progresso locale pQBL; non filtrato da `isToolAllowed` in `use-resume-entries.ts:89` |
| Elimina sessione: titolo / `frozen.delete` | conferma `frozen.deleteConfirm`; elimina punto congelato/locale oppure progresso pQBL | `Trash2`, `Loader2` se busy; `ResumeEntry.tsx:20` | Una azione per ogni riga ripresa; errori `frozen.deleteError`, risultati dei questionari conservati |
| Riprova / `chatLayoutLabel('retry')` | ricarica elenco congelate | nessuna; `ResumeLoadError.tsx:8` | Errore fetch; disabilitato durante retry |
| Vai al contenuto / `nav.skipToContent` | `#contenuto` | nessuna; `SkipLink.tsx:8` | Tutti, visibile al focus prima della barra |
| Anteprima account + Esci dall'anteprima / `rolePreview.banner`, `rolePreview.exit` | cancella view-as e ricarica | `Eye`, `X`; `RolePreviewBanner.tsx:16` | Banner inferiore con account demo scelto; non è Logout |

`useResumeEntries(Boolean(identity?.authenticated))` limita il **fetch** server,
non i dati locali (E9). Non assumere che l'assenza di chat aperta svuoti Riprendi.
Un punto può sopravvivere al cambio pagina; badge strumento e counselor sono
selezioni persistite, non la prova che una chat sia attiva.

## 3. Matrice di visibilità

### Ruoli e stati di accesso

`✓*` per Bussola/Assistente significa accesso caricato e chiave ammessa.
`dati` indica la condizione specifica dell'inventario, non disponibilità garantita.

| Voce/gruppo | A | S senza classi / vista all | S vista classi | D | R | M |
| --- | --- | --- | --- | --- | --- | --- |
| Brand, Guida, Menu, feedback, lettore, tema, lingua | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Movimento (se sistema non lo riduce) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Bussola | — | ✓* | ✓* se classe/unione abilita `bussola` | ✓* | ✓* | ✓* |
| Assistente | — | ✓* | ✓* se classe/unione abilita `assistant` | ✓* | ✓* | ✓* |
| Area studente (`/profilo`) | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| Area docente | — | — | — | ✓ | ✓ | ✓ |
| Area amministrazione | — | — | — | — | ✓ | ✓ |
| Servizi ai4educ | — | — | — | — | portale | manager |
| Accesso admin / Logout | accesso admin | logout | logout | logout | logout | logout |
| Nome account e counselor | — | dati | dati | dati | dati | dati |
| Vista attiva | — | dati: presente anche in `all` se ci sono classi | ✓ | — | — | — |
| Riprese congelate | — | dati | dati filtrati | dati | dati | dati |
| Ripresa locale / pQBL | dati locali possibili | dati | dati; pQBL non filtrato | dati | dati | dati |
| Badge strumento | dati locali possibili | dati | dati | dati | dati | dati |

Unione di classi = basta che almeno una classe abiliti la chiave; un lock di
classe è risolto dal backend (`backend/class_access.py:126`). La vista globale
non annulla disattivazioni amministrative dei veri strumenti: il server
`require_tool` resta autorevole (E7). Per `assistant` e `bussola`, chiavi personali
builtin, il codice esaminato non applica un flag globale alla voce Header.

Caricamento iniziale: brand e utility `xl` restano; i due placeholder `lg`
sostituiscono navigazione/menu/account finché `identity===undefined`
(`Header.tsx:136`). Errore identità risolto come anonimo; errore accesso risolto
come `null` fa passare il filtro strumenti dopo il caricamento (E4/E6).

View-as: solo un admin reale può assumere gli account allowlist; Header usa
l'identità effettiva, `/admin` verifica invece quella reale. Questo spiega un
accesso diretto admin ancora funzionante mentre la voce è nascosta in anteprima;
non è una concessione al vero studente. Prove: `auth.ts:93`, `:129`,
`backend/auth.py:143`, `frontend/src/app/admin/page.tsx:140`.

### Viewport e ordine effettivo

Classi Tailwind `lg`/`xl` senza override di breakpoint nel progetto: 1024/1280 px
con dimensione iniziale del font del browser a 16px. I breakpoint media in rem
non seguono la regola `html { font-size: 15px }` del prodotto
(`frontend/src/app/globals.css:286`), che invece riduce le misure in rem dei
controlli. La categoria fisica «tablet» non è un permesso: un tablet
in orizzontale può ricevere il layout desktop intermedio.

| Elementi | <1024 px (telefono/tablet verticale) | 1024–1279 px (tablet orizzontale/desktop stretto) | ≥1280 px (desktop ampio) |
| --- | --- | --- | --- |
| Barra | brand + tre punti | brand + vista classe + icone Bussola, Assistente, Guida, Area studente + tre punti | badge strumento/counselor + stessi ingressi + tre punti + nome + servizi + auth + Riprendi + feedback/tema/movimento/lingua |
| Menu: selezioni | strumento e counselor, account, vista classe | strumento e counselor, account; vista già in barra | selezioni e account nascosti |
| Menu: navigazione | Bussola → Assistente → Guida → Area studente → Area docente → Area amministrazione (filtrate) | solo Area docente → Area amministrazione | solo Area docente → Area amministrazione |
| Menu: seguito | lettore → riprese/retry → feedback → servizi → auth → tema → movimento → sei lingue | identico | solo lettore dopo le due voci di ruolo |
| Riprese | righe nel menu se presenti/errore | righe nel menu | popover autonomo |

Il menu ha larghezza `min(88vw,18rem)`, altezza massima
`calc(100dvh - 4.5rem)` e scroll verticale (`Header.tsx:306`). Il trigger e le righe
compatte sono da 44px; le icone desktop da `2rem` (30px con la radice a 15px), elevate a 44px con puntatore
coarse (`globals.css:351`, `:369`, `:379`). Il selettore lingua autonomo mantiene
trigger da `2rem` (30px) e opzioni da `2.25rem` (33,75px)
(`LanguageSwitcher.tsx:31`, `:48`). Il link counselor usa `min-h-11`
(`2.75rem`, 41,25px), non il minimo letterale da 44px delle righe del menu.

### Pagina, lingua e sessione

Header non legge `usePathname`: le voci restano le stesse su `/`, `/docente`,
`/profilo`, `/guide` e sottopagine; nessun `aria-current` o evidenziazione della
destinazione corrente (`Header.tsx:3`, `:107`, `:335`). Il caricamento e i gate del
contenuto non nascondono la barra (E1/E11). Eccezioni CSS: iframe embedded (E1)
e adattamento stampa/workspace in `globals.css:793`.

Le sei lingue cambiano le etichette e `html.lang`, **non** ruoli, ordinamento,
destinazioni o flag. Gli URL restano italiani. Il nome counselor arriva dal
catalogo richiesto con la lingua corrente (`HeaderCounselor.tsx:15`). Il badge
strumento legge invece il nome statico senza `t` (sezione problemi).

## 4. Navigazione secondaria e menu amministrativo

### Intestazioni delle aree

| Renderer | Voci e destinazioni | Etichette/icone e condizioni | Prove |
| --- | --- | --- | --- |
| `TeacherAreaHeader` + `TeacherBreadcrumbs` | radice `/docente`, eventuale `/docente/risorse` o `/docente/palestra`, pagina corrente; classi `/docente/classi/{id}` e tab; variante admin `/admin` → `/admin?tab=groupsClasses` → `/admin/classi/{id}` | `teacherAreaText`/`teacherAreaName`, `teacher-breadcrumbs.ts`; `ArrowLeft`, separatori `ChevronRight`; voce finale testo `aria-current=page`, non link; focus sul titolo al cambio slug, wrap e target 44px | `components/teacher/TeacherAreaHeader.tsx:18`, `TeacherBreadcrumbs.tsx:25`; `lib/teacher-breadcrumbs.ts:23`, `:121`, `:150` |
| `PersonalAreaHeader` | link unico `/profilo` prima del titolo; non menu laterale | «Area studente» da `personalAreaText('title')`, `ArrowLeft`; focus titolo, eventuale callout strumento disabilitato | `components/profile/PersonalAreaHeader.tsx:15`, `:33`; `lib/i18n-personal-area.ts:7` |
| `PageHeader` | `backHref` è fallback di cronologia con `PreviousPageButton`; oppure `onBack`; `actions`/`forward` specifici della pagina | `BackButton`/`PreviousPageButton`, non elenco di destinazioni globali; fallback letterale «Indietro» se handler senza label | `components/ui/PageHeader.tsx:21`; `components/ui/PreviousPageButton.tsx` |
| Header admin | Area docente → `/docente`, Torna alla home → `/` | `BackButton`, `nav.teacherPanel`, `nav.home`; R/M dopo verifica reale | `app/admin/page.tsx:186` |

Percorsi relativi in questa sezione sotto `frontend/src/`. Non sostituire tutti
i ritorni con link diretti senza controllare le guardie dirty/busy: il contesto
esplicita l'adozione graduale degli header (`CONTEXT.md:107`, `HANDOFF.md:875`).

Le home mantengono questi indici, non duplicati globali da aggiungere:

- `/profilo`: Piani operativi, Taccuino, I miei cambiamenti, Risultati e
  conversazioni, Analisi combinata; Obiettivi, Azioni, Timeline; pQBL, Flashcard,
  Carte, Confronto, Tavolo; Portfolio; Assegnazioni, Classi, Orientamento,
  Telegram. Rotte `/{area}/{slug}` da `lib/personal-area.ts:3`; nomi da
  `lib/i18n-personal-area.ts`, immagini da `personalAreaImages`, `ArrowRight`;
  render/filtro strumenti in `components/profile/PersonalAreaHome.tsx:171`.
- `/docente`: Progettazione AI `/?start=OBIETTIVO_DOCENZA`, catalogo obiettivi e
  piani operativi; classi gestite e relativi hub; Istituti, Classi, Compilazioni,
  Piani operativi, Incontri, Assegnazioni; Palestra/taccuini di prova; Taccuino
  docente; Libreria risorse con Strategie e Materiali; Orientamento,
  Somministrazioni. Nomi da `teacherAreaName` e `teacherAreaText`, card con immagini
  e `ArrowRight`; Strategie `Sparkles`, Materiali `BookOpen`.
  Prove: `lib/teacher-area.ts:3`, `:6`,
  `components/teacher/TeacherAreaHome.tsx:39`, `:63`,
  `DidacticDesignSection.tsx:83`, `MyClassesSection.tsx:36`, `:185`,
  `PracticeGymSection.tsx:57`, `TeacherResourcesSection.tsx:27`.
  Istituti solo docente/admin (`canManageInstitutes`); Orientamento solo quando
  prop `teacher` vera; non dedurre uguale visibilità per R dalla sola navbar.
- Connessioni AI personali: condizione e link nella sezione 1; non due voci
  globali distinte ChatGPT/API. Palestra contiene due CTA verso la stessa lista
  taccuini: possibile semplificazione locale, non doppia rotta della navbar.

### Menu amministrativo completo

Tutte le righe seguenti sono in `app/admin/page.tsx:56–127`, renderer unico:
sidebar a pulsanti da `:236` con stato visivo attivo, collassabile; sotto `xl`
select con `optgroup` da `:192`. Solo R/M dopo `getRealIdentity` (`:140`).
Destinazione logica `/admin?tab=<id>`; per `config` canonico `/admin`.
I pulsanti aggiornano stato e URL via `replaceState` (`:130`), non aprono nuove
rotte. Chiavi e icone sono elencate per evitare di confondere questi pannelli
con il nuovo menu globale.

| Gruppo | Etichetta italiana | Chiave `admin.tab.*` / id URL | Icona |
| --- | --- | --- | --- |
| Configurazione AI (`admin.group.aiConfig`) | Assistente | `assistantManager` / `assistantManager` | Bot |
| idem | Configurazione & Prompt | `config` / `config` | Settings |
| idem | Preset Modelli | `presets` / `presets` | SlidersHorizontal |
| idem | Counselor | `counselors` / `counselors` | Users |
| idem | Strategie RAG | `approvedStrategies` / `approvedStrategies` | Database |
| idem | Spiegazioni strumenti | `toolBriefs` / `toolBriefs` | Compass |
| idem | Guardiano del filo | `threadGuard` / `threadGuard` | Eye |
| idem | Strategie certificate | `certified` / `certifiedStrategies` | Award |
| idem | Catalogo letture | `readings` / `certifiedReadings` | BookOpen |
| idem | Referenti ed eventi | `orientationReferrals` / `orientationReferrals` | Compass |
| idem | Skill | `skills` / `skills` | Wand2 |
| idem | Domande assistente | `assistantQuestions` / `assistantQuestions` | MessageCircleQuestion |
| idem | Domande chat guidata | `guidedStepQuestions` / `guidedStepQuestions` | MessageCircleQuestion |
| idem | Esportazione prompt | `promptExport` / `promptExport` | Download |
| idem | Documenti RAG | `ragDocs` / `ragDocs` | FolderOpen |
| idem | Immagini del tavolo | `tavoloImages` / `tavoloImages` | ImageIcon |
| Questionari di gradimento (`admin.group.satisfaction`) | Questionari di gradimento | `surveys` / `surveys` | ClipboardList |
| Ricerca (`admin.group.research`) | Risultati Questionari | `results` / `results` | BarChart3 |
| idem | Questionari & Scale | `questionnaires` / `questionnaires` | ListChecks |
| idem | Validazione | `validation` / `validation` | Database |
| idem | Contatti ricercatori | `researchContacts` / `researchContacts` | Users |
| idem | Piani somministrazione | `administrationPlans` / `administrationPlans` | CalendarDays |
| idem | Gruppi e classi | `groupsClasses` / `groupsClasses` | Users |
| idem | Utenti e scuole | `usersSummary` / `usersSummary` | Users |
| Training dataset (`admin.group.training`) | Dataset Addestramento | `training` / `training` | BrainCircuit |
| Monitoraggio e costi (`admin.group.monitoring`) | Log Conversazioni | `logs` / `logs` | FileText |
| idem | Costi | `costs` / `costs` | Coins |
| idem | Benchmark | `benchmark` / `benchmark` | Gauge |
| idem | Trascrizione audio | `audio` / `audio` | Mic |
| idem | Esperimenti sui prompt | dizionario inline IT/EN/ES/FR/DE/SV / `promptExperiments` | Gauge |
| pQBL (`admin.group.pqbl`) | pQBL (PDF) | `pqbl` / `pqbl` | GraduationCap |
| Anteprima (`admin.group.preview`) | Anteprima ruoli | `rolePreview` / `rolePreview` | Eye |

Le etichette provengono da `lib/i18n-admin.ts` (anche spread dei dizionari
Letture e audio), eccetto esperimenti inline a `app/admin/page.tsx:112`.
`lib/admin-navigation.ts:4` enumera i 32 ID e conserva i deep link.
Gruppi e classi mostra `AdminClassesPanel` solo per admin, `GroupsPanel` anche a R
(`app/admin/page.tsx:298`). La navbar non promette quindi a R i poteri di admin
pieno; una futura separazione «Ricerca» richiede audit dei pannelli/API, non solo
rinomina della voce.

## 5. Problemi, verifiche negative e priorità

| ID / priorità | Riscontro e prova | Impatto e proposta |
| --- | --- | --- |
| N1 / P1 chiarezza | `Header.tsx:98`, `:107`, `:83`: quattro icone in linea, ingressi docente/admin sempre nel menu; a `xl` nome account e icona User puntano entrambi a `/profilo`. | Area docente poco scopribile; duplicazione vera del link personale su desktop. Etichette visibili, promozione dell'area di lavoro e nome come trigger account. Le copie responsive `lg:hidden`/`xl:hidden` sono alternative, non duplicati contemporanei. |
| N2 / P1 testi | `i18n.ts:1048`, `:2351`, `:3705`, `:5007`, `:6309`, `:7611`; `i18n-personal-area.ts:7`; `CONTEXT.md:101`: «Area studente» vs glossario «Area personale», anche per docenti/adulti. `roles.ts:39` descrive permessi ormai diversi. | Concordare un termine trasversale e applicarlo a navbar, home, titoli, guide e test. Non cambiare il significato di «profilo» (risultato del questionario). Diario `b1c0e4e3-b8bb-4a7d-8e34-f566b6cc7a02`. |
| N3 / P1 i18n | `i18n.ts:2761`, `:4063`, `:5365`, `:6667`: Assistente «docente» in ES/FR/DE/SV, mentre IT/EN e `canUseAssistant` sono generici. `HeaderInstrument.tsx:12` non usa i18n; es. `questionnaires.ts:185` nome italiano Evento significativo di studio. | Le chiavi possono essere presenti e il significato restare errato; tradurre il badge e uniformare l'audience nelle sei lingue. Etichette nel bug N2; badge nel Diario `d1bf4c59-8573-4bd0-a34f-db47720dda4c`. |
| N4 / P1 tastiera | `HeaderResume.tsx:25`, `:46`, `:55`: menu ARIA senza gestione frecce/Escape né focus iniziale/ritorno; `LanguageSwitcher.tsx:17`, `:28` manca `aria-expanded`, `aria-controls`, Escape e stato selezionato accessibile. | Implementare un unico pattern disclosure con Tab/Escape e ritorno focus; se si mantiene `role=menu`, implementare tutto il comportamento tastiera. Diario `162e6326-bcbb-47b1-94ab-9e44343912c1`. |
| N5 / P2 orientamento | Nessun pathname/`aria-current` in Header; assente landmark `<nav>` per i suoi link (`Header.tsx:101`, `:293`). Breadcrumb docente invece lo gestisce (`TeacherBreadcrumbs.tsx:25`, `:52`). | Stato corrente con match di area e sotto-rotta, landmark nominato; distinguere la home `/` dalle chat aperte tramite query. |
| N6 / P2 mobile e ordine | Menu compatto raggruppa selezioni, account, navigazione, lettore, N riprese con cancellazione, feedback, servizi, auth, tema, movimento e sei bandiere (`Header.tsx:306–437`). Desktop `xl` aggiunge molti controlli in una sola riga. | Su mobile può essere necessario scorrere per lingua/logout; su desktop con nomi lunghi o zoom va misurato lo spazio. Introdurre gruppi titolati e overflow deterministico; non dichiarare overflow riprodotto senza misura. |
| N7 / P2 robustezza | `use-resume-entries.ts:36`, `:89`: pQBL non filtrato per accesso classe; ripresa locale non subordinata all'autenticazione. `Header.tsx:133` usa authenticated, `:309` accountLabel per counselor compatto. | Verificare su logout, storage condiviso e classe che disabilita pQBL: il link può essere una ripresa legittima in sola lettura, non dedurre 403. Allineare la visibilità al contratto di ripresa senza cancellare dati locali automaticamente. Diario `854c3b63-5d10-4a16-8f27-33cbd59c41e4`. |
| N8 / P2 contrasto e target | `globals.css:309`, `:524`: focus `#155e63` su superficie scura `#1e293b`, contrasto calcolato 1,96:1; icone standard 4,76:1 chiaro e 5,71:1 scuro. Lingua desktop 30/33,75px con radice a 15px, anche con puntatore coarse (`LanguageSwitcher.tsx:31`, `:48`). | Palette icone di base leggibile; anello di focus scuro da correggere/verificare sui controlli effettivi; uniformare target touch a 44px. Calcolo sui token, non certificazione del contrasto di ogni stato nel browser. Diario `5776d4e6-b3e0-4b3c-a95a-a5321df09b06`. |
| N9 / P2 accesso anonimo | `Header.tsx:63` ritorno login sempre `/admin` e testo «Accesso admin». | Lo studente anonimo entra dal percorso sbagliato rispetto all'intento. Proporre «Accedi» con ritorno sicuro alla destinazione; preservare `/admin` per accesso amministrativo esplicito. |

### Cose controllate che non sono nuovi bug confermati

- **Diario 58970d3a, `/gruppo` → `/strumenti`: già corretto nella base.**
  `frontend/src/app/gruppo/page.tsx:99` punta a `/?view=home`; `git log -1 --
  frontend/src/app/gruppo/page.tsx` identifica `54cc63af` (catalogo confluito in
  Attività e percorsi). `/strumenti/page.tsx` non esiste, esiste
  `/strumenti/[id]/page.tsx`: il vecchio URL nudo rimane una compatibilità da
  decidere, non il link attuale da correggere di nuovo.
- **Piano operativo:** nessuna voce globale «Percorsi di classe». Gli indici
  delle aree usano `piani-operativi`; `frontend/src/lib/legacy-routes.ts:3`
  conserva i redirect permanenti delle vecchie `/docente/percorsi/*` e
  `/profilo/percorsi/*`, importati da `frontend/next.config.ts:3`, `:23`.
  Nomi interni `paths`, `?tab=paths` e immagine `percorsi-classe.png` non sono
  automaticamente etichette visibili errate. Preservare il test
  `frontend/src/lib/operational-plan-naming.test.ts`.
- **Rotte globali:** `/`, `/bussola`, `/assistente`, `/guide`, `/profilo`,
  `/docente`, `/admin`, `/questionario`, `/counselor`, `/profilo/pqbl` hanno tutte
  `page.tsx`. Controllo statico di presenza, non prova HTTP 200 autenticata.
  Gli URL esterni ai4auth/Console non sono stati chiamati.
- **403 per ruolo:** non è emersa una discordanza tra le guardie dei due
  ingressi di ruolo (E3/E5). L'Assistente ricontrolla identità e filtro
  (`app/assistente/page.tsx:404`, `backend/routes/site_chat.py:364`); la Bussola
  `require_tool` (`backend/routes/orientation.py:206`). I filtri non sono
  autorizzazioni. Rischi separati: cache durante cambi classe, errore accesso
  permissivo, permessi di singoli pannelli di ricerca; serve test HTTP isolato.
- **Accessibilità già presente:** skip link, focus globale, label delle icone,
  trigger principale `aria-expanded`/`aria-controls`, Escape con ritorno focus
  (`Header.tsx:256`), select vista nativa con label/hint/errore, target compatti
  44px, scroll del menu, impostazione movimento rispettata. L'assenza di
  frecce nel menu principale non è di per sé un errore: è un disclosure senza
  `role=menu`, attraversabile con Tab. Va testato anche l'uscire con Tab e il
  ritorno del focus dopo cambio lingua; non aggiungere un focus trap a un
  semplice disclosure senza motivazione.

## 6. Verifiche e limiti

### Esito della sessione di audit

| Controllo eseguito | Esito |
| --- | --- |
| Branch/base/remoto e assenza di modifiche iniziali | `docs/audit-navbar`, HEAD e main remoto `5bf65bfa`; worktree inizialmente pulito |
| Test Node 22 esistenti: `operational-plan-naming`, `admin-navigation`, `auth-urls`, `class-view`, `user-access` | **24/24 passati**; solo warning del runner sul tipo modulo del package |
| `python3 -m unittest discover -s scripts/tests -p 'test_platform_guidance_check.py'` | **3/3 passati** |
| `python3 scripts/check-platform-guidance.py --check --base origin/main` | Passato, prodotto e guida allineati; manifest invariato |
| Presenza delle dieci pagine globali, link attuale da `/gruppo`, riferimenti completi `file:riga` | Controllo statico passato; i riferimenti completi esistono e le righe rientrano nei file |
| Chiavi navbar/controlli/admin, confronto sorgenti nelle sei lingue | 75 chiavi esplicite presenti; limiti sotto |
| `git diff --check` | Passato |
| Browser, screenshot, elenchi realmente renderizzati per ruolo, HTTP backend | **Non eseguiti**: Next assente nel worktree; `npm ci --ignore-scripts --no-audit --no-fund` con Node 22 è rimasto bloccato per circa dieci minuti senza completare né installare il binario Next; processo arrestato. Non attribuita una causa non provata |
| `npm run i18n:check`, ESLint, TypeScript, build frontend | Non eseguiti: dipendenze incomplete; nessun sorgente app modificato, controllo i18n limitato ai sorgenti come descritto sotto |
| Docker, database, produzione, `.env`, deploy | Nessun intervento; rebuild non necessario per il solo Markdown |

Comando dei 24 test, dalla radice del worktree con Node 22:

```bash
node --test --experimental-strip-types \
  frontend/src/lib/operational-plan-naming.test.ts \
  frontend/src/lib/admin-navigation.test.ts \
  frontend/src/lib/auth-urls.test.ts \
  frontend/src/lib/class-view.test.ts \
  frontend/src/lib/user-access.test.ts
```

Nessun server dev o browser avviato: nessun processo dev da fermare alla
consegna. I cinque riscontri tecnici N2/N3/N4/N7/N8 sono registrati nel Diario
come **sospetti**, con evidenze di sorgente; non sono spacciati per difetti
verificati dal browser. Nessun bug osservato lasciato senza registrazione.

### Traduzioni

L'inventario distingue chiavi mancanti da testi semanticamente incoerenti.
Il controllo completo previsto è `cd frontend && npm run i18n:check`; la navbar usa chiavi
centrali, `ORIENTATION_DICTS`, `VOICE_DICTS`, e il select vista usa tuple di sei
valori (`i18n-class-view.ts:22`). Nomi account, titoli delle sessioni e nomi propri
dei counselor sono dati. Badge strumento è invece un'etichetta traducibile
che aggira il dizionario (N3).

Controllo statico ad hoc eseguito: **75 chiavi letterali** della navbar, controlli,
ruoli e menu amministrativo esplicitamente presenti nei frammenti di tutte e sei
le lingue; nessuna mancanza in questo insieme. Incluse le espansioni locali di
`i18n-admin.ts`, Letture e voce; il testo inline Esperimenti ha sei valori.
Non equivale all'esecuzione del checker TypeScript né a revisione linguistica:
non valida i dati dinamici e non rileva gli errori semantici di N2/N3.

### Runtime isolato

La procedura seguente è per una verifica successiva, **non eseguita in questa
sessione**. Non usare `scripts/dev-frontend.sh` alla cieca: sceglie :3107 e può leggere la
configurazione locale. Il runner fixture esistente
`scripts/dev-first-use-tests.sh:1` usa `127.0.0.1:3147`, Webpack e upstream
`127.0.0.1:9`; avvio/stop e tunnel in
`docs/operations/live-dev-environment.md:9`.
Per l'audit servono API sintetiche intercettate nel browser e blocco delle
richieste esterne, nessun DB, ai4auth reale o provider LLM. Su macOS controllare
la porta con `lsof -nP -iTCP:3147 -sTCP:LISTEN` prima dell'avvio. Tunnel da SSH:
`ssh -N -L 3147:127.0.0.1:3147 <utente>@<server>`, URL `http://localhost:3147`.

Copertura da ottenere: A/S/D/R/M a 390/768/1024/1280/1440, S con zero/una/due
classi e vista `all`, sei lingue, tema scuro, nomi lunghi, sessioni presenti,
assenza sessioni, errore elenco, chat attiva e cambio pagina. Per ogni caso
raccogliere elenco realmente visibile (non solo DOM nascosto), focus, dimensioni
e richieste. Fixture frontend non certificano i permessi del backend né gli URL
dell'installazione reale. Per il piano sono necessari anche i test HTTP sotto.

## 7. Struttura proposta e prima/dopo per ruolo

### Struttura raccomandata

1. **Navigazione principale**, etichette visibili: brand Home; «Attività e
   percorsi» → `/?view=home`; «Area personale» → `/profilo` se autenticato;
   «Area docente» → `/docente` per T. «Amministrazione» resta una voce R/M nel
   menu delle aree/overflow, con etichetta esplicita. Match corrente su prefissi
   di area, `aria-current=page` sul solo ingresso coerente.
2. **Supporto**, gruppo secondario: «Bussola» e «Assistente» con gli attuali
   filtri; «Guida» disponibile a tutti. Su ampio desktop eventuali due
   scorciatoie visibili; non competono con Area docente. «Questionario di
   gradimento» nello stesso gruppo di supporto, non tra login e preferenze.
3. **Conversazione**, gruppo distinto: counselor e strumento quando pertinenti,
   «Riprendi» solo con dati/errore. Durante la chat evitare che il badge persistito
   venga interpretato come la pagina attuale; conservare il dialog counselor
   senza perdita di bozza, gli URL `frozen`/`resume` e le cancellazioni confermate.
   L'elenco completo delle riprese rimane raggiungibile con un solo comando.
4. **Menu utente**, trigger nome/avatar con etichetta accessibile: identificativo
   non cliccabile, eventuale «Connessioni AI personali» con la policy attuale,
   «Servizi ai4educ» per R/M, «Preferenze» (tema, movimento, lingua), «Esci» in
   fondo. `/profilo` ha un solo ingresso principale: niente secondo link dal
   nome. Per A: «Accedi», lingua e preferenze accessibili senza account.
   Lettore audio sempre facilmente raggiungibile, anche dalla guida pubblica.
5. **Mobile/tablet stretto**, trigger esplicito «Menu» con icona riconoscibile,
   un pannello con gruppi nell'ordine: navigazione → supporto → conversazione →
   account/preferenze. Lingue con nome testuale, non solo bandiera; nome classe
   leggibile e vista attiva separata dai gruppi posseduti dal docente. Logout e
   lingua non devono richiedere attraversare tutte le sessioni: riprese in un
   sotto-pannello apribile. Menu verticale scrollabile, ritorno al trigger,
   chiusura Escape e su navigazione; nessun elemento fuori viewport a zoom 200%.

Gli ID i18n possono restare stabili se il significato resta quello; le nuove
etichette «Bussola»/«Accedi» e i titoli di gruppo meritano chiavi dedicate anziché
riusare testi CTA come `orientation.landing.open`. Nessun nuovo ruolo o grant
è implicito nella proposta.

| Ruolo/stato | Prima (ingressi effettivi, oltre brand/utility) | Dopo proposto |
| --- | --- | --- |
| A | Guida; Accesso admin → `/admin`; strumenti dal brand/home | Attività e percorsi, Guida, Accedi con ritorno sicuro; preferenze/lingua/lettore senza login |
| S senza classi | Bussola, Assistente, Area studente, Guida; su `xl` nome ripete `/profilo` | Attività e percorsi, Area personale; supporto Bussola/Assistente/Guida; account unico |
| S con classi | Come sopra filtrato + Vista attiva; piani/classi dentro area | Stessi ingressi con filtri invariati, vista classe esplicita; classi e piani operativi restano nell'area personale |
| D (anche PC personale senza classi) | Area studente in linea; Area docente nascosta nei tre punti | Area personale e Area docente visibili; classi, piani, risorse e palestra dentro Area docente |
| R | Come D + Area amministrazione nel menu, servizi portale | Area personale, Area docente; Amministrazione nell'elenco aree con spiegazione dei privilegi di ricerca; servizi nel menu account |
| M | Come R, servizi manager e anteprima ruoli nell'admin | Come R con azioni amministrative; anteprima rimane nell'admin e banner demo conservato |
| Admin in anteprima S/D/R | Barra dell'identità effettiva; gate admin reale; banner uscita | Stesso contratto e banner, senza voci privilegiate aggiunte alla vista simulata |

### Alternative e decisioni del Timoniere

- **Area docente visibile vs selettore «Area di lavoro».** Raccomandata voce
  esplicita per il primo rilascio: funzione centrale per D, poca ambiguità.
  Se i dati a 1024px non consentono etichette leggibili, selettore «Area» con
  Personale/Docente/Amministrazione, mostrando l'area corrente. Costi: un click
  in più e onboarding da aggiornare. Non ridurre tutte le voci a icone per farle
  entrare. Definire il breakpoint dopo misure sui nomi/localizzazioni lunghe.
- **Menu mobile disclosure vs drawer modale.** Raccomandato disclosure se contiene
  un numero controllato di link; conserva il normale Tab. Drawer solo se i gruppi
  richiedono spazio stabile: dialog nominato, focus iniziale/trap/ripristino e
  scroll lock testati. Non mescolare i due modelli ARIA.
- **«Amministrazione» per R vs voce «Ricerca».** Conservare il nome e i permessi
  attuali nella prima PR; separare Ricerca è un lavoro successivo su
  capability/pannelli/API. Un cambio di etichetta da solo non risolve i 403.
- **`/strumenti` legacy.** Nessun nuovo catalogo parallelo: alternativa raccomandata
  redirect permanente del solo URL nudo a `/?view=home`, preservando query e
  `/strumenti/[id]`; alternativa lasciare 404 e correggere solo link interni.
  Scegliere sulla base dei link distribuiti, con test indipendente dal menu.

## 8. Piano in piccole PR, Definition of Done e test

Ordine raccomandato: P0 → P1/P2 → P3 → P4 → P5. Ogni PR di implementazione resta
in bozza finché il Timoniere decide; questo documento non autorizza merge/deploy.

| Blocco / PR | Ambito contenuto | Definition of Done | Verifiche richieste |
| --- | --- | --- | --- |
| P0 `test: capture navbar visibility contracts` | Fixture sintetiche e inventario navigazione, nessun redesign | Matrice A/S/D/R/M e class view eseguibile; asserzioni sui link **visibili**, niente dipendenza da SSO/dati reali; gestione API fallite esplicita | Browser 390/768/1024/1280/1440 e bordi 1023/1024,1279/1280; sei lingue; stato attivo, tastiera, screenshot; HTTP 401/403/200 con utenti sintetici per aree e tool |
| P1 `fix: align navbar terminology across languages` | Solo testi, badge i18n e commenti obsoleti; mantenere URL e ruoli | Area personale condivisa tra navbar/home/metadata/guide; Assistente generico in sei lingue; badge tradotto con fallback per strumenti dinamici; Piano operativo invariato | `npm run i18n:check`, naming test operativo, prove indipendenti di copy su sei lingue e IT→EN senza reload; aggiornare first-use hint e account-onboarding tests |
| P2 `fix: make header disclosures keyboard accessible` | Pattern condiviso per menu, Riprendi e lingua; focus/contrasto/target | Semantica coerente disclosure oppure menu completo; Escape e ripristino focus; selezione lingua annunciata; Tab raggiunge tutto; anello focus scuro leggibile; lettore/dialog mantiene il suo opener | Playwright tastiera da skip link a contenuto, Escape su ogni popover, cambio lingua che smonta menu, ritorno dal dialog counselor/lettore, tema scuro e coarse pointer; verifica assistiva manuale documentata |
| P3 `refactor: centralize header navigation definitions` | Un'unica descrizione ordinata di link/gruppi e condizioni, stesso comportamento prima di cambiare layout | Desktop/mobile consumano lo stesso risultato; conserva menuOnly, accesso classe, loading/error, identità reale/effettiva e privacy; landmark e matcher corrente con test | Test tabellari di predicati, pagina/sottopagina e query chat; regressioni class-view/user-access, nessuna richiesta backend duplicata, assenza di flash privilegiati |
| P4 `feat: clarify desktop navigation and account menu` | Etichette, promozione Area docente, menu utente, gruppo chat, accesso anonimo | Tabella dopo applicata al desktop; un ingresso `/profilo`; servizi invariati; lettore pubblico; nessuna perdita bozze e riprese; overflow misurato | 1024/1280/1440, zoom 200%, nomi lunghi e DE/FR, tutte le identità, chat streaming e bozza dirty/busy, return path login sicuro, API personali on/off/view-as |
| P5 `feat: group mobile navigation and session controls` | Pannello mobile, ordine gruppi, accesso compatto a riprese e preferenze | Parità funzionale desktop/mobile; lingua e logout raggiungibili senza attraversare N sessioni; vista classe accessibile; nessuno scroll orizzontale | 320/390/768 portrait/landscape, altezza ridotta, touch 44px, tastiera e focus dopo chiusura, zero/una/molte riprese + errore/retry/cancellazione; iframe embedded senza doppia navbar |
| P6 `fix: preserve legacy navigation destinations` (se scelta) | Solo compatibilità URL `/strumenti` nudo e regressioni redirect | `/gruppo` resta `/?view=home`; `/strumenti/[id]` invariata; redirect operativo e query/anchor preservati, niente loop | HTTP redirect 308 e destinazione utile, deep link vecchi/nuovi, history back/forward, naming test; testare separatamente dalla PR grafica |

P0 deve anche decidere il contratto di pQBL/riprese con accesso cambiato (N7):
se il difetto è riprodotto, piccola PR `fix` distinta, prima di P4/P5.
Non includere modifiche al sistema ruoli o all'amministrazione dei pannelli nel
refactor di Header. Gli endpoint continuano a verificare ogni operazione.

### Gate documentazione e compatibilità per ogni PR di prodotto

- Aggiornare `docs-counselorbot/funzionalita-counselorbot.md`, guida interfaccia
  nelle sei lingue, hint del primo accesso e screenshot pertinenti, inclusi
  percorsi descritti nel materiale docente. Cercare nomi vecchi e istruzioni
  «premi l'icona»; non cambiare solo il dizionario. Contratto in `CONTEXT.md:39`.
- Eseguire `make guidance-refresh`, `make guidance-check`,
  `python3 scripts/check-platform-guidance.py --check --base origin/main` e
  includere `docs/operations/platform-guidance-state.json` quando necessario.
  Il check rileva omissioni, non certifica il testo. Questo audit documentale
  non cambia superfici prodotto e non deve aggiornare artificialmente il manifest.
- Conservare `/profilo`, `/docente`, `/admin?tab=...`, `?section=...`, inviti
  `/gruppo?g=...`, `/somministrazione/...`, query `start`/`frozen`/`resume`/`next`,
  hash di azioni/assegnazioni e redirect `/counselorbot/*` e `percorsi/*`.
  Non rinominare URL solo per uniformarli alle etichette. La lingua non va
  inserita nelle rotte senza un piano separato.
- Rieseguire test pertinenti di first-use, account onboarding, recupero chat,
  design usability, docente e guardie sulle bozze; lint e TypeScript sui file
  modificati, build frontend quando cambia l'app. I test non devono approvare
  automaticamente qualunque copia leggendo gli stessi dizionari del renderer.
- Per modifiche di app copiata nell'immagine, rebuild di validazione separato
  secondo le regole del repository; mai Compose sullo stack portabile per
  mostrare una modifica. Nessun Docker rebuild richiesto per questo solo Markdown.

## 9. Criteri di accettazione del redesign

Una persona riconosce dove andare senza conoscere le icone; D apre Area docente
dalla navigazione principale; S non vede ingressi di gestione; R conserva il
proprio accesso senza diventare admin; A può accedere con ritorno coerente.
Ogni funzione attuale resta raggiungibile anche a 320px, in sei lingue, con
tastiera e preferenza movimento ridotto. Stato corrente, menu account e contesto
chat sono distinguibili. I test verificano autorizzazioni e assenza di perdite
di bozza, non solo screenshot. Nessun URL salvato viene rotto incidentalmente.
