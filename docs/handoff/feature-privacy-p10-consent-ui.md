# P10 — s3-privacy-p10-fin (UI consensi studente e docente)

- Task: e9d44ca2-e19b-419b-b925-09744e9add34 — branch `feature/privacy-p10-consent-ui`, base `origin/main` 63afde17.
- Stato: P10 completa — informative, finalità, consensi/rifiuti/revoche, condivisione taccuino, cronologia e i18n; commit e PR aperti, nessun merge.
- PR: https://github.com/nugh75/counselorbot-sbs/pull/589

## Fatto
- Pagina `/privacy` (`frontend/src/app/privacy/`): documenti versionati con hash, data e badge `[DA VALIDARE]` in dialog accessibile; finalità con interruttori separati che partono spenti; consenso, rifiuto e revoca; condivisione del taccuino per classe e docente; cronologia personale.
- Componenti (`frontend/src/components/privacy/`): `DocumentViewer`, `ConsentToggles`, `SharingRevocation`, `ChoiceHistory`.
- Logica pura (`frontend/src/lib/privacy.ts`): tipi API, mapping dei codici d'errore verso chiavi i18n, parsing del target pseudonimo `share:{group}:{pid}`, soli link relativi o http(s), etichette di finalità/documenti/basi giuridiche.
- Backend: `GET /privacy/choices` restituisce `teacher_username` e `group_id` solo nelle scelte del soggetto (ricavati dai grant P7) per permettere la revoca self-service; il target dell'audit resta pseudonimo.
- Accessi: voce «Privacy e consensi» nel menu account (`HeaderAccount`, anche ospiti) e nell'header delle aree personali (`PersonalAreaHeader`).
- i18n: `frontend/src/lib/i18n-privacy.ts` in 6 lingue, `PRIVACY_DICTS` fusi in `i18n.ts`; `check-i18n.mjs` carica il nuovo modulo e risolve i container con proprietà abbreviate (`{ it, en, … }`).
- `check-i18n.mjs`: i codici camelCase passati a `setError`/`setMessage` (consiglio di classe) non sono più scambiati per testo visibile.

## Verifiche
- `node frontend/scripts/check-i18n.mjs` → passed, 3626 chiavi in 6 lingue.
- `node --test --experimental-strip-types src/lib/*.test.ts` → 701 pass (11 nuovi in `privacy.test.ts`).
- `TEST_DB=sqlite pytest backend/tests/test_privacy_p9_consent.py` → 26 pass, incluso il nuovo test sull'esposizione del docente per la revoca.
- `tsc --noEmit`: nessun errore nel codice P10; restano i soli moduli `.png` non risolti perché `next-env.d.ts` non è generato nel worktree.
- `eslint` sui file toccati: 0 errori.
- Suite browser `navbar-visibility` e `personal-area-header` (contract aggiornati) **non eseguite**: `next dev` 16.3.8 non arriva a «Ready» in questo ambiente (nessun output, main thread idle) → riprovare con `scripts/dev-navbar-tests.sh` e `personal-area-preview.mjs`.

### Allineamento della Guida (2026-10-25, s9-fix-p10)

- `make guidance-refresh` falliva con «Il prodotto è cambiato ma il Markdown no»:
  il codice P10 era nella PR ma `docs-counselorbot/funzionalita-counselorbot.md`
  diceva ancora «La UI privacy P10 resta da realizzare».
- Aggiunta la descrizione della pagina `/privacy` e dei suoi controlli (documenti
  versionati con badge `[DA VALIDARE]`, finalità separate partite spente, revoca
  self-service della condivisione, cronologia senza testo libero, i18n a sei
  lingue, link solo relativi o http(s)).
- `make guidance-refresh` → «Funzionalità CounselorBot: documentazione allineata»;
  `python3 scripts/check-platform-guidance.py --check` → allineata;
  `python3 -m unittest discover -s scripts/tests -p 'test_platform_guidance_check.py'`
  → 3 test OK.

### CI della PR #589: diagnosi dei test backend (2026-10-25, s9-fix-p10)

