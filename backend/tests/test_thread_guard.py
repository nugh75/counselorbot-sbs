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


def test_a_step_entry_never_reports_an_unanswered_question():
    # On a step entry the student says nothing: the message is a hidden directive.
    # "The question was not taken up" is then true by construction, and it fired on
    # seven of nine sampled turns. Whose question it is, and how old, is the ledger's.
    verdict = thread_guard.parse(_raw(developed=False))
    assert thread_guard.notes(verdict, student_spoke=False) == []
    assert thread_guard.notes(verdict, student_spoke=True) == [thread_guard.ANSWERED_LINE]


@pytest.mark.parametrize("note", [
    "Chiedi allo studente il suo metodo di studio.",
    "Riprendi la domanda rimasta aperta prima di procedere.",
    "Il counselor dovrebbe porre una domanda riflessiva.",
    "Pregunta al estudiante por su método de estudio.",
    "Demande à l'étudiant quelle est sa méthode.",
    "Der Counselor sollte eine Frage stellen.",
    "Fråga studenten om metoden.",
])
def test_an_order_is_refused_in_every_language(note):
    # The verdict is data. The notes come back in the conversation's language, so a
    # filter that only knows English lets an order through into the next prompt.
    verdict = thread_guard.parse(_raw(question_fit=False, question_note=note))
    assert thread_guard.notes(verdict) == []


def test_a_factual_note_in_italian_survives():
    verdict = thread_guard.parse(_raw(
        on_thread=False, on_thread_note="Il counselor ha lasciato il tema che lo studente aveva aperto."))
    assert thread_guard.notes(verdict) == [
        "Il counselor ha lasciato il tema che lo studente aveva aperto."]


def test_the_prompt_says_the_mandate_is_a_frame_not_a_checklist():
    # A judged turn answered the student's request for readings and was marked off
    # mandate for not asking the step's three reflective questions: the guard was
    # punishing the counselor for following the student.
    assert "not a checklist" in thread_guard.SYSTEM_PROMPT
    assert "explicitly asked" in thread_guard.SYSTEM_PROMPT


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


# --- storage and staleness ---
from backend import models  # noqa: E402
from backend.tests.artifact_database import artifact_session  # noqa: E402

SESSION = "guard-fixture"
STUDENT = "alice"


@pytest.fixture
def db():
    with artifact_session() as session:
        yield session


def _turn(db, *, student="mi distraggo", counselor="Capito."):
    db.add(models.Log(
        session_id=SESSION, username=STUDENT, action="chat_message", phase="cognitive",
        questionnaire_type="QSA",
        details={"user_input": student, "effective_user_input": student,
                 "bot_response": counselor},
    ))
    db.flush()
    return thread_guard.turn_hash(student, counselor)


def test_a_verdict_about_the_last_turn_is_pending(db):
    turn = _turn(db)
    thread_guard.store(db, session_id=SESSION, username=STUDENT, turn=turn,
                       verdict=thread_guard.parse(_raw(developed=False)))
    assert thread_guard.pending(db, session_id=SESSION) == [thread_guard.ANSWERED_LINE]


def test_a_verdict_about_an_older_turn_is_not_injected(db):
    stale = _turn(db, student="prima", counselor="risposta")
    thread_guard.store(db, session_id=SESSION, username=STUDENT, turn=stale,
                       verdict=thread_guard.parse(_raw(developed=False)))
    _turn(db, student="poi", counselor="altra risposta")  # the guard has not caught up
    assert thread_guard.pending(db, session_id=SESSION) == []


def test_no_verdict_injects_nothing(db):
    _turn(db)
    assert thread_guard.pending(db, session_id=SESSION) == []


def test_an_unreadable_row_injects_nothing(db):
    turn = _turn(db)
    db.add(models.Log(session_id=SESSION, username=STUDENT, action="thread_guard",
                      details={"turn": turn, "notes": "not a list"}))
    db.flush()
    assert thread_guard.pending(db, session_id=SESSION) == []


