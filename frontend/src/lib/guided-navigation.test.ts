import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node direct TypeScript runner requires extension.
import { canSelectPhase, emptyNavigation, explorationPayload } from './guided-navigation.ts';
// @ts-expect-error -- Node direct TypeScript runner requires extension.
import { navigationCopy } from './guided-navigation-copy.ts';

test('all future and visited phases are selectable only after the agreement', () => {
    const phases = ['intro', 'agreement', 'first', 'last'];
    assert.equal(canSelectPhase(phases, 'last', 'agreement', false), false);
    assert.equal(canSelectPhase(phases, 'agreement', 'agreement', false), true);
    assert.equal(canSelectPhase(phases, 'last', 'agreement', true), true);
    assert.equal(canSelectPhase(phases, 'first', undefined, false), true);
    assert.equal(canSelectPhase(phases, 'invented', undefined, true), false);
    assert.deepEqual(emptyNavigation().completed, []);
});

test('branch API payload excludes local drafts and reading checkpoints', () => {
    assert.deepEqual(explorationPayload({ id: 'a', title: 'Tema', origin_phase: 'p', checkpoint: 'private' } as never), { id: 'a', title: 'Tema', origin_phase: 'p' });
    assert.equal(explorationPayload(), undefined);
});

test('navigation and branch commands are available in every supported language', () => {
    for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
        assert.ok(Object.values(navigationCopy(lang)).every(text => text.trim()));
        assert.equal(Object.keys(navigationCopy(lang)).length, Object.keys(navigationCopy('it')).length);
    }
});

// @ts-expect-error -- Node direct TypeScript runner requires extension.
import { streamChat, IncompleteChatStreamError } from './chat-stream.ts';

test('only a completed stream returns branch transition metadata', async t => {
    const exploration = { id: 'a', title: 'Tema', origin_phase: 'p', action: 'open' };
    let incomplete = true;
    t.mock.method(globalThis, 'fetch', async () => new Response(`data: ${JSON.stringify({ done: true, incomplete, response: 'Un esempio. [[APRI_APPROFONDIMENTO]]', exploration })}\n\n`));
    await assert.rejects(streamChat({}, () => {}), error => {
        assert.ok(error instanceof IncompleteChatStreamError);
        assert.equal(error.partial.exploration, undefined);
        assert.equal(error.partial.response, 'Un esempio.');
        return true;
    });
    incomplete = false;
    const result = await streamChat({}, () => {});
    assert.deepEqual(result.exploration, exploration);
    assert.equal(result.response, 'Un esempio.');
});
