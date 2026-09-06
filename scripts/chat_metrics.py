"""Six numbers that say whether the counselor is holding a reflection or talking.

Read from `logs` alone, so any installation can measure itself without extra
instrumentation. They exist because "the chat feels better" is not a claim: the
analysis of 881 turns that opened this work rested on these figures, and a
change to memory or to the step prompts has to move them.

  parlato       counselor words per word the student writes freely. A guided
                path is not a lecture: at 29:1 the student is a reader.
  richiami      share of counselor turns that pick up something the student
                said earlier. What is never picked up was never heard.
  verifiche     turns that ask how a previously agreed action went, against the
                turns that proposed one. This was 2 against 107.
  domande       share of turns carrying a question, per step mode. The factor
                steps sat at 16%: they explain and never ask.
  abbandoni     where sessions stop. Two thirds died on the first analysis.
  ripetizioni   steps replayed inside one session, which regenerate a nearly
                identical analysis.

    DATABASE_URL=postgresql://USER:PASS@127.0.0.1:5435/DB \
        python3 -m scripts.chat_metrics
    DATABASE_URL=... python3 -m scripts.chat_metrics --since 2026-09-01
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import re

from backend import models
from backend.database import SessionLocal
from backend.diagram_blocks import strip_for_speech

# Ripresa esplicita di quanto detto prima, nelle sei lingue dell'app.
CALLBACK = re.compile(
    r"\b(hai detto|mi hai detto|hai scritto|dicevi|hai raccontato|come dicevi"
    r"|you (said|mentioned|wrote)|has dicho|dijiste|tu as dit|du (sa|skrev)|hast du gesagt)\b",
    re.IGNORECASE,
)
# Verifica di un'azione gia' concordata, non una nuova proposta.
FOLLOW_UP = re.compile(
    r"\b(come (e'|è) andata|hai provato|hai fatto|sei riuscit\w+ a|hai messo in pratica"
    r"|la scorsa volta|did you (try|manage)|how did it go|has funcionado|lo has probado"
    r"|as-tu essay|hur gick det|hat es geklappt)\b",
    re.IGNORECASE,
)
# Proposta di azione datata: e' quella che poi nessuno verifica.
ACTION = re.compile(
    r"(azione (di oggi|prioritaria|pratica)|\*\*oggi[:,]|questa settimana|nei prossimi (giorni|7)"
    r"|micro-?(azione|passo|attivit)|action for today|this week|esta semana|denna vecka)",
    re.IGNORECASE,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--since", help="ISO date; only turns from that day on")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        query = db.query(models.Log).filter(models.Log.action == "chat_message")
        if args.since:
            query = query.filter(models.Log.timestamp >= dt.date.fromisoformat(args.since))
        rows = query.order_by(models.Log.session_id, models.Log.timestamp.asc()).all()
        if not rows:
            print("Nessun turno di chat nel periodo richiesto.")
            return 0
        sessions = collections.defaultdict(list)
        for row in rows:
            sessions[row.session_id].append(row)

        print(f"{len(rows)} turni, {len(sessions)} sessioni"
              + (f", dal {args.since}" if args.since else ""))
        _spoken(rows)
        _callbacks(rows)
        _verification(rows)
        _questions(rows)
        _dropout(sessions)
        _replays(sessions)
        return 0
    finally:
        db.close()


def _spoken(rows: list) -> None:
    counselor = sum(len(_visible(row).split()) for row in rows)
    student = sum(len(_student(row).split()) for row in rows)
    ratio = counselor / student if student else 0
    print(f"\nparlato      {ratio:.0f}:1  ({counselor} parole del counselor, "
          f"{student} dello studente)")
    lengths = sorted(len(_student(row).split()) for row in rows if _student(row))
    if lengths:
        print(f"             turno libero dello studente: mediana {lengths[len(lengths) // 2]} parole")


def _callbacks(rows: list) -> None:
    hits = sum(1 for row in rows if CALLBACK.search(_visible(row)))
    print(f"\nrichiami     {_share(hits, len(rows))} dei turni riprende qualcosa detto prima")


def _verification(rows: list) -> None:
    proposed = sum(1 for row in rows if ACTION.search(_visible(row)))
    checked = sum(1 for row in rows if FOLLOW_UP.search(_visible(row)))
    print(f"\nverifiche    {checked} turni verificano un'azione, {proposed} ne propongono una")


def _questions(rows: list) -> None:
    total, asked = collections.Counter(), collections.Counter()
    for row in rows:
        mode = (row.mode or "?")
        total[mode] += 1
        if "?" in _visible(row):
            asked[mode] += 1
    print("\ndomande      turni con almeno una domanda, per modo")
    for mode, count in total.most_common():
        print(f"             {mode:18s} {asked[mode]:4d}/{count:<4d} {_share(asked[mode], count)}")


def _dropout(sessions: dict) -> None:
    last = collections.Counter((turns[-1].phase or "?") for turns in sessions.values())
    print("\nabbandoni    ultima fase raggiunta dalla sessione")
    for phase, count in last.most_common(8):
        print(f"             {phase:18s} {count:4d} {_share(count, len(sessions))}")


def _replays(sessions: dict) -> None:
    replayed = collections.Counter()
    touched = 0
    for turns in sessions.values():
        seen = collections.Counter(
            (turn.details or {}).get("guided_phase_prompt_key") for turn in turns
            if (turn.details or {}).get("guided_phase_prompt_key")
        )
        again = {step: count - 1 for step, count in seen.items() if count > 1}
        if again:
            touched += 1
            replayed.update(again)
    print(f"\nripetizioni  {touched} sessioni rigiocano uno step, "
          f"{sum(replayed.values())} riesecuzioni")
    for step, count in replayed.most_common(5):
        print(f"             {step:34s} {count:4d}")


# --- helpers ---
def _visible(row) -> str:
    return strip_for_speech((row.details or {}).get("bot_response") or "")


def _student(row) -> str:
    """Only what the student typed: on a step entry the directive travels in
    `effective_user_input` and `user_input` stays empty."""
    return ((row.details or {}).get("user_input") or "").strip()


def _share(part: int, total: int) -> str:
    return f"{part / total:.0%}" if total else "-"


if __name__ == "__main__":
    raise SystemExit(main())
