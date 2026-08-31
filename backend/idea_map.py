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
    NODE_FLAWS,
    NODE_ROLES,
    NODE_STATUSES,
    TASK_TYPES,
    DiagramEdge,
    DiagramNode,
    DiagramSpec,
    DiagramSpecError,
    parse_spec,
)

logger = logging.getLogger(__name__)

IDEA_INSTRUMENT = "IDEA"
FEATURE_KEY = "feature_idea_focus"

# Senza un tipo di lavoro dichiarato valgono le quattro gambe generiche: di
# cosa parliamo, cosa do per scontato, cosa non so ancora, cosa faccio adesso.
REQUIRED_ROLES = ("idea", "assumption", "open-question", "step")

# Un albero piu' profondo di questo non e' messa a fuoco, e' procrastinazione
# strutturata: idea -> task -> sotto-task, e basta.
MAX_TASK_DEPTH = 2

# Cosa deve produrre il lavoro decide quando l'idea e' a fuoco. `required` sono
# i ruoli che devono comparire nel ramo di quel task; `pivot` e' la domanda che
# in quel genere di lavoro manca sempre, e che il percorso deve fare almeno una
# volta prima di poter chiudere.
TASK_PROFILES: dict[str, dict] = {
    # --- deve produrre un'affermazione da difendere ---
    "thesis-chapter": {
        "family": "claim",
        "required": ("idea", "evidence", "alternative"),
        "pivot": "what do you have to convince the reader to believe?",
    },
    "article": {
        "family": "claim",
        "required": ("idea", "evidence", "alternative"),
        "pivot": "what does the field currently hold that you are changing?",
    },
    "position": {
        "family": "claim",
        "required": ("idea", "evidence", "alternative"),
        "pivot": "who is right if you are wrong?",
    },
    # --- deve produrre una domanda a cui rispondere ---
    "research-question": {
        "family": "question",
        "required": ("idea", "open-question", "constraint"),
        "pivot": "what would you see, if it were false?",
    },
    "systematic-review": {
        "family": "question",
        "required": ("idea", "open-question", "constraint"),
        "pivot": "what does NOT go in, and why? Take one borderline case and decide it.",
    },
    # --- deve produrre un disegno da eseguire ---
    "empirical-study": {
        "family": "design",
        "required": ("idea", "implication", "constraint", "step"),
        "pivot": "compared to what?",
    },
    "teaching-unit": {
        "family": "design",
        "required": ("idea", "implication", "constraint", "step"),
        "pivot": "how do you tell that they have learnt it?",
    },
    "intervention": {
        "family": "design",
        "required": ("idea", "implication", "constraint", "step"),
        "pivot": "and if nothing changes?",
    },
    # --- deve produrre una scelta ---
    "study-path": {
        "family": "choice",
        "required": ("idea", "alternative", "decision"),
        "pivot": "what do you lose by choosing well?",
    },
    "personal-project": {
        "family": "choice",
        "required": ("idea", "alternative", "decision"),
        "pivot": "who notices, if you do it?",
    },
}


def required_roles(task_type: str | None) -> tuple[str, ...]:
    """I ruoli che quel genere di lavoro deve avere per dirsi a fuoco."""
    profile = TASK_PROFILES.get(task_type or "")
    return tuple(profile["required"]) if profile else REQUIRED_ROLES


def pivot_question(task_type: str | None) -> str:
    """La domanda che in quel lavoro manca sempre."""
    profile = TASK_PROFILES.get(task_type or "")
    return profile["pivot"] if profile else ""

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
    status: str | None = Field(default=None, max_length=16)
    flaw: str | None = Field(default=None, max_length=16)
    task_type: str | None = Field(default=None, max_length=24)
    closed: bool | None = None
    conclusion: str | None = Field(default=None, max_length=120)


