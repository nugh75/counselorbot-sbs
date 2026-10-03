"""QSA guide, exact factory upgrades, instrument ownership and six-language turns."""
import asyncio
import json
import re
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

import pytest

from backend import models, prompt_config as config, prompt_revisions, schemas
from backend.chat_logic import get_prompt_component_flags
from backend.guided_step_classification import INTRO_OWNERS, repair_intro_classification
from backend.prompt_audit import build_prompt_audit
from backend.prompt_updates import apply_plan
from backend.qsa_factory_alignment import make_plan
from backend.routes.admin import admin_list_guided_steps
from backend.tests.artifact_database import artifact_session


OLD_COGNITIVE = "Analyse ONLY the COGNITIVE factors (C1-C7) of my QSA profile. For each, give the score, interpretation and a short comment."
OLD_AFFECTIVE = "Analyse ONLY the AFFECTIVE factors (A1-A7) of my QSA profile. For each, give the score, interpretation and a short comment."


def guide_prompts():
    """Read the independently authored guide already tracked in the repository."""
    path = Path(__file__).resolve().parents[2] / "docs/Guida_Costruzione_Prompt_QSA_CounselorBot.docx"
    w = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    with ZipFile(path) as archive:
        body = ET.fromstring(archive.read("word/document.xml")).find(w + "body")
    steps, prompts, step_id = {}, {}, None
    def text(node):
        return "".join((n.text or "") if n.tag == w + "t" else "\n" if n.tag == w + "br" else "" for n in node.iter())
    for block in body:
        if block.tag == w + "p":
            match = re.match(r"Step \d+:.*\(id: ([^)]+)\)", text(block))
            if match:
                step_id = match[1]
        elif block.tag == w + "tbl":
            value = "\n".join(text(p) for p in block.iter(w + "p") if text(p).strip())
            heading, _, prompt = value.partition("\n")
            if "Step Prompt Reale" in heading:
                steps[step_id] = prompt.strip()
            elif ("PROMPT DAL DATABASE" in heading or "FRAMEWORK TEORICO PELLEREY" in heading) and "prompt_" in heading:
                key = re.search(r"prompt_[A-Za-z0-9_-]+", heading)[0]
                prompts[key] = prompt.strip()
    return steps, prompts


def add_step(db, step_id, instrument="QSA", prompt="Custom English instruction."):
    row = models.GuidedStep(id=step_id, questionnaire_type=instrument, sort_order=0,
                            label="Presentazione", prompt=prompt, system_prompt_mode="intro", color_theme="teal")
    db.add(row)
    return row


def test_qsa_factory_matches_all_ten_guide_steps_and_keeps_the_synthesis_veto():
    steps, _ = guide_prompts()
    assert len(steps) == len(config.DEFAULT_GUIDED_STEPS) == 10
    for step in config.DEFAULT_GUIDED_STEPS:
        expected = steps[step["id"]]
        if step["id"] == "sl-synthesis":
            expected += config.SYNTHESIS_ADVICE_DIRECTIVE
        assert step["prompt"] == expected, step["id"]


def test_qsa_system_and_pedagogical_prompts_match_the_guide():
    _, prompts = guide_prompts()
    defaults = {item["key"]: item["default"] for item in config.ALL_CONFIG_TEXT_DEFINITIONS}
    for key, expected in prompts.items():
        if not key.startswith("prompt_qsar_"):
            assert defaults[key] == expected, key


@pytest.mark.parametrize("instrument,name", [
    ("QSA", "DEFAULT_GUIDED_STEPS"), ("QSAr", "DEFAULT_QSAR_GUIDED_STEPS"),
    ("ZTPI", "DEFAULT_ZTPI_GUIDED_STEPS"), ("SAVICKAS", "DEFAULT_SAVICKAS_GUIDED_STEPS"),
    ("QPCS", "DEFAULT_QPCS_GUIDED_STEPS"), ("QPCC", "DEFAULT_QPCC_GUIDED_STEPS"),
    ("QAP", "DEFAULT_QAP_GUIDED_STEPS"), ("IDEA", "DEFAULT_IDEA_GUIDED_STEPS"),
    ("EVENTO_STUDIO", "DEFAULT_EVENTO_STUDIO_GUIDED_STEPS"),
    ("EVENTO_PROFESSIONALE", "DEFAULT_EVENTO_PROFESSIONALE_GUIDED_STEPS"),
    ("OBIETTIVO_STUDIO", "DEFAULT_OBIETTIVO_STUDIO_GUIDED_STEPS"),
    ("OBIETTIVO_DOCENZA", "DEFAULT_OBIETTIVO_DOCENZA_GUIDED_STEPS"),
])
def test_every_factory_step_explicitly_declares_its_instrument(instrument, name):
    assert all(step.get("questionnaire_type") == instrument for step in getattr(config, name))


