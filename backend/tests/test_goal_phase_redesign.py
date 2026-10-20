"""Obiettivo complete path: one opening and five action steps, compatible with old data.

No model is called: the tests check the steps the interface receives, what the
model is told and how rows written by the previous eleven-phase path are read.
Dialogue quality needs an authorised evaluation with a model.
"""
import asyncio

import pytest

from backend import models, prompt_config, prompt_revisions
from backend.chat_logic import _guided_path_context
from backend.guided_step_label_i18n import STEP_LABEL_I18N, resolve_step_label
from backend.obiettivo_layout import RETIRED_STEP_IDS, active_guided_steps
from backend.prompt_contract import OBJECTIVE_FOCUS_SENTINEL, turn_contract
from backend.routes.chat import get_guided_ui_texts
from backend.tests.artifact_database import artifact_session

STUDIO = prompt_config.DEFAULT_OBIETTIVO_STUDIO_GUIDED_STEPS
DOCENZA = prompt_config.DEFAULT_OBIETTIVO_DOCENZA_GUIDED_STEPS

# The eleven-phase layout still stored on existing installations.
PREVIOUS_ROWS = (
    ("intro", -1, "0. Presentazione", "intro"),
    ("patto", 0, "0. Patto di Collaborazione", "obiettivo-interview"),
    ("partenza", 1, "1. Da dove parto", "obiettivo-interview"),
    ("livello", 2, "2. Il livello (Bloom)", "obiettivo-interview"),
    ("smart", 3, "3. Alla prova SMART", "obiettivo-interview"),
    ("sfida", 4, "4. Specifico e sfidante", "obiettivo-interview"),
    ("piano", 5, "5. Come ci arrivo", "obiettivo-interview"),
    ("verifica", 6, "6. Come saprò di esserci riuscito", "obiettivo-interview"),
    ("final", 7, "7. Sintesi dell'obiettivo", "obiettivo-summary"),
)


def seed_previous_layout(db, prefix="obbdocenza", qtype="OBIETTIVO_DOCENZA", personalised=()):
    for suffix, order, label, mode in PREVIOUS_ROWS:
        step_id = f"{prefix}-{suffix}"
        prompt = f"Previous factory text of {suffix}."
        db.add(models.GuidedStep(id=step_id, questionnaire_type=qtype, sort_order=order, label=label,
                                 label_i18n={"en": "2. The level (Bloom)"} if suffix == "livello" else None,
                                 prompt=prompt, system_prompt_mode=mode, color_theme="blue"))
        db.flush()
        origin = prompt_revisions.ORIGIN_ADMIN if suffix in personalised else prompt_revisions.ORIGIN_SEED
        prompt_revisions.record(db, "guided_step", step_id, prompt, origin)
    db.flush()


def ui_steps(db, qtype, lang="it"):
    return asyncio.run(get_guided_ui_texts(questionnaire_type=qtype, lang=lang, db=db))["guided_steps"]


# --- New installations ----------------------------------------------------------------------

def test_defaults_are_one_opening_and_five_action_steps():
    expected = ["intro", "partenza", "livello", "piano", "verifica", "final"]
    for prefix, steps in (("obbstudio", STUDIO), ("obbdocenza", DOCENZA)):
        ordered = sorted(steps, key=lambda step: step["sort_order"])
        assert [step["id"] for step in ordered] == [f"{prefix}-{suffix}" for suffix in expected]
        assert not {step["id"] for step in steps} & RETIRED_STEP_IDS
    labels = {step["id"]: step["label"] for step in [*STUDIO, *DOCENZA]}
    assert labels["obbdocenza-intro"] == labels["obbstudio-intro"] == "0. Presentazione e accordo"
    assert labels["obbdocenza-partenza"] == "1. Cosa vuoi che imparino"
    assert labels["obbstudio-partenza"] == "1. Cosa voglio imparare"
    assert labels["obbdocenza-livello"] == "2. Rendiamo l'obiettivo preciso"
    assert labels["obbdocenza-piano"] == "3. Come ci arriveranno"
    assert labels["obbstudio-piano"] == "3. Come ci arrivo"
    assert labels["obbdocenza-verifica"] == "4. Come verificherai che ci sono riusciti"
    assert labels["obbdocenza-final"] == "5. L'obiettivo finale"
    for label in labels.values():
        assert "Bloom" not in label and "SMART" not in label


@pytest.mark.parametrize("step_id", [step["id"] for step in [*STUDIO, *DOCENZA]])
def test_every_step_label_exists_in_the_five_other_languages(step_id):
    translations = STEP_LABEL_I18N[step_id]
    assert set(translations) == {"en", "es", "fr", "de", "sv"}
    assert all(text.strip() and "Bloom" not in text for text in translations.values())


def test_the_opening_announces_the_real_number_of_steps():
    for qtype in ("OBIETTIVO_STUDIO", "OBIETTIVO_DOCENZA"):
        steps = STUDIO if qtype == "OBIETTIVO_STUDIO" else DOCENZA
        intro = next(step for step in steps if step["id"].endswith("-intro"))["prompt"]
        working = [step for step in steps if not step["id"].endswith("-intro")]
        assert len(working) == 5 and "five steps" in intro
        assert "5" in working[-1]["label"]


# --- Existing installations: rows of the eleven-phase path ----------------------------------