class IdeaPatch(BaseModel):
    """Cosa il modello chiede di cambiare nella mappa dopo un turno."""

    model_config = ConfigDict(extra="ignore")

    type: Literal["idea-patch"] = "idea-patch"
    title: str | None = Field(default=None, max_length=80)
    add_nodes: list[DiagramNode] = Field(default_factory=list, max_length=32)
    add_edges: list[DiagramEdge] = Field(default_factory=list, max_length=44)
    update: list[NodeUpdate] = Field(default_factory=list, max_length=32)
    remove: list[str] = Field(default_factory=list, max_length=32)

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
                default_title: str = "Idea", promote_prior_work: bool = False,
                prior_work_message: str = "") -> DiagramSpec:
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
        if change.status is not None:
            node.status = change.status if change.status in NODE_STATUSES else None
        if change.flaw is not None:
            # Stringa vuota = il modello dichiara risolto il difetto che aveva
            # marcato lui. I due calcolati tornano comunque dal server.
            node.flaw = change.flaw if change.flaw in NODE_FLAWS else None
        if change.task_type is not None:
            node.task_type = change.task_type if change.task_type in TASK_TYPES else None
        if change.closed is not None:
            node.closed = change.closed
        if change.conclusion is not None:
            node.conclusion = change.conclusion

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
        merged = parse_spec({
            "type": "mindmap",
            "title": title,
            "nodes": [node.model_dump() for node in nodes],
            "edges": [edge.model_dump(by_alias=True) for edge in edges],
        })
    except DiagramSpecError as exc:
        raise IdeaMapError(str(exc)) from exc

    if promote_prior_work:
        merged = _promote_prior_work(merged, patch, prior_work_message)
    merged = _limit_task_depth(merged)
    return with_computed_flaws(merged)


_WORD_RE = re.compile(r"[^\W\d_]{4,}", re.UNICODE)


def _content_words(text: str) -> set[str]:
    return {word.lower() for word in _WORD_RE.findall(text or "")}


def _promote_prior_work(spec: DiagramSpec, patch: IdeaPatch, message: str = "") -> DiagramSpec:
    """Il lavoro che viene prima diventa un ramo anche se il modello non l'ha aperto.

    Provato su modelli diversi, la dipendenza viene archiviata come
    `constraint` o come `open-question`: si sente il limite, non il lavoro.
    Quando il turno portava un innesco riconosciuto e nessun ramo, il nodo da
    promuovere e' l'unico aggiunto; se ne sono stati aggiunti piu' d'uno, e'
    quello che ripete le parole della frase con cui la persona ha nominato il
    lavoro. Sotto due parole in comune non si promuove niente: indovinare quale
    nodo sia il lavoro e' peggio che lasciare la mappa piatta.
    """
    if any(node.role == "task" for node in patch.add_nodes):
        return spec
    candidates = [node for node in patch.add_nodes if node.role != "idea"]
    if not candidates:
        return spec

    if len(candidates) == 1:
        target = candidates[0].id
    else:
        said = _content_words(message)
        scored = sorted(
            ((len(_content_words(node.label) & said), node.id) for node in candidates),
            reverse=True,
        )
        if not scored or scored[0][0] < 2:
            return spec
        target = scored[0][1]
    nodes = []
    for node in spec.nodes:
        copy = node.model_copy(deep=True)
        if copy.id == target and copy.role != "task":
            logger.info("Innesco di ramo riconosciuto: %s diventa un task", copy.id)
            copy.role = "task"
            copy.icon = NODE_ROLES["task"]
        nodes.append(copy)
    return spec.model_copy(update={"nodes": nodes})


def _limit_task_depth(spec: DiagramSpec) -> DiagramSpec:
    """Un task oltre la profondita' massima diventa un passo.

    Non si scarta il nodo: quel pezzo di lavoro esiste davvero. A quella
    profondita' pero' non e' un progetto da mettere a fuoco, e' l'azione
    successiva, e chiamarlo cosi' e' piu' onesto che aprirgli un ramo.
    """
    changed = False
    nodes = []
    for node in spec.nodes:
        copy = node.model_copy(deep=True)
        if copy.role == "task" and task_depth(spec, copy.id) > MAX_TASK_DEPTH:
            logger.info("Task %s oltre la profondita' massima: diventa un passo", copy.id)
            copy.role = "step"
            copy.icon = NODE_ROLES["step"]
            copy.task_type = None
            changed = True
        nodes.append(copy)
    return spec.model_copy(update={"nodes": nodes}) if changed else spec


