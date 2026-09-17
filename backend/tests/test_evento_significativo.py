"""Evento significativo: due percorsi a intervista che rileggono un solo evento.

EVENTO_STUDIO ed EVENTO_PROFESSIONALE esistevano solo come libretti. Qui si
verifica che siano strumenti interi: passi, prompt, cancelli, testi in sei
lingue, counselor che li servono e il blocco privato che precompila il libretto.
"""
import json
from pathlib import Path

from backend import models
from backend.chat_logic import _ensure_questionnaire_guided_steps
from backend.prompt_config import (
    DEFAULT_EVENTO_PROFESSIONALE_GUIDED_STEPS,
    DEFAULT_EVENTO_STUDIO_GUIDED_STEPS,
    GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS,
    GUIDED_STATIC_TEXT_DEFINITIONS,
    META_SYSTEM_PROMPT_DEFINITIONS,
    MODE_TO_SYSTEM_PROMPT_KEY,
    WELCOME_PHASE_IDS,
)
from backend.tests.artifact_database import artifact_session

EVENT_TYPES = ("EVENTO_STUDIO", "EVENTO_PROFESSIONALE")
STEPS = {
    "EVENTO_STUDIO": DEFAULT_EVENTO_STUDIO_GUIDED_STEPS,
    "EVENTO_PROFESSIONALE": DEFAULT_EVENTO_PROFESSIONALE_GUIDED_STEPS,
}
PREFIX = {"EVENTO_STUDIO": "evstudio", "EVENTO_PROFESSIONALE": "evprof"}
STEP_SUFFIXES = ("intro", "patto", "evento", "fatto", "funzionato", "criticita", "rilettura", "prossima", "final")


def test_each_path_has_intro_agreement_six_interview_steps_and_a_summary():
    for qtype, steps in STEPS.items():
        assert [s["id"] for s in steps] == [f"{PREFIX[qtype]}-{suffix}" for suffix in STEP_SUFFIXES]
        assert [s["system_prompt_mode"] for s in steps] == ["intro"] + ["evento-interview"] * 7 + ["evento-summary"]
        assert all(s["questionnaire_type"] == qtype for s in steps)
        assert all("[[AVANZA_STEP]]" in s["prompt"] for s in steps[1:])


def test_the_two_paths_ask_about_their_own_domain():
    for study, work in zip(DEFAULT_EVENTO_STUDIO_GUIDED_STEPS, DEFAULT_EVENTO_PROFESSIONALE_GUIDED_STEPS):
        assert "{domain}" not in study["prompt"] + work["prompt"]
    study_agreement, work_agreement = DEFAULT_EVENTO_STUDIO_GUIDED_STEPS[1], DEFAULT_EVENTO_PROFESSIONALE_GUIDED_STEPS[1]
    assert "study experience" in study_agreement["prompt"]
    assert "work experience" in work_agreement["prompt"]


def test_event_modes_and_intros_resolve_to_their_own_prompts():
    assert MODE_TO_SYSTEM_PROMPT_KEY["evento-interview"] == "prompt_evento_interview"
    assert MODE_TO_SYSTEM_PROMPT_KEY["evento-summary"] == "prompt_evento_summary"
    for prefix in PREFIX.values():
        assert f"{prefix}-intro" in WELCOME_PHASE_IDS
        assert GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS[f"{prefix}-intro"]["key"] == f"prompt_{prefix}_intro"
        assert "{domain}" not in GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS[f"{prefix}-intro"]["default"]
    meta = {d["key"]: d["default"] for d in META_SYSTEM_PROMPT_DEFINITIONS}
    for qtype in EVENT_TYPES:
        assert "[REFLECTIVE PRACTICE FRAME]" in meta[f"prompt_meta_{qtype}"]


def test_every_gate_lets_the_event_paths_through():
    from backend.orientation import TOOL_DESCRIPTIONS, TOOL_IDS, _KEYWORDS, _TOOL_INFO
    from backend.prompt_revisions import SCOPE_GUIDED_STEP, _factory_defaults
    from backend.routes.admin import _EXPORT_INSTRUMENT_ORDER
    from backend.routes.memory import MEMORY_QUESTIONNAIRE_TYPES
    from backend.routes.survey import STUDENT_BOOKLET_TYPES
    from backend.schemas import FROZEN_SESSION_TYPES
    from backend.skills_seed import ENGINE_INSTRUMENTS, SEEDED_INSTRUMENTS
    from backend.tool_brief_seed import TOOL_BRIEFS

    for qtype in EVENT_TYPES:
        assert qtype in MEMORY_QUESTIONNAIRE_TYPES, "la memoria di sessione scarterebbe i turni"
        assert qtype in FROZEN_SESSION_TYPES, "congelare la sessione fallirebbe"
        assert qtype in ENGINE_INSTRUMENTS, "il motore di skill non servirebbe il percorso"
        assert qtype not in SEEDED_INSTRUMENTS, "non esiste materiale certificato per gli eventi"
        assert qtype in STUDENT_BOOKLET_TYPES
        assert qtype in _EXPORT_INSTRUMENT_ORDER, "l'export dei prompt lo salterebbe"
        assert qtype in TOOL_IDS and qtype in TOOL_DESCRIPTIONS and qtype in _KEYWORDS
        assert qtype in TOOL_BRIEFS, "la Bussola non saprebbe spiegarlo"
        for lang in ("it", "en", "es", "fr", "de", "sv"):
            assert qtype in _TOOL_INFO[lang]
    factory = _factory_defaults()
    assert (SCOPE_GUIDED_STEP, "evstudio-fatto") in factory, "le revisioni non saprebbero ripristinare i passi"
    assert (SCOPE_GUIDED_STEP, "evprof-final") in factory


