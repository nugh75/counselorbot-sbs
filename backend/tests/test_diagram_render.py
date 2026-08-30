"""Test dello spec di diagramma e della sua traduzione in DOT.

Il rendering vero (binario `dot`) e' verificato solo dove graphviz e' presente:
in locale il binario puo' mancare, nel container backend c'e' sempre.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_diagram_render
"""
import shutil

import pytest

from backend.diagram_render import (
    DiagramSpecError,
    describe,
    legend_entries,
    parse_spec,
    render,
    to_dot,
)

CYCLE = {
    "type": "cycle",
    "title": "Circolo dell'evitamento",
    "nodes": [
        {"id": "a", "label": "Compito difficile"},
        {"id": "b", "label": "Ansia", "accent": True},
        {"id": "c", "label": "Rimando"},
    ],
    "edges": [
        {"from": "a", "to": "b", "label": "innesca"},
        {"from": "b", "to": "c"},
        {"from": "c", "to": "a"},
    ],
}

HAS_DOT = shutil.which("dot") is not None


def test_parse_accepts_json_string():
    spec = parse_spec('{"type":"flow","title":"T","nodes":[{"id":"a","label":"A"},'
                      '{"id":"b","label":"B"}],"edges":[{"from":"a","to":"b"}]}')
    assert spec.type == "flow"
    assert [n.id for n in spec.nodes] == ["a", "b"]


def test_parse_rejects_unknown_type():
    with pytest.raises(DiagramSpecError):
        parse_spec({**CYCLE, "type": "gantt"})


def test_parse_rejects_too_few_nodes():
    with pytest.raises(DiagramSpecError):
        parse_spec({**CYCLE, "nodes": [{"id": "a", "label": "A"}], "edges": []})


def test_parse_rejects_too_many_nodes():
    nodes = [{"id": f"n{i}", "label": f"N{i}"} for i in range(9)]
    with pytest.raises(DiagramSpecError):
        parse_spec({**CYCLE, "nodes": nodes})


def test_parse_rejects_long_label():
    with pytest.raises(DiagramSpecError):
        parse_spec({**CYCLE, "nodes": [
            {"id": "a", "label": "x" * 81},
            {"id": "b", "label": "B"},
        ], "edges": [{"from": "a", "to": "b"}]})


def test_parse_accepts_real_profile_label_over_old_limit():
    label = "Percezione di competenza (A6 (Percezione di competenza))"
    spec = parse_spec({**CYCLE, "nodes": [
        {"id": "a", "label": "Sedia interna: sforzo, strategia", "icon": "brain"},
        {"id": "b", "label": label, "icon": "shield"},
    ], "edges": [{"from": "a", "to": "b", "kind": "strengthens"}]})
    assert spec.nodes[1].label == label
    assert spec.nodes[1].icon == "shield"


def test_unknown_icon_is_ignored_without_losing_the_diagram():
    spec = parse_spec({**CYCLE, "nodes": [
        {"id": "a", "label": "A", "icon": "invented-by-model"},
        {"id": "b", "label": "B"},
    ], "edges": [{"from": "a", "to": "b"}]})
    assert spec.nodes[0].icon is None


def test_parse_rejects_edge_to_unknown_node():
    with pytest.raises(DiagramSpecError):
        parse_spec({**CYCLE, "edges": [{"from": "a", "to": "zz"}]})


def test_parse_rejects_more_than_one_accent():
    nodes = [
        {"id": "a", "label": "A", "accent": True},
        {"id": "b", "label": "B", "accent": True},
    ]
    with pytest.raises(DiagramSpecError):
        parse_spec({**CYCLE, "nodes": nodes, "edges": [{"from": "a", "to": "b"}]})


def test_parse_rejects_missing_title():
    with pytest.raises(DiagramSpecError):
        parse_spec({**CYCLE, "title": "   "})


