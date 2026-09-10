"""One worker, one job at a time, inside a budget it cannot talk itself out of.

The worker never reads the experiment row for what it is measuring: it reads
the run's manifest, frozen when the job was queued. An administrator editing
cases while a run is in flight changes the next run, not this one.

Two jobs exist. `prepare` asks the designer model for synthetic cases and
stops there, because a person has to read them before anything is measured.
`evaluate` calibrates the judge, asks the proposer for at most two small
candidates on the development set alone, picks one on validation and confirms
it on cases neither the proposer nor the selection ever saw.

Budgets are checked before every call, never after a batch, and a cancelled
or exhausted run keeps its partial results and reports as incomplete. An
incomplete run can never produce something an administrator may activate.

Run as a service:
    python -m backend.prompt_lab.worker
"""
from __future__ import annotations

import logging
import json
import hashlib
from difflib import SequenceMatcher
import signal
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Iterator, Mapping, Sequence

from . import contracts, evaluation, storage
from .local_models import LocalModels, ModelError

logger = logging.getLogger(__name__)

POLL_SECONDS = 3.0
# Room for a slow local model inside whatever the budget still allows.
MAX_CALL_SECONDS = 180.0
# What a designer or proposer prompt may show of a long baseline.
BASELINE_EXCERPT = 1200
# Validation repeats the baseline; the final check repeats both arms. Two runs
# do not measure variability, they only stop one lucky sample from deciding.
VALIDATION_BASELINE_REPEATS = 2
FINAL_REPEATS = 2


class _Stopped(Exception):
    """The run must stop now, keeping everything it has already produced."""

    state = "interrupted"


class _Cancelled(_Stopped):
    state = "cancelled"


class _BudgetExceeded(_Stopped):
    state = "budget_exceeded"