# Il modello non riconosce da solo il momento in cui nasce un ramo: provato su
# formulazioni diverse, lo ha mancato tre volte su tre. La dipendenza pero' si
# dice con poche forme fisse in ogni lingua ("prima devo", "non posso finche'"),
# e quelle si riconoscono qui. Il riconoscimento non decide: alza il volume di
# un'istruzione che resta del modello, che puo' comunque non seguirla.
BRANCH_TRIGGERS = {
    # Le forme sono poche ma le parole si interpongono ("prima di tutto pero'
    # dovrei"), percio' i due pezzi si cercano a distanza, non attaccati.
    "it": (r"\bprima\b.{0,20}\b(?:devo|dovrei|bisogna|serve|mi serve|mi servirebbe|occorre|capire|vedere|fare|passare)\b"
           r"|\b(?:devo|dovrei|serve|mi serve|mi servirebbe|occorre|bisogna)\b.{0,30}\bprima\b"
           r"|\bnon posso\b.{0,40}\b(?:finche|prima di)\b"
           r"|\bpartire da\b"),
    "en": (r"\bfirst\b.{0,20}\b(?:have to|need to|must|should|check|see|understand)\b"
           r"|\b(?:have to|need to|must|should)\b.{0,30}\bfirst\b"
           r"|\bbefore (?:that|this|i)\b"
           r"|\bi can(?:'|no)?t\b.{0,40}\buntil\b"),
    "es": r"\bprimero (?:tengo que|debo|necesito)\b|\bantes de\b|\bno puedo\b.{0,40}\bhasta\b",
    "fr": r"\bd'abord je (?:dois|devrais)\b|\bavant (?:de|ca|cela)\b|\bje ne peux pas\b.{0,40}\btant que\b",
    "de": r"\bzuerst muss ich\b|\bbevor\b|\bich kann nicht\b.{0,40}\bbis\b",
    "sv": r"\bforst maste jag\b|\binnan\b|\bjag kan inte\b.{0,40}\btills\b",
}


def names_prior_work(message: str, lang: str = "it") -> bool:
    """La persona ha nominato un lavoro che viene prima dell'idea?"""
    if not message:
        return False
    pattern = BRANCH_TRIGGERS.get((lang or "it").lower()[:2], BRANCH_TRIGGERS["en"])
    return re.search(pattern, message.lower()) is not None


# --- l'albero: chi sta sotto chi ---------------------------------------------

def _adjacency(spec: DiagramSpec) -> dict[str, set[str]]:
    """Grafo non orientato: per la struttura conta il legame, non il verso."""
    links: dict[str, set[str]] = {node.id: set() for node in spec.nodes}
    for edge in spec.edges:
        if edge.source in links and edge.target in links:
            links[edge.source].add(edge.target)
            links[edge.target].add(edge.source)
    return links


def root_id(spec: DiagramSpec) -> str | None:
    """La radice: il nodo accentato, altrimenti il primo con ruolo idea."""
    for node in spec.nodes:
        if node.accent:
            return node.id
    for node in spec.nodes:
        if node.role == "idea":
            return node.id
    return spec.nodes[0].id if spec.nodes else None


def _is_task_node(node) -> bool:
    return node.role in ("idea", "task")


def _levels(spec: DiagramSpec) -> dict[str, int]:
    """Distanza in archi dalla radice; assente = irraggiungibile."""
    start = root_id(spec)
    if start is None:
        return {}
    links = _adjacency(spec)
    seen = {start: 0}
    queue = [start]
    while queue:
        current = queue.pop(0)
        for neighbour in sorted(links.get(current, ())):
            if neighbour not in seen:
                seen[neighbour] = seen[current] + 1
                queue.append(neighbour)
    return seen


def owning_task(spec: DiagramSpec) -> dict[str, str]:
    """A quale task appartiene ogni nodo: il task-antenato piu' vicino.

    Un nodo concettuale lavora per il ramo in cui sta, e i ruoli obbligatori si
    contano dentro quel ramo, non su tutta la mappa.
    """
    start = root_id(spec)
    if start is None:
        return {}
    by_id = {node.id: node for node in spec.nodes}
    links = _adjacency(spec)
    owner = {start: start}
    queue = [start]
    while queue:
        current = queue.pop(0)
        for neighbour in sorted(links.get(current, ())):
            if neighbour in owner:
                continue
            node = by_id[neighbour]
            owner[neighbour] = neighbour if _is_task_node(node) else owner[current]
            queue.append(neighbour)
    return owner


