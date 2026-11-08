"""Source references are computed from shipped literals, without database or model."""
from pathlib import Path

from backend.prompt_source_locations import _collect, _locate, code_locations, sentence_with_locations

NO_REASONING = "Do not write internal working notes addressed to yourself, such as a plan, a checklist or phrases that"
ORIENTATION = "In EVERY visible reply, weave in one short, natural orientation sentence: what we are exploring now, why it matters to this step, and what comes next."


def test_real_screenshot_quotes_point_to_python_constant_and_versioned_markdown():
    first = code_locations(NO_REASONING)
    assert first["status"] == "matched"
    location = first["matches"][0]
    assert location["file"] == "backend/chat_logic.py"
    assert location["symbol"] == "DEFAULT_NO_REASONING_DIRECTIVE"
    source = Path(location["file"]).read_text().splitlines()
    assert '"[NO REASONING] Do not produce a private reasoning block' in source[location["line"] - 1]
    assert any(reader["symbol"] == "_apply_global_directives" for reader in location["readers"])

    second = code_locations(ORIENTATION)
    assert second["status"] == "matched"
    location = second["matches"][0]
    assert location["file"] == "backend/prompts/guided_choice_directive.md"
    assert location["line"] == 2
    assert location["symbol"] == "GUIDED_CHOICE_DIRECTIVE"
    assert location["definition"]["file"] == "backend/prompt_config.py"
    assert any(reader["file"] == "backend/prompt_contract.py" and reader["symbol"] == "turn_contract" for reader in location["readers"])


def test_unknown_and_editable_sentences_are_not_given_an_invented_code_source():
    assert code_locations("A synthetic instruction that is absent from every shipped source.") == {"status": "unknown", "matches": [], "more": 0}
    editable = {"prompt": "guided_step:fixture", "text": NO_REASONING}
    assert sentence_with_locations(editable) is editable
    coded = {"prompt": "code:request", "text": NO_REASONING}
    assert sentence_with_locations(coded)["code_location"]["status"] == "matched"
    assert "code_location" not in coded


def test_ambiguous_literals_are_all_reported_and_reader_scope_is_respected(tmp_path):
    (tmp_path / "one.py").write_text('RULE = "Use one clear instruction for every answer."\ndef consume():\n    return RULE\ndef shadowed():\n    RULE = "Another unrelated local value."\n    return RULE\n')
    (tmp_path / "two.py").write_text('def other():\n    return "Use one clear instruction for every answer."\n')
    result = _locate("Use one clear instruction for every answer.", *_collect(tmp_path))
    assert result["status"] == "ambiguous"
    assert {match["file"] for match in result["matches"]} == {"backend/one.py", "backend/two.py"}
    first = next(match for match in result["matches"] if match["file"] == "backend/one.py")
    assert [reader["symbol"] for reader in first["readers"]] == ["consume"]
    assert all(not Path(match["file"]).is_absolute() for match in result["matches"])
