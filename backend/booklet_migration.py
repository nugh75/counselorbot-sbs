"""Una tantum: il libretto confluisce in letture, obiettivi, bilanci, taccuino e linea del tempo (spec § 8)."""
import hashlib
import re
from datetime import date

from . import models
from .personal_timeline import ensure_personal_timeline
from .visual_tools import SavePersonalWorkspace, load_workspace, save_workspace

MIGRATION_ACTION = 'booklet_triade_migration'
_ISO = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def biography_events(data: dict | None) -> list[dict[str, str]]:
    source = data or {}
    raw_events = source.get("bio_events")
    events = []
    if isinstance(raw_events, list):
        for index, raw in enumerate(raw_events):
            if not isinstance(raw, dict):
                continue
            event = {
                "id": str(raw.get("id") or f"event-{index + 1}")[:100],
                "date": str(raw.get("date") or "")[:10],
                "context": str(raw.get("context") or "").strip()[:160],
                "discovery": str(raw.get("discovery") or "").strip()[:1000],
                "keywords": str(raw.get("keywords") or "").strip()[:300],
            }
            if any(event[key] for key in ("date", "context", "discovery", "keywords")):
                events.append(event)
        if events:
            return events

    legacy = {
        "id": "legacy-1",
        "date": str(source.get("bio_date") or "")[:10],
        "context": str(source.get("bio_context") or "").strip()[:160],
        "discovery": str(source.get("bio_discovery") or "").strip()[:1000],
        "keywords": str(source.get("bio_keywords") or "").strip()[:300],
    }
    return [legacy] if any(legacy[key] for key in ("date", "context", "discovery", "keywords")) else []
_NOTE_LABELS = [('discovery', 'Cosa ho capito'), ('improvements', 'Miglioramenti osservati'),
                ('difficulties', 'Difficoltà incontrate'), ('student_notes', 'Note'), ('final_observations', 'Osservazioni finali')]


def _text(value):
    return str(value or '').strip()


def _items(value):
    if isinstance(value, list):
        return [_text(v) for v in value if _text(v)]
    return [_text(v) for v in str(value or '').split(',') if _text(v)]


def _note(data):
    return '\n\n'.join(f'{label}: {_text(data.get(key))}' for key, label in _NOTE_LABELS if _text(data.get(key)))


def _result_session(db, username, booklet):
    query = db.query(models.QuestionnaireResult).filter_by(username=username, questionnaire_type=booklet.questionnaire_type)
    if booklet.session_id:
        row = query.filter_by(session_id=booklet.session_id).first()
        if row:
            return row.session_id
    row = query.order_by(models.QuestionnaireResult.id.desc()).first()
    return row.session_id if row else None


def _reading(db, username, booklet, data):
    """Punto 1. Ritorna la session_id della lettura creata o estesa, None se non c'è compilazione."""
    session_id = _result_session(db, username, booklet)
    if session_id is None:
        return None
    strengths, growth, note = _items(data.get('strength')), _items(data.get('growth_area')), _note(data)
    row = db.query(models.ResultReading).filter_by(username=username, session_id=session_id).first()
    if row is None:
        row = models.ResultReading(username=username, session_id=session_id,
                                   questionnaire_type=booklet.questionnaire_type, strengths=[], growth_areas=[], note='')
        db.add(row)
    row.strengths = list(dict.fromkeys((row.strengths or []) + strengths))[:12]
    row.growth_areas = list(dict.fromkeys((row.growth_areas or []) + growth))[:12]
    row.note = '\n\n'.join(part for part in (row.note, note) if part)[:2000]
    db.flush()
    return session_id


