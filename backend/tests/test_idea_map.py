"""Test della mappa dello strumento Idea: patch, cumulo, criterio di chiusura.

La persistenza e' provata dallo smoke sul DB; qui si prova la logica pura.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_idea_map
"""
import pytest

from backend.idea_map import (
    IdeaMapError,
    apply_patch,
    extract_patch,
    missing_roles,
    parse_patch,
)

FIRST = {
    "type": "idea-patch",
    "title": "Fare la tesi sulla dispersione",
    "add_nodes": [
        {"id": "idea", "label": "Tesi sulla dispersione", "role": "idea", "accent": True},
        {"id": "a1", "label": "I dati siano accessibili", "role": "assumption"},
    ],
    "add_edges": [{"from": "idea", "to": "a1", "kind": "link"}],
}


def _base():
    return apply_patch(None, parse_patch(FIRST))


def test_first_patch_builds_the_map():
    spec = _base()
    assert spec.type == "mindmap"
    assert spec.title == "Fare la tesi sulla dispersione"
    assert [node.id for node in spec.nodes] == ["idea", "a1"]


def test_a_patch_that_cannot_stand_alone_is_refused():
    with pytest.raises(IdeaMapError):
        apply_patch(None, parse_patch({"add_nodes": [{"id": "a", "label": "Solo io"}]}))


def test_the_map_grows_instead_of_being_rewritten():
    spec = apply_patch(_base(), parse_patch({
        "add_nodes": [{"id": "q1", "label": "Quale scuola?", "role": "open-question"}],
        "add_edges": [{"from": "idea", "to": "q1"}],
    }))
    assert [node.id for node in spec.nodes] == ["idea", "a1", "q1"]
    assert len(spec.edges) == 2


def test_readding_a_node_updates_it():
    spec = apply_patch(_base(), parse_patch({
        "add_nodes": [{"id": "a1", "label": "I dati sono pubblici", "role": "evidence"}],
    }))
    node = next(n for n in spec.nodes if n.id == "a1")
    assert node.label == "I dati sono pubblici"
    assert node.role == "evidence" and node.icon == "check"


def test_update_touches_only_what_it_names():
    spec = apply_patch(_base(), parse_patch({"update": [{"id": "a1", "role": "constraint"}]}))
    node = next(n for n in spec.nodes if n.id == "a1")
    assert node.label == "I dati siano accessibili"
    assert node.role == "constraint" and node.icon == "shield"


def test_update_of_an_unknown_node_is_ignored():
    spec = apply_patch(_base(), parse_patch({"update": [{"id": "ghost", "label": "X"}]}))
    assert len(spec.nodes) == 2


def test_remove_takes_the_edges_with_it():
    spec = apply_patch(_base(), parse_patch({
        "add_nodes": [{"id": "q1", "label": "Quale scuola?", "role": "open-question"}],
        "add_edges": [{"from": "idea", "to": "q1"}],
    }))
    spec = apply_patch(spec, parse_patch({"remove": ["q1"]}))
    assert [node.id for node in spec.nodes] == ["idea", "a1"]
    assert len(spec.edges) == 1


def test_an_edge_to_a_missing_node_is_dropped_not_the_map():
    spec = apply_patch(_base(), parse_patch({"add_edges": [{"from": "idea", "to": "ghost"}]}))
    assert len(spec.edges) == 1


def test_the_same_edge_is_not_added_twice():
    spec = apply_patch(_base(), parse_patch({"add_edges": [{"from": "idea", "to": "a1"}]}))
    assert len(spec.edges) == 1


def test_only_one_node_keeps_the_accent():
    spec = apply_patch(_base(), parse_patch({
        "add_nodes": [{"id": "s1", "label": "Scrivere l'indice", "role": "step", "accent": True}],
        "add_edges": [{"from": "idea", "to": "s1"}],
    }))
    assert [node.id for node in spec.nodes if node.accent] == ["s1"]


def test_the_map_has_a_ceiling():
    patch = parse_patch({
        "add_nodes": [{"id": f"n{i}", "label": f"Nodo {i}"} for i in range(24)],
        "add_edges": [{"from": "idea", "to": f"n{i}"} for i in range(24)],
    })
    with pytest.raises(IdeaMapError):
        apply_patch(_base(), patch)


def test_focus_is_reached_when_the_four_roles_are_there():
    assert missing_roles(None) == ["idea", "assumption", "open-question", "step"]
    spec = _base()
    assert missing_roles(spec) == ["open-question", "step"]
    spec = apply_patch(spec, parse_patch({
        "add_nodes": [
            {"id": "q1", "label": "Quale scuola?", "role": "open-question"},
            {"id": "s1", "label": "Scrivere l'indice", "role": "step"},
        ],
        "add_edges": [{"from": "idea", "to": "q1"}, {"from": "idea", "to": "s1"}],
    }))
    assert missing_roles(spec) == []


def test_extract_takes_the_block_out_of_the_message():
    text = 'Ecco cosa ho capito.\n\n```idea\n{"add_nodes":[{"id":"x","label":"X"}]}\n```\n\nTi torna?'
    clean, patch = extract_patch(text)
    assert "```" not in clean and "Ti torna?" in clean
    assert patch is not None and patch.add_nodes[0].id == "x"


def test_a_broken_block_leaves_the_message_readable():
    clean, patch = extract_patch("Prima.\n```idea\n{non json\n```\nDopo.")
    assert patch is None
    assert "Prima." in clean and "Dopo." in clean and "non json" not in clean


def test_a_message_without_a_block_is_untouched():
    clean, patch = extract_patch("Solo parole.")
    assert clean == "Solo parole." and patch is None


def test_an_empty_patch_counts_as_no_patch():
    clean, patch = extract_patch("Testo.\n```idea\n{}\n```")
    assert patch is None and clean == "Testo."


if __name__ == "__main__":
    import sys

    failures = 0
    for name, fn in sorted(globals().items()):
        if not name.startswith("test_") or not callable(fn):
            continue
        try:
            fn()
        except Exception as exc:  # pragma: no cover - percorso di esecuzione manuale
            failures += 1
            print(f"FAIL {name}: {exc}")
    print("OK: test_idea_map" if not failures else f"{failures} test falliti")
    sys.exit(1 if failures else 0)
