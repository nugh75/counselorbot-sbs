"""Explicit QPCC factory update with review, atomic CAS and rollback.

No result, validation answer, log, frozen session or production data is rewritten.
Prepare the plan on the target DB, review it, then explicitly apply it. Personalised
texts and existing canonical factor records are preserved and reported.
"""
import argparse
import hashlib
import json
from pathlib import Path

from . import models, prompt_config, prompt_revisions
from .db_compat import xact_lock
from .qpcc import FACTORS

FIELDS = {
    'config': (models.Config, 'key', ('value',)),
    'step': (models.GuidedStep, 'id', ('prompt', 'label', 'label_i18n', 'color_theme')),
    'factor': (models.Factor, 'id', ('instrument_code', 'code', 'sort_order', 'dimension', 'orientation', 'is_interpretation_inverted', 'label_it', 'label_en', 'label_es', 'label_sv', 'label_i18n')),
    'item': (models.QuestionnaireItem, 'id', ('active',)),
    'question': (models.GuidedStepQuestion, 'id', ('text',)),
    'brief': (models.OrientationToolBrief, 'tool_id', ('brief',)),
}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def values(row, fields):
    return {field: getattr(row, field) for field in fields} if row is not None else None


def make_plan(db):
    legacy = json.loads(Path(__file__).with_name('qpcc_factory_legacy.json').read_text())
    defaults = {d['key']: d['default'] for d in prompt_config.ALL_CONFIG_TEXT_DEFINITIONS}
    steps = {s['id']: s for s in prompt_config.DEFAULT_QPCC_GUIDED_STEPS}
    changes, preserved = [], []

    def add(scope, key, row, after):
        before = values(row, FIELDS[scope][2])
        if before != after:
            changes.append({'scope': scope, 'key': key, 'before': before, 'after': after, 'expected_hash': digest(before)})

    for key, old in legacy['configs'].items():
        row = db.query(models.Config).filter_by(key=key).first()
        if row is None:
            continue
        if row.value == defaults[key]:
            continue
        if row.value != old or prompt_revisions.is_admin_owned(db, 'config', key):
            preserved.append(f'personalised config:{key}')
        else:
            add('config', key, row, {'value': defaults[key]})
    for key, old in legacy['steps'].items():
        row = db.query(models.GuidedStep).filter_by(id=key).first()
        if row is None:
            continue
        if row.questionnaire_type != 'QPCC':
            preserved.append(f'different instrument step:{key}')
            continue
        after = {f: steps[key].get(f) for f in FIELDS['step'][2]}
        if values(row, FIELDS['step'][2]) == after:
            continue
        if row.prompt not in (old['prompt'], steps[key]['prompt']) or prompt_revisions.is_admin_owned(db, 'guided_step', key):
            preserved.append(f'personalised step:{key}')
            continue
        # Keep customised labels/themes while updating exact factory fields only.
        after = {f: after[f] if getattr(row, f) == old.get(f) or getattr(row, f) == after[f] else getattr(row, f) for f in after}
        add('step', key, row, after)
    for order, factor in enumerate(FACTORS):
        rows = db.query(models.Factor).filter_by(instrument_code='QPCC', code=factor['code']).all()
        if rows:
            preserved.append(f'existing canonical factor:{factor["code"]}')
            continue
        after = dict(instrument_code='QPCC', code=factor['code'], sort_order=order,
                     dimension=factor['dimension'], orientation=factor['orientation'],
                     is_interpretation_inverted=factor['orientation'] == 'difficulty',
                     label_i18n=factor['labels'], **{f'label_{l}':factor['labels'][l] for l in ('it','en','es','sv')})
        add('factor', factor['code'], None, after)
    row = db.query(models.OrientationToolBrief).filter_by(tool_id='QPCC').first()
    if row is not None:
        from .tool_brief_seed import TOOL_BRIEFS
        if row.brief == legacy['brief']:
            add('brief', 'QPCC', row, {'brief': TOOL_BRIEFS['QPCC']})
        elif row.brief != TOOL_BRIEFS['QPCC']:
            preserved.append('personalised brief:QPCC')
    for row in db.query(models.GuidedStepQuestion).filter_by(questionnaire_type='QPCC').all():
        new = legacy['new_questions'].get(row.step_id, {}).get(row.language)
        old = (legacy['questions_it'].get(row.step_id) if row.language == 'it' else
               legacy['questions_i18n'].get(row.step_id, {}).get(row.language))
        if not new or not old or row.text in new:
            continue
        if row.text in old:
            add('question', row.id, row, {'text': new[old.index(row.text)]})
        else:
            preserved.append(f'personalised question:{row.id}')
    # Retire rather than delete replacement items, including customised versions.
    # They cannot establish the authorised canonical key or validated norms.
    for row in db.query(models.QuestionnaireItem).filter_by(instrument_code='QPCC', active=True).order_by(models.QuestionnaireItem.id).all():
        add('item', row.id, row, {'active': False})
    for row in db.query(models.GuidedStep).filter_by(questionnaire_type='QPCC').all():
        if row.id not in legacy['steps']:
            preserved.append(f'review custom or compact path step:{row.id}')
    for row in db.query(models.Config).filter(models.Config.key.ilike('%qpcc%')).all():
        if '__' in row.key and row.key not in legacy['configs']:
            preserved.append(f'review prompt variant:{row.key}')
    return {'version': 1, 'changes': changes, 'preserved': preserved}


