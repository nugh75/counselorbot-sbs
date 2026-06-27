<!-- ai4educ:shared-rules:start hash=038bce9b46ee -->
# Development Rules

- Before starting, check `git status`, the current branch, and repository instructions.
- Do not overwrite or remove unrelated existing changes.
- Use a separate branch for large, risky, multi-file, architectural, or experimental changes. Use clear names such as `feature/...`, `fix/...`, `refactor/...`, or `docs/...`.

## Commits

- At the end of every coding session, create one or more commits and push them to GitHub.
- Keep commits atomic: one logical type of change per commit.
- Do not mix features, bug fixes, refactoring, formatting, dependency updates, and documentation unless they are inseparable.
- Use clear Conventional Commit messages, for example:
  - `feat: add CSV export`
  - `fix: correct attendance calculation`
  - `refactor: simplify validation logic`
  - `docs: update setup instructions`
  - `chore: update dependencies`
- Review changes with `git diff` and `git diff --staged` before committing.
- Do not use vague commit messages such as `update`, `fix`, or `changes`.

## Validation

- Run relevant tests, linting, type checks, formatting checks, and builds before the final commit.
- Add or update tests when changing application behaviour or fixing a bug.
- Clearly report any checks that could not be run and explain why.

## Docker

- If the project uses Docker, rebuild the relevant images whenever Dockerfiles, Compose files, dependencies, build scripts, environment build variables, or application code copied into the image are changed.
- Use the appropriate command, such as `docker compose up -d --build`.
- After rebuilding, verify container status and inspect logs if needed.
- Do not remove volumes, databases, or persistent data without explicit approval.

## Documentation and safety

- Update documentation when changing setup steps, configuration, environment variables, dependencies, APIs, database schema, or operational procedures.
- Never commit secrets, credentials, API keys, `.env` files, or production data. Update `.env.example` when needed.
- Do not use force push, destructive reset, rebase, or cleanup commands without explicit approval.

## End of session

Before finishing:
1. Check `git status`.
2. Run the relevant verification commands.
3. Create separate commits by change type.
4. Push the branch to GitHub.
5. Provide a short summary of changed files, checks run, Docker rebuild status, commits created, branch used, and any remaining issues.
<!-- ai4educ:shared-rules:end -->

## Project Notes

CounselorBot supports seven student-facing instruments:

- `QSA` — learning strategies, full profile with cognitive and affective factors.
- `QSAr` — reduced QSA for quicker learning-strategy analysis.
- `ZTPI` — Zimbardo time perspective profile.
- `SAVICKAS` — narrative career construction interview.
- `QPCS` — perceived strategic competences.
- `QPCC` — perceived competences and beliefs.
- `QAP` — career adaptability resources.

Guided paths are database-driven. `GuidedStep` rows define the ordered steps per
`questionnaire_type`; `GuidedStepQuestion` rows define the suggested student
questions shown at the base of each guided-chat step. The Italian default
questions are seeded from `backend/guided_step_questions_seed.py`; the frontend
receives them from `/qsa/guided-ui-texts` as `suggested_questions` for each step
and `fixed_phase_questions` for the fixed "Domande e Approfondimenti" phase.
