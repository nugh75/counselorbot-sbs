"""What the prompt laboratory must refuse, and what it must never call a pass.

The engine's job is to produce a report an administrator can act on. Every
test here holds one of the ways such a report could be wrong while still
looking complete: a case set that never separated its holdout, a candidate
that quietly dropped a placeholder, a judge that never answered, a run that
ran out of budget halfway and reported the half it managed.

No network, no production database. The model client is a fake and every
database is a temporary SQLite file.

Runnable without pytest:
    docker exec counselorbot_backend python -m backend.tests.test_prompt_lab_engine
"""
from __future__ import annotations

import json
import os
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone

from pydantic import ValidationError

from backend.prompt_lab import contracts, evaluation, storage, worker
from backend.prompt_lab.local_models import LocalModels, ModelError, UnsupportedPreset

# A prompt with the two things a blind edit destroys: a resolved placeholder
# and a bracket sentinel other code looks for.
BASELINE = (
    "Sei il counselor. Parla con {student_name} nella lingua della conversazione.\n"
    "[ANCHOR] Chiudi con una sola domanda legata a un'esperienza concreta.\n"
    "Non inventare punteggi e non ripetere quello che la storia contiene gia'."
)
CANDIDATE = BASELINE.replace("non ripetere", "non chiedere")

GOALS = [{"text": "Non richiede informazioni gia' presenti nella storia.",
          "criterion": "Nessuna domanda su un dato che la storia contiene."}]


# --- harness ----------------------------------------------------------------
@contextmanager
def lab():
    """A laboratory database of its own, thrown away afterwards."""
    handle = tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False)
    handle.close()
    url = f"sqlite:///{handle.name}"
    previous = os.environ.get(storage.URL_ENV)
    os.environ[storage.URL_ENV] = url
    try:
        storage.init_schema(url)
        yield storage.session_factory(url)
    finally:
        if previous is None:
            os.environ.pop(storage.URL_ENV, None)
        else:
            os.environ[storage.URL_ENV] = previous
        storage.reset_factories()
        os.unlink(handle.name)


def preset(preset_id: int, name: str) -> dict:
    return {"id": preset_id, "name": name, "provider": "ollama",
            "model": f"model-{preset_id}", "temperature": 0, "max_tokens": 512,
            "disable_thinking": True}


def make_snapshot(*, tested=(11,), proposer: bool = True, baseline: str = BASELINE) -> dict:
    return {
        "baseline": baseline,
        "presets": {
            "designer": preset(1, "designer"),
            "proposer": preset(2, "proposer") if proposer else None,
            "judge": preset(3, "judge"),
            "tested": [preset(item, f"tested-{item}") for item in tested],
        },
        "source_hash": "source-hash",
        "model_digests": {"model-11": "deadbeef"},
        "render_data": {"opaque": True},
    }


def make_payload(*, purpose: str = "improvement", languages=("it",), tested=(11,),
                 max_calls: int = contracts.MAX_CALLS_CEILING) -> dict:
    body = contracts.ExperimentCreate(
        title="Prova sintetica",
        purpose=purpose,
        target_key="prompt_qsa_analysis",
        goals=GOALS,
        languages=list(languages),
        designer_preset_id=1,
        proposer_preset_id=2 if purpose == "improvement" else None,
        judge_preset_id=3,
        tested_preset_ids=list(tested),
        max_calls=max_calls,
        max_minutes=60,
    )
    return body.model_dump()


def make_cases(*, purpose: str = "improvement", languages=("it",)) -> list[dict]:
    out = []
    for language in languages:
        for split in contracts.REQUIRED_SPLITS[purpose]:
            for index in (1, 2):
                out.append({
                    "id": f"case-{split}-{language}-{index}",
                    "group_id": f"group-{split}-{language}-{index}",
                    "split": split,
                    "language": language,
                    "message": f"messaggio {split} {language} {index}",
                    "history": [{"role": "user", "content": f"storia {split} {index}"}],
                    "expected": f"attesa {split} {language} {index}",
                })
    return out


def seed(factory, *, payload: dict, snapshot: dict, cases: list[dict],
         kind: str = "evaluate", state: str = "ready") -> tuple[str, str]:
    """One experiment and one queued run, exactly as the API would leave them."""
    manifest = contracts.build_manifest(payload=payload, snapshot=snapshot, cases=cases)
    db = factory()
    try:
        experiment = storage.LabExperiment(
            title=payload["title"], purpose=payload["purpose"],
            target_key=payload["target_key"], created_by="admin@test",
            state=state, payload=payload, snapshot=snapshot, cases=cases,
        )
        db.add(experiment)
        db.flush()
        run = storage.LabRun(experiment_id=experiment.id, kind=kind, manifest=manifest)
        db.add(run)
        db.flush()
        ids = (experiment.id, run.id)
        db.commit()
        return ids
    finally:
        db.close()


def render(snapshot, case, prompt):
    """Stand-in for the root's `snapshots.render`: the prompt is the system text."""
    return {"system_prompt_final": prompt,
            "full_message": case["message"],
            "history": case.get("history") or []}


