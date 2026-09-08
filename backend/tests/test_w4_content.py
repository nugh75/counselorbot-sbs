"""Fresh-install path parity and the one-time addition to populated steps."""
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend import models
from backend.prompt_config import DEFAULT_QAP_GUIDED_STEPS, DEFAULT_QPCC_GUIDED_STEPS, SYSTEM_PROMPT_DEFAULTS, MODE_TO_SYSTEM_PROMPT_KEY
from backend.guided_step_questions_seed import seed_guided_step_questions, seed_response_openings


def test_student_facing_italian_uses_accents_not_apostrophes():
    # "4. Volonta' e Perseveranza" e "Qual e' il mio punto di forza" erano testo
    # che lo studente legge. Nei commenti l'ASCII resta la convenzione del
    # codice; qui no.
    import re

    from backend.guided_step_questions_seed import DEFAULT_GUIDED_STEP_QUESTIONS
    from backend.prompt_config import (
        DEFAULT_GUIDED_STEPS,
        DEFAULT_IDEA_GUIDED_STEPS,
        DEFAULT_QAP_GUIDED_STEPS,
        DEFAULT_QPCC_GUIDED_STEPS,
        DEFAULT_QPCS_GUIDED_STEPS,
        DEFAULT_QSAR_GUIDED_STEPS,
        DEFAULT_SAVICKAS_GUIDED_STEPS,
        DEFAULT_ZTPI_GUIDED_STEPS,
    )

    # Troncamenti corretti (po', da', fa') ed elisioni (un'idea) restano fuori:
    # il difetto e' l'accento scritto con l'apostrofo.
    wrong = re.compile(
        r"\b(?:e|piu|puo|gia|cio|perche|poiche|cosi|se|sara|verra|meta|citta|"
        r"[a-z]+ita|[a-z]+eta)'(?!\w)", re.IGNORECASE
    )
    for steps in (DEFAULT_GUIDED_STEPS, DEFAULT_QSAR_GUIDED_STEPS, DEFAULT_ZTPI_GUIDED_STEPS,
                  DEFAULT_SAVICKAS_GUIDED_STEPS, DEFAULT_QPCS_GUIDED_STEPS,
                  DEFAULT_QPCC_GUIDED_STEPS, DEFAULT_QAP_GUIDED_STEPS, DEFAULT_IDEA_GUIDED_STEPS):
        for step in steps:
            assert not wrong.search(step["label"]), (step["id"], step["label"])
    for questionnaire_type, per_step in DEFAULT_GUIDED_STEP_QUESTIONS.items():
        for step_id, questions in per_step.items():
            for question in questions:
                assert not wrong.search(question), (questionnaire_type, step_id, question)


def test_step_labels_are_numbered_by_their_position():
    # La numerazione nelle label e' scritta a mano: quando un passo si inserisce
    # in mezzo (la lettura del profilo) tutte quelle che seguono vanno rifatte,
    # o il pannello mostra "1." come terzo passo del percorso.
    from backend.guided_step_label_i18n import STEP_LABEL_I18N
    from backend.prompt_config import DEFAULT_QPCS_GUIDED_STEPS

    for steps in (DEFAULT_QPCS_GUIDED_STEPS, DEFAULT_QPCC_GUIDED_STEPS, DEFAULT_QAP_GUIDED_STEPS):
        for step in steps:
            prefix = f"{step['sort_order']}. "
            assert step["label"].startswith(prefix), (step["id"], step["label"])
            # Le traduzioni stanno inline sui percorsi compatti e nel modulo
            # sugli altri: la numerazione deve reggere in entrambi i posti.
            translations = dict(STEP_LABEL_I18N.get(step["id"], {}))
            translations.update(step.get("label_i18n") or {})
            assert translations, step["id"]
            for lang, label in translations.items():
                assert label.startswith(prefix), (step["id"], lang, label)


def test_fresh_detailed_paths_have_prompts_labels_and_questions_in_six_languages():
    engine = create_engine('sqlite://')
    for table in (models.Config.__table__, models.GuidedStep.__table__, models.GuidedStepQuestion.__table__):
        table.create(engine)
    with Session(engine) as db:
        for steps, expected in ((DEFAULT_QAP_GUIDED_STEPS, 7), (DEFAULT_QPCC_GUIDED_STEPS, 8)):
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
