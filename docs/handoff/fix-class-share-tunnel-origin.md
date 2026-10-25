# Handoff — fix-class-share-tunnel-origin (s18-desktop-share)

Task Diario `bef7d9ec`; bug `b9292408`; issue [#598](https://github.com/nugh75/counselorbot-sbs/issues/598); branch `fix/class-share-tunnel-origin` da `main` f7fdb03a.

## Stato
- Riallineamento utente: NESSUNA revisione cross-modello (decisione Diario 8b4de3e3); merge della PR resta all'utente.
- Release v0.1.1 già pubblicata (run 40217531497 su f7fdb03a): nessun tocco a tag/asset; v0.1.2 solo PRETA in questo branch (bump eseguito), pubblicazione dopo il merge.

## Fatto
- Guscio Tauri (`supervisor.rs`): `frontend_spec` riceve `COUNSELORBOT_PUBLIC_ORIGIN` quando `tunnel_url` è attivo (quick e nominativo), insieme a backend: i sidecar ripartono gia' a every cambio URL (read_tunnel_url/restart); test env esteso: origine presente, cambiata, e assente con tunnel spento.
- Frontend: `runtime-config` espone `publicOrigin` (env `COUNSELORBOT_PUBLIC_ORIGIN`) e helper `publicOrigin()` con fallback all'origine del browser fuera guscio (produzione/portable invariati); test Node/SSR aggiunti (tunnel, senza tunnel, server render).
- Viste di condivisione su `publicOrigin()`: `ClassOverviewTab` (link iscrizione classe), `ClassCouncilTab` (link consiglio), `ValidationExportPanel` (URL di raccolta). Non toccati i QR centralizzati `/avvio` (flussi ricerca ai4educ, decisione di scope documentata).
- Versione unica 0.1.2 propagata con lo script (12 file).
- Docs: `desktop-teacher-shell.md` (porzione origine pubblica al frontend), `funzionalita-counselorbot.md` (condivisione e limiti sessioni studenti anonime), guidance refresh/check verdi.
- Note release: `/tmp/counselorbot-release-012-notes.md` (limiti reali: abbinamento studenti senza UI, updater inattivo su prerelease, installer non firmati).

## Verifiche
- Node 22: runtime-config/auth-provider/auth-urls 13 pass; qr/credentials panel 10 pass.
- `tsc --noEmit`: pulito.
- ESLint locale: non esegue su questo volume esterno (npm/eslint si blocca >25 min, problema già riscontrato negli handoff; gli esterni verificano in CI dove previsto).
- `cargo check` verde; `cargo test --locked --release` in corso (compilazione release); re-run target della suite supervisor previsto per l'assert aggiunto "URL cambiato" (build incrementale).
- Guidance refresh/check: verdi (exit 0).

## Prossimi passi
- PR Conventional `fix(desktop): share student links on the tunnel public origin` (Closes #598) + Project CounselorBot + notify; CI desktop-teacher su PR; nessun merge autonomo.
- Dopo il merge: build dispatch su `main`, prerelease v0.1.2 con note di /tmp (runbook in `docs/operations/release.md`).
- Successivo (non in questo task): abbinamento studenti via tunnel (pagine `/unisciti` + dispositivi docente, ADR-0002 §4, F1-13) — issue dedicata.

## Blocchi e rischi
- ESLint bloccato su volume esterno: escludo l'evidenza locale, la CI non lintè questi file; rischi limitati perche' tsc e test Node passano.
- `.timoniere.json` e `docs/handoff/timoniere.md` sono di altri agenti: escluse dai commit.