class FakeClient:
    """Records every call and answers from a script. Never opens a socket."""

    def __init__(self, responder):
        self._responder = responder
        self.calls: list[dict] = []

    def chat(self, preset, system, user, history=(), *, timeout=None):
        self.calls.append({"preset_id": preset.get("id"), "system": system,
                           "user": user, "history": list(history), "timeout": timeout})
        answer = self._responder(len(self.calls), preset, system, user)
        if isinstance(answer, Exception):
            raise answer
        return answer

    def digests(self):
        return {"model-11": "deadbeef"}

    def judging(self) -> list[dict]:
        return [call for call in self.calls if evaluation.JUDGE_MARKER in call["system"]]

    def generating(self) -> list[dict]:
        return [call for call in self.calls
                if evaluation.JUDGE_MARKER not in call["system"]
                and "invent practice material" not in call["system"]
                and "propose a SMALL edit" not in call["system"]]

    def proposing(self) -> list[dict]:
        return [call for call in self.calls if "propose a SMALL edit" in call["system"]]


def verdict(ok: bool, count: int) -> str:
    checks = [{"ok": ok, "note": "" if ok else "ha ripetuto una domanda"} for _ in range(count)]
    return json.dumps({"goals": checks, "critical_ok": True})


def calibrated(user: str) -> str | None:
    """The two built-in calibration replies, judged correctly."""
    if "Your A6 score is 87" in user:
        return verdict(False, len(evaluation.CALIBRATION_GOALS))
    if "Il fattore A6 guarda" in user:
        return verdict(True, len(evaluation.CALIBRATION_GOALS))
    return None


def improvement_responder(_index, _preset, system, user):
    """The candidate answers well, the baseline does not. Everything else works."""
    if evaluation.JUDGE_MARKER in system:
        answer = calibrated(user)
        if answer is not None:
            return answer
        return verdict("risposta candidata" in user, len(GOALS))
    if "propose a SMALL edit" in system:
        return json.dumps({"candidates": [
            {"text": CANDIDATE, "reason": "la riga finale invitava a riformulare",
             "expected": "meno domande su dati gia' noti"}]})
    return "risposta candidata" if system == CANDIDATE else "risposta ripetitiva"


def run_worker(factory, run_id, responder, **kwargs) -> tuple[FakeClient, str]:
    client = FakeClient(responder)
    engine = worker.Worker(session_factory=factory, client=client, render=render, **kwargs)
    return client, engine.execute(run_id)


def fetch(factory, experiment_id, run_id):
    db = factory()
    try:
        experiment = db.get(storage.LabExperiment, experiment_id)
        run = db.get(storage.LabRun, run_id)
        results = db.query(storage.LabResult).filter(
            storage.LabResult.run_id == run_id).all()
        return (storage.serializer(experiment), storage.serializer(run),
                [storage.serializer(row) for row in results])
    finally:
        db.close()


# --- contracts: what the server refuses -------------------------------------
def test_an_improvement_without_a_proposer_is_refused():
    try:
        contracts.ExperimentCreate(
            title="Senza proponente", purpose="improvement", target_key="prompt_qsa_analysis",
            goals=GOALS, designer_preset_id=1, judge_preset_id=3, tested_preset_ids=[11])
    except ValidationError as exc:
        assert "proposer" in str(exc)
    else:
        raise AssertionError("an improvement with no proposer was accepted")


def test_a_verification_carrying_a_proposer_is_refused():
    # The proposer is the only thing separating the two purposes: a
    # verification that has one would silently become an improvement.
    try:
        contracts.ExperimentCreate(
            title="Verifica travestita", purpose="verification",
            target_key="prompt_qsa_analysis", goals=GOALS, designer_preset_id=1,
            proposer_preset_id=2, judge_preset_id=3, tested_preset_ids=[11])
    except ValidationError as exc:
        assert "verification must not carry proposer_preset_id" in str(exc)
    else:
        raise AssertionError("a verification with a proposer was accepted")


def test_an_experiment_needs_goals_a_model_to_test_and_a_budget_in_range():
    for kwargs, expected in (
        ({"goals": []}, "goals"),
        ({"tested_preset_ids": []}, "tested_preset_ids"),
        ({"tested_preset_ids": [11, 11]}, "unique"),
        ({"languages": ["klingon"]}, "languages"),
        ({"max_calls": contracts.MAX_CALLS_CEILING + 1}, "max_calls"),
        ({"max_minutes": 0}, "max_minutes"),
        ({"target_key": "prompt qsa; drop"}, "target_key"),
    ):
        base = dict(title="Prova", purpose="verification", target_key="prompt_qsa_analysis",
                    goals=GOALS, designer_preset_id=1, judge_preset_id=3,
                    tested_preset_ids=[11])
        base.update(kwargs)
        try:
            contracts.ExperimentCreate(**base)
        except ValidationError as exc:
            assert expected in str(exc), f"{kwargs} rejected for the wrong reason: {exc}"
        else:
            raise AssertionError(f"{kwargs} was accepted")


