# Blocco A — testi del Taccuino del docente

S7, 2 ottobre 2026. Base `d2ca66a393773075d4ed62616c0a7f02e7db760c`:
PR31 e PR30 verificate MERGED prima del lavoro. Branch
`fix/clarify-teacher-notebook-copy`, worktree esclusivo
`/home/nugh75/counselorbot-sbs-worktrees/s7-notebook-copy-1002`.
Deroga esplicita dell’utente alla revisione cross-modello: un solo agente,
nessun altro modello, revisore o successore.

## Perimetro e contratti

Solo etichette, esempi e hint visibili in IT/EN/ES/FR/DE/SV, spiegazione della
home, sottotitolo e vuoto. Ogni textarea conserva il proprio ID e associa
l’hint con `aria-describedby`; struttura, ordine e layout restano quelli attuali.
I testi distinguono ruolo/pratica abituale, specificità della classe, crescita
personale e obiettivo didattico, nota sintetica ed episodio/lavoro.

Le chiavi `subjects`, `experience`, `methodologies`, `classes_overview`,
`formation_interests`, `notes` e il loro ordine sono invariati. Il confronto dei
sorgenti con la base conferma parsing, stato, onChange, payload, invio esplicito
e protezioni S4 identici. Il browser verifica POST con tutte le sei chiavi,
trim dei valori e `null` per i vuoti; scrivere non produce invii. Nessun backend,
API, storage, ruolo, revisione, default o envelope modificato. Restano 600
caratteri per campo e 1.200 nel blocco del taccuino.

La documentazione spiega i default DOCENZA=docente/altri strumenti=studente,
la scelta nelle Opzioni, la Lettura distinta e il significato limitato di
Nessuno. Un taccuino vuoto non esclude le classi selezionate dal contesto docente.
Non si promette la lettura integrale delle note. B/C/D restano non implementati.

## Verifiche riproducibili

Riutilizzato `scripts/dev-teacher-loading-errors-tests.sh`, porta libera
verificata con `ss -ltn '( sport = :3124 )'` prima dello start. Solo frontend
localhost e upstream `127.0.0.1:9`; Playwright intercetta tutte le API, blocca
traffico esterno e usa account/dati demo anonimi. Nessun backend o DB avviato.

Da `frontend/`:

```sh
node --test tests/teacher-notebook-copy.test.mjs
node --test tests/teacher-loading-errors.test.mjs
TEACHER_AREA_BASE_URL=http://127.0.0.1:3124 node --test tests/teacher-area-home.test.mjs
npm test
npm run i18n:check
npx tsc --noEmit --incremental false
npx eslint src/components/teacher/TeacherNotebook.tsx src/lib/i18n-teacher-area.ts src/lib/i18n-guide-audiences.ts tests/teacher-notebook-copy.test.mjs
npm run build
GUIDE_BASE_URL=http://127.0.0.1:3124 GUIDE_SCREENS=teacher-area node --experimental-strip-types scripts/capture-guide.mjs
```

Risultati: 6 test del taccuino, 57 S4, smoke home e 236 unitari verdi;
i18n (2.863 chiavi / sei lingue), TypeScript, ESLint mirato e build verdi.
I test del taccuino coprono label/hint, campi opzionali, tastiera, nessun invio
implicito e payload. Nessun overflow a 390 px in IT/EN/ES/FR/SV e a 320 px in
tedesco, sia vuoto sia compilato. I messaggi DE/SV sono stati accorciati per
rispettare il layout esistente. Per una cattura mobile anonima:
`NOTEBOOK_SCREENSHOT_DIR=../.s7-validation node --test tests/teacher-notebook-copy.test.mjs`.
Ispezionati lo screenshot DE a 320 px e la home DE; rigenerati gli screenshot
`teacher-area.png` di tutte le sei lingue. Non è una validazione UX con persone.

Dalla root: `make guidance-refresh`, `make guidance-check`,
`python3 scripts/check-platform-guidance.py --check --base d2ca66a`
e `git diff --check`: verdi. Funzionalità, guida docente, guida di interfaccia
nelle sei lingue e manifest aggiornati nella stessa modifica.

## Confronto con la base e limiti

La base completa frontend è stata estratta con `git archive d2ca66a frontend`
in una directory temporanea del solo worktree. Dopo `next typegen`, TypeScript
passa anche sulla base; l’errore storico NewDeckDialog non è stato riprodotto.
La suite preesistente `guide-audiences.test.mjs` fallisce in sei lingue su base
isolata e finale, con gli stessi timeout sui vecchi link Docente/Teacher/etc.
Il test e la pagina della guida usano contratti di selezione diversi;
non sono stati corretti in A. I sei test guida S4 (recupero e apertura dello
screenshot classi da tastiera) passano.

Per il confronto della guida: server temporaneo su porta libera `3125`,
`BACKEND_ORIGIN=http://127.0.0.1:9 NEXT_TELEMETRY_DISABLED=1 npm run dev -- --webpack --hostname 127.0.0.1 --port 3125`
dal frontend estratto, poi
`GUIDE_BASE_URL=http://127.0.0.1:3125 node --experimental-strip-types --test tests/guide-audiences.test.mjs`
dal frontend del worktree. Webpack evita il rifiuto Turbopack del symlink alle
dipendenze del worktree; nessun sorgente base modificato. Entrambi i server di
fixture sono stati fermati con Ctrl-C sui rispettivi processi; nessun processo
altrui fermato e nessun ambiente dev lasciato attivo.

## Docker

Solo immagine frontend di validazione, senza avviare container:

```sh
docker build --tag counselorbot-frontend:s7-notebook-copy-1002-validation frontend
docker image inspect counselorbot-frontend:s7-notebook-copy-1002-validation --format '{{.Id}} {{.Size}}'
```

Build finale riuscita dopo gli screenshot aggiornati. ID immagine:
`sha256:92bc037486a1056e545c69ee20681d8252f48efdba25a48aa91913a88560713f`. Nessun Compose, container di produzione,
deploy, riavvio, sudo o dato persistente. Nessun merge della PR S7; il goal A
resta aperto fino alla decisione dell’utente.
