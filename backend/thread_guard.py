"""Does the turn that just ended still hold the thread?

The counselor is asked, every turn, to stay on the step's mandate, to ground
what it advises in what the student actually said, and to take its own open
question back up. Nothing checks whether it did. `session_ledger` recovers the
material a turn needs, but it cannot judge the turn that used it.

This module judges it, and judges only the counselor: a student who changes
subject is not derailing anything, and the guard reports a drift only when the
counselor neither followed it nor reconnected it.

The verdict is data, not an order. It states what happened and the next turn's
counselor decides what to do about it — the same choice the Compass makes with
its briefs, for the same reason: a short-circuited instruction cannot see the
conversation, and a model that receives one stops reading.

A verdict is never worth a turn. Every failure here renders an empty block.
"""
from __future__ import annotations

import json
import re

from pydantic import BaseModel, ValidationError

# Two notes are a warning; four are wallpaper the model learns to skip.
MAX_CHECK_NOTES = 2
MAX_NOTE_CHARS = 140
MAX_BLOCK_CHARS = 400
# Severest first: an invented recommendation reaches the student's booklet, a
# lost thread only costs a turn, a misplaced question costs less still.
SEVERITY = ("advice_grounded", "on_thread", "question_fit")

ANSWERED_LINE = "The question you left open in the previous turn was not taken up in this exchange."

_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)
_OBJECT = re.compile(r"\{.*\}", re.DOTALL)
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")
_MARKUP = re.compile(r"[*_`#]+")
# Un ordine non e' un fatto: se il guardiano scrive l'istruzione al posto del
# counselor, il prompt di step non decide piu' niente. Meglio nessuna nota.
_IMPERATIVE = re.compile(
    r"^(ask|tell|avoid|do|don't|take|propose|use|make|stop|keep|go|return|reconnect"
    r"|remind|suggest|consider|focus|check|verify|ensure|add|remove|start|connect"
    r"|bring|follow|explain|clarify|acknowledge|recall|let|try|stay|pick|name)\b",
    re.IGNORECASE,
)
_PRESCRIPTIVE = re.compile(r"\b(should|must|need to|ought to)\b", re.IGNORECASE)


class Check(BaseModel):
    model_config = {"extra": "ignore"}
    ok: bool
    note: str | None = None


class Answered(BaseModel):
    model_config = {"extra": "ignore"}
    last_question_developed: bool


class Verdict(BaseModel):
    model_config = {"extra": "ignore"}
    on_thread: Check
    question_fit: Check
    advice_grounded: Check
    answered: Answered


def parse(raw: str | None) -> Verdict | None:
    """The model's reply, or nothing. A half-read verdict is not a verdict."""
    payload = _json_object(raw or "")
    if payload is None:
        return None
    try:
        return Verdict.model_validate(payload)
    except ValidationError:
        return None


def notes(verdict: Verdict | None) -> list[str]:
    """The lines worth injecting: only what failed, severest first."""
    if verdict is None:
        return []
    lines = []
    for name in SEVERITY:
        if len(lines) == MAX_CHECK_NOTES:
            break
        check = getattr(verdict, name)
        if check.ok:
            continue
        note = _usable_note(check.note)
        if note:
            lines.append(note)
    if not verdict.answered.last_question_developed:
        lines.append(ANSWERED_LINE)
    return lines


def render(lines: list[str]) -> str:
    """One bounded block; the least severe line goes first when it does not fit."""
    lines = list(lines)
    while lines:
        text = "\n".join([
            "[THREAD]",
            "Observed on the turn before this one. Facts, not instructions, and never "
            "mentioned to the student.",
            *(f"- {line}" for line in lines),
        ])
        if len(text) <= MAX_BLOCK_CHARS:
            return text
        lines.pop()
    return ""


# --- helpers ---
def _json_object(raw: str) -> dict | None:
    fenced = _FENCE.search(raw)
    candidate = fenced.group(1) if fenced else raw
    match = _OBJECT.search(candidate)
    if not match:
        return None
    try:
        payload = json.loads(match.group(0))
    except ValueError:
        return None
    return payload if isinstance(payload, dict) else None


def _usable_note(note: str | None) -> str:
    text = _MARKUP.sub("", (note or "")).strip()
    if not text:
        return ""
    text = _SENTENCE_END.split(text)[0].strip()
    if _IMPERATIVE.match(text) or _PRESCRIPTIVE.search(text):
        return ""
    if len(text) <= MAX_NOTE_CHARS:
        return text
    cut = text[:MAX_NOTE_CHARS - 1]
    space = cut.rfind(" ")
    return (cut[:space] if space > 0 else cut).rstrip() + "…"