def task_depth(spec: DiagramSpec, node_id: str) -> int:
    """Quanti task si attraversano dalla radice a quel nodo. Radice = 0."""
    start = root_id(spec)
    if start is None or node_id not in {node.id for node in spec.nodes}:
        return 0
    by_id = {node.id: node for node in spec.nodes}
    links = _adjacency(spec)
    # BFS che porta dietro il conto dei task attraversati.
    seen = {start}
    queue = [(start, 0)]
    while queue:
        current, depth = queue.pop(0)
        if current == node_id:
            return depth
        for neighbour in sorted(links.get(current, ())):
            if neighbour in seen:
                continue
            seen.add(neighbour)
            queue.append((neighbour, depth + (1 if _is_task_node(by_id[neighbour]) else 0)))
    return 0


def open_tasks(spec: DiagramSpec) -> list[str]:
    """Rami aperti, radice compresa: ogni task non ancora chiuso."""
    return [node.id for node in spec.nodes if _is_task_node(node) and not node.closed]


# --- i difetti che il server vede da solo ------------------------------------

def computed_flaws(spec: DiagramSpec) -> dict[str, str]:
    """`orphaned` e `unsupported`: topologia, non interpretazione.

    Calcolarli qui li rende non negoziabili. Un modello lasciato a giudicare
    se un'affermazione e' sostenuta finisce per decidere di si'.
    """
    found: dict[str, str] = {}
    reachable = _levels(spec)
    by_id = {node.id: node for node in spec.nodes}
    links = _adjacency(spec)
    start = root_id(spec)

    for node in spec.nodes:
        if node.id != start and node.id not in reachable:
            found[node.id] = "orphaned"
            continue
        if node.role in ("idea", "implication"):
            supported = any(
                by_id[neighbour].role == "evidence"
                for neighbour in links.get(node.id, ())
                if neighbour in by_id
            )
            if not supported:
                found[node.id] = "unsupported"
    return found


def with_computed_flaws(spec: DiagramSpec) -> DiagramSpec:
    """Riscrive i difetti calcolabili, lasciando al modello gli altri tre."""
    found = computed_flaws(spec)
    nodes = []
    for node in spec.nodes:
        copy = node.model_copy(deep=True)
        if node.id in found:
            copy.flaw = found[node.id]
        elif copy.flaw in ("orphaned", "unsupported"):
            # Il difetto calcolato non c'e' piu': toglierlo e' parte del calcolo.
            copy.flaw = None
        nodes.append(copy)
    return spec.model_copy(update={"nodes": nodes})


def missing_roles(spec: DiagramSpec | None, task_node_id: str | None = None) -> list[str]:
    """Cosa manca a quel ramo perche' si possa dire a fuoco.

    Senza `task_node_id` vale la radice. I ruoli si contano dentro il ramo del
    task, non su tutta la mappa: un'evidenza raccolta per un altro lavoro non
    sostiene questo.
    """
    if spec is None:
        return list(REQUIRED_ROLES)
    target = task_node_id or root_id(spec)
    by_id = {node.id: node for node in spec.nodes}
    owner = owning_task(spec)
    task_node = by_id.get(target or "")
    needed = required_roles(getattr(task_node, "task_type", None))
    present = {
        node.role
        for node in spec.nodes
        if node.role and (owner.get(node.id) == target or node.id == target)
    }
    # Il nodo task e' l'affermazione reggente del suo ramo: soddisfa `idea`
    # senza doverne ospitare un secondo.
    if task_node is not None and task_node.role == "task":
        present.add("idea")
    return [role for role in needed if role not in present]


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
                  source: str = "turn", step_id: str | None = None,
                  focus_id: str | None = None) -> models.IdeaMapRevision:
    revision = models.IdeaMapRevision(
        username=username,
        session_id=session_id,
        spec=json.loads(spec.model_dump_json()),
        source=source,
        step_id=step_id,
        focus_id=focus_id,
    )
    db.add(revision)
    db.commit()
    db.refresh(revision)
    return revision


def apply_and_store(db: Session, username: str, session_id: str, patch: IdeaPatch, *,
                    source: str = "turn", step_id: str | None = None,
                    default_title: str = "Idea",
                    promote_prior_work: bool = False,
                    prior_work_message: str = "") -> models.IdeaMapRevision:
    """Passo completo di un turno: applica la patch e scrive la revisione."""
    updated = apply_patch(
        current_map(db, username, session_id), patch,
        default_title=default_title, promote_prior_work=promote_prior_work,
        prior_work_message=prior_work_message,
    )
    return save_revision(
        db, username, session_id, updated, source=source, step_id=step_id,
        focus_id=chosen_focus(db, username, session_id),
    )


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


