# Handoff — F1-15 matrice CI installer desktop
Agente: s67-f1-15-ci-matrix (riprende s65-f115-agy, Gemini, fermato per quota)
Branch: feature/f1-15-ci-desktop-matrix · Issue: #576 · PR: #577
Task diario: a3711ce4-4f3b-404e-85fa-91adc4794c9a · Aggiornato: 2026-10-24

## Stato
Pronto per il merge — PR #577, CI verde sui 4 runner.

## Fatto
- Workflow `desktop-teacher`: bundle `dmg` su macos-14/macos-15-intel, NSIS su
  Windows, deb su Ubuntu; checksum `.sha256` per ogni installer negli artifact.
- Corretto il lavoro precedente: rimosso ramo `certutil`/`findstr` (rotto in
  Git Bash, `sha256sum` c'è già); ripristinata ricerca `.app` in `bundle/macos`.
- `tauri.conf.json`: `bundle.macOS.dmg` (NSIS per utente già presente).
- Piano: F1-15 🟡 (restano Release, `latest.json`, firma condizionale).
- CI 1° giro: deb verde; macos-14 rosso (`cp: : No such file`): con solo
  `dmg` Tauri cancella `bundle/macos/*.app`. Fix: `--bundles app,dmg` su macOS.
- Fix: `supervisor.rs` non compilava su main (match non esaustivo, F1-10 × F1-08).

## Verifiche
- `cargo check` verde dopo il fix (risorse vuote locali, ignorate da Git).
- Snippet checksum provato su bundle fittizio (`shasum -c` OK).
- YAML del workflow valido. `cargo test`: 37 passati.
- guidance-refresh/check: documentazione allineata.
- CI run 40136113852 verde: macos-14 10 min, macos-15-intel 26 min, windows
  15 min, ubuntu 10 min (lifecycle test inclusi). Artifact 225–387 MB.
- DMG ARM64 scaricato: `shasum -a 256 -c` OK.

## Prossimi passi
- Merge da parte dell'utente.
- Resto di F1-15: Release, `latest.json`, firma condizionale.

## Blocchi e rischi
- Installer non firmati. Negli artifact i file stanno sotto il percorso
  completo del runner (antenato comune con i report lifecycle in runner.temp).
- Nessun deploy, sudo o segreto.
