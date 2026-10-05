"""Fixed, synthetic before/after context evaluation; never activates settings.

Uses the Prompt Lab model client and blinded rubric. The database must be an
empty PostgreSQL database ending in _test, on loopback. No operational data,
credentials or prompt overrides are imported.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from .. import models, prompt_config
from ..api_models import ChatRequest
from ..chat_preparation import prepare_chat_turn
from ..model_context import DEFAULT_CONTEXT_LEVELS, context_profile, fit_context
from ..prompt_factory_alignment import STEP_LIST_NAMES
from . import evaluation
from .local_models import LocalModels

GOALS = (
    {"text": "Stay within the current step.", "criterion": "The answer addresses the declared step and does not anticipate another phase."},
    {"text": "Invent no student data.", "criterion": "No scores, biographical facts or decisions absent from the supplied material are asserted."},
)


def fixed_steps(steps):
    """Exactly the same intro, middle and closing step per instrument each run."""
    groups = {}
    for step in steps:
        groups.setdefault(step.questionnaire_type, []).append(step)
    result = []
    for instrument, group in sorted(groups.items()):
        group.sort(key=lambda row: (row.sort_order, row.id))
        indexes = sorted({0, len(group) // 2, len(group) - 1})
        result.extend(group[index] for index in indexes)
    return result


def render_case(db, step):
    cfg = {row.key: row.value for row in db.query(models.Config).all()}
    ai = SimpleNamespace(config=cfg)
    request = ChatRequest(message="", use_phase_prompt=True, phase=step.id,
                          mode=step.system_prompt_mode, questionnaire_type=step.questionnaire_type,
                          language="it", response_length="short", max_tokens=500)
    prepared = prepare_chat_turn(db, ai, request, "context-eval-synthetic", {"username": ""},
                                 c_persona="Ask one precise question based on the available evidence.",
                                 include_retrieval=False, include_history=False, create_anonymous_code=False,
                                 allow_generation=False, retrieval_context={
                                     "knowledge_context": "[SOURCE 1] Synthetic study note\nPlanning breaks can help maintain attention.\n\n[SOURCE 2] Synthetic reflection note\nReview what changed after trying a strategy.",
                                     "skills_blocks": {},
                                 }, journey_override="The student said they study in the afternoon and want to organize their time. No questionnaire scores were supplied.")
    history = [{"role": role, "content": text} for _ in range(6) for role, text in (
        ("user", "Studio nel pomeriggio e voglio organizzare il mio tempo."),
        ("assistant", "Quale momento del pomeriggio vuoi osservare?"),
    )]
    return {"instrument": step.questionnaire_type, "step": step.id, "language": "it",
            "expected": step.prompt, "message": prepared.full_message,
            "profile_context": "No scores supplied. The student studies in the afternoon and wants to organize their time.",
            "system": prepared.system_prompt_final, "history": history,
            "context_data": ai.context_data, "max_tokens": prepared.max_tokens or 500}


def compare(cases, model_names, client=None, *, max_seconds=600):
    """Missing/failed replies and invalid verdicts remain failures in the denominator."""
    client = client or LocalModels()
    digests = client.digests()
    if any(name not in digests or "cloud" in name.lower() for name in model_names):
        raise ValueError("Every selected model must have verified local weights.")
    digests = {name: digests[name] for name in model_names}
    deadline = time.monotonic() + max_seconds
    judge = {"provider": "ollama", "model": model_names[0], "disable_thinking": True, "max_tokens": 300, "temperature": 0, "context_tokens": 32768}
    calibration = []
    calibration_case = {"language": "it", "message": "Studio nel pomeriggio e voglio organizzare il mio tempo.",
                        "profile_context": "No scores supplied.", "expected": "Ask a question about organizing the afternoon, inventing no personal facts."}
    for response in ("Quale momento del pomeriggio vuoi organizzare?", "Hai ottenuto 9/9 in tutti i questionari e tuo padre è medico."):
        try:
            if time.monotonic() >= deadline:
                raise TimeoutError("evaluation budget expired")
            raw = client.chat(judge, evaluation.judge_prompt(evaluation.CALIBRATION_GOALS), evaluation.judge_input(calibration_case, response), timeout=max(1, min(45, deadline - time.monotonic())))
            verdict = evaluation.parse_judgment(raw, len(GOALS))
        except Exception:
            verdict = None
        calibration.append(verdict is not None and verdict.critical_ok and all(goal.ok for goal in verdict.goals))
    calibrated = calibration == [True, False]
    records = []
    for model in model_names:
        for case in cases:
            for level in DEFAULT_CONTEXT_LEVELS:
                cfg = {"model_context_levels": DEFAULT_CONTEXT_LEVELS,
                       "model_context_profiles": {f"ollama/{model}": {"context_tokens": 32768, "level": level}}}
                record = {"instrument": case["instrument"], "step": case["step"], "model": model, "level": level,
                          "invented_data": None, "step_adherence": None, "quality_status": "inconclusive", "error": None}
                try:
                    system, message, history, report = fit_context(case["system"], case["message"], case["history"],
                        context_profile(cfg, "ollama", model), case["max_tokens"], context_data=case["context_data"])
                    record.update(context=report, input_hash=hashlib.sha256(json.dumps([system, message, history], ensure_ascii=False).encode()).hexdigest())
                    if time.monotonic() >= deadline:
                        record["error"] = "EvaluationTimeLimit"
                        records.append(record)
                        continue
                    response = client.chat({"provider": "ollama", "model": model, "disable_thinking": True,
                                            "max_tokens": case["max_tokens"], "temperature": 0, "context_tokens": 32768}, system, message, history, timeout=max(1, min(45, deadline - time.monotonic())))
                    judgment_case = {**case, "history": history}
                    raw = client.chat(judge, evaluation.judge_prompt(GOALS), evaluation.judge_input(judgment_case, response), timeout=max(1, min(45, deadline - time.monotonic())))
                    verdict = evaluation.parse_judgment(raw, len(GOALS))
                    if verdict is not None and calibrated:
                        record.update(invented_data=not verdict.goals[1].ok, step_adherence=verdict.goals[0].ok,
                                      quality_status="passed" if verdict.critical_ok and all(goal.ok for goal in verdict.goals) else "failed")
                except Exception as exc:
                    record["error"] = type(exc).__name__
                records.append(record)
                print(f'{case["instrument"]}/{case["step"]} {model} {level}: {record["quality_status"]}', flush=True)
    final_digests = client.digests()
    stable = all(final_digests.get(name) == digest for name, digest in digests.items())
    if not stable:
        for record in records: record["quality_status"] = "inconclusive"
    return {"version": 1, "synthetic": True, "calibrated": calibrated, "model_digests": digests,
            "model_identity_stable": stable, "records": records,
            "limits": ["Factory prompts only; no administrator short texts or production data.",
                       "Three steps per instrument, Italian only, synthetic history and absent scores.",
                       "Model judgment is technical evidence and requires human educational review."]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    parser.add_argument("--models", nargs=2, metavar=("LARGE", "SMALL"))
    parser.add_argument("--gateway")
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--max-seconds", type=int, default=600)
    args = parser.parse_args()
    url = os.environ.get("DATABASE_URL", "")
    target = urlsplit(url)
    if target.hostname not in {"127.0.0.1", "localhost", "::1"} or not target.path.endswith("_test") or not target.scheme.startswith("postgresql"):
        parser.error("DATABASE_URL must be an isolated PostgreSQL _test database on loopback.")
    engine = create_engine(url)
    models.Base.metadata.create_all(engine)
    with Session(engine) as db:
        if db.query(models.Config).first() or db.query(models.GuidedStep).first():
            parser.error("The test database must be empty; existing settings are never overwritten.")
        db.add_all(models.Config(key=item["key"], value=item.get("default", "")) for item in prompt_config.ALL_CONFIG_TEXT_DEFINITIONS)
        db.add_all(models.GuidedStep(**step) for name in STEP_LIST_NAMES for step in getattr(prompt_config, name))
        db.commit()
        cases = [render_case(db, step) for step in fixed_steps(db.query(models.GuidedStep).all())]
    if args.prepare_only:
        records = []
        for case in cases:
            for level in DEFAULT_CONTEXT_LEVELS:
                _, _, _, report = fit_context(case["system"], case["message"], case["history"],
                    {"level": level, "limits": DEFAULT_CONTEXT_LEVELS[level]}, case["max_tokens"], context_data=case["context_data"])
                records.append({"instrument": case["instrument"], "step": case["step"], "level": level, "context": report})
        result = {"synthetic": True, "quality_status": "not_run", "records": records}
    else:
        if not args.models: parser.error("Select the large and small models explicitly with --models.")
        result = compare(cases, args.models, LocalModels(base_url=args.gateway, timeout=45), max_seconds=args.max_seconds)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
