# Versione e rilascio

Una sola versione per tutto il repository (piano `docs/architecture/desktop-apps-plan.md` §6.1, F1-01).

## Dove sta la versione

- **Fonte unica**: il file `VERSION` alla radice, formato `X.Y.Z` (SemVer; ammesso un suffisso
  di pre-release, es. `0.2.0-beta.1`, per il futuro canale beta).
- **Copie generate** da `scripts/sync-version.py`, da non modificare a mano:
  - `frontend/package.json` e `frontend/package-lock.json` (campo `version` e pacchetto radice);
  - `backend/version.py` (`__version__`), esposto da `GET /version` e nei metadati OpenAPI;
  - quando esisteranno: `desktop/*/package.json` e `desktop/*/src-tauri/tauri.conf.json`
    (lo script li trova da solo, senza modifiche).
- Tag e Release GitHub: `vX.Y.Z`, lo stesso formato di `.github/release-drafter.yml`.

## Comandi

| Comando | Effetto |
|---------|---------|
| `make version-check` (`python3 scripts/sync-version.py --check`) | Non scrive nulla; esce con 1 ed elenca i file disallineati |
| `make version-sync` (`python3 scripts/sync-version.py`) | Copia `VERSION` in tutti i file elencati sopra |

Nessuna dipendenza esterna: basta Python 3.

## Controllo in CI

Il workflow `.github/workflows/version.yml` gira sulle pull request che toccano `VERSION`, i file
generati o lo script (e a mano con *Run workflow*): esegue i test `scripts/tests/test_sync_version.py`
e `sync-version.py --check`. Una PR che cambia `VERSION` senza propagarla, o che modifica a mano
una copia, fallisce.

## Procedura di rilascio

La release si fa **su richiesta del proprietario**; il tag e la Release li crea il Timoniere.

1. Su un branch `chore/release-X.Y.Z` da `main` aggiornato: scrivere la nuova versione in `VERSION`,
   poi `make version-sync` e `make version-check`.
2. Commit `chore: release vX.Y.Z` (solo i file di versione), PR, merge con «Create a merge commit».
3. Dopo il merge, da `main` aggiornato: verificare `make version-check`, poi creare tag e Release
   dalla bozza di Release Drafter, controllando che il tag sia esattamente `v` + il contenuto di `VERSION`:

   ```bash
   git switch main && git pull --ff-only
   make version-check
   gh release edit vX.Y.Z --draft=false --tag vX.Y.Z --target main   # bozza esistente
   # oppure, senza bozza: gh release create vX.Y.Z --target main --generate-notes
   ```

4. Ogni Release produrrà anche le app desktop (workflow `desktop-release.yml`, F1-15, non ancora
   presente). Le app partono **non firmate** su macOS e Windows; la firma si attiverà solo se
   saranno presenti i relativi segreti.

## Note

- Il primo tag sarà `v0.1.0` (la versione già presente in `frontend/package.json`; oggi esiste solo
  la bozza `v0.1.0` di Release Drafter, nessun tag pubblicato).
- La versione dell'app è distinta dalla **versione di protocollo** della sincronizzazione
  docente/studente (piano §4.5), che avrà un proprio numero.
- Il deploy di produzione non dipende dalla versione: resta la procedura in `CONTEXT.md`.
