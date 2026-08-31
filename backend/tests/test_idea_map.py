"""Test della mappa dello strumento Idea: patch, cumulo, criterio di chiusura.

La persistenza e' provata dallo smoke sul DB; qui si prova la logica pura.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_idea_map
"""
import pytest

from backend.idea_map import (
    IdeaMapError,
    apply_patch,
    closure_ready,
    computed_flaws,
    current_focus,
    extract_patch,
    map_context,
    missing_roles,
    next_move,
    parse_patch,
    required_roles,
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
    # Il tetto e' salito con i rami (32 nodi), ma esiste: una mappa che non si
    # puo' tenere sott'occhio non e' una messa a fuoco.
    patch = parse_patch({
        "add_nodes": [{"id": f"n{i}", "label": f"Nodo {i}"} for i in range(31)],
        "add_edges": [{"from": "idea", "to": f"n{i}"} for i in range(31)],
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


# --- diagnosi wayfinder: difetti calcolati, albero, chiusura ---

def _tree():
    return apply_patch(None, parse_patch({
        "title": "Tesi sulla dispersione",
        "add_nodes": [
            {"id": "idea", "label": "Tesi sulla dispersione", "role": "idea",
             "accent": True, "task_type": "thesis-chapter", "status": "defined"},
            {"id": "t1", "label": "Vedere cosa esiste gia'", "role": "task",
             "task_type": "systematic-review"},
        ],
        "add_edges": [{"from": "idea", "to": "t1"}],
    }))


def test_a_claim_with_no_evidence_is_flagged_by_the_server():
    spec = _tree()
    assert computed_flaws(spec)["idea"] == "unsupported"


def test_the_flag_goes_away_when_the_evidence_arrives():
    spec = apply_patch(_tree(), parse_patch({
        "add_nodes": [{"id": "e1", "label": "Ho fatto il tutor", "role": "evidence"}],
        "add_edges": [{"from": "idea", "to": "e1"}],
    }))
    assert "idea" not in computed_flaws(spec)
    assert next(n for n in spec.nodes if n.id == "idea").flaw is None


def test_a_node_hanging_off_nothing_is_orphaned():
    spec = apply_patch(_tree(), parse_patch({
        "add_nodes": [{"id": "solo", "label": "Sciolto", "role": "constraint"}],
    }))
    assert computed_flaws(spec)["solo"] == "orphaned"


def test_a_node_linked_through_a_third_one_is_not_orphaned():
    spec = apply_patch(_tree(), parse_patch({
        "add_nodes": [{"id": "c1", "label": "Tre mesi", "role": "constraint"}],
        "add_edges": [{"from": "t1", "to": "c1"}],
    }))
    assert "c1" not in computed_flaws(spec)


def test_the_model_cannot_talk_the_server_out_of_a_computed_flaw():
    spec = apply_patch(_tree(), parse_patch({"update": [{"id": "idea", "flaw": "duplicate"}]}))
    assert next(n for n in spec.nodes if n.id == "idea").flaw == "unsupported"


def test_required_roles_follow_the_kind_of_work():
    assert required_roles("systematic-review") == ("idea", "open-question", "constraint")
    assert required_roles("study-path") == ("idea", "alternative", "decision")
    assert required_roles(None) == ("idea", "assumption", "open-question", "step")


def test_roles_are_counted_inside_the_branch_not_across_the_map():
    spec = apply_patch(_tree(), parse_patch({
        "add_nodes": [{"id": "q0", "label": "Domanda del padre", "role": "open-question"}],
        "add_edges": [{"from": "idea", "to": "q0"}],
    }))
    # La domanda sta nel ramo della radice: il sotto-task resta senza.
    assert "open-question" in missing_roles(spec, "t1")


def test_a_task_node_is_the_governing_claim_of_its_own_branch():
    assert "idea" not in missing_roles(_tree(), "t1")


def test_a_third_level_task_becomes_a_step():
    spec = apply_patch(_tree(), parse_patch({
        "add_nodes": [{"id": "t2", "label": "Sotto-lavoro", "role": "task",
                       "task_type": "empirical-study"}],
        "add_edges": [{"from": "t1", "to": "t2"}],
    }))
    spec = apply_patch(spec, parse_patch({
        "add_nodes": [{"id": "t3", "label": "Troppo giu'", "role": "task",
                       "task_type": "intervention"}],
        "add_edges": [{"from": "t2", "to": "t3"}],
    }))
    deepest = next(n for n in spec.nodes if n.id == "t3")
    assert deepest.role == "step" and deepest.task_type is None


def test_the_branch_in_hand_is_the_deepest_open_one():
    assert current_focus(_tree()) == "t1"


def test_a_closed_branch_hands_the_work_back_to_its_parent():
    spec = apply_patch(_tree(), parse_patch({
        "update": [{"id": "t1", "closed": True, "conclusion": "Criteri fissati"}],
    }))
    assert current_focus(spec) == "idea"


def test_a_closed_branch_can_be_reopened():
    spec = apply_patch(_tree(), parse_patch({"update": [{"id": "t1", "closed": True}]}))
    spec = apply_patch(spec, parse_patch({"update": [{"id": "t1", "closed": False}]}))
    assert current_focus(spec) == "t1"


def test_the_next_step_repairs_what_is_missing_not_what_comes_next():
    spec = apply_patch(_tree(), parse_patch({
        "update": [{"id": "t1", "closed": True, "conclusion": "Fatto"}],
    }))
    move = next_move(spec)
    assert move["reason"] == "flaw" and move["step_id"] == "idea-evidence"

    spec = apply_patch(spec, parse_patch({
        "add_nodes": [{"id": "e1", "label": "Ho fatto il tutor", "role": "evidence"}],
        "add_edges": [{"from": "idea", "to": "e1"}],
    }))
    move = next_move(spec)
    assert move["reason"] == "missing-role" and move["role"] == "alternative"


def test_a_branch_is_only_proposed_for_closing_never_closed():
    spec = apply_patch(_tree(), parse_patch({
        "add_nodes": [
            {"id": "q1", "label": "Quali studi entrano", "role": "open-question"},
            {"id": "c1", "label": "Solo italiano", "role": "constraint"},
        ],
        "add_edges": [{"from": "t1", "to": "q1"}, {"from": "t1", "to": "c1"}],
    }))
    assert closure_ready(spec, "t1")
    # Pronto non vuol dire chiuso: la chiusura resta un gesto della persona.
    assert next(n for n in spec.nodes if n.id == "t1").closed is False
    assert next_move(spec)["reason"] == "ready-to-close"


def test_an_unknown_kind_of_work_is_asked_before_anything_else():
    spec = apply_patch(None, parse_patch({
        "title": "Qualcosa",
        "add_nodes": [
            {"id": "idea", "label": "Un'idea", "role": "idea", "accent": True},
            {"id": "x", "label": "Un pezzo", "role": "evidence"},
        ],
        "add_edges": [{"from": "idea", "to": "x"}],
    }))
    assert next_move(spec)["reason"] == "task-unknown"


def test_the_context_tells_the_model_what_the_turn_is_for():
    text = map_context(_tree())
    assert "WHAT THIS TURN IS FOR" in text
    assert "systematic-review" in text


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