def apply_plan(db, plan, *, rollback=False):
    pending = []
    try:
        xact_lock(db, 242, 63)
        for change in plan['changes']:
            scope = change['scope']
            if scope == 'config' and change['key'] not in json.loads(Path(__file__).with_name('qpcc_factory_legacy.json').read_text())['configs']:
                raise ValueError('Config outside QPCC alignment')
            if scope == 'brief' and change['key'] != 'QPCC':
                raise ValueError('Brief outside QPCC alignment')
            cls, key_field, fields = FIELDS[scope]
            if scope == 'factor':
                query = db.query(cls).filter_by(instrument_code='QPCC', code=change['key'])
            else:
                query = db.query(cls).filter(getattr(cls, key_field) == change['key'])
            rows = query.with_for_update().all()
            if len(rows) > 1:
                raise ValueError('Duplicate alignment target')
            row = rows[0] if rows else None
            expected = digest(change['after']) if rollback else change['expected_hash']
            if digest(values(row, fields)) != expected:
                raise ValueError(f'QPCC target changed since review: {scope}/{change["key"]}')
            if scope in ('factor', 'item') and row is not None and row.instrument_code != 'QPCC':
                raise ValueError('Different instrument')
            if scope in ('step', 'question') and (row is None or row.questionnaire_type != 'QPCC'):
                raise ValueError('Different instrument')
            if not rollback and scope in ('config', 'step') and prompt_revisions.is_admin_owned(db, 'guided_step' if scope == 'step' else 'config', change['key']):
                raise ValueError('Prompt ownership changed since review')
            after = change['before'] if rollback else change['after']
            if after is not None and set(after) != set(fields):
                raise ValueError('Invalid alignment fields')
            pending.append((scope, cls, row, change, after))
        for scope, cls, row, change, after in pending:
            if scope in ('config', 'step'):
                revision_scope = 'guided_step' if scope == 'step' else 'config'
                field = 'prompt' if scope == 'step' else 'value'
                prompt_revisions.record(db, revision_scope, change['key'], getattr(row, field),
                                        prompt_revisions.ORIGIN_MIGRATION, author='qpcc-alignment', note='QPCC reviewed baseline')
            if after is None:
                db.delete(row)  # only canonical factor rows created by this exact plan
            elif row is None:
                db.add(cls(**after))
            else:
                for field, value in after.items():
                    setattr(row, field, value)
            if scope in ('config', 'step'):
                prompt_revisions.record(db, revision_scope, change['key'], after['value' if scope == 'config' else 'prompt'],
                                        prompt_revisions.ORIGIN_MIGRATION, author='qpcc-alignment', note='QPCC approved rollback' if rollback else 'QPCC approved alignment')
        db.commit()
    except Exception:
        db.rollback()
        raise
    return len(pending)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('plan','apply','rollback'))
    parser.add_argument('path', type=Path)
    args = parser.parse_args()
    from .database import SessionLocal
    with SessionLocal() as db:
        if args.action == 'plan':
            plan = make_plan(db)
            args.path.write_text(json.dumps(plan, ensure_ascii=False, indent=2)+'\n')
            args.path.chmod(0o600)
            print(f'Prepared {len(plan["changes"])} QPCC changes; {len(plan["preserved"])} preserved targets. Review {args.path}.')
        else:
            print(f'Applied {apply_plan(db,json.loads(args.path.read_text()),rollback=args.action=="rollback")} QPCC changes.')


if __name__ == '__main__':
    main()
