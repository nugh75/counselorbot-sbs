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

import hashlib
import json
import logging
import re
import threading

from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

from . import models, pii, session_ledger

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
# Le note tornano nella lingua della conversazione anche quando il prompt chiede
# l'inglese, quindi un filtro solo inglese lascia passare l'ordine nelle altre
# cinque. Solo forme imperative: l'indicativo passato ("ha ignorato", "asked")
# e' esattamente il fatto che si vuole tenere.
_IMPERATIVE = re.compile(
    r"^("
    r"ask|tell|avoid|do|don't|take|propose|use|make|stop|keep|go|return|reconnect"
    r"|remind|suggest|consider|focus|check|verify|ensure|add|remove|start|connect"
    r"|bring|follow|explain|clarify|acknowledge|recall|let|try|stay|pick|name"
    r"|chiedi|riprendi|riporta|evita|usa|torna|collega|proponi|ricorda|verifica"
    r"|chiarisci|spiega|lascia|resta|smetti|aggiungi|togli|parti|segui|non\s+\w+re"
    r"|pregunta|pide|evita|usa|vuelve|conecta|propone|recuerda|verifica|aclara"
    r"|explica|deja|sigue|empieza"
    r"|demande|demandez|évite|évitez|utilise|utilisez|reprends|reprenez|relie"
    r"|reliez|propose|proposez|rappelle|rappelez|clarifie|clarifiez|explique"
    r"|expliquez|reste|restez"
    r"|frage|fragen\s+sie|vermeide|vermeiden\s+sie|nutze|nutzen\s+sie|greife"
    r"|erkläre|erklären\s+sie|bleibe|bleiben\s+sie|verbinde"
    r"|fråga|undvik|använd|återkom|koppla|föreslå|påminn|förklara|stanna"
    r")\b",
    re.IGNORECASE,
)
_PRESCRIPTIVE = re.compile(
    r"\b("
    r"should|must|need to|ought to"
    r"|dovrebbe|dovrebbero|deve|devono|bisogna|occorre|va\s+fatto"
    r"|debería|deberían|debe|deben|hay\s+que|tiene\s+que"
    r"|devrait|devraient|doit|doivent|il\s+faut"
    r"|sollte|sollten|muss|müssen"
    r"|borde|bör|måste|ska"
    r")\b",
    re.IGNORECASE,
)


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


def notes(verdict: Verdict | None, *, student_spoke: bool = True) -> list[str]:
    """The lines worth injecting: only what failed, severest first.

    `student_spoke` is false on a step entry, where the student's message is a
    hidden directive and nobody answered anything. Asking there whether the open
    question was taken up is asking a question with a fixed answer: it fired on
    seven of nine sampled turns. Whose question is open, and for how long, the
    ledger already knows without a model.
    """
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
    if student_spoke and not verdict.answered.last_question_developed:
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


# --- storage ---
ACTION = "thread_guard"


def turn_hash(user_text: str, bot_text: str) -> str:
    """Which exchange a verdict is about.

    The worker runs after the turn and the next turn does not wait for it. A
    verdict that arrives late is about an exchange the conversation has already
    left behind: injecting it would answer a question nobody is still asking.
    """
    digest = hashlib.sha256(f"{user_text}\u0000{bot_text}".encode("utf-8"))
    return digest.hexdigest()[:16]


def store(db, *, session_id: str, username: str, turn: str, verdict: Verdict | None,
          student_spoke: bool = True) -> list[str]:
    """Write the verdict and return the lines that will actually be injected."""
    lines = notes(verdict, student_spoke=student_spoke)
    previous = _latest_row(db, session_id)
    if previous is not None:
        already = {_key(line) for line in _stored_notes(previous)}
        # The same finding twice running reads as nagging, and the model starts
        # skipping the section. Once it has been said, let the turn answer it.
        lines = [line for line in lines if _key(line) not in already]
    db.add(models.Log(
        session_id=session_id,
        username=username or None,
        action=ACTION,
        details={"turn": turn, "notes": lines,
                 "verdict": verdict.model_dump() if verdict else None},
    ))
    db.commit()
    return lines


