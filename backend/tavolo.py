"""Il tavolo: un grafo che persona e modello costruiscono insieme.

Due regole tengono in piedi lo strumento.

La prima riguarda il vocabolario. Le connessioni dicono quattro generi di cosa
(un argomento, una causa, un tempo, un'appartenenza), ma il modello nomina un
token solo: la famiglia si deriva qui. Quattro famiglie messe su una lista
piatta farebbero tredici tipi da tenere a mente, e la lezione delle quattro
forme dei nodi vale anche per gli archi. Forza e incertezza restano fuori dal
vocabolario perche' non sono generi di legame: sono aggettivi di qualunque
legame, e messi fra i tipi li avrebbero moltiplicati.

La seconda riguarda chi scrive. Il modello non tocca il tavolo: propone. Una
proposta entra nel grafo con `state="pending"` e non conta per nessuno finche'
la persona non l'accetta. `live()` e' l'unica vista che vale come contenuto —
la resa a parole, l'export e il conteggio passano tutti di li'.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from .diagram_render import DEFAULT_FORM, FORM_FROM_ROLE, NODE_FORMS

FEATURE_KEY = "feature_tavolo"

# Un tavolo non e' un'illustrazione: cresce per un'ora di lavoro, non per un
# messaggio. I tetti sono quelli oltre i quali smette di essere leggibile.
MAX_NODES = 40
MAX_EDGES = 60
MAX_LABEL = 80
MAX_TITLE = 80
# Quante mosse il modello puo' proporre in una volta. Oltre, la persona non
# giudica piu' le proposte una per una: le accetta in blocco o le scarta tutte.
MAX_PROPOSED = 6

FAMILIES = ("argument", "cause", "time", "part")

# Il vocabolario. La chiave e' l'unica cosa che il modello scrive; il valore e'
# il canale visivo, che sceglie il colore del tratto.
REL_FAMILY: dict[str, str] = {
    "supports": "argument",
    "contradicts": "argument",
    "assumes": "argument",
    "needs-evidence": "argument",
    "causes": "cause",
    "hinders": "cause",
    "feeds-back": "cause",
    "then": "time",
    "blocks": "time",
    "if": "time",
    "part-of": "part",
    "example-of": "part",
}

# Come un legame gia' scritto con le convenzioni dei diagrammi entra nel tavolo.
# La mappa di Idea usa `link` come filo dell'albero, non come relazione
# generica: li' un figlio e' un pezzo del ramo che lo tiene.
REL_FROM_EDGE_KIND = {
    "drives": "causes",
    "strengthens": "supports",
    "weakens": "hinders",
    "feedback": "feeds-back",
    "link": "part-of",
    "unclear": "part-of",
}

# Il legame letto a voce. Registro piano come `diagram_render.describe`: serve a
# chi ascolta invece di guardare, non al pannello.
REL_WORDS = {
    "it": {"supports": "sostiene", "contradicts": "contraddice", "assumes": "da' per scontato",
           "needs-evidence": "chiede una prova a", "causes": "porta a", "hinders": "ostacola",
           "feeds-back": "torna su", "then": "viene prima di", "blocks": "blocca",
           "if": "vale se", "part-of": "fa parte di", "example-of": "e' un caso di"},
    "en": {"supports": "supports", "contradicts": "contradicts", "assumes": "takes for granted",
           "needs-evidence": "needs evidence for", "causes": "leads to", "hinders": "hinders",
           "feeds-back": "feeds back into", "then": "comes before", "blocks": "blocks",
           "if": "holds if", "part-of": "is part of", "example-of": "is a case of"},
    "es": {"supports": "sostiene", "contradicts": "contradice", "assumes": "da por supuesto",
           "needs-evidence": "pide una prueba a", "causes": "lleva a", "hinders": "dificulta",
           "feeds-back": "vuelve a", "then": "viene antes de", "blocks": "bloquea",
           "if": "vale si", "part-of": "forma parte de", "example-of": "es un caso de"},
    "fr": {"supports": "soutient", "contradicts": "contredit", "assumes": "tient pour acquis",
           "needs-evidence": "demande une preuve a", "causes": "mene a", "hinders": "entrave",
           "feeds-back": "revient sur", "then": "vient avant", "blocks": "bloque",
           "if": "vaut si", "part-of": "fait partie de", "example-of": "est un cas de"},
    "de": {"supports": "stutzt", "contradicts": "widerspricht", "assumes": "setzt voraus",
           "needs-evidence": "verlangt einen Beleg fur", "causes": "fuhrt zu", "hinders": "behindert",
           "feeds-back": "wirkt zuruck auf", "then": "kommt vor", "blocks": "blockiert",
           "if": "gilt wenn", "part-of": "ist Teil von", "example-of": "ist ein Fall von"},
    "sv": {"supports": "stodjer", "contradicts": "motsager", "assumes": "tar for givet",
           "needs-evidence": "kraver belagg for", "causes": "leder till", "hinders": "hindrar",
           "feeds-back": "aterverkar pa", "then": "kommer fore", "blocks": "blockerar",
           "if": "galler om", "part-of": "ar en del av", "example-of": "ar ett fall av"},
}

# Il dubbio detto a voce. Un legame ipotetico si vede tratteggiato: chi ascolta
# non ha il tratteggio, e senza questa parola sente una certezza.
DOUBT_WORD = {
    "it": "ipotesi", "en": "hypothesis", "es": "hipotesis",
    "fr": "hypothese", "de": "Annahme", "sv": "antagande",
}

# Quanto pesa il legame, per chi ascolta. Il peso medio non si dice: dirlo a
# ogni arco riempirebbe la lettura di parole che non distinguono niente.
STRENGTH_WORD = {
    "it": {1: "a volte", 3: "sempre"},
    "en": {1: "sometimes", 3: "always"},
    "es": {1: "a veces", 3: "siempre"},
    "fr": {1: "parfois", 3: "toujours"},
    "de": {1: "manchmal", 3: "immer"},
    "sv": {1: "ibland", 3: "alltid"},
}

ISOLATED_WORD = {
    "it": "Senza legami", "en": "Unconnected", "es": "Sin vinculos",
    "fr": "Sans liens", "de": "Ohne Verbindung", "sv": "Utan kopplingar",
}

# Il pezzo accentato: uno solo, e la resa a parole lo dice, altrimenti chi
# ascolta perde l'unica enfasi che il tavolo sa portare.
ACCENT_WORD = {
    "it": "Il punto", "en": "The point", "es": "El punto",
    "fr": "Le point", "de": "Der Punkt", "sv": "Poangen",
}


class TavoloError(ValueError):
    """Un tavolo che non sta in piedi: contratto violato, non errore di sistema."""


def family_of(rel: str) -> str:
    """La famiglia non la dichiara nessuno: e' una proprieta' del verbo."""
    try:
        return REL_FAMILY[rel]
    except KeyError:
        raise TavoloError(f"connessione sconosciuta: {rel}") from None


class TavoloNode(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1, max_length=40)
    label: str = Field(min_length=1, max_length=MAX_LABEL)
    form: str = DEFAULT_FORM
    icon: str | None = Field(default=None, max_length=24)
    # L'enfasi della persona: il pezzo che conta. Uno solo per tavolo, come
    # nei diagrammi: due accenti non accentano niente.
    accent: bool = False
    # Chi lo ha messo li', e a che punto e'. Una proposta del modello non e'
    # contenuto del tavolo finche' la persona non l'ha guardata.
    by: Literal["person", "model"] = "person"
    state: Literal["live", "pending", "dropped"] = "live"
    # Dove sta sul tavolo. La disposizione e' della persona: il seme la calcola
    # una volta, poi nessuno la tocca piu'.
    x: float = 0.0
    y: float = 0.0

    @field_validator("form", mode="before")
    @classmethod
    def _known_form(cls, value):
        return value if value in NODE_FORMS else DEFAULT_FORM


class TavoloEdge(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    source: str = Field(min_length=1, alias="from")
    target: str = Field(min_length=1, alias="to")
    rel: str
    label: str | None = Field(default=None, max_length=40)
    # I due modificatori. Non moltiplicano il vocabolario: lo qualificano.
    strength: int = Field(default=2, ge=1, le=3)
    hypothesis: bool = False
    by: Literal["person", "model"] = "person"
    state: Literal["live", "pending", "dropped"] = "live"

    @field_validator("rel")
    @classmethod
    def _known_rel(cls, value):
        family_of(value)
        return value

    @property
    def family(self) -> str:
        return REL_FAMILY[self.rel]

    @property
    def key(self) -> str:
        return f"{self.source}->{self.target}"


class TavoloGraph(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(default="", max_length=MAX_TITLE)
    nodes: list[TavoloNode] = Field(default_factory=list, max_length=MAX_NODES)
    edges: list[TavoloEdge] = Field(default_factory=list, max_length=MAX_EDGES)


class TavoloProposal(BaseModel):
    """Cio' che il modello puo' dire. Solo aggiungere: togliere non gli compete."""

    model_config = ConfigDict(extra="ignore")

    add_nodes: list[TavoloNode] = Field(default_factory=list, max_length=MAX_PROPOSED)
    add_edges: list[TavoloEdge] = Field(default_factory=list, max_length=MAX_PROPOSED)
    note: str | None = Field(default=None, max_length=200)


def _validated(graph: TavoloGraph) -> TavoloGraph:
    known = {node.id for node in graph.nodes}
    if len(known) != len(graph.nodes):
        raise TavoloError("due nodi con lo stesso id")
    for edge in graph.edges:
        missing = {edge.source, edge.target} - known
        if missing:
            raise TavoloError(f"legame verso un nodo che non c'e': {', '.join(sorted(missing))}")
    if sum(1 for node in graph.nodes if node.accent) > 1:
        raise TavoloError("al massimo un pezzo accentato")
    return graph


def parse_graph(data: dict | str | TavoloGraph) -> TavoloGraph:
    """Valida un grafo (dict o JSON) e solleva `TavoloError` se non regge."""
    if isinstance(data, TavoloGraph):
        return _validated(data)
    try:
        if isinstance(data, str):
            return _validated(TavoloGraph.model_validate_json(data))
        return _validated(TavoloGraph.model_validate(data))
    except ValidationError as exc:
        raise TavoloError(str(exc)) from exc


def parse_proposal(data: dict | str | TavoloProposal) -> TavoloProposal:
    """Cio' che arriva dal modello, dict o JSON grezzo. Mai fidato: sempre validato."""
    if isinstance(data, TavoloProposal):
        return data
    try:
        if isinstance(data, str):
            return TavoloProposal.model_validate_json(data)
        return TavoloProposal.model_validate(data)
    except ValidationError as exc:
        raise TavoloError(str(exc)) from exc


