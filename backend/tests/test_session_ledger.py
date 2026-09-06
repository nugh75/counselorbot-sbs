"""The student's answers and choices must outlive the verbatim history window."""
import pytest

from backend import models, session_ledger
from backend.ai_service import AIService
from backend.api_models import ChatRequest
from backend.chat_preparation import prepare_chat_turn
from backend.prompt_config import ALL_CONFIG_TEXT_DEFINITIONS
from backend.tests.artifact_database import artifact_session

SESSION = "ledger-fixture"
STUDENT = "alice"


def _turn(db, *, student="", counselor="", phase="cognitive"):
    db.add(models.Log(
        session_id=SESSION, username=STUDENT, action="chat_message", phase=phase,
        questionnaire_type="QSA",
        details={"user_input": student, "effective_user_input": student or "[step]",
                 "bot_response": counselor},
    ))
    db.flush()


@pytest.fixture
def db():
    with artifact_session() as session:
        yield session


def test_answers_survive_the_window_that_drops_them(db):
    # Twelve turns: memory_service would already have dropped the first exchanges.
    _turn(db, student="a casa mi distraggo, ma sviluppare counselorbot mi tiene concentrato",
          counselor="Capito.")
    for filler in range(11):
        _turn(db, student=f"turno {filler}", counselor="x" * 1200)
    ledger = session_ledger.build(db, session_id=SESSION, username=STUDENT)
    words = [answer["text"] for answer in ledger["answers"]]
    assert words[0].startswith("a casa mi distraggo")  # substance outlives the window
    assert words[-session_ledger.KEEP_RECENT:] == ["turno 9", "turno 10"]  # and so does recency
    assert len(ledger["answers"]) == session_ledger.MAX_ANSWERS


def test_a_procedural_request_yields_its_place_to_an_answer(db):
    _turn(db, student="dipende dal compito: leggere un paper mi costa, scrivere codice no",
          counselor="Chiaro.")
    for request in ("fai uno schema", "e lo schema?", "crea un diagramma", "rifallo bene",
                    "ancora", "un altro", "ok", "sì", "avanti", "va bene"):
        _turn(db, student=request, counselor="Ecco.")
    kept = [answer["text"] for answer in
            session_ledger.build(db, session_id=SESSION, username=STUDENT)["answers"]]
    assert len(kept) == session_ledger.MAX_ANSWERS
    assert kept[0].startswith("dipende dal compito")  # the answer outranks ten later requests
    assert kept[-session_ledger.KEEP_RECENT:] == ["avanti", "va bene"]  # the tail stays


def test_hidden_step_directives_are_not_the_student_speaking(db):
    _turn(db, student="", counselor="Ecco i tuoi fattori cognitivi.")
    ledger = session_ledger.build(db, session_id=SESSION, username=STUDENT)
    assert ledger["answers"] == []


def test_a_question_walked_past_stays_open_and_an_answered_one_does_not(db):
    _turn(db, student="dimmi di più", counselor="Riconosci questo schema: perdi il filo dopo dieci minuti?")
    assert session_ledger.build(db, session_id=SESSION, username=STUDENT)["open_question"] == (
        "Riconosci questo schema: perdi il filo dopo dieci minuti?"
    )
    _turn(db, student="", counselor="Analisi del prossimo step.", phase="affective")
    assert "Riconosci questo schema" in session_ledger.build(db, session_id=SESSION, username=STUDENT)["open_question"]
    _turn(db, student="sì, mi ci ritrovo", counselor="Allora partiamo da lì.")
    assert session_ledger.build(db, session_id=SESSION, username=STUDENT)["open_question"] == ""


def test_diagrams_are_not_mistaken_for_the_question(db):
    _turn(db, student="fai uno schema", counselor=(
        "Ecco lo schema.\n\n```diagram\n{\"type\":\"flow\",\"title\":\"Come mai?\",\"nodes\":[],\"edges\":[]}\n```\n"
    ))
    assert session_ledger.build(db, session_id=SESSION, username=STUDENT)["open_question"] == ""


