"""Mappa dello strumento Idea: /idea/map, /idea/map/history, /idea/map/image.

L'interruttore e' la config `feature_idea_focus`: spenta, questi endpoint non
esistono. La mappa e' privata di chi l'ha fatta; l'admin puo' leggerla.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from .. import auth, database, models
from ..diagram_render import DiagramSpecError, describe, render, spec_fingerprint
from ..idea_map import (
    FEATURE_KEY,
    IdeaMapError,
    apply_and_store,
    current_map,
    current_revision,
    history,
    missing_roles,
    parse_patch,
)

logger = logging.getLogger(__name__)

router = APIRouter()
get_db = database.get_db


class PatchRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=120)
    patch: dict
    step_id: str | None = Field(default=None, max_length=60)
    source: str = Field(default="manual", pattern="^(turn|manual|synthesis)$")
    title: str = Field(default="Idea", max_length=80)


def feature_enabled(db: Session) -> bool:
    row = db.query(models.Config).filter(models.Config.key == FEATURE_KEY).first()
    return str(getattr(row, "value", "false")).strip().lower() in ("1", "true", "yes", "on")


def _require_feature(db: Session) -> None:
    if not feature_enabled(db):
        raise HTTPException(status_code=404, detail="idea focus disabled")


def _owner(identity: dict) -> str:
    username = (identity or {}).get("username")
    if not username:
        raise HTTPException(status_code=401, detail="autenticazione richiesta")
    return username


def _readable_owner(identity: dict, requested: str | None) -> str:
    """Chi ha scritto la mappa la legge; l'admin puo' leggere quella altrui."""
    if requested and requested != _owner(identity):
        if not (identity or {}).get("is_admin"):
            raise HTTPException(status_code=403, detail="Azione non consentita")
        return requested
    return _owner(identity)


@router.get("/idea/map")
def read_map(
    session_id: str = Query(min_length=1),
    username: str | None = None,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """Mappa corrente della sessione, con cosa le manca per dirsi a fuoco."""
    _require_feature(db)
    owner = _readable_owner(identity, username)
    revision = current_revision(db, owner, session_id)
    spec = current_map(db, owner, session_id)
    return {
        "session_id": session_id,
        "revision_id": getattr(revision, "id", None),
        "updated_at": getattr(revision, "created_at", None),
        "spec": None if spec is None else spec.model_dump(by_alias=True),
        "description": None if spec is None else describe(spec),
        "missing_roles": missing_roles(spec),
        "complete": spec is not None and not missing_roles(spec),
    }


@router.get("/idea/map/history")
def read_history(
    session_id: str = Query(min_length=1),
    username: str | None = None,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """Tappe della mappa: a cosa serve e' vedere il pensiero muoversi."""
    _require_feature(db)
    owner = _readable_owner(identity, username)
    return [
        {
            "revision_id": revision.id,
            "created_at": revision.created_at,
            "source": revision.source,
            "step_id": revision.step_id,
            "nodes": len((revision.spec or {}).get("nodes", [])),
        }
        for revision in history(db, owner, session_id)
    ]


@router.post("/idea/map/patch")
def patch_map(
    request: PatchRequest,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """Applica una patch e scrive una revisione nuova."""
    _require_feature(db)
    owner = _owner(identity)
    try:
        patch = parse_patch(request.patch)
        revision = apply_and_store(
            db, owner, request.session_id, patch,
            source=request.source, step_id=request.step_id, default_title=request.title,
        )
    except IdeaMapError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    spec = current_map(db, owner, request.session_id)
    return {
        "revision_id": revision.id,
        "spec": None if spec is None else spec.model_dump(by_alias=True),
        "missing_roles": missing_roles(spec),
        "complete": spec is not None and not missing_roles(spec),
    }


@router.get("/idea/map/image")
async def map_image(
    session_id: str = Query(min_length=1),
    theme: str = "light",
    format: str = Query(default="svg", pattern="^(svg|png)$"),
    lang: str = "it",
    username: str | None = None,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """Disegna la mappa corrente. Non passa da /diagram/render: Idea non deve
    spegnersi quando l'admin spegne la skill dei diagrammi in chat."""
    _require_feature(db)
    owner = _readable_owner(identity, username)
    spec = current_map(db, owner, session_id)
    if spec is None:
        raise HTTPException(status_code=404, detail="nessuna mappa per questa sessione")

    def _draw() -> Response:
        try:
            payload = render(spec, theme=theme, fmt=format, embed_title=(format == "png"), lang=lang)
        except DiagramSpecError as exc:
            logger.info("Mappa Idea non renderizzabile: %s", exc)
            raise HTTPException(status_code=422, detail=str(exc))
        return Response(
            content=payload,
            media_type="image/svg+xml" if format == "svg" else "image/png",
            headers={
                "Cache-Control": "private, max-age=300",
                "ETag": f'"{spec_fingerprint(spec)}-{theme}-{format}"',
                "X-Diagram-Description": describe(spec, lang).encode("ascii", "replace").decode("ascii"),
            },
        )

    return await run_in_threadpool(_draw)
