"""Factory prompt update proposals and automatic alignment for uncustomised prompts (#776).

Builds on #775 (`prompt_factory_alignment` + `prompt_revisions`):
- Prompts never customised (`factory_owned == True`) are updated automatically
  at startup while retaining previous versions in `prompt_revisions`.
- Prompts differing from the factory (especially customised ones) surface as
  proposals with a diff and three actions: Accept, Ignore, or Merge by hand.
- Ignored or manually-merged proposals stay hidden only for that exact
  `factory_hash`; a subsequent release with a new factory text reopens them.
"""
from __future__ import annotations

from datetime import UTC, datetime
from sqlalchemy.orm import Session

from . import models, prompt_factory_alignment, prompt_revisions, prompt_updates

VALID_SCOPES = (prompt_revisions.SCOPE_CONFIG, prompt_revisions.SCOPE_GUIDED_STEP)


def _delete_dismissals(db: Session, pairs: list[tuple[str, str]]) -> None:
    for scope, key in pairs:
        (
            db.query(models.PromptFactoryProposalDismissal)
            .filter(
                models.PromptFactoryProposalDismissal.scope == scope,
                models.PromptFactoryProposalDismissal.target_key == key,
            )
            .delete(synchronize_session=False)
        )


def _upsert_dismissal(
    db: Session,
    scope: str,
    key: str,
    *,
    factory_hash: str,
    resolution: str,
    author: str | None,
) -> None:
    row = (
        db.query(models.PromptFactoryProposalDismissal)
        .filter(
            models.PromptFactoryProposalDismissal.scope == scope,
            models.PromptFactoryProposalDismissal.target_key == key,
        )
        .first()
    )
    now = datetime.now(UTC)
    if row is None:
        db.add(
            models.PromptFactoryProposalDismissal(
                scope=scope,
                target_key=key,
                dismissed_factory_hash=factory_hash,
                resolution=resolution,
                author=author,
                created_at=now,
            )
        )
    else:
        row.dismissed_factory_hash = factory_hash
        row.resolution = resolution
        row.author = author
        row.created_at = now


def auto_apply_uncustomised(db: Session, *, author: str = "system:release") -> dict:
    """Automatically update factory-owned prompts at startup, preserving history."""
    plan = prompt_factory_alignment.make_plan(db, lock_rows=True)
    changes = plan["changes"]
    if not changes:
        return {"updated": 0, "keys": []}
    updated = prompt_updates.apply_plan(
        db,
        {"version": 1, "changes": changes},
        author=author,
        origin=prompt_revisions.ORIGIN_MIGRATION,
    )
    _delete_dismissals(db, [(item["scope"], item["key"]) for item in changes])
    db.commit()
    return {
        "updated": updated,
        "keys": [f"{item['scope']}:{item['key']}" for item in changes],
    }


def list_proposals(db: Session) -> dict:
    """Return pending and ignored factory update proposals with diffs and counter."""
    plan = prompt_factory_alignment.make_plan(db)
    dismissals = {
        (row.scope, row.target_key): row
        for row in db.query(models.PromptFactoryProposalDismissal).all()
    }
    candidates = [
        *plan["changes"],
        *(item for item in plan["preserved"] if item.get("reason") == "personalised"),
    ]
    proposals: list[dict] = []
    ignored: list[dict] = []
    for item in candidates:
        scope = item["scope"]
        key = item["key"]
        current_text = item.get("before") or ""
        factory_text = item.get("after") or ""
        factory_hash = prompt_updates.digest(factory_text)
        entry = {
            "prompt_id": f"{scope}:{key}",
            "scope": scope,
            "key": key,
            "status": item.get("status") or "customised",
            "current_text": current_text,
            "factory_text": factory_text,
            "current_hash": item.get("expected_hash") or prompt_updates.digest(current_text),
            "factory_hash": factory_hash,
            "resolution": None,
            "dismissed_by": None,
            "dismissed_at": None,
        }
        dismissal = dismissals.get((scope, key))
        if dismissal is not None and dismissal.dismissed_factory_hash == factory_hash:
            if dismissal.resolution == "merged":
                continue
            if dismissal.resolution == "ignored":
                entry["resolution"] = "ignored"
                entry["dismissed_by"] = dismissal.author
                entry["dismissed_at"] = dismissal.created_at.isoformat() if dismissal.created_at else None
                ignored.append(entry)
                continue
        proposals.append(entry)

    proposals.sort(key=lambda p: (0 if p["status"] == "factory_update" else 1, p["prompt_id"]))
    ignored.sort(key=lambda p: p["prompt_id"])
    return {
        "pending_count": len(proposals),
        "proposals": proposals,
        "ignored": ignored,
    }


def pending_count(db: Session) -> int:
    return list_proposals(db)["pending_count"]


