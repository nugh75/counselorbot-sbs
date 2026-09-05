"""Diagrammi concettuali: spec dichiarativo -> DOT -> SVG/PNG.

Il modello produce solo dati (nodi e archi); l'aspetto grafico vive tutto qui,
cosi' web, Telegram e PDF mostrano lo stesso disegno con i colori dell'app.
Uno spec fuori contratto non e' un errore di chat: il chiamante lo scarta e
lascia il testo.
"""
from __future__ import annotations

import hashlib
import logging
import re
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, ValidationInfo, field_validator, model_validator

from .diagram_icon_catalog import DIAGRAM_ICONS
from .diagram_symbols import INSTRUMENTS, factor_id, resolve_symbol

logger = logging.getLogger(__name__)

DIAGRAM_TYPES = ("flow", "relation", "cycle", "hierarchy", "mindmap")

MAX_NODES = 8
MAX_EDGES = 12
# La mappa dello strumento Idea cresce a ogni turno della sessione: il tetto
# del diagramma-illustrazione, che accompagna una singola spiegazione, non le
# basta. Il limite resta per tipo, non globale.
TYPE_LIMITS = {"mindmap": (32, 44)}
MAX_NODES_ANY = max(MAX_NODES, *(nodes for nodes, _ in TYPE_LIMITS.values()))
MAX_EDGES_ANY = max(MAX_EDGES, *(edges for _, edges in TYPE_LIMITS.values()))
MAX_LABEL = 80
MAX_EDGE_LABEL = 40
MAX_TITLE = 80
# La nota e' una frase, non un paragrafo: dice cosa mostra il disegno a chi lo
# guarda senza la conversazione attorno.
MAX_NOTE = 200

RENDER_TIMEOUT_S = 5
# Larghezza di riga per mandare a capo le etichette lunghe dentro il nodo.
WRAP_AT = 18

# Vocabolario chiuso: il modello sceglie il significato, il renderer conserva
# il controllo sui file letti e sull'aspetto. Gli SVG sono la fonte; le copie
# PNG servono soltanto a Graphviz per Telegram/PDF.
ICON_DIR = Path(__file__).with_name("diagram_icons")
# Il simbolo non decora il nodo: e' il nodo. Dove c'e', la figura sparisce e
# restano l'icona grande e le sue parole sotto, come nei diagrammi concettuali.
# Un'icona che ripete l'etichetta accanto a una figura non fa niente; una che
# prende il posto della figura dice a colpo d'occhio di che cosa si parla.
SYMBOL_PX = 44
# Nella mappa di Idea la figura non e' disponibile: il riempimento porta la
# messa a fuoco, il bordo tratteggiato il difetto, il doppio bordo la chiusura.
# Li' l'icona resta dentro il nodo, dove era.
SYMBOL_TYPES = ("flow", "relation", "cycle", "hierarchy")

# Che genere di cosa e' il nodo. Il modello dichiara il senso, non la geometria:
# la forma la sceglie il renderer, come per i colori. Quattro, dallo standard
# dei diagrammi di flusso, perche' si distinguano a colpo d'occhio: cio' che
# resta fuori (un ostacolo, una domanda) lo dicono gia' l'icona e il tratto.
NODE_FORMS = {
    "concept": {"shape": "box", "rounded": True},
    "action": {"shape": "box", "rounded": False},
    "decision": {"shape": "diamond", "rounded": False},
    "outcome": {"shape": "ellipse", "rounded": False},
}
DEFAULT_FORM = "concept"
# Il rombo e l'ellisse crescono in tutte e due le direzioni: una riga lunga li
# gonfia molto piu' di un rettangolo, percio' vanno a capo prima.
NARROW_FORMS = {"decision", "outcome"}
NARROW_WRAP_AT = 13

# Ruolo argomentativo del nodo: dice che lavoro fa dentro il ragionamento, non
# solo cosa contiene. Serve alla mappa di Idea, dove un nodo di testo libero
# non direbbe niente. Il ruolo sceglie l'icona quando il modello non ne indica
# una. Vocabolario in inglese come il resto del contratto verso il modello.
NODE_ROLES = {
    "idea": "idea",
    "assumption": "brain",
    "evidence": "check",
    "alternative": "compass",
    "implication": "target",
    "open-question": "question",
    "constraint": "shield",
    "step": "clock",
    # Un task e' un pezzo di lavoro che si apre e si chiude: il libro sta per il
    # corpo di lavoro, non per la lettura.
    "task": "book",
    # La decisione e' l'unico nodo che non riguarda cio' che sai ma cio' a cui
    # tieni: e' l'unica icona dei dieci che non parla di conoscenza.
    "decision": "heart",
}

# Il ruolo argomentativo dice gia' che genere di cosa e' il nodo: chi lo
# dichiara non deve anche scegliere la forma. Cio' che non compare qui e' un
# concetto, cioe' la forma di serie.
FORM_FROM_ROLE = {
    "decision": "decision",
    "step": "action",
    "implication": "outcome",
}

