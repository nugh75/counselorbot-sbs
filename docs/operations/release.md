# Versione e rilascio

Una sola versione per tutto il repository (piano `docs/architecture/desktop-apps-plan.md` §6.1, F1-01).

## Dove sta la versione

- **Fonte unica**: il file `VERSION` alla radice, formato `X.Y.Z` (SemVer; ammesso un suffisso
  di pre-release, es. `0.2.0-beta.1`, per il futuro canale beta).
- **Copie generate** da `scripts/sync-version.py`, da non modificare a mano:
  - `frontend/package.json` e `frontend/package-lock.json` (campo `version` e pacchetto radice);
  - `backend/version.py` (`__version__`), esposto da `GET /version` e nei metadati OpenAPI;
  - per ogni app sotto `desktop/` (`teacher` per il docente; anche lo spike di sviluppo
    `spike-tauri` viene allineato): `desktop/*/package.json` e `desktop/*/package-lock.json`,
    `desktop/*/src-tauri/tauri.conf.json`, la riga `version` del blocco `[package]` di
    `desktop/*/src-tauri/Cargo.toml` e la voce del crate corrispondente in
    `desktop/*/src-tauri/Cargo.lock` (quella che il job `manifest` legge per scrivere la
    versione in `latest.json`/`latest-beta.json`).
- Lo script aggiorna solo righe di versione: mai le dipendenze e solo file modificati a mano si
  rifiuta (`--check` esce 1). Tag e Release GitHub: `vX.Y.Z`, il formato di `.github/release-drafter.yml`.

## Comandi

| Comando | Effetto |
|---------|---------|
| `make version-check` (`python3 scripts/sync-version.py --check`) | Non scrive nulla; esce con 1 ed elenca i file disallineati |
| `make version-sync` (`python3 scripts/sync-version.py`) | Copia `VERSION` in tutti i file elencati sopra |

Nessuna dipendenza esterna: basta Python 3.

## Controllo in CI

Il workflow `.github/workflows/version.yml` gira sulle pull request che toccano `VERSION`, i file
generati (frontend, backend, desktop: JSON, Tauri, Cargo) o lo script (e a mano con *Run workflow*):
esegue i test `scripts/tests/test_sync_version.py` e `sync-version.py --check`. Una PR che cambia
`VERSION` senza propagarla, o che modifica a mano una copia, fallisce.

## Build degli installer (workflow `desktop-teacher.yml`)

Il workflow esistente `.github/workflows/desktop-teacher.yml` parte su ogni PR che tocca `desktop/**`
(o a mano con *Run workflow*), non su main né su tag. Su quattro runner (macOS ARM64, macOS
Intel, Windows, Linux) compila backend con PyInstaller, frontend Next standalone e app Tauri, gira i
test di contratto/lifecycle e produce gli artifact:

- `teacher-macos-arm64` (DMG), `teacher-macos-x64` (DMG), `teacher-windows-x64` (NSIS `.exe`),
  `teacher-linux-x64` (`.deb`), ognuno con il proprio `.sha256`;
- `update-manifests` con `latest.json` e `latest-beta.json` generati dalla versione di `Cargo.toml`.

Un run di PR **non pubblica nulla** e non sostituisce la build ufficiale: serve come verifica delle
quattro piattaforme. Gli installer dell'app sono **non firmati** a meno che i secrets
`TAURI_SIGNING_PRIVATE_KEY`/`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` non esistano nel repository: senza
chiave la firma e gli archivi updater (`.zip`/`.tar.gz` + `.sig`) vengono saltati con un avviso. I
run durano circa 30-40 minuti: non fare build duplicate.

## Procedura di rilascio

La release si fa **su richiesta del proprietario**; tag e pubblicazione sono del Timoniere. Per una
Desktop Beta (pre-release) es. `v0.1.1`:

1. **Preparazione**: su un branch `chore/release-X.Y.Z` da `main` aggiornato, scrivere la nuova
   versione in `VERSION`, poi `make version-sync` e `make version-check`; commit `chore: release
   vX.Y.Z` con **solo** i file di versione; PR con procedura e test descritti, senza toccare main.
   La PR avvia anche `desktop-teacher.yml` sulle quattro piattaforme: attendere i suoi check.
2. **Merge**: il proprietario unisce la PR con «Create a merge commit».
3. **Build con provenienza controllata**: dopo il merge, da `main` aggiornato verificare
   `make version-check`; poi lanciare `desktop-teacher.yml` con *Run workflow* sul branch `main`
   così che gli installer escono esattamente dall'albero della merge commit etichettata:

   ```bash
   git switch main && git pull --ff-only
   make version-check
   gh workflow run desktop-teacher.yml --ref main
   ```

4. **Tag e Release**: scaricare i quattro artifact più `update-manifests` dell'esatto run e
   pubblicare/sistemare la release `vX.Y.Z` sulla merge commit (prerelease per una Desktop Beta),
   con installers + `.sha256` + `latest.json` + `latest-beta.json`:

   ```bash
   gh release create vX.Y.Z --target main --prerelease --title "vX.Y.Z (Desktop Beta)" --notes-file <note>
   # oppure, se Release Drafter ha già una bozza con quel tag: gh release edit vX.Y.Z --draft=false
   ```

   Farsi seguire da una seconda persona o `gh api` per i checksum quando si toccano asset:
   non rimpiazzare mai asset di una release esistente; i tag e i file delle versioni precedenti
   (es. `v0.1.0`) restano improntati.
5. **Solo canale beta**: per attivare l'auto-aggiornamento del canale `beta` serve una release sul
   tag `beta` che contenga `latest-beta.json` coerente con la versione; il canale `stable` resta
   su `releases/latest/download/latest.json` e quindi mostra aggiornamenti solo a release complete
   (non prerelease), a meno che l'endpoint non venga sovrascritto a runtime con
   `COUNSELORBOT_UPDATER_URL`.

## Note

- Prima release pubblicata: `v0.1.0 (Desktop Beta)` del 2026-10-25, tag `v0.1.0` **anteriore** al
  fix dell'accesso locale (PR #591): installare a mano il bundle della release nuova; la v0.1.0
  resta disponibile senza modifiche.
- La versione dell'app è distinta dalla **versione di protocollo** della sincronizzazione
  docente/studente (piano §4.5), che avrà un proprio numero.
- Il deploy di produzione non dipende dalla versione: resta la procedura in `CONTEXT.md`.
