"""Telegram bot honours the resolved class access of the web (#94) on the Postgres test DB."""
import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from backend import models, telegram_state
from backend.tests.test_class_access import _group, db  # noqa: F401

TG_USER, TG_CHAT = 9401, 9402


@pytest.fixture
def bot():
    with patch.object(telegram_state.telegram_bot, "send_message", new=AsyncMock()) as send:
        yield send


def _link(db, username="anna", **state):
    db.add(models.TelegramAccountLink(username=username, telegram_user_id=TG_USER, telegram_chat_id=TG_CHAT))
    row = None
    if state:
        row = models.TelegramConversationState(telegram_user_id=TG_USER, telegram_chat_id=TG_CHAT,
                                               username=username, language="es", **state)
        db.add(row)
    db.commit()
    return row


def _callback(db, data):
    return telegram_state._handle_callback(db, {
        "from": {"id": TG_USER, "language_code": "es"},
        "message": {"chat": {"id": TG_CHAT, "type": "private"}},
        "data": data,
    })


def _message(db, text):
    return telegram_state._handle_message(db, {
        "from": {"id": TG_USER, "language_code": "es", "first_name": "Anna"},
        "chat": {"id": TG_CHAT, "type": "private"},
        "text": text,
    })


def _state(db):
    return db.query(models.TelegramConversationState).filter_by(telegram_user_id=TG_USER).one()


def _last_text(send):
    return send.await_args.args[1]


DENIED_ES = telegram_state.BOT_TEXTS["tool_disabled_for_class"]["es"]


# --- Instrument menu ------------------------------------------------------------

def test_menu_lists_only_class_enabled_instruments(db):
    _group(db, "a", disabled=["QSA"], members=["anna"])
    available = telegram_state._available_questionnaires(db, "anna")
    assert "QSA" not in available
    assert "SAVICKAS" in available
    callbacks = [b["callback_data"] for row in telegram_state._instrument_keyboard(db, "anna") for b in row]
    assert "instr:QSA" not in callbacks and "instr:SAVICKAS" in callbacks


def test_menu_without_class_keeps_the_admin_layer(db):
    _group(db, "a", disabled=["QSA"], members=["someone.else"])
    assert {"QSA", "SAVICKAS"} <= set(telegram_state._available_questionnaires(db, "anna"))


def test_admin_bypasses_class_but_not_the_platform_switch(db):
    db.add(models.User(username="root", hashed_password="x", is_admin=True))
    _group(db, "a", disabled=["QSA"], members=["root"])
    assert "QSA" in telegram_state._available_questionnaires(db, "root")
    db.query(models.Instrument).filter_by(code="QSA").update({"is_active": False})
    db.commit()
    # Telegram has no admin sandbox preview: a platform-disabled instrument is off for everyone.
    assert "QSA" not in telegram_state._available_questionnaires(db, "root")


def test_every_bot_language_has_the_refusal_texts():
    for key in ("tool_disabled_for_class", "tool_unavailable", "counselor_disabled_for_class", "error"):
        assert set(telegram_state.BOT_TEXTS[key]) == {"it", "en", "es", "fr", "de", "sv"}


# --- Start ----------------------------------------------------------------------

def test_disabled_instrument_callback_is_refused_in_the_user_language(db, bot):
    _group(db, "a", disabled=["QSA"], members=["anna"])
    _link(db)
    asyncio.run(_callback(db, "instr:QSA"))
    assert _last_text(bot) == DENIED_ES
    assert _state(db).state == "idle" and _state(db).questionnaire_type is None


def test_enabled_instrument_callback_asks_for_scores(db, bot):
    _group(db, "a", disabled=["SAVICKAS"], members=["anna"])
    _link(db)
    asyncio.run(_callback(db, "instr:QSA"))
    assert _state(db).state == "enter_scores" and _state(db).questionnaire_type == "QSA"


def test_confirm_checks_access_before_saving_the_result(db, bot):
    """Journal bug 07e232c3: the confirmed scores were saved before the access check."""
    _group(db, "a", disabled=["QSA"], members=["anna"])
    _link(db, state="confirm_scores", questionnaire_type="QSA", scores={"C1": 5})
    with patch.object(telegram_state, "_run_step", new=AsyncMock()) as run_step:
        asyncio.run(_callback(db, "scores:confirm"))
    run_step.assert_not_called()
    assert db.query(models.QuestionnaireResult).filter_by(username="anna").count() == 0
    assert _last_text(bot) == DENIED_ES
    assert _state(db).state == "idle" and _state(db).scores is None


def test_confirm_saves_the_result_when_allowed(db, bot):
    _group(db, "a", disabled=["SAVICKAS"], members=["anna"])
    _link(db, state="confirm_scores", questionnaire_type="QSA", scores={"C1": 5})
    with patch.object(telegram_state, "_run_step", new=AsyncMock()) as run_step:
        asyncio.run(_callback(db, "scores:confirm"))
    run_step.assert_awaited_once()
    assert db.query(models.QuestionnaireResult).filter_by(username="anna", questionnaire_type="QSA").count() == 1


