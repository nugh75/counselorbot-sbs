"""Student-owned timeline, with a one-time, lossless extraction of legacy work."""
import hashlib
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, text

from . import models
from .orientation_referral_service import _i18n, _matches, _scoped
from .reading_audience import resolve_audience_band
from .referral_scope import institution_ids_for
from .visual_tools import (ACTION, PERSONAL_ACTION, Action, PersonalWorkspace, SavePersonalWorkspace, Workspace,
                           load_workspace, save_workspace)

IMPORT_ACTION = 'personal_timeline_import'
MIGRATION_ACTION = 'activities_timeline_migration'

# Italian labels for the personal_links trace kept on a migrated activity (spec Sec.5: lossless).
_PERSONAL_LINK_LABELS_IT = [('notebook', 'Taccuino'), ('booklet', 'Libretto'), ('orientation', 'Orientamento')]


def imported_id(session_id, item_id):
    return hashlib.sha256(f'{session_id}:{item_id}'.encode()).hexdigest()


def _lock_personal_timeline(db, username):
    # Shared by every entry point that may import or migrate the personal workspace:
    # two tabs (or an import followed by a migration in the same request) cannot race.
    if db.get_bind().dialect.name == 'postgresql':
        key = int.from_bytes(hashlib.sha256(f'{username}:None'.encode()).digest()[:8], 'big', signed=True)
        db.execute(text('SELECT pg_advisory_xact_lock(:key)'), {'key': key})


def ensure_personal_timeline(db, username):
    _lock_personal_timeline(db, username)
    _import_legacy(db, username)
    migrate_future_events(db, username)


def _import_legacy(db, username):
    if db.query(models.Log.id).filter_by(username=username, action=IMPORT_ACTION).first():
        return
    latest = db.query(func.max(models.Log.id)).filter(models.Log.username == username,
        models.Log.action == ACTION).group_by(models.Log.session_id)
    rows = db.query(models.Log).filter(models.Log.id.in_(latest)).order_by(models.Log.id).all()
    work = PersonalWorkspace.model_validate(load_workspace(db, None, username)['workspace'])
    imported = []
    for row in rows:
        legacy = Workspace.model_validate(row.details['workspace'])
        if not legacy.timeline.events:
            continue
        linked = {id for event in legacy.timeline.events for id in event.action_ids}
        for action in legacy.actions:
            if action.id in linked:
                action.id = imported_id(row.session_id, action.id)
                work.actions.append(action)
        for event in legacy.timeline.events:
            event.id = imported_id(row.session_id, event.id)
            event.action_ids = [imported_id(row.session_id, id) for id in event.action_ids]
            work.timeline.events.append(event)
        if not work.timeline.title:
            work.timeline.title = legacy.timeline.title
        imported.append(row.id)
    if imported:
        db.add(models.Log(username=username, session_id=None, action=PERSONAL_ACTION,
                          details={'workspace': work.model_dump()}))
    db.add(models.Log(username=username, session_id=None, action=IMPORT_ACTION,
                      details={'source_revisions': imported}))
    db.commit()


def _dates_match(action, event):
    return (action.date_mode, action.start_date, action.end_date) == (event.date_mode, event.start_date, event.end_date)


def _migration_trace(event):
    # Portfolio links and personal_links have no field on Action: keep them as a
    # readable trace in detail instead of silently dropping them (spec Sec.5).
    # symbol is purely visual (an icon choice) and carries no information worth keeping.
    lines = []
    if event.portfolio:
        titles = [item.title or f'#{item.id}' for item in event.portfolio]
        lines.append('Portfolio: ' + ', '.join(titles))
    labels = [label for key, label in _PERSONAL_LINK_LABELS_IT if key in event.personal_links]
    if labels:
        lines.append('Collegamenti: ' + ', '.join(labels))
    return ('\n\n' + '\n'.join(lines)) if lines else ''


def _with_trace(text, trace):
    if not trace:
        return text[:1000]
    room = max(0, 1000 - len(trace))
    return (text[:room] + trace)[:1000]


