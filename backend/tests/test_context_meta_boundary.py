from backend.model_context import fit_context


def test_compact_keeps_contracts_following_optional_meta():
    system = "Instructions\n[META SYSTEM PROMPT]\noptional\n[PERSPECTIVE] keep this contract\n[TURN CONTRACT]\nkeep too"
    fitted, _, _, report = fit_context(system, "message", [], {"compact": True}, 100)
    assert "optional" not in fitted
    assert "[PERSPECTIVE] keep this contract" in fitted
    assert "[TURN CONTRACT]\nkeep too" in fitted
    assert "optional_theory" in report["removed"]