def test_old_layout_reads_as_the_new_one_and_keeps_personalised_steps():
    with artifact_session() as db:
        seed_previous_layout(db, personalised=("smart",))
        steps = ui_steps(db, "OBIETTIVO_DOCENZA")
        assert [step["id"] for step in steps] == [
            "obbdocenza-intro", "obbdocenza-partenza", "obbdocenza-livello", "obbdocenza-smart",
            "obbdocenza-piano", "obbdocenza-verifica", "obbdocenza-final"]
        labels = {step["id"]: step["label"] for step in steps}
        assert labels["obbdocenza-intro"] == "Presentazione e accordo"
        assert labels["obbdocenza-livello"] == "Rendiamo l'obiettivo preciso"
        assert labels["obbdocenza-final"] == "L'obiettivo finale"
        # An administrator's step stays, with its own label.
        assert labels["obbdocenza-smart"] == "Alla prova SMART"
        assert ui_steps(db, "OBIETTIVO_DOCENZA", "en")[2]["label"] == "Making the objective precise"
        # Nothing was deleted or rewritten.
        assert db.query(models.GuidedStep).filter(models.GuidedStep.id.in_(RETIRED_STEP_IDS)).count() == 3
        assert db.query(models.GuidedStep).filter_by(id="obbdocenza-livello").one().label == "2. Il livello (Bloom)"


def test_unrecognised_retired_text_is_treated_as_personalised():
    with artifact_session() as db:
        seed_previous_layout(db)
        row = db.query(models.GuidedStep).filter_by(id="obbdocenza-sfida").one()
        row.prompt = "A text nobody registered."
        db.flush()
        ids = [step.id for step in active_guided_steps(db, db.query(models.GuidedStep).all())]
        assert "obbdocenza-sfida" in ids and "obbdocenza-smart" not in ids and "obbdocenza-patto" not in ids


def test_custom_labels_are_never_renamed():
    class Step:
        id = "obbstudio-partenza"
        label = "1. Il mio punto di partenza"
        label_i18n = {"en": "1. My own start"}
    assert resolve_step_label(Step, "it") == "1. Il mio punto di partenza"
    assert resolve_step_label(Step, "en") == "1. My own start"
    Step.label = "1. Da dove parto"
    assert resolve_step_label(Step, "it") == "1. Cosa voglio imparare"


def test_path_context_lists_the_new_path_and_ends_with_the_final_objective():
    with artifact_session() as db:
        seed_previous_layout(db)
        context = _guided_path_context(db, "OBIETTIVO_DOCENZA", "obbdocenza-final", "it")
        assert "Step 6 of 6" in context
        assert "reflection questions" not in context
        assert "final objective and the choice to save it" in context
        listing = _guided_path_context(db, "OBIETTIVO_DOCENZA", "obbdocenza-final", "it", full=True)
        assert "Rendiamo l'obiettivo preciso" in listing
        assert "SMART" not in listing and "Patto" not in listing


# --- Conduct of the conversation (runtime contract, valid before any prompt alignment) -------

def contract(qtype, phase, stage, entry):
    return turn_contract(language="it", questionnaire_type=qtype, phase=phase, advice_allowed=False,
                         objective_stage=stage, objective_entry=entry)


@pytest.mark.parametrize("qtype, prefix", [("OBIETTIVO_DOCENZA", "obbdocenza"), ("OBIETTIVO_STUDIO", "obbstudio")])
def test_contract_carries_the_conduct_rules_seen_failing_in_production(qtype, prefix):
    opening = contract(qtype, f"{prefix}-piano", "design", True)
    reply = contract(qtype, f"{prefix}-piano", "design", False)
    for text in (opening, reply):
        assert OBJECTIVE_FOCUS_SENTINEL in text
        assert "never ask for a redundant technical confirmation" in text
        assert "emit no step marker while awaiting that choice" in text
        assert "Repeat the whole objective only when it changes" in text
        assert "add no feature, constraint or condition they did not state" in text
        assert "you say where it comes from" in text
        assert "Keep every detail already agreed" in text
        assert "short example of possible answers" in text
    assert "begin with ONE short sentence that says what you do now" in opening
    assert "begin with ONE short sentence" not in reply


def test_synthesis_contract_fixes_subject_level_and_unchecked_criterion():
    teaching = contract("OBIETTIVO_DOCENZA", "obbdocenza-final", "synthesis", True)
    learning = contract("OBIETTIVO_STUDIO", "obbstudio-final", "synthesis", True)
    assert "the students of the class, never the teacher" in teaching
    assert "the person ('I')" in learning
    for text in (teaching, learning):
        assert "it must be the level of the verb you use" in text
        assert "does not check a requirement the objective names" in text
        assert "no reflective questions" in text
        assert "formulate questions about themselves" in text
    follow_up = contract("OBIETTIVO_DOCENZA", "obbdocenza-final", "synthesis", False)
    assert "answer only that message" in follow_up


def test_final_steps_and_summary_prompt_carry_the_same_rules():
    final_docenza = next(step for step in DOCENZA if step["id"] == "obbdocenza-final")["prompt"]
    assert "never the teacher" in final_docenza
    assert "the level of that verb" in final_docenza
    assert "does not check a requirement" in final_docenza
    assert "[[AVANZA_STEP]]" not in final_docenza
    summary = prompt_config.DEFAULT_SYSTEM_PROMPT_OBIETTIVO_SUMMARY
    assert "never the teacher" in summary and "[[AVANZA_STEP]]" not in summary
    assert "no reflective questions" in summary
