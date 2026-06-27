"""Admin-only prompt audit endpoints for guided counselor chats."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas
from ..ai_service import AIService
from ..prompt_audit import build_prompt_audit, prompt_audit_matrix, run_prompt_audit_live

router = APIRouter()
get_db = database.get_db


@router.post("/admin/prompt-audit/dry-run")
async def prompt_audit_dry_run(
    payload: schemas.PromptAuditRequest,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    del current_user
    result = build_prompt_audit(db, payload, ai_service_cls=AIService)
    return {key: value for key, value in result.items() if not key.startswith("_")}


@router.post("/admin/prompt-audit/live")
async def prompt_audit_live(
    payload: schemas.PromptAuditRequest,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    del current_user
    return run_prompt_audit_live(db, payload, ai_service_cls=AIService)


@router.post("/admin/prompt-audit/matrix")
async def prompt_audit_matrix_endpoint(
    payload: schemas.PromptAuditMatrixRequest,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    del current_user
    return prompt_audit_matrix(db, payload, ai_service_cls=AIService)
