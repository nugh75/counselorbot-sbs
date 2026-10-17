# Contratti di visibilità della navbar (P0)

Blocco P0 del piano [audit-navbar.md](audit-navbar.md) §8, milestone
«Navbar redesign (Oct 2026)». Solo test e fixture: **nessun cambiamento di
comportamento**. I test fotografano la barra globale di oggi; ogni PR successiva
(P1–P6) che cambia voci, etichette o ordine deve aggiornare il contratto in modo
esplicito, non per effetto collaterale.

## File

| File | Cosa verifica | Dove gira |
| --- | --- | --- |
| `frontend/tests/fixtures/navbar-contract.mjs` | Identità e accessi sintetici A/S/D/R/M (S senza classi, una classe, due classi, vista `all`), etichette italiane e nelle sei lingue scritte a mano, `expectedNavbar(profilo, larghezza)` con l'elenco ordinato dei controlli visibili: sotto 1024 px barra e menu a tre punti; da 1024 px (P4) barra, pannello del selettore «Area» e pannello dell'account | Condiviso |
| `frontend/src/lib/navbar-visibility.test.ts` | Matrice ruoli: la descrizione unica `header-navigation.ts` (P3) produce il contratto di ogni profilo; bordo 1023/1024 (1279/1280 uguali da P4); ogni voce raggiungibile in ogni fascia; da 1024 px aree nel selettore «Area» (link semplice con una sola area), un solo ingresso a `/profilo`, «Esci» in fondo al menu account | `npm test` (Node 22) |
| `frontend/src/lib/header-navigation.test.ts` | Descrizione unica delle voci (P3): collocazione barra/selettore Area/menu per fascia uguale al contratto, ordine/destinazioni/gruppi, etichetta breve di barra (`barLabelKey`), account senza link, predicati in tabella (ruoli, accesso in caricamento o fallito, identità in caricamento o fallita, anteprima ruoli), pagina/sottopagina e query della chat per `aria-current` | `npm test` (Node 22) |
| `frontend/src/lib/navbar-terminology.test.ts` | Testi della barra (P1) scritti a mano nelle sei lingue: Assistente generico, «Area studente» uguale in navbar e pagine, badge strumento tradotto con ripiego sul nome del catalogo e sul codice degli strumenti dinamici | `npm test` (Node 22) |
| `backend/tests/test_navbar_area_guards.py` | HTTP 401/403/200 delle guardie dietro `/profilo`, `/docente`, `/admin` per A/S/D/R/M; marker docente/ricerca identici tra backend e `roles.ts` | pytest, nessun DB |
| `frontend/tests/navbar-visibility.test.mjs` | Navbar realmente renderizzata (Playwright): matrice 8 profili × 390/768/1023/1024/1279/1280/1440, link visibili e destinazioni, pannelli Area e account da 1024 px, caricamento identità/accesso, errori API, riprese, sei lingue, tastiera, tema e movimento; P4: «Accedi» con ritorno alla pagina, anteprima ruoli, nomi lunghi DE/FR, zoom 200% | Dev isolato :3149 |

Le etichette non sono lette dai dizionari: un cambio di testo deve comparire nel
diff del test. Per decisione dell'utente l'etichetta resta «Area studente»
(un docente può essere studente di un altro docente).

## Copertura browser

- **Visibilità**: per ogni profilo e larghezza, nomi accessibili dei controlli
  visibili (`checkVisibility`, non solo presenza nel DOM) in barra e nel menu a
  tre punti, nell'ordine reale; href delle voci (`/bussola`, `/assistente`,
  `/guide`, `/profilo`, `/docente`, `/admin`, `/counselor`, logout, accesso
  admin con ritorno `/admin`); nessuno scroll orizzontale.