def _strategies(db, *pairs):
    for slug, status in pairs:
        db.add(models.RecommendationHistory(
            username=STUDENT, session_id=SESSION, recommendation_type="strategy", slug=slug,
            payload={"name": f"Strategia {slug}", "status": status},
        ))
    db.flush()


def test_only_actions_the_student_chose_are_pending(db):
    _strategies(db, ("chosen", "selected"), ("done", "tried"),
                ("shown", "proposed"), ("refused", "dismissed"))
    ledger = session_ledger.build(db, session_id=SESSION, username=STUDENT)
    assert ledger["pending_actions"] == ["Strategia chosen"]
    assert ledger["refused_actions"] == ["Strategia refused"]


def test_a_chosen_action_is_verified_once_and_not_at_every_step(db):
    _strategies(db, ("chosen", "selected"))
    _turn(db, student="ok", counselor="Bene.")
    first = session_ledger.block(db, session_id=SESSION, username=STUDENT)
    assert "Ask how that action went" in first

    _turn(db, student="", counselor="Come è andata con quella micro-azione?")
    again = session_ledger.block(db, session_id=SESSION, username=STUDENT)
    assert "Strategia chosen" in again  # still pending, still visible
    assert "Ask how that action went" not in again  # but asked once is enough


def test_an_action_that_only_lived_in_the_prose_is_still_verified(db):
    # No catalogue row is ever marked selected in production: the promise is text.
    _turn(db, student="e adesso?", counselor=(
        "C6 resta la leva.\n\n**Azione di oggi:** prima di aprire il testo, scrivi su un "
        "post-it che cosa devi produrre in questa sessione."
    ))
    ledger = session_ledger.build(db, session_id=SESSION, username=STUDENT)
    assert ledger["pending_actions"] == []
    assert ledger["proposed_action"].startswith("Azione di oggi: prima di aprire il testo")
    block = session_ledger.block(db, session_id=SESSION, username=STUDENT)
    assert "The action you proposed and never came back to:" in block
    assert "Ask how that action went" in block


def test_a_bare_heading_takes_the_action_from_the_line_below(db):
    _turn(db, student="ok", counselor=(
        "**Azione da fare oggi (durata: 10-20 minuti):**\n\n"
        "Quando studi con qualcuno, esercitati a non rispondere subito."
    ))
    action = session_ledger.build(db, session_id=SESSION, username=STUDENT)["proposed_action"]
    assert "esercitati a non rispondere subito" in action


def test_prose_about_this_week_is_not_a_commitment(db):
    _turn(db, student="ok", counselor="Questa settimana molti studenti trovano il ritmo difficile.")
    assert session_ledger.build(db, session_id=SESSION, username=STUDENT)["proposed_action"] == ""


def test_a_chosen_catalogue_item_wins_over_the_prose(db):
    _strategies(db, ("chosen", "selected"))
    _turn(db, student="ok", counselor="**Oggi:** scrivi tre frasi a libro chiuso su un capitolo.")
    block = session_ledger.block(db, session_id=SESSION, username=STUDENT)
    assert "Chosen by the student and not yet reported as tried:" in block
    assert "The action you proposed and never came back to:" not in block


def test_a_step_played_twice_is_recalled_not_regenerated(db):
    """18 sessioni su 160 tornano su uno step gia' fatto, per 33 riesecuzioni:
    il modello riscriveva un'analisi quasi identica perche' niente gli diceva
    di averla gia' scritta."""
    db.add(models.Log(
        session_id=SESSION, username=STUDENT, action="chat_message", phase="cognitive",
        questionnaire_type="QSA",
        details={"user_input": "", "effective_user_input": "[step]", "bot_response": "Ecco i fattori.",
                 "guided_phase_prompt_key": "guided_step:cognitive"},
    ))
    db.flush()
    first_time = session_ledger.build(db, session_id=SESSION, username=STUDENT, step_id="affective")
    assert first_time["replayed_step"] is False

    again = session_ledger.build(db, session_id=SESSION, username=STUDENT, step_id="cognitive")
    assert again["replayed_step"] is True
    block = session_ledger.block(db, session_id=SESSION, username=STUDENT, step_id="cognitive")
    assert "You already ran this step in this session" in block