def test_scores_typed_after_the_class_disabled_the_tool_are_dropped(db, bot):
    _group(db, "a", disabled=["QSA"], members=["anna"])
    _link(db, state="enter_scores", questionnaire_type="QSA", scores={})
    asyncio.run(_message(db, "C1=5"))
    assert _last_text(bot) == DENIED_ES
    assert _state(db).state == "idle"


# --- Continue -------------------------------------------------------------------

def _in_step(db):
    return _link(db, state="in_step", questionnaire_type="SAVICKAS", step_id="sav-1", session_id="tg-s")


def test_disabled_session_cannot_be_resumed_or_continued(db, bot):
    _group(db, "a", disabled=["SAVICKAS"], members=["anna"])
    _in_step(db)
    with patch.object(telegram_state, "_call_chat", new=AsyncMock(return_value="reply")) as call_chat:
        asyncio.run(_message(db, "I keep thinking about it"))
        call_chat.assert_not_called()
    assert _last_text(bot) == DENIED_ES
    assert _state(db).state == "idle" and _state(db).session_id is None


def test_resume_and_next_step_are_refused_once_disabled(db, bot):
    group = _group(db, "a", members=["anna"])
    _in_step(db)
    db.add(models.ClassSettings(group_id=group.id, disabled_tool_keys=["SAVICKAS"], updated_by="prof"))
    db.commit()
    asyncio.run(_callback(db, "flow:resume"))
    assert _last_text(bot) == DENIED_ES and _state(db).state == "idle"

    state = _state(db)
    state.state, state.questionnaire_type, state.step_id = "in_step", "SAVICKAS", "sav-1"
    db.commit()
    with patch.object(telegram_state, "_run_step", new=AsyncMock()) as run_step:
        asyncio.run(_callback(db, "step:next"))
    run_step.assert_not_called()
    assert _state(db).state == "idle"


def test_start_hides_resume_for_a_disabled_session(db, bot):
    _group(db, "a", disabled=["SAVICKAS"], members=["anna"])
    _in_step(db)
    asyncio.run(_message(db, "/start"))
    callbacks = [b["callback_data"] for row in bot.await_args.kwargs["keyboard"] for b in row]
    assert callbacks == ["flow:new"]
    assert _state(db).state == "idle"


def test_enabled_session_continues(db, bot):
    _group(db, "a", disabled=["QSA"], members=["anna"])
    _in_step(db)
    with patch.object(telegram_state, "_call_chat", new=AsyncMock(return_value="reply")) as call_chat:
        asyncio.run(_message(db, "I keep thinking about it"))
    call_chat.assert_awaited_once()
    assert _state(db).state == "in_step"


# --- pQBL and counselors --------------------------------------------------------

def test_pqbl_is_refused_when_disabled(db, bot):
    _group(db, "a", disabled=["pqbl"], members=["anna"])
    _link(db, state="idle")
    asyncio.run(_message(db, "/pqbl"))
    assert _last_text(bot) == DENIED_ES


def test_pqbl_answer_passes_the_student_identity(db, bot):
    _link(db, state="pqbl", pqbl_state={"session_id": "pq-1", "queue": [1], "index": 0})
    answer = AsyncMock(side_effect=RuntimeError("synthetic"))
    with patch("backend.routes.pqbl.answer_pqbl_question", new=answer):
        asyncio.run(_callback(db, "pqbl:ans:1:a"))
    identity = answer.await_args.args[3]
    assert identity["username"] == "anna" and identity["authenticated"] is True
    assert _last_text(bot) == telegram_state.BOT_TEXTS["error"]["es"]


def test_counselor_choice_follows_the_class(db, bot):
    allowed = models.Counselor(slug="tg-ok", name="Allowed", is_active=True, approach_categories=[])
    blocked = models.Counselor(slug="tg-no", name="Blocked", is_active=True, approach_categories=[])
    db.add_all([allowed, blocked])
    db.flush()
    group = _group(db, "a", members=["anna"])
    db.add(models.ClassSettings(group_id=group.id, disabled_counselor_ids=[blocked.id], updated_by="prof"))
    _link(db, state="idle")

    ids = [b["callback_data"] for row in telegram_state._counselor_keyboard(db, "es", "anna") for b in row]
    assert f"couns:{allowed.id}" in ids and f"couns:{blocked.id}" not in ids
    asyncio.run(_callback(db, f"couns:{blocked.id}"))
    assert _last_text(bot) == telegram_state.BOT_TEXTS["counselor_disabled_for_class"]["es"]
    assert _state(db).counselor_id is None
    asyncio.run(_callback(db, f"couns:{allowed.id}"))
    assert _state(db).counselor_id == allowed.id
