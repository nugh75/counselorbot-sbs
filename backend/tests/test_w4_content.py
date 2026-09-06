"""Fresh-install path parity and the one-time addition to populated steps."""
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend import models
from backend.prompt_config import DEFAULT_QAP_GUIDED_STEPS, DEFAULT_QPCC_GUIDED_STEPS, SYSTEM_PROMPT_DEFAULTS, MODE_TO_SYSTEM_PROMPT_KEY
from backend.guided_step_questions_seed import seed_guided_step_questions, seed_response_openings


def test_fresh_detailed_paths_have_prompts_labels_and_questions_in_six_languages():
    engine = create_engine('sqlite://')
    for table in (models.Config.__table__, models.GuidedStep.__table__, models.GuidedStepQuestion.__table__):
        table.create(engine)
    with Session(engine) as db:
        for steps, expected in ((DEFAULT_QAP_GUIDED_STEPS, 6), (DEFAULT_QPCC_GUIDED_STEPS, 7)):
            assert len(steps) == expected
            for step in steps:
                assert step['prompt'] and all(step['label_i18n'].get(lang) for lang in ('en', 'es', 'fr', 'de', 'sv'))
                assert SYSTEM_PROMPT_DEFAULTS[MODE_TO_SYSTEM_PROMPT_KEY[step['system_prompt_mode']]]
                db.add(models.GuidedStep(**step))
        db.commit()
        seed_guided_step_questions(db, models)
        original = db.query(models.GuidedStepQuestion).first()
        original.text = 'Testo personalizzato da preservare'
        db.commit()
        assert seed_response_openings(db, models) > 0
        count = db.query(models.GuidedStepQuestion).count()
        assert seed_response_openings(db, models) == 0
        assert db.query(models.GuidedStepQuestion).count() == count
        assert db.get(models.GuidedStepQuestion, original.id).text == 'Testo personalizzato da preservare'
        for step in db.query(models.GuidedStep).all():
            for lang in ('it', 'en', 'es', 'fr', 'de', 'sv'):
                assert db.query(models.GuidedStepQuestion).filter_by(step_id=step.id, language=lang).count() > 0
