# Handoff PG-01 — runtime PostgreSQL incorporato

- Agente: `s31-pg-runtime-continue` (lavoro in chat diretta Timoniere); task `24553a7c-3f63-4e6c-85f7-3f26659aee79`, in corso.
- Branch/worktree: `feature/desktop-embedded-postgresql`, solo questo worktree.
- Base: `origin/main` (a171688e) + merge locale.

## ✅ Fatto (2026-10-26 17:30)

### 1. PostgresClusterManager (Rust)
- **File**: `desktop/teacher/src-tauri/src/postgres_cluster.rs` (NUOVO, ~500 righe)
- Strutture: `ClusterIdentity`, `RunningCluster`, `ClusterHealth`, `StopMode`, `StopResult`
- Metodi: `prepare_new()`, `start()`, `probe()`, `stop()`, `database_url()`
- `load_manifest()` per validare `resources/postgresql/manifest.json`
- Test unitari inclusi (urlencode, uuid_v4, serde, error display)

### 2. Credenziali PostgreSQL (portachiavi OS)
- **File**: `desktop/teacher/src-tauri/src/credentials.rs` (MODIFICATO)
- Metodi aggiunti: `generate_postgres_password()`, `get_postgres_password()`, `remove_postgres_passwords()`
- Chiavi: `postgresql-app:<uuid>`, `postgresql-admin:<uuid>` (32 byte base64url)

### 3. Integrazione Supervisore
- **File**: `desktop/teacher/src-tauri/src/supervisor.rs` (MODIFICATO)
- `Config`: aggiunto `postgres_enabled: bool` + metodo `desktop_contract()`
- `Supervisor`: aggiunti campi `postgres`, `postgres_running`, `postgres_database_url`
- `start_all()`: avvia PostgreSQL PRIMA del backend (ADR-0004 §5.3)
- `stop_all()`/`fail()`: ferma PostgreSQL DOPO backend/frontend/tunnel
- `start_postgres()`: prépare_new o carica identità esistente, avvia, probe, salva DATABASE_URL
- `stop_postgres()`: fast shutdown con timeout 10s
- `backend_spec()`: usa `postgres_database_url` se disponibile, altrimenti SQLite
- `check_version()`: usa `config.desktop_contract()` (2 per PG, 1 per SQLite)

### 4. Configurazione App
- **File**: `desktop/teacher/src-tauri/src/app.rs` (MODIFICATO)
- `postgres_enabled` di default true, disabilitato con `COUNSELORBOT_POSTGRES_DISABLED=1`

### 5. Layout 2 (DataDir)
- **File**: `desktop/teacher/src-tauri/src/datadir.rs` (MODIFICATO)
- Aggiunte directory: `db/postgresql/`, `migration/`, `backups/postgresql/`
- Costante `LAYOUT_POSTGRES = 2`

### 6. Manifest Binari
- **File**: `resources/postgresql/manifest.json` (NUOVO)
- 4 target: macos-arm64, macos-x64, windows-x64, linux-x64
- SHA-256 placeholder (popolato da CI)
- Licenze e notice documentate

### 7. Script Download Binari
- **File**: `scripts/download-postgres-binaries.py` (NUOVO)
- macOS/Windows: download da theseus-rs/postgresql-binaries 15.19.1
- Linux: build dai sorgenti PostgreSQL 15.19 su ubuntu-22.04
- Filtro esclusioni: include/, symbols/, .a, PL/Python, doc

### 8. Backend Health Check
- **File**: `backend/main.py` (MODIFICATO)
- `_desktop_contract()`: rileva dialetto DB (postgresql → 2, sqlite → 1)
- `DESKTOP_CONTRACT` calcolato dinamicamente
- `GET /health` restituisce contratto corretto (ADR-0004 §5.3)

### 9. Tauri Config
- **File**: `desktop/teacher/src-tauri/tauri.conf.json` (MODIFICATO)
- Aggiunto `"postgresql/": "postgresql/"` in `bundle.resources`

### 10. CI Workflow
- **File**: `.github/workflows/desktop-postgres.yml` (NUOVO)
- Job 1: download-binaries (matrice 4 target)
- Job 2: build-shell (cargo check/test/fmt + Tauri build)
- Job 3: smoke-postgres (initdb, avvio, doppio avvio, health contratto 2)
- Job 4: summary

## ⏳ Da fare / Verifiche

- [ ] `cargo check` in locale (timeout 180s superato, da riprovare)
- [ ] `cargo test` per i test unitari di postgres_cluster.rs
- [ ] `cargo fmt --check`
- [ ] CI verde su tutti i job
- [ ] PG-02: converter SQLite→PostgreSQL (task 6fa76440)
- [ ] PG-03: CI solo PostgreSQL + validazione (task a32ff62d)
- [ ] Release v2.0

## Blocchi e rischi

- `cargo check` lento (>180s) — prima build in worktree nuovo
- Binari PostgreSQL non ancora scaricati (CI li fetcha)
- Test integration richiedono ambiente con PostgreSQL reale
- Nessun dato reale, .env o credenziali di produzione toccate

## Prossimi passi

1. Commit e push di PG-01
2. Aprire PR `feat(desktop): PostgreSQL embedded runtime (PG-01)`
3. Dopo merge: lanciare PG-02 (converter dati)
4. Dopo PG-02: lanciare PG-03 (CI solo PostgreSQL)
5. Release v2.0 con PostgreSQL
