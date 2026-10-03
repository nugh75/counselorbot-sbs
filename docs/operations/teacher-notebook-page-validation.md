# Validazione S16 — pagina Taccuino docente

Data: 3 ottobre 2026. Worktree esclusivo
`/home/nugh75/counselorbot-sbs-worktrees/s16-notebook-page-1003`, branch
`feature/teacher-notebook-page`, base PR35
`88b1b171ceac3457b476ddebcd953855f25a25f2` (main GitHub verificato anche a fine lavoro).
Task `a209cb37-7390-41a6-a25c-e6f6aa03533a`; goal
`50973cb9-ff82-45ac-922c-dc8e89ff6ca6`, aperto fino al merge dell’utente.
Schema ASCII e implementazione già autorizzati. Quota/contesto iniziali
comunicati dall’utente: 99% disponibile, 0% occupazione iniziale.
T1: revisione dei diff da parte dello stesso agente Codex, secondo la deroga
cross-modello confermata dall’utente; nessun altro agente, modello o revisore.

## Comportamento consegnato

- `/docente` conserva DOCENZA, classi, cataloghi e ricerca, con un ingresso
  illustrato **Taccuino del docente**. Nessun form montato, nemmeno nascosto,
  e nessuna richiesta notebook per la card.
- `/docente/taccuino` usa `TeacherAreaPage`, accesso e header delle sottopagine
  docenti, come il modello di navigazione del taccuino studente. Link diretto,
  click e refresh funzionano; il ritorno è `/docente`, senza redirect della home.
- Una sola istanza di `TeacherNotebook`. La sola opzione `showHeading` evita
  il titolo duplicato: h1 del guscio, h2 dei tre gruppi sempre aperti. Stesso
  design, illustrazioni esistenti e testi IT/EN/ES/FR/DE/SV.
- Sei chiavi/ID/ordine/hint/etichette A e API invariati: `subjects`, `experience`,
  `methodologies`, `classes_overview`, `formation_interests`, `notes`. POST
  esplicito a `/user/teacher-notebook`, trim/null, limiti 600/1.200 e contratti
  append-only, consenso, revisioni, default/envelope conservati. Nessun backend
  o cambio di contesto chat/sessione.
- Guard di bozza e richiesta pendente riusati. Annulla conserva DOM, testo,
  focus e selezione; scarto esplicito, back browser, reload, navbar, invii
  duplicati, errori/retry e risposte tardive verificati.
- Popup Classi S14 invariato: Notebook montato e bozza privata indipendente;
  selezione esplicita, guard switch/chiusura/busy, PUT fascia/istituto immediato,
  contesto con Salva, Annulla limitato alla bozza contesto.
- Accesso docente/ricercatore/admin e anteprime identico. Studente escluso
  dalla route docente; `/profilo/taccuino` distinto e intatto. Doppio ruolo:
  scelta volontaria delle due pagine, nessun trasferimento o redirect.

Ingressi: nessun vecchio link applicativo specifico al notebook diretto alla
home rilevato; i link generici Area docenti restano `/docente`. La guida ha un
link esplicito alla nuova route. Il vecchio ID inline `teacher-notebook-group`
non ha ingressi nel codice corrente: eventuali bookmark `/docente#teacher-notebook-group`
restano nella home e richiedono il nuovo ingresso, senza persistenza o redirect.

## Prove riproducibili

Porte 3134 e 3136 verificate libere prima dell’avvio. Server frontend-only,
upstream `http://127.0.0.1:9`, fixture anonime locali, API intercettate e traffico
esterno bloccato. Nessun backend, SSO, DB, account reale o container avviato.
Avvio dev: `scripts/dev-teacher-class-picker-tests.sh`; tunnel e stop in
`live-dev-environment.md`. Dev e baseline fermati prima del server compilato;
tutti i processi avviati per S16 sono stati fermati al termine.

Da `frontend/`, build e avvio locale compilato:

```bash
BACKEND_ORIGIN=http://127.0.0.1:9 NEXT_TELEMETRY_DISABLED=1 npm run build
cp -a public .next/standalone/public
cp -a .next/static .next/standalone/.next/static
PORT=3134 HOSTNAME=127.0.0.1 NEXT_TELEMETRY_DISABLED=1 node .next/standalone/server.js
```

In altro terminale, da `frontend/`:

```bash
TEACHER_NOTEBOOK_COMPILED=1 TEACHER_PICKER_BASE_URL=http://127.0.0.1:3134 TEACHER_CLASSES_BASE_URL=http://127.0.0.1:3134 TEACHER_ERRORS_BASE_URL=http://127.0.0.1:3134 TEACHER_AREA_BASE_URL=http://127.0.0.1:3134 TEACHER_CATALOGS_BASE_URL=http://127.0.0.1:3134 NOTEBOOK_SCREENSHOT_DIR=/tmp/s16-validation node --test --experimental-strip-types --test-concurrency=2 tests/teacher-notebook-page.test.mjs tests/teacher-class-picker.test.mjs tests/teacher-class-management.test.mjs tests/teacher-loading-errors.test.mjs tests/teacher-notebook-copy.test.mjs tests/teacher-notebook-links.test.mjs tests/teacher-area-home.test.mjs tests/teacher-catalogs.test.mjs
npm test
npm run i18n:check
npx tsc --noEmit
npx eslint src/app/docente/page.tsx src/app/docente/taccuino/page.tsx src/app/guide/page.tsx src/components/teacher/TeacherNotebook.tsx src/components/teacher/TeacherAreaHome.tsx src/lib/teacher-area.ts src/lib/i18n-teacher-area.ts src/lib/i18n-guide-audiences.ts src/lib/guide-images.ts tests/teacher-notebook-page.test.mjs tests/teacher-notebook-copy.test.mjs tests/teacher-notebook-links.test.mjs tests/teacher-loading-errors.test.mjs tests/teacher-class-picker.test.mjs tests/teacher-area-home.test.mjs scripts/capture-guide.mjs
```

