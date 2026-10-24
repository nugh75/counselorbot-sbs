# ADR-0001 — Profili di installazione e packaging dell'app desktop

- Stato: **Accettato** (2026-10-24)
- Chiude: #207 (ADR dei profili e del packaging)
- Collegati: #208, #209, #210, #211, #212, #214, #135; epic #499
- Fonti: spike [F0-01](../spikes/f0-01-tauri-pyinstaller.md), [F0-02](../spikes/f0-02-embedded-postgres.md),
  [F0-03](../spikes/f0-03-tunnel-sse.md); decisione dell'utente del 24/10 sul doppio database ([ADR-0003](0003-dual-database-postgres-sqlite.md))

## Contesto

#207 chiedeva di definire tre profili (Console, PC docente, server di scuola), il packaging di ciascuno e il posto
del quick tunnel. Il piano desktop (§1, §3) proponeva Tauri + sidecar e Postgres incorporato; gli spike F0-01..03
hanno misurato la fattibilità sui tre sistemi. Il 24/10 l'utente ha deciso che le app desktop usano **SQLite**
al posto del Postgres incorporato.

## Decisione

### Profili

| Profilo | Chi | Packaging | Database | Identità | Pubblicazione | Quick tunnel |
|---|---|---|---|---|---|---|
| **console** (esistente) | server ai4educ, Mac della Console (portable) | Docker Compose (`docker-compose.yml`, `docker-compose.portable.yml`) | Postgres 15 | ai4auth (`backend/auth.py`, invariato) | nginx + tunnel wildcard della Console | no |
| **teacher-pc** (Fase 1) | un docente sul proprio PC | **app Tauri v2** con sidecar: backend PyInstaller *onedir*, frontend Next.js *standalone* + Node, `cloudflared` | **SQLite** nella cartella dati utente | fornitore **locale** ([ADR-0002](0002-desktop-phase-1-contracts.md)) | `cloudflared` avviato dall'app: tunnel nominativo sul dominio Cloudflare del docente (per il proprietario `labform.net`) | **solo prove** («Prova subito»), mai per lezioni |
| **student-pc** (Fase 2) | studente abbinato a un docente | app Tauri v2 ridotta, stesso backend in modalità studente | SQLite (cifrato, F2-06) | token rilasciato dall'app docente | nessuna (client verso l'app docente) | — |
| **school-server** (fuori da questo piano, #212) | istituto senza Console | Docker Compose portable | Postgres 15 | fornitore «istituto» (#209) | tunnel nominativo o reverse proxy dell'istituto | no |

### Packaging teacher-pc

- **Tauri v2** come guscio (decisione D1 confermata da F0-01: build verde su macOS arm64/x64, Windows x64, Ubuntu 22.04;
  WebKitGTK sotto Xvfb senza problemi, quindi nessun motivo per il piano B Electron).
- **Backend**: lo stesso `backend.main` della madre, PyInstaller **≥ 6.22** in modalità *onedir*, spedito come
  `resources` (non `bundle.externalBin`, che accetta un solo file). 1 worker uvicorn.
- **Frontend**: build `standalone` di Next.js eseguito da un binario Node incluso (D3 invariata).
- **Niente Postgres incorporato**: i binari theseus/build dai sorgenti valutati in F0-02 non vengono inclusi.
  Risparmio stimato sull'installer ~95 MB (macOS) / ~110 MB (Windows) / ~22 MB (Linux) installati (F0-02 §3).
- **Programmi esterni** (`dot`, `pdftoppm`): gestiti da F1-04 (sostituzione di Poppler con PyMuPDF, Graphviz incluso o
  render lato client); `tesseract` non incluso (nessun uso nel codice Python, F0-01 §3.2).
- **Piattaforme ufficiali**: macOS 13+ arm64 e x64, Windows 10/11 x64, Ubuntu 22.04+ x64.
- **Firma**: app **non firmate** su Apple e Windows; la pipeline firma solo se trova i segreti (come #135).
  L'updater Tauri resta firmato con chiave propria gratuita (obbligatorio).
- **Release**: su richiesta del proprietario; ogni release della madre (`vX.Y.Z`, file `VERSION` di F1-01) produce anche le app.

### Funzioni escluse dal profilo teacher-pc in Fase 1

Telegram, OpenCode, Prompt Lab, Piper, helper ChatGPT, Console sync. Restano nel codice della madre; nel profilo
teacher-pc sono disattivate (F1-05i) e non devono essere raggiungibili dal tunnel.

### Modelli

Solo agenti Anthropic/Claude Code per lo sviluppo. Nell'app: provider remoti con le chiavi del docente e LLM locale
(Ollama, LM Studio o server OpenAI-compatibile, F1-12 già su `main`). In Fase 1 lo studente usa il browser e quindi
i modelli dell'app docente (anche il suo LLM locale); l'LLM locale **sul PC dello studente** arriva con l'app studente (F2-07).

## Conseguenze

- Il backend deve funzionare su **Postgres e SQLite** con test su entrambi in CI: è il costo principale di questa
  scelta, dettagliato in [ADR-0003](0003-dual-database-postgres-sqlite.md) e nei compiti F1-05a..j del piano.
- I rischi del Postgres incorporato spariscono: privilegi elevati e pipe ereditate di `pg_ctl` su Windows,
  aggiornamenti di versione maggiore (`pg_upgrade`), collazione `C` vs `en_US.utf8`, antivirus sui file del cluster.
- I backup diventano una copia consistente di un file (API di backup di SQLite) invece di `pg_dump` (F1-05j).
- Un docente non può spostare i dati tra app desktop e server Postgres in Fase 1 (nessun export/import tra
  database): resta un compito futuro, se richiesto.
- #210 (installer con `.env`) è sostituita dall'app; #211 → F1-09; #214 → F1-10; #208 → F1-07; #209 → F1-06.
