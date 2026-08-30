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
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

logger = logging.getLogger(__name__)

DIAGRAM_TYPES = ("flow", "relation", "cycle", "hierarchy")

MAX_NODES = 8
MAX_EDGES = 12
MAX_LABEL = 40
MAX_EDGE_LABEL = 24
MAX_TITLE = 80

RENDER_TIMEOUT_S = 5
# Larghezza di riga per mandare a capo le etichette lunghe dentro il nodo.
WRAP_AT = 18

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
        "title": "#0f172a",
        "surface": "#ffffff",
        "raster_bg": "#ffffff",
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
        "title": "#f1f5f9",
        "surface": "#1e293b",
        "raster_bg": "#1e293b",
    },
}

FONT_FAMILY = "Inter,DejaVu Sans,sans-serif"

# Tipi di arco: ogni tratto dice una cosa sola.
#   drives      linea piena, freccia          A produce B
#   strengthens linea piena spessa            A rafforza B (piu' spesso = piu' forte)
#   weakens     tratteggio, punta a T         A ostacola B
#   feedback    tratteggio fine, freccia      B ritorna su A e chiude l'anello
#   link        punteggiato, senza freccia    legame senza direzione
EDGE_KINDS = ("drives", "strengthens", "weakens", "feedback", "link")

# Glifi della legenda incorporata nel PNG (Telegram, PDF): stesso ordine di
# EDGE_KINDS, disegnati con i caratteri disponibili in DejaVu Sans.
EDGE_GLYPH = {
    "drives": "\u2500\u2500\u25b8",
    "strengthens": "\u2501\u2501\u25b8",
    "weakens": "\u254c\u254c\u22a3",
    "feedback": "\u2504\u2504\u25b8",
    "link": "\u2508\u2508",
}

EDGE_STYLE = {
    "drives": {"penwidth": "1.5"},
    "strengthens": {"penwidth": "2.6", "color_key": "edge_strong"},
    "weakens": {"penwidth": "1.5", "style": "dashed", "arrowhead": "tee"},
    "feedback": {"penwidth": "1.2", "style": "dashed", "arrowhead": "vee", "constraint": "false"},
    "link": {"penwidth": "1.3", "style": "dotted", "dir": "none"},
}

# Connettori della descrizione testuale (screen reader, TTS, PDF): un verbo per
# tipo di arco, cosi' chi non vede il tratteggio legge comunque il significato.
CONNECTORS = {
    "it": {"drives": "porta a", "strengthens": "rafforza", "weakens": "ostacola",
           "feedback": "torna su", "link": "e' legato a"},
    "en": {"drives": "leads to", "strengthens": "strengthens", "weakens": "hinders",
           "feedback": "feeds back into", "link": "is linked to"},
    "es": {"drives": "lleva a", "strengthens": "refuerza", "weakens": "dificulta",
           "feedback": "vuelve a", "link": "esta ligado a"},
    "fr": {"drives": "mene a", "strengthens": "renforce", "weakens": "entrave",
           "feedback": "revient sur", "link": "est lie a"},
    "de": {"drives": "fuhrt zu", "strengthens": "starkt", "weakens": "behindert",
           "feedback": "wirkt zuruck auf", "link": "ist verbunden mit"},
    "sv": {"drives": "leder till", "strengthens": "starker", "weakens": "hindrar",
           "feedback": "aterverkar pa", "link": "hanger ihop med"},
}


class DiagramSpecError(ValueError):
    """Spec non conforme al contratto dichiarato al modello."""


class DiagramNode(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1, max_length=40)
    label: str = Field(min_length=1, max_length=MAX_LABEL)
    accent: bool = False