def _to_notebook(db, username, booklet, data):
    latest = db.query(models.LearnerProfileRevision).filter(
        models.LearnerProfileRevision.username == username,
        models.LearnerProfileRevision.source != 'autosave').order_by(models.LearnerProfileRevision.id.desc()).first()
    profile = dict(latest.data or {}) if latest else {}
    when = booklet.updated_at.date().isoformat() if booklet.updated_at else ''
    lines = [f'Dal libretto ({booklet.questionnaire_type}, {when}):']
    if _items(data.get('strength')):
        lines.append('Punti di forza: ' + ', '.join(_items(data.get('strength'))))
    if _items(data.get('growth_area')):
        lines.append('Da far crescere: ' + ', '.join(_items(data.get('growth_area'))))
    if _note(data):
        lines.append(_note(data))
    profile['notes'] = '\n\n'.join(part for part in (_text(profile.get('notes')), '\n'.join(lines)) if part)
    db.add(models.LearnerProfileRevision(username=username, data=profile, source='migration'))
    db.flush()


def _goal(db, username, booklet, data, reading_session):
    """Punto 2."""
    objective = _text(data.get('objective'))
    if not objective:
        return None
    method = []
    for line in _text(data.get('strategy')).splitlines():
        text = line.strip().lstrip('-•* ').strip()
        if text:
            strategy = models.PersonalStrategy(username=username, text=text[:300])
            db.add(strategy); db.flush()
            method.append({'kind': 'own', 'id': strategy.id})
    end = _text(data.get('period_end'))
    goal = models.PersonalGoal(username=username, title=objective[:160], criteria=objective[160:1500],
                               motivation=_text(data.get('motivation'))[:2000], method=method[:12],
                               review_date=end if _ISO.match(end) else None, status='active')
    db.add(goal); db.flush()
    if reading_session:
        db.add(models.GoalResourceLink(goal_id=goal.id, kind='reading', target_id=reading_session, role='origin'))
    return goal


_COMMITMENT = {'full', 'enough', 'partial', 'none'}
_SATISFACTION = {'much', 'enough', 'little', 'none'}


def _review(db, goal, data):
    """Punto 3."""
    commitment, satisfaction = _text(data.get('commitment')), _text(data.get('final_satisfaction'))
    if not (commitment or satisfaction):
        return False
    db.add(models.GoalReview(goal_id=goal.id, outcome='partial',
                             commitment=commitment if commitment in _COMMITMENT else None,
                             satisfaction=satisfaction if satisfaction in _SATISFACTION else None,
                             obstacles=_text(data.get('difficulties'))[:1500], change=_text(data.get('improvements'))[:1500],
                             learned=_text(data.get('discovery'))[:1500]))
    goal.status = 'completed'
    goal.revision += 1
    return True


def _migrated_id(booklet_id, event_id):
    return 'migrated-' + hashlib.sha256(f'{booklet_id}:{event_id}'.encode()).hexdigest()[:24]


def _timeline(db, username, booklets):
    """Punti 4 e 5, con un solo salvataggio del workspace."""
    state = load_workspace(db, None, username)
    work = state['workspace']
    events = work['timeline']['events']
    by_booklet = {b.id: b for b in booklets}
    count = 0
    for event in events:
        if not event['id'].startswith('booklet-'):
            continue
        booklet_id = int(event['id'].split('-')[1])
        bio = next((b for b in biography_events((by_booklet.get(booklet_id) or models.StudentBooklet(data={})).data)
                    if (b['context'] or '') == event['title'] or not b['context']), None)
        event['id'] = _migrated_id(booklet_id, event['id'])
        event['personal_links'] = [link for link in event.get('personal_links', []) if link != 'booklet']
        if bio and (bio['discovery'] or bio['keywords']):
            event['review'] = {'discovery': bio['discovery'][:1000], 'keywords': bio['keywords'][:200]}
        count += 1
    for booklet in booklets:
        if not booklet.questionnaire_type.startswith('EVENTO_'):
            continue
        data = booklet.data or {}
        role = _text(data.get('event_role'))
        when = _text(data.get('bio_date')) or _text(data.get('date'))
        event = dict(id=_migrated_id(booklet.id, 'event'), title=(_text(data.get('title')) or booklet.questionnaire_type)[:160],
                     tense='past', symbol='milestone', period=(when or (booklet.created_at.date().isoformat() if booklet.created_at else '—'))[:100],
                     review=dict(role=role if role in ('protagonist', 'observer', 'alongside') else None,
                                 worked=[i[:300] for i in _items(data.get('strength'))][:10],
                                 did_not_work=[i[:300] for i in _items(data.get('growth_area'))][:10],
                                 reading=_text(data.get('discovery') or data.get('reading'))[:1500],
                                 try_next=_text(data.get('try_next'))[:1000], how_when=_text(data.get('how_when'))[:1000]))
        if _ISO.match(when):
            event.update(date_mode='point', start_date=when)
        if not any(e['id'] == event['id'] for e in events):
            events.append(event); count += 1
    if count:
        work['timeline']['title'] = work['timeline']['title'] or 'Timeline'
        save_workspace(db, None, username, SavePersonalWorkspace(revision=state['revision'], workspace=work), commit=False)
    return count


