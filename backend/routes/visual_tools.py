"""Read, save and export a student's visual workspace for an owned session."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import auth, database
from ..message_diagrams import session_owner
from ..visual_tools import LABELS, SaveWorkspace, load_workspace, save_workspace
from ..visual_personal import PersonalTransfer, personal_context, transfer_to_personal

router = APIRouter()


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
