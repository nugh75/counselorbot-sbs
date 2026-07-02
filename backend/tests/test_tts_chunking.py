"""Test per _split_text_for_tts: chunking dinamico del testo TTS.

Il testo lungo viene diviso in blocchi <= TTS_CHUNK_MAX_CHARS preferendo il
punto come delimitatore, senza perdere contenuto (niente più troncamento a
5000 caratteri).

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_tts_chunking
"""
from backend.routes.chat import TTS_CHUNK_MAX_CHARS, _split_text_for_tts


def test_short_text_single_chunk():
    assert _split_text_for_tts("Ciao. Come stai?") == ["Ciao. Come stai?"]


def test_long_text_splits_on_sentence_boundary():
    long_text = "Questa è una frase di prova che parla di autoregolazione. " * 200
    chunks = _split_text_for_tts(long_text)
    assert len(chunks) > 1
    assert all(len(c) <= TTS_CHUNK_MAX_CHARS for c in chunks)
    # tutti i chunk tranne l'ultimo finiscono con un punto
    assert all(c.endswith(".") for c in chunks[:-1])
    # nessun contenuto perso (gli spazi ai bordi dei chunk vengono strippati)
    assert "".join(chunks).replace(" ", "") == long_text.replace(" ", "")


def test_text_without_periods_or_spaces():
    blob = "x" * 7000
    chunks = _split_text_for_tts(blob)
    assert sum(len(c) for c in chunks) == 7000
    assert all(len(c) <= TTS_CHUNK_MAX_CHARS for c in chunks)


if __name__ == "__main__":
    test_short_text_single_chunk()
    test_long_text_splits_on_sentence_boundary()
    test_text_without_periods_or_spaces()
    print("OK: test_tts_chunking")