def test_the_same_note_is_not_repeated_two_turns_running(db):
    note = "The reply left the subject the student had raised."
    first = _turn(db, student="uno", counselor="a")
    thread_guard.store(db, session_id=SESSION, username=STUDENT, turn=first,
                       verdict=thread_guard.parse(_raw(on_thread=False, on_thread_note=note)))
    second = _turn(db, student="due", counselor="b")
    kept = thread_guard.store(db, session_id=SESSION, username=STUDENT, turn=second,
                              verdict=thread_guard.parse(_raw(on_thread=False, on_thread_note=note)))
    assert kept == []
    third = _turn(db, student="tre", counselor="c")
    again = thread_guard.store(db, session_id=SESSION, username=STUDENT, turn=third,
                               verdict=thread_guard.parse(_raw(on_thread=False, on_thread_note=note)))
    assert again == [note]  # suppressed once, not forever


# --- input builder ---
def _input(db, **kwargs):
    params = dict(session_id=SESSION, username=STUDENT, questionnaire_type="QSA",
                  step_id="cognitive", step_label="Strategie cognitive",
                  step_prompt="Analizza i fattori cognitivi uno per uno.",
                  language="it", advice_ids=[], candidate_ids=[])
    params.update(kwargs)
    return thread_guard.build_input(db, **params)


def test_the_input_carries_the_mandate_and_the_student_words(db):
    _turn(db, student="a casa mi distraggo sempre", counselor="Capito. Che cosa ti aiuta?")
    text = _input(db)
    assert "Analizza i fattori cognitivi" in text
    assert "mi distraggo sempre" in text
    assert "Che cosa ti aiuta?" in text


def test_the_guard_never_reads_its_own_earlier_notes(db, monkeypatch):
    from backend import session_ledger
    monkeypatch.setattr(session_ledger, "build", lambda *a, **k: {
        "answers": [{"step": "cognitive", "text": "mi distraggo"}], "open_question": "",
        "pending_actions": [], "proposed_action": "", "refused_actions": [],
        "verification_asked": False, "replayed_step": False,
        "guard_notes": ["The reply left the subject the student had raised."],
    })
    _turn(db)
    assert "left the subject" not in _input(db)


def test_the_input_stays_within_its_budget(db):
    for index in range(6):
        _turn(db, student="x" * 3000, counselor="y" * 3000)
    assert len(_input(db, step_prompt="z" * 4000)) <= thread_guard.MAX_INPUT_CHARS


def test_personal_data_does_not_reach_the_judge(db):
    _turn(db, student="scrivimi a mario.rossi@example.com", counselor="Va bene.")
    assert "mario.rossi@example.com" not in _input(db)


def test_for_idea_the_map_takes_the_place_of_the_step_prompt(db):
    from backend import idea_map
    from backend.diagram_render import DiagramEdge, DiagramNode, DiagramSpec
    spec = DiagramSpec(
        type="mindmap", title="Aprire uno studio di counseling",
        nodes=[DiagramNode(id="n0", label="Studio di counseling"),
               DiagramNode(id="n1", label="Trovare i primi clienti")],
        edges=[DiagramEdge(source="n0", target="n1")])
    db.add(models.IdeaMapRevision(session_id=SESSION, username=STUDENT,
                                  spec=spec.model_dump(mode="json")))
    db.flush()
    assert idea_map.current_map(db, STUDENT, SESSION) is not None
    _turn(db)
    text = _input(db, questionnaire_type="IDEA", step_id=None, step_prompt="")
    assert "Aprire uno studio di counseling" in text
    assert "Trovare i primi clienti" in text


def test_the_declared_advice_and_its_candidates_are_shown(db):
    _turn(db)
    text = _input(db, advice_ids=["C1"], candidate_ids=["C1", "A5"])
    assert "C1" in text and "A5" in text


