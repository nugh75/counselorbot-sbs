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

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from backend.chat_logic import (
    ThinkStreamSplitter,
    _apply_thinking_directive,
    split_thinking,
)


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


def _run_all():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print(f"OK  {fn.__name__}")
    print(f"\n{len(fns)} test passati.")


if __name__ == "__main__":
    _run_all()