def _apply_planned(detail, event):
    if event.planned and event.planned not in detail:
        detail = f'{detail}\n\n{event.planned}' if detail else event.planned
    return _with_trace(detail, _migration_trace(event))


def _reflection_overflows(current, event):
    # True only when this call would actually append something new that no
    # longer fits Action.reflection's max_length=1000 (Field constraint).
    if not event.reflection or event.reflection in (current or ''):
        return False
    combined = f'{current}\n\n{event.reflection}' if current else event.reflection
    return len(combined) > 1000


def _apply_reflection(current, event):
    # Never first-wins: an existing reflection is kept and the new one appended,
    # never overwritten and never silently dropped. Callers that cannot guarantee
    # the merge fits (i.e. haven't checked _reflection_overflows first) must use
    # _apply_reflection_with_cap instead, or this can raise on save.
    if event.reflection and event.reflection not in (current or ''):
        return f'{current}\n\n{event.reflection}' if current else event.reflection
    return current


def _apply_reflection_with_cap(current, event):
    # Used where merging cannot be avoided (the assignment/event reflection
    # carryover, spec Sec.6): clamp instead of raising, since there is no
    # alternative activity to move the overflow into.
    if not event.reflection or event.reflection in (current or ''):
        return current
    combined = f'{current}\n\n{event.reflection}' if current else event.reflection
    return combined if len(combined) <= 1000 else combined[:999] + '…'


def migrate_future_events(db, username):
    """One-time, idempotent move of personal future milestones into dated activities (spec §5)."""
    # _import_legacy may already have committed (releasing the transaction-scoped
    # lock ensure_personal_timeline took); reacquire it so this function is
    # protected against concurrent callers regardless of how it was reached.
    _lock_personal_timeline(db, username)
    if db.query(models.Log.id).filter_by(username=username, action=MIGRATION_ACTION).first():
        return False
    state = load_workspace(db, None, username)
    work = PersonalWorkspace.model_validate(state['workspace'])
    to_migrate = [event for event in work.timeline.events if event.tense == 'future' and not event.institution_event]
    if not to_migrate:
        db.add(models.Log(username=username, session_id=None, action=MIGRATION_ACTION, details={}))
        db.commit()
        return False

    actions_by_id = {action.id: action for action in work.actions}
    resulting_id = {}
    for event in to_migrate:
        existing = [id for id in event.action_ids if id in actions_by_id]
        action = actions_by_id[existing[0]] if len(existing) == 1 else None
        # Two future events pointing at the same activity only merge while the
        # activity has no date of its own, or already carries this same date;
        # a real date conflict gets its own activity instead of overwriting.
        # Same for a reflection that would no longer fit: split rather than
        # raise or silently truncate what the student wrote (spec Sec.5).
        if (action is not None and (action.date_mode is None or _dates_match(action, event))
                and not _reflection_overflows(action.reflection, event)):
            if action.date_mode is None:
                action.date_mode, action.start_date, action.end_date = event.date_mode, event.start_date, event.end_date
            action.detail = _apply_planned(action.detail, event)
            action.reflection = _apply_reflection(action.reflection, event)
            resulting_id[event.id] = action.id
        else:
            new_id = 'm-' + event.id[:60]
            new_action = Action(id=new_id, title=event.title, detail=_apply_planned('', event),
                reflection=_apply_reflection('', event), date_mode=event.date_mode, start_date=event.start_date,
                end_date=event.end_date, stage='todo', source=event.source)
            work.actions.append(new_action)
            actions_by_id[new_id] = new_action
            resulting_id[event.id] = new_id

    migrated_ids = {event.id for event in to_migrate}
    work.timeline.events = [event for event in work.timeline.events if event.id not in migrated_ids]

    touched_goals = set()
    for link in db.query(models.GoalResourceLink).filter(
            models.GoalResourceLink.kind == 'event', models.GoalResourceLink.target_id.in_(migrated_ids)).all():
        target = resulting_id[link.target_id]
        duplicate = db.query(models.GoalResourceLink).filter_by(goal_id=link.goal_id, kind='action', target_id=target).first()
        if duplicate:
            db.delete(link)
            duplicate.role = 'means'
        else:
            link.kind, link.target_id, link.role = 'action', target, 'means'
        touched_goals.add(link.goal_id)
    if touched_goals:
        db.query(models.PersonalGoal).filter(models.PersonalGoal.id.in_(touched_goals)).update(
            {models.PersonalGoal.revision: models.PersonalGoal.revision + 1}, synchronize_session=False)

    for row in db.query(models.AssignmentWork).filter(models.AssignmentWork.event_id.in_(migrated_ids)).all():
        event = next(event for event in to_migrate if event.id == row.event_id)
        row.event_id = None
        action = actions_by_id.get(f'assignment-{row.assignment_id}')
        if action:
            action.reflection = _apply_reflection_with_cap(action.reflection, event)

    save_workspace(db, None, username, SavePersonalWorkspace(revision=state['revision'], workspace=work), commit=False)
    db.add(models.Log(username=username, session_id=None, action=MIGRATION_ACTION, details={}))
    db.commit()
    return True


