# Handoff — #911 Lotto 1: sweep browser tests personal-area + navbar/legacy

## Stato
Completo. Branch `fix/911-browser-tests-lotto1` da `origin/main` 8f75b1c6.
Scope solo `frontend/tests/` + questo handoff. Nessun sudo, segreto o produzione.

## Ambiente dev lasciato ATTIVO (per Lotto 2)
- Dev server Next (webpack) `--hostname 127.0.0.1 --port 3191`,
  `BACKEND_ORIGIN=http://127.0.0.1:9`, `NEXT_TELEMETRY_DISABLED=1`.
  PID npm 383014 / node 383028. Log `/tmp/s1-911/devserver-final.log`.
  Stop: `pkill -f "next dev.*3191"`.
- Test backend che richiedono API reali (obiettivi) usano fixture effimere,
  gia' fermate: container Postgres `s1-911-goals-pg` (rimosso) e
  `python3 -m backend.tests.goals_browser_server` su :18096 (fermato).
- Env per file: puntare la `*_BASE_URL` a `http://127.0.0.1:3191`
  (PERSONAL_HEADER/5A/PERSONAL_API/PERSONAL_AREA/PERSONAL_1B/GOALS/
  ACCOUNT/PERSONAL_TOOLS/NAVBAR/LEGACY_ROUTES).

## Fatto (test riscritti/riallineati)
- `personal-area-header`: locator `<img>` -> SVG inline; API sintetiche via
  `page.route` (identita' studente, GET-only); "public demo" avvia il proxy
  read-only esistente `scripts/personal-area-preview.mjs` su porta libera.
- `personal-api`: rimosso `/usr/bin/chromium` hardcoded (allineato #1038);
  filtro dev Next 16 `negative time stamp` sul redirect ChatGPT.
- `personal-goals`: locator `⧉ anche sotto:` -> `anche sotto:` (ora icona
  lucide, commit 206f5333). Test keyboard focus resta skippato: bug reale
  preesistente registrato (vedi sotto), non introdotto qui.
- `personal-pqbl`: warm-up in `before` per il redirect cold `/pqbl` ->
  `/profilo/pqbl` (evita ERR_ABORTED al primo hit del dev server).
- `navbar-visibility`: `zoom 200%` attende il trigger mobile sotto 1024px
  invece di `.or().first()` che selezionava lo span nascosto.

## Verifiche (file -> esito)
- personal-area-header 7/7; personal-5a 4/4; personal-ai-visibility 23/23;
  personal-api 42/42; personal-area-home 10/10; personal-error-states 7/7;
  personal-goals 21 pass + 1 skip preesistente (0 fail, DB fixture pulito);
  personal-pqbl 8/8; personal-tools-navigation 3/3; navbar-visibility 122/122;
  legacy-routes 11/11.
- `npx eslint` sui 5 file toccati: 0 errori (1 warning preesistente `D` in
  personal-goals). `npx tsc --noEmit`: 0 errori.

## Bug registrati (journal-cli, triage confermato)
- 3c350384: proxy anteprima personal-area obsoleto (`/runtime-config.js` e
  fixture `/api/user/access`), la preview documentata non rende.
- 1d436d10: obiettivi, Escape dal dialog non riporta il focus alla riga
  opener (preesistente, gia' skippato nel test).

## Prossimi passi / rischi
- Lotto 2/3 restano al Timoniere; nessun compito sbloccato avviato.
- `opencode.json` modificato localmente: MAI committato (escluso dal commit).