# --- evaluation ---
def _config(db, key, value):
    db.add(models.Config(key=key, value=value))
    db.flush()


def _preset(db, **kwargs):
    fields = dict(name="guard", provider="ollama", model="qwen3.8:latest",
                  disable_thinking=True, is_active=True)
    fields.update(kwargs)
    row = models.ModelPreset(**fields)
    db.add(row)
    db.flush()
    return row


def _refuse(**kwargs):
    raise AssertionError("the model must not be called")


def _evaluate(db, call, **kwargs):
    params = dict(call=call, session_id=SESSION, username=STUDENT, questionnaire_type="QSA",
                  step_id="cognitive", step_label="Strategie cognitive",
                  step_prompt="Analizza i fattori.", language="it",
                  advice_ids=[], candidate_ids=[], turn=_turn(db))
    params.update(kwargs)
    return thread_guard.evaluate(db, **params)


def test_the_guard_is_off_until_it_is_turned_on(db):
    _preset(db)
    assert _evaluate(db, _refuse) == []


def test_without_a_preset_nothing_runs(db):
    _config(db, thread_guard.ENABLED_KEY, "true")
    assert _evaluate(db, _refuse) == []


def test_a_preset_pointing_nowhere_is_not_a_preset(db):
    _config(db, thread_guard.ENABLED_KEY, "true")
    _config(db, thread_guard.PRESET_KEY, "9999")
    assert _evaluate(db, _refuse) == []


def test_a_verdict_is_stored_and_returned(db):
    _config(db, thread_guard.ENABLED_KEY, "true")
    _config(db, thread_guard.PRESET_KEY, str(_preset(db).id))
    seen = {}

    def call(**kwargs):
        seen.update(kwargs)
        return _raw(question_fit=False, question_note="The question belonged to another step.")

    assert _evaluate(db, call) == ["The question belonged to another step."]
    assert seen["provider"] == "ollama" and seen["model"] == "qwen3.8:latest"
    assert "Analizza i fattori." in seen["user_message"]
    assert db.query(models.Log).filter(models.Log.action == thread_guard.ACTION).count() == 1


@pytest.mark.parametrize("failure", [
    lambda **kwargs: (_ for _ in ()).throw(TimeoutError("too slow")),
    lambda **kwargs: (_ for _ in ()).throw(RuntimeError("provider down")),
    lambda **kwargs: "the model felt chatty today",
])
def test_a_failing_judge_leaves_no_trace(db, failure):
    _config(db, thread_guard.ENABLED_KEY, "true")
    _config(db, thread_guard.PRESET_KEY, str(_preset(db).id))
    assert _evaluate(db, failure) == []
    assert db.query(models.Log).filter(models.Log.action == thread_guard.ACTION).count() == 0


# --- injection ---
def _prepared(db, **overrides):
    from backend.ai_service import AIService
    from backend.api_models import ChatRequest
    from backend.chat_preparation import prepare_chat_turn
    from backend.prompt_config import ALL_CONFIG_TEXT_DEFINITIONS

    for definition in ALL_CONFIG_TEXT_DEFINITIONS:
        if not db.query(models.Config).filter_by(key=definition["key"]).first():
            db.add(models.Config(key=definition["key"], value=definition["default"]))
    if not db.query(models.GuidedStep).filter_by(id="cognitive").first():
        db.add(models.GuidedStep(
            id="cognitive", sort_order=1, label="1. Fattori Cognitivi", questionnaire_type="QSA",
            prompt="Analyse the cognitive factors.", system_prompt_mode="factor", color_theme="blue",
        ))
    db.flush()
    ai = AIService(db)
    ai.config.update(active_provider="ollama", model_name="test-local")
    request = ChatRequest(**{
        "message": "", "mode": "factor", "phase": "cognitive", "questionnaire_type": "QSA",
        "use_phase_prompt": True, "language": "it", **overrides,
    })
    return prepare_chat_turn(db, ai, request, SESSION, {"username": STUDENT},
                             include_retrieval=False, create_anonymous_code=False)