def eligible_events(db, username):
    rows = db.query(models.OrientationEvent).filter_by(status='certified', is_active=True).all()
    band = resolve_audience_band(db, username)
    return {row.slug: row for row in _scoped(rows, institution_ids_for(db, username))
            if _matches(row, set(), band, '')}


def resolve_institution_events(db, username, workspace, language='it'):
    linked = [event for event in workspace['timeline']['events'] if event.get('institution_event')]
    if not linked:
        return
    available = eligible_events(db, username)
    for event in linked:
        row = available.get(event['institution_event'])
        if row is not None and event.get('institution_date') == 'deadline' and row.registration_deadline is None:
            row = None
        event['institution_available'] = row is not None
        if row is None:
            event.update(title={'it': 'Non disponibile', 'en': 'Unavailable', 'es': 'No disponible',
                                'fr': 'Indisponible', 'de': 'Nicht verfügbar', 'sv': 'Inte tillgänglig'}.get(language, 'Unavailable'),
                         period='—', source='')
            continue
        date = row.registration_deadline if event.get('institution_date') == 'deadline' else row.starts_at
        start = date.replace(tzinfo=timezone.utc) if date.tzinfo is None else date
        event.update(title=_i18n(row.title_i18n, language)[:160], period=start.isoformat(),
                     tense='past' if start < datetime.now(timezone.utc) else 'future', source='')
    workspace['timeline']['events'].sort(key=lambda event: (
        event['period'][:10] if event.get('institution_event') else
        event.get('start_date') or event.get('end_date') or '9999-99-99'))


def validate_institution_links(db, username, workspace, previous):
    linked = [event for event in workspace.timeline.events if event.institution_event]
    if not linked:
        return
    available = eligible_events(db, username)
    slugs = [(event.institution_event, event.institution_date) for event in linked]
    if len(slugs) != len(set(slugs)):
        raise HTTPException(422, 'Duplicate institution event')
    for event in linked:
        row = available.get(event.institution_event)
        valid = row is not None and (event.institution_date != 'deadline' or row.registration_deadline is not None)
        old = previous.get(event.id, {})
        if not valid and (old.get('institution_event'), old.get('institution_date', 'start')) != (event.institution_event, event.institution_date):
            raise HTTPException(422, 'Institution event is unavailable')
    data = workspace.model_dump()
    resolve_institution_events(db, username, data)
    resolved_by_id = {event['id']: event for event in data['timeline']['events']}
    for event in workspace.timeline.events:
        resolved = resolved_by_id[event.id]
        if event.institution_event:
            event.title, event.period, event.tense = resolved['title'], resolved['period'], resolved['tense']
            event.source = ''
            event.institution_available = resolved['institution_available']