- Run [40193357452](https://github.com/nugh75/counselorbot-sbs/actions/runs/40193357452),
  head `45091d7e`, base `63afde17` (l'attuale `origin/main`):
  - `tests (postgres)`: 54 failed, 5851 passed, 15 skipped; ratchet: 45 known
    still failing, **9 unexpected failures**, 0 listed-but-passing.
  - `tests (sqlite)`: 217 failed, 4986 passed, 20 skipped, 227 errors; ratchet:
    440 known still failing, **4 unexpected failures**, 2 listed-but-passing.
- Failures / NEW FAILURE: `test_practice_notebooks.py::test_practice_turns_are_logged_with_the_resolved_notebook`,
  `test_privacy_p6ac_egress.py::test_default_engine_prefers_available_local_piper[True-piper|False-edge]`,
  `test_sqlite_load_concurrency.py::test_routes_commit_and_release_before_provider_and_never_reopen_request_db[...]`,
  `test_sse_heartbeat.py::test_sync_disconnect_returns_promptly_and_closes_after_the_pending_next`;
  su SQLite anche i 2 «NOW PASSING» (`test_guided_explorations`, `test_server_side_step_closure`)
  che rendono il ratchet non stretto.
- **Nessuna di queste prove tocca i file P10** (`backend/routes/privacy.py` nella
  sola funzione `_sharing_revoke_fields`, `frontend/src/app/privacy/`,
  `frontend/src/components/privacy/`) e `backend/tests/test_privacy_p9_consent.py`
  (26 test, compreso quello nuovo P10) passa in entrambi i job.
- Baseline riprodotta su un worktree separato a `63afde17` (Python 3.12,
  `TEST_DB=sqlite`, venv dedicata):
  - `test_forum.py` + `test_forum_privacy.py::test_forum_metadata_reader_…` +
    `test_practice_notebooks.py::test_practice_notebook_enters_…`: **main 38
    failed / 11 passed**, **branch 38 failed / 11 passed** (stessi identici ID).
  - `test_class_orientation.py`, `test_diagram_generation.py`,
    `test_privacy_p6ac_egress.py`: **main 14 failed / 83 passed** (idem sul branch).
  - I 4 NEW FAILURE riproducibili (notebook log, Piper x2, SSE heartbeat)
    falliscono anche su `63afde17`; `test_sqlite_load_concurrency.py` passa in
    locale su entrambi i rami (dipendente dall'ambiente/ordine nel job CI).
- Cause tipiche, tutte preesistenti: `TypeError: 'Mock' object is not subscriptable`
  (class_orientation), `AttributeError: 'NoneType' object has no attribute 'info'`
  (diagram_generation), `'SimpleNamespace' object has no attribute 'commit'`
  (privacy_p6ac_egress), migrazioni SQLite (`no such function:
  statement_timestamp`, `error in index ix_counselors_owner_username after drop
  column`), drift dei testi dei prompt (`test_smoke`, `test_practice_notebooks`).
- Re-run dopo il commit `43c80a48` (run [40199013418](https://github.com/nugh75/counselorbot-sbs/actions/runs/40199013418)):
  i due check `documentation` sono **verdi**; `tests (postgres)` e `tests (sqlite)`
  riportano **esattamente gli stessi numeri e la stessa lista di NEW FAILURE**
  del run precedente (54/217 failed, 9/4 unexpected, 45/440 known still failing),
  quindi nessuna regressione P10 introdotta dagli ultimi commit.
- **Non corretto fuori scope**: il ratchet va riallineato in un task dedicato
  (baseline `63afde17` e nuove prove), non dentro la PR P10. Finché non si
  aggiornano `backend/tests/postgres_known_failures.txt` e
  `backend/tests/sqlite_known_failures.txt`, i due check `tests` restano rossi
  per cause non imputabili a questa PR.

## Prossimi passi
- Rilanciare le due suite browser e riverificare i breakpoint 320/390/844/1440 con la voce privacy.
- P16/P11: testi legali definitivi e pubblicazione dei documenti da parte del titolare; sostituire l'username digitato con la scelta del docente della classe.
- Valutare l'inserimento di `/privacy` in `HEADER_LINKS` (oggi solo menu account e header aree personali).

## Blocchi e rischi
- Contenuti e basi giuridiche restano `[DA VALIDARE]`: la UI non dichiara conformità e nessun documento viene pubblicato automaticamente.
- La revoca della condivisione dipende da `teacher_username` restituito dall'API: se il grant nasce altrove il campo è nullo, il bottone resta disabilitato con messaggio «docente sconosciuto».
- La suite P9 richiede `DATABASE_URL` oppure `TEST_DB=sqlite`: senza env si interrompe in apertura con `KeyError: 'DATABASE_URL'`.
- `opencode.json` resta untracked (configurazione locale, non committata).
