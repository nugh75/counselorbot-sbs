"""Assignment -> owned activity/diary -> explicit submission -> teacher feedback."""
from datetime import date as Date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import Field, model_validator
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..goals import Strict, membership_ids, owned_goal
from ..personal_timeline import ensure_personal_timeline
from ..visual_tools import load_workspace, save_workspace, SavePersonalWorkspace
from .assignments import _managed_group

router = APIRouter()


class PlanWrite(Strict):
    date: Date | None = None


class RevisionWrite(Strict):
    revision: int = Field(ge=1)


class ReflectionWrite(RevisionWrite):
    workspace_revision: int = Field(ge=0)
    reflection: str = Field(max_length=1000)


class GoalLinkWrite(RevisionWrite):
    goal_id: int = Field(gt=0)
    goal_revision: int = Field(ge=1)


class ShareWrite(RevisionWrite):
    text: str = Field(default='', max_length=3000)
    portfolio_id: int | None = Field(default=None, gt=0)
    portfolio_updated_at: datetime | None = None

    @model_validator(mode='after')
    def has_content(self):
        if not self.text and self.portfolio_id is None:
            raise ValueError('Choose something to share')
        return self


class FeedbackWrite(RevisionWrite):
    text: str = Field(min_length=1, max_length=3000)


def _student_assignment(db, username, assignment_id, *, lock=False):
    query = db.query(models.TeacherAssignment).filter(
        models.TeacherAssignment.id == assignment_id,
        models.TeacherAssignment.revoked_at.is_(None),
        models.TeacherAssignment.group_id.in_(membership_ids(db, username)))
    row = (query.with_for_update() if lock else query).populate_existing().first()
    if row is None or (row.recipient_username is not None and not db.query(models.AssignmentRecipient.id).filter_by(
            assignment_id=row.id, username=username).first()):
        raise HTTPException(404, 'Assignment unavailable')
    return row


def _work(db, assignment_id, username):
    return db.query(models.AssignmentWork).filter_by(assignment_id=assignment_id, username=username).populate_existing().first()


def _edit(db, assignment_id, username, revision):
    # Call after locking the assignment, also serializing first-time plan creation.
    row = _work(db, assignment_id, username)
    if row is None:
        raise HTTPException(404, 'Plan the activity first')
    if row.revision != revision:
        raise HTTPException(409, 'Work changed: reload before saving')
    return row


def _shared(row):
    # This is the entire teacher-visible surface. Never include workspace or goal data.
    return dict(username=row.username, revision=row.revision, submission=row.submission,
                submitted_at=row.submitted_at, feedback=row.feedback, feedback_at=row.feedback_at)


def _state(db, assignment_id, username):
    row = _work(db, assignment_id, username)
    state = load_workspace(db, None, username)
    action = next((a for a in state['workspace']['actions'] if row and a['id'] == row.action_id), None)
    event = next((e for e in state['workspace']['timeline']['events'] if row and e['id'] == row.event_id), None)
    goals = db.query(models.PersonalGoal).join(models.GoalResourceLink).filter(
        models.PersonalGoal.username == username, models.GoalResourceLink.kind == 'action',
        models.GoalResourceLink.target_id == row.action_id).all() if row and action else []
    return dict(revision=row.revision if row else 0, workspace_revision=state['revision'],
                planned=bool(row and row.action_id), action=action, event=event,
                linked_goals=[dict(id=goal.id, title=goal.title) for goal in goals],
                submission=row.submission if row else None, submitted_at=row.submitted_at if row else None,
                feedback=row.feedback if row and row.submission else '',
                feedback_at=row.feedback_at if row and row.submission else None)


