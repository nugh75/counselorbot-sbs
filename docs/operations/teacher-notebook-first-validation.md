# Validazione S18 — Taccuino primo nella home docente

3 ottobre 2026. Worktree `s18-notebook-first-1003`, branch
`fix/teacher-notebook-first`, base main `ef64ebf45981dc1189e62dce88fd568de44b07d9`
(PR36). Task `828f3f53-20ea-4cf1-b74e-286327ac486c`; goal
`8e5865aa-00d6-4f60-a803-4e47a0abdec1`, aperto fino al merge dell’utente.
T1: stesso agente Codex per implementazione e revisione del diff, deroga
cross-modello confermata; nessun altro agente, modello o revisore.

## Perimetro e ordine

```text
/docente — titolo e sottotitolo esistenti
  Taccuino del docente → /docente/taccuino
  Percorso DOCENZA
  Classe e assegnazioni
  Cataloghi
  Somministrazioni e ricerca
```

La sola modifica applicativa sposta `<TeacherAreaEntry slug="taccuino" />`
prima della sezione `teacher-goal-path`. Grafica, etichette, route e ordine
degli altri collegamenti conservati; ordine visivo, DOM e Tab coincidenti,
senza tabindex positivo. Il filtro Orientamento resta teacher-only.
Nessun form notebook montato o richiesta notebook dalla home. Navbar,
pagina studente, pagina notebook, popup, API, dati e contesto chat invariati.
Documentazione piattaforma, apertura della guida nelle sei lingue, sei sole
catture `public/guide/{it,en,es,fr,de,sv}/teacher-area.png` e manifest aggiornati.

## Riproduzione

Porte 3134/3136 controllate libere. Fixture anonime su localhost con API
intercettate, dati in memoria e traffico esterno bloccato; upstream
`BACKEND_ORIGIN=http://127.0.0.1:9`. Nessun backend, SSO, DB o container avviato.
Avvio dev riusato: `scripts/dev-teacher-class-picker-tests.sh`.
Avvio compilato, copia degli asset, tunnel e stop: documentazione S16 in
`teacher-notebook-page-validation.md` e `live-dev-environment.md`.

Da `frontend/`, dopo la build e l’avvio standalone su 127.0.0.1:3134:

```bash
TEACHER_NOTEBOOK_COMPILED=1 TEACHER_PICKER_BASE_URL=http://127.0.0.1:3134 TEACHER_CLASSES_BASE_URL=http://127.0.0.1:3134 TEACHER_ERRORS_BASE_URL=http://127.0.0.1:3134 TEACHER_AREA_BASE_URL=http://127.0.0.1:3134 TEACHER_CATALOGS_BASE_URL=http://127.0.0.1:3134 node --test --experimental-strip-types --test-concurrency=2 tests/teacher-notebook-page.test.mjs tests/teacher-class-picker.test.mjs tests/teacher-class-management.test.mjs tests/teacher-loading-errors.test.mjs tests/teacher-notebook-copy.test.mjs tests/teacher-notebook-links.test.mjs tests/teacher-area-home.test.mjs tests/teacher-catalogs.test.mjs
GUIDE_BASE_URL=http://127.0.0.1:3134 GUIDE_SCREENS=teacher-area node --experimental-strip-types scripts/capture-guide.mjs
```

## Risultati e limiti

230/230 test browser/smoke sul compilato (suite S16, sei casi desktop aggiunti),
236/236 unitari, TypeScript, i18n (2.863 chiavi × sei lingue), ESLint mirato e
build locale verdi. `make guidance-refresh`, `make guidance-check`, confronto
guidance con la base e `git diff --check` superati. Le sei catture della home
sono state generate con lo script S16, sole richieste GET e zero errori.
Controllata anche una cattura tedesca a 320 px in `/tmp/s18-validation`:
Taccuino prima di DOCENZA, nessun overflow, errore o scrittura.

Il nuovo test dell’ordine fallisce sulla base (notebook ultimo) e passa dopo
lo spostamento: 12/12 casi in dev, sei lingue × 320/1440 px, sequenza completa,
posizione visiva, Tab/Shift+Tab/Enter, route/refresh/ritorno e zero scritture.
Lo smoke verifica anche click sul primo link e filtro del ricercatore.

Baseline estratta con `git archive` in `/tmp/s18-baseline-ef64ebf`, senza
modificare altri worktree. Lint globale: log identici dopo normalizzazione
dei path, 1 errore `NewDeckDialog` + 16 warning. `guide-audiences.test.mjs`:
sei timeout identici alla riga 32:40, fixture anonima che cerca il selettore
di ruolo assente. Anteprime: i tre test di guard sulla base passano con i
soli mismatch preesistenti `RolePreviewBanner`; il candidato conserva le
stesse asserzioni e ammette solo React #418 nel compilato. Nessuna assertion
indebolita e nessuna correzione fuori perimetro.

Le prove non attestano SSO reale, persistenza backend, dispositivi fisici,
screen reader o feedback UX umano. Nessun merge, deploy, sudo o servizio
produzione modificato. Tutti i processi avviati da S18 fermati al termine.

## Immagine di sola validazione

```bash
docker build --build-arg NEXT_PUBLIC_API_URL=/api -t counselorbot-frontend:s18-validation-20261003-054432 frontend
docker image inspect counselorbot-frontend:s18-validation-20261003-054432 --format '{{.Id}} {{.Created}} {{.Size}}'
```

Build riuscita. ID
`sha256:2662ea1d4ffa1b0ae5cc3aea4b6b44fcfa5f895a29f87691d2c3636a4dfe3213`,
139.095.487 byte. Immagine non avviata; prove browser sullo standalone locale.
Tre warning preesistenti `LegacyKeyValueFormat` nel Dockerfile, lasciato intatto.
I 131 container esistenti (inclusi quelli fermi) coincidono prima/dopo per
ID, image ID, StartedAt e RestartCount. Nessuna attivazione in produzione.

Log ed evidenze temporanei: `/tmp/s18-*.log`, `/tmp/s18-image-info.txt`,
`/tmp/s18-validation/teacher-home-de-320.png` e
`/tmp/s18-container-invariants-{before,after}.txt`. Nessuna immagine o backup
rimosso. Il grafo principale è stato consultato senza scritture né rebuild;
non contiene un nodo `TeacherAreaHome`, quindi il target noto è stato letto
direttamente. `.gitignore`, handoff e istruzioni generate preservati.
