"""Admin endpoints of the static prompt health check (#760). Warnings only: nothing here blocks a save."""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import auth, database, prompt_health

router = APIRouter()
get_db = database.get_db


class PromptCheckRequest(BaseModel):
    prompt_id: str = Field(..., pattern=r"^(config|guided_step):.+$", max_length=300)


def _rerun_after_save() -> None:
    db = database.SessionLocal()
    try:
        prompt_health.run_check(db, trigger="save")
    except Exception:
        db.rollback()
        prompt_health.logger.warning("Prompt health check after save failed", exc_info=True)
    finally:
        db.close()


@router.get("/admin/prompt-health")
def latest_prompt_health(current_user=Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Latest stored run; `current` is false when the texts changed since it was computed."""
    return {"run": prompt_health.serialize(prompt_health.latest_run(db), current_hash=prompt_health.texts_hash(db))}


@router.post("/admin/prompt-health/run")
def run_prompt_health(current_user=Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Run the check now; an unchanged text hash reuses the stored run."""
    run, previous = prompt_health.run_check(db, trigger="manual")
    return {"run": prompt_health.serialize(run), "new": prompt_health.new_findings(run, previous)}


@router.post("/admin/prompt-health/check-prompt")
def check_saved_prompt(payload: PromptCheckRequest, background: BackgroundTasks,
                       current_user=Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """New findings for a prompt just saved; the full run is refreshed in the background."""
    try:
        findings = prompt_health.check_prompt(db, payload.prompt_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    background.add_task(_rerun_after_save)
    return {"prompt_id": payload.prompt_id, "new": findings}
