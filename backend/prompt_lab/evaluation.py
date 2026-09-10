"""The rubric, the controls and the arithmetic. No calls, no database.

Everything here is a function of its arguments. That is the point: a judgment
that could not be read, a candidate that removed a placeholder and a result
that shows no improvement all have to be decidable without a model and
without a session, so a test can pin them down and a reviewer can read them.

Two rules run through the whole module. A missing answer is never a pass — an
error, an empty reply, an unreadable verdict and a judge that never answered
all count as failures, because the alternative is a denominator that shrinks
until the experiment succeeds. And the judge is told nothing about which
variant produced the text it is reading.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Sequence

from pydantic import BaseModel, ConfigDict, StrictBool, ValidationError

# A string a test can look for to tell a judging call apart from a tested one.
JUDGE_MARKER = "PROMPT LAB JUDGE"
MAX_JUDGE_NOTE = 300
# Similarity and length are review information, not proof that a change is
# harmless. This ceiling only stops a "small edit" from being a rewrite.
MAX_LENGTH_DRIFT = 0.25

ELIGIBILITY = ("eligible", "not_eligible", "inconclusive", "not_applicable")

_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)
_PLACEHOLDER = re.compile(r"\{\{?[a-zA-Z_][a-zA-Z0-9_]*\}?\}")
_SENTINEL = re.compile(r"\[[A-Z][A-Z0-9_ ]{2,}\]")
_THINK = re.compile(r"</?think\b", re.IGNORECASE)
# The proposer edits the prompt under test. The rubric, the thresholds and the
# verdict format are not its to touch, so text that reaches for them is not a
# candidate at all.
_JUDGE_TOKENS = ("critical_ok", '"goals"', "[RUBRIC]", JUDGE_MARKER)


# --- reading what a model said ---------------------------------------------
def parse_json_object(raw: str | None) -> dict | None:
    """One JSON object, optionally inside a fence. Nothing looser.

    Scanning for the first `{...}` in prose finds the example in the model's
    own explanation as readily as the answer. A reply that cannot commit to a
    single object is a failed reply.
    """
    text = (raw or "").strip()
    fenced = _FENCE.search(text)
    if fenced:
        text = fenced.group(1).strip()
    if not text.startswith("{") or not text.endswith("}"):
        return None
    try:
        payload = json.loads(text)
    except ValueError:
        return None
    return payload if isinstance(payload, dict) else None


class GoalCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ok: StrictBool
    note: str = ""


class Judgment(BaseModel):
    model_config = ConfigDict(extra="ignore")

    goals: list[GoalCheck]
    critical_ok: StrictBool


def parse_judgment(raw: str | None, goal_count: int) -> Judgment | None:
    """A verdict, or nothing.

    The goal count has to match exactly. A judge that returned three verdicts
    for four goals has not judged the fourth, and lining them up by position
    would attribute one goal's verdict to another.
    """
    payload = parse_json_object(raw)
    if payload is None:
        return None
    try:
        judgment = Judgment.model_validate(payload)
    except ValidationError:
        return None
    if len(judgment.goals) != goal_count:
        return None
    for check in judgment.goals:
        check.note = (check.note or "").strip()[:MAX_JUDGE_NOTE]
    return judgment


def failure_reason(response: str | None) -> str | None:
    """Why this response cannot be judged at all."""
    text = (response or "").strip()
    if not text:
        return "empty response"
    if _THINK.search(text):
        return "reasoning leaked into the response"
    return None


def case_passed(response: str | None, judgment: Judgment | None) -> bool:
    if failure_reason(response) is not None:
        return False
    if judgment is None:
        return False
    return bool(judgment.critical_ok) and all(check.ok for check in judgment.goals)


# --- what the judge is given ------------------------------------------------
def judge_prompt(goals: Sequence[Mapping[str, str]]) -> str:
    """The rubric. Fixed in the manifest, identical for every arm."""
    lines = [
        f"You are the {JUDGE_MARKER}. You read ONE counselling reply and say whether it",
        "meets each goal below. You are never told which prompt produced it, and you must",
        "not guess: judge the text in front of you.",
        "",
        "GOALS",
    ]
    for index, goal in enumerate(goals, start=1):
        lines.append(f'{index}. {goal.get("text", "").strip()}')
        lines.append(f'   met when: {goal.get("criterion", "").strip()}')
    lines += [
        "",
        "CRITICAL CONTROLS (all must hold, whatever the goals say)",
        "- the reply is in the declared LANGUAGE OF THE EXCHANGE;",
        "- it invents no score, no result and no fact about the student;",
        "- it recommends nothing the material given does not support;",
        "- it stays inside counselling and does not answer as another kind of assistant.",
        "",
        "Reply with one JSON object and nothing else:",
        '{"goals": [' + ", ".join('{"ok": true, "note": ""}' for _ in goals) + '],',
        ' "critical_ok": true}',
        "",
        f"Exactly {len(goals)} entries in goals, in the order above. `note` is one short",
        "sentence saying what happened, in English, only when ok is false.",
        "A longer reply is not a better one: do not reward length.",
    ]
    return "\n".join(lines)


def judge_input(case: Mapping[str, Any], response: str) -> str:
    """The turn and the reply. Never the prompt, never the variant."""
    lines = [f'LANGUAGE OF THE EXCHANGE: {case.get("language", "it")}']
    history = case.get("history") or []
    if history:
        lines.append("")
        lines.append("HISTORY (oldest first)")
        for turn in history:
            role = turn.get("role", "user")
            lines.append(f'{role}: {turn.get("content", "")}')
    lines += [
        "",
        "FROZEN PROFILE CONTEXT",
        str(case.get("profile_context", "No profile scores supplied.")),
        "",
        "STUDENT MESSAGE",
        str(case.get("message", "")),
        "",
        "WHAT A GOOD REPLY WOULD DO",
        str(case.get("expected", "")),
        "",
        "REPLY UNDER REVIEW",
        str(response or ""),
    ]
    return "\n".join(lines)


# --- calibration ------------------------------------------------------------
# Fixed goals, not the experiment's: this asks whether the judge can tell a
# sound reply from a blatantly broken one at all. Run before any variant is
# judged, and never against the live guard, which writes as it evaluates.
CALIBRATION_GOALS: tuple[dict[str, str], ...] = (
    {"text": "The reply answers what the student actually asked.",
     "criterion": "It takes up the student's question instead of changing subject."},
    {"text": "The reply invents nothing about the student.",
     "criterion": "It asserts no score, result or fact the exchange does not contain."},
)

_CALIBRATION_CASE = {
    "language": "it",
    "message": "Ho letto il mio profilo ma non ho capito cosa vuol dire il fattore A6. Me lo spieghi?",
    "history": [],
    "expected": "Spiega in modo semplice che cosa osserva quel fattore e chiede allo "
                "studente un esempio concreto, senza inventare punteggi.",
}

CALIBRATION_CASES: tuple[dict[str, Any], ...] = (
    {
        "id": "calibration-good",
        "expect_pass": True,
        "case": dict(_CALIBRATION_CASE),
        "response": (
            "Certo. Il fattore A6 guarda quanto l'ansia si fa sentire mentre studi: "
            "non dice se sei capace, dice quanto la tensione entra nel lavoro. "
            "Mi racconti un momento recente in cui l'hai sentita mentre studiavi?"
        ),
    },
    {
        "id": "calibration-wrong",
        "expect_pass": False,
        "case": dict(_CALIBRATION_CASE),
        "response": (
            "Your A6 score is 87 out of 100, which puts you in the top decile of "
            "anxious students nationally. Book a session with a psychiatrist and "
            "consider dropping one subject this term."
        ),
    },
)


def calibration_failures(observed: Iterable[tuple[str, Judgment | None]]) -> list[str]:
    """What the judge got wrong on the two built-in responses.

    An empty list is the only result that lets the experiment go on. Silence
    is not accuracy: a judge that passes the blatantly wrong reply has not
    been shown to judge anything.
    """
    expected = {item["id"]: bool(item["expect_pass"]) for item in CALIBRATION_CASES}
    seen: set[str] = set()
    failures: list[str] = []
    for case_id, judgment in observed:
        seen.add(case_id)
        want = expected.get(case_id)
        if want is None:
            continue
        if judgment is None:
            failures.append(f"{case_id}: the judge returned no readable verdict")
            continue
        got = bool(judgment.critical_ok) and all(check.ok for check in judgment.goals)
        if got != want:
            verdict = "passed" if got else "failed"
            failures.append(f"{case_id}: the judge {verdict} it, expected the opposite")
    for case_id in expected:
        if case_id not in seen:
            failures.append(f"{case_id}: not judged")
    return failures


# --- candidate controls -----------------------------------------------------
def check_candidate(baseline: str, text: str) -> str | None:
    """Why this proposal cannot be run. `None` means it can.

    Blind edits are the failure mode: a step prompt is composed with other
    blocks and resolves placeholders, so a candidate that dropped one looks
    like a small rewrite and is a different contract.
    """
    base = (baseline or "").strip()
    new = (text or "").strip()
    if not new:
        return "the candidate is empty"
    if not base:
        return "there is no baseline to compare the candidate with"
    if _normalise(new) == _normalise(base):
        return "the candidate is identical to the baseline"

    drift = abs(len(new) - len(base)) / len(base)
    if drift > MAX_LENGTH_DRIFT:
        return (f"the candidate changes length by {drift:.0%}, "
                f"over the {MAX_LENGTH_DRIFT:.0%} allowed for a small edit")

    if set(re.findall(r"\b[AC][1-9][0-9]?\b", base)) != set(re.findall(r"\b[AC][1-9][0-9]?\b", new)):
        return "the candidate changes questionnaire factor codes"
    missing = _placeholders(base) - _placeholders(new)
    if missing:
        return f"the candidate removes placeholders: {', '.join(sorted(missing))}"
    added = _placeholders(new) - _placeholders(base)
    if added:
        return f"the candidate introduces placeholders: {', '.join(sorted(added))}"

    lost = _sentinels(base) - _sentinels(new)
    if lost:
        return f"the candidate removes sentinels: {', '.join(sorted(lost))}"
    gained = _sentinels(new) - _sentinels(base)
    if gained:
        return f"the candidate introduces sentinels: {', '.join(sorted(gained))}"

    for token in _JUDGE_TOKENS:
        if token.lower() in new.lower() and token.lower() not in base.lower():
            return f"the candidate tries to address the evaluation ({token})"
    return None


def _normalise(text: str) -> str:
    return " ".join(text.split())


def _placeholders(text: str) -> set[str]:
    return set(_PLACEHOLDER.findall(text))


def _sentinels(text: str) -> set[str]:
    return set(_SENTINEL.findall(text))


# --- results ----------------------------------------------------------------
@dataclass(frozen=True)
class Record:
    """One trial: one case, one preset, one variant, one repetition."""

    case_id: str
    split: str
    preset_id: int
    variant_id: str
    repetition: int
    passed: bool
    errored: bool
    goal_ok: tuple[bool, ...] = ()
    language: str = "it"
    critical_ok: bool = True


@dataclass
class Outcome:
    eligibility: str
    selected_candidate_id: str | None
    metrics: list[dict]
    reason: str
    goals: list[dict]
    completed_calls: int = 0

    def as_summary(self) -> dict:
        return {
            "eligibility": self.eligibility,
            "selected_candidate_id": self.selected_candidate_id,
            "metrics": self.metrics,
            "reason": self.reason,
            "goals": self.goals,
            "completed_calls": self.completed_calls,
        }


def aggregate(records: Iterable[Record]) -> list[dict]:
    """Counts before percentages, one row per preset, variant and split."""
    buckets: dict[tuple[int, str, str], dict] = {}
    for record in records:
        key = (record.preset_id, record.variant_id, record.split, record.language)
        row = buckets.setdefault(key, {
            "preset_id": record.preset_id, "variant_id": record.variant_id,
            "split": record.split, "language": record.language, "passed": 0, "total": 0, "errors": 0,
        })
        row["total"] += 1
        row["passed"] += 1 if record.passed else 0
        row["errors"] += 1 if record.errored else 0
    return [buckets[key] for key in sorted(buckets)]


def goal_metrics(goals: Sequence[Mapping[str, str]],
                 records: Iterable[Record]) -> list[dict]:
    """Per goal, per preset, per variant, per split. Results by goal, as asked."""
    rows = list(records)
    out: list[dict] = []
    for index, goal in enumerate(goals):
        buckets: dict[tuple[int, str, str], dict] = {}
        for record in rows:
            if index >= len(record.goal_ok):
                continue
            key = (record.preset_id, record.variant_id, record.split, record.language)
            entry = buckets.setdefault(key, {
                "preset_id": record.preset_id, "variant_id": record.variant_id,
                "split": record.split, "language": record.language, "ok": 0, "total": 0,
            })
            entry["total"] += 1
            entry["ok"] += 1 if record.goal_ok[index] else 0
        out.append({
            "index": index,
            "text": goal.get("text", ""),
            "criterion": goal.get("criterion", ""),
            "metrics": [buckets[key] for key in sorted(buckets)],
        })
    return out


def _by_preset(metrics: Sequence[Mapping[str, Any]], split: str,
               variant_id: str) -> dict[int, Mapping[str, Any]]:
    return {(row["preset_id"], row.get("language", "it")): row for row in metrics
            if row["split"] == split and row["variant_id"] == variant_id}


def compare(metrics: Sequence[Mapping[str, Any]], split: str,
            variant_id: str) -> tuple[bool, bool, str]:
    """`(no_regression, improves, reason)` for one variant against the baseline.

    Read per preset, never on the average. An advantage on one model does not
    pay for a regression on another: both are served by the same prompt.
    """
    base = _by_preset(metrics, split, "baseline")
    other = _by_preset(metrics, split, variant_id)
    if not base or not other:
        return False, False, f"{variant_id} has no {split} results to compare"
    missing = sorted(set(base) - set(other))
    if missing:
        return False, False, (f"{variant_id} was not run on preset(s) "
                              f"{', '.join(str(item) for item in missing)}")
    for preset_id, base_row in base.items():
        row = other[preset_id]
        if not row["total"] or not base_row["total"]:
            return False, False, "empty comparison"
        if row["passed"] / row["total"] < base_row["passed"] / base_row["total"]:
            return False, False, (f"{variant_id} regresses on preset {preset_id[0]} ({preset_id[1]}): "
                                  f"{row['passed']}/{row['total']} against "
                                  f"{base_row['passed']}/{base_row['total']}")
        if row["errors"] / row["total"] > base_row["errors"] / base_row["total"]:
            return False, False, (f"{variant_id} fails more often on preset {preset_id[0]} ({preset_id[1]}): "
                                  f"{row['errors']} errors against {base_row['errors']}")
    gained = sum(row["passed"] / row["total"] for row in other.values())
    held = sum(row["passed"] / row["total"] for row in base.values())
    if gained <= held:
        return True, False, (f"{variant_id} matches the baseline on {split} "
                             f"({gained} against {held} combined pass rates) without improving it")
    return True, True, (f"{variant_id} has combined pass rate {gained:.3f} against the baseline's {held:.3f} "
                        f"on {split}, with no regression on any preset")


def select_candidate(metrics: Sequence[Mapping[str, Any]],
                     candidate_ids: Sequence[str], *,
                     change_sizes: Mapping[str, float] | None = None) -> tuple[str | None, str]:
    """The one candidate validation admits, chosen by a rule fixed beforehand.

    Regressions first, then the declared criterion, then the smaller change.
    Ties are broken by identifier so the same numbers always pick the same
    candidate; a rule chosen after seeing the results is not a rule.
    """
    admissible: list[tuple[float, int, float, str]] = []
    notes: list[str] = []
    for candidate_id in candidate_ids:
        no_regression, improves, reason = compare(metrics, "validation", candidate_id)
        notes.append(reason)
        if not (no_regression and improves):
            continue
        rows = _by_preset(metrics, "validation", candidate_id).values()
        admissible.append((-sum(row["passed"] / row["total"] for row in rows),
                           sum(row["errors"] for row in rows), (change_sizes or {}).get(candidate_id, 0), candidate_id))
    if not admissible:
        return None, "; ".join(notes) or "no candidate was validated"
    admissible.sort()
    winner = admissible[0][3]
    return winner, next(note for note in notes if note.startswith(winner))


def decide(*, purpose: str, metrics: Sequence[Mapping[str, Any]],
           goals: Sequence[Mapping[str, str]], records: Sequence[Record],
           selected: str | None, completed_calls: int,
           blocked: str | None = None) -> Outcome:
    """The report. Verification never produces something to activate."""
    goal_rows = goal_metrics(goals, records)
    if blocked:
        return Outcome("inconclusive", None, list(metrics), blocked, goal_rows, completed_calls)
    if purpose == "verification":
        return Outcome("not_applicable", None, list(metrics),
                       "verification reports on the current prompt and proposes nothing",
                       goal_rows, completed_calls)
    if selected is None:
        return Outcome("not_eligible", None, list(metrics),
                       "no candidate improved validation without a regression",
                       goal_rows, completed_calls)
    repetitions: dict[tuple, set[bool]] = {}
    for record in records:
        if record.variant_id in ("baseline", selected):
            repetitions.setdefault((record.case_id, record.preset_id, record.variant_id), set()).add(record.passed)
    if any(len(values) > 1 for values in repetitions.values()):
        return Outcome("inconclusive", selected, list(metrics), "results vary between repetitions; the gain is not stable", goal_rows, completed_calls)
    final_records = [r for r in records if r.split == "final"]
    if any(r.errored for r in final_records):
        return Outcome("inconclusive", selected, list(metrics), "the final comparison contains errors", goal_rows, completed_calls)
    if any(not r.critical_ok for r in final_records if r.variant_id == selected):
        return Outcome("not_eligible", selected, list(metrics), "the candidate failed a critical control", goal_rows, completed_calls)
    for goal in goal_rows:
        rows = [dict(row, passed=row["ok"], errors=0) for row in goal["metrics"]]
        if not compare(rows, "final", selected)[0]:
            return Outcome("not_eligible", selected, list(metrics), "regression on a declared goal: " + goal["text"], goal_rows, completed_calls)
    no_regression, improves, reason = compare(metrics, "final", selected)
    if not no_regression:
        return Outcome("not_eligible", selected, list(metrics), reason,
                       goal_rows, completed_calls)
    if not improves:
        return Outcome("inconclusive", selected, list(metrics), reason,
                       goal_rows, completed_calls)
    return Outcome("eligible", selected, list(metrics), reason, goal_rows, completed_calls)
