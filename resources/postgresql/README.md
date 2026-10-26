# PostgreSQL incorporato

Il pin in `manifest.json` descrive PostgreSQL 15.12 (distribuzione theseus-rs
15.12.1). Gli hash SHA-256 sono versionati e verificati prima dell’estrazione.
macOS richiede almeno la versione 15. Linux viene compilato dai sorgenti su
Ubuntu 22.04, senza ICU/readline e con `patchelf` per il rpath relativo.

```sh
python3 scripts/download-postgres-binaries.py --target macos-arm64 --output desktop/teacher/src-tauri/postgresql
```

Target: `macos-arm64`, `macos-x64`, `windows-x64`, `linux-x64`. `--output` è
obbligatorio; `--build-from-source` è disponibile su Linux. Lo script conserva
binari, librerie, dati di PostgreSQL, licenze e notice, pota header/documenti e
librerie statiche, verifica la presenza dei binari richiesti e scrive il manifest
nel bundle. Non modifica il pin sorgente. La CI trasporta la cartella in tar per
conservare permessi e symlink, quindi prova initdb, autenticazione applicativa,
arresto e secondo avvio con il gestore Rust realmente usato dall’app.

Fonti: [release upstream](https://github.com/theseus-rs/postgresql-binaries/releases/tag/15.12.1),
[licenza PostgreSQL](https://www.postgresql.org/about/licence/).
Licenze e notice delle dipendenze sono conservate negli archivi macOS/Windows.
Procedura e limiti: [ripristino CI](../../docs/operations/desktop-ci-recovery.md).