def test_dot_uses_light_palette_by_default():
    dot = to_dot(parse_spec(CYCLE))
    assert "#e9f2f2" in dot          # fill dei nodi
    assert "#69abad" in dot          # bordo dei nodi
    assert "#faf1e3" in dot          # nodo accento (ocra)
    assert "#64748b" in dot          # archi
    assert "#103f42" not in dot      # nessun colore del tema scuro


def test_dot_uses_dark_palette():
    dot = to_dot(parse_spec(CYCLE), theme="dark")
    assert "#103f42" in dot
    assert "#94a3b8" in dot
    assert "#e9f2f2" not in dot


def test_dot_escapes_quotes_in_labels():
    spec = parse_spec({**CYCLE, "nodes": [
        {"id": "a", "label": 'Dire "basta"'},
        {"id": "b", "label": "B"},
    ], "edges": [{"from": "a", "to": "b"}]})
    dot = to_dot(spec)
    assert r'\"basta\"' in dot


def test_dot_embeds_title_only_when_requested():
    spec = parse_spec(CYCLE)
    assert "Circolo dell'evitamento" not in to_dot(spec)
    assert "Circolo dell'evitamento" in to_dot(spec, embed_title=True)


def test_engine_depends_on_type():
    from backend.diagram_render import engine_for

    assert engine_for("flow") == "dot"
    assert engine_for("hierarchy") == "dot"
    assert engine_for("cycle") == "circo"
    assert engine_for("relation") == "neato"


def test_describe_lists_relations_in_words():
    text = describe(parse_spec(CYCLE), lang="it")
    assert "Circolo dell'evitamento" in text
    assert "innesca" in text
    assert "→" not in text          # leggibile da uno screen reader e dal TTS
    assert "Rimando" in text


def test_describe_falls_back_to_english_connector():
    text = describe(parse_spec(CYCLE), lang="xx")
    assert "leads to" in text


@pytest.mark.skipif(not HAS_DOT, reason="graphviz non installato")
def test_render_svg_is_inline_ready():
    svg = render(parse_spec(CYCLE), theme="light", fmt="svg").decode("utf-8")
    assert svg.startswith("<svg")
    assert "<?xml" not in svg and "DOCTYPE" not in svg
    assert 'role="img"' in svg
    assert "viewBox" in svg
    assert "width=" not in svg.split(">", 1)[0]   # dimensione lasciata al CSS
    assert "Circolo dell'evitamento" in svg       # <title> di accessibilita'


@pytest.mark.skipif(not HAS_DOT, reason="graphviz non installato")
def test_render_png_has_png_signature():
    png = render(parse_spec(CYCLE), theme="dark", fmt="png", embed_title=True)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"


@pytest.mark.skipif(not HAS_DOT, reason="graphviz non installato")
def test_render_rejects_unknown_format():
    with pytest.raises(DiagramSpecError):
        render(parse_spec(CYCLE), fmt="pdf")


MIXED = {
    "type": "relation",
    "title": "Cosa sostiene la concentrazione",
    "nodes": [
        {"id": "c", "label": "Concentrazione", "accent": True},
        {"id": "s", "label": "Sonno regolare"},
        {"id": "n", "label": "Ansia da prestazione"},
    ],
    "edges": [
        {"from": "s", "to": "c", "label": "sostiene", "kind": "strengthens"},
        {"from": "n", "to": "c", "kind": "weakens"},
    ],
}


def test_edge_kind_defaults_to_drives():
    spec = parse_spec(CYCLE)
    assert {edge.kind for edge in spec.edges} == {"drives"}


def test_parse_rejects_unknown_kind():
    with pytest.raises(DiagramSpecError):
        parse_spec({**CYCLE, "edges": [{"from": "a", "to": "b", "kind": "blocca"}]})


def test_dot_draws_weakening_edge_dashed_with_tee():
    dot = to_dot(parse_spec(MIXED))
    weakening = [line for line in dot.splitlines() if '"n" -> "c"' in line][0]
    assert 'style="dashed"' in weakening
    assert 'arrowhead="tee"' in weakening


