"""Catalog authoring, voluntary adoption and links to owned personal resources."""
import hashlib
from sqlalchemy import text, and_, or_

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..goals import (ActionCreate, CatalogWrite, GoalCreate, GoalWrite, LinkWrite, ParentWrite,
                     catalog_dict, catalog_visible, goal_dict, membership_ids, owned_goal,
                     resources, validate_share, lock_network, descendant_ids,
                     ALLOWED_ROLES, default_role, validate_origin, validate_method)
from ..personal_timeline import ensure_personal_timeline
from ..visual_tools import load_workspace, save_workspace, SavePersonalWorkspace
from .groups import _require_visible_group, _visible_group_query

router = APIRouter()


@router.get('/user/goal-catalog')
def student_catalog(db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    return [catalog_dict(row) for row in catalog_visible(db, user['username']).order_by(models.GoalCatalogEntry.id).all()]


@router.get('/teacher/goal-catalog')
def teacher_catalog(db: Session = Depends(database.get_db), user=Depends(auth.get_current_plan_manager)):
    query = db.query(models.GoalCatalogEntry)
    if not user.get('is_admin'):
        groups = _visible_group_query(db, user).filter(models.StudentGroup.is_active.is_(True)).with_entities(models.StudentGroup.id)
        query = query.filter(or_(models.GoalCatalogEntry.author_username == user['username'],
            and_(models.GoalCatalogEntry.status == 'published', or_(models.GoalCatalogEntry.group_id.is_(None), models.GoalCatalogEntry.group_id.in_(groups)))))
    return [catalog_dict(row) for row in query.order_by(models.GoalCatalogEntry.id.desc()).all()]


def validate_catalog_scope(db, user, payload):
    if payload.group_id is not None:
        group = _require_visible_group(db, user, payload.group_id)
        if not group.is_active:
            raise HTTPException(404, 'Group unavailable')
    if payload.group_id is None and payload.status == 'published' and not user.get('is_admin'):
        raise HTTPException(403, 'Common catalog requires administrator review')
    if payload.group_id is not None and payload.status == 'pending':
        raise HTTPException(422, 'Review is for the common catalog')


@router.post('/teacher/goal-catalog', status_code=201)
def create_catalog(payload: CatalogWrite, db: Session = Depends(database.get_db), user=Depends(auth.get_current_plan_manager)):
    validate_catalog_scope(db, user, payload)
    row = models.GoalCatalogEntry(author_username=user['username'], group_id=payload.group_id,
                                  status=payload.status, data=payload.data.model_dump(), version=1)
    db.add(row); db.commit(); db.refresh(row)
    return catalog_dict(row)


@router.put('/teacher/goal-catalog/{entry_id}')
def update_catalog(entry_id: int, payload: CatalogWrite, db: Session = Depends(database.get_db), user=Depends(auth.get_current_plan_manager)):
    query = db.query(models.GoalCatalogEntry).filter_by(id=entry_id)
    if not user.get('is_admin'):
        query = query.filter_by(author_username=user['username'])
    row = query.with_for_update().populate_existing().first()
    if row is None:
        raise HTTPException(404, 'Catalog entry unavailable')
    if row.version != payload.version:
        raise HTTPException(409, 'Catalog entry changed: reload')
    # Group access must still exist, even when moving an entry to the common catalog.
    if row.group_id is not None:
        _require_visible_group(db, user, row.group_id)
    validate_catalog_scope(db, user, payload)
    row.data = payload.data.model_dump(); row.group_id = payload.group_id
    row.status = payload.status; row.version += 1
    db.commit(); db.refresh(row)
    return catalog_dict(row)


@router.get('/user/goals')
def list_goals(db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    resource_map = {(r['kind'], r['target_id']): r for r in resources(db, user['username'])}
    return [goal_dict(db, row, resource_map) for row in db.query(models.PersonalGoal).filter_by(
        username=user['username']).order_by(models.PersonalGoal.priority, models.PersonalGoal.id.desc()).all()]


@router.get('/user/goal-groups')
def goal_groups(db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    rows = db.query(models.StudentGroup).filter(models.StudentGroup.id.in_(membership_ids(db, user['username']))).all()
    return [dict(id=row.id, name=row.name) for row in rows]


@router.get('/user/goal-resources')
def list_resources(db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    return resources(db, user['username'])


@router.post('/user/goals', status_code=201)
def create_goal(payload: GoalCreate, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    if payload.request_id:
        key = int.from_bytes(hashlib.sha256(f"goal:{user['username']}:{payload.request_id}".encode()).digest()[:8], 'big', signed=True)
        if db.get_bind().dialect.name == 'postgresql':
            db.execute(text('SELECT pg_advisory_xact_lock(:key)'), {'key': key})
        existing = db.query(models.PersonalGoal).filter_by(username=user['username'], request_id=payload.request_id).first()
        if existing:
            return goal_dict(db, existing)
    validate_share(db, user['username'], payload.shared_group_id)
    if payload.origin:
        validate_origin(db, user['username'], payload.origin)
    validate_method(db, user['username'], payload.method)
    if payload.parent_id is not None:
        lock_network(db, user['username'])
        owned_goal(db, user['username'], payload.parent_id)
    snapshot = {}
    if payload.catalog_id:
        entry = catalog_visible(db, user['username']).filter_by(id=payload.catalog_id).with_for_update().first()
        if entry is None:
            raise HTTPException(404, 'Catalog entry unavailable')
        if payload.catalog_version != entry.version:
            raise HTTPException(409, 'Catalog entry changed: reload')
        snapshot = dict(version=entry.version, data=entry.data, author_username=entry.author_username)
    values = payload.model_dump(exclude={'revision', 'catalog_id', 'catalog_version', 'parent_id', 'origin'})
    values['method'] = [m.model_dump() for m in payload.method]
    row = models.PersonalGoal(username=user['username'], catalog_id=payload.catalog_id, catalog_snapshot=snapshot, **values)
    db.add(row); db.flush()
    if payload.origin:
        db.add(models.GoalResourceLink(goal_id=row.id, kind=payload.origin.kind, target_id=payload.origin.target_id, role='origin'))
    if payload.parent_id is not None:
        db.add(models.GoalEdge(parent_id=payload.parent_id, child_id=row.id))
    db.commit(); db.refresh(row)
    return goal_dict(db, row)


@router.put('/user/goals/{goal_id}')
def update_goal(goal_id: int, payload: GoalWrite, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    row = owned_goal(db, user['username'], goal_id, payload.revision)
    validate_share(db, user['username'], payload.shared_group_id)
    validate_method(db, user['username'], payload.method)
    for key, value in payload.model_dump(exclude={'revision'}).items():
        setattr(row, key, value)
    row.method = [m.model_dump() for m in payload.method]
    row.revision += 1
    db.commit(); db.refresh(row)
    return goal_dict(db, row)


@router.delete('/user/goals/{goal_id}')
def delete_goal(goal_id: int, revision: int = Query(ge=1), db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    lock_network(db, user['username'])
    row = owned_goal(db, user['username'], goal_id, revision)
    # Children lose this parent: the edge belongs to the child, so its revision moves.
    children = db.query(models.GoalEdge.child_id).filter_by(parent_id=goal_id)
    db.query(models.PersonalGoal).filter(models.PersonalGoal.id.in_(children)).update(
        {models.PersonalGoal.revision: models.PersonalGoal.revision + 1}, synchronize_session=False)
    db.delete(row); db.commit()
    return {'deleted': True}


@router.post('/user/goals/{goal_id}/parents')
def add_parent(goal_id: int, payload: ParentWrite, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    lock_network(db, user['username'])
    row = owned_goal(db, user['username'], goal_id, payload.revision)
    owned_goal(db, user['username'], payload.parent_id)
    if payload.parent_id == goal_id or payload.parent_id in descendant_ids(db, [goal_id]):
        raise HTTPException(422, 'Cycle')
    if not db.query(models.GoalEdge).filter_by(parent_id=payload.parent_id, child_id=goal_id).first():
        db.add(models.GoalEdge(parent_id=payload.parent_id, child_id=goal_id))
        row.revision += 1
    db.commit(); db.refresh(row)
    return goal_dict(db, row)


@router.delete('/user/goals/{goal_id}/parents/{parent_id}')
def remove_parent(goal_id: int, parent_id: int, revision: int = Query(ge=1), db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    lock_network(db, user['username'])
    row = owned_goal(db, user['username'], goal_id, revision)
    edge = db.query(models.GoalEdge).filter_by(parent_id=parent_id, child_id=goal_id).first()
    if not edge:
        raise HTTPException(404, 'Parent unavailable')
    db.delete(edge); row.revision += 1
    db.commit(); db.refresh(row)
    return goal_dict(db, row)


@router.post('/user/goals/{goal_id}/links')
def link_resource(goal_id: int, payload: LinkWrite, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    row = owned_goal(db, user['username'], goal_id, payload.revision)
    role = payload.role or default_role(payload.kind)
    if role not in ALLOWED_ROLES[payload.kind]:
        raise HTTPException(422, 'Role not allowed')
    if role == 'origin':
        if db.query(models.GoalResourceLink).filter_by(goal_id=goal_id, role='origin').first():
            raise HTTPException(422, 'Origin already set')
        validate_origin(db, user['username'], payload)  # LinkWrite ha kind/target_id come OriginWrite
    else:
        allowed = {(r['kind'], r['target_id']) for r in resources(db, user['username'])}
        if (payload.kind, payload.target_id) not in allowed:
            raise HTTPException(404, 'Resource unavailable')
    link = db.query(models.GoalResourceLink).filter_by(goal_id=goal_id, kind=payload.kind, target_id=payload.target_id).first()
    if not link:
        db.add(models.GoalResourceLink(goal_id=goal_id, kind=payload.kind, target_id=payload.target_id, role=role))
        row.revision += 1
    db.commit(); db.refresh(row)
    return goal_dict(db, row)


@router.delete('/user/goals/{goal_id}/links/{link_id}')
def unlink_resource(goal_id: int, link_id: int, revision: int = Query(ge=1), db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    row = owned_goal(db, user['username'], goal_id, revision)
    link = db.query(models.GoalResourceLink).filter_by(id=link_id, goal_id=goal_id).first()
    if not link:
        raise HTTPException(404, 'Link unavailable')
    db.delete(link); row.revision += 1
    db.commit(); db.refresh(row)
    return goal_dict(db, row)


@router.post('/user/goals/{goal_id}/actions')
def create_action(goal_id: int, payload: ActionCreate, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    # Import before starting the atomic goal/workspace transaction.
    ensure_personal_timeline(db, user['username'])
    row = owned_goal(db, user['username'], goal_id)
    action_id = f'goal-{goal_id}-{payload.request_id}'
    if len(action_id) > 62:
        raise HTTPException(422, 'Request id too long')
    # An acknowledged or transport-retried request never creates a second activity.
    if db.query(models.GoalResourceLink).filter_by(goal_id=goal_id, kind='action', target_id=action_id).first():
        return goal_dict(db, row)
    row = owned_goal(db, user['username'], goal_id, payload.revision)
    state = load_workspace(db, None, user['username'])
    work = state['workspace']
    if any(a['id'] == action_id for a in work['actions']):
        raise HTTPException(409, 'Activity already exists')
    work['actions'].append(dict(id=action_id, title=payload.title, detail=payload.detail, stage='todo', kind=payload.kind,
        date_mode='point' if payload.date else None, start_date=payload.date if payload.date else None))
    db.add(models.GoalResourceLink(goal_id=goal_id, kind='action', target_id=action_id, role='means'))
    save_workspace(db, None, user['username'], SavePersonalWorkspace(revision=state['revision'], workspace=work), commit=False)
    row.revision += 1
    db.commit(); db.refresh(row)
    return goal_dict(db, row)


@router.get('/teacher/groups/{group_id}/goals')
def shared_goals(group_id: int, db: Session = Depends(database.get_db), user=Depends(auth.get_current_plan_manager)):
    group = _require_visible_group(db, user, group_id)
    if not group.is_active:
        raise HTTPException(404, 'Group unavailable')
    members = db.query(models.GroupMembership.username).filter_by(group_id=group_id)
    seeds = [i for (i,) in db.query(models.PersonalGoal.id).filter(
        models.PersonalGoal.shared_group_id == group_id, models.PersonalGoal.username.in_(members))]
    # Sharing a goal shares its whole branch below it, never the ancestors above it.
    visible = set(seeds) | descendant_ids(db, seeds)
    rows = db.query(models.PersonalGoal).filter(models.PersonalGoal.id.in_(visible),
        models.PersonalGoal.username.in_(members)).order_by(models.PersonalGoal.username, models.PersonalGoal.id).all()
    edges = {}
    for parent, child in db.query(models.GoalEdge.parent_id, models.GoalEdge.child_id).filter(
            models.GoalEdge.child_id.in_(visible), models.GoalEdge.parent_id.in_(visible)).order_by(models.GoalEdge.parent_id):
        edges.setdefault(child, []).append(parent)
    # Explicit sharing covers this summary only, never linked notebooks or private artifacts.
    return [{**{key: getattr(row, key) for key in ('id', 'username', 'title', 'status', 'criteria', 'reflection', 'review_date')},
             'parent_ids': edges.get(row.id, [])} for row in rows]
