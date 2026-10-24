# Handoff — F1-15 matrice CI installer desktop
Agente: s67-f1-15-ci-matrix (riprende s65-f115-agy, Gemini, fermato per quota)
Branch: feature/f1-15-ci-desktop-matrix · Issue: #576 · PR: —
Task diario: a3711ce4-4f3b-404e-85fa-91adc4794c9a · Aggiornato: 2026-10-24

## Stato
Verifiche locali verdi; commit e PR in corso.

## Fatto
- Workflow `desktop-teacher`: bundle `dmg` su macos-14/macos-15-intel, NSIS su
  Windows, deb su Ubuntu; checksum `.sha256` per ogni installer negli artifact.
- Corretto il lavoro precedente: rimosso ramo `certutil`/`findstr` (rotto in
  Git Bash, `sha256sum` c'è già); ripristinata ricerca `.app` in `bundle/macos`.
- `tauri.conf.json`: `bundle.macOS.dmg` (NSIS per utente già presente).
- Piano: F1-15 🟡 (restano Release, `latest.json`, firma condizionale).
- Fix: `supervisor.rs` non compilava su main (match non esaustivo, F1-10 × F1-08).

## Verifiche
- `cargo check` verde dopo il fix (risorse vuote locali, ignorate da Git).
- Snippet checksum provato su bundle fittizio (`shasum -c` OK).
- YAML del workflow valido. `cargo test`: 37 passati.
- guidance-refresh/check: documentazione allineata.

## Prossimi passi
- Push, PR, controllo della CI `desktop-teacher` sui 4 runner.

## Blocchi e rischi
- DMG/NSIS/deb prodotti solo in CI: non provati in locale.
- Nessun deploy, sudo o segreto.
