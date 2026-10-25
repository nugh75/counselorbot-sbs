# Handoff — chore/release-0.1.1 (Desktop Beta v0.1.1 pubblicata)

Agente: s17-release-011 (avviato Codex gpt-6.1-sol medium --yolo, fermato a quota senza commit; lavoro continuato e chiuso in sessione con il proprietario su mandato Timoniere, task Diario 9067e1f6). Worktree dedicato rimosso al termine, branch locale eliminato dopo il merge.

## Stato
- **Rilascio pubblicato**: [v0.1.1 (Desktop Beta)](https://github.com/nugh75/counselorbot-sbs/releases/tag/v0.1.1), prerelease con 4 installer (DMG ARM64/Intel, NSIS, deb) + `.sha256` + `latest.json`/`latest-beta.json`.
- Provenienza controllata: run `desktop-teacher.yml` workflow_dispatch su `main` **40217531497**, SHA f7fdb03a (merge commit di PR #596). Checksum rilocalizzati con `shasum -c` su tutti i quattro installer: OK.
- PR #596 MERGED (fix sync metadati desktop + VERSION 0.1.1 + docs procedura); v0.1.0 intatta.

## Fatto
- fix(release) bug Diario 0be7c91d: `sync-version.py` copre `desktop/*/package-lock.json`, la `version` del blocco `[package]` di `src-tauri/Cargo.toml` e la voce del crate in `Cargo.lock` (dipendenze intatte, opzionalità, fail-closed) con regressioni dedicate; `version.yml` esteso.
- chore: VERSION 0.1.1 propagata a 12 file di versione (spike riallineato 0.0.1→0.1.1 una tantum).
- docs: procedura reale di rilascio in `docs/operations/release.md`; note in `/tmp/counselorbot-release-011-notes.md`; handoff vivo chiuso qui.

## Verifiche
- Suite sync 7/7; `version-check` allineato 0.1.1 su main dopo il merge; `guidance-refresh/check` verdi.
- Build ufficiale `desktop-teacher` 40217531497: **success** su 4 runner + manifest; build PR 40216902186: success.
- backend-db su PR rosso SOLO per baseline: 54 test postgres, set identico (confronto diff) al run della PR #593 "realign known failures baseline" già accettata dal Timoniere. Nessuna regressione introdotta.
- Node 22 login test 11/11; `TEST_DB=sqlite test_local_auth.py` 20 pass; login fix #591 nel DAG.
- Limiti in nota: installer non firmati (segreto signer assente), updater non operativo su prerelease (stable esclude prerelease; beta richiede release sul tag `beta`).

## Prossimi passi (proprietario)
- Distribuire la v0.1.1 ai PC docenti come da `docs/operations/desktop-teacher-guide.md`.
- Se si vuole aggiornamento automatico: decidere strategia tag `beta` oppure release completa; fornire `TAURI_SIGNING_PRIVATE_KEY` al repository.
- Baseline postgres rosso: pianificare la riallineatura a parte (non release-blocking).

