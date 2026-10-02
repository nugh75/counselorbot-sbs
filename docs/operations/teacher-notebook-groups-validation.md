# Blocco C — raggruppamenti del Taccuino del docente

S11, 2 ottobre 2026. Worktree esclusivo
`/home/nugh75/counselorbot-sbs-worktrees/s11-notebook-groups-1002`, branch
`refactor/teacher-notebook-field-groups`, base main verificata dopo fetch:
`846eecb6c6bd296b1df05bc5b1ec4b37b97d9128` (merge PR33, con A/B/S4).
Deroga esplicita alla revisione cross-modello: un solo costruttore, nessun altro
agente, modello o revisore. Nessun successore autorizzato, nessun blocco D.

Prima della modifica, una lettura del bundle della pagina `/docente` servita dal
frontend esistente su `127.0.0.1:3000` ha trovato i quattro testi dei rimandi B in
`/_next/static/chunks/c62fce5da3d56b55.js`, senza il titolo del gruppo C.
Questo controllo non certifica login/SSO pubblico o comprensibilità con docenti.
La mappa principale è stata consultata in sola lettura: non contiene ancora
TeacherNotebook; nessuna ricostruzione della mappa o modifica del principale.

## Struttura e invarianti

Tre `fieldset` nativi con `legend` e titolo h3, sotto la testata h2 esistente:

```text
Taccuino del docente
  Il mio ruolo
    subjects / experience
  La mia pratica e i miei contesti
    methodologies / classes_overview
  La mia crescita e altre informazioni
    formation_interests / notes
  Salva taccuino
```

I gruppi e i sei campi sono sempre aperti e visibili. Le colonne esistenti e il
campo note a larghezza piena restano; titoli, spazi e separatori usano i token
correnti. Nessuna nuova dipendenza, animazione, campo, sezione della home,
query, migrazione, permesso o modifica dell’envelope. I titoli sono localizzati
in IT/EN/ES/FR/DE/SV; etichette, hint ed esempi A sono conservati.

Confronto deterministico con la base: `FIELDS` e l’intero tratto parsing/stato/
caricamento/guard/salvataggio sono identici. Stesse sei chiavi e ordine, ID,
600 caratteri per campo, trim/null nel POST e gesto esplicito; budget backend
1.200 invariato. B mantiene i quattro link vicini agli hint e le protezioni;
S4 mantiene errore, retry, gating e risposte tardive. Nessun autosave o invio nuovo.

A 320px il messaggio di vuoto ES/FR/SV debordava già sulla base nella riga dei
pulsanti. La riga ora può andare a capo, senza nascondere o abbreviare contenuti
né cambiare ordine o azioni. La home cambia solo per l’altezza naturale del form.

## Verifiche riproducibili

Porta 3124 libera verificata con `ss -ltn '( sport = :3124 )'`. Solo frontend,
upstream `http://127.0.0.1:9`, API simulate e traffico esterno bloccato, fixture
anonime di A/B/S4; nessun backend/DB/SSO di produzione. Avvio iniziale con
`scripts/dev-teacher-loading-errors-tests.sh`. Per catture e smoke desktop è
stato usato Webpack (stessa porta), dal frontend del worktree:

```sh
BACKEND_ORIGIN=http://127.0.0.1:9 NEXT_TELEMETRY_DISABLED=1 npm run dev -- --webpack --hostname 127.0.0.1 --port 3124
```

Turbopack dev aveva lasciato pendente una richiesta dell’ottimizzatore immagini
per l’illustrazione esistente `assegnazioni.png` a 96px, causando timeout di
networkidle su smoke/cattura. La stessa home è verde sulla base isolata e sul
finale con Webpack; nessun test o asset del prodotto è stato cambiato per aggirare
il timeout. Per accesso SSH: `ssh -N -L 3124:127.0.0.1:3124 <utente>@<server>`,
URL `http://localhost:3124`; i dati demo sono soltanto nei browser delle fixture.
Arresto: Ctrl+C sul processo avviato. Non avviare queste prove su produzione.

Da `frontend/`:

```sh
NOTEBOOK_SCREENSHOT_DIR=/tmp/s11-validation node --test tests/teacher-notebook-copy.test.mjs
node --test tests/teacher-notebook-links.test.mjs tests/teacher-loading-errors.test.mjs
DRAFTS_BASE_URL=http://127.0.0.1:3124 node --test --experimental-strip-types tests/draft-protection.test.mjs
TEACHER_AREA_BASE_URL=http://127.0.0.1:3124 node --test tests/teacher-area-home.test.mjs
VISUAL_TOOLS_BASE_URL=http://127.0.0.1:3124 node --test --experimental-strip-types --test-name-pattern='updated guide' tests/visual-tools.test.mjs
GUIDE_BASE_URL=http://127.0.0.1:3124 GUIDE_SCREENS=teacher-area node --experimental-strip-types scripts/capture-guide.mjs
npm test
npm run i18n:check
npx tsc --noEmit --incremental false
npx eslint src/components/teacher/TeacherNotebook.tsx src/lib/i18n-guide-audiences.ts tests/teacher-notebook-copy.test.mjs tests/teacher-notebook-links.test.mjs
npm run build
```

