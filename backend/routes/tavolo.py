"""Il tavolo di lavoro: /tavolo, /tavolo/{id}, suggest, settle, save, capture.

L'interruttore e' la config `feature_tavolo`: spenta, questi endpoint non
esistono. Un tavolo e' privato di chi l'ha fatto; l'admin puo' leggerlo.

Due invarianti valgono per tutte le rotte che scrivono.

La prima: si scrive sempre una revisione nuova, mai sopra una vecchia. Il
client dichiara l'indice su cui ha lavorato e un indice che non combacia e'
`409`, perche' due schede aperte sullo stesso tavolo non devono sovrascriversi
in silenzio.

La seconda: cio' che manda il modello entra come proposta, e nessuna rotta
scrive `state="live"` per conto suo. La promozione passa da `/settle`, cioe'
da un gesto della persona.
"""
import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..ai_service import AIService, AIError
from ..message_diagrams import session_owner
from ..tavolo import (
    FEATURE_KEY,
    MAX_PROPOSED,
    MAX_TITLE,
    REL_FAMILY,
    TavoloError,
    TavoloGraph,
    accept,
    from_idea_map,
    live,
    parse_graph,
    parse_proposal,
    propose,
    reject,
    rendition,
)
from .chat import _apply_counselor_overrides, _resolve_counselor
from .diagram import _diagram_fallback, _json_object, ModelChoice

logger = logging.getLogger(__name__)

router = APIRouter()
get_db = database.get_db

TAVOLO_STORAGE_DIR = os.getenv("TAVOLO_STORAGE_DIR", "/app/uploads/tavolo")
# Come per i diagrammi: due modelli, riparazione compresa, devono stare sotto
# il limite di 120 secondi del browser.
MODEL_TIMEOUT_SECONDS = 40
MAX_CAPTURE_BYTES = 4 * 1024 * 1024

# Cosa la persona puo' chiedere al modello. Elenco chiuso: il tavolo e' suo, e
# un intento libero diventerebbe un secondo canale di conversazione.
INTENTS = {
    "what-is-missing": "Name what this table is missing to hold together.",
    "organize": "Group what is already there; add only the connections that are implied.",
    "connect": "Connect the pieces that are on the table and are not linked yet.",
    "continue": "Continue the line of reasoning the table has started.",
}

SUGGEST_SYSTEM_PROMPT = (
    "You are looking at someone's working table: a graph of their own thinking. "
    "You never rewrite it. You propose additions, and the person accepts or discards them. "
    "Answer with a single JSON object and nothing else: no prose, no code fence. Schema: "
    '{"add_nodes":[{"id":"a","label":"<= 80 chars","form":"concept"}],'
    '"add_edges":[{"from":"a","to":"b","rel":"causes","strength":2,"hypothesis":false}],'
    '"note":"one sentence, <= 200 chars"}. '
    f"Propose at most {MAX_PROPOSED} nodes and {MAX_PROPOSED} edges, and never fewer than one of either. "
    "Every id you connect must be either already on the table or one you are adding now. "
    "Never repeat an id that is already on the table: you cannot rename what the person wrote. "
    "On each node, form says what kind of thing it is: concept (the default: a thing, an idea, "
    "a state), action (something done), decision (a fork), outcome (where it ends up). "
    "On each edge, rel names the relation, from this closed list, and nothing else: "
    + ", ".join(sorted(REL_FAMILY)) + ". "
    "supports/contradicts/assumes/needs-evidence are about an argument holding or not; "
    "causes/hinders/feeds-back are about one thing producing another; "
    "then/blocks/if are about order and condition; part-of/example-of are about belonging. "
    # I due modificatori esistono per non moltiplicare il vocabolario: se il
    # modello li ignora, ogni legame diventa una legge certa.
    "strength (1, 2 or 3) says how much the link weighs: 1 sometimes, 2 usually, 3 always. "
    "hypothesis:true marks a link you are guessing rather than one the person stated; "
    "use it whenever you are extending their reasoning rather than reading it. "
    "Write every label in the language of the table. Add nothing the person has not "
    "given you grounds for: a proposal they discard costs them more than one you never made."
)


