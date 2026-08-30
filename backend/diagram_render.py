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
        "title": "#0f172a",
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
        "title": "#f1f5f9",
        "raster_bg": "#1e293b",
    },
}

FONT_FAMILY = "Inter,DejaVu Sans,sans-serif"

# Connettore usato dalla descrizione testuale (screen reader, TTS, PDF).
CONNECTORS = {
    "it": "porta a",
    "en": "leads to",
    "es": "lleva a",
    "fr": "mene a",
    "de": "fuhrt zu",
    "sv": "leder till",
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


def _wrap(label: str) -> str:
    """Manda a capo le etichette lunghe: nodi alti e stretti, non righe infinite."""
    words = label.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) > WRAP_AT and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return "\\n".join(_escape(line) for line in lines)


def to_dot(spec: DiagramSpec, *, theme: str = "light", embed_title: bool = False,
           raster: bool = False) -> str:
    """Traduce lo spec in sorgente DOT gia' tematizzato."""
    colors = PALETTE.get(theme, PALETTE["light"])
    background = colors["raster_bg"] if raster else "transparent"

    graph_attrs = [
        f'bgcolor="{background}"',
        f'fontname="{FONT_FAMILY}"',
        'pad="0.35"',
        'nodesep="0.45"',
        'ranksep="0.55"',
        'splines="spline"',
    ]
    if spec.type == "relation":
        graph_attrs.append('overlap="false"')
    if spec.type == "hierarchy":
        graph_attrs.append('rankdir="TB"')
    if embed_title:
        graph_attrs += [
            f'label="{_escape(spec.title)}"',
            'labelloc="t"',
            'fontsize="14"',
            f'fontcolor="{colors["title"]}"',
        ]

    lines = [
        "digraph diagram {",
        f"  graph [{', '.join(graph_attrs)}];",
        (
            "  node [shape=box, style=\"rounded,filled\", "
            f'fontname="{FONT_FAMILY}", fontsize="11", margin="0.20,0.14", penwidth="1.2", '
            f'fillcolor="{colors["node_fill"]}", color="{colors["node_stroke"]}", '
            f'fontcolor="{colors["node_text"]}"];'
        ),
        (
            f'  edge [color="{colors["edge"]}", fontcolor="{colors["edge"]}", '
            f'fontname="{FONT_FAMILY}", fontsize="9", arrowsize="0.7", penwidth="1.1"];'
        ),
    ]

    for node in spec.nodes:
        attrs = [f'label="{_wrap(node.label)}"']
        if node.accent:
            attrs += [
                f'fillcolor="{colors["accent_fill"]}"',
                f'color="{colors["accent_stroke"]}"',
                f'fontcolor="{colors["accent_text"]}"',
            ]
        lines.append(f'  "{_escape(node.id)}" [{", ".join(attrs)}];')

    for edge in spec.edges:
        attrs = f' [label="{_escape(edge.label)}"]' if edge.label else ""
        lines.append(f'  "{_escape(edge.source)}" -> "{_escape(edge.target)}"{attrs};')

    lines.append("}")
    return "\n".join(lines)


def describe(spec: DiagramSpec, lang: str = "it") -> str:
    """Descrizione a parole dello stesso contenuto: accessibilita', TTS, PDF."""
    connector = CONNECTORS.get((lang or "it").lower()[:2], CONNECTORS["en"])
    by_id = {node.id: node.label for node in spec.nodes}
    relations = []
    for edge in spec.edges:
        verb = edge.label.strip() if edge.label and edge.label.strip() else connector
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
    dot_source = to_dot(spec, theme=theme, embed_title=embed_title, raster=(fmt == "png"))
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
