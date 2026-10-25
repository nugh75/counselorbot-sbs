# Handoff — fix-class-share-tunnel-origin (s18-desktop-share)

Task Diario `bef7d9ec`; bug `b9292408`; issue [#598](https://github.com/nugh75/counselorbot-sbs/issues/598); branch `fix/class-share-tunnel-origin` da `main` f7fdb03a.

## Stato
- Riallineamento utente: NESSUNA revisione cross-modello (decisione Diario 8b4de3e3); merge della PR resta all'utente.
- **PR [#600](https://github.com/nugh75/counselorbot-sbs/pull/600) aperta e CI completa**: desktop-teacher ✅ su 4 runner (run 40234368971 su 43d03aaf), Version ✅, guidance ✅, backend-db sqlite ✅ + postgres rosso SOLO baseline 54 identica (niente regressioni). Pronta per il merge dell'utente.
- Release v0.1.1 già pubblicata (run 40217531497 su f7fdb03a): nessun tocco a tag/asset; v0.1.2 soltanto PREPARATA in questo branch (bump eseguito), pubblicazione dopo il merge.

## Fatto
- Guscio Tauri (`supervisor.rs`): `frontend_spec` riceve `COUNSELORBOT_PUBLIC_ORIGIN` quando `tunnel_url` è attivo (quick e nominativo), insieme a backend: i sidecar ripartono gia' a every cambio URL (read_tunnel_url/restart); test env esteso: origine presente, cambiata, e assente con tunnel spento.
- Frontend: `runtime-config` espone `publicOrigin` (env `COUNSELORBOT_PUBLIC_ORIGIN`) e helper `publicOrigin()` con fallback all'origine del browser fuera guscio (produzione/portable invariati); test Node/SSR aggiunti (tunnel, senza tunnel, server render).
- Viste di condivisione su `publicOrigin()`: `ClassOverviewTab` (link iscrizione classe), `ClassCouncilTab` (link consiglio), `ValidationExportPanel` (URL di raccolta). Non toccati i QR centralizzati `/avvio` (flussi ricerca ai4educ, decisione di scope documentata).
- Versione unica 0.1.2 propagata con lo script (12 file).
- Docs: `desktop-teacher-shell.md` (porzione origine pubblica al frontend), `funzionalita-counselorbot.md` (condivisione e limiti sessioni studenti anonime), guidance refresh/check verdi.
- Note release: `/tmp/counselorbot-release-012-notes.md` (limiti reali: abbinamento studenti senza UI, updater inattivo su prerelease, installer non firmati).

## Verifiche
- Node 22: runtime-config/auth-provider/auth-urls 13 pass; qr/credentials panel 10 pass.
- `tsc --noEmit`: pulito. ESLint: `ESLINT_EXIT=0` (0 errori; 1 warning preesistente a HEAD).
- `cargo test --profile dev supervisor::`: 15 pass con exit reale `CARGO_SUPERVISOR_EXIT=0` (env con tunnel attivo/cambiato/spento, lifecycle quick/nominativo). `cargo test --locked --release` intero non completabile qui (compilazione release >1h su volume esterno): gira in CI.
- **CI PR #600**: `Version` ✅ 40234368927; `Platform guidance` ✅ 40234368941; `desktop-teacher` ✅ **40234368971** su 43d03aaf (4/4 build + `update-manifests`, artifact 0.1.2); `backend-db` 40234368931: sqlite/startup/portability ✅, postgres rosso con set di 54 fallimenti **identico alla baseline accettata** (niente regressioni).
- Guidance refresh/check: verdi (exit 0).

## Prossimi passi
- PR #600 PRONTA per il merge dell'utente (rilascio cross-modello escluso per decisione utente 8b4de3e3). Dopo il merge: runbook `docs/operations/release.md` — build `workflow_dispatch` su `main`, prerelease **v0.1.2 (Desktop Beta)** con note in `/tmp/counselorbot-release-012-notes.md`, tag v0.1.1 e asset NON toccati.
- Successivo (non in questo task): abbinamento studenti via tunnel (pagine `/unisciti` + dispositivi docente, ADR-0002 §4, F1-13) — issue dedicata.

## Blocchi e rischi
- ESLint bloccato su volume esterno: escludo l'evidenza locale, la CI non lintè questi file; rischi limitati perche' tsc e test Node passano.
- `.timoniere.json` e `docs/handoff/timoniere.md` sono di altri agenti: escluse dai commit.
