"""Read the thread guard's verdicts without letting it change anything.

The guard's real risk is not the plumbing, it is whether a small local model
judges relevance well enough to be worth injecting. That cannot be settled by a
test: it needs real conversations and someone reading the output.

This runs the guard over the last turn of the most recent sessions and prints
what it would have said. It opens no write path — no `store`, no `evaluate` —
so it can be pointed at the production database while students are using it.

Run it inside the backend container, where the model and the config already are:

    docker cp scripts/thread_guard_dry_run.py counselorbot_backend:/app/dry_run.py
    docker exec counselorbot_backend python /app/dry_run.py --sessions 10
"""
from __future__ import annotations

import argparse
import sys
import time

sys.path.insert(0, "/app")

from sqlalchemy import func

from backend import models, thread_guard
from backend.ai_service import AIService
from backend.database import SessionLocal


def recent_sessions(db, limit: int) -> list[tuple[str, str]]:
    rows = (
        db.query(models.Log.session_id, models.Log.username, func.max(models.Log.id).label("last"))
        .filter(models.Log.action == "chat_message", models.Log.session_id.isnot(None))
        .group_by(models.Log.session_id, models.Log.username)
        .order_by(func.max(models.Log.id).desc())
        .limit(limit)
        .all()
    )
    return [(row.session_id, row.username or "") for row in rows]


def last_turn(db, session_id: str, free_only: bool = False):
    """The turn to judge.

    By default the last one. With `free_only`, the last one the student actually
    wrote in: a step entry carries a hidden directive, not a student's words, and
    judging those says little about the cases the guard exists for.
    """
    query = (
        db.query(models.Log)
        .filter(models.Log.action == "chat_message", models.Log.session_id == session_id)
        .order_by(models.Log.id.desc())
    )
    if not free_only:
        return query.first()
    for row in query.limit(40).all():
        if ((row.details or {}).get("user_input") or "").strip():
            return row
    return None


def step_of(db, questionnaire_type: str, step_id: str | None):
    if not step_id:
        return None
    return (
        db.query(models.GuidedStep)
        .filter(models.GuidedStep.id == step_id,
                models.GuidedStep.questionnaire_type == questionnaire_type)
        .first()
    )


def clip(text: str, limit: int) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[:limit] + "…"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sessions", type=int, default=10, help="how many recent sessions to judge")
    parser.add_argument("--preset-id", type=int, default=None, help="override the configured judge")
    parser.add_argument("--free-only", action="store_true",
                        help="judge the last turn the student actually wrote in")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.preset_id is not None:
            row = db.query(models.ModelPreset).filter(models.ModelPreset.id == args.preset_id).first()
            if row is None:
                print(f"preset {args.preset_id} does not exist")
                return 1
            provider, model, no_think = row.provider, row.model, bool(row.disable_thinking)
        else:
            target = thread_guard.preset(db)
            if target is None:
                print("no judge configured: set thread_guard_preset_id, or pass --preset-id")
                return 1
            provider, model, no_think = target

        service = AIService(db)
        service.config["ai_timeout_seconds"] = str(thread_guard.TIMEOUT_SECONDS)
        service.disable_thinking = no_think
        service.config["disable_thinking"] = "true" if no_think else "false"

        print(f"judge: {provider}/{model} (thinking {'off' if no_think else 'on'})")
        print(f"the guard writes nothing here; thread_guard_enabled stays as it is\n")

        judged = flagged = unreadable = 0
        for session_id, username in recent_sessions(db, args.sessions):
            row = last_turn(db, session_id, free_only=args.free_only)
            if row is None:
                continue
            details = row.details or {}
            questionnaire_type = row.questionnaire_type or details.get("questionnaire_type") or "QSA"
            step = step_of(db, questionnaire_type, row.phase)
            prompt = thread_guard.build_input(
                db, session_id=session_id, username=username,
                questionnaire_type=questionnaire_type, step_id=row.phase,
                step_label=getattr(step, "label", "") or "",
                step_prompt=getattr(step, "prompt", "") or "",
                language=details.get("language") or "it",
                advice_ids=list(details.get("recommended_strategy_ids") or [])
                + list(details.get("recommended_reading_ids") or []),
                candidate_ids=list(details.get("certified_strategy_ids") or []),
            )
            started = time.monotonic()
            try:
                raw = service.call_model(
                    provider=provider, model=model, user_message=prompt,
                    system_prompt=thread_guard.SYSTEM_PROMPT,
                    max_tokens=thread_guard.MAX_VERDICT_TOKENS,
                )
            except Exception as exc:
                print(f"── {session_id} · {questionnaire_type} · {row.phase or 'free'}")
                print(f"   model unavailable: {type(exc).__name__}: {exc}\n")
                continue
            elapsed = time.monotonic() - started
            judged += 1

            print(f"── {session_id} · {questionnaire_type} · {row.phase or 'free'} · {elapsed:.1f}s")
            print(f"   student  : {clip(details.get('effective_user_input') or details.get('user_input'), 160)}")
            print(f"   counselor: {clip(details.get('bot_response'), 240)}")
            verdict = thread_guard.parse(raw)
            if verdict is None:
                unreadable += 1
                print(f"   VERDICT  : unreadable — {clip(raw, 200)}\n")
                continue
            print("   verdict  : " + " | ".join(
                f"{name} {'ok' if getattr(verdict, name).ok else 'FAIL'}"
                for name in ("on_thread", "question_fit", "advice_grounded")
            ) + f" | last question {'developed' if verdict.answered.last_question_developed else 'DROPPED'}")
            lines = thread_guard.notes(
                verdict,
                student_spoke=bool((details.get("user_input") or "").strip()),
            )
            if lines:
                flagged += 1
                for line in lines:
                    print(f"   note     : {line}")
            else:
                print("   note     : (nothing would be injected)")
            print()

        print(f"judged {judged} turns · {flagged} would inject something · {unreadable} unreadable")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
