# TF4: In-app administration enters guided chat with provenance (#151)

## Implemented contract

Class administrations outside Italian use `delivery_mode=in_app`. The shared
`administration_target` in `backend/path_step_types.py` accepts them only when the
exact instrument locale is served (`scoring_service.locale_available`: pilot or
validated). Class creation and class edits refuse other locales with 422
`administration_locale_unavailable`; a locale withdrawn after publication makes the
step unavailable with the same reason. There is no fallback to another locale.
Italian plans keep the TF3 external flow unchanged.

`POST /user/paths/{path}/steps/{step}/launch` returns `delivery_mode`, the plan
locale and `external_href=null` for in-app plans. `POST
/user/paths/{path}/steps/{step}/score` (`AdministrationRunnerInput`: session ID,
item answers, institute grant; extra fields forbidden) shares the TF3 seams:
current membership, strict order, path and administration row locks, class
settings and the #149 institute grant. It scores the plan locale on the server and
saves one `QuestionnaireResult` with `source=in-app`, `capture_method=item_runner`,
`source_system=counselorbot`, plan ID and locale. It creates no guided entry and no
step evidence. The session ID is the scoped retry key: an identical retry returns
the saved row, different scores or another owner on that session are a 409.

Guided entry for an in-app plan requires `result_id` (422
`administration_result_required` for retyped scores) and an `item_runner` result
of the same student, plan, instrument and locale. The entry may reuse that result's
own session while no chat log exists, so chat and result stay together; any other
existing result or log on the session is a 409. The atomic result/entry/evidence
acknowledgement and the confirmed-import completion contract are reused from TF3.

Standalone writers now record provenance: `/instruments/{code}/score` saves
`item_runner`/`counselorbot` with the request locale; `/questionnaire-result`
saves `manual_scores` (or `no_scores` for an empty agent-only start) without
claiming an external source system; Telegram saves `telegram_scores`. Both request
schemas reject client `source`, `capture_method`, `source_system` and
`source_record_id` with 422. Historical rows keep `legacy_unknown`.

The student flow (`AdministrationStepFlow` + `InAppAdministrationRunner`) verifies
the institute credentials, loads rules for the plan locale only, keeps answers,
runner session and saved result in the account/path/step session draft, and opens
guided chat only on a committed acknowledgement. The teacher editor offers Italian
plus the instrument's served locales and lists only offered administrations. The
results history shows localized provenance; unknown capture methods read "capture
method not recorded". No migration is needed: TF3 already added the columns.

## Lean validation

Synthetic PostgreSQL only, in disposable containers: `c6-inapp-administration-151-postgres`
(loopback 18650, user `c5_test`, required by the TF3 fixtures) and
`c6-inapp-administration-151-credentials-postgres` (loopback 18649, user `c4_test`,
required by the #149 fixtures). No app dev server, browser journey, screenshot,
Docker image build or deployment.

```sh
DATABASE_URL=postgresql://c5_test@127.0.0.1:18650/counselorbot_test PYTHON_DOTENV_DISABLED=1 \
  backend/.venv/bin/python -m pytest -q --disable-warnings \
  backend/tests/test_inapp_administration.py backend/tests/test_inapp_runner_concurrency.py \
  backend/tests/test_it_administration.py backend/tests/test_it_entry_concurrency.py \
  backend/tests/test_typed_steps_migration.py backend/tests/test_class_paths.py
DATABASE_URL=postgresql://c4_test@127.0.0.1:18649/counselorbot_test PYTHON_DOTENV_DISABLED=1 \
  backend/.venv/bin/python -m pytest -q --disable-warnings backend/tests/test_institute_credentials*.py
npm test --prefix frontend
npm run i18n:check --prefix frontend
npm run build --prefix frontend
make guidance-check
```

Backend cases: available/unavailable locale creation, in-app launch without an
external link, runner result alone undone, identical retry and changed-retry
conflict, guided entry by result without duplicates, provenance in history,
research count of one, retyped scores refused, borrowed session refused,
missing/forged grant, non-member, foreign session, missing answer, withdrawn
locale, forged origin (all without writes), strict order, confirmed import for an
in-app plan without chat versus source label alone, standalone runner provenance
without step evidence, forged origin on both standalone writers, legacy unknown
capture method. The concurrency test runs two independent transactions for the
runner and for guided entry; with the path/administration locks removed it fails
with two results, so the delay-injected race is real.

Frontend units: in-app launch parsing (locale, no external link, forged
combinations rejected), runner acknowledgement validation and failure retention,
entry by result ID, provenance labels and six-language completeness.
