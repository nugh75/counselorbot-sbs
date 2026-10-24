# Spike F0-01 — Guscio Tauri + backend PyInstaller su macOS, Windows, Linux

Compito F0-01 di [`desktop-apps-plan.md`](../desktop-apps-plan.md) (epic #499, issue #509).
Data: 2026-10-24. Base: `main` @ `1e8f0441`.

## Esito in breve

**Tauri v2 + backend PyInstaller *onedir* funziona sui 3 sistemi**, con il backend **reale** (`backend.main` non modificato).
Un'app «hello» avvia il backend come processo figlio su `127.0.0.1` (porta libera), aspetta `/auth/me`
e lo mostra nella finestra. Verificato:

| Piattaforma (runner) | Installer | Avvio senza finestra (`--smoke`) | Finestra + pagina → `/auth/me` |
|---|---|---|---|
| macOS 14 arm64 (`macos-14`) | `.app`/`.dmg` | ✅ CI | ⚠️ non verificabile in CI; ✅ a mano su Mac arm64 reale (stesso `.dmg` di CI) |
| macOS x64 (`macos-15-intel`) | `.app`/`.dmg` | ✅ CI | ⚠️ non verificabile in CI; **non provato su Mac Intel reale** |
| Windows (`windows-latest`, Server 2025) | NSIS per utente (+ `.msi`) | ✅ CI, installazione silenziosa | ✅ CI |
| Ubuntu 22.04 (`ubuntu-22.04`) | `.deb` installato con apt, `.AppImage` | ✅ CI (deb e AppImage) | ✅ CI (WebKitGTK sotto Xvfb) |

Run di riferimento: [40041774537](https://github.com/nugh75/counselorbot-sbs/actions/runs/40041774537), verde sui 4 runner
(il controllo finestra macOS è solo un avviso, vedi §3.3). Misure di §2 dalla run
[40039560955](https://github.com/nugh75/counselorbot-sbs/actions/runs/40039560955), stesso codice.
Sul runner Linux il backend impacchettato è partito anche in **modalità completa** contro Postgres 15 reale:
lifespan, seed e tutte le migrazioni della madre in **12–13 s**, `/auth/me` 200.

`/auth/me` risponde `authenticated: false` (nessun proxy di identità): è il contratto atteso fino a #209.

## 1. Cosa c'è nello spike

```
desktop/spike-tauri/
├── sidecar/server.py     entrypoint PyInstaller: importa backend.main e avvia uvicorn (1 worker)
├── sidecar/build.sh      PyInstaller onedir → src-tauri/backend/ (bash, anche Git Bash su Windows)
├── src/index.html        pagina: chiama il comando Rust e mostra /auth/me + diagnostica
├── src-tauri/            guscio Rust (~170 righe): porta libera, avvio/arresto backend, probe HTTP
└── scripts/check-app.sh  controllo CI: avvia l'app installata, attende il report, la chiude
.github/workflows/desktop-spike.yml   matrice 4 runner, solo workflow_dispatch e push su spike/**
```

- **Modalità minimal** (default): SQLite nella cartella dati e lifespan disattivato (vedi §3.1). Solo per lo spike.
- **Modalità full**: lifespan reale contro `DATABASE_URL` Postgres (usata in CI su Linux).
- `/spike/info` (rotta aggiunta solo dall'entrypoint dello spike): import delle librerie native, prova argon2 e render PyMuPDF,
  presenza di `dot`/`pdftoppm`/`tesseract`.
- Build locale del backend: `PYTHON=python3.12 bash desktop/spike-tauri/sidecar/build.sh`; app: `npx tauri build` in `desktop/spike-tauri` (serve Rust).

## 2. Misure

### 2.1 Dimensioni

| | macOS arm64 | macOS x64 | Windows x64 | Linux x64 |
|---|---|---|---|---|
| Backend onedir | 278 MB | 274 MB | 263 MB | 349 MB |
| App installata | 356 MB (`.app`) | 356 MB | — | — |
| **Installer** | **176 MB** `.dmg` | **178 MB** `.dmg` | **118 MB** NSIS · 141 MB `.msi` | **213 MB** `.deb` · 258 MB `.AppImage` |

Le voci più pesanti del backend sono le stesse ovunque:

| Cartella | macOS arm64 | Windows | Linux | Note |
|---|---|---|---|---|
| `pymupdf` | 104 MB | 99 MB | 110 MB | PyMuPDF + `pymupdf4llm` |
| `onnxruntime` | 70 MB | 38 MB | 30 MB | **dipendenza indiretta** di `pymupdf-layout` (richiesto da `pymupdf4llm` 1.28) |
| numpy (+ `.libs`) | 7 MB | 21 MB | 27 MB | |
| PIL, cryptography, psycopg2 | ~10 MB ciascuna | | | |

Il guscio Tauri pesa pochi MB: il peso è tutto nel backend. Mancano ancora Postgres (F0-02), Node + `.next/standalone`
e `cloudflared`: la stima del piano (300–500 MB di installer) resta plausibile.

### 2.2 Tempi

Build in CI (secondi; cache Rust fredda tranne dove indicato):

| Fase | macOS arm64 | macOS x64 | Windows | Linux |
|---|---|---|---|---|
| PyInstaller (solo `pyinstaller_seconds`) | 88 | 210 | 99 | 88 |
| Passo backend (pip + PyInstaller) | 127 | 409 | 182 | 122 |
| `tauri build` (Rust + bundle) | 190 | 384 | 418 | 189 |
| **Job totale** | **~12 min** | **~20 min** | **~12 min** | **~9 min** |

Avvio (dal lancio a `/auth/me` 200):

| | macOS arm64 | macOS x64 | Windows | Linux |
|---|---|---|---|---|
| Backend, import Python | 4–5 s | 6–8 s | 5–6 s (14 s al primo avvio dopo l'installazione) | 4–5 s |
| App → `/auth/me` | 4,5–6 s | 7–7,5 s | 6–15 s | 5–6,5 s |
| AppImage (estrazione inclusa) | | | | ~35 s |

Mac arm64 reale (8 GB, disco esterno): **primo avvio 25 s** di import (scansione di sicurezza delle librerie non firmate
appena viste), poi **1,8 s**; RSS del backend ~230 MB. Dal `.dmg` di CI: finestra pronta e `/auth/me` in 8,6 s.

## 3. Problemi trovati

### 3.1 Backend (codice della madre)

| # | Problema | Effetto | Correzione proposta | Dove |
|---|---|---|---|---|
| B1 | `import fcntl` in `backend/rag_index.py:10` e `backend/rag_reindex_job.py:12` (solo Unix) | **Su Windows il backend non si importa affatto** | lock portabile (`msvcrt.locking` o pacchetto `filelock`) dietro una piccola funzione comune. Nello spike: stub senza effetto in `server.py` (sufficiente con 1 worker) | F1-04 o compito dedicato, **prima** di qualsiasi build Windows |
| B2 | Migrazioni Postgres-only (`ADD COLUMN IF NOT EXISTS`) nel lifespan | Su SQLite il lifespan si ferma (`near "EXISTS": syntax error`) | nessuna: conferma la scelta del piano (Postgres incorporato, §3.3); lo spike usa SQLite solo senza lifespan | F0-02 |
| B3 | `backend/benchmark_service.py:19` importa `backend.tests` a runtime | i test vanno impacchettati (come fa già il `Dockerfile`) | spostare l'helper fuori da `tests/` | facoltativo |
| B4 | `backend/` e `backend/migrations/` senza `__init__.py`; migrazioni caricate per nome con `import_module` | PyInstaller non le trova da solo | lo script di build crea gli `__init__.py` nella copia e usa `--collect-submodules backend` | build |
| B5 | Percorsi di scrittura con default dentro il codice: `CredentialStore` (`backend/credential_storage.py:23`), `RAG_INDEX_DIR` (`.rag_index` accanto al repo), `DATA_DIR=/app/uploads`, `knowledge/` relativo alla cartella corrente (`backend/strategy_memory.py:18`) | in un'app installata la cartella del programma è in sola lettura (`/usr/lib`, `.app` firmata) | il guscio deve sempre impostare `DATA_DIR`, `RAG_INDEX_DIR`, `*_CREDENTIALS_DIR`, `STRATEGY_MEMORY_FILE`, `TAVOLO_*`, `PORTFOLIO_STORAGE_DIR`, `IDEA_SOURCES_STORAGE_DIR` verso la cartella dati | F0-04 (contratto guscio↔sidecar) |
| B6 | Il RAG del sito legge `docs/` del repository (`RAG_DOCS_DIR`) | non incluso nello spike | decidere se includerlo o disattivare il site-chat nel profilo teacher-pc | F1 |
| B7 | CORS con origini fisse (`backend/main.py`) | irrilevante finché il frontend passa dal proxy Next | nessuna, da ricontrollare con il frontend sidecar | F1 |

### 3.2 Librerie native

**Moduli Python: nessun problema.** Su tutti e 4 i runner il backend impacchettato carica `fitz`/`pymupdf4llm`, `numpy`,
`cryptography`, `argon2` (hash+verifica), `bcrypt`, `psycopg2` (binario, connessione reale a Postgres su Linux),
`PIL`, `pdf2image`, `jose`, `fpdf`, `pypdf`, `edge_tts`; PyMuPDF rasterizza una pagina.

Problemi di **impacchettamento** (risolti nello script):
- `passlib` carica i gestori per nome → `--collect-submodules passlib` (altrimenti `No module named 'passlib.handlers.argon2'`).
- **PyInstaller 6.11.1** (la versione dell'helper ChatGPT) non gestisce **numpy 2.5** (`No module named 'numpy._core._exceptions'`) → serve **6.22.3**.
- `python -m PyInstaller` lanciato dalla radice del repo vede il `backend/` non impacchettato; e `collect_submodules` gira
  nel processo dello spec, che ignora `--paths` → build da `.build/` con `PYTHONPATH` esplicito.
- Git Bash su Windows non converte i percorsi `/d/a/...` dentro `--add-data "src;dest"` → `cygpath -m`.

**Programmi esterni: assenti in tutti i bundle** (`dot`, `pdftoppm`, `tesseract` = `null` sui runner).

| Programma | Usato da | Senza il programma | Proposta |
|---|---|---|---|
| `dot` (Graphviz) | `backend/diagram_render.py` | diagrammi concettuali: errore «motore graphviz non disponibile» | includere Graphviz per piattaforma (licenza EPL, ~10–30 MB, da misurare) **oppure** render lato client (es. viz.js/WASM) |
| `pdftoppm` (Poppler) | `pdf2image` in `qsa_extractor.py`, `pqbl_generator.py` | estrazione QSA da PDF e PQBL falliscono | **sostituire con PyMuPDF**, già incluso e funzionante (`page.get_pixmap()`): elimina una dipendenza nativa su 3 sistemi |
| `tesseract` | solo installato nel `Dockerfile`; nessun uso nel codice Python | nessuno | non includere |

### 3.3 Guscio Tauri e sidecar

- **`bundle.externalBin` non va bene per *onedir***: accetta un solo file. Lo spike spedisce la cartella come `resources`
  (`backend/**/*`) e la avvia con `std::process::Command`; permessi di esecuzione preservati su macOS, `.deb`, AppImage e NSIS.
- **Windows**: il backend è un programma console → senza `CREATE_NO_WINDOW` si aprirebbe una finestra nera.
- **Processo orfano**: chiudendo l'app (finestra o «Esci») il backend viene terminato; **se il guscio viene ucciso**
  (SIGTERM, crash, «Termina processo») il backend resta vivo (verificato su macOS). Serve un watchdog: il backend
  controlla il PID del genitore o una pipe su stdin e si chiude quando sparisce. Da mettere nel contratto F0-04.
- *onefile* avrebbe aggravato il problema (processo bootloader + figlio) e rallentato ogni avvio: **confermato *onedir***.
- **Runner macOS di GitHub**: la finestra non compare mai (né lanciando l'eseguibile né con `open`; schermata nera
  catturata come artefatto), mentre `--smoke` funziona. Lo stesso `.dmg` su un Mac reale apre la finestra e mostra `/auth/me`.
  In CI il controllo finestra macOS è quindi solo un avviso; per macOS vale il controllo `--smoke` più una prova a mano per release.
- **Linux**: WebKitGTK 4.1 sotto Xvfb carica la pagina e chiama il comando Rust senza problemi: per ora **nessun motivo per il piano B Electron**.
- **Gatekeeper/SmartScreen**: non provati (artefatti scaricati con `gh`, senza attributo di quarantena; runner Windows senza SmartScreen).
  Restano valide le istruzioni «Apri comunque» del piano (§6.3).

## 4. Raccomandazioni

1. **Confermare Tauri v2 + PyInstaller onedir** come strada per F1. Nessuna libreria Python nativa ha bloccato la build.
2. **Correggere B1 (`fcntl`) nella madre** prima di F1-02: è l'unico bloccante reale per Windows ed è piccolo.
3. **Sostituire `pdf2image`/Poppler con PyMuPDF** (F1-04): una dipendenza nativa in meno su 3 sistemi.
   Per Graphviz decidere tra binari inclusi e render lato client.
4. **Ridurre il peso**: valutare se `pymupdf4llm` serve davvero il layout ONNX (`pymupdf-layout` → `onnxruntime`, 30–70 MB);
   PyMuPDF da solo è ~100 MB ed è irrinunciabile finché è il motore PDF.
5. **Contratto guscio↔sidecar (F0-04)**: porta libera passata dal guscio; tutte le variabili di percorso di B5 puntate alla cartella dati;
   `backend.log` nella cartella dati; health = `GET /auth/me` (o un `/health` dedicato); **watchdog del processo padre**; 1 worker uvicorn.
6. **Versione PyInstaller**: fissare ≥ 6.22 e allineare anche l'helper ChatGPT (6.11.1) se si aggiorna numpy lì.
7. **CI**: tenere questo workflow manuale; per le release usare la matrice completa (~20 min sul runner x64 macOS, il più lento).
   Cache pip/Rust attive; per x64 lo spike usa `macos-15-intel` (`macos-13` del piano è in dismissione, non provato); binario universale da valutare.
8. **Verifiche ancora aperte**: Mac Intel reale, Windows 10 reale (WebView2 presente?), Gatekeeper/SmartScreen sugli installer non firmati,
   comportamento dell'antivirus sul primo avvio Windows (14 s misurati in CI).

## 5. Limiti di questo spike

- Backend in modalità minimal (SQLite senza lifespan) su macOS e Windows; il lifespan reale è provato solo su Linux con Postgres di servizio.
- Nessun frontend Next, Postgres incorporato o tunnel: sono F0-02, F0-03 e F1.
- App non firmate (decisione provvisoria dell'utente); updater non configurato.
- Lo spike non è codice di prodotto: `desktop/spike-tauri/` può essere rimosso o assorbito quando parte F1-01.