Risultati: **224/224 browser**, inclusi 28 nuovi casi di route/guida;
**236/236 unitari**, TypeScript, i18n (2.863 chiavi × sei lingue), ESLint mirato
e build verdi. Layout verificato a 320/390/720/1440 px e viewport/scala
pixel equivalenti a 200/400% zoom. Tastiera, focus e immagini guida ingrandibili
verificati dal browser, non una certificazione umana di UX/screen reader.
Fixture A/B/C/S4/S14 migrate alla nuova aspettativa con gli stessi controlli
comportamentali/payload; S4 passa anche separatamente 57/57 in dev.

Guida: 18 catture anonime (home, notebook, popup × sei lingue), con controlli
GET-only; screenshot student/Classi e vecchi report di evidenza preservati.

```bash
GUIDE_BASE_URL=http://127.0.0.1:3134 GUIDE_SCREENS=teacher-notebook node --experimental-strip-types scripts/capture-guide.mjs
# Dalla root:
make guidance-refresh
make guidance-check
python3 scripts/check-platform-guidance.py --check --base 88b1b171ceac3457b476ddebcd953855f25a25f2
git diff --check
```

CONTEXT, documentazione piattaforma, guida docente, immagini e manifest
aggiornati. Guidance refresh/check e confronto base superati.

## Baseline e limiti

Baseline PR35 estratta con `git archive` in `/tmp/s16-baseline`, servita solo su
127.0.0.1:3136 (`BACKEND_ORIGIN=http://127.0.0.1:9 npm run dev -- --webpack
--hostname 127.0.0.1 --port 3136`). Nessun altro worktree modificato.

- `npm run lint`: identico dopo normalizzazione dei path, **1 errore
  NewDeckDialog + 16 warning** su baseline e candidato. Non modificati fuori scope.
- `GUIDE_BASE_URL=<baseline/candidato> node --test --experimental-strip-types
  tests/guide-audiences.test.mjs`: gli stessi **sei timeout** a riga 32:40, perché
  la vecchia fixture anonima cerca il selettore di ruolo che non viene mostrato.
  La sola aspettativa della galleria è aggiornata a 10 immagini (pagina notebook
  aggiunta); nessuna assertion rimossa o indebolita. I nuovi test verificano realmente
  link notebook, screenshot/zoom, tastiera e overflow nelle sei lingue.
- `RolePreviewBanner`: mismatch SSR/client già nella baseline su ingresso
  diretto e refresh delle anteprime docente, ricercatore e studente (due errori
  su due caricamenti, zero per identità normali). Riprodotto anche nel candidato;
  i test di ruolo ammettono esclusivamente quel preciso errore preesistente
  (`Hydration failed`/`RolePreviewBanner` in dev; React #418 compilato), mantenendo
  le asserzioni su ruoli, richieste, header X-View-As e zero scritture. Nessuna
  correzione della barra globale in questo task.
- StrictMode dev ripete il GET del singolo componente: 4 richieste nei due
  caricamenti, come nella baseline; il compilato ne ha 2. Home sempre zero.

Le prove non attestano persistenza backend, revisione/consenso runtime, SSO
reale, dispositivi fisici o screen reader umani. Quei contratti non sono stati
modificati. Nessun deploy o merge, nessun sudo o aggiornamento del sistema.

## Immagine di sola validazione

Dalla root:

```bash
docker build --build-arg NEXT_PUBLIC_API_URL=/api -t counselorbot-frontend:s16-validation-20261003-050033 frontend
docker image inspect counselorbot-frontend:s16-validation-20261003-050033 --format '{{.Id}} {{.Created}} {{.Size}}'
```

Build completata, nuova route presente nell’elenco compilato.
ID finale: `sha256:be71191bd4caea39ad780fece438a8351a607e9e47eef236b4175d779459d527`. Nessun avvio/importazione in produzione e nessuna
immagine/backup rimossa. I 95 container preesistenti sono identici prima/dopo
per ID, image ID, StartedAt e RestartCount. Restano solo i tre warning già
presenti di sintassi ENV nel Dockerfile, lasciato intatto.

Evidenze di sessione in `/tmp/s16-*.log`, `/tmp/s16-image-info.txt`,
`/tmp/s16-containers-before.txt`, `/tmp/s16-containers-after.txt` e
`/tmp/s16-validation/teacher-notebook-de-320.png`; i file temporanei non sono
la documentazione permanente e possono essere rimossi da procedure esterne.