def propose(graph: TavoloGraph, proposal: TavoloProposal) -> TavoloGraph:
    """Le mosse del modello entrano in sospeso e non toccano cio' che c'e'.

    Un id gia' presente non viene riscritto: il modello propone, e proporre di
    rinominare un nodo della persona senza chiederlo sarebbe scriverlo.
    """
    known = {node.id for node in graph.nodes}
    known_edges = {edge.key for edge in graph.edges}
    nodes = list(graph.nodes)
    edges = list(graph.edges)
    for node in proposal.add_nodes:
        if node.id in known:
            continue
        # L'accento e' della persona: il modello propone pezzi, non enfasi.
        nodes.append(node.model_copy(update={"by": "model", "state": "pending", "accent": False}))
        known.add(node.id)
    for edge in proposal.add_edges:
        if edge.key in known_edges:
            continue
        edges.append(edge.model_copy(update={"by": "model", "state": "pending"}))
        known_edges.add(edge.key)
    return _validated(TavoloGraph(title=graph.title, nodes=nodes, edges=edges))


def _settle(graph: TavoloGraph, ids: list[str], state: str) -> TavoloGraph:
    wanted = set(ids)
    if state == "live":
        alive = {node.id for node in graph.nodes if node.state == "live" or node.id in wanted}
        for edge in graph.edges:
            if edge.key not in wanted:
                continue
            orphan = {edge.source, edge.target} - alive
            if orphan:
                raise TavoloError(
                    f"il legame {edge.key} non regge senza {', '.join(sorted(orphan))}")
    nodes = [
        node.model_copy(update={"state": state}) if node.id in wanted and node.state == "pending"
        else node
        for node in graph.nodes
    ]
    edges = [
        edge.model_copy(update={"state": state}) if edge.key in wanted and edge.state == "pending"
        else edge
        for edge in graph.edges
    ]
    return TavoloGraph(title=graph.title, nodes=nodes, edges=edges)