def map_context(spec: DiagramSpec | None, message: str = "", lang: str = "it",
                chosen_focus: str | None = None) -> str:
    """La mappa corrente come la vede il modello, piu' la mossa da fare.

    Senza questo blocco la skill parla di una mappa che nel prompt non esiste:
    il modello non sa cosa c'e' gia', non puo' riferirsi agli id, e finisce per
    non mandare niente. Inglese come il resto del contratto verso il modello.
    """
    if spec is None:
        return (
            "The map is empty. Create it in THIS turn, from what the person has "
            "already said, EVEN IF the idea is still vague: a vague idea is a "
            "node with \"status\":\"mentioned\", never a reason to wait. Ask "
            "your narrowing question in the same reply, after the block. "
            "At least two nodes and one edge, one node with "
            "\"role\":\"idea\" and \"accent\":true, plus a short \"title\". "
            "If the kind of work is not clear yet, leave \"task_type\" out and "
            "ask about it in your reply - never wait for the answer before "
            "creating the map, or the map never starts. "
            "Never quote or paraphrase this instruction to the person."
        )

    focus = resolve_focus(spec, chosen_focus)
    by_id = {node.id: node for node in spec.nodes}
    owner = owning_task(spec)
    focus_node = by_id.get(focus or "")

    lines = [f"Title: {spec.title}"]
    if focus_node is not None:
        task_type = focus_node.task_type or "not declared yet"
        lines.append(
            f"Branch in hand: {focus_node.id} ({focus_node.label}) - kind of work: {task_type}."
        )

    lines.append("Nodes on the map (use these ids; never rename one):")
    for node in spec.nodes:
        marks = []
        if node.role:
            marks.append(node.role)
        if node.task_type:
            marks.append(node.task_type)
        if node.status:
            marks.append(f"status: {node.status}")
        if node.flaw:
            marks.append(f"FLAW: {node.flaw}")
        if node.closed:
            marks.append("closed")
        if node.accent:
            marks.append("centre")
        where = "" if owner.get(node.id) in (None, focus) else f" [in branch {owner[node.id]}]"
        suffix = f" ({', '.join(marks)})" if marks else ""
        conclusion = f" -> {node.conclusion}" if node.closed and node.conclusion else ""
        lines.append(f"- {node.id}{suffix}{where}: {node.label}{conclusion}")

    lines.append("Links:")
    for edge in spec.edges:
        label = f' "{edge.label}"' if edge.label else ""
        lines.append(f"- {edge.source} -{edge.kind}->{label} {edge.target}")

    move = next_move(spec, chosen_focus)
    lines.append("")
    if names_prior_work(message, lang):
        lines.append(
            "THIS TURN THE PERSON NAMED WORK THAT COMES FIRST. Open a branch "
            "for it now: add a node with `\"role\":\"task\"`, give it the "
            "`task_type` that fits it, and link it to the branch it came from. "
            "The idea already on the map STAYS the centre and keeps its accent "
            "- the new work hangs off it, never replaces it. Everything the "
            "person says about that work from now on hangs off the task node. "
            "Do NOT file it as a `constraint`: a constraint is a limit lived "
            "with, a task is work to be done, and this is work."
        )
    lines.append(
        "FIRST, ALWAYS: record what the person just said. If their message "
        "opens something else - a new piece of work, a correction, a different "
        "direction - follow them and put it on the map. What the branch is "
        "missing can wait: it is a default for when they give no direction, "
        "never a rail to push them back onto.\n"
        "A NEW BRANCH starts whenever they name work that has to be settled "
        "before the idea can be - \"first I have to...\", \"I need to check...\", "
        "\"before that I must...\". That is not a constraint and not a step: add "
        "a node with `\"role\":\"task\"` and its own `task_type`, link it to the "
        "branch it came from, and hang everything that follows off THAT node, "
        "not off the idea."
    )
    lines.append(f"IF THEY GAVE NO DIRECTION, WHAT THIS TURN IS FOR: {move['detail']}.")
    lines.append(
        "Never open two turns in a row with the same diagnosis: if you have "
        "already said it and it is still there, work on something else and "
        "come back to it."
    )
    if move.get("reason") == "flaw":
        lines.append(
            f"Say it plainly first - what the person wrote as "
            f"\"{by_id[move['node_id']].label}\" is {move.get('flaw')} - then ask "
            "the question that repairs it. Say it in THEIR words: never utter a "
            "node id, and never the English term itself."
        )
    elif move.get("reason") == "missing-role":
        lines.append(
            f"The branch still needs a node with role `{move.get('role')}`: "
            "ask the question that produces it, do not invent it yourself."
        )
    elif move.get("reason") == "ready-to-close":
        pivot = move.get("pivot") or ""
        lines.append(
            "Before proposing to close, ask the pivot question of this kind of "
            f"work at least once: \"{pivot}\" Then read back what has been "
            "settled and ASK whether to close the branch. Only when the person "
            "agrees, send `closed: true` with a one-sentence `conclusion`. "
            "Never close on your own."
        )
    elif move.get("reason") == "task-unknown":
        lines.append(
            "Ask what kind of work this is, in plain words, and set `task_type` "
            "on the branch node from the closed list. Keep building the map "
            "meanwhile: the missing kind of work never blocks the map."
        )

    lines.append(
        "Send a patch with what this turn brought. Do not resend what is "
        "already here, and do not rename an id. Nothing in this block is ever "
        "said to the person: it tells you what to do, not what to write."
    )
    return "\n".join(lines)


