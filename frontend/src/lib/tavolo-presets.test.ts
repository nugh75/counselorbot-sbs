// Il client dei generi: quello che si prova qui e' il contratto, non il disegno.
import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { PRESET_IDS, composeBody, type TavoloPresetId } from './tavolo.ts';

test('the five genre ids are the ones the server knows', () => {
    assert.deepEqual(PRESET_IDS, ['workflow', 'causal', 'concept', 'argument', 'algorithm']);
});

test('a composition carries the genre, the prompt and the revision it was thought on', () => {
    const body = composeBody({ preset: 'causal', prompt: '  i fattori del QSA  ', lang: 'it', index: 7 });
    assert.deepEqual(body, { preset: 'causal', prompt: 'i fattori del QSA', lang: 'it', base_index: 7 });
});

test('let the model choose the genre and no genre travels', () => {
    const body = composeBody({ preset: null, prompt: 'un flusso', lang: 'en', index: 0, counselorId: 12 });
    assert.ok(body);
    assert.equal(body.preset, null);
    assert.equal(body.counselor_id, 12);
});

test('an empty prompt never becomes a request', () => {
    assert.equal(composeBody({ preset: null, prompt: '   ', lang: 'it', index: 0 }), null);
});

test('a genre outside the five is refused before the network', () => {
    assert.equal(composeBody({ preset: 'mind-map' as TavoloPresetId, prompt: 'x', lang: 'it', index: 0 }), null);
});
