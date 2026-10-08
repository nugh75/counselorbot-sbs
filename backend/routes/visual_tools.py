"""Read, save and export a student's visual workspace for an owned session."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import auth, class_access, database
from ..message_diagrams import session_owner
from ..visual_tools import (LABELS, SaveWorkspace, SavePersonalWorkspace, load_workspace, redact_workspace_text,
                            save_workspace, workspace_model)
from ..personal_timeline import ensure_personal_timeline, imported_id, resolve_institution_events
from ..visual_personal import PersonalTransfer, personal_context, transfer_to_personal
from ..timeline import SnapshotRequest, SaveSnapshot, snapshot_preview, save_snapshot, portfolio_timeline_links

router = APIRouter()


@router.post('/session/{session_id}/visual-tools/timeline/preview')
def preview_timeline(session_id: str, update: SnapshotRequest, db: Session = Depends(database.get_db),
                     identity: dict = Depends(auth.get_identity_view_as)):
    return snapshot_preview(db, session_id, _personal_owner(db, session_id, identity), update)


@router.post('/session/{session_id}/visual-tools/timeline/portfolio')
def copy_timeline(session_id: str, update: SaveSnapshot, db: Session = Depends(database.get_db),
                  identity: dict = Depends(auth.get_identity_view_as)):
    class_access.require_tool(db, identity, 'portfolio')
    return save_snapshot(db, session_id, _personal_owner(db, session_id, identity), update)


@router.get('/user/portfolio/{item_id}/timeline-links')
def linked_timelines(item_id: int, db: Session = Depends(database.get_db),
                     identity: dict = Depends(auth.get_current_user)):
    return portfolio_timeline_links(db, identity['username'], item_id)


def _personal_owner(db, session_id, identity):
    owner = session_owner(db, session_id, identity)
    if owner != identity.get('username'):
        raise HTTPException(403, 'Personal annotations belong to the student')
    return owner


@router.get('/session/{session_id}/visual-tools/personal')
def read_personal_annotations(session_id: str, lang: str = 'it', db: Session = Depends(database.get_db),
                              identity: dict = Depends(auth.get_identity_view_as)):
    return personal_context(db, session_id, _personal_owner(db, session_id, identity), lang)


@router.post('/session/{session_id}/visual-tools/personal')
def write_personal_annotation(session_id: str, update: PersonalTransfer, db: Session = Depends(database.get_db),
                               identity: dict = Depends(auth.get_identity_view_as)):
    return transfer_to_personal(db, session_id, _personal_owner(db, session_id, identity), update)


@router.get('/session/{session_id}/visual-tools')
def read_visual_tools(session_id: str, db: Session = Depends(database.get_db),
                      identity: dict = Depends(auth.get_identity_view_as)):
    owner = session_owner(db, session_id, identity)
    return load_workspace(db, session_id, owner)


@router.put('/session/{session_id}/visual-tools')
def write_visual_tools(session_id: str, update: SaveWorkspace, db: Session = Depends(database.get_db),
                       identity: dict = Depends(auth.get_identity_view_as)):
    owner = session_owner(db, session_id, identity)
    return save_workspace(db, session_id, owner, update)


@router.get('/session/{session_id}/visual-tools/pdf')
def export_visual_tools(session_id: str, lang: str = 'it', db: Session = Depends(database.get_db),
                        identity: dict = Depends(auth.get_identity_view_as)):
    from ..pdf_generator import generate_questionnaire_pdf
    owner = session_owner(db, session_id, identity)
    state = load_workspace(db, session_id, owner)
    pdf = generate_questionnaire_pdf(LABELS.get(lang[:2], LABELS['en'])[0], {}, session_id, language=lang, mode='visual',
                                     visual_workspace=state['workspace'])
    return Response(pdf.getvalue(), media_type='application/pdf',
                    headers={'Content-Disposition': 'attachment; filename="counselorbot_visual_tools.pdf"'})


# Personal work has no session id and is always scoped to the authenticated user.
@router.get('/user/timeline')
def read_personal_timeline(lang: str = 'it', legacy_session: str | None = None, event: str | None = None,
                           db: Session = Depends(database.get_db), identity: dict = Depends(auth.get_current_user)):
    username = identity['username']
    ensure_personal_timeline(db, username)
    state = load_workspace(db, None, username)
    resolve_institution_events(db, username, state['workspace'], lang)
    state['focus_event'] = imported_id(legacy_session, event) if legacy_session and event else event
    return state


# One personal workspace document holds four class-toggleable tools.
WORKSPACE_TOOL_SECTIONS = {
    'actions': ('actions',),
    'cards': ('cards', 'card_columns', 'card_decks', 'active_deck_id'),
    'comparison': ('comparison',),
    'timeline': ('timeline',),
}
# Filled in by the server on every read, never by the student.
_RESOLVED_EVENT_FIELDS = ('title', 'period', 'tense', 'source', 'institution_available')


def _comparable(workspace: dict) -> dict:
    clean = workspace_model(None).model_validate(workspace).model_dump()
    redact_workspace_text(clean)
    for event in clean['timeline']['events']:
        for link in event.get('portfolio', []):
            link.pop('title', None)
        if event.get('institution_event'):
            for key in _RESOLVED_EVENT_FIELDS:
                event.pop(key, None)
    # Events are re-sorted on every save; their order is not student work.
    clean['timeline']['events'].sort(key=lambda event: event['id'])
    return clean


def require_workspace_tools(db: Session, identity: dict, current: dict, update: SavePersonalWorkspace) -> None:
    """Guard only the sections the save changes: a disabled tool stays readable
    while the student keeps working with the enabled ones (decision 8)."""
    before, after = _comparable(current), _comparable(update.workspace.model_dump())
    for tool, fields in WORKSPACE_TOOL_SECTIONS.items():
        if any(before[field] != after[field] for field in fields):
            class_access.require_tool(db, identity, tool)


@router.put('/user/timeline')
def write_personal_timeline(update: SavePersonalWorkspace, lang: str = 'it', db: Session = Depends(database.get_db),
                            identity: dict = Depends(auth.get_current_user)):
    ensure_personal_timeline(db, identity['username'])
    require_workspace_tools(db, identity, load_workspace(db, None, identity['username'])['workspace'], update)
    state = save_workspace(db, None, identity['username'], update)
    resolve_institution_events(db, identity['username'], state['workspace'], lang)
    return state


@router.post('/user/timeline/preview')
def preview_personal_timeline(update: SnapshotRequest, db: Session = Depends(database.get_db),
                              identity: dict = Depends(auth.get_current_user)):
    ensure_personal_timeline(db, identity['username'])
    return snapshot_preview(db, None, identity['username'], update)


@router.post('/user/timeline/portfolio')
def copy_personal_timeline(update: SaveSnapshot, db: Session = Depends(database.get_db),
                           identity: dict = Depends(auth.get_current_user)):
    class_access.require_tool(db, identity, 'portfolio')
    ensure_personal_timeline(db, identity['username'])
    return save_snapshot(db, None, identity['username'], update)


@router.get('/user/timeline/pdf')
def export_personal_timeline(lang: str = 'it', db: Session = Depends(database.get_db),
                             identity: dict = Depends(auth.get_current_user)):
    from ..pdf_generator import generate_questionnaire_pdf
    state = read_personal_timeline(lang=lang, db=db, identity=identity)
    pdf = generate_questionnaire_pdf(LABELS.get(lang[:2], LABELS['en'])[0], {}, '', language=lang,
                                     mode='visual', visual_workspace=state['workspace'])
    return Response(pdf.getvalue(), media_type='application/pdf',
                    headers={'Content-Disposition': 'attachment; filename="counselorbot_timeline.pdf"'})
