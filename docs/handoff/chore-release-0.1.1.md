# Handoff — chore/release-0.1.1 (preparazione Desktop Beta v0.1.1)

Agente: s17-release-011 (avviato Codex gpt-6.1-sol medium --yolo, fermato a quota senza commit; lavoro portato a termine su mandato Timoniere, task Diario 9067e1f6). Worktree `Counselorbot-worktrees/chore-release-0.1.1`, branch `chore/release-0.1.1`.

## Stato
- Base `main` e793de23: il fix login #591 (0ec7a085) è nel DAG, verificato con `git merge-base --is-ancestor`.
- VERSION 0.1.1 propagato con lo script; `version-check` e test allineati. Nessun merge/tag/Release (gate rispettato).
- v0.1.0 (Desktop Beta) pubblicata resta intatta: tag e asset non toccati.

## Fatto
- **fix(release)** — bug Diario 0be7c91d: `sync-version.py` ora copre `desktop/*/package-lock.json`, la sola `version` del blocco `[package]` di `desktop/*/src-tauri/Cargo.toml` e la voce del crate dell'app in `desktop/*/src-tauri/Cargo.lock`. Dipendenze intatte, targets opzionali se assenti, fail-closed se la voce crate manca. Regressioni in `scripts/tests/test_sync_version.py` (check non mutativo, propagazione, idempotenza, opzionalità, voce mancante → ValueError). `version.yml` esteso alle nuove paths.
- **chore: v0.1.1** — VERSION → 0.1.1 + `make version-sync`: 12 file di versione allineati (backend/version.py, frontend json+lock, teacher e spike-tauri con package/lock/Tauri/Cargo; spike riallineato da 0.0.1 a 0.1.1, una tantum).
- **docs** — `docs/operations/release.md` riscritta con la procedura reale: `desktop-teacher.yml` esistente (PR o workflow_dispatch, artifact 4 piattaforme + `update-manifests`, nessuna pubblicazione automatica, firma condizionale su segreti, provenienza dal run dispatch su `main` dopo il merge, divieto di sostituire asset/tag della v0.1.0, canali updater non operativi su prerelease). CONTEXT.md §F1-01 aggiornata; funzionalità + guidance stale sistemati con `make guidance-refresh`/`check`.
- **Note release**: `/tmp/counselorbot-release-011-notes.md` (IT): fix accesso locale senza redirect ai4auth (PR #591), installer 4 target, prova rapida login (link 60 s monouso), checksums, limiti Beta accettati.

## Verifiche
- `python3 -m unittest discover -s scripts/tests -p 'test_sync_version.py'` 7/7; `make version-check`: tutto 0.1.1.
- `make guidance-refresh` + `guidance-check` verdi; YAML `version.yml` valido; `py_compile` OK (ruff assente in locale, segnalato).
- Node 22.23.3: `node --test --experimental-strip-types` su auth-provider/auth-urls/runtime-config 11 pass (base include il login corretto).
- `TEST_DB=sqlite python3 -m pytest -q backend/tests/test_local_auth.py` 20 pass; `git diff` dei file di versione limitato alle righe di versione.

## Prossimi passi
- Push + PR (titolo `chore(release): v0.1.1 Desktop Beta con sync metadati desktop`); report immediato alla notify; monitoraggio check sullo SHA esatto.
- `desktop-teacher.yml` girerà su PR (toca `desktop/**`): ~30-40 minuti, artifact di verifica su 4 piattaforme; non duplicare build.
- Bug 0be7c91d aggiornato `risolto` al momento dei commit con prove.
- Dopo il merge (proprietario): Timoniere lancia `gh workflow run desktop-teacher.yml --ref main`, scarica gli artifact del run e pubblica la prerelease `v0.1.1 (Desktop Beta)` con le note di /tmp (compito pubblicazione 6d2ef4a2 del Timoniere: NON di questo agente).

## Blocchi e rischi
- CI desktop lunga: nessuna strategia di duplicazione build; se rossa, correzione solo per cause del rilascio con evidenza.
- Canali updater: stabili su prerelease non funziona (GitHub esclude le prerelease da `releases/latest`), `beta` richiede release sul tag `beta`; resta decisione del proprietario.