def test_every_split_needs_two_cases_in_every_language_the_experiment_claims():
    cases = make_cases(languages=("it",))
    cases = [case for case in cases
             if not (case["split"] == "final" and case["id"].endswith("-2"))]
    try:
        contracts.validate_case_set(cases, languages=["it"], purpose="improvement")
    except ValueError as exc:
        assert "final has 1 case(s) in it" in str(exc)
    else:
        raise AssertionError("a split with one case was accepted")

    complete = make_cases(languages=("it", "en"))
    try:
        contracts.validate_case_set(complete, languages=["it", "en", "fr"],
                                    purpose="improvement")
    except ValueError as exc:
        assert "in fr" in str(exc)
    else:
        raise AssertionError("a language with no cases at all was accepted")


def test_a_scenario_may_not_sit_in_two_splits():
    # Separation is by scenario. Sharing one would let the proposer read, in
    # development, the person the holdout is going to measure it on.
    cases = make_cases()
    cases[-1]["group_id"] = cases[0]["group_id"]
    try:
        contracts.validate_case_set(cases, languages=["it"], purpose="improvement")
    except ValueError as exc:
        assert "appears in development and final" in str(exc)
    else:
        raise AssertionError("one scenario in two splits was accepted")


def test_a_verification_has_no_development_set_and_ids_stay_unique():
    cases = make_cases()
    try:
        contracts.validate_case_set(cases, languages=["it"], purpose="verification")
    except ValueError as exc:
        assert "verification does not use these splits: development" in str(exc)
    else:
        raise AssertionError("a verification with development cases was accepted")

    duplicated = make_cases()
    duplicated[1]["id"] = duplicated[0]["id"]
    try:
        contracts.validate_case_set(duplicated, languages=["it"], purpose="improvement")
    except ValueError as exc:
        assert "unique" in str(exc)
    else:
        raise AssertionError("duplicate case ids were accepted")


def test_the_manifest_hash_covers_the_cases_it_was_built_on():
    manifest = contracts.build_manifest(payload=make_payload(), snapshot=make_snapshot(),
                                        cases=make_cases())
    assert contracts.manifest_intact(manifest)
    tampered = json.loads(json.dumps(manifest))
    tampered["cases"][0]["expected"] = "qualcos'altro"
    assert not contracts.manifest_intact(tampered)


def test_accepting_a_decision_requires_naming_the_candidate():
    try:
        contracts.DecisionRequest(action="accept", candidate_id=None,
                                  expected_hash="a" * 64, note="")
    except ValidationError as exc:
        assert "candidate_id" in str(exc)
    else:
        raise AssertionError("an acceptance with no candidate was allowed")
    assert contracts.DecisionRequest(action="reject", expected_hash="a" * 64).candidate_id is None


# --- evaluation: what is never a pass ---------------------------------------
def test_only_one_committed_json_object_is_read():
    assert evaluation.parse_json_object('{"a": 1}') == {"a": 1}
    assert evaluation.parse_json_object('```json\n{"a": 1}\n```') == {"a": 1}
    # Prose around an example object is not an answer: scanning for the first
    # brace finds the model's illustration as readily as its verdict.
    assert evaluation.parse_json_object('Ecco il verdetto: {"a": 1} spero vada bene') is None
    assert evaluation.parse_json_object("[1, 2]") is None
    assert evaluation.parse_json_object("") is None


def test_a_verdict_that_skips_a_goal_is_not_a_verdict():
    two = json.dumps({"goals": [{"ok": True}, {"ok": True}], "critical_ok": True})
    assert evaluation.parse_judgment(two, 2) is not None
    assert evaluation.parse_judgment(two, 3) is None
    assert evaluation.parse_judgment(json.dumps({"goals": [{"ok": True}]}), 1) is None
    assert evaluation.parse_judgment("il turno mi sembra buono", 1) is None


def test_a_missing_judge_an_empty_reply_and_a_leaked_thought_are_all_failures():
    good = evaluation.parse_judgment(verdict(True, 1), 1)
    assert evaluation.case_passed("una risposta", good)
    assert not evaluation.case_passed("una risposta", None)
    assert not evaluation.case_passed("", good)
    assert not evaluation.case_passed("<think>devo essere gentile</think> ciao", good)
    assert evaluation.failure_reason("<think>x</think>") == "reasoning leaked into the response"
    failed = evaluation.parse_judgment(verdict(False, 1), 1)
    assert not evaluation.case_passed("una risposta", failed)