def pending(db, *, session_id: str) -> list[str]:
    """The notes about the exchange that just happened, or nothing at all."""
    last = _last_exchange(db, session_id)
    if last is None:
        return []
    row = _latest_row(db, session_id)
    if row is None or (row.details or {}).get("turn") != turn_hash(*last):
        return []
    return _stored_notes(row)


def block(db, *, session_id: str) -> str:
    return render(pending(db, session_id=session_id))


def _latest_row(db, session_id: str):
    return (
        db.query(models.Log)
        .filter(models.Log.session_id == session_id, models.Log.action == ACTION)
        .order_by(models.Log.id.desc())
        .first()
    )


def _last_exchange(db, session_id: str) -> tuple[str, str] | None:
    row = (
        db.query(models.Log)
        .filter(models.Log.session_id == session_id, models.Log.action == "chat_message")
        .order_by(models.Log.id.desc())
        .first()
    )
    if row is None:
        return None
    details = row.details or {}
    return (details.get("effective_user_input") or details.get("user_input") or "",
            details.get("bot_response") or "")


def _stored_notes(row) -> list[str]:
    stored = (row.details or {}).get("notes")
    if not isinstance(stored, list):
        return []
    return [line for line in stored if isinstance(line, str) and line.strip()]


def _key(line: str) -> str:
    return " ".join(line.lower().split())


# --- input ---
MAX_INPUT_CHARS = 2500
# Ogni sezione ha il suo tetto invece di un taglio unico in fondo: la lezione
# del budget delle skill e' che un blocco che non entra sparisce in silenzio, e
# qui a sparire sarebbe proprio il materiale su cui il giudizio si regge.
_MANDATE_CHARS = 450
_JUDGED_STUDENT_CHARS = 250
_JUDGED_COUNSELOR_CHARS = 500
_CONTEXT_TURN_CHARS = 120
_LEDGER_CHARS = 550
_ADVICE_CHARS = 180
_CONTEXT_TURNS = 2


def build_input(
    db, *, session_id: str, username: str, questionnaire_type: str,
    step_id: str | None, step_label: str, step_prompt: str, language: str,
    advice_ids: list[str], candidate_ids: list[str],
) -> str:
    """What the judge sees. Deliberately small.

    A local model given the whole session answers about the session; given the
    turn, its mandate and what the session already holds, it answers about the
    turn. The four sections are the four things a verdict needs and nothing else.
    """
    sections = [
        _mandate(db, questionnaire_type=questionnaire_type, username=username,
                 session_id=session_id, step_label=step_label, step_prompt=step_prompt,
                 language=language),
        _exchanges(db, session_id),
        _ledger(db, session_id=session_id, username=username, step_id=step_id),
        _advice(advice_ids, candidate_ids),
    ]
    return "\n\n".join(section for section in sections if section)[:MAX_INPUT_CHARS]


def _mandate(db, *, questionnaire_type, username, session_id, step_label, step_prompt,
             language) -> str:
    lines = [f"MANDATE (instrument {questionnaire_type}, conversation language {language})"]
    if questionnaire_type == "IDEA":
        # Idea non ha il prompt di step: il metro e' la mappa che la sessione sta
        # costruendo, ed e' rispetto a quella che una domanda e' pertinente.
        lines.append(_map_line(db, username, session_id))
    else:
        if step_label:
            lines.append(f'Step: "{step_label}".')
        lines.append("The step asks the counselor to:")
        lines.append(_clip(step_prompt, _MANDATE_CHARS))
    return "\n".join(line for line in lines if line)


def _map_line(db, username: str, session_id: str) -> str:
    from .idea_map import current_map

    spec = current_map(db, username, session_id)
    if spec is None:
        return "The map is still empty: this turn should be bringing the idea into focus."
    labels = ", ".join(node.label for node in spec.nodes)
    return _clip(f'The map so far is "{spec.title}", holding: {labels}.', _MANDATE_CHARS)


