"""Mappa dello strumento Idea: /idea/map, /idea/map/history, /idea/map/image.

L'interruttore e' la config `feature_idea_focus`: spenta, questi endpoint non
esistono. La mappa e' privata di chi l'ha fatta; l'admin puo' leggerla.
"""
import logging
import os
import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse
from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from .. import auth, database, models
from ..diagram_render import DiagramSpecError, describe, render, spec_fingerprint
from ..idea_synthesis import synthesis_for
from ..pdf_generator import generate_idea_map_pdf
from .portfolio import PORTFOLIO_STORAGE_DIR
from ..idea_lexicon import flaw_word, register_for_variant, status_word, task_label
from ..idea_reference import (
    MAX_REFERENCE_BYTES,
    IdeaReferenceError,
    current_reference,
    extract_reference_text,
    safe_reference_filename,
)
from ..idea_map import (
    FEATURE_KEY,
    IDEA_INSTRUMENT,
    branches,
    chosen_focus,
    closure_ready,
    current_focus,
    next_move,
    PACE_STOPS,
    effective_title,
    pivot_question,
    reopen,
    set_focus,
    wants_plan,
    IdeaMapError,
    apply_and_store,
    current_map,
    current_revision,
    history,
    missing_roles,
    parse_patch,
)
from ..diagram_render import ROLE_WORDS, parse_spec

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


def _reference_metadata(reference) -> dict | None:
    if reference is None:
        return None
    return {
        "filename": reference.filename,
        "kind": reference.kind,
        "characters": len(reference.text or ""),
        "truncated": bool(reference.truncated),
        "created_at": reference.created_at.isoformat() if reference.created_at else None,
    }


