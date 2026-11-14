"""Read-only, student-scoped sources for the teacher's whole-journey noticing.

The caller authorizes the class and current membership before calling this
module. Class-owned content is limited to that class; personal work is limited
to the exact student. Never read credentials, provider prompts or other authors'
forum messages. Content is untrusted evidence, not model instructions.
"""
import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_

from . import models

KINDS = ('chat', 'questionnaire', 'notebook', 'reading', 'portfolio', 'goal',
         'review', 'strategy', 'action', 'card', 'comparison', 'timeline', 'map',
         'table', 'assignment', 'meeting', 'forum', 'teacher_note', 'practice', 'flashcard')


def text_value(value):
    if value is None:
        return ''
    if isinstance(value, str):
        return value.strip()
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


def collect_sources(db, group, username, *, days=None, instrument=None):
    """Current saved work and all retained messages, without silently clipping text."""
    sources = []
    since = datetime.now(timezone.utc) - timedelta(days=days) if days else None

    def add(key, kind, title, value, date, *, author='student', tool=None, result_id=None, context=None):
        tool = tool or kind
        if date is not None and date.tzinfo is None:
            date = date.replace(tzinfo=timezone.utc)
        text = text_value(value)
        if not text:
            return
        if since and (date is None or date.replace(tzinfo=date.tzinfo or timezone.utc) < since):
            return
        if instrument and tool != instrument:
            return
        sources.append({'id': key, 'kind': kind, 'title': title, 'text': text,
                        'date': date.isoformat() if date else None, 'author': author,
                        'instrument': tool, 'result_id': result_id,
                        'context': (context or '')[-1500:], 'context_truncated': len(context or '') > 1500})

    def rows(model):
        return db.query(model).filter(model.username == username).order_by(model.id).all()

    from .privacy.authz import is_resource_in_group_scope
    from .privacy.types import ResourceRef

    # Results tied to another class (plan or path evidence) stay out, with their
    # chats, as in the class result lists (privacy gap G5).
    results, other_class = [], set()
    for row in rows(models.QuestionnaireResult):
        ref = ResourceRef(kind='result', subject=username, owner_group=str(group.id), created_at=row.submitted_at)
        if is_resource_in_group_scope(db, ref, group.id, result_obj=row):
            results.append(row)
        else:
            other_class.add(row.session_id)
    by_session = {r.session_id: r for r in results}
    excluded = other_class | {r.session_id for r in db.query(models.TeacherPracticeResult).filter_by(owner_username=username)}
    # Explicit identity on logs wins. Owner records permit old identity-less
    # guided logs, but can never pull in an explicitly different user's log.
    owned = set(by_session) | {r.session_id for r in db.query(models.MemorySessionOwner).filter_by(username=username)}
    query = db.query(models.Log).filter(
        models.Log.action.in_(['chat_message', 'opencode_chat', 'site_chat']),
        or_(models.Log.username == username,
            (models.Log.username.is_(None) & models.Log.session_id.in_(owned))))
    logged_sessions = set()
    previous_replies = {}
    for row in query.order_by(models.Log.id):
        data = row.details or {}
        if (row.session_id in excluded or data.get('preview') or data.get('practice_notebook_id') or data.get('seed')
                or row.questionnaire_type == 'OBIETTIVO_DOCENZA'
                or data.get('audience') in ('teacher', 'docente', 'admin', 'researcher', 'ricercatore')):
            continue
        logged_sessions.add(row.session_id)
        result = by_session.get(row.session_id)
        add(f'chat:{row.id}', 'chat', row.questionnaire_type or row.action,
            data.get('user_input') or data.get('question'), row.timestamp,
            tool=row.questionnaire_type, result_id=result.id if result else None,
            context=previous_replies.get(row.session_id))
        previous_replies[row.session_id] = data.get('bot_response') or data.get('answer') or ''
    for row in results:
        add(f'questionnaire:{row.id}', 'questionnaire', row.questionnaire_type,
            {'instrument': row.questionnaire_type, 'scores': row.scores}, row.submitted_at,
            author='record', tool=row.questionnaire_type, result_id=row.id)
    for row in db.query(models.OrientationSession).filter_by(username=username):
        context = ''
        for index, message in enumerate(row.messages or []):
            if message.get('role') in ('user', 'student'):
                add(f'compass:{row.session_id}:{index}', 'chat', 'Bussola',
                    message.get('content') or message.get('text'), row.updated_at, tool='BUSSOLA', context=context)
            elif message.get('role') in ('assistant', 'counselor'):
                context = message.get('content') or message.get('text') or ''
    for row in rows(models.FrozenSession):
        if row.session_id in logged_sessions or row.session_id in excluded:
            continue
        context = ''
        for index, message in enumerate((row.data or {}).get('messages', [])):
            if message.get('role') in ('user', 'student'):
                add(f'frozen:{row.id}:{index}', 'chat', row.questionnaire_type,
                    message.get('text') or message.get('content'), row.updated_at, tool=row.questionnaire_type, context=context)
            elif message.get('role') in ('assistant', 'counselor'):
                context = message.get('content') or message.get('text') or ''
    # A retained memory transcript can survive log retention. Read only
    # explicitly bound sessions, without extending their retention deadline.
    from .memory_service import session_memory
    frozen_sessions = {r.session_id for r in rows(models.FrozenSession)}
    owners = {r.session_id: r for r in db.query(models.MemorySessionOwner).filter_by(username=username)}
    for session_id in owned - logged_sessions - frozen_sessions - excluded:
        result = by_session.get(session_id)
        owner = owners.get(session_id)
        context = ''
        for index, message in enumerate(session_memory.get_transcript(session_id, touch=False)):
            if message.get('role') == 'user':
                add(f'memory:{session_id}:{index}', 'chat', 'Conversazione', message.get('content'),
                    result.submitted_at if result else owner.created_at if owner else None,
                    tool=result.questionnaire_type if result else None, context=context)
            elif message.get('role') == 'assistant':
                context = message.get('content') or ''

    notebook = (db.query(models.LearnerProfileRevision).filter_by(username=username)
                .filter(models.LearnerProfileRevision.source != 'autosave')
                .order_by(models.LearnerProfileRevision.id.desc()).first())
    if notebook:
        add('notebook', 'notebook', 'Taccuino', notebook.data, notebook.created_at)
    for row in rows(models.LearnerProfileReflection):
        add(f'notebook-reflection:{row.id}', 'notebook', 'Riflessione sul taccuino', row.note, row.updated_at)
    for row in rows(models.ResultReading):
        add(f'reading:{row.id}', 'reading', row.questionnaire_type,
            {'strengths': row.strengths, 'growth_areas': row.growth_areas, 'note': row.note}, row.updated_at,
            tool=row.questionnaire_type)
    for row in rows(models.PortfolioItem):
        # File metadata is never presented as knowledge of an image's content.
        add(f'portfolio:{row.id}', 'portfolio', row.title,
            {'title': row.title, 'description': row.description, 'category': row.category,
             'item_date': row.item_date, 'link': row.link,
             'attachments': [{'filename': im.get('filename'), 'content_type': im.get('content_type')}
                             for im in row.images or []]}, row.updated_at, author='saved_work')
    goals = rows(models.PersonalGoal)
    for row in goals:
        add(f'goal:{row.id}', 'goal', row.title,
            {key: getattr(row, key) for key in ('title', 'motivation', 'criteria', 'reflection', 'status', 'method')}, row.updated_at)
    for row in db.query(models.GoalReview).filter(models.GoalReview.goal_id.in_([r.id for r in goals])):
        add(f'review:{row.id}', 'review', 'Bilancio',
            {key: getattr(row, key) for key in ('outcome', 'commitment', 'satisfaction', 'obstacles', 'change', 'learned', 'next_step')}, row.created_at)
    for row in rows(models.PersonalStrategy):
        add(f'strategy:{row.id}', 'strategy', 'Metodo', row.text, row.updated_at)

    # Latest snapshot per workspace; old revisions/deleted entries are not facts
    # about the student's current work. Each section remains individually cited.
    latest = {}
    for row in db.query(models.Log).filter_by(username=username).filter(
            models.Log.action.in_(['visual_workspace', 'personal_timeline_workspace'])).order_by(models.Log.id):
        latest[(row.action, row.session_id)] = row
    for row in latest.values():
        workspace = (row.details or {}).get('workspace') or {}
        key = row.session_id or 'personal'
        for section, kind in [('actions', 'action'), ('cards', 'card')]:
            for item in workspace.get(section, []):
                add(f'{kind}:{key}:{item["id"]}', kind, item.get('title') or section, item, row.timestamp)
        for item in (workspace.get('timeline') or {}).get('events', []):
            add(f'timeline:{key}:{item["id"]}', 'timeline', item.get('title') or 'Linea del tempo', item, row.timestamp)
        comparison = workspace.get('comparison') or {}
        if comparison.get('options'):
            add(f'comparison:{key}', 'comparison', 'Confronto', comparison, row.timestamp)
        for section in ('card_decks', 'card_columns'):
            if workspace.get(section):
                add(f'{section}:{key}', 'card', 'Schede', workspace[section], row.timestamp)
    flashcards = (db.query(models.Log).filter_by(username=username, session_id=None, action='personal_flashcards')
                  .order_by(models.Log.id.desc()).first())
    if flashcards:
        for deck in ((flashcards.details or {}).get('workspace') or {}).get('decks', []):
            add(f'flashcards:{deck["id"]}', 'flashcard', deck.get('title') or 'Flashcard',
                deck, flashcards.timestamp, author='saved_work', tool='FLASHCARDS')
    maps = {}
    for row in rows(models.IdeaMapRevision):
        if row.session_id not in excluded:
            maps[row.session_id] = row
    for row in maps.values():
        add(f'map:{row.session_id}', 'map', 'Idea', row.spec, row.created_at, author='saved_work', tool='IDEA')
    for row in rows(models.IdeaSource):
        if row.session_id not in excluded:
            add(f'idea-source:{row.id}', 'map', row.title,
                {'title': row.title, 'url': row.url, 'branch': row.branch_id}, row.created_at,
                author='saved_work', tool='IDEA')
    for row in rows(models.IdeaReference):
        if row.session_id not in excluded:
            add(f'idea-reference:{row.id}', 'map', row.filename,
                {'filename': row.filename, 'text': row.text, 'stored_text_truncated': row.truncated}, row.created_at,
                author='saved_work', tool='IDEA')
    for row in rows(models.Tavolo):
        revision = db.query(models.TavoloRevision).filter_by(tavolo_id=row.id).order_by(models.TavoloRevision.index.desc()).first()
        if revision:
            # Pending model proposals are not adopted student work.
            from .tavolo import TavoloGraph, live
            live_graph = live(TavoloGraph.model_validate(revision.graph)).model_dump()
            add(f'table:{row.id}', 'table', row.title or 'Tavolo', live_graph,
                row.updated_at, author='saved_work', tool='TAVOLO')

    for row in rows(models.AssignmentWork):
        assignment = db.get(models.TeacherAssignment, row.assignment_id)
        if assignment and assignment.group_id == group.id and not assignment.revoked_at and row.submission:
            add(f'assignment:{row.id}', 'assignment', 'Attività consegnata',
                row.submission, row.submitted_at, author='saved_work')
            add(f'assignment-feedback:{row.id}', 'teacher_note', 'Riscontro del docente',
                row.feedback, row.feedback_at, author='teacher')
    for row in rows(models.TeacherNote):
        if row.group_id == group.id:
            add(f'teacher-note:{row.id}', 'teacher_note', 'Osservazione del docente',
                row.text, row.created_at, author='teacher')

    meeting_ids = {row.id for row in db.query(models.ClassMeeting).filter_by(group_id=group.id)}
    meeting_ids.update(r.meeting_id for r in db.query(models.ClassMeetingGroup).filter_by(group_id=group.id))
    attendance = {r.meeting_id: r for r in rows(models.ClassMeetingAttendance)}
    bookings = {r.meeting_id: r for r in rows(models.ClassMeetingBooking) if r.status == 'active'}
    for row in db.query(models.ClassMeeting).filter(models.ClassMeeting.id.in_(meeting_ids)):
        if row.kind == 'individual' and row.id not in bookings and row.id not in attendance:
            continue
        add(f'meeting:{row.id}', 'meeting', row.title,
            {'title': row.title, 'description': row.description, 'status': row.status,
             'starts_at': row.starts_at, 'attendance_recorded': row.id in attendance,
             'booked': row.id in bookings, 'kind': row.kind}, row.updated_at, author='record')

    # User's explicit product decision: the student's own published forum
    # contributions are a noticing source. Never quote peers or moderation.
    topics = db.query(models.ForumTopic).filter_by(group_id=group.id, status='published').filter(models.ForumTopic.hidden_at.is_(None))
    visible_topics = {r.id: r for r in topics}
    for row in visible_topics.values():
        if row.author_username == username:
            add(f'forum-topic:{row.id}', 'forum', row.title, row.body, row.edited_at or row.created_at)
    for row in db.query(models.ForumPost).filter_by(author_username=username, status='published').filter(
            models.ForumPost.topic_id.in_(visible_topics), models.ForumPost.hidden_at.is_(None), models.ForumPost.deleted_at.is_(None)):
        add(f'forum-post:{row.id}', 'forum', 'Forum', row.body, row.edited_at or row.created_at)
    for row in rows(models.PqblSession):
        attempts = db.query(models.PqblAttempt).filter_by(session_id=row.id).order_by(models.PqblAttempt.id).all()
        add(f'practice:{row.id}', 'practice', 'pQBL',
            {'mode': row.mode, 'finished': bool(row.finished_at), 'attempts': len(attempts),
             'correct_attempts': sum(bool(a.correct) for a in attempts)}, row.finished_at or row.started_at,
            author='record', tool='PQBL')
    return sorted(sources, key=lambda s: s['id'])