class _Failed(Exception):
    """The job cannot produce a result at all."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _default_render() -> Callable[..., dict]:
    # Imported when first used, not at module import: `snapshots` belongs to
    # the API side and the engine's tests must not depend on it being present.
    from . import snapshots

    return snapshots.render


# --- budget -----------------------------------------------------------------
@dataclass
class _Budget:
    """Calls and minutes, and the cancel flag, checked before every call.

    Checked before, not after: a budget that stops the run once the call has
    already been paid for is a report of the overspend, not a cap on it.
    """

    max_calls: int
    deadline: datetime
    tick: Callable[[int], bool]
    now: Callable[[], datetime]
    calls: int = 0
    attempts: list[dict] = field(default_factory=list)

    def before_call(self) -> float:
        if self.tick(self.calls):
            raise _Cancelled("the administrator interrupted the run")
        if self.calls >= self.max_calls:
            raise _BudgetExceeded(f"the run reached its ceiling of {self.max_calls} calls")
        remaining = (self.deadline - self.now()).total_seconds()
        if remaining <= 0:
            raise _BudgetExceeded("the run reached its time limit")
        self.calls += 1
        return min(MAX_CALL_SECONDS, remaining)


@dataclass
class _Stage:
    """What one job produced while it was running."""

    records: list[evaluation.Record] = field(default_factory=list)
    rejected: list[dict] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    calibration: list[dict] = field(default_factory=list)


class Worker:
    """The laboratory's single job runner."""

    def __init__(self, *, session_factory=None, client: Any = None,
                 render: Callable[..., dict] | None = None,
                 now: Callable[[], datetime] = _now,
                 sleep: Callable[[float], None] = time.sleep,
                 poll_seconds: float = POLL_SECONDS):
        self._session_factory = session_factory or storage.session_factory()
        self._client = client if client is not None else LocalModels()
        self._render = render
        self._now = now
        self._sleep = sleep
        self._poll_seconds = poll_seconds

    # --- lifecycle ----------------------------------------------------------
    def recover(self) -> int:
        """Close jobs left `running` by a process that is no longer there.

        There is one worker. A run still marked running at startup has no
        worker behind it, so it is interrupted rather than resumed: an
        invisible continuation would produce results under a state nobody
        watched. Restarting the trials creates a new run.
        """
        closed = 0
        with self._session() as db:
            for run in db.query(storage.LabRun).filter(storage.LabRun.state == "running").all():
                run.state = "interrupted"
                run.finished_at = self._now()
                run.error = "the worker restarted while this run was in flight"
                closed += 1
                experiment = db.get(storage.LabExperiment, run.experiment_id)
                if experiment is not None and experiment.state == "running":
                    experiment.state = "ready" if run.kind == "evaluate" else "draft"
                    experiment.error = run.error
        if closed:
            logger.info("prompt lab: closed %s interrupted run(s) at startup", closed)
        return closed

    def claim(self) -> str | None:
        """Take the oldest queued job, or nothing.

        `skip_locked` is what keeps a second worker, started by mistake, from
        waiting on this one's row and then running the same job.
        """
        with self._session() as db:
            run = (
                db.query(storage.LabRun)
                .filter(storage.LabRun.state == "queued")
                .order_by(storage.LabRun.created_at, storage.LabRun.id)
                .with_for_update(skip_locked=True)
                .first()
            )
            if run is None:
                return None
            moment = self._now()
            run.state = "running"
            run.started_at = moment
            run.heartbeat_at = moment
            experiment = db.get(storage.LabExperiment, run.experiment_id)
            if experiment is not None:
                experiment.state = "running"
                experiment.error = None
            return run.id

    def run_once(self) -> bool:
        run_id = self.claim()
        if run_id is None:
            return False
        self.execute(run_id)
        return True

    def loop(self, *, stop: Callable[[], bool] | None = None) -> None:
        self.recover()
        while not (stop and stop()):
            try:
                if not self.run_once():
                    self._sleep(self._poll_seconds)
            except Exception:  # pragma: no cover - the loop must survive a job
                logger.exception("prompt lab: job crashed")
                self._sleep(self._poll_seconds)

    # --- one job ------------------------------------------------------------
    def execute(self, run_id: str) -> str:
        """Run one claimed job to its end. Returns the final run state."""
        with self._session() as db:
            run = db.get(storage.LabRun, run_id)
            if run is None:
                raise _Failed(f"run {run_id} is gone")
            manifest = dict(run.manifest or {})
            kind = run.kind
            experiment_id = run.experiment_id

        if not contracts.manifest_intact(manifest):
            return self._close(run_id, experiment_id, state="failed", calls=0,
                               error="the run manifest does not match its own hash")

        payload = manifest.get("payload") or {}
        budget = _Budget(
            max_calls=int(payload.get("max_calls") or contracts.MAX_CALLS_CEILING),
            deadline=self._now() + timedelta(
                minutes=int(payload.get("max_minutes") or contracts.MAX_MINUTES_CEILING)),
            tick=lambda calls: self._tick(run_id, calls),
            now=self._now,
        )
        try:
            self._verify_models(manifest.get("snapshot") or {})
            if kind == "prepare":
                report = self._prepare(run_id, experiment_id, manifest, budget)
            elif kind == "evaluate":
                report = self._evaluate(run_id, experiment_id, manifest, budget)
            else:
                raise _Failed(f"unknown job kind {kind!r}")
        except _Stopped as stop:
            return self._close(run_id, experiment_id, state=stop.state, calls=budget.calls,
                               error=str(stop))
        except _Failed as exc:
            return self._close(run_id, experiment_id, state="failed", calls=budget.calls,
                               error=str(exc))
        except Exception as exc:  # pragma: no cover - defensive
            logger.exception("prompt lab: %s job failed", kind)
            return self._close(run_id, experiment_id, state="failed", calls=budget.calls,
                               error=f"{type(exc).__name__}: {exc}")
        return self._close(run_id, experiment_id, state=report.pop("_state", "completed"),
                           calls=budget.calls, error=report.pop("_error", None),
                           summary=report)

    # --- prepare ------------------------------------------------------------
    def _prepare(self, run_id: str, experiment_id: str, manifest: Mapping[str, Any],
                 budget: _Budget) -> dict:
        payload = manifest["payload"]
        snapshot = manifest["snapshot"]
        designer = _preset(snapshot, "designer")
        languages = list(payload.get("languages") or ["it"])
        purpose = payload["purpose"]
        splits = contracts.REQUIRED_SPLITS[purpose]
        baseline = str(snapshot.get("baseline") or "")
        goals = list(payload.get("goals") or [])

        # Half a set is not a set: a stop propagates and nothing is written,
        # so the experiment stays where it was and preparation is restarted.
        cases: list[dict] = []
        for language in languages:
            for split in splits:
                drafted = self._design(designer, budget, goals=goals, language=language,
                                       split=split, baseline=baseline,
                                       target_key=payload.get("target_key", ""))
                for index, item in enumerate(drafted, start=1):
                    suffix = f"{split}-{language}-{index}"
                    cases.append({
                        "id": f"case-{suffix}",
                        "group_id": f"group-{suffix}",
                        "split": split,
                        "language": language,
                        "message": item["message"],
                        "history": item.get("history") or [],
                        "expected": item["expected"],
                    })

        try:
            parsed = contracts.validate_case_set(cases, languages=languages, purpose=purpose)
        except ValueError as exc:
            raise _Failed(f"the designer did not produce a usable set of cases: {exc}") from exc

        stored = [case.model_dump() for case in parsed]
        with self._session() as db:
            experiment = db.get(storage.LabExperiment, experiment_id)
            if experiment is None:
                raise _Failed("the experiment is gone")
            experiment.cases = stored
            experiment.candidates = []
            experiment.summary = None
            experiment.error = None
            experiment.state = "ready"
        return {"kind": "prepare", "cases": len(stored),
                "languages": languages, "splits": list(splits)}

    def _design(self, preset: Mapping[str, Any], budget: _Budget, *,
                goals: Sequence[Mapping[str, str]], language: str, split: str,
                baseline: str, target_key: str) -> list[dict]:
        wanted = contracts.MIN_CASES_PER_SPLIT
        system = (
            "You invent practice material for a prompt laboratory. Everything you write is "
            "fiction: no real person, no real school, no real conversation. Do not reuse "
            "anything you may have seen; make it up.\n\n"
            f"Write exactly {wanted} independent scenarios, each a single student turn with "
            "the history it needs to be readable. Each scenario must be a different person "
            "with a different difficulty. Vary the difficulty: some scenarios must be ones "
            "the current prompt would plausibly handle well, others ones it would not.\n\n"
            "Reply with one JSON object and nothing else:\n"
            '{"cases": [{"message": "...", "history": [{"role": "user", "content": "..."}], '
            '"expected": "..."}]}\n\n'
            f'Write `message`, `history` and `expected` in the language "{language}". '
            "`expected` says what a good reply would do, in one or two sentences. "
            "`history` may be empty."
        )
        lines = [f"TARGET UNDER STUDY: {target_key}", f"SET: {split}", "", "GOALS"]
        for index, goal in enumerate(goals, start=1):
            lines.append(f'{index}. {goal.get("text", "")} — observable as: '
                         f'{goal.get("criterion", "")}')
        if baseline:
            lines += ["", "THE PROMPT CURRENTLY IN USE (context only, do not rewrite it)",
                      baseline[:BASELINE_EXCERPT]]
        raw = self._call(preset, system, "\n".join(lines), budget)

        payload = evaluation.parse_json_object(raw)
        items = (payload or {}).get("cases")
        if not isinstance(items, list):
            raise _Failed(f"the designer returned no readable cases for {split}/{language}")
        drafted: list[dict] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            message = str(item.get("message") or "").strip()
            expected = str(item.get("expected") or "").strip()
            if not message or not expected:
                continue
            drafted.append({"message": message[:4000], "expected": expected[:2000],
                            "history": _history(item.get("history"))})
        if len(drafted) < wanted:
            raise _Failed(f"the designer returned {len(drafted)} usable case(s) for "
                          f"{split}/{language}, {wanted} are required")
        return drafted[:wanted]

    # --- evaluate -----------------------------------------------------------
    def _evaluate(self, run_id: str, experiment_id: str, manifest: Mapping[str, Any],
                  budget: _Budget) -> dict:
        payload = manifest["payload"]
        snapshot = manifest["snapshot"]
        cases = list(manifest.get("cases") or [])
        if not cases:
            raise _Failed("the manifest carries no cases")
        purpose = payload["purpose"]
        goals = list(payload.get("goals") or [])
        baseline = str(snapshot.get("baseline") or "")
        tested = _tested(snapshot)
        judge = _preset(snapshot, "judge")
        render = self._render or _default_render()

        stage = _Stage()
        stopped: _Stopped | None = None
        blocked: str | None = None
        selected: str | None = None
        candidates: list[dict] = []
        digests = {name: value for name, value in self._digests().items() if name in snapshot.get("model_digests", {})}

        try:
            failures = self._calibrate(judge, budget, stage)
            if failures:
                # Not a failed run: the results are worth keeping and the
                # report has to say why nothing can be concluded from them.
                blocked = "the judge failed calibration: " + "; ".join(failures)
            else:
                if purpose == "improvement":
                    candidates = self._propose(snapshot, payload, cases, stage, budget)
                    self._save_candidates(experiment_id, candidates)
                variants = [{"id": "baseline", "text": baseline}] + candidates
                if purpose == "verification":
                    self._measure(run_id, stage, render=render, snapshot=snapshot,
                                  cases=cases, splits=("validation", "final"),
                                  presets=tested, judge=judge, goals=goals,
                                  arms=[{"id": "baseline", "text": baseline}],
                                  repeats={"baseline": 1}, budget=budget)
                elif candidates:
                    self._measure(run_id, stage, render=render, snapshot=snapshot,
                                  cases=cases, splits=("validation",), presets=tested,
                                  judge=judge, goals=goals, arms=variants,
                                  repeats=_validation_repeats(candidates), budget=budget)
                    selected, note = evaluation.select_candidate(
                        evaluation.aggregate(stage.records),
                        [item["id"] for item in candidates],
                        change_sizes={item["id"]: 1 - SequenceMatcher(None, baseline, item["text"]).ratio() for item in candidates})
                    stage.notes.append(note)
                    if selected is not None:
                        winner = next(item for item in candidates if item["id"] == selected)
                        self._measure(run_id, stage, render=render, snapshot=snapshot,
                                      cases=cases, splits=("final",), presets=tested,
                                      judge=judge, goals=goals,
                                      arms=[{"id": "baseline", "text": baseline}, winner],
                                      repeats={"baseline": FINAL_REPEATS,
                                               selected: FINAL_REPEATS},
                                      budget=budget)
        except _Stopped as stop:
            stopped = stop
            blocked = f"the run stopped before finishing: {stop}"

        try:
            self._verify_models(snapshot)
        except _Failed as exc:
            blocked = str(exc)
        metrics = evaluation.aggregate(stage.records)
        outcome = evaluation.decide(
            purpose=purpose, metrics=metrics, goals=goals, records=stage.records,
            selected=selected, completed_calls=budget.calls, blocked=blocked,
        )
        if purpose == "improvement" and not candidates and outcome.eligibility == "not_eligible":
            if stage.rejected:
                refusals = "; ".join(item["reason"] for item in stage.rejected)
                outcome.reason = f"the controls refused every proposal: {refusals}"
            else:
                outcome.reason = "the proposer produced no candidate"
        summary = outcome.as_summary()

        with self._session() as db:
            experiment = db.get(storage.LabExperiment, experiment_id)
            if experiment is None:
                raise _Failed("the experiment is gone")
            experiment.summary = summary
            if stopped is None:
                experiment.state = "completed"
                experiment.error = None
            else:
                # Re-runnable, and honest about why it has to be re-run.
                experiment.state = "ready"
                experiment.error = str(stopped)

        report = {
            "kind": "evaluate",
            "summary": summary,
            "rejected_candidates": stage.rejected,
            "notes": stage.notes,
            "model_digests": digests,
            "calibration": stage.calibration,
            "attempts": budget.attempts,
            "results": len(stage.records),
        }
        if stopped is not None:
            report["_state"] = stopped.state
            report["_error"] = str(stopped)
        return report

    # --- judge calibration --------------------------------------------------
    def _calibrate(self, judge: Mapping[str, Any], budget: _Budget, stage: _Stage) -> list[str]:
        """Show the judge one sound reply and one blatantly wrong one.

        Before any variant is judged, and against built-in text: calling the
        live guard would write log rows and close a real student's questions.
        """
        system = evaluation.judge_prompt(evaluation.CALIBRATION_GOALS)
        observed: list[tuple[str, evaluation.Judgment | None]] = []
        for item in evaluation.CALIBRATION_CASES:
            user = evaluation.judge_input(item["case"], item["response"])
            try:
                raw = self._call(judge, system, user, budget)
            except _Stopped:
                raise
            except _Failed as exc:
                observed.append((item["id"], None))
                stage.calibration.append({"id": item["id"], "expected_pass": item["expect_pass"], "error": str(exc)})
                logger.info("prompt lab: calibration call failed: %s", exc)
                continue
            judgment = evaluation.parse_judgment(raw, len(evaluation.CALIBRATION_GOALS))
            observed.append((item["id"], judgment))
            stage.calibration.append({"id": item["id"], "expected_pass": item["expect_pass"],
                                      "judgment": judgment.model_dump() if judgment else None,
                                      "error": None if judgment else "Unreadable calibration verdict"})
        return evaluation.calibration_failures(observed)

    # --- proposal -----------------------------------------------------------
    def _propose(self, snapshot: Mapping[str, Any], payload: Mapping[str, Any],
                 cases: Sequence[Mapping[str, Any]], stage: _Stage,
                 budget: _Budget) -> list[dict]:
        """At most two small candidates, from the development set alone.

        The holdout never reaches this call. A proposer that has read the
        cases it will be measured on has been shown the answer, and the final
        check stops being independent of the search that produced it.
        """
        proposer = _preset(snapshot, "proposer")
        if proposer is None:
            raise _Failed("an improvement needs a proposer preset")
        baseline = str(snapshot.get("baseline") or "")
        development = [case for case in cases if case.get("split") == "development"]
        if not development:
            raise _Failed("there are no development cases to propose from")

        system = (
            "You propose a SMALL edit to one prompt used by a counselling assistant. "
            f"At most {contracts.MAX_CANDIDATES} proposals, each a complete replacement text "
            "for that prompt.\n\n"
            "Hard rules. Keep every placeholder and every [BRACKET] marker exactly as it is. "
            f"Stay within {evaluation.MAX_LENGTH_DRIFT:.0%} of the original length. Change only "
            "what the goals require. You may not touch the rubric, the thresholds or anything "
            "about how replies are judged: that is not part of the prompt.\n\n"
            "Reply with one JSON object and nothing else:\n"
            '{"candidates": [{"text": "...", "reason": "...", "expected": "..."}]}\n\n'
            "`reason` is the cause you think produces the current behaviour, in one or two "
            "sentences a reviewer can check. It is not a trace of your reasoning. "
            "`expected` says what should change in the replies."
        )
        lines = [f'TARGET: {payload.get("target_key", "")}', "", "GOALS"]
        for index, goal in enumerate(payload.get("goals") or [], start=1):
            lines.append(f'{index}. {goal.get("text", "")} — observable as: '
                         f'{goal.get("criterion", "")}')
        lines += ["", "THE PROMPT AS IT IS TODAY", baseline, "",
                  "DEVELOPMENT CASES (the only ones you may read)"]
        for index, case in enumerate(development, start=1):
            lines.append(f'{index}. [{case.get("language")}] student: {case.get("message")}')
            lines.append('   history: ' + json.dumps(case.get('history') or [], ensure_ascii=False))
            lines.append(f'   a good reply would: {case.get("expected")}')
        raw = self._call(proposer, system, "\n".join(lines), budget)

        payload_json = evaluation.parse_json_object(raw)
        items = (payload_json or {}).get("candidates")
        if not isinstance(items, list):
            raise _Failed("the proposer returned no readable candidates")

        accepted: list[dict] = []
        for index, item in enumerate(items, start=1):
            if len(accepted) >= contracts.MAX_CANDIDATES:
                break
            if not isinstance(item, dict):
                continue
            text = str(item.get("text") or "").strip()
            candidate_id = f"candidate-{index}"
            problem = evaluation.check_candidate(baseline, text)
            if not str(item.get("reason") or "").strip() or not str(item.get("expected") or "").strip():
                problem = problem or "the proposal must explain its cause and expected change"
            if problem:
                # A refused proposal is kept with its reason: the losing
                # variants are part of the record, not noise to discard.
                stage.rejected.append({"id": candidate_id, "text": text, "reason": problem})
                continue
            accepted.append({
                "id": candidate_id, "text": text,
                "reason": str(item.get("reason") or "").strip()[:2000],
                "expected": str(item.get("expected") or "").strip()[:2000],
            })
        return accepted

    def _save_candidates(self, experiment_id: str, candidates: Sequence[Mapping[str, Any]]
                         ) -> None:
        """Written before they are run, so a crash cannot lose what was tried."""
        with self._session() as db:
            experiment = db.get(storage.LabExperiment, experiment_id)
            if experiment is not None:
                experiment.candidates = [dict(item) for item in candidates]

    # --- measurement --------------------------------------------------------
    def _measure(self, run_id: str, stage: _Stage, *, render: Callable[..., dict],
                 snapshot: Mapping[str, Any], cases: Sequence[Mapping[str, Any]],
                 splits: Sequence[str], presets: Sequence[Mapping[str, Any]],
                 judge: Mapping[str, Any], goals: Sequence[Mapping[str, str]],
                 arms: Sequence[Mapping[str, Any]], repeats: Mapping[str, int],
                 budget: _Budget) -> None:
        """Every arm on every case, interleaved and in the same conditions.

        The arms run back to back on each case with the order alternating, so
        a model warming up or a gateway slowing down does not land on one arm
        only. Both arms get the same frozen history and the same retry policy.
        """
        judge_system = evaluation.judge_prompt(goals)
        selected = [case for case in cases if case.get("split") in splits]
        rounds = max(repeats.values()) if repeats else 1
        for position, case in enumerate(selected):
            ordered = list(arms) if position % 2 == 0 else list(reversed(arms))
            for preset in presets:
                for repetition in range(1, rounds + 1):
                    for arm in ordered:
                        if repetition > repeats.get(arm["id"], 1):
                            continue
                        self._trial(run_id, stage, render=render, snapshot=snapshot,
                                    case=case, preset=preset, arm=arm,
                                    repetition=repetition, judge=judge,
                                    judge_system=judge_system, goals=goals, budget=budget)

    def _trial(self, run_id: str, stage: _Stage, *, render: Callable[..., dict],
               snapshot: Mapping[str, Any], case: Mapping[str, Any],
               preset: Mapping[str, Any], arm: Mapping[str, Any], repetition: int,
               judge: Mapping[str, Any], judge_system: str,
               goals: Sequence[Mapping[str, str]], budget: _Budget) -> None:
        try:
            envelope = render(snapshot, dict(case), arm["text"])
            envelope["candidate_hash"] = hashlib.sha256(arm["text"].encode()).hexdigest()
        except Exception as exc:
            # An envelope that cannot be rebuilt is not a valid trial. It is
            # recorded as excluded rather than dropped, and it is not a pass.
            self._record(run_id, stage, case=case, preset=preset, arm=arm,
                         repetition=repetition, response=None, judgment=None,
                         error=f"the case could not be rendered: {exc}", envelope=None,
                         duration=0.0, goal_count=len(goals))
            return

        started = time.monotonic()
        response: str | None = None
        raw_response: str | None = None
        error: str | None = None
        try:
            response = self._call(preset, envelope.get("system_prompt_final", ""),
                                  envelope.get("full_message", ""), budget,
                                  history=envelope.get("history") or [])
        except _Stopped:
            raise
        except _Failed as exc:
            error = str(exc)
        raw_response = response
        if response and snapshot.get("kind") == "synthetic_step_entry":
            from .snapshots import visible_response
            try:
                response = visible_response(snapshot, case, response)
            except Exception as exc:
                error = f"response rendering failed: {type(exc).__name__}"
        duration = time.monotonic() - started

        judgment = None
        if error is None and evaluation.failure_reason(response) is None:
            try:
                raw = self._call(judge, judge_system, evaluation.judge_input(dict(case, profile_context=envelope.get("profile_context", "No profile scores supplied.")), response),
                                 budget)
            except _Stopped as stop:
                self._record(run_id, stage, case=case, preset=preset, arm=arm,
                             repetition=repetition, response=response, judgment=None,
                             error=f"judgment incomplete: {stop}", envelope=envelope,
                             duration=duration, goal_count=len(goals), raw_response=raw_response)
                raise
            except _Failed as exc:
                error = f"the judge did not answer: {exc}"
            else:
                judgment = evaluation.parse_judgment(raw, len(goals))
                if judgment is None:
                    error = "the judge returned no readable verdict"
        elif error is None:
            error = evaluation.failure_reason(response)

        self._record(run_id, stage, case=case, preset=preset, arm=arm,
                     repetition=repetition, response=response, judgment=judgment,
                     error=error, envelope=envelope, duration=duration,
                     goal_count=len(goals), raw_response=raw_response)

    def _record(self, run_id: str, stage: _Stage, *, case: Mapping[str, Any],
                preset: Mapping[str, Any], arm: Mapping[str, Any], repetition: int,
                response: str | None, judgment: evaluation.Judgment | None,
                error: str | None, envelope: Mapping[str, Any] | None,
                duration: float, goal_count: int, raw_response: str | None = None) -> None:
        passed = error is None and evaluation.case_passed(response, judgment)
        verdict: dict | None = None
        if judgment is not None:
            verdict = judgment.model_dump()
            verdict["passed"] = passed
            verdict["failure"] = error
        stage.records.append(evaluation.Record(
            case_id=str(case.get("id")), split=str(case.get("split")),
            preset_id=int(preset.get("id") or 0), variant_id=str(arm["id"]),
            repetition=repetition, passed=passed, errored=error is not None,
            language=str(case.get("language", "it")), critical_ok=bool(judgment and judgment.critical_ok),
            goal_ok=tuple(check.ok for check in judgment.goals) if judgment
            else tuple(False for _ in range(goal_count)),
        ))
        with self._session() as db:
            db.add(storage.LabResult(
                run_id=run_id, case_id=str(case.get("id")),
                preset_id=int(preset.get("id") or 0), variant_id=str(arm["id"]),
                repetition=repetition, response=response, raw_response=raw_response, judgment=verdict,
                error=error, envelope=_stored_envelope(envelope), duration_s=round(duration, 3),
            ))

    # --- plumbing -----------------------------------------------------------
    def _call(self, preset: Mapping[str, Any] | None, system: str, user: str,
              budget: _Budget, history: Sequence[Mapping[str, Any]] = ()) -> str:
        """One model call, with one retry and only for a transient failure.

        The same policy for every arm. A baseline allowed two attempts and a
        candidate one would be a comparison of retry budgets.
        """
        if not preset:
            raise _Failed("no preset for this call")
        last: ModelError | None = None
        for attempt in (1, 2):
            timeout = budget.before_call()
            attempt_record = {"call": budget.calls, "preset_id": preset.get("id"), "attempt": attempt, "error": None}
            budget.attempts.append(attempt_record)
            try:
                return self._client.chat(preset, system, user, history, timeout=timeout)
            except ModelError as exc:
                attempt_record["error"] = str(exc)
                last = exc
                if not exc.transient or attempt == 2:
                    break
                logger.info("prompt lab: retrying after a transient failure: %s", exc)
            except Exception as exc:  # a client that misbehaves is still a failed call
                raise _Failed(f"{type(exc).__name__}: {exc}") from exc
        raise _Failed(str(last) if last else "the model did not answer")

    def _verify_models(self, snapshot):
        expected = snapshot.get("model_digests") or {}
        actual = self._digests()
        if not expected or any(actual.get(name) != value for name, value in expected.items()):
            raise _Failed("the selected model versions are unavailable or changed; create a new experiment")

    def _digests(self) -> dict[str, str]:
        try:
            return self._client.digests()
        except Exception:  # a gateway that will not list its tags is not a failed run
            return {}

    def _tick(self, run_id: str, calls: int) -> bool:
        """Heartbeat and cancel flag, read from the row, before every call."""
        with self._session() as db:
            run = db.get(storage.LabRun, run_id)
            if run is None:
                return True
            run.heartbeat_at = self._now()
            run.calls = calls
            return bool(run.cancel_requested)

    def _close(self, run_id: str, experiment_id: str, *, state: str, calls: int,
               error: str | None = None, summary: Mapping[str, Any] | None = None) -> str:
        with self._session() as db:
            run = db.get(storage.LabRun, run_id)
            kind = run.kind if run is not None else "evaluate"
            if run is not None:
                run.state = state
                run.finished_at = self._now()
                run.calls = calls
                run.error = error
                run.summary = dict(summary) if summary else run.summary
            experiment = db.get(storage.LabExperiment, experiment_id)
            if experiment is not None and experiment.state == "running":
                # A preparation that never stored cases goes back to draft:
                # `ready` would claim there is a reviewed set to run.
                if state == "failed":
                    experiment.state = "failed"
                else:
                    experiment.state = "draft" if kind == "prepare" else "ready"
                experiment.error = error
        return state

    @contextmanager
    def _session(self) -> Iterator[Any]:
        db = self._session_factory()
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()


