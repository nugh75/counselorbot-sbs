"""Admin endpoint of the real-use report of prompts (#762). Read only, Administration only."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import auth, database, prompt_usage

router = APIRouter()


@router.get("/admin/prompt-health/usage")
def prompt_usage_report(days: int = Query(30, ge=1, le=365), current_user=Depends(auth.get_current_active_admin),
                        db: Session = Depends(database.get_db)):
    """Last use of each prompt, expected prompts unused in `days`, defects per prompt and step with trend."""
    return prompt_usage.report(db, days=days)
