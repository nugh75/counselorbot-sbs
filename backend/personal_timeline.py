"""Student-owned timeline, with a one-time, lossless extraction of legacy work."""
import hashlib
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, text

from . import models
from .orientation_referral_service import _i18n, _matches, _scoped
from .reading_audience import resolve_audience_band
from .referral_scope import institution_ids_for
from .visual_tools import ACTION, PERSONAL_ACTION, PersonalWorkspace, Workspace, load_workspace

IMPORT_ACTION = 'personal_timeline_import'


def imported_id(session_id, item_id):
    return hashlib.sha256(f'{session_id}:{item_id}'.encode()).hexdigest()


def ensure_personal_timeline(db, username):
    # Shares the save lock: two tabs cannot import twice or overwrite a save.
    if db.get_bind().dialect.name == 'postgresql':
        key = int.from_bytes(hashlib.sha256(f'{username}:None'.encode()).digest()[:8], 'big', signed=True)
        db.execute(text('SELECT pg_advisory_xact_lock(:key)'), {'key': key})
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