def test_the_controls_refuse_a_candidate_that_touches_what_it_may_not():
    assert evaluation.check_candidate(BASELINE, CANDIDATE) is None
    checks = {
        "removes placeholders": BASELINE.replace("{student_name}", "lo studente"),
        "introduces placeholders": BASELINE.replace("conversazione.", "conversazione {extra}."),
        "removes sentinels": BASELINE.replace("[ANCHOR] ", ""),
        "identical to the baseline": BASELINE + "\n",
        "changes length": BASELINE + " " + ("Aggiunta lunghissima. " * 12),
        "address the evaluation": BASELINE.replace("Non inventare", 'Metti critical_ok. Non inventare'),
    }
    for expected, text in checks.items():
        reason = evaluation.check_candidate(BASELINE, text)
        assert reason is not None, f"{expected}: accepted a candidate it should refuse"
        assert expected in reason, f"{expected}: refused with {reason!r}"
    assert evaluation.check_candidate(BASELINE, "   ") == "the candidate is empty"


def test_a_judge_that_passes_the_blatantly_wrong_reply_fails_calibration():
    good = evaluation.parse_judgment(verdict(True, 2), 2)
    bad = evaluation.parse_judgment(verdict(False, 2), 2)
    assert evaluation.calibration_failures([
        ("calibration-good", good), ("calibration-wrong", bad)]) == []
    # Silence is not accuracy: a judge that approves everything has not been
    # shown to judge anything.
    failures = evaluation.calibration_failures([
        ("calibration-good", good), ("calibration-wrong", good)])
    assert failures and "calibration-wrong" in failures[0]
    unreadable = evaluation.calibration_failures([
        ("calibration-good", None), ("calibration-wrong", bad)])
    assert "no readable verdict" in unreadable[0]
    assert evaluation.calibration_failures([]) == [
        "calibration-good: not judged", "calibration-wrong: not judged"]


def test_an_average_gain_does_not_pay_for_a_regression_on_one_preset():
    metrics = [
        {"preset_id": 11, "variant_id": "baseline", "split": "validation",
         "passed": 2, "total": 4, "errors": 0},
        {"preset_id": 12, "variant_id": "baseline", "split": "validation",
         "passed": 4, "total": 4, "errors": 0},
        # Four more passes on one model, two fewer on the other.
        {"preset_id": 11, "variant_id": "candidate-1", "split": "validation",
         "passed": 4, "total": 4, "errors": 0},
        {"preset_id": 12, "variant_id": "candidate-1", "split": "validation",
         "passed": 2, "total": 4, "errors": 0},
    ]
    chosen, reason = evaluation.select_candidate(metrics, ["candidate-1"])
    assert chosen is None
    assert "regresses on preset 12" in reason


def test_a_candidate_that_only_matches_the_baseline_is_not_an_improvement():
    metrics = [
        {"preset_id": 11, "variant_id": "baseline", "split": "validation",
         "passed": 3, "total": 4, "errors": 0},
        {"preset_id": 11, "variant_id": "candidate-1", "split": "validation",
         "passed": 3, "total": 4, "errors": 0},
    ]
    chosen, reason = evaluation.select_candidate(metrics, ["candidate-1"])
    assert chosen is None
    assert "without improving it" in reason


def test_selection_prefers_more_passes_then_fewer_errors_then_the_smaller_name():
    def rows(variant, passed, errors):
        return {"preset_id": 11, "variant_id": variant, "split": "validation",
                "passed": passed, "total": 6, "errors": errors}

    metrics = [rows("baseline", 2, 0), rows("candidate-1", 4, 0), rows("candidate-2", 5, 0)]
    assert evaluation.select_candidate(metrics, ["candidate-1", "candidate-2"])[0] == "candidate-2"
    # Same numbers, both orders: the rule cannot depend on how they arrive.
    tied = [rows("baseline", 2, 0), rows("candidate-1", 4, 0), rows("candidate-2", 4, 0)]
    assert evaluation.select_candidate(tied, ["candidate-1", "candidate-2"])[0] == "candidate-1"
    assert evaluation.select_candidate(tied, ["candidate-2", "candidate-1"])[0] == "candidate-1"


def test_a_verification_report_has_nothing_to_activate():
    outcome = evaluation.decide(purpose="verification", metrics=[], goals=GOALS,
                                records=[], selected=None, completed_calls=4)
    assert outcome.eligibility == "not_applicable"
    assert outcome.selected_candidate_id is None
    blocked = evaluation.decide(purpose="improvement", metrics=[], goals=GOALS, records=[],
                                selected="candidate-1", completed_calls=4,
                                blocked="the judge failed calibration")
    assert blocked.eligibility == "inconclusive"
    assert blocked.selected_candidate_id is None


# --- storage ----------------------------------------------------------------
def test_the_lab_refuses_to_open_a_database_nobody_configured():
    # No default URL, on purpose: the one thing this must never do is fall
    # back to the application's database because a variable was forgotten.
    saved = {name: os.environ.pop(name, None)
             for name in (storage.URL_ENV, storage.URL_FILE_ENV)}
    try:
        enabled, reason = storage.availability()
        assert enabled is False
        assert storage.URL_ENV in reason
        try:
            storage.database_url()
        except storage.LabUnavailable:
            pass
        else:
            raise AssertionError("an unconfigured laboratory opened a connection")
    finally:
        for name, value in saved.items():
            if value is not None:
                os.environ[name] = value


