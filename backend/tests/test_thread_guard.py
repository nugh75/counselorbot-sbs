"""The guard reports facts about a finished turn, or it reports nothing."""
import json

import pytest

from backend import thread_guard


def _raw(*, on_thread=True, question_fit=True, advice=True, developed=True,
         on_thread_note=None, question_note=None, advice_note=None) -> str:
    return json.dumps({
        "on_thread": {"ok": on_thread, "note": on_thread_note},
        "question_fit": {"ok": question_fit, "note": question_note},
        "advice_grounded": {"ok": advice, "note": advice_note},
        "answered": {"last_question_developed": developed},
    })


def test_a_healthy_turn_says_nothing():
    verdict = thread_guard.parse(_raw())
    assert thread_guard.render(thread_guard.notes(verdict)) == ""


def test_two_failing_checks_are_both_reported():
    verdict = thread_guard.parse(_raw(
        question_fit=False, question_note="Asked about exam anxiety; this step is about planning time.",
        advice=False, advice_note="The strategy does not follow from anything the student said.",
    ))
    block = thread_guard.render(thread_guard.notes(verdict))
    assert "planning time" in block and "does not follow" in block


def test_only_the_two_most_severe_survive():
    verdict = thread_guard.parse(_raw(
        on_thread=False, on_thread_note="Left the subject the student raised.",
        question_fit=False, question_note="Question belongs to another step.",
        advice=False, advice_note="Advice ungrounded.",
    ))
    lines = thread_guard.notes(verdict)
    assert lines == ["Advice ungrounded.", "Left the subject the student raised."]


def test_an_undeveloped_question_adds_its_own_line():
    verdict = thread_guard.parse(_raw(developed=False))
    block = thread_guard.render(thread_guard.notes(verdict))
    assert block.startswith("[THREAD]")
    assert "not taken up" in block


def test_the_block_stays_within_its_budget():
    verdict = thread_guard.parse(_raw(
        on_thread=False, on_thread_note="x" * 400,
        question_fit=False, question_note="y" * 400,
        advice=False, advice_note="z" * 400,
        developed=False,
    ))
    assert len(thread_guard.render(thread_guard.notes(verdict))) <= thread_guard.MAX_BLOCK_CHARS


def test_a_long_note_is_trimmed_at_a_word_boundary_not_dropped():
    sentence = "The counselor proposed a reading that nobody asked about and that "
    verdict = thread_guard.parse(_raw(advice=False, advice_note=sentence + "w" * 200))
    note = thread_guard.notes(verdict)[0]
    assert len(note) <= thread_guard.MAX_NOTE_CHARS
    assert note.startswith("The counselor proposed a reading")
    assert not note.endswith("w" * 10)


def test_only_the_first_sentence_of_a_rambling_note_is_kept():
    verdict = thread_guard.parse(_raw(
        on_thread=False,
        on_thread_note="The reply changed subject. I would suggest going back to the previous topic.",
    ))
    assert thread_guard.notes(verdict) == ["The reply changed subject."]


def test_an_imperative_note_is_refused():
    # The verdict is data. A note written as an order is not usable as data.
    verdict = thread_guard.parse(_raw(
        question_fit=False, question_note="Ask the student about their study method instead."))
    assert thread_guard.notes(verdict) == []


@pytest.mark.parametrize("raw", [
    "not json at all",
    "{}",
    json.dumps({"on_thread": {"ok": True}}),
    json.dumps({"on_thread": {"ok": "maybe"}, "question_fit": {"ok": True},
                "advice_grounded": {"ok": True}, "answered": {"last_question_developed": True}}),
])
def test_unusable_output_parses_to_nothing(raw):
    assert thread_guard.parse(raw) is None


def test_a_fenced_reply_is_still_read():
    verdict = thread_guard.parse("Here it is:\n```json\n" + _raw(developed=False) + "\n```\n")
    assert verdict is not None and verdict.answered.last_question_developed is False


def test_notes_of_nothing_render_nothing():
    assert thread_guard.render([]) == ""
    assert thread_guard.notes(None) == []
