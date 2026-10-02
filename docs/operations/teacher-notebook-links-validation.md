# Blocco B — rimandi del Taccuino del docente

> Snapshot storico S9. S14 cambia il solo ingresso Classi in un pulsante che
> apre il popup approvato. Gli altri tre rimandi e tutte le protezioni restano.
> Le verifiche B ora esercitano navigazione/modifier/new-tab attraverso Obiettivi
> personali; Classi e il suo 403 sono verificati nel popup, senza perdere
> asserzioni su payload, focus, ordine, limiti e bozze. Evidenza combinata:
> `teacher-class-management-validation.md`.

S9, 2 ottobre 2026. Base `a0ba4bbf7c0c3e3bfe62ca01fcc2986645022af6`,
con PR30/31/32. Worktree esclusivo `s9-notebook-links-1002`, branch
`feature/teacher-notebook-tool-links`. Quota e contesto iniziali verificati da
S8: 90% settimanale disponibile, GPT-6.1-Sol high, YOLO, contesto 0%.
Deroga esplicita alla revisione cross-modello: un solo costruttore,
nessun agente, modello o revisore aggiuntivo. Test tecnici mantenuti.

## Scelta dei rimandi e invarianti

Struttura e sei campi del blocco A conservati. Quattro link inline sotto gli
hint già visibili, ripresi dallo schema ASCII approvato del piano:

| Campo | Rimando | Route esistente |
| --- | --- | --- |
| Panoramica dei miei incarichi | Gestisci gruppi e classi | `/docente/classi` |
| Interessi per la mia crescita | Per la mia crescita: Obiettivi personali | `/profilo/obiettivi` |
| Altre informazioni sul mio ruolo | Per una tappa: Linea del tempo | `/profilo/timeline` |
| Altre informazioni sul mio ruolo | Per un lavoro: Portfolio | `/profilo/portfolio` |

Gli obiettivi personali riguardano la crescita del docente. Il percorso
OBIETTIVO_DOCENZA resta distinto, già presente sopra il form. Non aggiungere
anche STUDIO evita due ingressi sotto lo stesso campo e conserva la scelta
del percorso da parte della persona. Linea del tempo e Portfolio coprono tappe
e lavori; Evento professionale resta nominato nell’hint per la riflessione
guidata. Non duplicare Gruppi e classi sotto metodologie limita il rumore.
I cataloghi condivisi restano nella panoramica: nessun catalogo personale
implicito e nessuna classe inferita dal testo.

Link senza parametri, frammenti, prefill o nuovi resource kind. Nessun invio
automatico, creazione, pubblicazione, condivisione o assegnazione. Nessun cambio
di counselor, taccuino nel contesto o sessione. Nessun nuovo storage o caching
persistente. Nessuna dipendenza, backend, migrazione, API o grant modificato.
Ordine/chiavi dei campi, 600 caratteri per campo, envelope da 1.200, revisioni,
consenso/default e payload esplicito con trim/null invariati. Testi A invariati.
Il piano storico resta uno snapshot; C/D non sono implementati o avviati.

## Bozza e confini di accesso

Riutilizzata `useDraftGuard` con la conferma tradotta esistente. Le nuove
opzioni sono richieste solo dal taccuino: attendere il salvataggio prima della
navigazione interna; ripristinare focus e selezione dopo annullamento via
puntatore. La tastiera conserva il focus sul link. Gli altri form mantengono
i propri default. Link della panoramica e navigazione browser usano la stessa
protezione, senza refactor del router.

Confronto sui sei valori con la baseline: ripristinare il valore salvato rende
la bozza pulita. Successo aggiorna la baseline con i valori effettivamente
inviati; normalizza il form solo se non sono intervenute altre modifiche.
Un errore mantiene testo e guard; il ref della richiesta impedisce doppi invii.
Riletture/abort/identità S4 conservati. Modifier e nuova scheda non scartano la
bozza origine. Chiudere, ricaricare o attraversare documenti diversi può usare
la conferma nativa `beforeunload`: annullare conserva pagina e invio; il browser
resta responsabile dell’avviso nativo e dell’eventuale uscita confermata.

Le route esistono e conservano le guard: `/docente/classi` usa l’accesso
docente/ricercatore/admin e il controllo API; obiettivi, timeline e portfolio
usano l’account autenticato. L’API del taccuino resta legata a
`get_current_plan_manager`; le risorse personali restano quelle dell’utente.
Fixture per docente puro, doppio ruolo, ricercatore, admin, studente escluso
e destinazione 403. Queste prove simulano HTTP: non certificano SSO pubblico
o autorizzazioni di un account reale.

## Verifiche riproducibili

Riutilizzato `scripts/dev-teacher-loading-errors-tests.sh`: porta `3124`
libera verificata con `ss -ltn '( sport = :3124 )'`; upstream `127.0.0.1:9`.
Solo frontend localhost; API intercettate, traffico esterno bloccato, dati
anonimi in memoria. Nessun backend o DB avviato.

