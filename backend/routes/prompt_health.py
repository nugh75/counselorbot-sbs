"""Admin endpoints of the static prompt health check (#760). Warnings only: nothing here blocks a save."""
import re

from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import (
    auth,
    database,
    prompt_factory_proposals,
    prompt_health,
    prompt_health_llm,
    prompt_maintainer,
    prompt_registry,
)

router = APIRouter()
get_db = database.get_db


_PROMPT_ID = r"^(config|guided_step):.+$"


class PromptCheckRequest(BaseModel):
    prompt_id: str = Field(..., pattern=_PROMPT_ID, max_length=300)


class PromptSaveRequest(PromptCheckRequest):
    text: str = Field(..., max_length=200_000)
    confirm_first_level: bool = False


class PromptEvaluateRequest(BaseModel):
    prompt_ids: list[str] = Field(default_factory=list, max_length=3)
    drafts: dict[str, str] = Field(default_factory=dict, max_length=3)
    surface: str | None = Field(None, max_length=300)


class PromptAckRequest(BaseModel):
    finding_id: str = Field(..., pattern=r"^[0-9a-f]{16}$")
    note: str = Field("", max_length=2000)


_session_factory = None  # tests point the background checks at their database


def _llm_after_change(prompt_id: str, identity: dict) -> None:
    """LLM contradiction check of a changed prompt (#763): only with a chosen model."""
    prompt_health_llm.run_after_change(_session_factory or database.SessionLocal, prompt_id, identity)


def _bind_checker(db: Session, identity: dict, language: str = "it") -> None:
    from ..chatgpt_connections import bind_identity
    bind_identity(db, identity, language)


def _checker_actor(identity: dict) -> dict:
    return {key: identity.get(key) for key in ("username", "authenticated", "is_admin", "groups")}


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
    run = prompt_health.latest_run(db)
    numbers = prompt_health.track_problems(db, run.findings or [], "static") if run is not None else {}
    return {
        "run": prompt_health.serialize(
            run,
            current_hash=prompt_health.texts_hash(db),
            marked=prompt_health.acks(db),
            numbers=numbers,
        ),
        "pending_proposals": prompt_factory_proposals.pending_count(db),
    }