def test_the_url_can_arrive_as_a_mounted_file():
    handle = tempfile.NamedTemporaryFile("w", suffix=".url", delete=False)
    handle.write("sqlite:///tmp/lab-from-file.sqlite\n")
    handle.close()
    saved = os.environ.pop(storage.URL_ENV, None)
    os.environ[storage.URL_FILE_ENV] = handle.name
    try:
        assert storage.database_url() == "sqlite:///tmp/lab-from-file.sqlite"
        assert storage.availability() == (True, None)
    finally:
        os.environ.pop(storage.URL_FILE_ENV, None)
        if saved is not None:
            os.environ[storage.URL_ENV] = saved
        os.unlink(handle.name)


def test_a_run_manifest_cannot_be_rewritten_once_it_is_queued():
    with lab() as factory:
        _experiment_id, run_id = seed(factory, payload=make_payload(),
                                      snapshot=make_snapshot(), cases=make_cases())
        db = factory()
        try:
            run = db.get(storage.LabRun, run_id)
            try:
                run.manifest = {"payload": {}, "snapshot": {}, "cases": []}
            except ValueError as exc:
                assert "frozen" in str(exc)
            else:
                raise AssertionError("a queued manifest was rewritten")
        finally:
            db.close()


def test_a_row_serialises_to_its_declared_columns_with_iso_dates():
    with lab() as factory:
        experiment_id, _run_id = seed(factory, payload=make_payload(),
                                      snapshot=make_snapshot(), cases=make_cases())
        db = factory()
        try:
            row = storage.serializer(db.get(storage.LabExperiment, experiment_id))
        finally:
            db.close()
    assert set(row) == {"id", "title", "purpose", "target_key", "created_by", "created_at",
                        "state", "payload", "snapshot", "cases", "candidates", "summary",
                        "error"}
    assert datetime.fromisoformat(row["created_at"]).tzinfo is not None


def test_a_queued_job_is_claimed_once_and_a_stale_one_is_closed_as_interrupted():
    with lab() as factory:
        first = seed(factory, payload=make_payload(), snapshot=make_snapshot(),
                     cases=make_cases())
        second = seed(factory, payload=make_payload(), snapshot=make_snapshot(),
                      cases=make_cases())
        engine = worker.Worker(session_factory=factory, client=FakeClient(lambda *a: ""),
                               render=render)
        # SQLite ignores SKIP LOCKED; what is checked here is that a claimed
        # job leaves the queue. The lock itself only matters on PostgreSQL.
        claimed = {engine.claim(), engine.claim()}
        assert claimed == {first[1], second[1]}
        assert engine.claim() is None

        db = factory()
        try:
            assert db.get(storage.LabRun, first[1]).state == "running"
            assert db.get(storage.LabExperiment, first[0]).state == "running"
        finally:
            db.close()

        assert engine.recover() == 2
        db = factory()
        try:
            run = db.get(storage.LabRun, first[1])
            assert run.state == "interrupted"
            assert run.finished_at is not None
            # Re-runnable, and honest about why: no invisible continuation.
            assert db.get(storage.LabExperiment, first[0]).state == "ready"
        finally:
            db.close()


# --- worker: preparing cases ------------------------------------------------
def test_preparing_writes_two_cases_per_split_per_language_and_stops_for_review():
    def designer(_index, _preset, system, user):
        assert "invent practice material" in system
        language = "en" if 'language "en"' in system else "it"
        return json.dumps({"cases": [
            {"message": f"messaggio {language} {number} {user.split(chr(10))[1]}",
             "history": [{"role": "user", "content": "storia"}],
             "expected": "risponde senza inventare punteggi"}
            for number in (1, 2)]})

    with lab() as factory:
        payload = make_payload(languages=("it", "en"))
        experiment_id, run_id = seed(factory, payload=payload, snapshot=make_snapshot(),
                                     cases=[], kind="prepare", state="draft")
        client, state = run_worker(factory, run_id, designer)
        assert state == "completed", state
        experiment, run, _results = fetch(factory, experiment_id, run_id)

    # Two languages, three splits, two cases each.
    assert len(experiment["cases"]) == 12
    assert experiment["state"] == "ready"
    assert run["summary"]["cases"] == 12
    assert len(client.calls) == 6
    contracts.validate_case_set(experiment["cases"], languages=["it", "en"],
                                purpose="improvement")


def test_preparing_stores_nothing_when_it_is_interrupted():
    def cancelling(index, _preset, _system, _user):
        if index == 1:
            state["cancel"]()
        return json.dumps({"cases": [
            {"message": f"m{number}", "expected": "e", "history": []} for number in (1, 2)]})

    state: dict = {}
    with lab() as factory:
        experiment_id, run_id = seed(factory, payload=make_payload(), snapshot=make_snapshot(),
                                     cases=[], kind="prepare", state="draft")

        def cancel():
            db = factory()
            try:
                db.get(storage.LabRun, run_id).cancel_requested = True
                db.commit()
            finally:
                db.close()

        state["cancel"] = cancel
        _client, run_state = run_worker(factory, run_id, cancelling)
        experiment, run, _results = fetch(factory, experiment_id, run_id)

    assert run_state == "cancelled"
    assert run["state"] == "cancelled"
    assert experiment["cases"] == []
    # Back to draft: `ready` would claim a reviewed set exists.
    assert experiment["state"] == "draft"