def accept(graph: TavoloGraph, ids: list[str]) -> TavoloGraph:
    """Una proposta accettata diventa contenuto del tavolo, e resta del modello."""
    return _settle(graph, ids, "live")


def reject(graph: TavoloGraph, ids: list[str]) -> TavoloGraph:
    """Scartata, non cancellata: lo storico deve poter mostrare cosa fu offerto."""
    return _settle(graph, ids, "dropped")


def live(graph: TavoloGraph) -> TavoloGraph:
    """Il tavolo come contenuto: senza le proposte in sospeso e senza gli scarti."""
    nodes = [node for node in graph.nodes if node.state == "live"]
    alive = {node.id for node in nodes}
    edges = [
        edge for edge in graph.edges
        if edge.state == "live" and edge.source in alive and edge.target in alive
    ]
    return TavoloGraph(title=graph.title, nodes=nodes, edges=edges)


def from_idea_map(spec: dict) -> TavoloGraph:
    """La mappa di Idea diventa un tavolo senza passare da un modello.

    Ruoli e tipi di arco sono gia' un vocabolario: tradurli e' una tabella, e
    chiedere a un modello di rifare un lavoro gia' fatto ne perderebbe pezzi.
    Tutto quello che c'e' e' della persona: e' uscito dalla sua conversazione.
    """
    nodes = [
        TavoloNode(
            id=node["id"],
            label=node["label"],
            form=node.get("form") or FORM_FROM_ROLE.get(node.get("role") or "", DEFAULT_FORM),
            icon=node.get("icon"),
        )
        for node in spec.get("nodes", [])
    ]
    edges = [
        TavoloEdge.model_validate({
            "from": edge.get("from") or edge.get("source"),
            "to": edge.get("to") or edge.get("target"),
            "rel": REL_FROM_EDGE_KIND.get(edge.get("kind") or "link", "part-of"),
            "label": edge.get("label"),
        })
        for edge in spec.get("edges", [])
    ]
    return _validated(TavoloGraph(title=spec.get("title", ""), nodes=nodes, edges=edges))


