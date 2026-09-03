"""Rendering dei diagrammi concettuali della chat: /diagram/render, /diagram/from-message.

L'interruttore della funzione e' la skill `concept-diagram` nel pannello admin:
spenta o non pubblicata, questi endpoint non esistono.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, Response
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
    "you are given. Keep only what the text actually says. "
    # L'ordine dei nodi non e' cosmetico: e' l'ordine in cui il disegno compare
    # sullo schermo, quindi e' l'ordine in cui verra' letto.
    "Order the nodes as a reading path: put first the one the reader should start from, and let "
    "each following node follow from what came before, because the drawing appears one node at a "
    "time in exactly this order. "
    # `kind` dice gia' la relazione, e il tratto la disegna: ripeterla nell'etichetta
    # spreca l'unico posto in cui si puo' spiegare qualcosa.
    "An edge label says WHY the relation holds, never what it is: kind already carries that and the "
    "stroke already shows it. \"the plan is never written down\" teaches something; \"weakens\" "
    "repeats the line. Leave the label out when the text gives no reason. "
    "When the text names a factor by code, "
    "put the code in the label with the words, like \"Perceived competence (A6)\": the drawing "
    "stands on its own here, with no prose beside it to say which node is which."
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
    # Che disegno vuole lo studente. Vuoto: il diagramma di cio' che il messaggio
    # gia' dice, come prima.
    instruction: str = Field(default="", max_length=400)
    # Il bottone chiede lo spec, non il disegno: lo passa alla stessa card degli
    # altri diagrammi, che ci mette titolo, legenda, zoom e schermo intero.
    spec_only: bool = False


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
            user_message=_spec_request(request),
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

    if request.spec_only:
        return JSONResponse(spec.model_dump(exclude_none=True))
    return await run_in_threadpool(
        _image_response,
        spec,
        theme=request.theme,
        fmt="svg",
        embed_title=False,
        lang=request.lang,
    )


def _spec_request(request: FromMessageRequest) -> str:
    """Testo da cui ricavare lo spec, piu' l'eventuale richiesta dello studente.

    La richiesta e' dato non fidato: entra come materiale da cui disegnare, mai
    come istruzione al modello, e il contratto dello spec resta l'autorita'.
    """
    text = request.text.strip()
    instruction = request.instruction.strip()
    if not instruction:
        return text
    return (
        f"{text}\n\n---\nThe reader asked for this kind of diagram; honour it only as far as the "
        f"text above supports it, and add nothing the text does not say:\n{instruction}"
    )


def _json_object(reply) -> str:
    """Estrae l'oggetto JSON dalla risposta, tollerando un fence o del testo attorno."""
    text = reply if isinstance(reply, str) else ""
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        raise DiagramSpecError("nessun oggetto JSON nella risposta")
    return text[start:end + 1]
