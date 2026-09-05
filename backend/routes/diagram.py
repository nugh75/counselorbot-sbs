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
from ..message_diagrams import session_owner, save_diagram, list_diagrams
from ..diagram_render import (
    DiagramSpec,
    DiagramSpecError,
    describe,
    parse_spec,
    render,
    spec_fingerprint,
)
from .chat import _apply_counselor_overrides, _resolve_counselor

logger = logging.getLogger(__name__)

router = APIRouter()
get_db = database.get_db

SKILL_SLUG = "concept-diagram"
DIAGRAM_PRESET_KEY = "diagram_preset_id"

SPEC_ONLY_SYSTEM_PROMPT = (
    "You turn an explanation into one concept diagram. Answer with a single JSON object "
    "and nothing else: no prose, no code fence. Schema: "
    '{"type":"flow|relation|cycle|hierarchy","title":"<= 80 chars",'
    '"nodes":[{"id":"a","label":"<= 80 chars","icon":"target","accent":false}],'
    '"edges":[{"from":"a","to":"b","label":"<= 40 chars","kind":"drives"}]}. '
    "Use 2 to 8 nodes and at most 12 edges. Mark at most one node with accent:true: "
    "the one the reader should act on. An icon makes a node a symbol: its shape goes away "
    "and the icon is drawn above its words. Choose only from book, brain, check, clock, "
    "compass, heart, idea, question, shield, target; never invent another name. A node "
    "carries a shape or a symbol, never both, so either every node in the drawing has an "
    "icon or none does. On each edge, kind "
    "names the relation and is "
    "drawn with its own stroke: drives (A produces B, the default), strengthens "
    "(A supports B), weakens (A hinders B), feedback (B returns on A and closes the "
    "loop), link (they belong together, no direction). Choose the one the text "
    "actually states. On each node, form says what kind of thing it is and picks its shape: "
    "concept (the default: a thing, an idea, a state), action (something done), decision (a "
    "fork the reader stands at), outcome (where it ends up). Use decision only where the "
    "drawing really splits in two. "
    # Il disegno esce dalla chat: schermo intero, PNG di Telegram, PDF. La nota
    # e' l'unica cosa che va con lui.
    "note is one sentence drawn under the diagram: what the drawing shows or how to read it, "
    "never a list of the nodes. Write it whenever the drawing would say little to someone who "
    "has not read the text; leave it out when the title already carries the whole point. "
    "Write the title, the note and every label in the language of the text "
    "you are given -- the whole drawing speaks one language, and it is the reader's. "
    "Keep only what the text actually says. "
    # L'ordine dei nodi non e' cosmetico: e' l'ordine in cui il disegno compare
    # sullo schermo, quindi e' l'ordine in cui verra' letto.
    # Un titolo che nomina l'argomento non aggiunge nulla al disegno, che
    # l'argomento ce l'ha gia' sotto gli occhi. Un titolo che dice la cosa
    # trovata da' al disegno una tesi da sostenere.
    "The title states what the diagram shows, as a claim the drawing supports: "
    "\"Understanding stays in the head and is lost later\", not \"Study factors\". "
    "Never a category, never the name of the area; if the text gives no finding, describe the "
    "mechanism the drawing traces. "
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
    counselor_id: int
    # Il bottone chiede lo spec, non il disegno: lo passa alla stessa card degli
    # altri diagrammi, che ci mette titolo, legenda, zoom e schermo intero.
    spec_only: bool = False
    session_id: str | None = Field(default=None, min_length=1, max_length=200)
    source_text: str | None = Field(default=None, min_length=1, max_length=200000)


def feature_enabled(db: Session) -> bool:
    skill = db.query(models.Skill).filter(models.Skill.slug == SKILL_SLUG).first()
    return bool(skill is not None and skill.is_active and skill.status == "published")


def _require_feature(db: Session) -> None:
    if not feature_enabled(db):
        raise HTTPException(status_code=404, detail="diagrams disabled")


# provider, model, disable_thinking, reasoning_budget
ModelChoice = tuple[str, str, bool | None, int | None]


def _diagram_fallback(db: Session) -> ModelChoice | None:
    """Modello di riserva per lo spec, dichiarato dall'admin.

    Lo spec e' JSON stretto, non conversazione: il modello del counselor puo'
    non saperlo scrivere, non avere preset o essere giu'. `diagram_preset_id`
    nei config dice su quale modello ripiegare. Nessuna riserva implicita dal
    modello globale: il ripiego e' una scelta esplicita, non un'eredita'.
    """
    row = db.query(models.Config).filter(models.Config.key == DIAGRAM_PRESET_KEY).first()
    value = (row.value or "").strip() if row else ""
    if not value.isdigit():
        return None
    preset = db.query(models.ModelPreset).filter(models.ModelPreset.id == int(value)).first()
    if not preset or not preset.provider or not preset.model:
        return None
    return preset.provider, preset.model, bool(preset.disable_thinking), preset.reasoning_budget


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


@router.get("/session/{session_id}/diagrams")
def session_diagrams(
    session_id: str,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    owner = session_owner(db, session_id, identity)
    return list_diagrams(db, session_id, owner)


@router.post("/diagram/from-message")
async def diagram_from_message(
    request: FromMessageRequest,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """Ricava uno spec dal testo di un messaggio gia' scritto e lo disegna."""
    _require_feature(db)
    owner = session_owner(db, request.session_id, identity) if request.session_id else None
    c_provider, c_model, _persona, _name, disable_thinking, reasoning_budget = _resolve_counselor(
        db, request.counselor_id
    )

    # La voce della chat prima, la riserva dopo: il disegno esce comunque anche
    # quando il modello del counselor e' giu' o non sa scrivere lo spec.
    candidates: list[ModelChoice] = []
    if c_provider and c_model:
        candidates.append((c_provider, c_model, disable_thinking, reasoning_budget))
    fallback = _diagram_fallback(db)
    if fallback and fallback[:2] not in [c[:2] for c in candidates]:
        candidates.append(fallback)
    if not candidates:
        raise HTTPException(status_code=422, detail="selected counselor has no configured model")

    spec = None
    unavailable = False
    for provider, model, dt, rb in candidates:
        # Un AIService per tentativo: gli override di un modello non devono
        # restare addosso al successivo.
        ai_service = AIService(db)
        _apply_counselor_overrides(ai_service, dt, rb)
        try:
            reply = await run_in_threadpool(
                ai_service.call_model,
                provider=provider,
                model=model,
                user_message=_spec_request(request),
                system_prompt=SPEC_ONLY_SYSTEM_PROMPT,
                max_tokens=700,
            )
            spec = parse_spec(_json_object(reply))
            break
        except AIError as exc:
            logger.warning("Diagramma: %s/%s non disponibile: %s", provider, model, exc)
            unavailable = True
        except DiagramSpecError as exc:
            logger.info("Diagramma scartato da %s/%s: %s", provider, model, exc)
            unavailable = False

    if spec is None:
        raise HTTPException(
            status_code=503 if unavailable else 422,
            detail="diagram model unavailable" if unavailable else "the text does not yield a diagram",
        )

    if request.session_id and owner:
        save_diagram(db, session_id=request.session_id, username=owner,
                     source_text=request.source_text or request.text,
                     instruction=request.instruction, spec=spec)

    if request.spec_only:
        # `by_alias`: il modello interno tiene source/target, il contratto
        # dichiarato al modello e letto dal browser dice from/to. Senza, il
        # disegno arriva ma nel browser nessun arco combacia.
        return JSONResponse(spec.model_dump(exclude_none=True, by_alias=True))
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