Rosso sulla base: nessun gruppo accessibile (`0 !== 3`), oltre all’overflow
preesistente a 320px. Verde: 18 prove A/C (sei lingue, mobile, zoom equivalente
200/400%), 25 B/C, 57 S4; 24 bozze di altri form, sei guida e smoke home;
236 unitari. Le prove osservano DOM accessibile, pagina, tastiera e HTTP,
non soltanto regex: coppie dei gruppi, titoli h3, sei ID/ordine/hint, opzionalità,
limiti, payload senza nuove chiavi, nessun invio digitando, quattro link,
annulla/scarta, save in-flight/fallito, retry e risposte tardive. Una prova pulita
e una con bozza verificano focus/selezione e assenza di falso dirty dopo sei
cambi lingua tramite evento storage e una rilettura; l’uscita pulita non chiede
conferma, l’annullamento della bozza mantiene testo e selezione.

Desktop 1440px, viewport CSS 720px e mobile 320px senza overflow in tutte le
lingue, sia vuoto sia compilato. Zoom simulato: display 1280px con viewport CSS
640/320px e deviceScaleFactor 2/4; non è un test di zoom nativo su dispositivo.
CSS zoom da solo non adatta le media query e non rappresenta tale prova.
Nessun test umano con screen reader o docente: i nomi dei gruppi sono verificati
nell’albero accessibile del browser; la comprensibilità resta un’ipotesi.

Guida docente reale aggiornata nelle sei lingue, funzionalità e guida Markdown
allineate; sei `teacher-area.png` rigenerati e verificati dai test della guida.
Ispezionati desktop DE/FR e form mobile DE a 320px. I contenuti non sono nascosti
per la cattura. Nessun aggiornamento di AGENTS/CLAUDE/CONTEXT/glossario.

## Baseline e limiti

La suite storica `guide-audiences.test.mjs` ha gli stessi sei timeout sui vecchi
link di scelta percorso sulla base estratta con `git archive HEAD frontend`
in `/tmp/s11-base-846eecb` e sul finale: i messaggi dei selettori coincidono.
Base servita con Webpack su porta libera 3125, dipendenze del solo worktree;
nessun sorgente base modificato. Non correggiamo tale suite fuori scope.
TypeScript corrente passa: nessun errore storico NewDeckDialog riprodotto.
Warning Node MODULE_TYPELESS_PACKAGE_JSON e nota Babel sul grande i18n.ts sono
preesistenti. Le prove HTTP non certificano persistenza backend o autorizzazioni
SSO reali; i consumer backend non sono modificati.

Dalla root: `make guidance-refresh`, `make guidance-check`,
`python3 scripts/check-platform-guidance.py --check --base 846eecb` e
`git diff --check`; manifest incluso. Build locale e Docker riportate sotto.

## Docker e stato finale

Solo immagine frontend di validazione, dopo gli screenshot:

```sh
docker build --tag counselorbot-frontend:s11-notebook-groups-1002-validation frontend
docker image inspect counselorbot-frontend:s11-notebook-groups-1002-validation --format '{{.Id}} {{.Size}}'
```

Build locale `npm run build` riuscita (46 pagine statiche), seguita da
TypeScript e i18n verdi (2.863 chiavi / sei lingue). ESLint mirato e controlli
guidance/diff verdi. Build Docker riuscita, inclusa compilazione e TypeScript. Immagine ispezionata:
`sha256:63e5e4f1d2e4e78ecd371bcc0e8c60ccac7eb098df107547e390fa5cdf2cf2c5`,
137.251.050 byte. Tre warning LegacyKeyValueFormat del Dockerfile preesistente.
Il tag non è stato avviato: build verificata, runtime dell’immagine non verificato.

I server di fixture (3124) e base (3125) sono stati fermati con Ctrl+C nelle
rispettive sessioni; `ss -ltn '( sport = :3124 or sport = :3125 )'` senza listener.
Nessun processo altrui fermato, nessun ambiente dev S11 lasciato attivo.

Nessun container avviato, Compose, deploy, restart di produzione, sudo o dato
persistente modificato. Nessun merge autonomo. Task C chiudibile solo dopo
verifiche pertinenti verdi, commit/push e PR; goal C aperto fino al merge utente.
