"""Test — confinamento del «sto pensando» (direttiva + split tag).

Verifica che:
- `_apply_thinking_directive` aggiunga la direttiva [THINKING] con i tag <think>;
- `split_thinking` estragga i blocchi <think>…</think> ripulendo il visibile,
  gestendo anche un blocco aperto e non chiuso (output troncato);
- `ThinkStreamSplitter` separi reasoning/contenuto anche con i tag SPEZZATI tra
  chunk (streaming carattere per carattere).

Test PURO: nessuna rete, nessun DB. Come gli altri test del modulo, va eseguito
nello stesso ambiente dell'app perche' importa `backend.chat_logic`.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_thinking_directive_split
Con pytest:
    pytest backend/tests/test_thinking_directive_split.py
"""
import os
import json
from unittest.mock import MagicMock, patch

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from backend.chat_logic import (
    ThinkStreamSplitter,
    _apply_thinking_directive,
    split_thinking,
)
from backend.ai_service import AIService


def _reconstruct(items):
    content = "".join(i["text"] for i in items if i["type"] == "content")
    reasoning = "".join(i["text"] for i in items if i["type"] == "reasoning")
    return content, reasoning


def test_directive_appends_think_block():
    out = _apply_thinking_directive("BASE", "it")
    assert out.startswith("BASE")
    assert "[THINKING]" in out
    assert "<think>" in out and "</think>" in out
    assert "Attivazione interna" in out  # vietata esplicitamente nel visibile


def test_split_block_basic():
    reasoning, visible = split_thinking("<think>piano interno</think>Ecco l'analisi.")
    assert reasoning == "piano interno"
    assert visible == "Ecco l'analisi."


def test_split_no_tags_passthrough():
    reasoning, visible = split_thinking("Solo risposta visibile, niente tag.")
    assert reasoning is None
    assert visible == "Solo risposta visibile, niente tag."


def test_split_unterminated_block():
    # <think> aperto e mai chiuso (output troncato): tutto cio' che segue e' reasoning.
    reasoning, visible = split_thinking("Intro.\n<think>ragionamento troncato")
    assert reasoning == "ragionamento troncato"
    assert visible == "Intro."


def test_split_multiple_and_variant_tags():
    text = "<think>a</think>X<thinking>b</thinking>Y"
    reasoning, visible = split_thinking(text)
    assert reasoning == "a\n\nb"
    assert visible == "XY"


def test_stream_full_string():
    sp = ThinkStreamSplitter()
    items = sp.feed("AB<think>RT</think>CD") + sp.flush()
    content, reasoning = _reconstruct(items)
    assert content == "ABCD"
    assert reasoning == "RT"


def test_stream_char_by_char_split_tags():
    sp = ThinkStreamSplitter()
    items = []
    for ch in "AB<think>RT</think>CD":
        items.extend(sp.feed(ch))
    items.extend(sp.flush())
    content, reasoning = _reconstruct(items)
    assert content == "ABCD"
    assert reasoning == "RT"


def test_stream_partial_tag_not_a_tag_is_flushed():
    # "<thi" sembra l'inizio di <think> ma il flusso finisce: deve tornare contenuto.
    sp = ThinkStreamSplitter()
    items = sp.feed("X<thi") + sp.flush()
    content, reasoning = _reconstruct(items)
    assert content == "X<thi"
    assert reasoning == ""


IRIDE_PREAMBLE = "Devo scrivere un breve benvenuto in italiano, informale, 3-4 frasi."
IRIDE_ANSWER = "Ciao! Benvenuto nella tua esplorazione del QSA."
IRIDE_CONTENT = f"**Ragione**\\\n{IRIDE_PREAMBLE}\n**Risposta**\\\n{IRIDE_ANSWER}"


def test_iride_markdown_reasoning_is_separated():
    reasoning, visible = split_thinking(IRIDE_CONTENT)
    assert reasoning == IRIDE_PREAMBLE
    assert visible == IRIDE_ANSWER


def test_iride_stream_every_chunk_boundary():
    for boundary in range(len(IRIDE_CONTENT) + 1):
        sp = ThinkStreamSplitter()
        items = sp.feed(IRIDE_CONTENT[:boundary]) + sp.feed(IRIDE_CONTENT[boundary:]) + sp.flush()
        visible, reasoning = _reconstruct(items)
        assert visible.strip() == IRIDE_ANSWER, boundary
        assert reasoning == IRIDE_PREAMBLE, boundary


