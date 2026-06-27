"""Admin-only prompt audit endpoints for guided counselor chats."""
import os
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from .. import auth, database, schemas
from ..ai_service import AIService
from ..prompt_audit import build_prompt_audit, prompt_audit_matrix, run_prompt_audit_live

router = APIRouter()
get_db = database.get_db


async def require_prompt_audit_access(
    request: Request,
    x_prompt_audit_token: str | None = Header(default=None, alias="X-Prompt-Audit-Token"),
):
    expected_token = os.environ.get("PROMPT_AUDIT_API_TOKEN", "").strip()
    supplied_token = (x_prompt_audit_token or "").strip()
    if supplied_token:
        if expected_token and secrets.compare_digest(supplied_token, expected_token):
            return {
                "username": "prompt-audit-token",
                "email": "",
                "groups": ["prompt-audit-api"],
                "is_admin": True,
                "is_researcher": True,
                "authenticated": True,
            }
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Prompt audit token non valido",
        )

    identity = await auth.get_identity(request)
    return await auth.get_current_active_admin(identity)


@router.post("/admin/prompt-audit/dry-run")
async def prompt_audit_dry_run(
    payload: schemas.PromptAuditRequest,
    current_user: dict = Depends(require_prompt_audit_access),
    db: Session = Depends(get_db),
):
    del current_user
    result = build_prompt_audit(db, payload, ai_service_cls=AIService)
    return {key: value for key, value in result.items() if not key.startswith("_")}


@router.post("/admin/prompt-audit/live")
async def prompt_audit_live(
    payload: schemas.PromptAuditRequest,
    current_user: dict = Depends(require_prompt_audit_access),
    db: Session = Depends(get_db),
):
    return run_prompt_audit_live(db, payload, identity=current_user, ai_service_cls=AIService)


@router.post("/admin/prompt-audit/matrix")
async def prompt_audit_matrix_endpoint(
    payload: schemas.PromptAuditMatrixRequest,
    current_user: dict = Depends(require_prompt_audit_access),
    db: Session = Depends(get_db),
):
    del current_user
    return prompt_audit_matrix(db, payload, ai_service_cls=AIService)