# --- helpers ----------------------------------------------------------------
def _preset(snapshot: Mapping[str, Any], role: str) -> dict | None:
    preset = ((snapshot.get("presets") or {}).get(role))
    return dict(preset) if isinstance(preset, Mapping) else None


def _tested(snapshot: Mapping[str, Any]) -> list[dict]:
    presets = (snapshot.get("presets") or {}).get("tested") or []
    tested = [dict(item) for item in presets if isinstance(item, Mapping)]
    if not tested:
        raise _Failed("the snapshot lists no preset to test")
    return tested


def _validation_repeats(candidates: Sequence[Mapping[str, Any]]) -> dict[str, int]:
    repeats = {"baseline": VALIDATION_BASELINE_REPEATS}
    for item in candidates:
        repeats[item["id"]] = VALIDATION_BASELINE_REPEATS
    return repeats


def _history(raw: Any) -> list[dict]:
    turns = []
    for turn in raw or []:
        if not isinstance(turn, Mapping):
            continue
        role = str(turn.get("role") or "").strip()
        content = str(turn.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            turns.append({"role": role, "content": content[:4000]})
    return turns[:contracts.MAX_HISTORY_TURNS]


def _stored_envelope(envelope: Mapping[str, Any] | None) -> dict | None:
    if not envelope:
        return None
    out: dict[str, Any] = {}
    for key in ("system_prompt_final", "full_message"):
        value = envelope.get(key)
        if isinstance(value, str):
            out[key] = value
    out["history"] = list(envelope.get("history") or [])
    out["profile_context"] = envelope.get("profile_context", "")
    out["candidate_hash"] = envelope.get("candidate_hash")
    return out


def main() -> None:  # pragma: no cover - service entry point
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    # Hold the connection for the service lifetime: no second worker may recover
    # jobs that this process is still executing.
    from sqlalchemy import text
    factory = storage.session_factory()
    singleton = factory().bind.connect()
    if singleton.dialect.name == "postgresql":
        if not singleton.execute(text("SELECT pg_try_advisory_lock(781905241)")).scalar():
            singleton.close()
            raise RuntimeError("A prompt lab worker is already active")
    worker = Worker(session_factory=factory)
    stopping = {"now": False}

    def _stop(*_args):
        stopping["now"] = True

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    worker.loop(stop=lambda: stopping["now"])


if __name__ == "__main__":  # pragma: no cover
    main()
