"""Admin endpoints of the static prompt health check (#760). Warnings only: nothing here blocks a save."""
import re

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import auth, database, prompt_health, prompt_health_llm

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


_session_factory = None  # tests point the background checks at their database


def _llm_after_change(prompt_id: str) -> None:
    """LLM contradiction check of a changed prompt (#763): only with a chosen model."""
    prompt_health_llm.run_after_change(_session_factory or database.SessionLocal, prompt_id)


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
    background.add_task(_llm_after_change, payload.prompt_id)
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
    background.add_task(_llm_after_change, payload.prompt_id)
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
    background.add_task(_llm_after_change, payload.prompt_id)
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


# --- LLM contradiction check (#763) -------------------------------------------------------

class LlmSettingsRequest(BaseModel):
    provider: str = Field("", max_length=50)
    model: str = Field("", max_length=200)


class LlmRunRequest(BaseModel):
    prompt_ids: list[str] = Field(default_factory=list, max_length=3)
    language: str | None = Field(None, max_length=5)


class LlmSentence(BaseModel):
    prompt: str = Field(..., max_length=300)
    text: str = Field(..., max_length=2000)


class LlmProposeRequest(BaseModel):
    sentences: list[LlmSentence] = Field(..., min_length=1, max_length=6)
    explanation: str = Field("", max_length=2000)
    drafts: dict[str, str] = Field(default_factory=dict, max_length=3)


def _prompt_ids(ids: list[str]) -> list[str]:
    if any(not re.match(_PROMPT_ID, i) for i in ids):
        raise HTTPException(status_code=422, detail="invalid prompt id")
    return ids


def _not_configured() -> HTTPException:
    return HTTPException(status_code=409, detail="llm_model_not_configured")


@router.get("/admin/prompt-health/llm/settings")
def llm_settings(current_user=Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Model of the LLM check (none by default) and the providers usable with the configured APIs."""
    return {**prompt_health_llm.settings(db), "providers": prompt_health_llm.available_providers(db),
            "max_calls_per_run": prompt_health_llm.MAX_CALLS_PER_RUN}


@router.put("/admin/prompt-health/llm/settings")
def save_llm_settings(payload: LlmSettingsRequest, current_user=Depends(auth.get_current_active_admin),
                      db: Session = Depends(get_db)):
    """Choose the model, or clear both fields to switch the LLM check off."""
    provider, model = payload.provider.strip(), payload.model.strip()
    if bool(provider) != bool(model) or (provider and provider not in prompt_health_llm.available_providers(db)):
        raise HTTPException(status_code=422, detail="provider_not_available")
    if model and not re.match(r"^[\w.:/@+-]+$", model):
        raise HTTPException(status_code=422, detail="invalid model id")
    return {**prompt_health_llm.save_settings(db, provider, model), "providers": prompt_health_llm.available_providers(db),
            "max_calls_per_run": prompt_health_llm.MAX_CALLS_PER_RUN}


@router.get("/admin/prompt-health/llm")
def llm_findings(current_user=Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Cached contradictions still present in the current texts. Never calls the model."""
    return {"findings": prompt_health.with_acks(prompt_health_llm.current_findings(db), prompt_health.acks(db))}


@router.post("/admin/prompt-health/llm/estimate")
def llm_estimate(payload: LlmRunRequest, current_user=Depends(auth.get_current_active_admin),
                 db: Session = Depends(get_db)):
    """Calls a run would make (the rest is cached), with tokens and cost when known."""
    return prompt_health_llm.estimate(db, _prompt_ids(payload.prompt_ids), payload.language)


@router.post("/admin/prompt-health/llm/run")
def llm_run(payload: LlmRunRequest, current_user=Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Run the LLM check now (on request), at most `max_calls_per_run` calls."""
    try:
        result = prompt_health_llm.run(db, _prompt_ids(payload.prompt_ids), payload.language)
    except prompt_health_llm.NotConfigured as exc:
        raise _not_configured() from exc
    result["findings"] = prompt_health.with_acks(result["findings"], prompt_health.acks(db))
    return result


@router.post("/admin/prompt-health/llm/propose")
def llm_propose(payload: LlmProposeRequest, current_user=Depends(auth.get_current_active_admin),
                db: Session = Depends(get_db)):
    """«Proponi correzione»: rewrite of the conflicting sentences, as a diff to accept. Nothing is saved."""
    _prompt_ids(list(payload.drafts))
    try:
        return prompt_health_llm.propose(db, sentences=[s.model_dump() for s in payload.sentences],
                                         explanation=payload.explanation, drafts=payload.drafts)
    except prompt_health_llm.NotConfigured as exc:
        raise _not_configured() from exc
    except LookupError as exc:
        raise _not_found(exc) from exc
    except Exception as exc:  # model unreachable or unreadable answer
        prompt_health.logger.warning("Prompt health LLM proposal failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="llm_proposal_failed") from exc