def test_a_designer_that_returns_prose_fails_the_preparation():
    with lab() as factory:
        experiment_id, run_id = seed(factory, payload=make_payload(), snapshot=make_snapshot(),
                                     cases=[], kind="prepare", state="draft")
        _client, state = run_worker(factory, run_id, lambda *a: "ecco alcuni casi utili")
        experiment, run, _results = fetch(factory, experiment_id, run_id)
    assert state == "failed"
    assert "no readable cases" in run["error"]
    assert experiment["cases"] == []


# --- worker: evaluating -----------------------------------------------------
def test_an_improvement_run_selects_a_candidate_and_reports_it_eligible():
    with lab() as factory:
        experiment_id, run_id = seed(factory, payload=make_payload(), snapshot=make_snapshot(),
                                     cases=make_cases())
        client, state = run_worker(factory, run_id, improvement_responder)
        experiment, run, results = fetch(factory, experiment_id, run_id)

    assert state == "completed", run["error"]
    summary = experiment["summary"]
    assert summary["eligibility"] == "eligible", summary["reason"]
    assert summary["selected_candidate_id"] == "candidate-1"
    assert summary["completed_calls"] == len(client.calls)
    assert experiment["state"] == "completed"
    assert experiment["candidates"][0]["text"] == CANDIDATE

    # Validation repeats both arms twice;
    # the final check repeats both arms.
    validation = [row for row in results if row["case_id"].startswith("case-validation")]
    assert sum(1 for row in validation if row["variant_id"] == "baseline") == 4
    assert sum(1 for row in validation if row["variant_id"] == "candidate-1") == 4
    final = [row for row in results if row["case_id"].startswith("case-final")]
    assert sum(1 for row in final if row["variant_id"] == "baseline") == 4
    assert sum(1 for row in final if row["variant_id"] == "candidate-1") == 4
    assert all(row["envelope"]["system_prompt_final"] for row in results)
    assert {row["split"] for row in summary["metrics"]} == {"validation", "final"}
    assert summary["goals"][0]["text"] == GOALS[0]["text"]


def test_the_proposer_reads_the_development_cases_and_nothing_else():
    with lab() as factory:
        _experiment_id, run_id = seed(factory, payload=make_payload(), snapshot=make_snapshot(),
                                      cases=make_cases())
        client, _state = run_worker(factory, run_id, improvement_responder)

    proposals = client.proposing()
    assert len(proposals) == 1
    asked = proposals[0]["user"]
    assert "messaggio development it 1" in asked
    # The holdout never reaches the search that will be measured on it.
    assert "messaggio validation" not in asked
    assert "messaggio final" not in asked


def test_the_judge_never_generates_and_the_tested_models_never_judge():
    with lab() as factory:
        _experiment_id, run_id = seed(factory, payload=make_payload(tested=(11, 12)),
                                      snapshot=make_snapshot(tested=(11, 12)),
                                      cases=make_cases())
        client, state = run_worker(factory, run_id, improvement_responder)

    assert state == "completed"
    assert {call["preset_id"] for call in client.judging()} == {3}
    assert {call["preset_id"] for call in client.generating()} == {11, 12}
    assert {call["preset_id"] for call in client.proposing()} == {2}
    # The judge is never told which arm produced the text it reads.
    assert all("candidate-1" not in call["user"] and "baseline" not in call["user"]
               for call in client.judging())


def test_a_verification_runs_every_tested_model_and_proposes_nothing():
    def responder(_index, _preset, system, user):
        if evaluation.JUDGE_MARKER in system:
            return calibrated(user) or verdict(True, len(GOALS))
        return "una risposta qualsiasi"

    with lab() as factory:
        payload = make_payload(purpose="verification", tested=(11, 12))
        cases = make_cases(purpose="verification")
        experiment_id, run_id = seed(factory, payload=payload,
                                     snapshot=make_snapshot(tested=(11, 12), proposer=False),
                                     cases=cases)
        client, state = run_worker(factory, run_id, responder)
        experiment, _run, results = fetch(factory, experiment_id, run_id)

    assert state == "completed"
    assert client.proposing() == []
    assert experiment["candidates"] == []
    assert experiment["summary"]["eligibility"] == "not_applicable"
    assert experiment["summary"]["selected_candidate_id"] is None
    assert {row["variant_id"] for row in results} == {"baseline"}
    # Four cases, two presets, one run each.
    assert len(results) == 8
    assert {row["preset_id"] for row in results} == {11, 12}