- **Questionario di gradimento**: non è più in barra né nel menu (nessun link
  `/questionario` nell'header); sta nella home, subito dopo «Vedi tutte le
  attività e i percorsi», e per l'anonimo sotto «Accedi a CounselorBot».
- **Pagina (P3)**: stesse voci su `/guide`, `/profilo`, `/docente`, `/questionario`;
  la voce dell'area corrente ha `aria-current="page"` (in barra o nel menu, dove
  è visibile), nessuna su `/questionario`; landmark «Navigazione principale» in
  barra e «Navigazione del menu» nel menu, nascosto da `lg` se non contiene voci
  `menuOnly` (nessun landmark vuoto).
- **Richieste (P3)**: una sola lettura di `/api/auth/me`; riaprire il menu non
  rilegge `/api/user/access` (il selettore vista riceve l'accesso da Header).
- **Lingue**: IT/EN/ES/FR/DE/SV, `html.lang`, voci di ruolo per R e accesso
  anonimo, nessuna voce duplicata o privilegiata in più.
- **Caricamento**: con `/api/auth/me` in attesa solo brand (più utilità a
  ≥1280px) e nessun menu; con `/api/user/access` in attesa Bussola e Assistente
  nascoste, poi filtrate per classe.
- **Errori**: identità 500 o rete interrotta → barra anonima; accesso 500 o rete
  interrotta → tutti gli strumenti e nessun selettore vista (il server resta la
  guardia); elenco riprese 500 → «Riprova» in menu o popover, poi le righe.
- **Riprese**: sessioni congelate filtrate dagli strumenti della classe, link
  `/?frozen=…`, cancellazione per riga.
- **Vista classe**: cambio a «Tutti gli strumenti» con PUT e barra aggiornata
  senza ricaricare.
- **Tastiera**: skip link, brand, apertura del menu con Invio, Tab dentro il
  menu, Escape chiude e riporta il focus al trigger.
- **Pannelli dell'header (P2)**: menu a tre punti, «Riprendi» e lingua sono
  disclosure (`aria-expanded`/`aria-controls`, nessun `role=menu`); Tab entra
  nel pannello, Escape chiude e riporta il focus al trigger; a 390px Tab
  raggiunge ogni controllo visibile del menu nell'ordine del contratto e
  uscendo con Tab il menu si chiude; la scelta della lingua (barra e menu)
  espone `aria-pressed`/`lang`, riporta il focus al trigger e viene annunciata;
  la riga del tema riporta il focus al menu; anello di focus `#67c1c4` nel tema
  scuro con offset interno nei pannelli; selettore lingua a 44px con puntatore
  coarse (`hasTouch`).
- **Preferenze**: tema scuro salvato e movimento ridotto dal sistema.
- **Desktop P4 (da 1024 px)**: nessun menu a tre punti; selettore «Area» per
  D/R/M (pannello `#area-panel`, nome dell'area corrente sul pulsante,
  `aria-current` nel pannello), link «Area studente» per S; «Bussola»,
  «Assistente», «Guida» con etichetta; gruppo conversazione (counselor,
  Riprendi); menu account `#account-panel` con nome non cliccabile, servizi per
  R/M, tema, movimento, lettore, sei lingue con nome, «Esci» in fondo; per A
  «Preferenze» e «Accedi». La scelta della lingua lascia il pannello aperto e il
  focus sulla lingua premuta. «Accedi» porta a ai4auth con `rd` uguale alla
  pagina corrente con query (`/guide?…`, `/admin`). Anteprima ruoli: un admin
  che guarda come studente o docente vede la barra di quell'account, senza
  servizi. Nomi lunghi in tedesco e francese a 1024/1280/1440 (admin in
  `/docente`, studente con due classi in `/profilo`, riprese presenti): nessuna
  sovrapposizione, nessun controllo fuori viewport, etichette della navigazione
  intere. Zoom 200% emulato come viewport dimezzato a DPR 2 (finestra 2048 →
  1024 px, 1440 → 720 px). Bersagli da 44 px con puntatore coarse.
- **Screenshot**: opzionali con `NAVBAR_SCREENSHOTS=<cartella>`.

## Contratto N7: ripresa pQBL con classe che disattiva lo strumento

Deciso in P0: se la classe (o l'unione delle classi) disattiva `pqbl`, la voce
«Riprendi · Studiare da un PDF» **non** compare nella barra, come già accade
per sessioni congelate e chat locali di strumenti disattivati. Proseguire è una
scrittura che il server rifiuta (`require_tool(…, "pqbl")` su risposte e test
finale). Il progresso locale **non** si cancella e `/profilo/pqbl` resta
raggiungibile in lettura dall'Area studente.

Il test `pQBL resume is hidden when the class turns pQBL off (N7)` descrive il
contratto. La correzione (#335) passa l'ingresso pQBL per `isToolAllowed` in
`frontend/src/lib/resume-access.ts`, con test unitari in `resume-access.test.ts`;
il test browser non è più `todo`. Il caso anonimo (progresso locale visibile
anche senza login) non è deciso qui.

## Come lanciarli

Unit e backend, dalla radice del worktree:

```bash
cd frontend && npm test          # include navbar-visibility.test.ts (Node 22)
python3 -m pytest backend/tests/test_navbar_area_guards.py -q
```

Il test backend richiede le dipendenze del backend (Python ≥3.10). Senza un
ambiente locale si può usare l'immagine backend già costruita, offline e in sola
lettura, senza toccare i container in esecuzione:

```bash
docker run --rm --network none --entrypoint python -v "$PWD":/src:ro -w /src \
  -e PYTHONDONTWRITEBYTECODE=1 counselorbot-portable-counselorbot-backend:latest \
  -m pytest backend/tests/test_navbar_area_guards.py -p no:cacheprovider -q
```

Browser, in dev isolato (nessun backend, DB, SSO o provider; tutte le `/api`
intercettate nel browser, traffico esterno bloccato):

```bash
# controllare che 3149 sia libera; lo script si ferma se è occupata
bash scripts/dev-navbar-tests.sh
# in un altro terminale
cd frontend && node --test tests/navbar-visibility.test.mjs
# opzionale: NAVBAR_SCREENSHOTS=/tmp/navbar node --test tests/navbar-visibility.test.mjs
```

Variabili: `NAVBAR_BASE_URL` (default `http://127.0.0.1:3149`),
`CHROMIUM_PATH` per un Chromium di sistema, `NAVBAR_SETTLE_MS` (default 45000) per l'attesa di ogni stato. La prima compilazione di `/guide`
e delle altre pagine può richiedere minuti: la suite usa timeout lunghi.
Arresto: Ctrl-C nel terminale dello script. Da SSH:
`ssh -N -L 3149:127.0.0.1:3149 <utente>@<server>`, poi
`http://localhost:3149/guide` (senza le fixture del test non c'è backend).

## Limiti

- La CI di GitHub esegue solo i controlli di documentazione: né i test Node né
  Playwright girano in CI. La matrice ruoli è quindi anche nel test unitario;
  la suite browser va lanciata a mano prima di ogni PR navbar.
- Dal P3 il test unitario legge la stessa descrizione renderizzata da Header
  (`frontend/src/lib/header-navigation.ts`); la suite browser verifica il render
  reale, incluse le classi Tailwind che applicano `menuOnly` e le fasce.
- Le fixture non certificano gli URL ai4auth/Console dell'installazione né i
  gruppi reali; le guardie per strumento (`require_tool`) sono coperte dai test
  backend esistenti di `class_access` con PostgreSQL di test.
- Zoom 200% è emulato (viewport CSS dimezzato, DPR 2), non lo zoom reale del
  browser; nomi lunghi e overflow del menu compatto restano a P5.

## Esito della sessione P0 (16 ottobre 2026)

- `npm test` 514/514 (Node 22), incluso `navbar-visibility.test.ts` 12/12.
- `test_navbar_area_guards.py` 6/6 nel container usa-e-getta descritto sopra.
- Browser: la matrice di visibilità ha passato 55 casi su 56 al primo giro; il
  caso S2 a 768px è scaduto in attesa dell'idratazione (15s), da cui l'attesa
  portata a 45s. I test non di matrice (pagine, lingue, caricamento, errori,
  riprese, N7, tastiera, preferenze) **non hanno un esito**: la corsa è stata
  interrotta insieme al server dev per memoria scarsa sulla macchina. Vanno
  rilanciati con la procedura sopra prima di togliere la PR dalla bozza.

## Esito della sessione P2 (16 ottobre 2026)

- `npm test` 518/518 (Node 22), incluso `disclosure.test.ts`; ESLint e `tsc`
  sui file toccati, `i18n:check`, `guidance-check` passati.
- Browser, suite completa su :3149: 88 passati, 1 `todo` (N7), 1 scaduto.
  Lo scaduto è «the navbar ignores the current page»: dopo `/guide` il server
  dev sta ancora ottimizzando le schermate della guida (`/_next/image`), le sei
  connessioni del browser sono occupate e `page.goto('/profilo')` resta in coda
  oltre 600 s. Caricata da sola, `/profilo` risponde in 22 s; con
  `/_next/image` bloccato lo stesso test passa in 15 s. Non dipende dal
  prodotto; bug registrato nel Diario, da correggere nel test.
- Verifica assistiva: albero di accessibilità di Chromium (`ariaSnapshot`) a
  1440 e 390 px: `button "Cambia lingua: Italiano" [expanded]`, `button
  "Menu" [expanded]`, `button "Italiano" [pressed]`, nessun `menu`/`menuitem`.
  Nessuna prova con uno screen reader reale (VoiceOver/NVDA).

## Esito della sessione P3 (17 ottobre 2026)

- Header e menu compatto leggono `headerNavigation()` e `currentHeaderLink()`
  da `frontend/src/lib/header-navigation.ts`. Unici cambi visibili:
  `aria-current="page"` (con fondo leggero) e i due landmark `<nav>` nominati.
- La home toglie dall'URL le query della chat appena lette: Header passa solo il
  percorso al matcher. Per una futura voce «Attività e percorsi» (`/?view=home`,
  P4) il matcher supporta la query, ma serve lo stato di pagina della home.
- Verifiche: `npm test` 581/581 (Node 22), ESLint e `tsc` sui file toccati,
  `i18n:check`, guidance check; suite browser completa su :3149 **92/92**, con
  le aspettative P0 invariate salvo il caso pagina (aria-current e landmark).

## Esito della sessione P4 (17 ottobre 2026)

- Barra desktop da 1024 px come descritto sopra; menu a tre punti solo sotto
  1024 px e invariato (P5). Dopo il merge di #344 il «Questionario di
  gradimento» è solo nella home: né in barra, né nel menu a tre punti, né nel
  menu dell'account (il test della home controlla anche il pannello account).
- Verifiche: `npm test` 582/582 (Node 22), ESLint e `tsc` sui file toccati,
  `i18n:check`, guidance check; suite browser completa **101/101** su un dev
  isolato :3151, **102/102** dopo il merge di #344 (la :3149 era occupata da un altro worktree).
- `tests/account-onboarding.test.mjs`, dopo il merge di #344 e su un server dev
  appena avviato: 43/46. Passano bozza e conversazione conservate dal dialog del
  counselor aperto dalla barra (390/1024/1440), i suggerimenti di primo uso
  (counselor e Area studente nella barra da 1024 px) e l'introduzione con il
  gradimento. I 3 falliti (catalogo `/?view=questionnaires` senza titolo «QSA»)
  falliscono uguali su `origin/main`: bug sospetto nel Diario. Su un server dev
  rimasto acceso a lungo (immagini aggiunte durante la corsa) le attese su
  `/_next/image` scadevano: riavviare il server prima della suite.
- `tests/design-usability.test.mjs` «header controls outside chat do not
  overlap»: `goto('/', networkidle)` scade a 30 s anche a 768 px nel dev
  isolato; la stessa verifica (nomi lunghi, tedesco, admin) è coperta dai nuovi
  test P4 a 1024/1280/1440.
