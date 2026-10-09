"""Telegram score entry cannot carry a verification grant: institute-backed plans refuse it (#149)."""
import asyncio

from backend import models, telegram_state
from backend.tests.test_class_access import _group, db  # noqa: F401
from backend.tests.test_class_access_telegram import _callback, _last_text, _link, bot  # noqa: F401


def _plan(db, group, *, linked):
    institution = models.Institution(slug=f'tg-{group.id}', name='Synthetic school', institution_code='SYN-TG',
                                     hashed_password=models.get_password_hash('Telegram-149'))
    db.add(institution)
    db.flush()
    if linked:
        group.institution_id = institution.id
    db.add(models.AdministrationPlan(code=f'AP-TG{group.id:04d}', title='Plan', instrument_code='QSA', group_id=group.id,
                                     status='active', institution_id=institution.id if linked else None,
                                     institution_link_state='linked' if linked else 'unlinked'))
    db.commit()


def _confirm(db):
    _link(db, state='confirm_scores', questionnaire_type='QSA', scores={'C1': 5})
    asyncio.run(_callback(db, 'scores:confirm'))


def test_institute_backed_class_plan_refuses_telegram_scores_before_any_write(db, bot):
    _plan(db, _group(db, 'a', members=['anna']), linked=True)
    _confirm(db)
    assert db.query(models.QuestionnaireResult).count() == 0
    assert _last_text(bot) == telegram_state.BOT_TEXTS['institution_verification_required']['es']


def test_no_institute_class_plan_keeps_telegram_score_entry(db, bot):
    _plan(db, _group(db, 'a', members=['anna']), linked=False)
    _confirm(db)
    assert db.query(models.QuestionnaireResult).one().administration_plan_id is not None