def _exchanges(db, session_id: str) -> str:
    rows = (
        db.query(models.Log)
        .filter(models.Log.session_id == session_id, models.Log.action == "chat_message")
        .order_by(models.Log.id.desc())
        .limit(_CONTEXT_TURNS + 1)
        .all()
    )
    if not rows:
        return ""
    lines = ["RECENT EXCHANGES (oldest first; the last one is the turn to judge)"]
    for position, row in enumerate(reversed(rows)):
        judged = position == len(rows) - 1
        details = row.details or {}
        student = details.get("effective_user_input") or details.get("user_input") or ""
        counselor = details.get("bot_response") or ""
        student_cap = _JUDGED_STUDENT_CHARS if judged else _CONTEXT_TURN_CHARS
        counselor_cap = _JUDGED_COUNSELOR_CHARS if judged else _CONTEXT_TURN_CHARS
        lines.append(f"student: {_clip(_safe(student), student_cap)}")
        lines.append(f"counselor: {_clip(_safe(counselor), counselor_cap)}")
    return "\n".join(lines)


def _ledger(db, *, session_id: str, username: str, step_id: str | None) -> str:
    """Only the facts, and only the keys this module names.

    Reading the ledger key by key is also what keeps the guard from ever seeing
    its own earlier notes once they live in that same dict.
    """
    ledger = session_ledger.build(db, session_id=session_id, username=username, step_id=step_id)
    lines = []
    for answer in ledger.get("answers") or []:
        lines.append(f'student said: "{_safe(answer.get("text", ""))}"')
    if ledger.get("open_question"):
        lines.append(f'question left open by the counselor: "{_safe(ledger["open_question"])}"')
    for name in ledger.get("pending_actions") or []:
        lines.append(f"action chosen and not yet verified: {_safe(name)}")
    for name in ledger.get("refused_actions") or []:
        lines.append(f"already refused by the student: {_safe(name)}")
    if ledger.get("replayed_step"):
        lines.append("this step has already been run once in this session")
    if not lines:
        return ""
    return _clip("WHAT THE SESSION ALREADY HOLDS\n" + "\n".join(lines), _LEDGER_CHARS)


def _advice(advice_ids: list[str], candidate_ids: list[str]) -> str:
    if not advice_ids and not candidate_ids:
        return ""
    lines = ["ADVICE IN THE JUDGED TURN"]
    lines.append("declared: " + (", ".join(advice_ids) if advice_ids else "none"))
    if candidate_ids:
        lines.append("catalogue available this turn: " + ", ".join(candidate_ids))
    return _clip("\n".join(lines), _ADVICE_CHARS)


def _safe(text: str) -> str:
    # The admin may point the guard at an external provider, so the input leaves
    # the machine: redaction here is a condition, not a logging preference.
    return pii.redact_always(text) or ""


def _clip(text: str, limit: int) -> str:
    text = (text or "").strip()
    return text if len(text) <= limit else text[:limit].rstrip() + "…"


# --- evaluation ---
ENABLED_KEY = "thread_guard_enabled"
PRESET_KEY = "thread_guard_preset_id"
# Un giudizio non vale un turno: oltre questo il verdetto arriverebbe comunque
# tardi, e il turno seguente lo scarterebbe come stantio.
TIMEOUT_SECONDS = 20
MAX_VERDICT_TOKENS = 400

SYSTEM_PROMPT = """You silently review ONE counselor turn from a guided counselling session.

You judge the counselor, never the student. A student who changes subject is not
derailing anything: that is only a fault if the counselor neither followed it nor
connected it back to the mandate.

Reply with one JSON object and nothing else:
{"on_thread": {"ok": true, "note": null},
 "question_fit": {"ok": true, "note": null},
 "advice_grounded": {"ok": true, "note": null},
 "answered": {"last_question_developed": true}}

on_thread - false only if the counselor lost the thread: it neither took up what
the student raised nor tied it back to the mandate.
question_fit - false only if the question the counselor asked belongs to another
step or has no bearing on the mandate.
advice_grounded - false only if the turn gave advice that follows from nothing the
student said. A turn that gives no advice is ok: true.

The mandate frames the conversation; it is not a checklist. Answering what the
student explicitly asked for is never off mandate: a turn that does so is on_thread
and question_fit ok even when it performed none of the step's usual moves.
answered.last_question_developed - false if a question the counselor had left open
was neither answered nor taken further in this exchange. If there was none, true.

Each note is ONE past-tense sentence of at most 140 characters saying what happened,
written in English whatever language the conversation is in: it is read by a model,
never shown to the student, and an Italian note risks being copied into an Italian reply.
Never an instruction, never "should", never advice to the counselor. Use null when ok is true.
Judge only from what you are given, and when in doubt answer ok: true."""