class DiagramEdge(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    source: str = Field(min_length=1, alias="from")
    target: str = Field(min_length=1, alias="to")
    label: str | None = Field(default=None, max_length=MAX_EDGE_LABEL)
    kind: Literal["drives", "strengthens", "weakens", "feedback", "link"] = "drives"


class DiagramSpec(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type: Literal["flow", "relation", "cycle", "hierarchy"]
    title: str = Field(min_length=1, max_length=MAX_TITLE)
    nodes: list[DiagramNode] = Field(min_length=2, max_length=MAX_NODES)
    edges: list[DiagramEdge] = Field(min_length=1, max_length=MAX_EDGES)

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("titolo vuoto")
        return cleaned

    @model_validator(mode="after")
    def _coherent(self) -> "DiagramSpec":
        ids = [node.id for node in self.nodes]
        if len(set(ids)) != len(ids):
            raise ValueError("identificatori di nodo duplicati")
        known = set(ids)
        for edge in self.edges:
            if edge.source not in known or edge.target not in known:
                raise ValueError(f"arco verso un nodo inesistente: {edge.source} -> {edge.target}")
        if sum(1 for node in self.nodes if node.accent) > 1:
            raise ValueError("al massimo un nodo accentato")
        return self


def parse_spec(raw: dict | str) -> DiagramSpec:
    """Valida uno spec (dict o JSON) e solleva `DiagramSpecError` se non regge."""
    try:
        if isinstance(raw, str):
            return DiagramSpec.model_validate_json(raw)
        return DiagramSpec.model_validate(raw)
    except ValidationError as exc:
        raise DiagramSpecError(str(exc)) from exc


def engine_for(diagram_type: str) -> str:
    """Motore graphviz per tipo: il ciclo va in cerchio, la mappa a molle."""
    if diagram_type == "cycle":
        return "circo"
    if diagram_type == "relation":
        return "neato"
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


def _wrap(label: str) -> str:
    """Manda a capo le etichette lunghe e bilancia le righe.

    A parita' di numero di righe si sceglie la larghezza minore: niente riga
    lunga seguita da una parola sola, che nel nodo si legge male.
    """
    lines = _lines_at(label, WRAP_AT)
    for width in range(WRAP_AT - 1, WRAP_AT - 8, -1):
        shorter = _lines_at(label, width)
        if len(shorter) > len(lines):
            break
        lines = shorter
    return "\\n".join(_escape(line) for line in lines)


def _edge_label_chip(text: str, colors: dict, font_size: str = "10") -> str:
    """Etichetta su pastiglia opaca: l'arco non taglia piu' le lettere."""
    return (
        '<<TABLE BORDER="0" CELLBORDER="0" CELLPADDING="3" CELLSPACING="0" '
        f'BGCOLOR="{colors["surface"]}" STYLE="ROUNDED">'
        f'<TR><TD><FONT COLOR="{colors["edge"]}" POINT-SIZE="{font_size}">'
        f"{_xml_escape(text)}</FONT></TD></TR></TABLE>>"
    )


def _title_block(spec: DiagramSpec, colors: dict, lang: str) -> str:
    """Titolo del disegno e, se i tratti sono piu' d'uno, la legenda che li spiega.

    Serve alle immagini che viaggiano da sole (Telegram, PDF): nel web il titolo
    sta nell'intestazione della card e la legenda sotto il disegno.
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
    return ('<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="2">'
            + "".join(rows) + "</TABLE>>")


def to_dot(spec: DiagramSpec, *, theme: str = "light", embed_title: bool = False,
           raster: bool = False, lang: str = "it") -> str:
    """Traduce lo spec in sorgente DOT gia' tematizzato."""
    colors = PALETTE.get(theme, PALETTE["light"])
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
        attrs = [f'label="{_wrap(node.label)}"']
        if node.accent:
            # Bordo piu' spesso: il nodo su cui si puo' agire si vede per primo.
            attrs += [
                f'fillcolor="{colors["accent_fill"]}"',
                f'color="{colors["accent_stroke"]}"',
                f'fontcolor="{colors["accent_text"]}"',
                'penwidth="2.0"',
            ]
        lines.append(f'  "{_escape(node.id)}" [{", ".join(attrs)}];')

    for edge in spec.edges:
        attrs: list[str] = []
        if edge.label:
            attrs.append(f"label={_edge_label_chip(edge.label, colors)}")
        style = EDGE_STYLE[edge.kind]
        for key, value in style.items():
            if key == "color_key":
                attrs.append(f'color="{colors[value]}"')
            else:
                attrs.append(f'{key}="{value}"')
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
    verbs = CONNECTORS.get((lang or "it").lower()[:2], CONNECTORS["en"])
    by_id = {node.id: node.label for node in spec.nodes}
    relations = []
    for edge in spec.edges:
        verb = edge.label.strip() if edge.label and edge.label.strip() else verbs[edge.kind]
        relations.append(f"{by_id[edge.source]} {verb} {by_id[edge.target]}")
    return f"{spec.title}: " + "; ".join(relations) + "."


_SVG_TAG_RE = re.compile(r"<svg\b[^>]*>", re.IGNORECASE)
_SVG_SIZE_RE = re.compile(r'\s(?:width|height)="[^"]*"', re.IGNORECASE)


def _inline_ready(svg: str, spec: DiagramSpec, lang: str) -> str:
    """Prologo XML via, dimensioni al CSS, titolo e descrizione per gli screen reader."""
    start = svg.find("<svg")
    if start > 0:
        svg = svg[start:]

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
        return _inline_ready(completed.stdout.decode("utf-8"), spec, lang).encode("utf-8")
    return completed.stdout


def spec_fingerprint(spec: DiagramSpec) -> str:
    """Chiave stabile dello spec, per cache lato client ed ETag."""
    return hashlib.sha256(spec.model_dump_json().encode("utf-8")).hexdigest()[:16]