# Quanto quel pezzo e' a fuoco, dal vocabolario di wayfinder ridotto a quattro
# gradini. Non e' un giudizio sul contenuto: dice a che punto e' la messa a
# fuoco, e si vede come intensita' del riempimento.
NODE_STATUSES = ("mentioned", "defined", "delimited", "related")
# Frazione della tinta piena per ogni gradino: un nodo appena nominato e'
# pallido, uno messo in relazione e' pieno.
STATUS_INTENSITY = {"mentioned": 0.28, "defined": 0.52, "delimited": 0.76, "related": 1.0}

# Cosa non regge. `orphaned` e `unsupported` li calcola il server dalla forma
# del grafo; gli altri tre richiedono di leggere il senso e li marca il modello.
NODE_FLAWS = ("orphaned", "unsupported", "duplicate", "overloaded", "premature")

# I task hanno un tipo, che decide i loro ruoli obbligatori e il loro
# obiettivo. Lo porta anche il nodo idea, che e' la radice dell'albero.
TASK_TYPES = (
    "thesis-chapter", "article", "position",
    "research-question", "systematic-review",
    "empirical-study", "teaching-unit", "intervention",
    "study-path", "personal-project", "concept-exploration",
)

# Il ruolo letto a voce: la descrizione testuale deve dire perche' un nodo sta
# nella mappa, non solo che c'e'.
ROLE_WORDS = {
    "it": {"idea": "idea", "assumption": "assunto", "evidence": "evidenza",
           "alternative": "alternativa", "implication": "implicazione",
           "open-question": "domanda aperta", "constraint": "vincolo", "step": "passo",
           "task": "lavoro", "decision": "decisione"},
    "en": {"idea": "idea", "assumption": "assumption", "evidence": "evidence",
           "alternative": "alternative", "implication": "implication",
           "open-question": "open question", "constraint": "constraint", "step": "step",
           "task": "task", "decision": "decision"},
    "es": {"idea": "idea", "assumption": "supuesto", "evidence": "evidencia",
           "alternative": "alternativa", "implication": "implicacion",
           "open-question": "pregunta abierta", "constraint": "limite", "step": "paso",
           "task": "trabajo", "decision": "decision"},
    "fr": {"idea": "idee", "assumption": "presuppose", "evidence": "preuve",
           "alternative": "alternative", "implication": "implication",
           "open-question": "question ouverte", "constraint": "contrainte", "step": "etape",
           "task": "travail", "decision": "decision"},
    "de": {"idea": "Idee", "assumption": "Annahme", "evidence": "Beleg",
           "alternative": "Alternative", "implication": "Folge",
           "open-question": "offene Frage", "constraint": "Grenze", "step": "Schritt",
           "task": "Arbeit", "decision": "Entscheidung"},
    "sv": {"idea": "ide", "assumption": "antagande", "evidence": "belagg",
           "alternative": "alternativ", "implication": "foljd",
           "open-question": "oppen fraga", "constraint": "begransning", "step": "steg",
           "task": "arbete", "decision": "beslut"},
}

# Palette derivata dai token del reskin (frontend/src/app/globals.css):
# petrol per la struttura, ocra per l'unico nodo accentato.
PALETTE = {
    "light": {
        "node_fill": "#e9f2f2",
        "node_stroke": "#69abad",
        "node_text": "#0e3539",
        "accent_fill": "#faf1e3",
        "accent_stroke": "#dca055",
        "accent_text": "#5a3211",
        "edge": "#64748b",
        "edge_strong": "#41707a",
        "icon": "#17747a",
        "title": "#0f172a",
        "surface": "#ffffff",
        "raster_bg": "#ffffff",
        "flaw": "#b45309",
    },
    "dark": {
        "node_fill": "#103f42",
        "node_stroke": "#3c8d90",
        "node_text": "#c8e0e1",
        "accent_fill": "#6f3c13",
        "accent_stroke": "#dca055",
        "accent_text": "#f3dcbe",
        "edge": "#94a3b8",
        "edge_strong": "#7fb3b6",
        "icon": "#9acbcd",
        "title": "#f1f5f9",
        "surface": "#1e293b",
        "raster_bg": "#1e293b",
        "flaw": "#f0b060",
    },
}

FONT_FAMILY = "Inter,DejaVu Sans,sans-serif"

# Tipi di arco: ogni tratto dice una cosa sola.
#   drives      linea piena, freccia          A produce B
#   strengthens linea piena spessa            A rafforza B (piu' spesso = piu' forte)
#   weakens     tratteggio, punta a T         A ostacola B
#   feedback    tratteggio fine, freccia      B ritorna su A e chiude l'anello
#   link        punteggiato, senza freccia    legame senza direzione
#   unclear     puntinato pallido, senza freccia   il legame c'e' ma non e' detto
EDGE_KINDS = ("drives", "strengthens", "weakens", "feedback", "link", "unclear")

# Glifi della legenda incorporata nel PNG (Telegram, PDF): stesso ordine di
# EDGE_KINDS, disegnati con i caratteri disponibili in DejaVu Sans.
EDGE_GLYPH = {
    "drives": "\u2500\u2500\u25b8",
    "strengthens": "\u2501\u2501\u25b8",
    "weakens": "\u254c\u254c\u22a3",
    "feedback": "\u2504\u2504\u25b8",
    "link": "\u2508\u2508",
    "unclear": "\u2508?\u2508",
}