@router.get('/user/assignments/{assignment_id}/work')
def get_work(assignment_id: int, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    _student_assignment(db, user['username'], assignment_id)
    ensure_personal_timeline(db, user['username'])
    return _state(db, assignment_id, user['username'])


@router.post('/user/assignments/{assignment_id}/plan')
def plan(assignment_id: int, payload: PlanWrite, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    username = user['username']
    _student_assignment(db, username, assignment_id)
    ensure_personal_timeline(db, username)  # Legacy import commits before the atomic write.
    assignment = _student_assignment(db, username, assignment_id, lock=True)
    row = _work(db, assignment_id, username)
    if row and row.action_id:
        return _state(db, assignment_id, username)  # Safe retry; never recreate deleted work.
    state = load_workspace(db, None, username)
    work = state['workspace']
    action_id = f'assignment-{assignment_id}'
    if any(a['id'] == action_id for a in work['actions']):
        raise HTTPException(409, 'Workspace identifiers already exist')
    title = assignment.snapshot['title'][:160]
    source = f'/profilo/assegnazioni#assignment-{assignment_id}'
    work['actions'].append(dict(id=action_id, title=title, detail=assignment.instructions[:1000],
        stage='todo', kind=assignment.snapshot.get('kind') if assignment.snapshot.get('kind') in ('film', 'book', 'article') else 'activity', source=source,
        date_mode='point' if payload.date else None, start_date=payload.date.isoformat() if payload.date else None))
    save_workspace(db, None, username, SavePersonalWorkspace(revision=state['revision'], workspace=work), commit=False)
    row = models.AssignmentWork(assignment_id=assignment_id, username=username, action_id=action_id, event_id=None)
    db.add(row); db.commit()
    return _state(db, assignment_id, username)


@router.put('/user/assignments/{assignment_id}/reflection')
def reflection(assignment_id: int, payload: ReflectionWrite, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    username = user['username']
    _student_assignment(db, username, assignment_id, lock=True)
    row = _edit(db, assignment_id, username, payload.revision)
    state = load_workspace(db, None, username)
    if row.event_id:
        event = next((e for e in state['workspace']['timeline']['events'] if e['id'] == row.event_id), None)
        if event is None:
            raise HTTPException(404, 'Linked diary entry no longer exists')
        event['reflection'] = payload.reflection
    else:
        action = next((a for a in state['workspace']['actions'] if a['id'] == row.action_id), None)
        if action is None:
            raise HTTPException(404, 'Linked activity no longer exists')
        action['reflection'] = payload.reflection
    save_workspace(db, None, username, SavePersonalWorkspace(revision=payload.workspace_revision, workspace=state['workspace']), commit=False)
    row.revision += 1
    db.commit()
    return _state(db, assignment_id, username)


@router.post('/user/assignments/{assignment_id}/goal')
def link_goal(assignment_id: int, payload: GoalLinkWrite, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    username = user['username']
    _student_assignment(db, username, assignment_id, lock=True)
    row = _edit(db, assignment_id, username, payload.revision)
    goal = owned_goal(db, username, payload.goal_id, payload.goal_revision)
    state = _state(db, assignment_id, username)
    if not state['action']:
        raise HTTPException(404, 'Linked activity no longer exists')
    if not db.query(models.GoalResourceLink.id).filter_by(goal_id=goal.id, kind='action', target_id=row.action_id).first():
        db.add(models.GoalResourceLink(goal_id=goal.id, kind='action', target_id=row.action_id))
    goal.revision += 1; row.revision += 1
    db.commit()
    return _state(db, assignment_id, username)


@router.post('/user/assignments/{assignment_id}/submission')
def share(assignment_id: int, payload: ShareWrite, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    username = user['username']
    _student_assignment(db, username, assignment_id, lock=True)
    row = _edit(db, assignment_id, username, payload.revision)
    snapshot = dict(text=payload.text)
    if payload.portfolio_id is not None:
        item = db.query(models.PortfolioItem).filter_by(id=payload.portfolio_id, username=username).first()
        if item is None:
            raise HTTPException(404, 'Portfolio item unavailable')
        stamp = item.updated_at or item.created_at
        stamp = stamp if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc)
        if payload.portfolio_updated_at is None or stamp != payload.portfolio_updated_at.astimezone(timezone.utc):
            raise HTTPException(409, 'Portfolio preview changed: reload')
        # Share only the text preview the student chose, never images or live private links.
        snapshot['portfolio'] = dict(title=item.title, description=item.description or '')
    if row.submission != snapshot:
        row.submission = snapshot
        row.submitted_at = datetime.now(timezone.utc)
        row.feedback = ''; row.feedback_at = None
        row.revision += 1
        db.commit()
    return _state(db, assignment_id, username)


@router.delete('/user/assignments/{assignment_id}/submission')
def withdraw(assignment_id: int, revision: int = Query(ge=1), db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    _student_assignment(db, user['username'], assignment_id, lock=True)
    row = _edit(db, assignment_id, user['username'], revision)
    row.submission = None; row.submitted_at = None; row.feedback = ''; row.feedback_at = None
    row.revision += 1
    db.commit()
    return _state(db, assignment_id, user['username'])


def _teacher_assignment(db, user, assignment_id, *, lock=False):
    query = db.query(models.TeacherAssignment).filter_by(id=assignment_id, author_username=user['username'])
    row = (query.with_for_update() if lock else query).first()
    if row is None or row.revoked_at is not None:
        raise HTTPException(404, 'Assignment unavailable')
    _managed_group(db, user, row.group_id)
    return row


@router.get('/teacher/assignments/{assignment_id}/submissions')
def submissions(assignment_id: int, db: Session = Depends(database.get_db), user=Depends(auth.get_current_plan_manager)):
    assignment = _teacher_assignment(db, user, assignment_id)
    members = db.query(models.GroupMembership.username).filter_by(group_id=assignment.group_id)
    rows = db.query(models.AssignmentWork).filter(models.AssignmentWork.assignment_id == assignment_id,
        models.AssignmentWork.submission.is_not(None), models.AssignmentWork.username.in_(members)).order_by(models.AssignmentWork.submitted_at.desc()).all()
    return [_shared(row) for row in rows if row.submission is not None]


@router.put('/teacher/assignments/{assignment_id}/submissions/{username}/feedback')
def feedback(assignment_id: int, username: str, payload: FeedbackWrite,
             db: Session = Depends(database.get_db), user=Depends(auth.get_current_plan_manager)):
    assignment = _teacher_assignment(db, user, assignment_id, lock=True)
    if not db.query(models.GroupMembership.id).filter_by(group_id=assignment.group_id, username=username).first():
        raise HTTPException(404, 'Participant unavailable')
    row = _edit(db, assignment_id, username, payload.revision)
    if row.submission is None:
        raise HTTPException(404, 'Submission withdrawn')
    row.feedback = payload.text; row.feedback_at = datetime.now(timezone.utc); row.revision += 1
    db.commit()
    return _shared(row)
