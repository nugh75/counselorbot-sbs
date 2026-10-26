# Handoff — fix-class-share-tunnel-origin (s18-desktop-share)

Task Diario `bef7d9ec`; bug `b9292408`; issue [#598](https://github.com/nugh75/counselorbot-sbs/issues/598); branch `fix/class-share-tunnel-origin` da `main` f7fdb03a.

## Stato
- Riallineamento utente: NESSUNA revisione cross-modello (decisione Diario 8b4de3e3); merge della PR resta all'utente.
- **PR [#600](https://github.com/nugh75/counselorbot-sbs/pull/600) aperta; PR #601 MERGED (39d72182)**: integrata nel branch con merge ce97449d senza conflitti; versione 0.1.2 conservata, fix link/QR intatti; `version-check` e `guidance-check` verdi dopo il merge. In attesa della CI sul nuovo SHA per tutti i gate (vedi Verifiche).
- **Release v0.1.1 (Desktop Beta) pubblicata e intatta** (tag e asset, run 40217531497 su f7fdb03a): nessun tocco.
- **Riallineamento finale (26/10)**: integrato `origin/main` con P10 (1b5270d5), piano builder (147bb356) e SSE (39d72182): merge `eda245ec` (dopo amend del messaggio), nessun conflitto di contenuti — solo il manifest generato, rigenerato dall'albero combinato (`guidance-check` exit 0). P10/builder/fix-link-QR convivono; versione rimasta 0.1.2.
- **Pubblicazione SQLite 0.1.2 SOSPESA** (decisione utente 26/10: PostgreSQL unico DB, anche desktop — nuovi incarichi dedicati): niente prerelease anche con #600 verde; note/asset della v0.1.1 preservati. Nessuna migrazione PostgreSQL inclusa nel branch.

## Fatto
- Guscio Tauri (`supervisor.rs`): `frontend_spec` riceve `COUNSELORBOT_PUBLIC_ORIGIN` quando `tunnel_url` è attivo (quick e nominativo), insieme a backend: i sidecar ripartono a ogni cambio URL (read_tunnel_url/restart); test env esteso: origine presente, cambiata, e assente con tunnel spento.
- Frontend: `runtime-config` espone `publicOrigin` (env `COUNSELORBOT_PUBLIC_ORIGIN`) e helper `publicOrigin()` con fallback all'origine del browser fuori dal guscio (produzione/portable invariati); test Node/SSR aggiunti (tunnel, senza tunnel, server render).
- Viste di condivisione su `publicOrigin()`: `ClassOverviewTab` (link iscrizione classe), `ClassCouncilTab` (link consiglio), `ValidationExportPanel` (URL di raccolta). Non toccati i QR centralizzati `/avvio` (flussi ricerca ai4educ, decisione di scope documentata).
- Versione unica 0.1.2 propagata con lo script (12 file).
- Docs: `desktop-teacher-shell.md` (porzione origine pubblica al frontend), `funzionalita-counselorbot.md` (condivisione e limiti sessioni studenti anonime), guidance refresh/check verdi.
- Note release: `/tmp/counselorbot-release-012-notes.md` (limiti reali: abbinamento studenti senza UI, updater inattivo su prerelease, installer non firmati).

## Verifiche
- Node 22: runtime-config/auth-provider/auth-urls 13 pass; qr/credentials panel 10 pass.
- `tsc --noEmit`: pulito. ESLint: `ESLINT_EXIT=0` (0 errori; 1 warning preesistente a HEAD).
- `cargo test --profile dev supervisor::`: 15 pass con exit reale `CARGO_SUPERVISOR_EXIT=0` (env con tunnel attivo/cambiato/spento, lifecycle quick/nominativo). `cargo test --locked --release` intero non eseguito su questo volume esterno: coperto dalla CI.
- **CI sul nuovo SHA `6f251b77` TUTTA VERDE**: `desktop-teacher` **40279959571** success (4/4 build + `Generate update manifests`, artifact 0.1.2); `backend-db` **40279959469** success — ratchet sqlite: `unexpected failures: 0`; ratchet postgres: **`known failures still failing: 53` + `unexpected failures: 0` + `listed but no longer failing: 0`** (distinzione esplicita, nessuna conclusione verde per baseline legacy: i 53 sono dichiarati, l'inatteso SSE è risolto da #601).
- Pre-integrazione (storico): desktop-teacher ✅ 40234368971 su 43d03aaf; Version 40234368927 ✅; guidance 40234368941 ✅.

## Prossimi passi
- **Push unico del riallineamento** e verifica `MERGEABLE` + CI sull'SHA esatto fino al verde (4 build desktop + manifest, PG/SQLite con distinzione 53 known / 0 unexpected). Niente commit aggiuntivi solo per registrare esiti CI: prove nel Diario/notify.
- Merge della PR #600 all'utente. **Pubblicazione sospesa**: la v0.1.2 SQLite non esce; segue il nuovo piano PostgreSQL unico (contratti, runtime incorporato, upgrade dati, CI unificata) con incarichi dedicati su worktree propri.
- Successivo (non in questo task): abbinamento studenti via tunnel (pagine `/unisciti` + dispositivi docente, ADR-0002 §4, F1-13) — issue dedicata da coordinare col piano PG.

## Blocchi e rischi
- ESLint bloccato su volume esterno: escludo l'evidenza locale, la CI non lintè questi file; rischi limitati perche' tsc e test Node passano.
- `.timoniere.json` e `docs/handoff/timoniere.md` sono di altri agenti: escluse dai commit.