EDGE_STYLE = {
    "drives": {"penwidth": "1.5"},
    "strengthens": {"penwidth": "2.6", "color_key": "edge_strong"},
    "weakens": {"penwidth": "1.5", "style": "dashed", "arrowhead": "tee"},
    "feedback": {"penwidth": "1.2", "style": "dashed", "arrowhead": "vee", "constraint": "false"},
    "link": {"penwidth": "1.3", "style": "dotted", "dir": "none"},
    "unclear": {"penwidth": "1.0", "style": "dotted", "dir": "none", "color_key": "flaw"},
}

# Connettori della descrizione testuale (screen reader, TTS, PDF): un verbo per
# tipo di arco, cosi' chi non vede il tratteggio legge comunque il significato.
CONNECTORS = {
    "it": {"drives": "porta a", "strengthens": "rafforza", "weakens": "ostacola",
           "feedback": "torna su", "link": "e' legato a", "unclear": "ha un legame non detto con"},
    "en": {"drives": "leads to", "strengthens": "strengthens", "weakens": "hinders",
           "feedback": "feeds back into", "link": "is linked to", "unclear": "has an unstated link with"},
    "es": {"drives": "lleva a", "strengthens": "refuerza", "weakens": "dificulta",
           "feedback": "vuelve a", "link": "esta ligado a", "unclear": "tiene un vinculo no dicho con"},
    "fr": {"drives": "mene a", "strengthens": "renforce", "weakens": "entrave",
           "feedback": "revient sur", "link": "est lie a", "unclear": "a un lien non dit avec"},
    "de": {"drives": "fuhrt zu", "strengthens": "starkt", "weakens": "behindert",
           "feedback": "wirkt zuruck auf", "link": "ist verbunden mit", "unclear": "hat eine ungesagte Verbindung zu"},
    "sv": {"drives": "leder till", "strengthens": "starker", "weakens": "hindrar",
           "feedback": "aterverkar pa", "link": "hanger ihop med", "unclear": "har en osagd koppling till"},
}


# Il difetto letto a voce. Registro piano: `describe` serve a screen reader,
# TTS e PDF, dove la parola esatta di wayfinder ("unita' sovraccarica") direbbe
# meno di quella comune. Il registro accademico vive in `idea_lexicon`.
FLAW_WORDS = {
    "it": {"orphaned": "sta da solo", "unsupported": "non e' sostenuto",
           "duplicate": "ripete un altro nodo", "overloaded": "fa due cose insieme",
           "premature": "arriva troppo presto"},
    "en": {"orphaned": "stands alone", "unsupported": "is unsupported",
           "duplicate": "repeats another node", "overloaded": "does two things at once",
           "premature": "comes too early"},
    "es": {"orphaned": "esta solo", "unsupported": "no esta sostenido",
           "duplicate": "repite otro nodo", "overloaded": "hace dos cosas a la vez",
           "premature": "llega demasiado pronto"},
    "fr": {"orphaned": "reste seul", "unsupported": "n'est pas etaye",
           "duplicate": "repete un autre noeud", "overloaded": "fait deux choses a la fois",
           "premature": "arrive trop tot"},
    "de": {"orphaned": "steht allein", "unsupported": "ist nicht gestutzt",
           "duplicate": "wiederholt einen anderen Knoten", "overloaded": "tut zwei Dinge zugleich",
           "premature": "kommt zu fruh"},
    "sv": {"orphaned": "star ensam", "unsupported": "saknar stod",
           "duplicate": "upprepar en annan nod", "overloaded": "gor tva saker samtidigt",
           "premature": "kommer for tidigt"},
}

class DiagramSpecError(ValueError):
    """Spec non conforme al contratto dichiarato al modello."""


class DiagramNode(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1, max_length=40)
    label: str = Field(min_length=1, max_length=MAX_LABEL)
    accent: bool = False
    icon: str | None = Field(default=None, max_length=24)
    factor: str | None = Field(default=None, max_length=24)
    role: str | None = Field(default=None, max_length=24)
    form: str | None = Field(default=None, max_length=16)
    status: str | None = Field(default=None, max_length=16)
    flaw: str | None = Field(default=None, max_length=16)
    # Solo per i nodi `task` e per la radice `idea`: che genere di lavoro e',
    # se e' concluso e cosa ha stabilito.
    task_type: str | None = Field(default=None, max_length=24)
    closed: bool = False
    conclusion: str | None = Field(default=None, max_length=120)

    @field_validator("factor", mode="before")
    @classmethod
    def _known_factor_or_none(cls, value):
        return factor_id(value)

    @field_validator("icon", mode="before")
    @classmethod
    def _known_icon_or_none(cls, value):
        # Un nome inventato dal modello non deve far fallire tutto il disegno:
        # l'icona e' decorativa, nodi e relazioni restano la fonte di verita'.
        if not isinstance(value, str):
            return None
        cleaned = value.strip().lower()
        return cleaned if cleaned in DIAGRAM_ICONS else None

    @field_validator("role", mode="before")
    @classmethod
    def _known_role_or_none(cls, value):
        if not isinstance(value, str):
            return None
        cleaned = value.strip().lower()
        return cleaned if cleaned in NODE_ROLES else None

    @field_validator("form", mode="before")
    @classmethod
    def _known_form_or_none(cls, value):
        if not isinstance(value, str):
            return None
        cleaned = value.strip().lower()
        return cleaned if cleaned in NODE_FORMS else None

    @field_validator("status", mode="before")
    @classmethod
    def _known_status_or_none(cls, value):
        if not isinstance(value, str):
            return None
        cleaned = value.strip().lower()
        return cleaned if cleaned in NODE_STATUSES else None

    @field_validator("flaw", mode="before")
    @classmethod
    def _known_flaw_or_none(cls, value):
        if not isinstance(value, str):
            return None
        cleaned = value.strip().lower()
        return cleaned if cleaned in NODE_FLAWS else None

    @field_validator("task_type", mode="before")
    @classmethod
    def _known_task_or_none(cls, value):
        if not isinstance(value, str):
            return None
        cleaned = value.strip().lower()
        return cleaned if cleaned in TASK_TYPES else None

    @model_validator(mode="after")
    def _icon_from_role(self) -> "DiagramNode":
        # Il ruolo basta: chi lo dichiara non deve anche scegliere icona e
        # forma. Le scelte esplicite restano comunque l'ultima parola.
        if self.icon is None and self.role:
            self.icon = NODE_ROLES[self.role]
        if self.form is None and self.role:
            self.form = FORM_FROM_ROLE.get(self.role)
        return self