@router.post("/idea/reference")
async def upload_reference(
    session_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """Sostituisce il riferimento della sessione con un PDF/TXT/MD."""
    _require_feature(db)
    owner = _owner(identity)
    if not session_id.strip() or len(session_id) > 120:
        raise HTTPException(status_code=422, detail="Sessione non valida.")
    filename = safe_reference_filename(file.filename or "")
    contents = await file.read(MAX_REFERENCE_BYTES + 1)
    await file.close()
    try:
        extracted = await run_in_threadpool(extract_reference_text, filename, contents)
    except IdeaReferenceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db.query(models.IdeaReference).filter(
        models.IdeaReference.username == owner,
        models.IdeaReference.session_id == session_id,
    ).delete(synchronize_session=False)
    reference = models.IdeaReference(
        username=owner,
        session_id=session_id,
        filename=filename,
        kind=extracted.kind,
        text=extracted.text,
        truncated=extracted.truncated,
    )
    db.add(reference)
    db.commit()
    db.refresh(reference)
    return _reference_metadata(reference)


@router.get("/idea/reference")
def read_reference(
    session_id: str = Query(min_length=1, max_length=120),
    username: str | None = None,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    _require_feature(db)
    owner = _readable_owner(identity, username)
    return {"reference": _reference_metadata(current_reference(db, owner, session_id))}


@router.delete("/idea/reference")
def delete_reference(
    session_id: str = Query(min_length=1, max_length=120),
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    _require_feature(db)
    owner = _owner(identity)
    removed = db.query(models.IdeaReference).filter(
        models.IdeaReference.username == owner,
        models.IdeaReference.session_id == session_id,
    ).delete(synchronize_session=False)
    db.commit()
    return {"removed": bool(removed)}


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
    focus = None if spec is None else next_move(spec, chosen_focus(db, owner, session_id))["focus"]
    return {
        "session_id": session_id,
        "revision_id": getattr(revision, "id", None),
        "updated_at": getattr(revision, "created_at", None),
        "spec": None if spec is None else spec.model_dump(by_alias=True),
        "description": None if spec is None else describe(spec),
        "missing_roles": missing_roles(spec, focus),
        "complete": spec is not None and bool(focus) and closure_ready(spec, focus),
        "focus": focus,
        "task_type": _task_type_of(spec, focus),
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


# --- Esiti di fine sessione -------------------------------------------------

class KeepRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=120)
    lang: str = Field(default="it", max_length=5)
    variant: str = Field(default="student-open", max_length=20)


def _map_or_404(db: Session, owner: str, session_id: str):
    spec = current_map(db, owner, session_id)
    if spec is None:
        raise HTTPException(status_code=404, detail="nessuna mappa per questa sessione")
    return spec


def _missing_words(spec, lang: str) -> list[str]:
    words = ROLE_WORDS.get((lang or "it")[:2], ROLE_WORDS["en"])
    return [words[role] for role in missing_roles(spec)]


def _history_specs(db: Session, owner: str, session_id: str) -> list:
    specs = []
    for revision in history(db, owner, session_id):
        try:
            specs.append(parse_spec(revision.spec))
        except DiagramSpecError:
            continue
    return specs


@router.get("/idea/map/pdf")
def map_pdf(
    session_id: str = Query(min_length=1),
    lang: str = "it",
    username: str | None = None,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """La mappa finale, la sua descrizione e le tappe che l'hanno costruita."""
    _require_feature(db)
    owner = _readable_owner(identity, username)
    spec = _map_or_404(db, owner, session_id)
    stream = generate_idea_map_pdf(
        spec,
        history=_history_specs(db, owner, session_id)[:-1],
        missing=_missing_words(spec, lang),
        username=owner,
        session_id=session_id,
        language=lang,
        description=synthesis_for(db, spec, lang),
    )
    return StreamingResponse(
        stream,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="mappa-idea-{session_id[:8]}.pdf"'},
    )


@router.post("/idea/map/portfolio")
def map_to_portfolio(
    request: KeepRequest,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """Salva la mappa come lavoro nel portfolio, con il disegno allegato."""
    _require_feature(db)
    owner = _owner(identity)
    spec = _map_or_404(db, owner, request.session_id)
    return _keep_in_portfolio(db, owner, spec, request.lang)


def _keep_in_portfolio(db: Session, owner: str, spec, lang: str) -> dict:
    item = models.PortfolioItem(
        username=owner,
        title=effective_title(spec),
        description=synthesis_for(db, spec, lang),
        category="idea",
        item_date=date.today().isoformat(),
        images=[],
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    try:
        payload = render(spec, theme="light", fmt="png", embed_title=True, lang=lang)
    except DiagramSpecError as exc:
        # La voce resta, senza disegno: il testo della mappa e' gia' dentro la
        # descrizione, e perdere il lavoro per un rendering fallito sarebbe peggio.
        logger.warning("Mappa Idea non allegata al portfolio: %s", exc)
        return {"item_id": item.id, "image": False}

    user_dir = os.path.join(PORTFOLIO_STORAGE_DIR, str(owner))
    os.makedirs(user_dir, exist_ok=True)
    image_id = uuid.uuid4().hex
    path = os.path.join(user_dir, f"{image_id}.png")
    with open(path, "wb") as handle:
        handle.write(payload)
    item.images = [{
        "id": image_id,
        "filename": "mappa-idea.png",
        "content_type": "image/png",
        "path": path,
    }]
    db.commit()
    return {"item_id": item.id, "image": True}


@router.post("/idea/map/notebook")
def map_to_notebook(
    request: KeepRequest,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """Aggiunge al taccuino una riga su cosa e' emerso dalla sessione.

    Solo per le due varianti studente: il taccuino e' l'auto-descrizione di chi
    studia, non il quaderno di lavoro di un docente.
    """
    _require_feature(db)
    if request.variant == "research":
        raise HTTPException(status_code=409, detail="la variante ricerca non scrive nel taccuino")
    owner = _owner(identity)
    spec = _map_or_404(db, owner, request.session_id)
    return _keep_in_notebook(db, owner, spec, request.session_id)


def _keep_in_notebook(db: Session, owner: str, spec, session_id: str) -> dict:
    step = next((node.label for node in spec.nodes if node.role == "step"), "")
    line = f"Idea ({date.today().isoformat()}): {effective_title(spec)}."
    if step:
        line += f" Prossimo passo: {step}."

    latest = (
        db.query(models.LearnerProfileRevision)
        .filter(models.LearnerProfileRevision.username == owner)
        .order_by(models.LearnerProfileRevision.id.desc())
        .first()
    )
    data = dict((latest.data if latest else {}) or {})
    notes = (data.get("notes") or "").strip()
    combined = f"{notes}\n{line}".strip() if notes else line
    # Il campo e' capped: se serve tagliare, si tiene la coda, cioe' le note
    # piu' recenti, non l'incipit di due anni fa.
    data["notes"] = combined[-600:]

    revision = models.LearnerProfileRevision(
        username=owner,
        data=data,
        source="idea_focus",
        session_id=session_id,
    )
    db.add(revision)
    db.commit()
    db.refresh(revision)
    return {"revision_id": revision.id, "notes": data["notes"]}


def _task_type_of(spec, node_id: str | None) -> str | None:
    if spec is None or not node_id:
        return None
    for node in spec.nodes:
        if node.id == node_id:
            return node.task_type
    return None


@router.get("/idea/next-step")
def read_next_step(
    session_id: str = Query(min_length=1),
    lang: str = "it",
    variant: str = "student-open",
    budget: int | None = None,
    username: str | None = None,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """Quale step tocca adesso e perche'.

    Il percorso non e' una sequenza: il prossimo step e' quello che ripara cio'
    che al ramo in lavorazione manca. La navigazione sta qui e non nel client
    perche' dipende dallo stato della mappa, che vive sul server.
    """
    _require_feature(db)
    owner = _readable_owner(identity, username)
    spec = current_map(db, owner, session_id)
    move = next_move(spec, chosen_focus(db, owner, session_id))
    register = register_for_variant(variant)

    # La ragione in parole: registro accademico per chi fa ricerca, comune per
    # gli altri. La diagnosi sotto e' la stessa.
    reason_text = ""
    if move.get("reason") == "flaw":
        reason_text = flaw_word(move["flaw"], lang, register)
    elif move.get("reason") == "missing-role":
        reason_text = move["role"]
    elif move.get("reason") == "ready-to-close":
        reason_text = move.get("pivot", "")

    focus = move.get("focus")
    task_type = _task_type_of(spec, focus)
    from ..chat_logic import _idea_turns_used

    return {
        **move,
        "turns_used": _idea_turns_used(db, session_id),
        "budget": budget or 0,
        "pace_stops": list(PACE_STOPS),
        "reason_text": reason_text,
        "task_label": task_label(task_type, lang) if task_type else None,
        "pivot": move.get("pivot") or (pivot_question(task_type) if task_type else ""),
        "statuses": {
            node.id: status_word(node.status, lang, register)
            for node in (spec.nodes if spec else [])
            if node.status
        },
        "flaws": {
            node.id: flaw_word(node.flaw, lang, register)
            for node in (spec.nodes if spec else [])
            if node.flaw
        },
    }


class FocusRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=120)
    node_id: str = Field(min_length=1, max_length=40)


@router.post("/idea/reopen")
def reopen_branch(
    request: FocusRequest,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """Riapre un ramo chiuso e ci sposta il lavoro.

    Un'idea chiusa non e' un'idea finita: si torna, si cambia, si richiude.
    """
    _require_feature(db)
    owner = _owner(identity)
    try:
        revision = reopen(db, owner, request.session_id, request.node_id)
    except IdeaMapError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    spec = current_map(db, owner, request.session_id)
    move = next_move(spec, request.node_id)
    return {"revision_id": revision.id, "focus": request.node_id,
            "step_id": move["step_id"], "reason": move["reason"]}


@router.get("/idea/branches")
def read_branches(
    session_id: str = Query(min_length=1),
    lang: str = "it",
    username: str | None = None,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """L'albero dei rami, per navigarlo.

    La chat e' una riga sola: senza questo, i rami esistono nella mappa ma non
    c'e' modo di vederli ne' di tornare su.
    """
    _require_feature(db)
    owner = _readable_owner(identity, username)
    spec = current_map(db, owner, session_id)
    rows = branches(spec, chosen_focus(db, owner, session_id))
    for row in rows:
        row["task_label"] = task_label(row["task_type"], lang) if row["task_type"] else None
        row["wants_plan"] = wants_plan(row["task_type"])
    return rows


@router.post("/idea/focus")
def move_focus(
    request: FocusRequest,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """Sposta il lavoro su un altro ramo."""
    _require_feature(db)
    owner = _owner(identity)
    try:
        revision = set_focus(db, owner, request.session_id, request.node_id)
    except IdeaMapError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    spec = current_map(db, owner, request.session_id)
    move = next_move(spec, request.node_id)
    return {"revision_id": revision.id, "focus": request.node_id, "step_id": move["step_id"],
            "reason": move["reason"], "detail": move["detail"]}


class ConcludeRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=120)
    # Dove va tenuto il risultato. Vuoto e' una risposta legittima: si puo'
    # concludere senza tenere niente.
    targets: list[Literal["notebook", "portfolio"]] = Field(default_factory=list, max_length=2)
    lang: str = Field(default="it", max_length=5)
    variant: str = Field(default="student-open", max_length=20)


@router.post("/idea/conclude")
def conclude(
    request: ConcludeRequest,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity_view_as),
):
    """Chiude la sessione tenendo il risultato dove la persona ha scelto.

    Una destinazione che fallisce non ferma le altre: si torna cosa e' andato
    dove, e la persona vede l'esito di ognuna invece di un errore solo.
    """
    _require_feature(db)
    owner = _owner(identity)
    spec = _map_or_404(db, owner, request.session_id)

    kept: dict[str, dict] = {}
    for target in dict.fromkeys(request.targets):
        try:
            if target == "portfolio":
                kept["portfolio"] = _keep_in_portfolio(db, owner, spec, request.lang)
            elif target == "notebook":
                if request.variant == "research":
                    kept["notebook"] = {"skipped": "la variante ricerca non scrive nel taccuino"}
                    continue
                kept["notebook"] = _keep_in_notebook(db, owner, spec, request.session_id)
        except Exception as exc:  # pragma: no cover - dipende dal disco/DB
            logger.warning("Conclusione Idea, %s non riuscito: %s", target, exc)
            db.rollback()
            kept[target] = {"failed": str(exc)}

    return {
        "session_id": request.session_id,
        "title": effective_title(spec),
        "description": synthesis_for(db, spec, request.lang),
        "kept": kept,
        "pdf_url": f"/api/idea/map/pdf?session_id={request.session_id}&lang={request.lang}",
    }
