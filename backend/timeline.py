"""Explicit timeline exports and immutable Portfolio copies; no model calls."""
import hashlib
from datetime import datetime, timezone

from fastapi import HTTPException
from pydantic import Field
from sqlalchemy import text

from . import models, pii
from .schemas import PORTFOLIO_MAX_TEXT_CHARS
from .visual_tools import LABELS, Identifier, StrictModel, Workspace, workspace_model, load_workspace

TIMELINE_LABELS = {
    'it': ['Linea del tempo', 'Passato', 'Futuro', 'Lavori del Portfolio', 'Non disponibile', 'Versione del', 'Riflessione'],
    'en': ['Timeline', 'Past', 'Future', 'Portfolio works', 'Unavailable', 'Version dated', 'Reflection'],
    'es': ['Línea del tiempo', 'Pasado', 'Futuro', 'Trabajos del Portfolio', 'No disponible', 'Versión del', 'Reflexión'],
    'fr': ['Ligne du temps', 'Passé', 'Futur', 'Travaux du Portfolio', 'Indisponible', 'Version du', 'Réflexion'],
    'de': ['Zeitleiste', 'Vergangenheit', 'Zukunft', 'Arbeiten im Portfolio', 'Nicht verfügbar', 'Version vom', 'Reflexion'],
    'sv': ['Tidslinje', 'Dåtid', 'Framtid', 'Arbeten i Portfolio', 'Inte tillgänglig', 'Version från', 'Reflektion'],
}


GOAL_LABELS = {
    'it': {'book': 'Libro da leggere', 'article': 'Articolo da studiare', 'film': 'Film da vedere'},
    'en': {'book': 'Book to read', 'article': 'Article to study', 'film': 'Film to watch'},
    'es': {'book': 'Libro para leer', 'article': 'Artículo para estudiar', 'film': 'Película para ver'},
    'fr': {'book': 'Livre à lire', 'article': 'Article à étudier', 'film': 'Film à voir'},
    'de': {'book': 'Buch lesen', 'article': 'Artikel durcharbeiten', 'film': 'Film ansehen'},
    'sv': {'book': 'Bok att läsa', 'article': 'Artikel att studera', 'film': 'Film att se'},
}


def timeline_sections(w: Workspace, language: str):
    labels = TIMELINE_LABELS.get(language[:2], TIMELINE_LABELS['en'])
    common = LABELS.get(language[:2], LABELS['en'])
    actions = {a.id: a for a in w.actions}
    entries = []
    for event in w.timeline.events:
        title = event.title
        if event.institution_event and event.institution_date == 'deadline':
            label = {'it': 'Scadenza di iscrizione', 'en': 'Registration deadline', 'es': 'Plazo de inscripción', 'fr': 'Date limite d’inscription', 'de': 'Anmeldefrist', 'sv': 'Sista anmälningsdag'}.get(language[:2], 'Registration deadline')
            title = f'{label}: {title}'
        lines = [f'{event.period} — {labels[1 if event.tense == "past" else 2]}: {title}', event.reflection]
        for action_id in event.action_ids:
            action = actions.get(action_id)
            lines.append(f'{GOAL_LABELS.get(language[:2], GOAL_LABELS["en"]).get(action.kind, common[1])}: {action.title} — {common[2 + ["todo", "doing", "done"].index(action.stage)]}'
                         if action else f'{common[1]}: {labels[4]}')
        lines.extend(f'{labels[3]}: {p.title or labels[4]}' for p in event.portfolio)
        entries.append('\n'.join(filter(None, lines)))
    return [(f'{labels[0]} — {w.timeline.title}', entries)]


class SnapshotRequest(StrictModel):
    revision: int = Field(ge=0)
    event_ids: list[Identifier] = Field(min_length=1)
    title: str = Field(min_length=1, max_length=160)
    reflection: str = Field(default='', max_length=1000)
    language: str = Field(default='it', pattern=r'^(it|en|es|fr|de|sv)$')