Da `frontend/`:

```sh
node --test tests/teacher-notebook-links.test.mjs tests/teacher-notebook-copy.test.mjs tests/teacher-loading-errors.test.mjs
DRAFTS_BASE_URL=http://127.0.0.1:3124 node --test --experimental-strip-types tests/draft-protection.test.mjs
TEACHER_AREA_BASE_URL=http://127.0.0.1:3124 node --test tests/teacher-area-home.test.mjs
VISUAL_TOOLS_BASE_URL=http://127.0.0.1:3124 node --test --experimental-strip-types --test-name-pattern='updated guide' tests/visual-tools.test.mjs
npm test
npm run i18n:check
npx tsc --noEmit --incremental false
npx eslint src/components/teacher/TeacherNotebook.tsx src/lib/use-draft-guard.ts src/lib/teacher-notebook-links.ts src/lib/i18n-guide-audiences.ts src/lib/i18n.ts tests/teacher-notebook-links.test.mjs tests/teacher-notebook-copy.test.mjs tests/teacher-loading-errors.test.mjs tests/teacher-area-home.test.mjs
GUIDE_BASE_URL=http://127.0.0.1:3124 GUIDE_SCREENS=teacher-area node --experimental-strip-types scripts/capture-guide.mjs
npm run build
```

Rosso→verde su perdita della bozza attraverso il link preesistente della home,
focus/selezione dopo annullamento e focus da tastiera dopo apertura nuova scheda.
La prima prova sulla base dà `dirty exit asks to discard: 0 !== 1`.
I test osservano pagina, controlli e HTTP, non regex sui sorgenti. Le fixture
A/S4 sono conservate; i selettori dei link illustrati ora indicano il loro
nome/area, perché la stessa route ha anche un link contestuale.

Risultati: 23 test B e 6 A verdi (29 complessivi), 57 S4, 24 bozze di
altri form, 6 guida e smoke home verdi; 236 unitari verdi. TypeScript,
ESLint mirato, i18n (2.863 chiavi / sei lingue) e controlli documentali verdi.
Nessun errore NewDeckDialog corrente. I test B verificano anche i testi
della guida docente nelle sei lingue.
Build locale `npm run build` riuscita, inclusa verifica TypeScript di Next.

Guida docente e guida di interfaccia aggiornate in IT/EN/ES/FR/DE/SV, insieme
alle funzionalità e alla guida Markdown docente. Sei `teacher-area.png`
rigenerati; ispezione della home DE e del form DE a 320 px, nessun overflow.
I link hanno bersagli di almeno 44 px e focus visibile. La cattura mobile
facoltativa usa `NOTEBOOK_SCREENSHOT_DIR=/tmp/s9-validation` nel test A.
Nessuna validazione UX con persone.

Dalla root: `make guidance-refresh`, `make guidance-check`,
`python3 scripts/check-platform-guidance.py --check --base a0ba4bb` e
`git diff --check`. Il manifest è incluso nella modifica.

La baseline documentata in A resta riconoscibile: `guide-audiences.test.mjs`
ha sei timeout preesistenti sui vecchi link di scelta percorso, riprodotti
allora su base e finale. Non è corretto in B; qui sono verificate le sei
prove `updated guide` e la presenza dei nuovi testi nel percorso docente.
L’errore storico NewDeckDialog non è riprodotto da TypeScript corrente.
Warning Node MODULE_TYPELESS_PACKAGE_JSON e nota Babel sul grande i18n.ts
preesistenti, senza nuove dipendenze o interventi fuori scope.

## Docker e chiusura

Solo immagine frontend di validazione, dopo gli screenshot:

```sh
docker build --tag counselorbot-frontend:s9-notebook-links-1002-validation frontend
docker image inspect counselorbot-frontend:s9-notebook-links-1002-validation --format '{{.Id}} {{.Size}}'
```

Build riuscita, ID `sha256:78b60c69d8a94baae630aff0787c549778f6604f14cc1e2da7dc96b8305ac680`,
dimensione 137.176.266 byte. Tre warning LegacyKeyValueFormat nel Dockerfile
preesistente, non modificato. Compilazione e TypeScript verificati anche nella
build Docker. Immagine ispezionata; nessuna prova runtime di questo tag, perché
nessun container è stato avviato.

Nessun container avviato, Compose, produzione, deploy, restart, sudo o dato
persistente modificato. La PR resta da approvare/mergiare; il goal B resta
aperto. Nessun successore autorizzato. Arresto del solo server S9 con Ctrl+C
nella sessione che ha avviato lo script; nessun processo altrui fermato.
Server S9 fermato; `ss -ltn '( sport = :3124 )'` senza listener a fine verifica.
