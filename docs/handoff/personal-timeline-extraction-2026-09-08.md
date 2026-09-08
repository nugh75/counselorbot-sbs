# Timeline independent of sessions

The session chooser has been removed. Area personale → Linea del tempo now opens one private workspace per student, even when the student has never started a session. The timeline connects personal actions (including books, articles and films), Portfolio works, Taccuino, Libretto and the orientation directory. Session Tools provide an entry to this workspace.

## Storage and extraction

- Personal revisions use the existing Log table with action `personal_timeline_workspace` and a null session ID. No schema migration or artificial session is required. User ownership and optimistic revision checks apply to every request.
- `ensure_personal_timeline` acquires the same transaction lock as saves and extracts all events plus their linked actions from the latest version of each legacy session workspace. Deterministic IDs avoid collisions and keep action references intact. Imports are not capped at the old 30-event limit.
- The `personal_timeline_import` record stores source revision IDs. Extraction happens once; editing or deleting a personal event never causes it to reappear from a session. Original session workspaces and Portfolio copies remain intact.
- Old `?session=…&event=…` URLs resolve into the extracted personal event. Portfolio backlinks use only `?event=…`. Copies remain immutable and keep their existing size, revision, hash and idempotency checks.
- Redaction applies to text fields rather than serialized identifiers, preventing phone-number heuristics from corrupting generated IDs.

## Institutional dates

Published appointments and registration deadlines come from the existing orientation directory. Students can add them to their timeline; title and date are resolved from the certified, active catalog with the existing institution and audience scope. Personal reflections, actions and tool links remain editable. Catalog changes appear on subsequent reads; revoked or out-of-scope records become unavailable. Past linked dates remain part of the timeline while the record remains active, certified and in scope. This does not publish new institutional events.

## Validation and runtime

39 backend tests passed, including no-session accounts, privacy, conflicts, extraction of 60 events with colliding IDs, non-resurrection, institution scope/updates/revocation, deadlines, Portfolio copies and PDF export. The frontend unit suite passed 125 tests, with TypeScript, ESLint on changed components, and the six-language check passing. The full browser suite passed 47 tests; two optional tests were skipped in that run. The dedicated real-API timeline test also passed against an isolated, rolled-back PostgreSQL test schema.

Backend and frontend Docker images were rebuilt. The timeline page returned HTTP 200 and unauthenticated API access returned HTTP 401. The production extraction check found zero accounts with legacy timeline events, so no existing milestones needed conversion. The extractor remains available on first personal access for legacy data.
