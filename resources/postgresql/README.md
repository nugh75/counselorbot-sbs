# PostgreSQL incorporato (ADR-0004 §2)

Questa cartella contiene il **pin** dei binari PostgreSQL 15.19 inclusi nei
bundle desktop: `manifest.json` è l'unica fonte di verità per versioni, URL,
SHA-256 degli archivi sorgenti e regole di potatura. I binari non sono
committati: la CI (e lo sviluppatore, con lo script sotto) li scarica, li
verifica e li mette in scena dentro `desktop/teacher/src-tauri/postgresql/`
(risorsa Tauri mappata come `postgresql/` nel bundle), quello che il guscio
legge a runtime come `<resources>/postgresql/`.

## Uso

```sh
# Rileva il target dalla macchina corrente e mette in scena i binari:
python3 scripts/download-postgres-binaries.py

# Target esplicito (come nella CI a 4 runner):
python3 scripts/download-postgres-binaries.py --target macos-arm64
python3 scripts/download-postgres-binaries.py --target macos-x64
python3 scripts/download-postgres-binaries.py --target windows-x64
python3 scripts/download-postgres-binaries.py --target linux-x64   # build dai sorgenti su ubuntu-22.04
```

Lo script:

1. legge il pin da `resources/postgresql/manifest.json`;
2. scarica l'archivio del target (theseus-rs/postgresql-binaries 15.19.1 per
   macOS/Windows, sorgenti PostgreSQL 15.19 per Linux) e verifica lo SHA-256
   **prima** dell'estrazione;
3. pota i file non necessari a runtime (`include/`, `symbols/`, `.a`, PGXS,
   PL/Python, documentazione) e conserva licenze e notice;
4. calcola lo SHA-256 dell'albero potato e scrive il manifest di build in
   `desktop/teacher/src-tauri/postgresql/manifest.json` (con `target`,
   `tree_sha256`, `installed_bytes` e `staged_utc` aggiunti al pin);
5. verifica laовая coerenza della risorsa messa in scena (binari presenti e
   eseguibili, `lib/` e `share/` presenti).

## Contratto a runtime

All'avvio il guscio (`postgres_cluster.rs`) verifica la risorsa in
`<resources>/postgresql/`: manifest integro, `major`/`minor` attesi, `target`
della piattaforma corrente, `tree_sha256` presente e ogni binario dell'elenco
presente e eseguibile. Una risorsa assente o non coerente è un errore bloccante
(ADR-0004 §2.2): il guscio non avvia nulla e non crea mai un cluster vuoto per
mascherare il problema.

## Licenze

- PostgreSQL: [PostgreSQL License](https://www.postgresql.org/about/licence/)
  (permissiva, stile BSD/MIT).
- theseus-rs/postgresql-binaries: licenza dello stesso tipo; le librerie
  incluse (ICU, OpenSSL 3, libxml2, zlib, lz4, zstd) hanno gli avvisi in
  `dependency-notices/`, che lo script conserva nel bundle.
- Build Linux dai sorgenti: PostgreSQL License + zlib di sistema.

Nessuna licenza copyleft forte: la ridistribuzione nei bundle è compatibile.
