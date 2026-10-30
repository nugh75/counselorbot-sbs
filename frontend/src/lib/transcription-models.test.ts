import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { modelForEngine, transcriptionAvailable, validTranscriptionModel } from './transcription-models.ts';
// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { VOICE_DICTS } from './i18n-voice.ts';

test('online selection requires explicit key presence; local selection works offline', () => {
    for (const engine of ['openrouter', 'mistral']) {
        assert.equal(transcriptionAvailable(engine), false);
        assert.equal(transcriptionAvailable(engine, { [engine]: { configured: false } }), false);
        assert.equal(transcriptionAvailable(engine, { [engine]: { configured: true } }), true);
    }
    for (const engine of ['faster-whisper', 'whisper.cpp']) assert.equal(transcriptionAvailable(engine), true);
});

test('engine changes choose that engine default and preserve shared local models', () => {
    const defaults = { openrouter: 'mistralai/voxtral-mini-transcribe', mistral: 'voxtral-mini-latest', 'whisper.cpp': 'small' };
    const models = [{ id: 'small', engine: 'whisper.cpp', loaded: false, bytes: null }];
    assert.equal(modelForEngine('openrouter', 'small', models, defaults), defaults.openrouter);
    assert.equal(modelForEngine('mistral', defaults.openrouter, models, defaults), defaults.mistral);
    assert.equal(modelForEngine('whisper.cpp', 'small', models, defaults), 'small');
    assert.equal(modelForEngine('whisper.cpp', 'openai/whisper-1', models, defaults), 'small');
});

test('free model IDs allow provider namespaces but reject empty, long and malformed values', () => {
    for (const value of ['openai/whisper-1', 'voxtral-mini-latest', ' future/transcriber ']) {
        assert.equal(validTranscriptionModel(value), true);
    }
    for (const value of ['', ' ', 'bad model', 'bad\tmodel', 'bad\u0000model', 'bad\u007fmodel', 'a'.repeat(201)]) {
        assert.equal(validTranscriptionModel(value), false);
    }
});

test('all six languages disclose external audio, default off, missing key and free model ID', () => {
    assert.equal(Object.keys(VOICE_DICTS).length, 6);
    for (const dict of Object.values(VOICE_DICTS)) {
        for (const key of ['engine.openrouter', 'engine.mistral', 'externalWarning', 'keyMissing', 'modelId', 'onlineModelHint']) {
            assert.ok(dict[`admin.audio.${key}`]?.length, key);
        }
        assert.match(dict['admin.audio.externalWarning'], /OpenRouter/);
        assert.match(dict['admin.audio.externalWarning'], /Mistral/);
        assert.match(dict['admin.audio.engine.mistral'], /UE|EU/);
        assert.match(dict['admin.audio.keyMissing'], /\{provider\}/);
    }
});
