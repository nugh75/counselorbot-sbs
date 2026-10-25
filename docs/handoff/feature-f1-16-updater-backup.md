# Handoff — F1-16 Updater e backup pre-aggiornamento
Agente: s70-f1-16-updater (subagente per Timoniere)
Branch: feature/f1-16-updater-backup · Issue: #580
Task diario: 168a1a90-9467-4cfd-9020-2933889107c5 · Aggiornato: 2026-10-25

## Stato
Pronto per la revisione e merge — test locali passati, PR aperta.

## Fatto
- Guscio Tauri: integrato `tauri-plugin-updater` v2 con canali `stable` e `beta` (endpoint configurabili da env/GUI).
- Backup pre-aggiornamento: esteso `backend/sqlite_backup.py` (`COUNSELORBOT_BACKUP_DIR`), aggiunta rotta interna `POST /internal/backup` protetta da shell secret, flag `--backup` nel sidecar.
- Supervisor & Updater (`desktop/teacher/src-tauri`): comando `backup_db` su `supervisor::Handle` (online o offline) invocato tassativamente prima di `apply_update`. Se il backup fallisce, l'aggiornamento viene abortito.
- GUI: card "Aggiornamenti software" nel pannello di controllo con selettore canale, verifica e applicazione con feedback backup.
- CI: script `desktop/teacher/scripts/generate-update-manifest.py` per assemblare `latest.json` e `latest-beta.json`.
- CI workflow `desktop-teacher.yml`: firma Minisign condizionale con warning su segreto mancante e job `manifest` di pubblicazione manifest.
- Fix CI Windows: reso il controllo del percorso di backup in `test_server.py` indipendente dal separatore di path.
- Fix CI macOS: eliminata race condition TOCTOU in `check-lifecycle.sh` con verifica atomica dello snapshot JSON.
- Fix CI manifest: aggiunto `pip install pytest` nel job `manifest` di `desktop-teacher.yml` e `from __future__ import annotations` in `generate-update-manifest.py`.
- Merge con `origin/main` (#579 P7): handoff e stato guidance integrati senza conflitti.
- Documentazione: aggiornata `docs/operations/desktop-teacher-shell.md` con canali, chiavi Minisign e procedura dettagliata di rollback e ripristino; aggiornato piano F1-16 ✅.

## Verifiche
- `pytest`: 68 test passati (`test_sqlite_backup.py`, `test_shell_contract.py`, `sidecar/test_server.py`).
- `pytest`: 3 test passati (`test_generate_update_manifest.py`).
- `node --test desktop/teacher/sidecar/server-wrapper.test.js`: 4 test passati.
- `cargo check --manifest-path desktop/teacher/src-tauri/Cargo.toml`: pulito (exit 0).
- `cargo test --manifest-path desktop/teacher/src-tauri/Cargo.toml`: 41 test passati, 0 falliti.
- `make guidance-refresh` e `make guidance-check`: eseguiti.

## Prossimi passi
- Merge della PR da GitHub Mobile App.
- Configurare il secret GitHub Actions `TAURI_SIGNING_PRIVATE_KEY` per abilitare la firma automatica degli artefatti updater.

## Blocchi e rischi
- Nessun blocco. In assenza di secret di firma Minisign, la CI genera un warning ed esclude gli artefatti updater senza fallire la build degli installer DMG/NSIS/deb.
