# TF8: Publish and manage the complete mixed teacher flow (#155)

## Implemented contract

`publication_problems` in `backend/path_step_types.py` resolves every active step
of a path through the shared typed-step descriptor and returns
`{step_id, position, step_type, reason}` for each blocked one. `_go_live` in
`backend/routes/class_paths.py` is shared by publish and by restore of a path that
was already published: when any step is blocked it raises
`409 {"code": "path_publication_blocked", "problems": [...]}` before any write;
otherwise it activates steps with no `active_from` (one timestamp for the whole
publication), keeps existing activations, and sets status, first `published_at`
and `archived_at`.

`ClassPathLifecycle` (`{"revision": int | null}`, extra fields forbidden) is the
optional body of publish, archive and restore. A revision that differs from the
locked row returns `409 Class path revision mismatch` without changes; no body keeps
the earlier behaviour for existing clients.

`/user/paths` reports `availability_reason=tool_unavailable` for a step the class
offers but the student's current tool view excludes; class forum steps still follow
their own class setting whatever the view.

Frontend: `frontend/src/lib/path-publication.ts` parses the blocked report, maps
reason codes to the action that fixes them and builds lifecycle requests;
`frontend/src/lib/i18n-path-publication.ts` holds the six-language texts. The
builder (`ClassPathsTab`) sends the revision, lists blocked steps, reloads the
steps to show their reasons, disables archive/restore with unsaved edits, links
each administration step to `/docente/somministrazioni#plan-{id}` and warns when
the class has no institute. `AdministrationPlansPanel` focuses `#plan-{id}` after
loading and, in the teacher research view, links a class plan back to
`/docente/classi/{id}?tab=paths`. Student pages and the progress matrix explain
unavailable steps.

## Validation (synthetic only)

Backend, `backend/tests/test_path_publication.py`, on a disposable PostgreSQL 16
container (`artifact_session`, rolled-back schema per test), with invented
institute, class, goal, assignment, discussion and plan:

- mixed path with Italian administration, deep dive, goal assignment, forum and
  timeline publishes with one activation; another class of the same institute
  neither sees nor launches it;
- revoked assignment, forum off and instrument off are reported together with
  positions and reasons; status, revision and activations stay unchanged;
- stale revisions block publish (including a second tab), archive and restore;
  no-body calls still work;
- reorder and text edits keep IDs and activations; changing an activated target
  is refused; remove-and-add creates a new ID and activation, keeps the old step's
  teacher mark, and the new step starts not done;
- steps added while archived activate on restore and complete afterwards;
- restore with a revoked assignment is blocked and the path stays archived;
- platform/class disable: reasons in teacher progress and student paths, ratio
  excludes the steps, override refused on unavailable, clear allowed;
- students and unrelated teachers get 403 on publish/archive/restore;
- strict mixed path locks later steps; a reply posted while locked counts once
  earlier steps are done;
- class view selection (#147): the class forum setting still applies, the
  timeline hidden by the view is unavailable with a reason.

Regression suites rerun: class paths, path forum/assignments (and concurrency),
Italian and in-app administrations, forum privacy, teacher institutes, institute
credentials.

Frontend: `npm test` (unit tests including `path-publication.test.ts` and
`administration-plans.test.ts`), `npm run i18n:check`, `npm run build`, ESLint on
touched files.

Not run in this lean build: live dev environment, browser journeys, keyboard and
mobile walkthroughs, screenshots and Docker images. The six-language guide text was
updated; guide screenshots were not regenerated.