def _legacy_reflections(db, username):
    """Punto 6."""
    count = 0
    goals = db.query(models.PersonalGoal).filter(models.PersonalGoal.username == username,
        models.PersonalGoal.status.in_(('completed', 'archived')), models.PersonalGoal.reflection != '').all()
    for goal in goals:
        if db.query(models.GoalReview.id).filter_by(goal_id=goal.id).first():
            continue
        db.add(models.GoalReview(goal_id=goal.id, outcome='abandoned' if goal.status == 'archived' else 'reached',
                                 learned=goal.reflection[:1500]))
        count += 1
    return count


def _booklet_links(db, username, reading_by_booklet):
    """Punto 7."""
    links = db.query(models.GoalResourceLink).join(models.PersonalGoal, models.PersonalGoal.id == models.GoalResourceLink.goal_id).filter(
        models.PersonalGoal.username == username, models.GoalResourceLink.kind == 'booklet').all()
    for link in links:
        session_id = reading_by_booklet.get(int(link.target_id)) if link.target_id.isdigit() else None
        has_origin = db.query(models.GoalResourceLink.id).filter_by(goal_id=link.goal_id, role='origin').first()
        if session_id and not has_origin:
            link.kind, link.target_id, link.role = 'reading', session_id, 'origin'
        else:
            db.delete(link)
    db.flush()


def migrate_booklets(db, username):
    if db.query(models.Log.id).filter_by(username=username, action=MIGRATION_ACTION).first():
        return {}
    ensure_personal_timeline(db, username)
    booklets = db.query(models.StudentBooklet).filter_by(username=username).order_by(models.StudentBooklet.id).all()
    counts = dict(readings=0, notebook=0, goals=0, reviews=0, milestones=0)
    reading_by_booklet = {}
    for booklet in booklets:
        data = booklet.data or {}
        if booklet.questionnaire_type.startswith('EVENTO_'):
            continue  # diventano tappe in _timeline
        session_id = _reading(db, username, booklet, data)
        if session_id:
            reading_by_booklet[booklet.id] = session_id; counts['readings'] += 1
        elif _items(data.get('strength')) or _items(data.get('growth_area')) or _note(data):
            _to_notebook(db, username, booklet, data); counts['notebook'] += 1
        goal = _goal(db, username, booklet, data, session_id)
        if goal:
            counts['goals'] += 1
            if _review(db, goal, data):
                counts['reviews'] += 1
    counts['milestones'] = _timeline(db, username, booklets)
    counts['reviews'] += _legacy_reflections(db, username)
    _booklet_links(db, username, reading_by_booklet)
    db.add(models.Log(username=username, session_id=None, action=MIGRATION_ACTION, details={'counts': counts}))
    db.commit()
    return counts


def migrate_all_booklets(db):
    users = [u for (u,) in db.query(models.StudentBooklet.username).distinct()]
    users += [u for (u,) in db.query(models.PersonalGoal.username).filter(models.PersonalGoal.reflection != '').distinct()]
    done = 0
    for username in sorted(set(users)):
        if migrate_booklets(db, username):
            done += 1
    return done
