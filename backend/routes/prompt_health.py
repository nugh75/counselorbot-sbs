"""Admin endpoints of the static prompt health check (#760). Warnings only: nothing here blocks a save."""
import re

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import auth, database, prompt_health

router = APIRouter()
get_db = database.get_db


_PROMPT_ID = r"^(config|guided_step):.+$"


class PromptCheckRequest(BaseModel):
    prompt_id: str = Field(..., pattern=_PROMPT_ID, max_length=300)


class PromptSaveRequest(PromptCheckRequest):
    text: str = Field(..., max_length=200_000)


class PromptEvaluateRequest(BaseModel):
    prompt_ids: list[str] = Field(default_factory=list, max_length=3)
    drafts: dict[str, str] = Field(default_factory=dict, max_length=3)
    surface: str | None = Field(None, max_length=300)


class PromptAckRequest(BaseModel):
    finding_id: str = Field(..., pattern=r"^[0-9a-f]{16}$")
    note: str = Field("", max_length=2000)


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
    return {"run": prompt_health.serialize(prompt_health.latest_run(db), current_hash=prompt_health.texts_hash(db),
                                           marked=prompt_health.acks(db))}


@router.post("/admin/prompt-health/run")
def run_prompt_health(current_user=Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Run the check now; an unchanged text hash reuses the stored run."""
    run, previous = prompt_health.run_check(db, trigger="manual")
    return {"run": prompt_health.serialize(run, marked=prompt_health.acks(db)), "new": prompt_health.new_findings(run, previous)}


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


# --- Compare screen and actions on warnings (#761) ------------------------------------

def _not_found(exc: Exception) -> HTTPException:
    return HTTPException(status_code=404, detail=f"prompt_not_found: {exc}")


@router.get("/admin/prompt-health/map")
def prompt_health_map(current_user=Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Paths x steps with the prompts and turns of each step (the status comes from the findings)."""
    return {"paths": prompt_health.turn_map(db)}


@router.get("/admin/prompt-health/prompt")
def prompt_health_card(id: str = Query(..., max_length=300), current_user=Depends(auth.get_current_active_admin),
                       db: Session = Depends(get_db)):
    """One prompt: text, factory text, where it arrives, findings of the latest run."""
    try:
        return prompt_health.prompt_card(db, id)
    except (LookupError, ValueError) as exc:
        raise _not_found(exc) from exc


@router.post("/admin/prompt-health/evaluate")
def evaluate_prompt_drafts(payload: PromptEvaluateRequest, current_user=Depends(auth.get_current_active_admin),
                           db: Session = Depends(get_db)):
    """Findings of unsaved drafts (or a re-check of saved prompts). Nothing is written."""
    ids = [*payload.prompt_ids, *payload.drafts]
    if not ids or len(set(ids)) > 3 or any(not re.match(_PROMPT_ID, i) for i in ids):
        raise HTTPException(status_code=422, detail="one to three prompt ids")
    try:
        return prompt_health.evaluate(db, drafts=payload.drafts, prompt_ids=payload.prompt_ids, surface=payload.surface)
    except (LookupError, ValueError) as exc:
        raise _not_found(exc) from exc


@router.post("/admin/prompt-health/save")
def save_prompt_text(payload: PromptSaveRequest, background: BackgroundTasks,
                     current_user=Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Save one prompt from the compare screen: never blocked, findings returned as warnings."""
    try:
        prompt_health.save_prompt(db, payload.prompt_id, payload.text, current_user.get("username"))
        findings = prompt_health.evaluate(db, prompt_ids=[payload.prompt_id])["findings"]
    except (LookupError, ValueError) as exc:
        raise _not_found(exc) from exc
    background.add_task(_rerun_after_save)
    return {"prompt_id": payload.prompt_id, "findings": findings}


@router.post("/admin/prompt-health/restore-factory")
def restore_factory_text(payload: PromptCheckRequest, background: BackgroundTasks,
                         current_user=Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Put the factory text back; later factory updates reach the prompt again."""
    try:
        text = prompt_health.restore_factory(db, payload.prompt_id, current_user.get("username"))
    except (LookupError, ValueError) as exc:
        raise _not_found(exc) from exc
    background.add_task(_rerun_after_save)
    return {"prompt_id": payload.prompt_id, "text": text}


@router.post("/admin/prompt-health/acks")
def mark_finding_intended(payload: PromptAckRequest, current_user=Depends(auth.get_current_active_admin),
                          db: Session = Depends(get_db)):
    """«Segna come voluto»: the finding stays listed with its note and leaves the counter."""
    prompt_health.set_ack(db, payload.finding_id, payload.note.strip(), current_user.get("username"))
    return {"finding_id": payload.finding_id, "ack": prompt_health.acks(db).get(payload.finding_id)}


@router.delete("/admin/prompt-health/acks/{finding_id}")
def unmark_finding(finding_id: str, current_user=Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    prompt_health.clear_ack(db, finding_id)
    return {"finding_id": finding_id, "ack": None}