def test_a_failed_generation_is_recorded_and_never_counted_as_a_pass():
    def flaky(_index, preset, system, user):
        if evaluation.JUDGE_MARKER in system:
            return calibrated(user) or verdict(True, len(GOALS))
        if "propose a SMALL edit" in system:
            return json.dumps({"candidates": [{"text": CANDIDATE, "reason": "r",
                                               "expected": "e"}]})
        if system == BASELINE:
            return ModelError("the gateway refused the request (400)")
        return "risposta candidata"

    with lab() as factory:
        experiment_id, run_id = seed(factory, payload=make_payload(), snapshot=make_snapshot(),
                                     cases=make_cases())
        _client, state = run_worker(factory, run_id, flaky)
        experiment, _run, results = fetch(factory, experiment_id, run_id)

    assert state == "completed"
    broken = [row for row in results if row["variant_id"] == "baseline"]
    assert broken and all(row["error"] for row in broken)
    assert all(row["judgment"] is None for row in broken)
    # The failures stay in the denominator: a shrinking denominator is how a
    # broken arm starts looking like a good one.
    baseline_metrics = [row for row in experiment["summary"]["metrics"]
                        if row["variant_id"] == "baseline"]
    assert baseline_metrics
    for row in baseline_metrics:
        assert row["passed"] == 0
        assert row["errors"] == row["total"]


def test_a_reply_that_leaks_its_reasoning_is_not_judged_and_does_not_pass():
    def leaking(_index, _preset, system, user):
        if evaluation.JUDGE_MARKER in system:
            return calibrated(user) or verdict(True, len(GOALS))
        if "propose a SMALL edit" in system:
            return json.dumps({"candidates": [{"text": CANDIDATE, "reason": "r",
                                               "expected": "e"}]})
        return "<think>devo lodarlo</think> Bravo!" if system == BASELINE else "risposta candidata"

    with lab() as factory:
        experiment_id, run_id = seed(factory, payload=make_payload(), snapshot=make_snapshot(),
                                     cases=make_cases())
        client, state = run_worker(factory, run_id, leaking)
        experiment, _run, results = fetch(factory, experiment_id, run_id)

    assert state == "completed"
    leaked = [row for row in results if row["variant_id"] == "baseline"]
    assert all(row["error"] == "reasoning leaked into the response" for row in leaked)
    # A response nobody may show is never sent to the judge either.
    assert all("devo lodarlo" not in call["user"] for call in client.judging())
    assert [row for row in experiment["summary"]["metrics"]
            if row["variant_id"] == "baseline"][0]["passed"] == 0


def test_a_judge_that_fails_calibration_blocks_the_whole_report():
    def credulous(_index, _preset, system, user):
        if evaluation.JUDGE_MARKER in system:
            # Approves the blatantly wrong reply too.
            count = (len(evaluation.CALIBRATION_GOALS)
                     if calibrated(user) is not None else len(GOALS))
            return verdict(True, count)
        if "propose a SMALL edit" in system:
            return json.dumps({"candidates": [{"text": CANDIDATE, "reason": "r",
                                               "expected": "e"}]})
        return "una risposta"

    with lab() as factory:
        experiment_id, run_id = seed(factory, payload=make_payload(), snapshot=make_snapshot(),
                                     cases=make_cases())
        client, state = run_worker(factory, run_id, credulous)
        experiment, _run, results = fetch(factory, experiment_id, run_id)

    assert state == "completed"
    assert experiment["summary"]["eligibility"] == "inconclusive"
    assert "failed calibration" in experiment["summary"]["reason"]
    assert experiment["summary"]["selected_candidate_id"] is None
    # Calibration comes first: nothing was measured against an unproven judge.
    assert results == []
    assert client.proposing() == []


def test_a_proposal_that_breaks_the_controls_never_runs():
    def wrecker(_index, _preset, system, user):
        if evaluation.JUDGE_MARKER in system:
            return calibrated(user) or verdict(True, len(GOALS))
        if "propose a SMALL edit" in system:
            return json.dumps({"candidates": [
                {"text": BASELINE.replace("{student_name}", "lo studente"),
                 "reason": "piu' naturale", "expected": "meglio"}]})
        return "una risposta"

    with lab() as factory:
        experiment_id, run_id = seed(factory, payload=make_payload(), snapshot=make_snapshot(),
                                     cases=make_cases())
        _client, state = run_worker(factory, run_id, wrecker)
        experiment, run, results = fetch(factory, experiment_id, run_id)

    assert state == "completed"
    assert experiment["candidates"] == []
    assert experiment["summary"]["eligibility"] == "not_eligible"
    assert "removes placeholders" in experiment["summary"]["reason"]
    assert run["summary"]["rejected_candidates"][0]["id"] == "candidate-1"
    assert results == []


def test_a_run_that_hits_its_call_ceiling_keeps_its_results_and_cannot_be_activated():
    with lab() as factory:
        # Two calibration calls, one proposal, then one trial and a half.
        payload = make_payload(max_calls=5)
        experiment_id, run_id = seed(factory, payload=payload, snapshot=make_snapshot(),
                                     cases=make_cases())
        client, state = run_worker(factory, run_id, improvement_responder)
        experiment, run, results = fetch(factory, experiment_id, run_id)

    assert state == "budget_exceeded"
    assert run["state"] == "budget_exceeded"
    assert len(client.calls) == 5
    assert run["calls"] == 5
    assert len(results) == 1
    # An incomplete trial is never something an administrator may activate.
    assert experiment["summary"]["eligibility"] == "inconclusive"
    assert "ceiling of 5 calls" in experiment["summary"]["reason"]
    assert experiment["state"] == "ready"


