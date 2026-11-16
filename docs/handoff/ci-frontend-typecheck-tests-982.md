# Handoff ci/frontend-typecheck-tests-982
## Stato
PR pending: CI gets tsc + Node tests.
## Fatto
- Workflow: typegen+tsc, `npm run test:ci`; stale teacher-try-tools test rewritten.
## Verifiche
- tsc clean after typegen; test:ci 947/947 (Node 22).
## Prossimi passi
- PR, guidance-check.
## Blocchi e rischi
- Browser tests (94 files) need Chromium: not in CI.