NOTE = "The question belonged to another step."


def _verdict_on_the_last_turn(db):
    turn = _turn(db, student="a casa mi distraggo", counselor="Capito.")
    thread_guard.store(db, session_id=SESSION, username=STUDENT, turn=turn,
                       verdict=thread_guard.parse(_raw(question_fit=False, question_note=NOTE)))


def test_a_free_turn_carries_the_thread_block(db):
    _verdict_on_the_last_turn(db)
    prepared = _prepared(db, use_phase_prompt=False, message="e quindi?")
    assert "[THREAD]" in prepared.system_prompt_final
    assert NOTE in prepared.system_prompt_final
    assert prepared.components["thread_guard"]


def test_at_step_entry_the_notes_travel_inside_the_ledger(db):
    _verdict_on_the_last_turn(db)
    prepared = _prepared(db)
    assert "[SESSION LEDGER]" in prepared.system_prompt_final
    assert NOTE in prepared.components["session_ledger"]
    assert "[THREAD]" not in prepared.system_prompt_final  # said once, not twice


def test_notes_reach_the_ledger_even_when_it_would_be_empty(db):
    turn = _turn(db, student="", counselor="Ecco i fattori.")
    thread_guard.store(db, session_id=SESSION, username=STUDENT, turn=turn,
                       verdict=thread_guard.parse(_raw(question_fit=False, question_note=NOTE)))
    prepared = _prepared(db)
    assert NOTE in prepared.system_prompt_final


def test_with_no_verdict_nothing_is_added(db):
    _turn(db, student="a casa mi distraggo", counselor="Capito.")
    prepared = _prepared(db, use_phase_prompt=False, message="e quindi?")
    assert "[THREAD]" not in prepared.system_prompt_final
    assert not prepared.components.get("thread_guard")


# --- seed ---
from backend.thread_guard_seed import seed_thread_guard  # noqa: E402


def _guard_preset(db):
    row = db.query(models.Config).filter(models.Config.key == thread_guard.PRESET_KEY).first()
    return db.query(models.ModelPreset).filter(
        models.ModelPreset.id == int(row.value)).first() if row and row.value else None


def test_the_seed_prefers_a_local_qwen_without_thinking(db):
    _preset(db, name="Qwen 3.8 Reasoning", disable_thinking=False)
    wanted = _preset(db, name="Qwen 3.8B - no reasoning", disable_thinking=True)
    _preset(db, name="Gemini", provider="gemini", model="gemini-3.8-flash")
    assert seed_thread_guard(db, models) is True
    assert _guard_preset(db).id == wanted.id
    assert db.query(models.Config).filter(
        models.Config.key == thread_guard.ENABLED_KEY).first().value == "false"


def test_the_seed_creates_the_local_judge_when_there_is_none(db):
    assert seed_thread_guard(db, models) is True
    chosen = _guard_preset(db)
    assert chosen.provider == "ollama" and chosen.model.startswith("qwen3.8")
    assert chosen.disable_thinking is True


def test_the_seed_never_overrules_the_admin(db):
    external = _preset(db, name="Deepseek", provider="deepseek", model="deepseek-v4-flash",
                       disable_thinking=False)
    _config(db, thread_guard.PRESET_KEY, str(external.id))
    _config(db, thread_guard.ENABLED_KEY, "true")
    assert seed_thread_guard(db, models) is False
    assert _guard_preset(db).id == external.id
    assert db.query(models.Config).filter(
        models.Config.key == thread_guard.ENABLED_KEY).first().value == "true"


def test_the_seed_run_twice_changes_nothing(db):
    assert seed_thread_guard(db, models) is True
    first = _guard_preset(db).id
    assert seed_thread_guard(db, models) is False
    assert _guard_preset(db).id == first
    assert db.query(models.ModelPreset).count() == 1
