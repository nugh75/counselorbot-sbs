"""Test dell'estrazione dei blocchi ```diagram dal testo di un messaggio.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_diagram_blocks
"""
from backend.diagram_blocks import extract, strip_for_speech

BLOCK = (
    "```diagram\n"
    '{"type":"cycle","title":"Circolo","nodes":['
    '{"id":"a","label":"Compito"},{"id":"b","label":"Ansia"}],'
    '"edges":[{"from":"a","to":"b","label":"innesca"}]}\n'
    "```"
)


def test_text_without_blocks_is_untouched():
    text = "Nessun diagramma qui.\n\n```python\nprint('ciao')\n```"
    cleaned, specs = extract(text)
    assert cleaned == text
    assert specs == []


def test_block_is_removed_and_parsed():
    cleaned, specs = extract(f"Prima.\n\n{BLOCK}\n\nDopo.")
    assert "```" not in cleaned
    assert cleaned.startswith("Prima.")
    assert cleaned.rstrip().endswith("Dopo.")
    assert len(specs) == 1
    assert specs[0].title == "Circolo"


def test_multiple_blocks_are_all_parsed():
    _, specs = extract(f"{BLOCK}\ntesto\n{BLOCK}")
    assert len(specs) == 2


def test_invalid_block_is_dropped_without_raising():
    broken = "```diagram\n{\"type\":\"cycle\"}\n```"
    cleaned, specs = extract(f"Testo.\n{broken}")
    assert specs == []
    assert "```" not in cleaned
    assert "Testo." in cleaned


def test_unclosed_block_is_left_alone():
    partial = '```diagram\n{"type":"cycle","title":"Cir'
    cleaned, specs = extract(f"Testo.\n{partial}")
    assert specs == []
    assert cleaned.endswith(partial)


def test_strip_for_speech_removes_diagram_entirely():
    spoken = strip_for_speech(f"Guarda.\n{BLOCK}", lang="it")
    assert "```" not in spoken
    assert "{" not in spoken
    assert spoken == "Guarda."
    assert "Circolo" not in spoken
    assert "innesca" not in spoken


if __name__ == "__main__":
    import sys

    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
            except Exception as exc:  # pragma: no cover
                failures += 1
                print(f"FAIL {name}: {exc}")
    print("OK: test_diagram_blocks" if not failures else f"{failures} test falliti")
    sys.exit(1 if failures else 0)
