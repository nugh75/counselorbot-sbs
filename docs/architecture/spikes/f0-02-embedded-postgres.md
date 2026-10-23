# Spike F0-02 — Postgres incorporato

Compito F0-02 di `docs/architecture/desktop-apps-plan.md` (§3.3, §8), epic #499, issue #502.
Data: 23–24 ottobre 2026. Misure su GitHub Actions, run
[40031477139](https://github.com/nugh75/counselorbot-sbs/actions/runs/40031477139) (run finale) e due run
precedenti ([40030162307](https://github.com/nugh75/counselorbot-sbs/actions/runs/40030162307),
[40030651109](https://github.com/nugh75/counselorbot-sbs/actions/runs/40030651109)) per la ripetibilità.

## Esito in breve

- **Definition of Done raggiunta**: `initdb` + avvio + migrazioni della madre in una cartella utente
  funzionano su **macOS arm64, macOS x64, Windows x64 e Ubuntu 22.04**, con Postgres **15.19**
  (stessa versione maggiore della produzione, `postgres:15`). In tutti i casi il backend vero
  (`backend.main`: `create_all`, le migrazioni di `backend/migrations/` chiamate da `backend/main.py`, seeding del lifespan)
  crea **112 tabelle** e risponde su HTTP.
- **Parte Postgres trascurabile nel primo avvio**: `initdb` 0,4–2,6 s, avvio 0,1–0,25 s.
  Il tempo vero è l'**avvio del backend** (8–25 s la prima volta, 4–12 s le successive).
- **Raccomandazione**: binari **theseus-rs/postgresql-binaries** per macOS e Windows; per Linux
  **build dai sorgenti su Ubuntu 22.04** nella CI di release (99 s, 22 MB). Dettagli al §5.

## 1. Come è stato misurato

- `scripts/spikes/embedded_postgres_probe.py`: scarica (o compila) i binari, esegue `initdb` in una
  cartella utente standard (`~/Library/Application Support/CounselorBotSpike`, `%APPDATA%\CounselorBotSpike`,
  `~/.local/share/CounselorBotSpike`), avvia con `pg_ctl` su `127.0.0.1` e porta casuale, senza socket Unix,
  autenticazione `scram-sha-256` con password generata. Crea il DB `counselorbot`, avvia **due volte** il
  backend (`scripts/spikes/embedded_postgres_backend.py`, uvicorn) e misura il tempo fino alla prima
  risposta HTTP (uvicorn accetta connessioni solo dopo il lifespan, quindi dopo migrazioni e seeding).
  Poi `pg_dump -Fc`, stop, riavvio a caldo. Report JSON come artifact del job.
- `.github/workflows/spike-embedded-postgres.yml`: matrice `macos-14` (arm64), `macos-15-intel` (x64),
  `windows-latest`, `ubuntu-22.04` × fonti dei binari. Parte **solo** con `workflow_dispatch` o push su
  branch `spike/**` che toccano lo script o il workflow: mai da sola su `main`.
- Python 3.12, `pip install -r backend/requirements.txt`. Runner GitHub: i tempi sono indicativi
  (macchine condivise, macOS Intel la più lenta).

## 2. Fonti dei binari valutate

| Fonte | macOS arm64 | macOS x64 | Windows x64 | Ubuntu 22.04 | Strumenti inclusi | Licenza |
|-------|-------------|-----------|-------------|--------------|-------------------|---------|
| **theseus-rs/postgresql-binaries** 15.19.1 (GitHub Releases, aggiornato al 18/10/2026) | ✅ | ✅ | ✅ | ❌ build glibc: `GLIBC_2.36 not found` (22.04 ha 2.35); build musl: dinamica, manca il loader musl | tutti (`initdb`, `pg_ctl`, `postgres`, `pg_dump`, `pg_restore`, `psql`, `pg_upgrade`) | stile PostgreSQL License; note di terze parti in `dependency-notices/`; checksum `.sha256`, SBOM e provenance per ogni asset |
| **zonky embedded-postgres-binaries** 15.19.0 (Maven Central) | ✅ | ✅ (stesso jar universale di arm64) | ✅ (ripacchettizza EDB: include DLL wxWidgets di pgAdmin) | ✅ (compilato su gcc 7.5) | solo `initdb`, `pg_ctl`, `postgres`: **niente `pg_dump`** | Apache-2.0 (pacchetto); Linux include OpenSSL 1.1.1, fuori supporto dal 2023 |
| **Build dai sorgenti** 15.19 su `ubuntu-22.04` | — | — | — | ✅ (99 s di build, rilocabile con rpath `$ORIGIN`, spostata di cartella e avviata) | tutti | PostgreSQL License |
| EDB binaries zip | sì | sì | sì (zip 322 MB con pgAdmin) | **no** (la pagina download offre solo Windows e Mac) | tutti | PostgreSQL License + termini di download EDB |
| `pgserver` / `pixeltable-pgserver` (wheel Python) | sì | sì | sì | sì | non verificato | non verificato; non provato: lega la versione Postgres al pacchetto Python e `pgserver` originale è fermo al 2024 |

## 3. Dimensioni (MB)

| Piattaforma / fonte | Archivio | Installato | Note sul contenuto |
|---------------------|---------:|-----------:|--------------------|
| macOS arm64 theseus | 36,9 | 108,5 | ICU 33,4; `include/` 5,1; `lib/Python` (PL/Python) 5,1 |
| macOS x64 theseus | 37,5 | 104,1 | come sopra |
| macOS zonky (arm64 e x64) | 61,3 | 306,6 | `libicudata` 57,7 copiato **tre volte** (i link diventano copie) |
| Windows theseus | 83,1 | 276,2 | `symbols/` (`.pdb`) **152,3**, ICU 33,1, `python314.dll` 6,8 |
| Windows zonky | 22,6 | 96,7 | ICU 28,4, DLL wxWidgets 8,4 |
| Ubuntu zonky | 14,6 | 57,1 | ICU 26,9 |
| Ubuntu dai sorgenti (senza ICU) | 10,0 (tar.gz) | 28,7 | 21,7 senza `include/` |

Stima dopo la potatura dei file non necessari a runtime (`include/`, `symbols/`, `.a`, PL/Python, documentazione):
**~95 MB macOS, ~110 MB Windows, ~22 MB Linux** installati. Va verificato in F1-05 che nulla di rimosso serva.

Cartella dati: **40 MB** dopo `initdb` (16 MB sono il primo segmento WAL), **76 MB** dopo le migrazioni
(database 19 MB). Dump `pg_dump -Fc` del DB appena migrato: **0,7 MB**.

## 4. Tempi (secondi, run finale)

| Piattaforma / fonte | `initdb` | avvio PG a freddo | crea DB | backend 1° avvio | **primo avvio totale** | backend 2° avvio | `pg_dump` | stop | avvio a caldo |
|---------------------|---------:|------------------:|--------:|-----------------:|-----------------------:|-----------------:|----------:|-----:|--------------:|
| macOS arm64 theseus | 0,58 | 0,24 | 0,17 | 8,42 | **9,4** | 4,08 | 0,21 | 0,23 | 0,24 |
| macOS arm64 zonky | 0,96 | 0,14 | 0,14 | 8,14 | **9,4** | 5,52 | — | 0,34 | 0,30 |
| macOS x64 theseus | 1,40 | 0,19 | 0,17 | 25,20 | **27,0** | 12,02 | 0,40 | 0,46 | 0,23 |
| macOS x64 zonky | 1,53 | 0,24 | 0,15 | 16,74 | **18,7** | 11,06 | — | 0,22 | 0,26 |
| Windows theseus | 2,56 | 0,24 | 0,26 | 18,59 | **21,7** | 9,26 | 0,38 | 1,34 | 0,25 |
| Windows zonky | 1,82 | 0,25 | 0,21 | 18,71 | **21,0** | 8,18 | — | 1,97 | 0,24 |
| Ubuntu dai sorgenti | 0,49 | 0,10 | 0,05 | 14,03 | **14,7** | 8,14 | 0,16 | 0,10 | 0,10 |
| Ubuntu zonky | 0,43 | 0,11 | 0,03 | 13,95 | **14,5** | 7,06 | — | 0,10 | 0,11 |

«Primo avvio totale» = `initdb` + avvio + crea DB + primo avvio del backend (i binari arrivano già con
l'installer, quindi l'estrazione non conta). Nei tre run la variazione per lo stesso job è ±30–50 % sul
backend (es. macOS x64 theseus 15,1 / 19,9 / 25,2 s), mentre i tempi di Postgres restano stabili.
Il primo avvio è dominato da `create_all`, migrazioni e seeding del backend: per l'app conviene una
schermata «Preparazione del database…» al primo avvio.

## 5. Raccomandazione

1. **Versione**: Postgres **15** come la produzione (dump intercambiabili con la madre). Postgres 15 è
   supportato fino a novembre 2027: il passaggio a 17/18 va pianificato (dump/restore guidato o
   `pg_upgrade`, incluso in theseus e nella build dai sorgenti).
2. **macOS e Windows: theseus-rs/postgresql-binaries**, versione fissata con checksum `.sha256` del
   rilascio, scaricata dalla CI di release. Ha tutti gli strumenti (serve `pg_dump` per backup e
   aggiornamenti, F1-05), licenza permissiva, SBOM/provenance, rilasci frequenti. In CI rimuovere
   `include/`, `symbols/`, PL/Python e documentazione.
3. **Linux: build dai sorgenti su `ubuntu-22.04`** nella CI di release (`--without-icu --without-readline`,
   `make install rpathdir='$$ORIGIN/../lib'`): 99 s, 22 MB, gira su 22.04 e successive (glibc più recente
   compatibile all'indietro). theseus non è utilizzabile su 22.04; zonky funziona ma non ha `pg_dump`
   e porta OpenSSL 1.1.1.
4. **zonky scartato**: manca `pg_dump`/`pg_restore` su tutte le piattaforme, macOS pesa il triplo,
   la build Windows contiene residui di pgAdmin.
5. Opzione da valutare in F1-05: compilare dai sorgenti anche su macOS (runner arm64 e Intel) per
   eliminare ICU (−33 MB). Su Windows resta theseus (build MSVC più onerosa).

## 6. Problemi trovati e indicazioni per F1-02/F1-05

- **Windows, privilegi**: se il processo è amministratore elevato, `initdb`/`pg_ctl` si riavviano con un
  token ristretto e non leggono i file creati dal processo elevato («invalid binary», «Permission denied»
  su `postgres.bki`). Sul runner si è risolto con `icacls … /grant *S-1-5-32-545:(OI)(CI)F`. L'app deve
  girare **non elevata** e creare la cartella dati con l'utente normale.
- **Windows, pipe ereditate**: `pg_ctl start` lascia `postgres` con gli handle di stdout/stderr del
  chiamante; leggere l'output con una pipe blocca il guscio per sempre. Il sidecar deve mandare l'output
  di `pg_ctl` su file (`-l` + redirezione su file o `NUL`).
- **Backend su Windows**: `backend/rag_index.py` e `backend/rag_reindex_job.py` importano `fcntl`
  (solo Unix), quindi `backend.main` non si importa su Windows. Nello spike c'è un sostituto no-op
  (`scripts/spikes/embedded_postgres_backend.py`); la correzione vera spetta a F0-01/F1-04 (lock
  portabile, es. `msvcrt.locking` o `portalocker`).
- **Collazione**: lo spike usa `--locale=C` (uguale su tutti i sistemi, nessuna dipendenza dalle locale
  del PC). La produzione Docker usa `en_US.utf8`: gli `ORDER BY` su testo possono differire (maiuscole,
  accenti). Da decidere in F0-04: `C`, oppure collazione ICU dove disponibile.
- **macOS non firmato**: i binari Postgres dentro il bundle seguono la sorte dell'app (Gatekeeper al primo
  avvio). Non verificabile in CI; da provare con F0-01.
- **zonky darwin-amd64**: è lo stesso jar universale di arm64; `version()` riporta `aarch64` anche su Intel.

## 7. Licenze

- **PostgreSQL**: PostgreSQL License (permissiva, stile BSD/MIT): ridistribuzione libera mantenendo
  l'avviso di copyright.
- **theseus-rs/postgresql-binaries**: licenza dello stesso tipo (copyright Theseus). Le librerie incluse
  (ICU — Unicode License; OpenSSL 3 — Apache-2.0; libxml2 — MIT; zlib, lz4, zstd; Python per PL/Python
  — PSF) hanno gli avvisi in `dependency-notices/`, da copiare nelle note di terze parti dell'app.
- **Build dai sorgenti Linux**: solo PostgreSQL License + zlib (libreria di sistema).
- **zonky**: Apache-2.0 per il pacchetto; i contenuti seguono le licenze di PostgreSQL ed EDB.
- Nessuna licenza copyleft forte: compatibili con la distribuzione delle app (anche gratuite e non firmate).

## Verifiche e limiti

- Verificato in CI: tutto ciò che è nelle tabelle §3–§4 (artifact dei run citati).
- Non verificato: Windows 10 (il runner è Windows Server), Ubuntu 24.04, antivirus reali sui file del
  cluster, Gatekeeper/SmartScreen con l'app impacchettata, dimensioni dopo la potatura, wheel `pgserver`.