def test_a_refusal_is_not_reopened(db):
    _strategies(db, ("refused", "dismissed"))
    block = session_ledger.block(db, session_id=SESSION, username=STUDENT)
    assert "Already refused by the student:" in block
    assert "Never propose a refused item again" in block


def test_an_overtaken_question_is_let_go(db):
    _turn(db, student="dimmi di più", counselor="Riconosci questo schema?")
    assert session_ledger.build(db, session_id=SESSION, username=STUDENT)["open_question"]
    for _ in range(session_ledger.OPEN_QUESTION_MAX_AGE + 1):
        _turn(db, student="", counselor="Analisi del prossimo step.")
    assert session_ledger.build(db, session_id=SESSION, username=STUDENT)["open_question"] == ""


def test_directives_appear_only_when_the_ledger_can_support_them(db):
    _turn(db, student="a casa mi distraggo", counselor="Capito.")
    block = session_ledger.block(db, session_id=SESSION, username=STUDENT)
    assert "a casa mi distraggo" in block
    assert "Act on this before the analysis" not in block


def test_another_students_session_is_never_read(db):
    _turn(db, student="parole di alice", counselor="ok")
    assert session_ledger.build(db, session_id=SESSION, username="bob")["answers"] == []
    assert session_ledger.build(db, session_id="altra", username=STUDENT)["answers"] == []


def test_block_is_bounded_and_drops_the_oldest_answers_first(db):
    # A full ledger: long answers, a chosen action, a refusal and an open question.
    _strategies(db, ("chosen", "selected"), ("refused", "dismissed"))
    for index in range(session_ledger.MAX_ANSWERS - 1):
        _turn(db, student=f"{index} " + "parola " * 60, counselor="ok")
    _turn(db, student=f"{session_ledger.MAX_ANSWERS - 1} " + "parola " * 60,
          counselor="E tu come la vedi?")
    block = session_ledger.block(db, session_id=SESSION, username=STUDENT)
    assert len(block) <= session_ledger.MAX_BLOCK_CHARS
    assert f"{session_ledger.MAX_ANSWERS - 1} parola" in block  # the most recent survives
    assert "0 parola" not in block  # the oldest answer is what goes
    assert "Strategia chosen" in block  # never the actions
    assert "E tu come la vedi?" in block  # nor the open question
    assert "Ask how that action went" in block  # nor the directives


def test_empty_session_renders_nothing(db):
    assert session_ledger.block(db, session_id=SESSION, username=STUDENT) == ""
    assert session_ledger.build(db, session_id="", username="")["answers"] == []


def _prepared(db, **overrides):
    include_history = overrides.pop("include_history", True)
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
                             include_retrieval=False, create_anonymous_code=False,
                             include_history=include_history)


def test_step_entry_carries_the_ledger_and_a_free_turn_does_not(db):
    _turn(db, student="a casa mi distraggo", counselor="Capito.")
    entering = _prepared(db)
    assert "[SESSION LEDGER]" in entering.system_prompt_final
    assert "a casa mi distraggo" in entering.system_prompt_final
    assert entering.components["session_ledger"]

    follow_up = _prepared(db, use_phase_prompt=False, message="e quindi?")
    assert "[SESSION LEDGER]" not in follow_up.system_prompt_final


def test_offline_preparation_stays_free_of_session_data(db):
    _turn(db, student="a casa mi distraggo", counselor="Capito.")
    audited = _prepared(db, include_history=False)
    assert "[SESSION LEDGER]" not in audited.system_prompt_final