def rendition(graph: TavoloGraph, lang: str = "it") -> str:
    """Il tavolo a parole: screen reader, TTS, ricerca nel PDF, Telegram.

    Passa da `live`: dire a voce una proposta che nessuno ha ancora accettato la
    farebbe passare per contenuto del tavolo.
    """
    code = (lang or "it").lower()[:2]
    words = REL_WORDS.get(code, REL_WORDS["en"])
    weights = STRENGTH_WORD.get(code, STRENGTH_WORD["en"])
    doubt = DOUBT_WORD.get(code, DOUBT_WORD["en"])
    content = live(graph)
    by_id = {node.id: node.label for node in content.nodes}

    relations = []
    for edge in content.edges:
        verb = edge.label.strip() if edge.label and edge.label.strip() else words[edge.rel]
        marks = [mark for mark in (weights.get(edge.strength), doubt if edge.hypothesis else None) if mark]
        tail = f" ({', '.join(marks)})" if marks else ""
        relations.append(f"{by_id[edge.source]} {verb} {by_id[edge.target]}{tail}")

    touched = {end for edge in content.edges for end in (edge.source, edge.target)}
    alone = [node.label for node in content.nodes if node.id not in touched]
    accented = next((node.label for node in content.nodes if node.accent), None)
    parts = ["; ".join(relations)] if relations else []
    if accented:
        parts.append(f"{ACCENT_WORD.get(code, ACCENT_WORD['en'])}: {accented}")
    if alone:
        parts.append(f"{ISOLATED_WORD.get(code, ISOLATED_WORD['en'])}: {', '.join(alone)}")
    body = ". ".join(part for part in parts if part)
    return f"{content.title}: {body}." if body else f"{content.title}."