def test_event_steps_are_seeded_with_labels_in_every_language():
    with artifact_session() as db:
        for qtype in EVENT_TYPES:
            _ensure_questionnaire_guided_steps(db, qtype)
            rows = db.query(models.GuidedStep).filter(models.GuidedStep.questionnaire_type == qtype).all()
            assert len(rows) == len(STEP_SUFFIXES)
            for row in rows:
                assert all((row.label_i18n or {}).get(lang) for lang in ("en", "es", "fr", "de", "sv")), row.id


def test_closing_texts_exist_in_every_language():
    from backend.guided_text_i18n import GUIDED_TEXT_I18N, SECONDARY_LANGS

    keys = {d["key"] for d in GUIDED_STATIC_TEXT_DEFINITIONS}
    for qtype in ("evento_studio", "evento_professionale"):
        for kind in ("questions_intro", "conclusion"):
            key = f"text_{qtype}_{kind}"
            assert key in keys
            for lang in SECONDARY_LANGS:
                assert GUIDED_TEXT_I18N[lang][key].strip(), (key, lang)


def test_suggested_questions_cover_every_step_in_every_language():
    from backend.guided_step_questions_seed import DEFAULT_GUIDED_STEP_QUESTIONS

    translations = json.loads(
        (Path(__file__).resolve().parents[1] / "translations_seed.json").read_text(encoding="utf-8")
    )["guided_step_questions"]
    for qtype in EVENT_TYPES:
        for suffix in STEP_SUFFIXES:
            step_id = f"{PREFIX[qtype]}-{suffix}"
            assert DEFAULT_GUIDED_STEP_QUESTIONS[qtype][step_id], step_id
            for lang in ("en", "es", "fr", "de", "sv"):
                assert translations[qtype][step_id][lang], (step_id, lang)


def test_counselors_that_serve_savickas_also_serve_the_event_paths_once():
    from backend.counselor_scope import extend_interview_counselors

    with artifact_session() as db:
        narrative = models.Counselor(slug="omar", name="Omar", questionnaire_types=["COMBINED", "SAVICKAS"])
        scores_only = models.Counselor(slug="nadia", name="Nadia", questionnaire_types=["QSA", "QSAr"])
        everyone = models.Counselor(slug="marco", name="Marco", questionnaire_types=[])
        db.add_all([narrative, scores_only, everyone])
        db.flush()

        assert extend_interview_counselors(db) is True
        assert narrative.questionnaire_types == ["COMBINED", "SAVICKAS", "EVENTO_STUDIO", "EVENTO_PROFESSIONALE"]
        assert scores_only.questionnaire_types == ["QSA", "QSAr"]
        assert everyone.questionnaire_types == []

        # Una scelta dell'admin fatta dopo non viene ribaltata al riavvio.
        narrative.questionnaire_types = ["COMBINED", "SAVICKAS"]
        db.flush()
        assert extend_interview_counselors(db) is False
        assert narrative.questionnaire_types == ["COMBINED", "SAVICKAS"]


def test_the_summary_turn_asks_for_the_private_booklet_block_only_on_event_paths():
    from backend.prompt_contract import turn_contract

    def contract(qtype, synthesis):
        return turn_contract(language="it", questionnaire_type=qtype, phase="x", advice_allowed=False, synthesis=synthesis)

    assert "```booklet" in contract("EVENTO_STUDIO", True)
    assert "```booklet" in contract("EVENTO_PROFESSIONALE", True)
    assert "```booklet" not in contract("EVENTO_STUDIO", False)
    assert "```booklet" not in contract("SAVICKAS", True)


def test_the_skill_engine_serves_the_event_paths_on_existing_installations_once():
    from backend.skills_seed import apply_event_paths_policy

    with artifact_session() as db:
        db.add(models.Config(key="skills_engine_instruments", value='["QSA", "SAVICKAS", "IDEA"]'))
        db.flush()

        assert apply_event_paths_policy(db) is True
        row = db.query(models.Config).filter(models.Config.key == "skills_engine_instruments").one()
        assert json.loads(row.value) == ["QSA", "SAVICKAS", "IDEA", "EVENTO_STUDIO", "EVENTO_PROFESSIONALE"]

        # Se poi l'admin li toglie, il riavvio non li rimette.
        row.value = '["QSA", "SAVICKAS", "IDEA"]'
        db.flush()
        assert apply_event_paths_policy(db) is False
        assert json.loads(row.value) == ["QSA", "SAVICKAS", "IDEA"]