class CreateRequest(BaseModel):
    session_id: str | None = Field(default=None, min_length=1, max_length=200)
    instrument: str | None = Field(default=None, max_length=32)
    title: str = Field(default="", max_length=MAX_TITLE)
    lang: str = Field(default="it", max_length=8)
    counselor_id: int | None = None
    # I due semi. Una mappa di Idea si traduce con una tabella, senza modello:
    # ruoli e tipi di arco sono gia' un vocabolario. Il testo di una chat no,
    # e passa da un modello che ne propone i pezzi.
    idea_map: dict | None = None
    source_text: str | None = Field(default=None, min_length=1, max_length=8000)


class GraphRequest(BaseModel):
    """La persona manda il grafo intero: e' piccolo, e una patch qui non serve."""

    graph: dict
    base_index: int = Field(ge=0)


class SuggestRequest(BaseModel):
    intent: str
    counselor_id: int | None = None
    lang: str = Field(default="it", max_length=8)
    base_index: int = Field(ge=0)


class SettleRequest(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=64)
    action: str = Field(pattern="^(accept|reject)$")
    base_index: int = Field(ge=0)


class SaveRequest(BaseModel):
    title: str = Field(min_length=1, max_length=MAX_TITLE)
    lang: str = Field(default="it", max_length=8)


def feature_enabled(db: Session) -> bool:
    row = db.query(models.Config).filter(models.Config.key == FEATURE_KEY).first()
    return str(getattr(row, "value", "false")).strip().lower() in ("1", "true", "yes", "on")


def _require_feature(db: Session) -> None:
    if not feature_enabled(db):
        raise HTTPException(status_code=404, detail="tavolo disabled")


def _owner(identity: dict) -> str:
    username = (identity or {}).get("username")
    if not username:
        raise HTTPException(status_code=401, detail="autenticazione richiesta")
    return username


def _mine(db: Session, tavolo_id: str, identity: dict) -> models.Tavolo:
    row = db.query(models.Tavolo).filter(models.Tavolo.id == tavolo_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="tavolo non trovato")
    if row.username != _owner(identity) and not (identity or {}).get("is_admin"):
        raise HTTPException(status_code=403, detail="Azione non consentita")
    return row


def _current(db: Session, tavolo_id: str) -> models.TavoloRevision:
    revision = db.query(models.TavoloRevision).filter(
        models.TavoloRevision.tavolo_id == tavolo_id,
    ).order_by(models.TavoloRevision.index.desc()).first()
    if revision is None:
        raise HTTPException(status_code=404, detail="tavolo senza revisioni")
    return revision


def _write(db: Session, tavolo: models.Tavolo, revision: models.TavoloRevision,
           graph: TavoloGraph, *, author: str, kind: str) -> models.TavoloRevision:
    written = models.TavoloRevision(
        tavolo_id=tavolo.id,
        index=revision.index + 1,
        graph=graph.model_dump(by_alias=True, exclude_none=True),
        author=author,
        kind=kind,
    )
    db.add(written)
    db.commit()
    db.refresh(written)
    return written


def _fresh(revision: models.TavoloRevision, base_index: int) -> None:
    """Chi ha lavorato su una revisione superata ricarica invece di sovrascrivere."""
    if revision.index != base_index:
        raise HTTPException(
            status_code=409,
            detail=f"il tavolo e' andato avanti (revisione {revision.index})",
        )


def _view(tavolo: models.Tavolo, revision: models.TavoloRevision) -> dict:
    return {
        "id": tavolo.id,
        "title": tavolo.title,
        "saved": tavolo.saved_at is not None,
        "origin_session_id": tavolo.origin_session_id,
        "origin_instrument": tavolo.origin_instrument,
        "index": revision.index,
        "graph": revision.graph,
        "rendition": tavolo.rendition,
        "has_capture": bool(tavolo.capture_path),
    }