def _load_locked_proposal(
    db: Session,
    scope: str,
    key: str,
    expected_current_hash: str,
    expected_factory_hash: str,
):
    if scope not in VALID_SCOPES:
        raise LookupError(f"Unknown scope: {scope}")
    configs, steps = prompt_factory_alignment.factory_catalog()
    if scope == prompt_revisions.SCOPE_CONFIG:
        if key not in configs:
            raise LookupError(f"Prompt not eligible: {scope}/{key}")
        after = configs[key]
        row = db.query(models.Config).filter(models.Config.key == key).with_for_update().first()
        field = "value"
    else:
        if key not in steps:
            raise LookupError(f"Prompt not eligible: {scope}/{key}")
        step = steps[key]
        after = step["prompt"]
        row = db.query(models.GuidedStep).filter(models.GuidedStep.id == key).with_for_update().first()
        field = "prompt"
        if row is not None and (row.questionnaire_type or "").upper() != step["questionnaire_type"].upper():
            raise LookupError(f"Prompt belongs to different instrument: {scope}/{key}")
    if row is None:
        raise LookupError(f"Prompt not found: {scope}/{key}")

    before = getattr(row, field) or ""
    if before == after:
        raise ValueError("already_aligned")
    factory_hash = prompt_updates.digest(after)
    if prompt_updates.digest(before) != expected_current_hash or factory_hash != expected_factory_hash:
        raise ValueError("stale_proposal")
    is_customised = not prompt_factory_alignment.factory_owned(db, scope, key, before)
    return row, field, before, after, factory_hash, is_customised


def _ensure_previous_revision(
    db: Session,
    scope: str,
    key: str,
    before: str,
    *,
    is_customised: bool,
    author: str | None,
) -> None:
    if is_customised:
        latest = prompt_revisions.latest(db, scope, key)
        if latest is None or latest.value != before or latest.origin != prompt_revisions.ORIGIN_ADMIN:
            prompt_revisions.record(
                db,
                scope,
                key,
                before,
                prompt_revisions.ORIGIN_ADMIN,
                author=author,
                note="versione precedente",
            )
            db.flush()
    else:
        prompt_revisions.ensure_baseline(db, scope, key, before)


def accept_proposal(
    db: Session,
    scope: str,
    key: str,
    *,
    expected_current_hash: str,
    expected_factory_hash: str,
    author: str | None,
) -> dict:
    try:
        row, field, before, after, _, is_customised = _load_locked_proposal(
            db, scope, key, expected_current_hash, expected_factory_hash,
        )
        _ensure_previous_revision(db, scope, key, before, is_customised=is_customised, author=author)
        setattr(row, field, after)
        prompt_revisions.record(
            db,
            scope,
            key,
            after,
            prompt_revisions.ORIGIN_MIGRATION,
            author=author,
            note="proposta di fabbrica accettata",
        )
        _delete_dismissals(db, [(scope, key)])
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {
        "prompt_id": f"{scope}:{key}",
        "action": "accepted",
        "text": after,
        "pending_count": pending_count(db),
    }


def ignore_proposal(
    db: Session,
    scope: str,
    key: str,
    *,
    expected_current_hash: str,
    expected_factory_hash: str,
    author: str | None,
) -> dict:
    try:
        _, _, _, _, factory_hash, _ = _load_locked_proposal(
            db, scope, key, expected_current_hash, expected_factory_hash,
        )
        _upsert_dismissal(
            db,
            scope,
            key,
            factory_hash=factory_hash,
            resolution="ignored",
            author=author,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {
        "prompt_id": f"{scope}:{key}",
        "action": "ignored",
        "pending_count": pending_count(db),
    }


def reopen_proposal(db: Session, scope: str, key: str) -> dict:
    if scope not in VALID_SCOPES:
        raise LookupError(f"Unknown scope: {scope}")
    configs, steps = prompt_factory_alignment.factory_catalog()
    eligible = key in configs if scope == prompt_revisions.SCOPE_CONFIG else key in steps
    if not eligible:
        raise LookupError(f"Prompt not eligible: {scope}/{key}")
    try:
        _delete_dismissals(db, [(scope, key)])
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {
        "prompt_id": f"{scope}:{key}",
        "action": "reopened",
        "pending_count": pending_count(db),
    }


def merge_proposal(
    db: Session,
    scope: str,
    key: str,
    *,
    merged_text: str,
    expected_current_hash: str,
    expected_factory_hash: str,
    author: str | None,
) -> dict:
    try:
        row, field, before, after, factory_hash, is_customised = _load_locked_proposal(
            db, scope, key, expected_current_hash, expected_factory_hash,
        )
        _ensure_previous_revision(db, scope, key, before, is_customised=is_customised, author=author)
        setattr(row, field, merged_text)
        if merged_text == after:
            prompt_revisions.record(
                db,
                scope,
                key,
                merged_text,
                prompt_revisions.ORIGIN_MIGRATION,
                author=author,
                note="unione manuale identica alla fabbrica",
            )
            _delete_dismissals(db, [(scope, key)])
        else:
            prompt_revisions.record(
                db,
                scope,
                key,
                merged_text,
                prompt_revisions.ORIGIN_ADMIN,
                author=author,
                note="unione manuale con proposta di fabbrica",
            )
            _upsert_dismissal(
                db,
                scope,
                key,
                factory_hash=factory_hash,
                resolution="merged",
                author=author,
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {
        "prompt_id": f"{scope}:{key}",
        "action": "merged",
        "text": merged_text,
        "pending_count": pending_count(db),
    }
