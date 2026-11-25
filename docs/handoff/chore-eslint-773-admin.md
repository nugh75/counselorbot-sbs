# Handoff: chore/eslint-773-admin

## Stato
Completato — tutte le verifiche verdi (ESLint 0 errori <= 0, i18n, next typegen, tsc, test CI, guidance-check).

## Fatto
- Rifattorizzati i 39 errori `react-hooks/set-state-in-effect` nei 34 file di `frontend/src/components/admin/` (`AdministrationPlansPanel`, `ApprovedStrategiesPanel`, `AssistantAdminPanel`, `AssistantQuestionsPanel`, `AudioModelsPanel`, `BenchmarkPanel`, `CertifiedReadingsPanel`, `CertifiedStrategiesPanel`, `ChatGPTSettingsPanel`, `ConfigForm`, `CostStats`, `CounselorsPanel`, `DocumentRetrievalSettings`, `ExternalPrivacySettings`, `GuidedStepQuestionsPanel`, `LogViewer`, `ModelContextSettings`, `PersonalAPIPolicy`, `PlanStudentsPanel`, `PresetsPanel`, `PromptExperimentsPanel`, `PromptHealthPanel`, `PromptMap`, `QuestionnaireEditor`, `QuestionnaireResultsViewer`, `RagDocsPanel`, `ResearchContactsPanel`, `SurveyViewer`, `TavoloImagesPanel`, `ThreadGuardPanel`, `ToolBriefsPanel`, `TrainingDatasetPanel`, `UsersSummaryPanel`, `ValidationExportPanel`) usando `useClientValue`, reset durante il render e `.then()` con guardia `active` / `AbortController`.
- Abbassato `ESLINT_MAX_ERRORS` da `'39'` a `'0'` in `.github/workflows/frontend-lint.yml`.
- Aggiornati `docs-counselorbot/funzionalita-counselorbot.md` (per `make guidance-check`) e `docs/progetto/piano-interventi.md` (`#773`).

## Verifiche
- `npx eslint -f json`: 0 errori totali (soglia CI `0`).
- `npm run i18n:check`: chiavi allineate su 6 lingue OK.
- `npx next typegen && npx tsc --noEmit -p .`: 0 errori.
- `npm run test:ci`: tutti passati.
- `make guidance-check`: OK.

## Prossimi passi
- Proseguire la Wave 1 su `#911` / `#83` (test browser Playwright e chiusura Navbar) o `#776` (proposte prompt di fabbrica in «Salute dei prompt»).

## Blocchi e rischi
Nessuno.