class DiagramEdge(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    source: str = Field(min_length=1, alias="from")
    target: str = Field(min_length=1, alias="to")
    label: str | None = Field(default=None, max_length=MAX_EDGE_LABEL)
    kind: Literal["drives", "strengthens", "weakens", "feedback", "link", "unclear"] = "drives"


class DiagramSpec(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type: Literal["flow", "relation", "cycle", "hierarchy", "mindmap"]
    title: str = Field(min_length=1, max_length=MAX_TITLE)
    nodes: list[DiagramNode] = Field(min_length=2, max_length=MAX_NODES_ANY)
    edges: list[DiagramEdge] = Field(min_length=1, max_length=MAX_EDGES_ANY)
    # Una frase sotto il disegno: cosa mostra, come si legge. Il disegno viaggia
    # anche fuori dalla chat (Telegram, PDF, schermo intero) e li' la prosa che
    # lo accompagnava non c'e' piu'.
    note: str | None = Field(default=None, max_length=MAX_NOTE)
    questionnaire_type: str | None = Field(default=None, max_length=16)

    @field_validator("questionnaire_type", mode="before")
    @classmethod
    def _known_questionnaire_or_none(cls, value):
        value = value.strip().upper() if isinstance(value, str) else ''
        return value if value in INSTRUMENTS else None

    @field_validator("note", mode="before")
    @classmethod
    def _note_or_none(cls, value):
        if not isinstance(value, str):
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("titolo vuoto")
        return cleaned

    @model_validator(mode="after")
    def _coherent(self, info: ValidationInfo) -> "DiagramSpec":
        if info.context and info.context.get('questionnaire_type'):
            instrument = info.context['questionnaire_type'].upper()
            self.questionnaire_type = instrument if instrument in INSTRUMENTS else None
        max_nodes, max_edges = TYPE_LIMITS.get(self.type, (MAX_NODES, MAX_EDGES))
        if len(self.nodes) > max_nodes:
            raise ValueError(f"troppi nodi per un diagramma {self.type}: massimo {max_nodes}")
        if len(self.edges) > max_edges:
            raise ValueError(f"troppi archi per un diagramma {self.type}: massimo {max_edges}")
        ids = [node.id for node in self.nodes]
        if len(set(ids)) != len(ids):
            raise ValueError("identificatori di nodo duplicati")
        known = set(ids)
        for edge in self.edges:
            if edge.source not in known or edge.target not in known:
                raise ValueError(f"arco verso un nodo inesistente: {edge.source} -> {edge.target}")
        if sum(1 for node in self.nodes if node.accent) > 1:
            raise ValueError("al massimo un nodo accentato")
        if self.type in SYMBOL_TYPES:
            for node in self.nodes:
                factor, icon, canonical = resolve_symbol(node.label, node.factor, self.questionnaire_type)
                if factor:
                    node.factor = factor
                if icon and (canonical or node.icon is None):
                    node.icon = icon
        return self


def parse_spec(raw: dict | str, *, questionnaire_type: str | None = None) -> DiagramSpec:
    """Valida uno spec (dict o JSON) e solleva `DiagramSpecError` se non regge."""
    try:
        if isinstance(raw, str):
            return DiagramSpec.model_validate_json(raw, context={'questionnaire_type': questionnaire_type})
        return DiagramSpec.model_validate(raw, context={'questionnaire_type': questionnaire_type})
    except ValidationError as exc:
        raise DiagramSpecError(str(exc)) from exc


def engine_for(diagram_type: str) -> str:
    """Motore graphviz per tipo: il ciclo in cerchio, la mappa mentale a raggiera."""
    if diagram_type == "cycle":
        return "circo"
    if diagram_type == "relation":
        return "neato"
    if diagram_type == "mindmap":
        return "twopi"
    return "dot"


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"')


def _lines_at(label: str, width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in label.split():
        candidate = f"{current} {word}".strip()
        if len(candidate) > width and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def _wrap(label: str, wrap_at: int = WRAP_AT) -> str:
    """Manda a capo le etichette lunghe e bilancia le righe.

    A parita' di numero di righe si sceglie la larghezza minore: niente riga
    lunga seguita da una parola sola, che nel nodo si legge male.
    """
    lines = _lines_at(label, wrap_at)
    for width in range(wrap_at - 1, wrap_at - 8, -1):
        shorter = _lines_at(label, width)
        if len(shorter) > len(lines):
            break
        lines = shorter
    return "\\n".join(_escape(line) for line in lines)


def _blend(colour: str, towards: str, ratio: float) -> str:
    """Miscela due colori esadecimali: ratio 1 = `colour` pieno, 0 = `towards`."""
    try:
        a = [int(colour[i:i + 2], 16) for i in (1, 3, 5)]
        b = [int(towards[i:i + 2], 16) for i in (1, 3, 5)]
    except (ValueError, IndexError):
        return colour
    mixed = [round(x * ratio + y * (1 - ratio)) for x, y in zip(a, b)]
    return "#" + "".join(f"{value:02x}" for value in mixed)


def _display_label(node: DiagramNode) -> str:
    """Etichetta come si legge nel disegno: un task chiuso porta la sua conclusione."""
    if node.closed and node.conclusion:
        return f"{node.label} \u2014 {node.conclusion}"
    return node.label


def _node_label(node: DiagramNode, form: str) -> str:
    """Etichetta del nodo: solo parole. L'icona sta fuori, in `xlabel`."""
    wrap_at = NARROW_WRAP_AT if form in NARROW_FORMS else WRAP_AT
    return f'"{_wrap(_display_label(node), wrap_at)}"'


def _icon_file(node: DiagramNode, theme: str) -> Path | None:
    if not node.icon:
        return None
    icon_path = ICON_DIR / f"{node.icon}-{theme}.png"
    if icon_path.is_file():
        return icon_path
    logger.warning("Icona diagramma non disponibile: %s", icon_path.name)
    return None


def _symbol_label(node: DiagramNode, colors: dict, theme: str) -> str | None:
    """Il nodo disegnato come simbolo: l'icona grande, le parole sotto.

    Niente figura, niente riempimento, niente bordo: il simbolo e' l'elemento
    del disegno, non un distintivo appeso a un riquadro. L'accento qui non puo'
    stare nel bordo, che non c'e': lo portano le parole, in ocra. Sul web anche
    il tracciato dell'icona, che il CSS ridipinge; nel PNG resta petrolio,
    perche' le icone raster hanno un colore per tema e non per nodo.
    """
    icon_path = _icon_file(node, theme)
    if icon_path is None:
        return None
    text_color = colors["accent_text"] if node.accent else colors["node_text"]
    words = "<BR/>".join(_xml_escape(line) for line in _lines_at(_display_label(node), WRAP_AT))
    # Il punto su cui si puo' agire deve farsi trovare anche senza bordo: le sue
    # parole stanno su una pastiglia ocra, che e' un fondo, non un contenitore.
    cell = (f'<TD BGCOLOR="{colors["accent_fill"]}" STYLE="ROUNDED" CELLPADDING="4">'
            if node.accent else "<TD>")
    return (
        '<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="0">'
        f'<TR><TD FIXEDSIZE="TRUE" WIDTH="{SYMBOL_PX}" HEIGHT="{SYMBOL_PX}">'
        f'<IMG SRC="{_xml_escape(str(icon_path))}" SCALE="TRUE"/>'
        '</TD></TR>'
        f'<TR>{cell}<FONT COLOR="{text_color}" POINT-SIZE="12">{words}</FONT></TD></TR>'
        '</TABLE>>'
    )


def _icon_inside_label(node: DiagramNode, colors: dict, theme: str) -> str | None:
    """Icona e testo dentro la figura: serve alla mappa di Idea, dove la figura
    porta gia' messa a fuoco, difetto e chiusura e non si puo' togliere."""
    icon_path = _icon_file(node, theme)
    if icon_path is None:
        return None
    text_color = colors["accent_text"] if node.accent else colors["node_text"]
    wrapped = "<BR/>".join(_xml_escape(line) for line in _lines_at(_display_label(node), WRAP_AT))
    return (
        '<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="0">'
        '<TR><TD FIXEDSIZE="TRUE" WIDTH="24" HEIGHT="24">'
        f'<IMG SRC="{_xml_escape(str(icon_path))}" SCALE="TRUE"/>'
        '</TD><TD WIDTH="8"></TD><TD ALIGN="LEFT">'
        f'<FONT COLOR="{text_color}">{wrapped}</FONT>'
        '</TD></TR></TABLE>>'
    )


def _edge_label_chip(text: str, colors: dict, font_size: str = "10") -> str:
    """Etichetta su pastiglia opaca: l'arco non taglia piu' le lettere."""
    return (
        '<<TABLE BORDER="0" CELLBORDER="0" CELLPADDING="3" CELLSPACING="0" '
        f'BGCOLOR="{colors["surface"]}" STYLE="ROUNDED">'
        f'<TR><TD><FONT COLOR="{colors["edge"]}" POINT-SIZE="{font_size}">'
        f"{'<BR/>'.join(_xml_escape(line) for line in _lines_at(text, 20))}"
        "</FONT></TD></TR></TABLE>>"
    )


def _title_block(spec: DiagramSpec, colors: dict, lang: str) -> str:
    """Titolo, legenda dei tratti e nota: cio' che rende il disegno autoportante.

    Serve alle immagini che viaggiano da sole (Telegram, PDF): nel web il titolo
    sta nell'intestazione della card, legenda e nota sotto il disegno. Qui la
    nota resta in cima perche' Graphviz ha una sola etichetta di grafo: sopra il
    disegno vale come attacco, in fondo non ci sarebbe posto per il titolo.
    """
    rows = [
        f'<TR><TD><FONT POINT-SIZE="15" COLOR="{colors["title"]}">'
        f"{_xml_escape(spec.title)}</FONT></TD></TR>"
    ]
    entries = legend_entries(spec, lang)
    if entries:
        legend = "&#160;&#160;&#160;".join(
            f"{EDGE_GLYPH[kind]} {_xml_escape(verb)}" for kind, verb in entries
        )
        rows.append(
            f'<TR><TD><FONT POINT-SIZE="9" COLOR="{colors["edge"]}">{legend}</FONT></TD></TR>'
        )
    if spec.note:
        note = "<BR/>".join(_xml_escape(line) for line in _lines_at(spec.note, 64))
        rows.append(
            f'<TR><TD><FONT POINT-SIZE="10" COLOR="{colors["edge"]}">{note}</FONT></TD></TR>'
        )
    return ('<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="2">'
            + "".join(rows) + "</TABLE>>")


def to_dot(spec: DiagramSpec, *, theme: str = "light", embed_title: bool = False,
           raster: bool = False, lang: str = "it") -> str:
    """Traduce lo spec in sorgente DOT gia' tematizzato."""
    resolved_theme = theme if theme in PALETTE else "light"
    colors = PALETTE[resolved_theme]
    background = colors["raster_bg"] if raster else "transparent"

    graph_attrs = [
        f'bgcolor="{background}"',
        f'fontname="{FONT_FAMILY}"',
        'pad="0.4"',
    ]
    if spec.type == "cycle":
        # circo: cerchio piu' largo e archi curvi, cosi' le etichette respirano.
        graph_attrs += ['mindist="1.5"', 'splines="curved"']
    elif spec.type == "relation":
        # neato: piu' distanza fra nodi (sep) e attorno agli archi (esep).
        graph_attrs += ['overlap="false"', 'sep="+22"', 'esep="+10"', 'splines="true"']
    elif spec.type == "mindmap":
        # twopi: anelli concentrici attorno alla radice. La radice e' il nodo
        # accentato, cioe' l'idea; senza accento vale il primo nodo, perche'
        # una mappa senza centro non e' una mappa mentale.
        root = next((node.id for node in spec.nodes if node.accent), spec.nodes[0].id)
        graph_attrs += [
            f'root="{_escape(root)}"',
            'overlap="false"',
            'ranksep="1.7 equally"',
            'sep="+20"',
            'splines="curved"',
        ]
    else:
        graph_attrs += ['rankdir="TB"', 'nodesep="0.5"', 'ranksep="0.75"', 'splines="spline"']

    if embed_title:
        graph_attrs += [f"label={_title_block(spec, colors, lang)}", 'labelloc="t"']

    edge_defaults = [
        f'color="{colors["edge"]}"',
        f'fontcolor="{colors["edge"]}"',
        f'fontname="{FONT_FAMILY}"',
        'fontsize="10"',
        'arrowsize="0.8"',
        'penwidth="1.5"',
    ]
    if spec.type == "relation":
        edge_defaults.append('len="1.9"')

    lines = [
        "digraph diagram {",
        f"  graph [{', '.join(graph_attrs)}];",
        (
            "  node [shape=box, style=\"rounded,filled\", "
            f'fontname="{FONT_FAMILY}", fontsize="12", margin="0.24,0.16", penwidth="1.2", '
            f'fillcolor="{colors["node_fill"]}", color="{colors["node_stroke"]}", '
            f'fontcolor="{colors["node_text"]}"];'
        ),
        f"  edge [{', '.join(edge_defaults)}];",
    ]

    for node in spec.nodes:
        symbol = (_symbol_label(node, colors, resolved_theme)
                  if spec.type in SYMBOL_TYPES else None)
        if symbol is not None:
            # Il simbolo e' il nodo: nessuna figura da riempire o bordare, e
            # nessun margine, o le parole si staccherebbero dall'icona.
            lines.append(
                f'  "{_escape(node.id)}" [shape=plaintext, style="", margin="0.05", '
                f"label={symbol}];"
            )
            continue

        form = node.form or DEFAULT_FORM
        geometry = NODE_FORMS[form]
        inside = _icon_inside_label(node, colors, resolved_theme)
        label = inside if inside is not None else _node_label(node, form)
        attrs = [f'label={label}', f'shape="{geometry["shape"]}"']
        fill = colors["accent_fill"] if node.accent else colors["node_fill"]
        stroke = colors["accent_stroke"] if node.accent else colors["node_stroke"]
        text_colour = colors["accent_text"] if node.accent else colors["node_text"]
        style = ["rounded", "filled"] if geometry["rounded"] else ["filled"]
        penwidth = "2.0" if node.accent else "1.2"

        # Lo status si vede come intensita': un nodo appena nominato e' pallido,
        # uno messo in relazione e' pieno. Non serve leggere per capire cosa e'
        # ancora fumoso.
        if node.status:
            ratio = STATUS_INTENSITY[node.status]
            fill = _blend(fill, colors["surface"], ratio)
            stroke = _blend(stroke, colors["surface"], max(ratio, 0.45))

        # Un difetto si vede prima di essere letto: bordo tratteggiato, colore
        # d'allerta. Il nome del difetto vive nella descrizione testuale.
        if node.flaw:
            style.append("dashed")
            stroke = colors["flaw"]

        # Un ramo concluso porta il doppio bordo: si distingue da uno pieno
        # senza rubare l'accento, che resta uno solo.
        if node.closed:
            attrs.append('peripheries="2"')

        attrs += [
            f'fillcolor="{fill}"',
            f'color="{stroke}"',
            f'fontcolor="{text_colour}"',
            f'style="{",".join(style)}"',
            f'penwidth="{penwidth}"',
        ]
        lines.append(f'  "{_escape(node.id)}" [{", ".join(attrs)}];')

    used_ids = {node.id for node in spec.nodes}
    for edge_index, edge in enumerate(spec.edges):
        attrs: list[str] = []
        style = EDGE_STYLE[edge.kind]
        for key, value in style.items():
            if key == "color_key":
                attrs.append(f'color="{colors[value]}"')
            else:
                attrs.append(f'{key}="{value}"')

        if edge.label and spec.type in ("relation", "cycle"):
            # Solo `dot` riserva spazio vero alle etichette degli archi; `neato`
            # e `circo` le posano sul punto medio del tracciato, dove finiscono
            # sopra la linea o addosso al riquadro di un nodo. Un piccolo nodo
            # intermedio riserva lo spazio e divide il tratto in due segmenti
            # che terminano ai bordi dell'etichetta.
            # Nel cerchio l'etichetta entra nell'anello: fra un concetto e il
            # successivo si legge il verbo che li lega, che e' l'ordine in cui
            # il ciclo si racconta.
            label_id = f"__diagram_edge_label_{edge_index}"
            while label_id in used_ids:
                label_id += "_"
            used_ids.add(label_id)
            lines.append(
                f'  "{label_id}" [shape=plain, style="", margin="0", width="0", '
                f'height="0", label={_edge_label_chip(edge.label, colors)}];'
            )
            first_attrs = [*attrs, 'dir="none"', 'len="1.35"', 'weight="3"']
            second_attrs = [*attrs, 'len="1.35"', 'weight="3"']
            lines.append(
                f'  "{_escape(edge.source)}" -> "{label_id}" [{", ".join(first_attrs)}];'
            )
            lines.append(
                f'  "{label_id}" -> "{_escape(edge.target)}" [{", ".join(second_attrs)}];'
            )
            continue

        if edge.label:
            attrs.insert(0, f"label={_edge_label_chip(edge.label, colors)}")
        rendered = f" [{', '.join(attrs)}]" if attrs else ""
        lines.append(f'  "{_escape(edge.source)}" -> "{_escape(edge.target)}"{rendered};')

    lines.append("}")
    return "\n".join(lines)


def legend_entries(spec: DiagramSpec, lang: str = "it") -> list[tuple[str, str]]:
    """Tipi di arco effettivamente usati, per la legenda della card e del PDF.

    Vuota quando il diagramma usa un solo tipo: nessun tratto da spiegare.
    """
    verbs = CONNECTORS.get((lang or "it").lower()[:2], CONNECTORS["en"])
    used = {edge.kind for edge in spec.edges}
    if len(used) < 2:
        return []
    return [(kind, verbs[kind]) for kind in EDGE_KINDS if kind in used]


def describe(spec: DiagramSpec, lang: str = "it") -> str:
    """Descrizione a parole dello stesso contenuto: accessibilita', TTS, PDF."""
    code = (lang or "it").lower()[:2]
    verbs = CONNECTORS.get(code, CONNECTORS["en"])
    roles = ROLE_WORDS.get(code, ROLE_WORDS["en"])
    # Il ruolo entra nella descrizione: chi ascolta deve sapere se un nodo e'
    # un assunto o un'evidenza, che il disegno dice con l'icona.
    flaws = FLAW_WORDS.get(code, FLAW_WORDS["en"])

    def _mention(node: DiagramNode) -> str:
        # Un difetto taciuto e' un difetto invisibile per chi ascolta invece di
        # guardare: entra nella descrizione, non solo nel tratteggio.
        marks = [roles[node.role]] if node.role else []
        if node.flaw:
            marks.append(flaws[node.flaw])
        return f"{node.label} ({', '.join(marks)})" if marks else node.label

    by_id = {node.id: _mention(node) for node in spec.nodes}
    relations = []
    for edge in spec.edges:
        verb = edge.label.strip() if edge.label and edge.label.strip() else verbs[edge.kind]
        relations.append(f"{by_id[edge.source]} {verb} {by_id[edge.target]}")
    spoken = f"{spec.title}: " + "; ".join(relations) + "."
    # La nota e' la frase che dice cosa mostra il disegno: chi ascolta invece di
    # guardare la deve sentire, o resta con l'elenco dei legami e nessun senso.
    return f"{spoken} {spec.note}" if spec.note else spoken


_SVG_TAG_RE = re.compile(r"<svg\b[^>]*>", re.IGNORECASE)
_SVG_SIZE_RE = re.compile(r'\s(?:width|height)="[^"]*"', re.IGNORECASE)
_SVG_IMAGE_RE = re.compile(r"<image\b[^>]*/>", re.IGNORECASE)
_SVG_ATTR_RE = re.compile(r'([\w:-]+)="([^"]*)"')
_ICON_FILE_RE = re.compile(r"^([a-z-]+)-(light|dark)\.png$")


@lru_cache(maxsize=32)
def _icon_svg_inner(name: str) -> str:
    source = (ICON_DIR / f"{name}.svg").read_text(encoding="utf-8")
    match = re.search(r"<svg\b[^>]*>(.*)</svg>\s*$", source, re.DOTALL | re.IGNORECASE)
    if not match:
        return ""
    return match.group(1)


def _inline_icon_image(tag: str, colors: dict) -> str:
    """Sostituisce il PNG tecnico di Graphviz con il vero SVG inline sul web."""
    attrs = dict(_SVG_ATTR_RE.findall(tag))
    href = attrs.get("xlink:href") or attrs.get("href") or ""
    match = _ICON_FILE_RE.match(Path(href).name)
    if not match or match.group(1) not in DIAGRAM_ICONS:
        return tag
    inner = _icon_svg_inner(match.group(1))
    if not inner:
        return tag
    geometry = " ".join(
        f'{key}="{attrs[key]}"' for key in ("x", "y", "width", "height") if key in attrs
    )
    return (
        f'<svg {geometry} viewBox="0 0 24 24" fill="none" '
        f'stroke="{colors["icon"]}" stroke-width="2" stroke-linecap="round" '
        f'stroke-linejoin="round" aria-hidden="true">{inner}</svg>'
    )


def _inline_ready(svg: str, spec: DiagramSpec, lang: str, theme: str) -> str:
    """Prologo XML via, dimensioni al CSS, titolo e descrizione per gli screen reader."""
    start = svg.find("<svg")
    if start > 0:
        svg = svg[start:]

    colors = PALETTE.get(theme, PALETTE["light"])
    svg = _SVG_IMAGE_RE.sub(lambda match: _inline_icon_image(match.group(0), colors), svg)

    match = _SVG_TAG_RE.search(svg)
    if not match:
        return svg
    tag = _SVG_SIZE_RE.sub("", match.group(0))
    if "role=" not in tag:
        tag = tag[:-1] + ' role="img">'
    accessible = (
        f"<title>{_xml_escape(spec.title)}</title>"
        f"<desc>{_xml_escape(describe(spec, lang))}</desc>"
    )
    return svg[:match.start()] + tag + accessible + svg[match.end():]


def _xml_escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def graphviz_available() -> bool:
    return shutil.which("dot") is not None


def render(spec: DiagramSpec, *, theme: str = "light", fmt: str = "svg",
           embed_title: bool = False, lang: str = "it") -> bytes:
    """Rende lo spec in SVG (web) o PNG (Telegram, PDF)."""
    if fmt not in {"svg", "png"}:
        raise DiagramSpecError(f"formato non supportato: {fmt}")
    payload = _render_cached(
        spec.model_dump_json(),
        theme if theme in PALETTE else "light",
        fmt,
        bool(embed_title),
        (lang or "it")[:2],
    )
    return payload


@lru_cache(maxsize=256)
def _render_cached(spec_json: str, theme: str, fmt: str, embed_title: bool, lang: str) -> bytes:
    spec = DiagramSpec.model_validate_json(spec_json)
    dot_source = to_dot(spec, theme=theme, embed_title=embed_title, raster=(fmt == "png"),
                        lang=lang)
    engine = engine_for(spec.type)
    if shutil.which(engine) is None:
        raise DiagramSpecError(f"motore graphviz non disponibile: {engine}")

    command = [engine, f"-T{fmt}"]
    if fmt == "png":
        command.append("-Gdpi=144")
    try:
        completed = subprocess.run(
            command,
            input=dot_source.encode("utf-8"),
            capture_output=True,
            timeout=RENDER_TIMEOUT_S,
            check=True,
        )
    except subprocess.TimeoutExpired as exc:
        raise DiagramSpecError("rendering del diagramma scaduto") from exc
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or b"").decode("utf-8", "replace").strip()
        raise DiagramSpecError(f"graphviz ha rifiutato il diagramma: {detail}") from exc

    if fmt == "svg":
        return _inline_ready(completed.stdout.decode("utf-8"), spec, lang, theme).encode("utf-8")
    return completed.stdout


def spec_fingerprint(spec: DiagramSpec) -> str:
    """Chiave stabile dello spec, per cache lato client ed ETag."""
    return hashlib.sha256(spec.model_dump_json().encode("utf-8")).hexdigest()[:16]
