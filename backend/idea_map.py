"""Mappa dello strumento Idea: patch del modello -> mappa cumulativa.

Il modello non riscrive la mappa a ogni turno: emette una patch. La
riscrittura completa costa token e fa derivare le etichette, e una mappa che
cambia nome ai nodi a ogni giro non e' piu' un punto fermo per chi la guarda.
La patch invece e' piccola, deterministica, e non puo' cancellare in silenzio:
`remove` esiste, ma il prompt lo lega a una richiesta esplicita dell'utente.

La fonte di verita' e' la riga piu' recente di `idea_map_revisions`.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy.orm import Session

from . import models
from .diagram_render import (
    NODE_ROLES,
    DiagramEdge,
    DiagramNode,
    DiagramSpec,
    DiagramSpecError,
    parse_spec,
)

logger = logging.getLogger(__name__)

IDEA_INSTRUMENT = "IDEA"
FEATURE_KEY = "feature_idea_focus"

# Una mappa e' "a fuoco" quando il ragionamento ha tutte e quattro le gambe:
# di cosa parliamo, cosa sto dando per scontato, cosa non so ancora, cosa
# faccio adesso. Finche' ne manca una, la sessione non e' chiusa.
REQUIRED_ROLES = ("idea", "assumption", "open-question", "step")

# Il modello scrive la patch in un blocco recintato, come gia' fa per i
# diagrammi. Solo i blocchi chiusi: durante lo streaming il fence aperto resta
# testo e non tocca la mappa.
PATCH_BLOCK_RE = re.compile(r"```idea[ \t]*\r?\n(.*?)```", re.DOTALL)


class IdeaMapError(ValueError):
    """Patch fuori contratto: la mappa resta quella di prima."""


class NodeUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1, max_length=40)
    label: str | None = Field(default=None, min_length=1, max_length=80)
    role: str | None = Field(default=None, max_length=24)
    accent: bool | None = None


class IdeaPatch(BaseModel):
    """Cosa il modello chiede di cambiare nella mappa dopo un turno."""

    model_config = ConfigDict(extra="ignore")

    type: Literal["idea-patch"] = "idea-patch"
    title: str | None = Field(default=None, max_length=80)
    add_nodes: list[DiagramNode] = Field(default_factory=list, max_length=24)
    add_edges: list[DiagramEdge] = Field(default_factory=list, max_length=30)
    update: list[NodeUpdate] = Field(default_factory=list, max_length=24)
    remove: list[str] = Field(default_factory=list, max_length=24)

    def is_empty(self) -> bool:
        return not (self.add_nodes or self.add_edges or self.update or self.remove or self.title)


def parse_patch(raw: dict | str) -> IdeaPatch:
    try:
        if isinstance(raw, str):
            return IdeaPatch.model_validate_json(raw)
        return IdeaPatch.model_validate(raw)
    except ValidationError as exc:
        raise IdeaMapError(str(exc)) from exc


def extract_patch(text: str) -> tuple[str, IdeaPatch | None]:
    """Toglie il blocco della patch dal testo e lo interpreta.

    Una patch illeggibile non rompe il messaggio: sparisce e resta la prosa,
    come gia' succede a uno spec di diagramma malformato.
    """
    match = PATCH_BLOCK_RE.search(text or "")
    if not match:
        return text or "", None
    cleaned = (text[: match.start()] + text[match.end():]).strip()
    try:
        patch = parse_patch(match.group(1).strip())
    except IdeaMapError as exc:
        logger.info("Patch della mappa Idea scartata: %s", exc)
        return cleaned, None
    return cleaned, (None if patch.is_empty() else patch)


def apply_patch(current: DiagramSpec | None, patch: IdeaPatch, *,
                default_title: str = "Idea") -> DiagramSpec:
    """Applica la patch e restituisce la mappa nuova, gia' validata.

    Non muta `current`: una revisione, una volta scritta, non si tocca piu'.
    """
    nodes: list[DiagramNode] = [node.model_copy(deep=True) for node in current.nodes] if current else []
    edges: list[DiagramEdge] = [edge.model_copy(deep=True) for edge in current.edges] if current else []
    title = patch.title or (current.title if current else default_title)

    by_id = {node.id: node for node in nodes}
    for incoming in patch.add_nodes:
        if incoming.id in by_id:
            # Ri-aggiungere un nodo esistente vale come aggiornarlo: il modello
            # non deve sapere se lo aveva gia' messo tre turni fa.
            nodes[nodes.index(by_id[incoming.id])] = incoming
            by_id[incoming.id] = incoming
            continue
        nodes.append(incoming)
        by_id[incoming.id] = incoming

    for change in patch.update:
        node = by_id.get(change.id)
        if node is None:
            continue
        if change.label:
            node.label = change.label
        if change.role is not None:
            node.role = change.role if change.role in NODE_ROLES else None
            node.icon = NODE_ROLES.get(node.role) if node.role else node.icon
        if change.accent is not None:
            node.accent = change.accent

    if patch.remove:
        dropped = set(patch.remove)
        nodes = [node for node in nodes if node.id not in dropped]
        by_id = {node.id: node for node in nodes}
        edges = [edge for edge in edges if edge.source not in dropped and edge.target not in dropped]

    known = set(by_id)
    for edge in patch.add_edges:
        if edge.source not in known or edge.target not in known:
            # Arco verso un nodo che non c'e': si scarta l'arco, non la mappa.
            logger.info("Arco della mappa Idea ignorato: %s -> %s", edge.source, edge.target)
            continue
        if any(e.source == edge.source and e.target == edge.target for e in edges):
            continue
        edges.append(edge)

    # Un solo nodo accentato: se il modello ne accende un secondo, vince
    # l'ultimo dichiarato e gli altri si spengono.
    accented = [node for node in nodes if node.accent]
    for node in accented[:-1]:
        node.accent = False

    try:
        return parse_spec({
            "type": "mindmap",
            "title": title,
            "nodes": [node.model_dump() for node in nodes],
            "edges": [edge.model_dump(by_alias=True) for edge in edges],
        })
    except DiagramSpecError as exc:
        raise IdeaMapError(str(exc)) from exc


def missing_roles(spec: DiagramSpec | None) -> list[str]:
    """Cosa manca perche' l'idea si possa dire a fuoco."""
    if spec is None:
        return list(REQUIRED_ROLES)
    present = {node.role for node in spec.nodes if node.role}
    return [role for role in REQUIRED_ROLES if role not in present]


# --- persistenza -----------------------------------------------------------

def current_revision(db: Session, username: str, session_id: str) -> models.IdeaMapRevision | None:
    return (
        db.query(models.IdeaMapRevision)
        .filter(
            models.IdeaMapRevision.username == username,
            models.IdeaMapRevision.session_id == session_id,
        )
        .order_by(models.IdeaMapRevision.id.desc())
        .first()
    )


def current_map(db: Session, username: str, session_id: str) -> DiagramSpec | None:
    revision = current_revision(db, username, session_id)
    if revision is None:
        return None
    try:
        return parse_spec(revision.spec)
    except DiagramSpecError as exc:
        # Una revisione scritta da una versione precedente del contratto non
        # deve bloccare la sessione: si riparte dalla mappa vuota.
        logger.warning("Revisione %s della mappa Idea illeggibile: %s", revision.id, exc)
        return None


def save_revision(db: Session, username: str, session_id: str, spec: DiagramSpec, *,
                  source: str = "turn", step_id: str | None = None) -> models.IdeaMapRevision:
    revision = models.IdeaMapRevision(
        username=username,
        session_id=session_id,
        spec=json.loads(spec.model_dump_json()),
        source=source,
        step_id=step_id,
    )
    db.add(revision)
    db.commit()
    db.refresh(revision)
    return revision


def apply_and_store(db: Session, username: str, session_id: str, patch: IdeaPatch, *,
                    source: str = "turn", step_id: str | None = None,
                    default_title: str = "Idea") -> models.IdeaMapRevision:
    """Passo completo di un turno: applica la patch e scrive la revisione."""
    updated = apply_patch(current_map(db, username, session_id), patch, default_title=default_title)
    return save_revision(db, username, session_id, updated, source=source, step_id=step_id)


def history(db: Session, username: str, session_id: str) -> list[models.IdeaMapRevision]:
    return (
        db.query(models.IdeaMapRevision)
        .filter(
            models.IdeaMapRevision.username == username,
            models.IdeaMapRevision.session_id == session_id,
        )
        .order_by(models.IdeaMapRevision.id.asc())
        .all()
    )


def map_context(spec: DiagramSpec | None) -> str:
    """La mappa corrente come la vede il modello.

    Senza questo blocco la skill parla di una mappa che nel prompt non esiste:
    il modello non sa cosa c'e' gia', non puo' riferirsi agli id, e finisce per
    non mandare niente o per rifare da capo nodi che ci sono gia'.
    Inglese come il resto del contratto verso il modello.
    """
    if spec is None:
        return (
            "The map is empty. Your next `idea` block creates it: at least two "
            "nodes and one edge, one node with \"role\":\"idea\" and "
            "\"accent\":true, plus a short \"title\"."
        )

    lines = [f'Title: {spec.title}', "Nodes already on the map (use these ids; do not repeat them):"]
    for node in spec.nodes:
        role = f" [{node.role}]" if node.role else ""
        centre = " (centre)" if node.accent else ""
        lines.append(f"- {node.id}{role}{centre}: {node.label}")
    lines.append("Links:")
    for edge in spec.edges:
        label = f' "{edge.label}"' if edge.label else ""
        lines.append(f"- {edge.source} -{edge.kind}->{label} {edge.target}")

    absent = missing_roles(spec)
    if absent:
        lines.append(
            "Still missing before the idea can be called focused: " + ", ".join(absent) + "."
        )
    else:
        lines.append("All four roles are present: the idea can be called focused.")
    lines.append(
        "Send a patch that adds what this turn brought. Do not resend what is "
        "already here, and do not rename an id."
    )
    return "\n".join(lines)


def map_context_for(db: Session, username: str, session_id: str) -> str:
    """Blocco [IDEA MAP] per l'envelope della chat.

    Senza utente o sessione (anteprima admin, prompt test) il blocco non
    sparisce: descrive una mappa vuota. Il modello deve vedere il bersaglio su
    cui la skill gli chiede di agire anche quando non c'e' ancora niente.
    """
    spec = current_map(db, username, session_id) if (username and session_id) else None
    return map_context(spec)