def test_dot_draws_strengthening_edge_thicker():
    dot = to_dot(parse_spec(MIXED))
    strengthening = [
        line for line in dot.splitlines()
        if '"s" -> "__diagram_edge_label_0"' in line
        or '"__diagram_edge_label_0" -> "c"' in line
    ]
    assert len(strengthening) == 2
    assert all('penwidth="2.6"' in line for line in strengthening)
    assert all("#41707a" in line for line in strengthening)  # petrol piu' fondo


def test_edge_label_sits_on_an_opaque_chip():
    # La pastiglia col colore della superficie impedisce all'arco di tagliare il testo.
    dot = to_dot(parse_spec(MIXED))
    assert 'BGCOLOR="#ffffff"' in dot
    assert ">sostiene<" in dot


def test_relation_edge_label_reserves_a_real_gap_in_the_arc():
    dot = to_dot(parse_spec(MIXED))
    # Con neato una normale edge label puo' coprire il tratto. Un nodo-spaziatore
    # divide invece l'arco in due e rende geometricamente impossibile l'incrocio.
    assert '"__diagram_edge_label_0" [shape=plain' in dot
    assert '"s" -> "__diagram_edge_label_0"' in dot
    assert '"__diagram_edge_label_0" -> "c"' in dot
    assert '"s" -> "c" [label=' not in dot


def test_dot_uses_the_local_icon_asset():
    spec = parse_spec({**CYCLE, "nodes": [
        {"id": "a", "label": "Obiettivo", "icon": "target"},
        {"id": "b", "label": "Verifica", "icon": "check"},
    ], "edges": [{"from": "a", "to": "b"}]})
    dot = to_dot(spec, theme="dark")
    assert "target-dark.png" in dot
    assert "check-dark.png" in dot
    assert "<IMG SRC=" in dot


@pytest.mark.skipif(not HAS_DOT, reason="graphviz non installato")
def test_render_svg_inlines_the_vector_icon():
    spec = parse_spec({**CYCLE, "nodes": [
        {"id": "a", "label": "Obiettivo", "icon": "target"},
        {"id": "b", "label": "Verifica", "icon": "check"},
    ], "edges": [{"from": "a", "to": "b"}]})
    svg = render(spec, theme="light", fmt="svg").decode("utf-8")
    assert "diagram_icons" not in svg
    assert 'stroke="#17747a"' in svg
    assert svg.count("<svg") >= 3  # radice + le due icone inline


def test_legend_lists_only_the_kinds_in_use():
    assert legend_entries(parse_spec(MIXED), "it") == [
        ("strengthens", "rafforza"),
        ("weakens", "ostacola"),
    ]


def test_legend_is_empty_when_every_edge_is_the_same():
    assert legend_entries(parse_spec(CYCLE), "it") == []


def test_describe_uses_the_kind_when_the_edge_has_no_label():
    text = describe(parse_spec(MIXED), lang="it")
    assert "Ansia da prestazione ostacola Concentrazione" in text


def test_embedded_title_carries_the_legend():
    dot = to_dot(parse_spec(MIXED), embed_title=True, lang="it")
    assert "Cosa sostiene la concentrazione" in dot
    assert "rafforza" in dot and "ostacola" in dot
    assert to_dot(parse_spec(CYCLE), embed_title=True, lang="it").count("rafforza") == 0


if __name__ == "__main__":
    import sys

    failures = 0
    for name, fn in sorted(globals().items()):
        if not name.startswith("test_") or not callable(fn):
            continue
        if not HAS_DOT and name.startswith("test_render"):
            continue
        try:
            fn()
        except Exception as exc:  # pragma: no cover - percorso di esecuzione manuale
            failures += 1
            print(f"FAIL {name}: {exc}")
    print("OK: test_diagram_render" if not failures else f"{failures} test falliti")
    sys.exit(1 if failures else 0)