def _graph_of(revision: models.TavoloRevision) -> TavoloGraph:
    try:
        return parse_graph(revision.graph)
    except TavoloError as exc:  # pragma: no cover - una revisione scritta da noi
        logger.error("Revisione di tavolo illeggibile %s: %s", revision.tavolo_id, exc)
        raise HTTPException(status_code=500, detail="revisione illeggibile") from exc


@router.post("/tavolo")
async def create_tavolo(
    request: CreateRequest,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """Apre un tavolo: vuoto, dalla mappa di Idea, o dal testo di una chat.

    I due semi non sono lo stesso gesto. La mappa di Idea e' gia' un
    vocabolario e si traduce con una tabella, percio' arriva come contenuto:
    e' roba che la persona ha gia' costruito. Il testo di una chat invece va
    interpretato da un modello, e allora arriva come proposta, tratteggiata,
    da accettare pezzo per pezzo.
    """
    _require_feature(db)
    owner = _owner(identity)
    if request.session_id:
        session_owner(db, request.session_id, identity)
    try:
        graph = from_idea_map(request.idea_map) if request.idea_map else TavoloGraph(title=request.title)
    except TavoloError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if request.title:
        graph = graph.model_copy(update={"title": request.title})

    tavolo = models.Tavolo(
        id=str(uuid.uuid4()),
        username=owner,
        title=request.title or None,
        origin_session_id=request.session_id,
        origin_instrument=request.instrument,
    )
    db.add(tavolo)
    db.add(models.TavoloRevision(
        tavolo_id=tavolo.id, index=0,
        graph=graph.model_dump(by_alias=True, exclude_none=True),
        author="person", kind="seed",
    ))
    db.commit()
    db.refresh(tavolo)

    if request.source_text:
        # Un seme che non riesce lascia un tavolo vuoto, non un errore: la
        # persona e' gia' arrivata qui, e puo' cominciare a mano.
        proposal, _unavailable = await _ask_model(
            db,
            task=_seed_request(request.source_text, request.lang),
            counselor_id=request.counselor_id,
        )
        if proposal is not None:
            try:
                seeded = propose(graph, proposal)
            except TavoloError as exc:
                logger.warning("Seme del tavolo scartato: %s", exc)
            else:
                _write(db, tavolo, _current(db, tavolo.id), seeded, author="model", kind="proposal")

    return _view(tavolo, _current(db, tavolo.id))


@router.get("/tavolo")
def list_tavoli(
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """L'elenco dei tavoli salvati. Le bozze non compaiono: non hanno un nome."""
    _require_feature(db)
    rows = db.query(models.Tavolo).filter(
        models.Tavolo.username == _owner(identity),
        models.Tavolo.saved_at.isnot(None),
    ).order_by(models.Tavolo.updated_at.desc()).all()
    return [{
        "id": row.id,
        "title": row.title,
        "origin_instrument": row.origin_instrument,
        "has_capture": bool(row.capture_path),
        "saved_at": row.saved_at.isoformat() if row.saved_at else None,
    } for row in rows]


@router.get("/tavolo/{tavolo_id}")
def read_tavolo(
    tavolo_id: str,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    _require_feature(db)
    tavolo = _mine(db, tavolo_id, identity)
    return _view(tavolo, _current(db, tavolo_id))


@router.put("/tavolo/{tavolo_id}")
def write_tavolo(
    tavolo_id: str,
    request: GraphRequest,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """Una mossa della persona: sposta, rinomina, collega, toglie."""
    _require_feature(db)
    tavolo = _mine(db, tavolo_id, identity)
    revision = _current(db, tavolo_id)
    _fresh(revision, request.base_index)
    try:
        graph = parse_graph(request.graph)
    except TavoloError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    written = _write(db, tavolo, revision, graph, author="person", kind="edit")
    return _view(tavolo, written)


@router.post("/tavolo/{tavolo_id}/settle")
def settle_tavolo(
    tavolo_id: str,
    request: SettleRequest,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """Accetta o scarta cio' che il modello ha proposto. Solo qui si promuove."""
    _require_feature(db)
    tavolo = _mine(db, tavolo_id, identity)
    revision = _current(db, tavolo_id)
    _fresh(revision, request.base_index)
    settle = accept if request.action == "accept" else reject
    try:
        graph = settle(_graph_of(revision), request.ids)
    except TavoloError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    written = _write(db, tavolo, revision, graph, author="person", kind=request.action)
    return _view(tavolo, written)


@router.post("/tavolo/{tavolo_id}/suggest")
async def suggest_tavolo(
    tavolo_id: str,
    request: SuggestRequest,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """Chiede al modello delle mosse. Entrano in sospeso, non nel tavolo."""
    _require_feature(db)
    if request.intent not in INTENTS:
        raise HTTPException(status_code=422, detail="intento sconosciuto")
    tavolo = _mine(db, tavolo_id, identity)
    revision = _current(db, tavolo_id)
    _fresh(revision, request.base_index)
    graph = _graph_of(revision)

    proposal, unavailable = await _ask_model(
        db,
        task=_table_request(graph, INTENTS[request.intent], request.lang),
        counselor_id=request.counselor_id,
    )
    if proposal is None:
        # Nessuna proposta valida non e' un tavolo rotto: il tavolo resta com'e'.
        raise HTTPException(status_code=503 if unavailable else 502, detail="nessuna proposta")

    try:
        proposed = propose(graph, proposal)
    except TavoloError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    written = _write(db, tavolo, revision, proposed, author="model", kind="proposal")
    return {**_view(tavolo, written), "note": proposal.note}


@router.post("/tavolo/{tavolo_id}/save")
def save_tavolo(
    tavolo_id: str,
    request: SaveRequest,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """Da' un nome al tavolo e lo stacca dalla sessione: da qui si riprende."""
    _require_feature(db)
    tavolo = _mine(db, tavolo_id, identity)
    revision = _current(db, tavolo_id)
    tavolo.title = request.title
    tavolo.saved_at = tavolo.saved_at or datetime.now(timezone.utc)
    tavolo.rendition = rendition(_graph_of(revision), request.lang)
    db.commit()
    db.refresh(tavolo)
    return _view(tavolo, revision)


@router.post("/tavolo/{tavolo_id}/capture")
async def capture_tavolo(
    tavolo_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """L'immagine del tavolo come si vede, catturata dal browser al salvataggio.

    Legata al salvataggio, non invecchia: un tavolo cambia solo quando lo si
    salva. Se la cattura fallisce il tavolo resta salvato lo stesso, con la sua
    resa a parole: e' l'immagine a essere facoltativa, non il contenuto.
    """
    _require_feature(db)
    tavolo = _mine(db, tavolo_id, identity)
    payload = await file.read(MAX_CAPTURE_BYTES + 1)
    await file.close()
    if len(payload) > MAX_CAPTURE_BYTES:
        raise HTTPException(status_code=413, detail="immagine troppo grande")
    if not payload.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(status_code=422, detail="serve un PNG")
    directory = os.path.join(TAVOLO_STORAGE_DIR, tavolo.username)
    os.makedirs(directory, exist_ok=True)
    path = os.path.join(directory, f"{tavolo.id}.png")
    with open(path, "wb") as handle:
        handle.write(payload)
    tavolo.capture_path = path
    db.commit()
    return {"has_capture": True}


@router.get("/tavolo/{tavolo_id}/capture.png")
def read_capture(
    tavolo_id: str,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    _require_feature(db)
    tavolo = _mine(db, tavolo_id, identity)
    if not tavolo.capture_path or not os.path.exists(tavolo.capture_path):
        raise HTTPException(status_code=404, detail="nessuna immagine")
    return FileResponse(tavolo.capture_path, media_type="image/png")


async def _ask_model(db: Session, *, task: str, counselor_id: int | None
                     ) -> tuple[object | None, bool]:
    """Una proposta dal modello del tavolo, o niente. Non scrive mai da sola.

    Stessa scala di ripieghi dei diagrammi: prima la voce della chat, poi il
    preset di riserva, e per ciascuno un solo tentativo di riparazione del
    JSON. Il booleano dice se il fallimento e' stato un modello irraggiungibile
    (503) o un modello che non sa scrivere il contratto (502).
    """
    candidates: list[ModelChoice] = []
    if counselor_id:
        provider, model, _persona, _name, disable_thinking, budget = _resolve_counselor(db, counselor_id)
        if provider and model:
            candidates.append((provider, model, disable_thinking, budget))
    fallback = _diagram_fallback(db)
    if fallback and fallback[:2] not in [choice[:2] for choice in candidates]:
        candidates.append(fallback)
    if not candidates:
        raise HTTPException(status_code=422, detail="nessun modello configurato")

    unavailable = False
    for provider, model, disable_thinking, budget in candidates:
        ai_service = AIService(db)
        _apply_counselor_overrides(ai_service, disable_thinking, budget)
        ai_service.config['ai_timeout_seconds'] = str(min(
            int(ai_service.config.get('ai_timeout_seconds') or 120), MODEL_TIMEOUT_SECONDS,
        ))
        deadline = asyncio.get_running_loop().time() + MODEL_TIMEOUT_SECONDS
        system_prompt = SUGGEST_SYSTEM_PROMPT
        for attempt in range(2):
            try:
                remaining = deadline - asyncio.get_running_loop().time()
                if remaining <= 0:
                    raise asyncio.TimeoutError
                reply = await asyncio.wait_for(
                    asyncio.to_thread(
                        ai_service.call_model,
                        provider=provider,
                        model=model,
                        user_message=task,
                        system_prompt=system_prompt,
                        max_tokens=1200,
                    ),
                    timeout=remaining,
                )
                return parse_proposal(_json_object(reply)), False
            except (AIError, asyncio.TimeoutError) as exc:
                logger.warning("Tavolo: %s/%s non disponibile (%s)", provider, model, type(exc).__name__)
                unavailable = True
                break
            except (TavoloError, ValueError) as exc:
                unavailable = False
                cause = exc.__cause__
                issues = cause.errors(include_input=False, include_url=False) if isinstance(cause, ValidationError) else []
                logger.warning("Proposta non valida da %s/%s (tentativo %s): %s",
                               provider, model, attempt + 1, [issue["type"] for issue in issues] or ["missing_json"])
                if attempt or not issues:
                    break
                feedback = "; ".join(f"{'.'.join(map(str, issue['loc']))}: {issue['msg']}" for issue in issues)
                system_prompt = SUGGEST_SYSTEM_PROMPT + (
                    " Your previous output failed validation: " + feedback + ". Send the corrected JSON object."
                )
    return None, unavailable


def _seed_request(text: str, lang: str) -> str:
    """Il seme dalla chat: il testo e' materiale da leggere, mai un'istruzione.

    Arriva come proposta, non come contenuto, cosi' il tavolo nasce gia' dentro
    la regola che lo governa: la persona tiene i pezzi che riconosce come suoi
    e scarta gli altri.
    """
    return (
        "The table is empty. Read the passage below and propose the pieces it already contains, "
        "and the connections it already states. Take nothing from outside it.\n"
        f"Language of the table: {lang}\n---\n{text.strip()}"
    )


def _table_request(graph: TavoloGraph, task: str, lang: str) -> str:
    """Il tavolo serializzato per il modello, piu' l'intento della persona.

    Passa da `live`: proporre mosse a partire da proposte non ancora accettate
    farebbe crescere il tavolo su materiale che nessuno ha approvato.
    """
    content = live(graph)
    lines = [f"Table: {content.title or '(untitled)'}", "Nodes:"]
    lines += [f"- {node.id}: {node.label} [{node.form}]" for node in content.nodes] or ["- (empty)"]
    lines.append("Connections:")
    lines += [
        f"- {edge.source} -{edge.rel}-> {edge.target}"
        + (f" ({edge.label})" if edge.label else "")
        for edge in content.edges
    ] or ["- (none)"]
    lines.append(f"Language of the table: {lang}")
    lines.append(task)
    return "\n".join(lines)
