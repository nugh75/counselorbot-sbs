# Dipendenze native per le app desktop (F1-04)

Compito F1-04 di [`desktop-apps-plan.md`](desktop-apps-plan.md) (epic #499). Data: 2026-10-24.
Parte dal report [`spikes/f0-01-tauri-pyinstaller.md`](spikes/f0-01-tauri-pyinstaller.md) §3.2:
`dot`, `pdftoppm` e `tesseract` mancano nei bundle PyInstaller.

## Esito in breve

| Programma | Dove lo usava il backend | Decisione | Senza il programma |
|---|---|---|---|
| `pdftoppm` (Poppler) | `pdf2image.convert_from_path` in `backend/qsa_extractor.py:84` (estrazione QSA da PDF) e `backend/pqbl_generator.py:77` (OCR pQBL) | **Eliminato**: le pagine si rasterizzano con PyMuPDF, già nel backend (`backend/pdf_images.py`). Tolti `pdf2image` da `requirements.txt` e `poppler-utils` dal `Dockerfile` | — (non serve più) |
| `tesseract` | nessun uso nel codice Python: solo `tesseract-ocr-ita/eng` nel `backend/Dockerfile:13` | **Non incluso** nelle app. L'OCR è Ollama locale (`glm-ocr`) o il provider di visione | — |
| `dot` (Graphviz) | `backend/diagram_render.py` (`_render_cached`): diagrammi concettuali in SVG (web) e PNG (PDF, Telegram) | **Rilevato a runtime**; incluso solo dove esiste un binario ufficiale autosufficiente (Windows); altrove si usa quello di sistema se c'è | Disegno sostituito da messaggio chiaro + relazioni in testo; PDF e Telegram ripiegano sul testo come già facevano |

## Rilevamento a runtime

`backend/native_deps.py`:

- `find_program(name)` cerca, in ordine: `NATIVE_BIN_DIR` (la cartella dei binari inclusi, impostata dal guscio Tauri),
  `PATH`, e su macOS `/opt/homebrew/bin` e `/usr/local/bin` (un'app aperta dal Finder non eredita il `PATH` della shell,
  quindi senza questo un Graphviz di Homebrew non si vedrebbe).
- `native_capabilities()` → `{"diagrams": {"available": bool, "program": "graphviz"}}`, esposto in **`GET /capabilities`**
  (dal frontend: `/api/capabilities`). Solo booleani, nessun percorso.
- Tutti i layout passano dall'unico binario `dot` con `-K<motore>` (`dot -Kcirco` = `circo`): basta impacchettare e cercare
  un programma solo. In Docker il risultato è identico.
- Senza `dot`, `render()` solleva `GraphvizUnavailableError` (sottoclasse di `DiagramSpecError`, quindi PDF e Telegram
  restano invariati); `POST /diagram/render` risponde **503** con
  `{"detail": {"code": "diagram.errors.graphvizUnavailable", ...}}` invece del 422 di uno spec rotto.
- Il riquadro del diagramma (`frontend/src/components/ui/DiagramBlock.tsx`) su 503 mostra
  «Il disegno non è disponibile su questa installazione: manca il programma Graphviz. Le relazioni sono riportate qui sotto.»
  (6 lingue, `frontend/src/lib/i18n-diagram.ts`), senza il pulsante Riprova, e lascia leggibili le relazioni in testo.

**Docker invariato**: Graphviz resta installato da apt e sta nel `PATH`; `NATIVE_BIN_DIR` non è impostata.

## Matrice per piattaforma

Piattaforme ufficiali della Fase 1: macOS 13+ arm64/x64, Windows 10/11 x64, Ubuntu 22.04+ x64.

| | macOS arm64 | macOS x64 | Windows x64 | Linux x64 `.deb` | Linux x64 `.AppImage` | Docker |
|---|---|---|---|---|---|---|
| Rasterizzazione PDF (PyMuPDF) | ✅ inclusa | ✅ inclusa | ✅ inclusa | ✅ inclusa | ✅ inclusa | ✅ |
| Graphviz | sistema (Homebrew), facoltativo | sistema (Homebrew), facoltativo | **incluso** 16.1.0 | dipendenza del pacchetto (`graphviz` di apt) | sistema, facoltativo | apt |
| Tesseract | — | — | — | — | — | installato ma non usato |
| Senza Graphviz | messaggio + testo | messaggio + testo | — | — | messaggio + testo | — |

Perché non includere Graphviz ovunque:

- **Windows**: il progetto Graphviz pubblica uno zip ufficiale autosufficiente (programmi + DLL di cairo, pango, expat, …,
  plugin con `config8`): 9,8 MB scaricati, ~20 MB la cartella `bin/` (misurati su 16.1.0).
- **macOS**: non esiste un binario ufficiale. Homebrew installa `dot` con ~20 librerie dinamiche (cairo, pango, glib, …)
  in percorsi assoluti: renderle rilocabili dentro il `.app` (riscrittura con `install_name_tool`, firma) è un lavoro a sé.
  Per la Fase 1 (pilota = proprietario) basta `brew install graphviz`; il backend lo trova da solo.
- **Linux `.deb`**: Tauri permette di dichiarare le dipendenze (`bundle.linux.deb.depends`): `graphviz` di Ubuntu 22.04 (2.42)
  arriva con l'installazione. L'**AppImage** non ha dipendenze dichiarabili: usa il Graphviz di sistema se c'è.

Alternativa da rivalutare se macOS diventa importante: rendering dei diagrammi con Graphviz compilato in WebAssembly
(es. `@viz-js/viz`) nel sidecar Node del frontend; servirebbe anche al PNG di PDF/Telegram, quindi non è un cambio piccolo.

## Binari inclusi e licenze

| Binario | Piattaforma | Versione | Sorgente | SHA-256 | Licenza |
|---|---|---|---|---|---|
| Graphviz (`bin/`) | Windows x64 | 16.1.0 (2026-09-04) | `windows_10_cmake_Release_Graphviz-16.1.0-win64.zip`, pacchetti ufficiali GitLab del progetto | `733e4962…d92d6abc` | **EPL-2.0** (testo da `LICENSE` del tag, SHA-256 `0becf165…7130e5303`) |

Le DLL di terze parti nello zip hanno licenze proprie compatibili con la ridistribuzione (cairo LGPL-2.1/MPL-1.1, pango e glib
LGPL-2.1+, expat MIT, zlib, libpng): il guscio deve elencarle nella schermata «Licenze» (F1-15).

Script: [`desktop/native-deps/fetch-graphviz.sh`](../../desktop/native-deps/fetch-graphviz.sh)
`<windows-x64|macos-arm64|macos-x64|linux-x64> <cartella>`: su Windows scarica lo zip, verifica gli SHA-256 e
scrive `<cartella>/bin` e `<cartella>/LICENSES/graphviz-EPL-2.0.txt`; sulle altre piattaforme non scarica nulla.
Aggiornare Graphviz = cambiare `VERSION` e i due SHA-256 nello script.

## Cosa resta a F1-02 / F1-15

- Il guscio passa `NATIVE_BIN_DIR=<risorse dell'app>/native/bin` al sidecar (contratto F0-04).
- La CI di release chiama lo script e mette `native/` nelle `resources` di Tauri; nel `.deb` aggiunge `depends: ["graphviz"]`.
- Il frontend può leggere `/api/capabilities` per nascondere in anticipo i controlli del disegno; oggi il messaggio
  compare alla prima richiesta di disegno.

## Verifiche

- Test senza binari: `backend/tests/test_native_deps.py` svuota `PATH`/`NATIVE_BIN_DIR` e simula l'assenza di Graphviz
  (capacità `false`, errore dedicato, 503 con codice, un solo binario `dot -K`), crea finti binari per l'ordine di ricerca,
  rasterizza un PDF con PyMuPDF senza Poppler; con Graphviz presente disegna tutti i layout in SVG e PNG.
- Workflow [`.github/workflows/desktop-native-deps.yml`](../../.github/workflows/desktop-native-deps.yml) (manuale o su
  `feature/f1-04-**`): macOS arm64/x64 e Linux senza Graphviz, Linux con apt, Windows con il Graphviz incluso;
  typecheck, i18n e lint del frontend.
- Sulle PR che toccano questi file `test_native_deps.py` gira anche nel workflow `backend-windows` (runner senza Graphviz).