def enabled(db) -> bool:
    row = db.query(models.Config).filter(models.Config.key == ENABLED_KEY).first()
    return (row.value or "").strip().lower() in ("1", "true", "yes", "on") if row else False


def preset(db) -> tuple[str, str, bool] | None:
    """Which model judges. Declared by the admin, never inherited.

    The conversation can be served by an external provider while the guard runs
    on a local one: it reads every turn, and that is a cost and an exposure the
    admin should choose on purpose.
    """
    row = db.query(models.Config).filter(models.Config.key == PRESET_KEY).first()
    value = (row.value or "").strip() if row else ""
    if not value.isdigit():
        return None
    chosen = db.query(models.ModelPreset).filter(models.ModelPreset.id == int(value)).first()
    if not chosen or not chosen.provider or not chosen.model:
        return None
    return chosen.provider, chosen.model, bool(chosen.disable_thinking)


def evaluate(
    db, *, call, session_id: str, username: str, questionnaire_type: str,
    step_id: str | None, step_label: str, step_prompt: str, language: str,
    advice_ids: list[str], candidate_ids: list[str], turn: str,
    student_spoke: bool = True,
) -> list[str]:
    """Judge the turn that just ended. Returns the lines that will be injected.

    `call` is the only way out of this module: the caller supplies it, so a test
    can refuse it and a failing provider cannot become a failing turn.
    """
    if not enabled(db):
        return []
    target = preset(db)
    if target is None:
        return []
    provider, model, _no_think = target
    try:
        raw = call(
            provider=provider, model=model,
            user_message=build_input(
                db, session_id=session_id, username=username,
                questionnaire_type=questionnaire_type, step_id=step_id,
                step_label=step_label, step_prompt=step_prompt, language=language,
                advice_ids=advice_ids, candidate_ids=candidate_ids,
            ),
            system_prompt=SYSTEM_PROMPT,
        )
    except Exception as exc:  # a judge that fails is a judge that says nothing
        logger.info("Thread guard unavailable (%s/%s): %s", provider, model, type(exc).__name__)
        return []
    verdict = parse(raw)
    if verdict is None:
        logger.info("Thread guard returned no readable verdict (%s/%s)", provider, model)
        return []
    return store(db, session_id=session_id, username=username, turn=turn, verdict=verdict,
                 student_spoke=student_spoke)


def schedule(**kwargs) -> None:
    """Fire and forget. The turn is already on its way to the student."""
    threading.Thread(target=_run, kwargs=kwargs, daemon=True).start()


def _run(**kwargs) -> None:
    from .ai_service import AIService
    from .database import SessionLocal

    db = SessionLocal()
    try:
        if not enabled(db):
            return
        service = AIService(db)
        service.config["ai_timeout_seconds"] = str(TIMEOUT_SECONDS)
        target = preset(db)
        if target is not None:
            service.disable_thinking = target[2]
            service.config["disable_thinking"] = "true" if target[2] else "false"

        def call(*, provider, model, user_message, system_prompt):
            return service.call_model(
                provider=provider, model=model, user_message=user_message,
                system_prompt=system_prompt, max_tokens=MAX_VERDICT_TOKENS,
            )

        evaluate(db, call=call, **kwargs)
    except Exception as exc:  # pragma: no cover - the worker must never surface
        logger.warning("Thread guard worker failed: %s", exc)
        db.rollback()
    finally:
        db.close()