def test_repair_moves_only_misclassified_factory_ids_and_preserves_translations_and_prompts():
    with artifact_session() as db:
        rows = [add_step(db, key) for key in INTRO_OWNERS]
        for row in rows:
            row.label_i18n = {"en": "Personalised welcome", "sv": "Välkommen"}
        add_step(db, "intro")
        add_step(db, "custom-qsa")
        db.commit()
        before = {row.id: (row.prompt, dict(row.label_i18n), row.sort_order, row.system_prompt_mode) for row in rows}
        assert set(repair_intro_classification(db)) == set(INTRO_OWNERS)
        db.commit()
        assert repair_intro_classification(db) == []
        for row in rows:
            assert row.questionnaire_type == INTRO_OWNERS[row.id]
            assert (row.prompt, row.label_i18n, row.sort_order, row.system_prompt_mode) == before[row.id]
        assert db.query(models.GuidedStep).filter_by(questionnaire_type="QSA").count() == 2


def test_plan_is_read_only_preserves_customisations_and_applies_with_rollback():
    with artifact_session() as db:
        add_step(db, "cognitive", prompt=OLD_COGNITIVE)
        add_step(db, "affective", prompt=OLD_AFFECTIVE)
        add_step(db, "intro", prompt="My personalised English welcome.")
        db.add(models.Config(key="prompt_factor", value="My personalised English reading."))
        db.add(models.Config(key="guided_step_prompt_cognitive__sv", value="Existing language override"))
        prompt_revisions.record(db, "guided_step", "affective", OLD_AFFECTIVE, "admin")
        db.commit()
        plan = make_plan(db)
        assert [(c["scope"], c["key"]) for c in plan["changes"]] == [("guided_step", "cognitive")]
        assert {c["key"] for c in plan["preserved"]} == {"intro", "affective", "prompt_factor"}
        assert db.query(models.GuidedStep).filter_by(id="cognitive").one().prompt == OLD_COGNITIVE
        assert apply_plan(db, plan) == 1
        assert make_plan(db)["changes"] == []
        assert apply_plan(db, plan, rollback=True) == 1
        assert db.query(models.GuidedStep).filter_by(id="cognitive").one().prompt == OLD_COGNITIVE
        assert db.query(models.Config).filter_by(key="guided_step_prompt_cognitive__sv").one().value == "Existing language override"


def test_a_concurrent_prompt_edit_rejects_the_reviewed_alignment():
    with artifact_session() as db:
        row = add_step(db, "cognitive", prompt=OLD_COGNITIVE)
        db.commit()
        plan = make_plan(db)
        row.prompt = "An English edit after the review."
        db.commit()
        with pytest.raises(ValueError, match="changed since review"):
            apply_plan(db, plan)
        assert row.prompt == "An English edit after the review."


def test_qsa_factory_components_support_requested_advice_but_honour_admin_overrides():
    with artifact_session() as db:
        assert get_prompt_component_flags(db, "QSA", "cognitive")["affective_factors"] is False
        assert get_prompt_component_flags(db, "QSA", "cognitive")["knowledge"] is False
        assert get_prompt_component_flags(db, "QSA", "cognitive", advice_requested=True)["certified_strategies"] is True
        assert get_prompt_component_flags(db, "QSA", "sl-synthesis", advice_requested=True)["certified_strategies"] is False
        assert get_prompt_component_flags(db, "QSA", "intro", advice_requested=True)["certified_strategies"] is False
        db.add(models.Config(key="prompt_components_QSA_cognitive", value='{"certified_strategies": false}'))
        db.commit()
        assert get_prompt_component_flags(db, "QSA", "cognitive", advice_requested=True)["certified_strategies"] is False


def test_admin_editor_gets_qsa_defaults_without_changing_other_instruments():
    with artifact_session() as db:
        add_step(db, "cognitive")
        add_step(db, "savickas-intro", "SAVICKAS")
        db.commit()
        rows = asyncio.run(admin_list_guided_steps(current_user={"username": "test"}, db=db))
        assert next(row for row in rows if row.id == "cognitive").component_defaults["affective_factors"] is False
        assert next(row for row in rows if row.id == "savickas-intro").component_defaults is None


class FactoryAI:
    def __init__(self, db):
        self.config = {item["key"]: item["default"] for item in config.ALL_CONFIG_TEXT_DEFINITIONS}
        self.disable_thinking = False


@pytest.mark.parametrize("language,name", [("it", "Italian"), ("en", "English"), ("es", "Spanish"),
                                           ("fr", "French"), ("de", "German"), ("sv", "Swedish")])
def test_all_qsa_steps_keep_english_instructions_and_select_the_response_language(language, name):
    with artifact_session() as db:
        db.add_all([models.GuidedStep(**step) for step in config.DEFAULT_GUIDED_STEPS])
        db.commit()
        for step in config.DEFAULT_GUIDED_STEPS:
            payload = schemas.PromptAuditRequest(questionnaire_type="QSA", language=language,
                phase=step["id"], mode=step["system_prompt_mode"], use_phase_prompt=True,
                message="", include_history=False, include_knowledge=False)
            result = build_prompt_audit(db, payload, ai_service_cls=FactoryAI)
            assert result["inputs"]["effective_user_message"] == step["prompt"]
            assert result["resolved"]["questionnaire_type"] == "QSA"
            assert result["resolved"]["language"] == language
            assert f"in {name}" in result["envelope"]["system_prompt_final"]
            assert result["resolved"]["prompt_key"] != "prompt_savickas_intro"
        assert db.query(models.Log).count() == 0