def map_context_for(db: Session, username: str, session_id: str, *,
                    message: str = "", lang: str = "it") -> str:
    """Blocco [IDEA MAP] per l'envelope della chat.

    Senza utente o sessione (anteprima admin, prompt test) il blocco non
    sparisce: descrive una mappa vuota. Il modello deve vedere il bersaglio su
    cui la skill gli chiede di agire anche quando non c'e' ancora niente.
    """
    spec = current_map(db, username, session_id) if (username and session_id) else None
    picked = chosen_focus(db, username, session_id) if (username and session_id) else None
    return map_context(spec, message=message, lang=lang, chosen_focus=picked)


# --- il percorso derivato ----------------------------------------------------

# Quale step produce quale ruolo, e quale step affronta quale difetto. E' tutto
# cio' che serve per derivare l'albero: non c'e' un ordine, c'e' una mancanza.
STEP_FOR_ROLE = {
    "idea": "idea-statement",
    "assumption": "idea-assumptions",
    "evidence": "idea-evidence",
    "alternative": "idea-alternatives",
    "implication": "idea-implications",
    "constraint": "idea-implications",
    "open-question": "idea-question",
    "step": "idea-synthesis",
    "decision": "idea-synthesis",
}

STEP_FOR_FLAW = {
    "unsupported": "idea-evidence",
    "orphaned": "idea-statement",
    "duplicate": "idea-statement",
    "overloaded": "idea-statement",
    "premature": "idea-assumptions",
}


def branch_flaws(spec: DiagramSpec, task_node_id: str) -> list[tuple[str, str]]:
    """Difetti aperti dentro un ramo: (id del nodo, difetto)."""
    owner = owning_task(spec)
    return [
        (node.id, node.flaw)
        for node in spec.nodes
        if node.flaw and (owner.get(node.id) == task_node_id or node.id == task_node_id)
    ]


def closure_ready(spec: DiagramSpec, task_node_id: str) -> bool:
    """Le condizioni osservabili ci sono: il server puo' proporre la chiusura.

    Proporre, non chiudere: il server vede solo la forma. Chi decide se
    l'obiettivo e' raggiunto e' la persona, dopo che il modello le ha
    rileggibilmente esposto cosa si e' stabilito.
    """
    return not missing_roles(spec, task_node_id) and not branch_flaws(spec, task_node_id)


def current_focus(spec: DiagramSpec) -> str | None:
    """Il ramo su cui si lavora: il task aperto piu' profondo.

    Un ramo alla volta. Gli altri restano sulla mappa ma dormienti, altrimenti
    la conversazione si sfilaccia su tre lavori insieme.
    """
    open_ids = open_tasks(spec)
    if not open_ids:
        return None
    return max(open_ids, key=lambda node_id: (task_depth(spec, node_id), node_id))


def resolve_focus(spec: DiagramSpec, chosen: str | None) -> str | None:
    """Il ramo in lavorazione: quello scelto se esiste ancora, altrimenti il derivato.

    Un ramo scelto e poi rimosso non deve bloccare la sessione su un nodo che
    non c'e' piu'; un ramo chiuso invece resta scegliibile, perche' rileggerlo
    o riaprirlo e' un gesto legittimo.
    """
    if chosen:
        node = next((n for n in spec.nodes if n.id == chosen), None)
        if node is not None and _is_task_node(node):
            return chosen
    return current_focus(spec)


