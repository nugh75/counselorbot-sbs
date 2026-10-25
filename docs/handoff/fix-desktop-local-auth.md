# Fix desktop login locale (task 9ef40e9a, ADR-0002 §3.3)

## Stato
Accesso locale completo per l'app desktop docente: con
`COUNSELORBOT_AUTH_PROVIDER=local` nessun passaggio da `auth.ai4educ.org`.
In produzione (ai4auth) il comportamento resta invariato.

## Fatto
- **Backend riusato**: `POST /internal/local-auth/teacher-link` (segreto shell,
  TTL 60 s, un solo uso) e `POST /local-auth/redeem` (origine locale firmata,
  cookie `cb_session` HttpOnly, sessione docente 30 giorni). Contratto invariato;
  i test esistenti coprono già redeem, monouso, scadenza, tunnel e revoca.
- **Guscio Tauri**: «Apri nel browser» chiede il token al backend locale con il
  segreto shell e apre `http://127.0.0.1:<frontend>/accesso-locale#t=<token>`
  (nuovo `Command::TeacherLink`; il segreto non lascia il processo).
- **Frontend**: `/accesso-locale` legge il token dal frammento, chiama
  `/api/local-auth/redeem` e ricarica su `/docente`; messaggi i18n per token
  assente, scaduto/usato ed errore in it/en/es/fr/de/sv. In locale `/login` usa
  la sessione; «Accedi», CTA home/assistente e questionario usano `loginHref()`;
  «Esci» passa da `/logout` (revoca locale).
- **Runtime config**: `COUNSELORBOT_AUTH_PROVIDER=local` passato al frontend dal
  supervisore e pubblicato in `/runtime-config.js`; assente/diverso => ai4auth.
- `/accesso-locale` e `/logout` esclusi dai cancelli setup/orientamento.

## Verifiche
- `TEST_DB=sqlite python -m pytest backend/tests/test_local_auth.py` -> 20 passed
  (senza `TEST_DB=sqlite` la suite cerca `DATABASE_URL` Postgres e non parte).
- `node --test --experimental-strip-types` su auth-provider, auth-urls,
  runtime-config, header-navigation, tool-catalog -> tutti verdi.
- `node frontend/scripts/check-i18n.mjs` -> 3 segnalazioni preesistenti e non
  collegate (`ClassCouncilView`, `ClassCouncilTab`), da ripulire a parte.
- `cargo check --manifest-path desktop/teacher/src-tauri/Cargo.toml` -> Finished,
  nessun errore (19m 24s, cache dipendenze Tauri).
- `tsc`/ESLint completi non eseguiti: `npm ci` si blocca su questo volume esterno.

## Prossimi passi
- Provare il giro completo su bundle desktop: token -> redeem -> `/docente`,
  poi scadenza (60 s) e secondo uso (401).
- Ripulire le 3 segnalazioni i18n e far tornare verde il check.
- Aggiungere un test Rust di `open_in_browser` con backend finto.

## Blocchi e rischi
- Token in memoria, 60 s: un riavvio del backend lo invalida (voluto, §4.3).
- La sessione docente vale solo con origine locale firmata: dal tunnel è anonima.