@router.post("/admin/prompt-health/run")
def run_prompt_health(current_user=Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Run the check now; an unchanged text hash reuses the stored run."""
    run, previous = prompt_health.run_check(db, trigger="manual")
    numbers = prompt_health.problem_numbers(db, [finding["id"] for finding in run.findings or []])
    return {"run": prompt_health.serialize(run, marked=prompt_health.acks(db), numbers=numbers),
            "new": prompt_health.new_findings(run, previous)}


@router.get("/admin/prompt-health/problems")
def prompt_health_problems(current_user=Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """History of every problem found, each with its unique number, open or resolved."""
    return {"problems": prompt_health.problem_history(db)}


@router.post("/admin/prompt-health/check-prompt")
def check_saved_prompt(payload: PromptCheckRequest, background: BackgroundTasks,
                       current_user=Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """New findings for a prompt just saved; the full run is refreshed in the background."""
    try:
        findings = prompt_health.check_prompt(db, payload.prompt_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    background.add_task(_rerun_after_save)
    background.add_task(_llm_after_change, payload.prompt_id, _checker_actor(current_user))
    return {"prompt_id": payload.prompt_id, "new": findings}


# --- Compare screen and actions on warnings (#761) ------------------------------------

def _not_found(exc: Exception) -> HTTPException:
    return HTTPException(status_code=404, detail=f"prompt_not_found: {exc}")


@router.get("/admin/prompt-health/map")
def prompt_health_map(current_user=Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Paths x steps with prompts, turns, ownership status and tier of every stored prompt."""
    return {
        "paths": prompt_health.turn_map(db),
        "prompt_statuses": prompt_health.all_prompt_statuses(db),
        "prompt_levels": prompt_health.all_prompt_levels(db),
    }


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
    """Save one prompt from the compare screen: requires confirm_first_level for tier 1."""
    if prompt_registry.prompt_level(payload.prompt_id) == prompt_registry.LEVEL_FIRST and not payload.confirm_first_level:
        raise HTTPException(status_code=409, detail="first_level_confirmation_required")
    try:
        prompt_health.save_prompt(db, payload.prompt_id, payload.text, current_user.get("username"))
        findings = prompt_health.evaluate(db, prompt_ids=[payload.prompt_id])["findings"]
    except (LookupError, ValueError) as exc:
        raise _not_found(exc) from exc
    background.add_task(_rerun_after_save)
    background.add_task(_llm_after_change, payload.prompt_id, _checker_actor(current_user))
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
    background.add_task(_llm_after_change, payload.prompt_id, _checker_actor(current_user))
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
    _bind_checker(db, current_user)
    return {**prompt_health_llm.settings(db), "providers": prompt_health_llm.available_providers(db),
            "max_calls_per_run": prompt_health_llm.MAX_CALLS_PER_RUN}


@router.put("/admin/prompt-health/llm/settings")
def save_llm_settings(payload: LlmSettingsRequest, current_user=Depends(auth.get_current_active_admin),
                      db: Session = Depends(get_db)):
    """Choose the model, or clear both fields to switch the LLM check off."""
    _bind_checker(db, current_user)
    provider, model = payload.provider.strip(), payload.model.strip()
    if bool(provider) != bool(model) or (provider and provider not in prompt_health_llm.available_providers(db)):
        raise HTTPException(status_code=422, detail="provider_not_available")
    if model and not re.match(r"^[\w.:/@+-]+$", model):
        raise HTTPException(status_code=422, detail="invalid model id")
    try:
        saved = prompt_health_llm.save_settings(db, provider, model)
    except prompt_health_llm.NotConfigured as exc:
        raise _not_configured() from exc
    return {**saved, "providers": prompt_health_llm.available_providers(db), "max_calls_per_run": prompt_health_llm.MAX_CALLS_PER_RUN}


@router.get("/admin/prompt-health/llm")
def llm_findings(current_user=Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Cached contradictions still present in the current texts. Never calls the model."""
    findings = prompt_health_llm.current_findings(db)
    numbers = prompt_health.track_problems(db, findings, "llm")
    return {"findings": prompt_health.with_acks(findings, prompt_health.acks(db), numbers)}


@router.post("/admin/prompt-health/llm/estimate")
def llm_estimate(payload: LlmRunRequest, current_user=Depends(auth.get_current_active_admin),
                 db: Session = Depends(get_db)):
    """Calls a run would make (the rest is cached), with tokens and cost when known."""
    _bind_checker(db, current_user, payload.language or "it")
    return prompt_health_llm.estimate(db, _prompt_ids(payload.prompt_ids), payload.language)


@router.post("/admin/prompt-health/llm/run")
def llm_run(payload: LlmRunRequest, current_user=Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Run the LLM check now (on request), at most `max_calls_per_run` calls."""
    _bind_checker(db, current_user, payload.language or "it")
    try:
        result = prompt_health_llm.run(db, _prompt_ids(payload.prompt_ids), payload.language)
    except prompt_health_llm.NotConfigured as exc:
        raise _not_configured() from exc
    numbers = prompt_health.track_problems(db, result["findings"], "llm")
    result["findings"] = prompt_health.with_acks(result["findings"], prompt_health.acks(db), numbers)
    return result


@router.post("/admin/prompt-health/llm/propose")
def llm_propose(payload: LlmProposeRequest, current_user=Depends(auth.get_current_active_admin),
                db: Session = Depends(get_db)):
    """«Proponi correzione»: rewrite of the conflicting sentences, as a diff to accept. Nothing is saved."""
    _bind_checker(db, current_user)
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


# --- Factory prompt update proposals (#776) -----------------------------------------------

class ProposalReopenRequest(BaseModel):
    scope: Literal["config", "guided_step"]
    key: str = Field(..., min_length=1, max_length=250)


class ProposalActionRequest(ProposalReopenRequest):
    expected_current_hash: str = Field(..., min_length=16, max_length=128)
    expected_factory_hash: str = Field(..., min_length=16, max_length=128)


class ProposalMergeRequest(ProposalActionRequest):
    merged_text: str = Field(..., max_length=200_000)
    confirm_first_level: bool = False


@router.get("/admin/prompt-health/proposals")
def list_factory_proposals(
    current_user=Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Pending and ignored factory prompt update proposals with diffs and counter."""
    return prompt_factory_proposals.list_proposals(db)


@router.post("/admin/prompt-health/proposals/accept")
def accept_factory_proposal(
    payload: ProposalActionRequest,
    background: BackgroundTasks,
    current_user=Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Accept one factory prompt proposal; preserves previous text in prompt_revisions."""
    try:
        result = prompt_factory_proposals.accept_proposal(
            db,
            payload.scope,
            payload.key,
            expected_current_hash=payload.expected_current_hash,
            expected_factory_hash=payload.expected_factory_hash,
            author=current_user.get("username"),
        )
    except LookupError as exc:
        raise _not_found(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    prompt_id = result["prompt_id"]
    background.add_task(_rerun_after_save)
    background.add_task(_llm_after_change, prompt_id, _checker_actor(current_user))
    return result


@router.post("/admin/prompt-health/proposals/ignore")
def ignore_factory_proposal(
    payload: ProposalActionRequest,
    current_user=Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Ignore one factory prompt proposal for this factory text version."""
    try:
        return prompt_factory_proposals.ignore_proposal(
            db,
            payload.scope,
            payload.key,
            expected_current_hash=payload.expected_current_hash,
            expected_factory_hash=payload.expected_factory_hash,
            author=current_user.get("username"),
        )
    except LookupError as exc:
        raise _not_found(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/admin/prompt-health/proposals/reopen")
def reopen_factory_proposal(
    payload: ProposalReopenRequest,
    current_user=Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Restore an ignored factory prompt proposal back to the pending list."""
    try:
        return prompt_factory_proposals.reopen_proposal(db, payload.scope, payload.key)
    except LookupError as exc:
        raise _not_found(exc) from exc


@router.post("/admin/prompt-health/proposals/merge")
def merge_factory_proposal(
    payload: ProposalMergeRequest,
    background: BackgroundTasks,
    current_user=Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Save a manual merge of the current prompt and the factory proposal."""
    if (
        prompt_registry.prompt_level(f"{payload.scope}:{payload.key}") == prompt_registry.LEVEL_FIRST
        and not payload.confirm_first_level
    ):
        raise HTTPException(status_code=409, detail="first_level_confirmation_required")
    try:
        result = prompt_factory_proposals.merge_proposal(
            db,
            payload.scope,
            payload.key,
            merged_text=payload.merged_text,
            expected_current_hash=payload.expected_current_hash,
            expected_factory_hash=payload.expected_factory_hash,
            author=current_user.get("username"),
        )
    except LookupError as exc:
        raise _not_found(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    prompt_id = result["prompt_id"]
    background.add_task(_rerun_after_save)
    background.add_task(_llm_after_change, prompt_id, _checker_actor(current_user))
    return result


# --- Maintainer promotion to factory PR (#777) ----------------------------------------

class PromptPromoteRequest(PromptCheckRequest):
    note: str = Field("", max_length=2000)


@router.post("/admin/prompt-health/promote-factory")
def promote_prompt_to_factory(
    payload: PromptPromoteRequest,
    current_user=Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Open a GitHub PR promoting an instance prompt customization to factory (#777)."""
    try:
        return prompt_maintainer.promote_prompt_to_factory(
            db,
            payload.prompt_id,
            note=payload.note,
            actor=current_user.get("username"),
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except LookupError as exc:
        raise _not_found(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail="github_pr_failed") from exc
