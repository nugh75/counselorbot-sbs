# Student orientation: selective integration

Reviewed `feature/student-orientation` against current main on 2026-09-08.

- `eceef6f`: removal of decorative card borders is already present and covered by the frontend orientation tests.
- `713b3da`: recovered explicit hold/replace/clear recommendation transitions, adapted to the current single model call. Ordinary turns retain cumulative merging. Invalid actions, invalid replacements and destructive actions without a reply preserve the current cards.
- The old two-call pipeline, generated opening and notebook draft writer are superseded. Current student context, editable tool briefs, canonical questionnaire information, welcome and offline fallback are preserved. Bussola does not write personal annotations.
- The model now receives header facts on every turn, including the Guide at `/guide`, after a runtime probe exposed an incorrect answer about its availability.

Validation: 28 backend orientation tests and 15 frontend orientation tests passed. Three synthetic turns through the configured runtime model correctly held, cleared and replaced proposals; the final Guide answer points to `/guide`. The backend image was rebuilt and restarted; Bussola returned HTTP 200. No frontend source, database schema or personal records were changed by this integration.

The historical branch is recorded with an `ours` merge after the selective implementation, preserving its original commits without reintroducing superseded code. It can then be closed safely.