class SaveSnapshot(SnapshotRequest):
    request_id: str = Field(min_length=1, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')
    preview_hash: str = Field(pattern=r'^[a-f0-9]{64}$')


def snapshot_preview(db, session_id, username, update):
    saved = load_workspace(db, session_id, username)
    if saved['revision'] != update.revision:
        raise HTTPException(409, 'Timeline changed; review again')
    if session_id is None:
        from .personal_timeline import resolve_institution_events
        resolve_institution_events(db, username, saved['workspace'], update.language)
    w = workspace_model(session_id).model_validate(saved['workspace'])
    ids = set(update.event_ids)
    if len(ids) != len(update.event_ids) or ids - {e.id for e in w.timeline.events}:
        raise HTTPException(422, 'Unknown or duplicate events')
    w.timeline.events = [e for e in w.timeline.events if e.id in ids]
    labels = TIMELINE_LABELS[update.language]
    sections = timeline_sections(w, update.language)
    body = '\n\n'.join([sections[0][0], *sections[0][1],
                        *([f'{labels[6]}: {update.reflection}'] if update.reflection else [])])
    body = pii.redact(body)
    if len(body) > PORTFOLIO_MAX_TEXT_CHARS:
        raise HTTPException(413, 'Select fewer events or shorten the reflection')
    title = pii.redact(update.title)
    digest = hashlib.sha256((title + '\n' + body).encode()).hexdigest()
    return {'title': title, 'description': body, 'preview_hash': digest}


def save_snapshot(db, session_id, username, update):
    # Same lock as workspace saves: check, create and idempotency record are atomic.
    if db.get_bind().dialect.name == 'postgresql':
        key = int.from_bytes(hashlib.sha256(f'{username}:{session_id}'.encode()).digest()[:8], 'big', signed=True)
        db.execute(text('SELECT pg_advisory_xact_lock(:key)'), {'key': key})
    request_hash = hashlib.sha256(update.model_dump_json().encode()).hexdigest()
    prior = db.query(models.Log).filter(models.Log.username == username,
        models.Log.session_id == session_id, models.Log.action == 'timeline_snapshot').all()
    for row in prior:
        if row.details.get('request_id') == update.request_id:
            if row.details.get('request_hash') != request_hash:
                raise HTTPException(409, 'Request already used for a different copy')
            return {'item_id': row.details['item_id']}
    preview = snapshot_preview(db, session_id, username, update)
    if preview['preview_hash'] != update.preview_hash:
        raise HTTPException(409, 'Linked work changed; review again')
    item = models.PortfolioItem(username=username, title=preview['title'], description=preview['description'],
        category=TIMELINE_LABELS[update.language][0], item_date=datetime.now(timezone.utc).date().isoformat(), images=[])
    db.add(item)
    db.flush()
    db.add(models.Log(username=username, session_id=session_id, action='timeline_snapshot', details={
        'request_id': update.request_id, 'request_hash': request_hash, 'item_id': item.id,
        'event_ids': update.event_ids}))
    db.commit()
    return {'item_id': item.id}


def portfolio_timeline_links(db, username, item_id):
    from .personal_timeline import ensure_personal_timeline, imported_id
    item = db.query(models.PortfolioItem).filter(models.PortfolioItem.id == item_id,
        models.PortfolioItem.username == username).first()
    if not item:
        raise HTTPException(404, 'Portfolio work is unavailable')
    ensure_personal_timeline(db, username)
    current = load_workspace(db, None, username)['workspace']['timeline']
    copies = db.query(models.Log).filter(models.Log.username == username,
        models.Log.action == 'timeline_snapshot', models.Log.details['item_id'].as_integer() == item_id).all()
    copied_ids = {imported_id(row.session_id, event_id) if row.session_id is not None else event_id
                  for row in copies for event_id in row.details.get('event_ids', [])}
    return {'links': [{'session_id': None, 'event_id': event['id'], 'title': event['title'],
                       'timeline_title': current['title']}
                      for event in current['events'] if event['id'] in copied_ids
                      or any(p['id'] == item_id for p in event['portfolio'])], 'snapshot': bool(copies)}
