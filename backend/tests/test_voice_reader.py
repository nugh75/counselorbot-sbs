"""Reader protocol checks; no database writes or provider calls."""
import asyncio
import base64
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.routes import voice_reader as reader


def test_canonical_segments():
    text = '# Titolo\n\nUna **parola** e [un link](https://example.org).\n\n' + 'Riflessione. ' * 160
    segments = reader.spoken_segments(text, 'it')
    assert len(segments) > 2
    assert all(len(s['text']) <= 700 for s in segments)
    assert '**' not in ''.join(s['text'] for s in segments)
    assert 'https://' not in ''.join(s['text'] for s in segments)
    assert [s['index'] for s in segments] == list(range(len(segments)))
    assert ''.join(s['text'] for s in segments).count('Riflessione.') == 160


def test_voice_precedence():
    db = SimpleNamespace(get=lambda *args: SimpleNamespace(voice_mapping={'it': 'it-IT-DiegoNeural'}))
    request = reader.ReaderRequest(text='Ciao', counselor_id=1)
    assert reader.reader_voice(request, db) == 'it-IT-DiegoNeural'
    request.voice_override = True
    assert reader.reader_voice(request, db) == 'it-IT-IsabellaNeural'
    request.engine, request.voice_override, request.voice = 'piper', False, 'it_IT-paola-medium'
    assert reader.reader_voice(request, db) == 'it_IT-paola-medium'


def test_pronunciation_rules_are_literal_bounded_and_do_not_cascade():
    rules = [reader.PronunciationRule(term='AI', spoken='A-I'),
             reader.PronunciationRule(term='GenAI', spoken='AI generativa'),
             reader.PronunciationRule(term='Piaget', spoken='Piascè'),
             reader.PronunciationRule(term='C++', spoken='C più più')]
    assert reader.correct_pronunciation('Ai e ai, AI GenAI piaget PIAGET C++: mai.', rules) == 'Ai e ai, A-I AI generativa Piascè Piascè C più più: mai.'
    assert reader.spoken_segments('**AI**', 'it', rules)[0]['text'] == 'A-I'


def test_accent_corrections_preserve_the_supplied_spelling():
    rules = [reader.PronunciationRule(term='domini', spoken='domìni'), reader.PronunciationRule(term='mediano', spoken='mèdiano')]
    assert reader.correct_pronunciation('Domini e mediano', rules) == 'domìni e mèdiano'


def test_word_boundary_conversion():
    class Communicate:
        def __init__(self, text, voice, **kwargs):
            assert kwargs['boundary'] == 'WordBoundary'
        async def stream(self):
            yield {'type': 'audio', 'data': b'mp3'}
            yield {'type': 'WordBoundary', 'text': 'Ciao', 'offset': 1000000, 'duration': 2000000}
    with patch.object(reader.edge_tts, 'Communicate', Communicate):
        result = asyncio.run(reader.synthesize({'index': 4, 'text': 'Ciao'}, 'it-IT-IsabellaNeural'))
    assert result['words'][0][0] == 'Ciao'
    assert abs(result['words'][0][1] - .1) < 1e-9
    assert abs(result['words'][0][2] - .3) < 1e-9
    assert base64.b64decode(result['audio']) == b'mp3'


def test_stream_errors_are_explicit_and_do_not_echo_text():
    async def collect():
        return [json.loads(event[6:]) async for event in reader.reader_events([{'index': 0, 'text': 'Ciao'}], 'voice')]
    with patch.object(reader, 'synthesize', AsyncMock(side_effect=ValueError('sensitive input'))):
        events = asyncio.run(collect())
    assert [e['type'] for e in events] == ['init', 'chunk_error', 'done']
    assert 'sensitive input' not in str(events)


def test_stream_starts_before_synthesis_and_cancel_does_not_generate_more():
    async def check():
        with patch.object(reader, 'synthesize', AsyncMock()) as synth:
            stream = reader.reader_events([{'index': 0, 'text': 'Ciao'}], 'voice')
            assert 'init' in await anext(stream)
            synth.assert_not_called()
            await stream.aclose()
            synth.assert_not_called()
    asyncio.run(check())


def test_api_validation_and_no_cache():
    app = FastAPI()
    app.include_router(reader.router)
    app.dependency_overrides[reader.database.get_db] = lambda: None
    with TestClient(app) as client:
        assert client.post('/tts/stream', json={'text': ''}).status_code == 422
        assert client.post('/tts/stream', json={'text': 'Ciao', 'voice': '../../secret'}).status_code == 422
        assert client.post('/tts/stream', json={'text': 'Ciao', 'engine': 'unknown'}).status_code == 422
        assert client.post('/tts/stream', json={'text': 'x' * 120001}).status_code == 422
        with patch.object(reader, 'synthesize', AsyncMock(return_value={'type': 'chunk', 'index': 0, 'audio': 'YQ==', 'words': []})):
            response = client.post('/tts/stream', json={'text': 'Ciao'})
        assert response.status_code == 200
        assert 'no-store' in response.headers['cache-control']
        assert '"type": "done"' in response.text


if __name__ == '__main__':
    for name, fn in list(globals().items()):
        if name.startswith('test_'):
            fn()
    print('OK: test_voice_reader (8 tests)')