def test_cancelling_stops_the_run_before_the_next_call():
    calls: dict = {}

    def responder(index, _preset, system, user):
        if index == 2:
            calls["cancel"]()
        if evaluation.JUDGE_MARKER in system:
            return calibrated(user) or verdict(True, len(GOALS))
        if "propose a SMALL edit" in system:
            return json.dumps({"candidates": [{"text": CANDIDATE, "reason": "r",
                                               "expected": "e"}]})
        return "una risposta"

    with lab() as factory:
        experiment_id, run_id = seed(factory, payload=make_payload(), snapshot=make_snapshot(),
                                     cases=make_cases())

        def cancel():
            db = factory()
            try:
                db.get(storage.LabRun, run_id).cancel_requested = True
                db.commit()
            finally:
                db.close()

        calls["cancel"] = cancel
        client, state = run_worker(factory, run_id, responder)
        experiment, run, results = fetch(factory, experiment_id, run_id)

    assert state == "cancelled"
    # The flag is read before the call, so the second one is the last.
    assert len(client.calls) == 2
    assert results == []
    assert experiment["summary"]["eligibility"] == "inconclusive"
    assert "interrupted" in run["error"]
    assert experiment["state"] == "ready"


def test_a_run_whose_manifest_was_tampered_with_never_starts():
    with lab() as factory:
        experiment_id, run_id = seed(factory, payload=make_payload(), snapshot=make_snapshot(),
                                     cases=make_cases())
        db = factory()
        try:
            run = db.get(storage.LabRun, run_id)
            manifest = json.loads(json.dumps(run.manifest))
            manifest["payload"]["max_calls"] = 1
            # Bypasses the ORM guard the way a direct write would.
            db.query(storage.LabRun).filter(storage.LabRun.id == run_id).update(
                {"manifest": manifest})
            db.commit()
        finally:
            db.close()
        client, state = run_worker(factory, run_id, improvement_responder)
        _experiment, run_row, _results = fetch(factory, experiment_id, run_id)

    assert state == "failed"
    assert client.calls == []
    assert "does not match its own hash" in run_row["error"]


def test_one_retry_and_only_for_a_transient_failure():
    attempts: dict = {"count": 0}

    def flaky(_index, _preset, system, user):
        if evaluation.JUDGE_MARKER in system and calibrated(user) is None:
            attempts["count"] += 1
            if attempts["count"] == 1:
                return ModelError("gateway timed out after 30s", transient=True)
        if evaluation.JUDGE_MARKER in system:
            return calibrated(user) or verdict(True, len(GOALS))
        if "propose a SMALL edit" in system:
            return json.dumps({"candidates": [{"text": CANDIDATE, "reason": "r",
                                               "expected": "e"}]})
        return "una risposta"

    with lab() as factory:
        _experiment_id, run_id = seed(factory, payload=make_payload(), snapshot=make_snapshot(),
                                      cases=make_cases())
        _client, state = run_worker(factory, run_id, flaky)
        db = factory()
        try:
            rows = db.query(storage.LabResult).filter(
                storage.LabResult.run_id == run_id).all()
            recovered = [row for row in rows if row.error is None]
        finally:
            db.close()

    assert state == "completed"
    # The timeout was retried once and the trial produced a judgment.
    assert attempts["count"] >= 2
    assert recovered


# --- the client -------------------------------------------------------------
def test_the_client_runs_only_local_presets_and_never_returns_thinking():
    client = LocalModels(base_url="http://gateway.invalid")
    for bad in ({"provider": "openai", "model": "gpt-4"}, {"provider": "ollama", "model": ""}):
        try:
            client.chat(bad, "system", "user")
        except UnsupportedPreset:
            pass
        else:
            raise AssertionError(f"{bad} was accepted")

    from backend.prompt_lab.local_models import strip_thinking

    assert strip_thinking("<think>piano</think>Ciao") == "Ciao"
    assert strip_thinking("Ciao <think>piano senza chiusura") == "Ciao"
    assert strip_thinking("piano interrotto</think>Ciao") == "Ciao"
    assert strip_thinking("") == ""


if __name__ == "__main__":
    import sys
    import traceback

    failures = 0
    for name, fn in sorted(globals().items()):
        if not name.startswith("test_") or not callable(fn):
            continue
        try:
            fn()
        except Exception as exc:  # pragma: no cover - manual path
            failures += 1
            print(f"FAIL {name}: {exc}")
            traceback.print_exc()
    print("OK: test_prompt_lab_engine" if not failures else f"{failures} test falliti")
    sys.exit(1 if failures else 0)
