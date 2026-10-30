# Online transcription engines — 30 October 2026

Agent: `s23-stt-online-codex`; branch: `feature/online-transcription-engines`.
Issue: [#706](https://github.com/nugh75/counselorbot-sbs/issues/706), milestone **Voice and audio**.

- Continued the previous session's uncommitted work without running the journal bootstrap.
- Added backend-only OpenRouter JSON/base64 and direct Mistral multipart transcription.
  Both reuse `api_secrets.resolve_api_secret`, with no new secrets or dependencies.
  Explicit language wins; `auto` uses `fallback_language`, or omits the hint if both are `auto`.
  Connect timeout 10 seconds, other I/O 300 seconds; no redirects, environment proxies,
  automatic retries, local-service calls or provider fallback on the online path.
- Kept faster-whisper as the default and whisper.cpp available. Online engines require
  an explicit administrative selection/save and are disabled when the provider key is absent.
  The browser receives only key presence. Model IDs remain editable; initial IDs are
  `mistralai/voxtral-mini-transcribe` and `voxtral-mini-latest`.
- Added `transcription_engine` and `transcription_model` to the admin-only configuration
  keys: the general configuration endpoint also admits researchers, who must not change
  this global audio destination. HTTP tests require 403 before any database access.
- Verified OpenRouter IDs through its public transcription catalog and Mistral's upload/language
  contract in the official documentation; links are in `docs/operations/audio-input.md`.
- Restricted the privacy gateway exception to raw transcription audio at the two exact HTTPS
  endpoints, with no text, images or attached context. Existing purpose, authorization and audit
  behavior remains in force. Six-language warnings disclose external, unredacted audio for all
  users; tests use fictitious data. OpenRouter can forward beyond the EU.
- Updated six-language audio help, feature grounding and operational/privacy docs.
  Reviewed `/guide`: existing chat navigation and screenshots remain applicable; the changed
  controls are confined to the administration audio panel and its model input.
- Online upload size is checked by the backend. The three-minute limit is checked in the UI;
  only the local service decodes duration/content, while online acceptance depends on the provider.
  There is no real-provider transcription smoke test; HTTP requests and errors are simulated.
- No manual edits to `backend/ai_service.py`, `frontend/src/app/admin/page.tsx`, shared UI components
  or global CSS; upstream changes are preserved by merging `origin/main` (including #698, #699 and #708).
  The merge keeps the new **Voice and audio** admin group and the removal of the obsolete global
  guidance hash manifest. No Docker build, production restart, dev server or test database/container was
  started. No deploy or sudo step is required for this session.

Verification commands (run sequentially for test suites):

```bash
DATABASE_URL=postgresql://synthetic@127.0.0.1:18650/counselorbot_test TEST_DB=postgres \
  PYTHONDONTWRITEBYTECODE=1 ~/.pyenv/versions/3.11.9/bin/python -m pytest \
  backend/tests/test_audio_input.py backend/tests/test_ai_egress_guard.py \
  backend/tests/test_privacy_p6_gateway.py -q -p no:cacheprovider --disable-warnings
cd frontend
~/.nvm/versions/node/v22.23.3/bin/node --test --experimental-strip-types src/lib/transcription-models.test.ts
~/.nvm/versions/node/v22.23.3/bin/node node_modules/typescript/bin/tsc --noEmit --incremental false
~/.nvm/versions/node/v22.23.3/bin/node node_modules/eslint/bin/eslint.js \
  src/components/admin/AudioModelsPanel.tsx src/lib/transcription-models.ts \
  src/lib/transcription-models.test.ts src/lib/i18n-voice.ts
~/.nvm/versions/node/v22.23.3/bin/node scripts/check-i18n.mjs
cd ..
make guidance-check
```

The database URL selects the Postgres dialect only: these tests override sessions and
privacy policy/audit providers and never connect to a database. Frontend dependencies
are read from the existing checkout via an ignored `frontend/node_modules` symlink.
Standalone type checking uses an ignored `frontend/next-env.d.ts` containing the
standard `next` and `next/image-types/global` ambient references (normally generated
by Next); its initial absence produced PNG-module errors before these references
were created locally, without starting Next or changing tracked configuration.
Browser tests require a dev server and were not run under the owner's resource limit.

Results: 162 backend tests passed across the audio, gateway and egress-guard files;
after tightening the unknown-provider boundary and debug-log assertions and adding
the researcher settings boundary, all 69 audio tests passed. All four frontend unit tests passed. The general i18n checker
reports the same 12 existing hard-coded texts in `ClassSettingsPage.tsx` and
`ClassOverviewTab.tsx` already recorded in the previous handoff; those files are untouched.
Targeted ESLint has zero errors and one pre-existing internal-navigation warning in
`AudioModelsPanel.tsx`. TypeScript passes with the standard local Next ambient references.
Guidance passed before merging and passes with the updated diff-based upstream gate
(`--base origin/main`), which no longer uses a state manifest.
