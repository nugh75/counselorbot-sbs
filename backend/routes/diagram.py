"""Rendering dei diagrammi concettuali della chat: /diagram/render, /diagram/from-message.

L'interruttore della funzione e' la skill `concept-diagram` nel pannello admin:
spenta o non pubblicata, questi endpoint non esistono.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from .. import auth, database, models
from ..ai_service import AIService, AIError
from ..diagram_render import (
    DiagramSpec,
    DiagramSpecError,
    describe,
    parse_spec,
    render,
    spec_fingerprint,
)

logger = logging.getLogger(__name__)

router = APIRouter()
get_db = database.get_db

SKILL_SLUG = "concept-diagram"

SPEC_ONLY_SYSTEM_PROMPT = (
    "You turn an explanation into one concept diagram. Answer with a single JSON object "
    "and nothing else: no prose, no code fence. Schema: "
    '{"type":"flow|relation|cycle|hierarchy","title":"<= 80 chars",'
    '"nodes":[{"id":"a","label":"<= 80 chars","icon":"target","accent":false}],'
    '"edges":[{"from":"a","to":"b","label":"<= 40 chars","kind":"drives"}]}. '
    "Use 2 to 8 nodes and at most 12 edges. Mark at most one node with accent:true: "
    "the one the reader should act on. Give each node a fitting icon when possible, "
    "chosen only from book, brain, check, clock, compass, heart, idea, question, "
    "shield, target; omit it rather than inventing another name. On each edge, kind "
    "names the relation and is "
    "drawn with its own stroke: drives (A produces B, the default), strengthens "
    "(A supports B), weakens (A hinders B), feedback (B returns on A and closes the "
    "loop), link (they belong together, no direction). Choose the one the text "
    "actually states. Write every label in the language of the text "
    "you are given. Keep only what the text actually says."
)


class RenderRequest(BaseModel):
    spec: dict
    theme: str = "light"
    format: str = Field(default="svg", pattern="^(svg|png)$")
    embed_title: bool = False
    lang: str = "it"


class FromMessageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    theme: str = "light"
    lang: str = "it"


def feature_enabled(db: Session) -> bool:
    skill = db.query(models.Skill).filter(models.Skill.slug == SKILL_SLUG).first()
    return bool(skill is not None and skill.is_active and skill.status == "published")


def _require_feature(db: Session) -> None:
    if not feature_enabled(db):
        raise HTTPException(status_code=404, detail="diagrams disabled")


def _image_response(spec: DiagramSpec, *, theme: str, fmt: str, embed_title: bool, lang: str) -> Response:
    try:
        payload = render(spec, theme=theme, fmt=fmt, embed_title=embed_title, lang=lang)
    except DiagramSpecError as exc:
        logger.info("Diagramma non renderizzabile: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc))
    media_type = "image/svg+xml" if fmt == "svg" else "image/png"
    return Response(
        content=payload,
        media_type=media_type,
        headers={
            "Cache-Control": "private, max-age=86400",
            "ETag": f'"{spec_fingerprint(spec)}-{theme}-{fmt}"',
            "X-Diagram-Description": describe(spec, lang).encode("ascii", "replace").decode("ascii"),
        },
    )


@router.post("/diagram/render")
async def render_diagram(
    request: RenderRequest,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """Disegna uno spec gia' prodotto dal modello dentro un messaggio."""
    _require_feature(db)
    try:
        spec = parse_spec(request.spec)
    except DiagramSpecError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return await run_in_threadpool(
        _image_response,
        spec,
        theme=request.theme,
        fmt=request.format,
        embed_title=request.embed_title,
        lang=request.lang,
    )


@router.post("/diagram/from-message")
async def diagram_from_message(
    request: FromMessageRequest,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """Ricava uno spec dal testo di un messaggio gia' scritto e lo disegna."""
    _require_feature(db)
    ai_service = AIService(db)
    try:
        reply = await run_in_threadpool(
            ai_service.call_model,
            provider=ai_service.config.get("active_provider", "openai"),
            model=ai_service.config.get("model_name", ""),
            user_message=request.text.strip(),
            system_prompt=SPEC_ONLY_SYSTEM_PROMPT,
            max_tokens=700,
        )
    except AIError as exc:
        logger.warning("Diagramma da messaggio: modello non disponibile: %s", exc)
        raise HTTPException(status_code=503, detail="diagram model unavailable")

    try:
        spec = parse_spec(_json_object(reply))
    except DiagramSpecError as exc:
        logger.info("Diagramma da messaggio scartato: %s", exc)
        raise HTTPException(status_code=422, detail="the text does not yield a diagram")

    return await run_in_threadpool(
        _image_response,
        spec,
        theme=request.theme,
        fmt="svg",
        embed_title=False,
        lang=request.lang,
    )


def _json_object(reply) -> str:
    """Estrae l'oggetto JSON dalla risposta, tollerando un fence o del testo attorno."""
    text = reply if isinstance(reply, str) else ""
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        raise DiagramSpecError("nessun oggetto JSON nella risposta")
    return text[start:end + 1]