def branches(spec: DiagramSpec | None, chosen_focus: str | None = None) -> list[dict]:
    """L'albero dei rami come lo naviga la persona.

    Solo i nodi che sono lavoro - l'idea e i task -, con quanto manca a
    ciascuno: e' l'unica cosa che dice se vale la pena tornarci.
    """
    if spec is None:
        return []
    focus = resolve_focus(spec, chosen_focus)
    owner = owning_task(spec)
    out = []
    for node in spec.nodes:
        if not _is_task_node(node):
            continue
        parent = None
        if node.role == "task":
            # Il proprietario di un task e' se stesso: il padre e' quello del
            # primo vicino che lo precede nell'albero.
            links = _adjacency(spec)
            levels = _levels(spec)
            here = levels.get(node.id)
            candidates = [
                neighbour for neighbour in links.get(node.id, ())
                if here is not None and levels.get(neighbour, 99) < here
            ]
            parent = owner.get(candidates[0]) if candidates else root_id(spec)
            if parent == node.id:
                parent = root_id(spec)
        out.append({
            "id": node.id,
            "label": node.label,
            "task_type": node.task_type,
            "depth": task_depth(spec, node.id),
            "parent": parent,
            "closed": bool(node.closed),
            "conclusion": node.conclusion,
            "missing_roles": missing_roles(spec, node.id),
            "flaws": len(branch_flaws(spec, node.id)),
            "is_focus": node.id == focus,
        })
    out.sort(key=lambda item: (item["depth"], item["id"]))
    return out


def next_move(spec: DiagramSpec | None, chosen_focus: str | None = None) -> dict:
    """Quale step fare adesso, e perche'.

    Il prossimo step non e' il successivo: e' quello che ripara cio' che al
    ramo in lavorazione manca. `chosen_focus` e' il ramo su cui la persona si
    e' spostata: vince sul derivato finche' resta un ramo vero.
    """
    if spec is None:
        return {"step_id": "idea-intro", "focus": None, "reason": "no-map",
                "detail": "there is no map yet"}

    focus = resolve_focus(spec, chosen_focus)
    if focus is None:
        return {"step_id": "idea-synthesis", "focus": root_id(spec), "reason": "all-closed",
                "detail": "every branch is closed"}

    by_id = {node.id: node for node in spec.nodes}
    node = by_id.get(focus)

    if node is not None and not node.task_type:
        return {"step_id": "idea-intro", "focus": focus, "reason": "task-unknown",
                "detail": "the kind of work is not declared yet"}

    flaws = branch_flaws(spec, focus)
    if flaws:
        node_id, flaw = flaws[0]
        return {"step_id": STEP_FOR_FLAW[flaw], "focus": focus, "reason": "flaw",
                "flaw": flaw, "node_id": node_id,
                "detail": f"node {node_id} is {flaw}"}

    absent = missing_roles(spec, focus)
    if absent:
        role = absent[0]
        return {"step_id": STEP_FOR_ROLE[role], "focus": focus, "reason": "missing-role",
                "role": role, "detail": f"the branch has no {role}"}

    return {"step_id": "idea-synthesis", "focus": focus, "reason": "ready-to-close",
            "pivot": pivot_question(getattr(node, "task_type", None)),
            "detail": "the branch has what it needs: propose closing it"}


def chosen_focus(db: Session, username: str, session_id: str) -> str | None:
    """Il ramo su cui la persona si e' spostata l'ultima volta."""
    revision = current_revision(db, username, session_id)
    return getattr(revision, "focus_id", None)


def set_focus(db: Session, username: str, session_id: str, node_id: str) -> models.IdeaMapRevision:
    """Sposta il lavoro su un altro ramo.

    Scrive una revisione con la stessa mappa e il fuoco nuovo: append-only vale
    anche per la navigazione, e lo storico mostra dove si e' andati e quando.
    """
    spec = current_map(db, username, session_id)
    if spec is None:
        raise IdeaMapError("non c'e' ancora una mappa")
    if not any(node.id == node_id and _is_task_node(node) for node in spec.nodes):
        raise IdeaMapError(f"non e' un ramo: {node_id}")
    return save_revision(db, username, session_id, spec, source="focus", focus_id=node_id)