def test_iride_stream_does_not_flash_reasoning():
    sp = ThinkStreamSplitter()
    items = []
    preamble, answer = IRIDE_CONTENT.split("**Risposta**")
    for ch in preamble:
        emitted = sp.feed(ch)
        assert not any(i["type"] == "content" and i["text"].strip() for i in emitted)
        items.extend(emitted)
    for ch in "**Risposta**" + answer:
        items.extend(sp.feed(ch))
    items.extend(sp.flush())
    visible, reasoning = _reconstruct(items)
    assert visible.strip() == IRIDE_ANSWER
    assert reasoning == IRIDE_PREAMBLE


def test_tagged_then_markdown_reasoning():
    text = "<think>Native-style reasoning.</think>\n" + IRIDE_CONTENT
    reasoning, visible = split_thinking(text)
    assert reasoning == "Native-style reasoning.\n\n" + IRIDE_PREAMBLE
    assert visible == IRIDE_ANSWER
    sp = ThinkStreamSplitter()
    items = []
    for ch in text:
        items.extend(sp.feed(ch))
    visible, reasoning = _reconstruct(items + sp.flush())
    assert visible.strip() == IRIDE_ANSWER
    assert IRIDE_PREAMBLE in reasoning


def test_ordinary_reasoning_words_and_unpaired_headings_are_preserved():
    for text in (
        "La ragione per cui studi conta.\n**Risposta**\nParliamone.",
        "Ecco un esempio:\n**Ragione**\nVoglio capire.\n**Risposta**\nStudio.",
        "**Ragione**\nUna motivazione importante.",
        "**Risposta**\nCiao!",
        "```json\n{\"reasoning\": \"esempio\"}\n```",
    ):
        assert split_thinking(text) == (None, text)
        sp = ThinkStreamSplitter()
        items = []
        for ch in text:
            items.extend(sp.feed(ch))
        assert _reconstruct(items + sp.flush()) == (text, "")


def test_english_heading_and_answer_without_newline():
    text = "**Reasoning**\nPlan.\n**Answer** Hello!"
    assert split_thinking(text) == ("Plan.", "Hello!")
    sp = ThinkStreamSplitter()
    assert _reconstruct(sp.feed(text) + sp.flush()) == ("Hello!", "Plan.")


def test_ollama_keeps_native_and_markdown_reasoning_separate_from_answer():
    with patch.object(AIService, "_load_config", return_value={}):
        service = AIService(None)
    response = MagicMock()
    response.json.return_value = {"message": {"thinking": "Native reasoning.", "content": IRIDE_CONTENT}}
    system = _apply_thinking_directive("System", "it")
    with patch("backend.ai_service.httpx.post", return_value=response) as post:
        assert service._call_ollama("Welcome", system, "nemotron-cascade-2:latest") == IRIDE_ANSWER
    assert "native thinking channel" in post.call_args.kwargs['json']['messages'][0]['content']
    assert "<think>" not in post.call_args.kwargs['json']['messages'][0]['content']
    assert service.last_thinking == "Native reasoning.\n\n" + IRIDE_PREAMBLE

    response.iter_lines.return_value = iter(
        [json.dumps({"message": {"thinking": "Native reasoning."}})]
        + [json.dumps({"message": {"content": ch}}) for ch in IRIDE_CONTENT]
    )
    client = MagicMock()
    client.stream.return_value.__enter__.return_value = response
    with patch("backend.ai_service.httpx.Client") as client_cls:
        client_cls.return_value.__enter__.return_value = client
        visible, reasoning = _reconstruct(list(service._stream_ollama("Welcome", system, "nemotron-cascade-2:latest")))
    assert "native thinking channel" in client.stream.call_args.kwargs['json']['messages'][0]['content']
    assert visible.strip() == IRIDE_ANSWER
    assert reasoning == "Native reasoning." + IRIDE_PREAMBLE
    assert service.last_thinking == reasoning


def test_native_thinking_directive_preserves_other_instructions_and_no_think():
    with patch.object(AIService, "_load_config", return_value={}):
        service = AIService(None)
    for separator in ("\n\n", "\n"):
        system = _apply_thinking_directive("BASE", "it") + separator + "[REGISTER] Keep informal."
        result = service._apply_ollama_thinking_directive(system)
        assert result.startswith("BASE\n\n[THINKING]")
        assert result.endswith(separator + "[REGISTER] Keep informal.")
        assert "<think>" not in result
    service.disable_thinking = True
    result = service._apply_ollama_thinking_directive(system)
    assert result.endswith("/no_think")
    assert service._apply_ollama_thinking_directive("JSON only") == "JSON only\n\n/no_think"


def _run_all():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print(f"OK  {fn.__name__}")
    print(f"\n{len(fns)} test passati.")


if __name__ == "__main__":
    _run_all()
